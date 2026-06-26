# Sage

Chatbot que lee tus documentos PDF y responde preguntas sobre su contenido en lenguaje natural.

Subes un PDF, le haces una pregunta y la IA encuentra los fragmentos más relevantes dentro del documento para darte una respuesta precisa. No inventa — solo responde con lo que está en el texto.

## Cómo funciona

El proceso completo, sin librerías mágicas:

1. **Carga del PDF** — PyMuPDF extrae el texto del documento
2. **Chunking** — el texto se divide en fragmentos de ~400 palabras con solapamiento
3. **Embeddings** — cada fragmento se convierte en un vector numérico con `text-embedding-3-small` de OpenAI
4. **Almacenamiento** — los vectores se guardan en SQLite junto con el texto original
5. **Búsqueda semántica** — al hacer una pregunta, se calcula la similitud coseno entre la pregunta embebida y todos los fragmentos del documento
6. **Respuesta** — los 5 fragmentos más relevantes se envían como contexto a GPT-4o-mini, que genera la respuesta

## Stack

**Backend**
- Python + FastAPI
- OpenAI API (`text-embedding-3-small` + `gpt-4o-mini`)
- SQLite para persistencia de vectores y metadata
- PyMuPDF para extracción de texto
- NumPy para similitud coseno

**Frontend**
- React + Vite
- CSS puro, sin librerías de UI

## Correr localmente

### Backend

```bash
cd backend
pip install -r requirements.txt
```

Crea un archivo `.env` en `backend/`:

```
OPENAI_API_KEY=tu_api_key_aqui
```

```bash
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

La app queda en `http://localhost:5173`.

## API

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/documents` | Lista todos los documentos |
| `POST` | `/api/documents/upload` | Sube y procesa un PDF |
| `DELETE` | `/api/documents/{id}` | Elimina un documento |
| `POST` | `/api/chat` | Hace una pregunta sobre un documento |

## Autor

Juan Pablo Ceballos — [GitHub](https://github.com/juceppo)
