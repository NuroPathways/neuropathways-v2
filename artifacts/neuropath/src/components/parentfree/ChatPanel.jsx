import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useParentChat } from "@workspace/api-client-react";
import { parentRequest } from "@/lib/parentSession";
import { ErrorBox, errMsg } from "./common";

// A reference counts as reviewed only if a clinician-reviewed card cites that document.
function allRefsReviewed(refs, cards) {
  const reviewedIds = new Set(cards.filter((c) => c.source === "clinician_reviewed" && c.reviewedBy).flatMap((c) => c.sourceDocumentIds || []));
  return (refs || []).every((r) => reviewedIds.has(r.documentId));
}

function parentLocalDay() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

export default function ChatPanel({ childId, childName, cards = [] }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const chatRequest = parentRequest();
  const chatHeaders = new Headers(chatRequest.headers);
  chatHeaders.set("X-Parent-Local-Date", parentLocalDay());
  const chat = useParentChat({ request: { ...chatRequest, headers: chatHeaders } });
  const end = useRef(null);
  useEffect(() => { setMsgs([]); setError(""); }, [childId]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [msgs, chat.isPending]);

  const send = (e) => {
    e.preventDefault();
    const message = text.trim();
    if (!message || chat.isPending) return;
    setError(""); setText("");
    setMsgs((m) => [...m, { role: "me", text: message }]);
    chat.mutate({ childId, data: { message } }, {
      onSuccess: (r) => setMsgs((m) => [...m, { role: "ai", text: r.answer, refs: r.sourceReferences, disclaimer: r.disclaimer }]),
      onError: (er) => { setError(errMsg(er, "Could not get an answer.")); setText(message); setMsgs((m) => m.slice(0, -1)); },
    });
  };

  return (
    <div className="pf-card pf-chat" style={{ display: "grid", gap: 14 }}>
      <h2>Ask about {childName}</h2>
      <p className="pf-hint">Answers may use readable information from your uploaded plans or saved support. If they do not cover your question, NeuroPath may offer general information. This is not medical or professional advice. If there is immediate danger, call 911 or your local emergency services.</p>
      <div className="pf-chat-scroll" style={{ display: "grid", gap: 10, minHeight: 160, maxHeight: "50dvh", overflowY: "auto" }} aria-live="polite">
        {msgs.length === 0 && <p style={{ color: "var(--pf-ink-soft)" }}>Try: "What should I say when the meltdown starts?"</p>}
        {msgs.map((m, i) => (
          <div key={i} className={`pf-bubble ${m.role}`} data-testid={`bubble-${m.role}-${i}`}>
            {m.role === "me" ? m.text : (
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p style={{ margin: "4px 0" }}>{children}</p>,
                  strong: ({ children }) => <strong>{children}</strong>,
                  ul: ({ children }) => <ul style={{ margin: "6px 0 6px 20px", listStyle: "disc" }}>{children}</ul>,
                  ol: ({ children }) => <ol style={{ margin: "6px 0 6px 20px", listStyle: "decimal" }}>{children}</ol>,
                  li: ({ children }) => <li style={{ margin: "2px 0" }}>{children}</li>,
                  h1: ({ children }) => <h3 style={{ margin: "10px 0 4px", fontSize: "1.05rem" }}>{children}</h3>,
                  h2: ({ children }) => <h3 style={{ margin: "10px 0 4px", fontSize: "1rem" }}>{children}</h3>,
                  h3: ({ children }) => <h3 style={{ margin: "8px 0 4px", fontSize: ".95rem" }}>{children}</h3>,
                  blockquote: ({ children }) => <blockquote style={{ margin: "8px 0", paddingLeft: 12, borderLeft: "3px solid var(--pf-line)" }}>{children}</blockquote>,
                }}
              >
                {m.text}
              </ReactMarkdown>
            )}
            {m.refs?.length > 0 && <p className="pf-hint" style={{ marginTop: 8 }}>Sources: {m.refs.map((r) => r.title).join(", ")}</p>}
            {(!m.refs?.length || !allRefsReviewed(m.refs, cards)) && <p className="pf-hint" style={{ marginTop: 6 }} data-testid="text-unreviewed">This answer is based on starter support or your uploaded information. It has not been reviewed by a clinician.</p>}
            {m.disclaimer && <p className="pf-hint" style={{ marginTop: 6 }}>{m.disclaimer}</p>}
          </div>
        ))}
        {chat.isPending && <div className="pf-skel" style={{ height: 48, width: "60%" }} />}
        <div ref={end} />
      </div>
      <ErrorBox error={error} />
      <form className="pf-chat-form" onSubmit={send} style={{ display: "flex", gap: 8 }}>
        <input className="pf-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask a question" data-testid="input-chat" />
        <button className="pf-btn primary" disabled={!text.trim() || chat.isPending} data-testid="button-send-chat">Send</button>
      </form>
    </div>
  );
}
