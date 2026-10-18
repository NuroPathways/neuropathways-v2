import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useParentChat } from "@workspace/api-client-react";
import { parentRequest } from "@/lib/parentSession";
import { ErrorBox, errMsg } from "./common";
import { Button } from "@workspace/neuropathways-foundations/components/ui/button";
import { Input } from "@workspace/neuropathways-foundations/components/ui/input";
import { Disclosure } from "@workspace/neuropathways-foundations/components/ui/disclosure";
import "@workspace/neuropathways-foundations/scoped.css";
import "./chat-phase-seven.css";

const MD = {
  p: ({ children }) => <p>{children}</p>,
  strong: ({ children }) => <strong>{children}</strong>,
  ul: ({ children }) => <ul>{children}</ul>,
  ol: ({ children }) => <ol>{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  h1: ({ children }) => <h3>{children}</h3>,
  h2: ({ children }) => <h3>{children}</h3>,
  h3: ({ children }) => <h3>{children}</h3>,
  blockquote: ({ children }) => <blockquote>{children}</blockquote>,
};

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
    <div className="pf-card np-foundations np-chat-v7">
      <h2>Ask about {childName}</h2>
      <div className="np-chat-safety" data-testid="text-chat-safety">
        <p className="np-chat-emergency">If there is immediate danger, call 911 or your local emergency services.</p>
        <p className="np-chat-notice">This is not medical or professional advice.</p>
      </div>
      <Disclosure className="np-chat-disclosure" title="Important information" data-testid="disclosure-chat-info">
        <p>Answers may use readable information from your uploaded plans or saved support. If they do not cover your question, NeuroPath may offer general information.</p>
      </Disclosure>
      <div className="np-chat-scroll" aria-live="polite">
        {msgs.length === 0 && <p className="np-chat-empty">Try: "What should I say when the meltdown starts?"</p>}
        {msgs.map((m, i) => (
          <div key={i} className={`pf-bubble ${m.role} np-chat-bubble`} data-testid={`bubble-${m.role}-${i}`}>
            {m.role === "me" ? <p className="np-chat-user-text">{m.text}</p> : (
              <div className="np-chat-answer">
                <ReactMarkdown components={MD}>{m.text}</ReactMarkdown>
              </div>
            )}
            {m.role === "ai" && (!m.refs?.length || !allRefsReviewed(m.refs, cards)) && <p className="np-chat-provenance" data-testid="text-unreviewed">This answer is based on starter support or your uploaded information. It has not been reviewed by a clinician.</p>}
            {m.disclaimer && <p className="np-chat-disclaimer" data-testid={`text-disclaimer-${i}`}>{m.disclaimer}</p>}
            {m.refs?.length > 0 && (
              <Disclosure className="np-chat-disclosure np-chat-sources" title={`Sources (${m.refs.length})`} data-testid={`disclosure-sources-${i}`}>
                <ul className="np-chat-source-list">
                  {m.refs.map((r, j) => (
                    <li key={`${r.documentId}-${j}`} data-testid={`source-${i}-${j}`}>
                      <p className="np-chat-source-title">{r.title}</p>
                      {r.excerpt && <p className="np-chat-source-excerpt">{r.excerpt}</p>}
                      <p className="np-chat-source-id">Document ID: {r.documentId}</p>
                    </li>
                  ))}
                </ul>
              </Disclosure>
            )}
          </div>
        ))}
        {chat.isPending && <div className="pf-skel np-chat-skel" aria-label="Waiting for an answer" />}
        <div ref={end} />
      </div>
      <ErrorBox error={error} />
      <form className="pf-chat-form np-chat-form" onSubmit={send}>
        <label htmlFor="np-chat-input" className="np-chat-sr">Ask a question about {childName}</label>
        <Input id="np-chat-input" className="np-chat-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask a question" data-testid="input-chat" />
        <Button type="submit" className="np-chat-send" disabled={!text.trim() || chat.isPending} data-testid="button-send-chat">Send</Button>
      </form>
    </div>
  );
}
