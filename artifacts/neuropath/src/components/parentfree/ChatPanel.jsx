import { useEffect, useRef, useState } from "react";
import { useParentChat } from "@workspace/api-client-react";
import { parentRequest } from "@/lib/parentSession";
import { ErrorBox, errMsg } from "./common";

// A reference counts as reviewed only if a clinician-reviewed card cites that document.
function allRefsReviewed(refs, cards) {
  const reviewedIds = new Set(cards.filter((c) => c.source === "clinician_reviewed").flatMap((c) => c.sourceDocumentIds || []));
  return (refs || []).every((r) => reviewedIds.has(r.documentId));
}

export default function ChatPanel({ childId, childName, cards = [] }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const chat = useParentChat({ request: parentRequest() });
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
    <div className="pf-card" style={{ display: "grid", gap: 14 }}>
      <h2>Ask about {childName}</h2>
      <p className="pf-hint">Answers use {childName}'s support steps and any plan you uploaded. This is not medical advice.</p>
      <div style={{ display: "grid", gap: 10, minHeight: 160, maxHeight: "50dvh", overflowY: "auto" }} aria-live="polite">
        {msgs.length === 0 && <p style={{ color: "var(--pf-ink-soft)" }}>Try: "What should I say when the meltdown starts?"</p>}
        {msgs.map((m, i) => (
          <div key={i} className={`pf-bubble ${m.role}`} data-testid={`bubble-${m.role}-${i}`}>
            {m.text}
            {m.refs?.length > 0 && <p className="pf-hint" style={{ marginTop: 8 }}>Sources: {m.refs.map((r) => r.title).join(", ")}</p>}
            {m.refs?.length > 0 && !allRefsReviewed(m.refs, cards) && <p className="pf-hint" style={{ marginTop: 6 }} data-testid="text-unreviewed">This answer is based on the document you uploaded and has not been reviewed by a clinician.</p>}
            {m.disclaimer && <p className="pf-hint" style={{ marginTop: 6 }}>{m.disclaimer}</p>}
          </div>
        ))}
        {chat.isPending && <div className="pf-skel" style={{ height: 48, width: "60%" }} />}
        <div ref={end} />
      </div>
      <ErrorBox error={error} />
      <form onSubmit={send} style={{ display: "flex", gap: 8 }}>
        <input className="pf-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask a question" data-testid="input-chat" />
        <button className="pf-btn primary" disabled={!text.trim() || chat.isPending} data-testid="button-send-chat">Send</button>
      </form>
    </div>
  );
}
