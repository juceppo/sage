import { useState, useRef, useEffect } from 'react';
import './index.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function App() {
  const [documents, setDocuments]   = useState([]);
  const [activeDoc, setActiveDoc]   = useState(null);
  const [messages, setMessages]     = useState([]);
  const [question, setQuestion]     = useState('');
  const [uploading, setUploading]   = useState(false);
  const [thinking, setThinking]     = useState(false);
  const [uploadErr, setUploadErr]   = useState('');
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const fileRef   = useRef(null);

  useEffect(() => {
    fetch(`${API}/api/documents`)
      .then(r => r.json())
      .then(setDocuments)
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  const selectDoc = (doc) => {
    setActiveDoc(doc);
    setMessages([{
      role: 'assistant',
      text: `Listo. Ahora puedes preguntarme cualquier cosa sobre "${doc.name}".`,
    }]);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const uploadFile = async (file) => {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      setUploadErr('Solo se aceptan archivos PDF'); return;
    }
    setUploading(true); setUploadErr('');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch(`${API}/api/documents/upload`, { method: 'POST', body: fd });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail); }
      const doc = await res.json();
      setDocuments(prev => [doc, ...prev]);
      selectDoc(doc);
    } catch (e) {
      setUploadErr(e.message || 'Error al subir el archivo');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const deleteDoc = async (doc, e) => {
    e.stopPropagation();
    await fetch(`${API}/api/documents/${doc.id}`, { method: 'DELETE' });
    setDocuments(prev => prev.filter(d => d.id !== doc.id));
    if (activeDoc?.id === doc.id) { setActiveDoc(null); setMessages([]); }
  };

  const sendQuestion = async (e) => {
    e.preventDefault();
    if (!question.trim() || !activeDoc || thinking) return;
    const q = question.trim();
    setQuestion('');
    setMessages(prev => [...prev, { role: 'user', text: q }]);
    setThinking(true);
    try {
      const res = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: activeDoc.id, question: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      setMessages(prev => [...prev, { role: 'assistant', text: data.answer, sources: data.sources }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${err.message}`, error: true }]);
    } finally {
      setThinking(false);
    }
  };

  return (
    <div className="layout">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar__header">
          <div className="sidebar__brand">
            <SageLogo size={22} />
            <span className="sidebar__title">Sage</span>
          </div>
          <p className="sidebar__sub">Pregúntale a tus documentos</p>
        </div>

        <div
          className={`upload-zone ${uploading ? 'upload-zone--loading' : ''}`}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); uploadFile(e.dataTransfer.files[0]); }}
          onClick={() => !uploading && fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }}
            onChange={e => { uploadFile(e.target.files[0]); }} />
          {uploading ? (
            <><div className="spinner" /><p className="upload-zone__text">Procesando…</p></>
          ) : (
            <>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <p className="upload-zone__text">Subir PDF</p>
              <p className="upload-zone__hint">Arrastra o haz clic</p>
            </>
          )}
        </div>
        {uploadErr && <p className="upload-err">{uploadErr}</p>}

        <div className="doc-list">
          {documents.length === 0 && (
            <p className="doc-list__empty">Sube un PDF para empezar</p>
          )}
          {documents.map(doc => (
            <div key={doc.id}
              className={`doc-item ${activeDoc?.id === doc.id ? 'doc-item--active' : ''}`}
              onClick={() => selectDoc(doc)}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="doc-item__icon">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
                  stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                <path d="M14 2v6h6M16 13H8M16 17H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span className="doc-item__name">{doc.name}</span>
              <button className="doc-item__del" onClick={e => deleteDoc(doc, e)}>✕</button>
            </div>
          ))}
        </div>
      </aside>

      {/* ── Chat ── */}
      <main className="chat">
        {!activeDoc ? (
          <div className="chat__empty">
            <SageLogo size={56} />
            <h2 className="chat__empty-title">Sage</h2>
            <p className="chat__empty-sub">
              Sube un PDF y hazle preguntas en lenguaje natural.<br />
              La IA lee el documento y responde con el contexto exacto.
            </p>
          </div>
        ) : (
          <>
            <div className="chat__header">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
                  stroke="#6366f1" strokeWidth="2" strokeLinejoin="round"/>
              </svg>
              <span>{activeDoc.name}</span>
            </div>

            <div className="messages">
              {messages.map((m, i) => (
                <div key={i} className={`msg msg--${m.role}${m.error ? ' msg--error' : ''}`}>
                  {m.role === 'assistant' && (
                    <div className="msg__avatar"><SageLogo size={16} /></div>
                  )}
                  <div className="msg__body">
                    <p className="msg__text">{m.text}</p>
                    {m.sources?.length > 0 && (
                      <details className="msg__sources">
                        <summary>Ver fragmentos usados ({m.sources.length})</summary>
                        {m.sources.map((s, si) => (
                          <blockquote key={si} className="msg__source">
                            {s.length > 220 ? s.slice(0, 220) + '…' : s}
                          </blockquote>
                        ))}
                      </details>
                    )}
                  </div>
                </div>
              ))}
              {thinking && (
                <div className="msg msg--assistant">
                  <div className="msg__avatar"><SageLogo size={16} /></div>
                  <div className="msg__body"><div className="thinking"><span/><span/><span/></div></div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <form className="chat__input-wrap" onSubmit={sendQuestion}>
              <input
                ref={inputRef}
                className="chat__input"
                placeholder="Escribe tu pregunta sobre el documento…"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                disabled={thinking}
              />
              <button className="chat__send" type="submit" disabled={!question.trim() || thinking}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}

function SageLogo({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2L3 7v10l9 5 9-5V7L12 2z" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M12 22V12M3 7l9 5 9-5" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round"/>
    </svg>
  );
}
