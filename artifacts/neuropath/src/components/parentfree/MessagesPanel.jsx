import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetParentMessages, getGetParentMessagesQueryKey, useSendParentMessage } from "@workspace/api-client-react";
import { parentRequest } from "@/lib/parentSession";
import { ErrorBox, Skeleton, errMsg } from "./common";

export default function MessagesPanel({ childId, childName }) {
  const qc = useQueryClient();
  const req = parentRequest();
  const key = getGetParentMessagesQueryKey(childId);
  const q = useGetParentMessages(childId, { query: { queryKey: key, enabled: !!childId }, request: req });
  const send = useSendParentMessage({ request: req });
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const msgs = [...(q.data || [])].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const submit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setError("");
    send.mutate({ childId, data: { content: text.trim() } }, {
      onSuccess: () => { setText(""); qc.invalidateQueries({ queryKey: key }); },
      onError: (er) => setError(errMsg(er, "Your message could not be sent.")),
    });
  };
  return (
    <section className="pf-card" style={{ display: "grid", gap: 12 }} aria-labelledby="messages-heading" data-testid="panel-messages">
      <h2 id="messages-heading">Messages with your care team</h2>
      <p className="pf-hint">About {childName}. For urgent safety concerns, call your local emergency number.</p>
      {q.isLoading ? <Skeleton h={120} /> : q.isError ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : msgs.length === 0 ? (
        <p className="pf-hint" data-testid="empty-messages">No messages yet. Start a conversation below.</p>
      ) : (
        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }} aria-live="polite">
          {msgs.map((m) => {
            const mine = m.senderRole !== "clinician";
            return (
              <li key={m.id} data-testid={`message-${m.id}`} style={{ justifySelf: mine ? "end" : "start", maxWidth: "min(85%, 520px)", padding: "10px 12px", borderRadius: 14, background: mine ? "var(--pf-sage-soft, rgba(0,0,0,.05))" : "var(--pf-sun-soft, rgba(0,0,0,.03))", border: "1px solid var(--pf-line)", overflowWrap: "anywhere" }}>
                <strong style={{ fontSize: 12 }}>{mine ? "You" : "Care team"}</strong>
                <p style={{ margin: "2px 0", whiteSpace: "pre-wrap" }}>{m.content}</p>
                <small className="pf-hint">{new Date(m.createdAt).toLocaleString()}</small>
              </li>
            );
          })}
        </ol>
      )}
      <ErrorBox error={error} />
      <form onSubmit={submit} style={{ display: "grid", gap: 8 }}>
        <label htmlFor="message-input">New message</label>
        <textarea id="message-input" className="pf-input" maxLength={5000} value={text} onChange={(e) => setText(e.target.value)} data-testid="input-message" />
        <button type="submit" className="pf-btn small primary" style={{ justifySelf: "start" }} disabled={send.isPending || !text.trim()} data-testid="button-send-message">{send.isPending ? "Sending..." : "Send"}</button>
      </form>
    </section>
  );
}
