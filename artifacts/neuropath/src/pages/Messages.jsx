import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from '@/api/entities';
import { useAuth } from "@/lib/AuthContext";
import { getClientSession } from "@/lib/clientSession";
import { ArrowLeft, Send, MessageCircle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "framer-motion";
import { format } from "date-fns";

export default function Messages() {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const [user, setUser] = useState(null);
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [recipientId, setRecipientId] = useState("");
  const [lastMessages, setLastMessages] = useState({});
  const [isIndividual, setIsIndividual] = useState(false);
  const [portalMessages, setPortalMessages] = useState({});
  const bottomRef = useRef(null);
  const unsubscribeRef = useRef(null);

  useEffect(() => {
    if (!authUser) return;
    const load = async () => {
      const cs = getClientSession();

      if (cs?.invite_token) {
        // Parent via client session — use portal data which accepts invite_token
        setUser({ id: cs.id, app_role: "parent", account_type: cs.account_type || "parent_family", ...cs });
        const kids = cs.children || [];
        setChildren(kids);

        const individual = cs.account_type === "individual";
        setIsIndividual(individual);
        if (individual && kids.length > 0) setSelectedChild(kids[0]);

        // Load messages per child from portal data
        const previews = {};
        const allPortalMsgs = {};
        await Promise.all(kids.map(async (kid) => {
          try {
            const result = await base44.functions.invoke("getClientPortalData", {
              child_id: kid.id,
              invite_token: cs.invite_token,
            });
            const msgs = result.data?.messages || [];
            allPortalMsgs[kid.id] = msgs;
            if (msgs.length > 0) {
              previews[kid.id] = msgs.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
            }
          } catch { /* ignore */ }
        }));
        setPortalMessages(allPortalMsgs);
        setLastMessages(previews);
        return;
      }

      // Clinician or OIDC parent — original flow
      const me = await base44.auth.me().catch(() => null);
      if (!me) return;
      setUser(me);

      let kids = [];
      if (me.app_role === "clinician") {
        kids = await base44.entities.Child.filter({ clinician_id: me.id }).catch(() => []);
      } else {
        const [byId, byEmail] = await Promise.all([
          base44.entities.Child.filter({ parent_id: me.id }).catch(() => []),
          base44.entities.Child.filter({ parent_email: me.email }).catch(() => []),
        ]);
        const map = new Map();
        for (const k of [...byId, ...byEmail]) map.set(k.id, k);
        kids = Array.from(map.values());
      }
      setChildren(kids);

      const individual = me.account_type === "individual";
      setIsIndividual(individual);
      if (individual && kids.length > 0) {
        setSelectedChild(kids[0]);
      }

      const previews = {};
      await Promise.all(kids.map(async (kid) => {
        const msgs = await base44.entities.Message.filter({ child_id: kid.id }).catch(() => []);
        if (msgs.length > 0) {
          previews[kid.id] = msgs.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
        }
      }));
      setLastMessages(previews);
    };
    load();
    return () => { if (unsubscribeRef.current) unsubscribeRef.current(); };
  }, [authUser]);

  useEffect(() => {
    if (!user || !selectedChild) return;

    if (user.app_role === "clinician") {
      setRecipientId(selectedChild.parent_id || "");
    } else {
      setRecipientId(selectedChild.clinician_id || "");
    }

    const cs = getClientSession();
    if (cs?.invite_token && portalMessages[selectedChild.id]) {
      const msgs = portalMessages[selectedChild.id];
      setMessages(msgs.sort((a, b) => new Date(a.created_date) - new Date(b.created_date)));
    } else {
      base44.entities.Message.filter({ child_id: selectedChild.id }).then(msgs => {
        setMessages(msgs.sort((a, b) => new Date(a.created_date) - new Date(b.created_date)));
      }).catch(() => {});
    }

    if (unsubscribeRef.current) unsubscribeRef.current();
    unsubscribeRef.current = base44.entities.Message.subscribe((event) => {
      if (event.data?.child_id !== selectedChild.id) return;
      if (event.type === "create") {
        setMessages(prev => {
          const msgId = event.data?.id || event.id;
          if (prev.find(m => m.id === msgId)) return prev;
          return [...prev, event.data].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
        });
      }
    });

    return () => { if (unsubscribeRef.current) unsubscribeRef.current(); };
  }, [selectedChild, user, portalMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!newMsg.trim() || sending) return;
    setSending(true);
    const text = newMsg.trim();
    setNewMsg("");
    try {
      const cs = getClientSession();
      let msg;
      if (cs?.invite_token) {
        const res = await fetch("/api/client-send-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invite_token: cs.invite_token, child_id: selectedChild.id, content: text }),
        });
        if (!res.ok) throw new Error("Send failed");
        msg = await res.json();
      } else {
        msg = await base44.entities.Message.create({
          from_user_id: user.id,
          to_user_id: recipientId || null,
          child_id: selectedChild.id,
          content: text,
          sender_role: user.app_role === "clinician" ? "clinician" : "parent",
          is_read: false,
        });
      }
      setMessages(prev => [...prev, msg]);
      setLastMessages(prev => ({ ...prev, [selectedChild.id]: msg }));
    } catch { /* ignore */ }
    setSending(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const canSend = newMsg.trim() && (recipientId || user?.app_role === "clinician");

  // ── CHAT VIEW ──────────────────────────────────────────────
  if (selectedChild) {
    return (
      <div className="flex flex-col h-screen bg-background font-inter">
        <div className="bg-card border-b border-border px-4 py-4 flex items-center gap-3 flex-shrink-0">
          <button onClick={() => isIndividual ? navigate("/ParentDashboard") : setSelectedChild(null)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-primary font-bold text-sm">{selectedChild.child_name?.[0]}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground text-sm">
              {user?.account_type === "individual" ? "My Clinician" : selectedChild.child_name}
            </p>
            <p className="text-xs text-muted-foreground">
              {user?.app_role === "clinician" ? "Client conversation" : isIndividual ? "Your clinician" : "Clinician conversation"}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          {messages.length === 0 ? (
            <div className="text-center py-16">
              <MessageCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {user?.account_type === "individual" ? "No messages yet. Send a message to your clinician." : `No messages yet for ${selectedChild.child_name}.`}
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-w-xl mx-auto">
              {messages.map((msg, i) => {
                const isMe = msg.from_user_id === user?.id;
                return (
                  <motion.div key={msg.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-sm ${isMe ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-card border border-border text-foreground rounded-bl-sm"}`}>
                      <p>{msg.content || msg.body}</p>
                      <p className={`text-xs mt-1 ${isMe ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                        {msg.created_date ? format(new Date(msg.created_date), "MMM d, h:mm a") : ""}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {!recipientId && user?.app_role !== "clinician" && (
          <div className="px-4 py-3 bg-yellow-50 border-t border-yellow-200 text-xs text-yellow-700 text-center flex-shrink-0">
            No clinician linked yet. Ask your clinician to connect your account.
          </div>
        )}

        <div className="flex-shrink-0 border-t border-border bg-card px-4 py-3">
          <div className="max-w-xl mx-auto flex gap-2 items-end">
            <Textarea value={newMsg} onChange={e => setNewMsg(e.target.value)} onKeyDown={handleKeyDown} placeholder="Type a message..." rows={1} className="flex-1 resize-none rounded-xl text-sm max-h-28 min-h-[40px]" />
            <Button onClick={handleSend} disabled={sending || !canSend} className="h-10 w-10 p-0 rounded-xl flex-shrink-0">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── LANDING / CLIENT LIST ──────────────────────────────────
  return (
    <div className="min-h-screen bg-background font-inter">
      <div className="bg-card border-b border-border px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <MessageCircle className="w-5 h-5 text-primary" />
        <h1 className="font-bold text-foreground flex-1">Messages</h1>
      </div>

      <div className="p-5 max-w-2xl mx-auto">
        {children.length === 0 ? (
          <div className="text-center py-20">
            <MessageCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No conversations yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-4">
              {user?.app_role === "clinician" ? "Clients" : user?.account_type === "individual" ? "My Conversations" : "My Children"}
            </p>
            {children.map((child, i) => {
              const last = lastMessages[child.id];
              return (
                <motion.div
                  key={child.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => setSelectedChild(child)}
                  className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3 cursor-pointer hover:border-primary/40 transition-colors"
                >
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary font-bold">{child.child_name?.[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm">{child.child_name}</p>
                    {last ? (
                      <p className="text-xs text-muted-foreground truncate">{last.content || last.body}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No messages yet</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {last && (
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(last.created_date), "MMM d")}
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}