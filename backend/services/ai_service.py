import os
import json
import sqlite3
import numpy as np
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

DB_PATH = "./sage.db"


def _db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS chunks (
            id          TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            content     TEXT NOT NULL,
            embedding   TEXT NOT NULL
        )
    """)
    conn.commit()
    return conn


def get_embedding(text: str) -> list[float]:
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=text,
    )
    return response.data[0].embedding


def save_chunks(doc_id: str, chunks: list[str], embeddings: list[list[float]]):
    conn = _db()
    rows = [
        (f"{doc_id}_{i}", doc_id, chunk, json.dumps(emb))
        for i, (chunk, emb) in enumerate(zip(chunks, embeddings))
    ]
    conn.executemany(
        "INSERT OR REPLACE INTO chunks (id, document_id, content, embedding) VALUES (?,?,?,?)",
        rows,
    )
    conn.commit()
    conn.close()


def delete_chunks(doc_id: str):
    conn = _db()
    conn.execute("DELETE FROM chunks WHERE document_id = ?", (doc_id,))
    conn.commit()
    conn.close()


def similarity_search(doc_id: str, query_embedding: list[float], top_k: int = 5) -> list[str]:
    conn = _db()
    rows = conn.execute(
        "SELECT content, embedding FROM chunks WHERE document_id = ?", (doc_id,)
    ).fetchall()
    conn.close()

    if not rows:
        return []

    q = np.array(query_embedding)
    scores = []
    for content, emb_json in rows:
        emb = np.array(json.loads(emb_json))
        # Cosine similarity
        score = float(np.dot(q, emb) / (np.linalg.norm(q) * np.linalg.norm(emb) + 1e-9))
        scores.append((score, content))

    scores.sort(reverse=True)
    return [content for _, content in scores[:top_k]]


def ask(question: str, context_chunks: list[str]) -> str:
    context = "\n\n---\n\n".join(context_chunks)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "Eres un asistente que responde preguntas basándote ÚNICAMENTE "
                    "en el contexto extraído del documento proporcionado. "
                    "Si la información no está en el contexto, dilo claramente. "
                    "Responde en el mismo idioma de la pregunta. Sé preciso y conciso."
                ),
            },
            {
                "role": "user",
                "content": f"Contexto del documento:\n{context}\n\nPregunta: {question}",
            },
        ],
        temperature=0.1,
        max_tokens=1000,
    )
    return response.choices[0].message.content
