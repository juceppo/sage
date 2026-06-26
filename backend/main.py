from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
import sqlite3
import uuid

from services.pdf_service import extract_text_from_pdf, chunk_text
from services.ai_service import get_embedding, save_chunks, delete_chunks, similarity_search, ask, DB_PATH

app = FastAPI(title="Sage API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _doc_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id         TEXT PRIMARY KEY,
            name       TEXT NOT NULL,
            chunks     INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        )
    """)
    conn.commit()
    return conn


class ChatRequest(BaseModel):
    document_id: str
    question: str


@app.get("/")
def root():
    return {"status": "ok", "service": "Sage"}


@app.get("/api/documents")
def list_documents():
    conn = _doc_db()
    rows = conn.execute(
        "SELECT id, name, chunks, created_at FROM documents ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    return [{"id": r[0], "name": r[1], "chunks": r[2], "created_at": r[3]} for r in rows]


@app.post("/api/documents/upload")
async def upload_document(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Solo se aceptan archivos PDF")

    raw = await file.read()
    text = extract_text_from_pdf(raw)

    if not text.strip():
        raise HTTPException(400, "No se pudo extraer texto del PDF")

    chunks = chunk_text(text)
    if not chunks:
        raise HTTPException(400, "El documento no tiene contenido procesable")

    doc_id = str(uuid.uuid4())
    now = datetime.now().isoformat()

    # Embed all chunks
    embeddings = [get_embedding(c) for c in chunks]
    save_chunks(doc_id, chunks, embeddings)

    # Save document metadata
    conn = _doc_db()
    conn.execute(
        "INSERT INTO documents (id, name, chunks, created_at) VALUES (?,?,?,?)",
        (doc_id, file.filename, len(chunks), now),
    )
    conn.commit()
    conn.close()

    return {"id": doc_id, "name": file.filename, "chunks": len(chunks), "created_at": now}


@app.delete("/api/documents/{doc_id}")
def delete_document(doc_id: str):
    conn = _doc_db()
    row = conn.execute("SELECT id FROM documents WHERE id = ?", (doc_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Documento no encontrado")

    delete_chunks(doc_id)
    conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


@app.post("/api/chat")
def chat(req: ChatRequest):
    if not req.question.strip():
        raise HTTPException(400, "La pregunta no puede estar vacía")

    # Verify document exists
    conn = _doc_db()
    row = conn.execute("SELECT id FROM documents WHERE id = ?", (req.document_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Documento no encontrado")

    q_embedding = get_embedding(req.question)
    relevant = similarity_search(req.document_id, q_embedding, top_k=5)

    if not relevant:
        raise HTTPException(400, "No se encontraron fragmentos relevantes")

    answer = ask(req.question, relevant)
    return {"answer": answer, "sources": relevant[:2]}
