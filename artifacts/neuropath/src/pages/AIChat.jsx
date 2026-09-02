import { useState, useEffect, useRef } from "react";
import { base44 } from '@/api/entities';
import { useAuth } from "@/lib/AuthContext";
import { getClientSession } from '@/lib/clientSession';
import { Send, Brain, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";

const SUGGESTED = [
  "Give me a summary of my child's treatment plan",
  "Create a daily behavior schedule for today",
  "What happened in our last session?",
  "Help me plan homework time for this afternoon",
  "What are the main triggers I should watch for?",
  "Show me a morning routine based on the plan",
];

const SUGGESTED_INDIVIDUAL = [
  "Summarize my treatment plan in simple terms",
  "I'm feeling overwhelmed right now — what should I do?",
  "What are my main triggers and how do I manage them?",
  "Help me build a calming routine for today",
  "What coping strategies has my clinician recommended?",
  "Walk me through what to do when I feel anxious",
];

async function detectIndividualClient(childId, user, knownAccountType) {
  // Fast path: caller already knows the account type (avoids extra API calls)
  if (knownAccountType) return knownAccountType === "individual";
  // Trust account_type stored on the OIDC user record
  if (user?.account_type) return user.account_type === "individual";
  // Fallback: look up from family record (slow path, only used when neither is set)
  try {
    const kids = await base44.entities.Child.filter({ id: childId }).catch(() => []);
    const child = kids[0];
    if (child?.is_patient && !child?.family_id) return true;
    if (!child?.family_id) return false;
    const fams = await base44.entities.Family.filter({ id: child.family_id }).catch(() => []);
    return fams[0]?.account_type === "individual";
  } catch { return false; }
}

async function buildContext(childId, childName, user, isIndividual = false) {
  // Use portal data function for client sessions (username+code) to bypass RLS
  const isClientSession = user && !user.role;
  let portalPlans = [], portalDocs = [], portalInterventions = [];
  if (isClientSession) {
    const portalRes = await base44.functions.invoke("getClientPortalData", {
      child_id: childId,
      account_id: user.id,
      invite_token: user.invite_token,
    }).catch(() => null);
    if (portalRes?.data) {
      portalPlans = portalRes.data.plans || [];
      portalDocs = portalRes.data.documents || [];
      portalInterventions = portalRes.data.interventionPlans || [];
    }
  }

  // Individual clients don't need behavior logs (those are caregiver-recorded observations)
  const [plans, documents, interventions, sessions, logs] = await Promise.all([
    isClientSession ? Promise.resolve(portalPlans) : base44.entities.BehaviorPlan.filter({ child_id: childId }).catch(() => []),
    isClientSession ? Promise.resolve(portalDocs) : base44.entities.Document.filter({ child_id: childId }).catch(() => []),
    isClientSession ? Promise.resolve(portalInterventions) : base44.entities.InterventionPlan.filter({ child_id: childId }).catch(() => []),
    base44.entities.AIConversation.filter({ child_id: childId, parent_id: user?.id }).catch(() => []),
    isIndividual ? Promise.resolve([]) : base44.entities.BehaviorLog.filter({ child_id: childId }).catch(() => []),
  ]);

  // Use first-person framing for individual clients so the AI doesn't get pulled into
  // third-person references by the context itself.
  let context = isIndividual
    ? `== YOUR TREATMENT INFORMATION ==\n\n`
    : `== CHILD: ${childName} ==\n\n`;

  if (plans.length > 0) {
    context += isIndividual ? `=== YOUR SUPPORT PLANS ===\n` : `=== BEHAVIOR PLANS ===\n`;
    plans.forEach(p => {
      context += `\nPlan: ${p.behavior_name}\n`;
      if (p.behavior_description) context += `${isIndividual ? "About this plan" : "Description"}: ${p.behavior_description}\n`;
      if (p.behavior_function) context += `${isIndividual ? "Why this happens for you" : "Function"}: ${p.behavior_function}\n`;
      if (p.common_triggers) context += `${isIndividual ? "Your triggers" : "Triggers"}: ${p.common_triggers}\n`;
      if (p.strategy_title) context += `${isIndividual ? "Your strategy" : "Strategy"}: ${p.strategy_title}\n`;
      if (p.strategy_steps) context += `Steps: ${p.strategy_steps}\n`;
      if (p.reinforcement_method) context += `Reinforcement: ${p.reinforcement_method}\n`;
      if (p.deescalation_steps) context += `${isIndividual ? "Calming steps for you" : "De-escalation"}: ${p.deescalation_steps}\n`;
      if (p.avoid_actions) context += `${isIndividual ? "Things to avoid" : "Avoid"}: ${p.avoid_actions}\n`;
    });
    context += `\n`;
  }

  if (interventions.length > 0) {
    context += isIndividual ? `=== YOUR STRATEGIES ===\n` : `=== INTERVENTION PLANS ===\n`;
    interventions.forEach(plan => {
      context += `\n${isIndividual ? "Strategy" : "Intervention"}: ${plan.title} (${plan.behavior_category?.replace(/_/g, " ")})\n`;
      if (plan.description) context += `Overview: ${plan.description}\n`;
      if (plan.immediate_steps) context += `${isIndividual ? "What to do right now" : "Immediate Steps"}: ${plan.immediate_steps}\n`;
      if (plan.deescalation_steps) context += `${isIndividual ? "How to calm down" : "De-escalation"}: ${plan.deescalation_steps}\n`;
      if (plan.reinforcement_steps) context += `Reinforcement: ${plan.reinforcement_steps}\n`;
      if (plan.prevention_tips) context += `${isIndividual ? "How to prevent this" : "Prevention"}: ${plan.prevention_tips}\n`;
      if (plan.things_to_avoid) context += `${isIndividual ? "Things to avoid" : "Avoid"}: ${plan.things_to_avoid}\n`;
    });
    context += `\n`;
  }

  if (documents.length > 0) {
    context += isIndividual ? `=== YOUR DOCUMENTS ===\n` : `=== UPLOADED DOCUMENTS ===\n`;
    documents.forEach(doc => {
      const uploadDate = doc.created_date ? new Date(doc.created_date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "Unknown date";
      context += `\nDocument: "${doc.title}" (${doc.category?.replace(/_/g, " ")}) — uploaded ${uploadDate}\n`;
      if (doc.notes) context += `Content/Notes: ${doc.notes}\n`;
      if (doc.file_name) context += `File: ${doc.file_name}\n`;
    });
    context += `\n`;
  }

  if (sessions.length > 0) {
    context += isIndividual ? `=== YOUR SESSION HISTORY ===\n` : `=== SESSION HISTORY ===\n`;
    const sorted = [...sessions].sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 20);
    sorted.forEach(s => {
      const sessionDate = s.created_date ? new Date(s.created_date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : "Unknown date";
      context += `\nDate: ${sessionDate}\nQuestion: ${s.question}\nResponse Summary: ${s.ai_response?.slice(0, 300)}...\n`;
    });
    context += `\n`;
  }

  // Behavior logs are caregiver-recorded observations — only include for caregiver/parent accounts
  if (!isIndividual && logs.length > 0) {
    context += `=== BEHAVIOR LOG HISTORY ===\n`;
    const recentLogs = [...logs].sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 30);
    recentLogs.forEach(log => {
      const logDate = log.created_date ? new Date(log.created_date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : "Unknown";
      context += `${logDate}: ${log.behavior_type || "Behavior"} (${log.intensity || "?"} intensity)`;
      if (log.context) context += ` — Context: ${log.context}`;
      if (log.possible_function) context += ` — Function: ${log.possible_function}`;
      if (log.parent_feedback) context += ` — Strategy worked: ${log.parent_feedback}`;
      context += `\n`;
    });
    context += `\n`;
  }

  return { context, hasPlans: plans.length + interventions.length > 0, hasDocuments: documents.length > 0 };
}

async function generateResponse(userMessage, child, clinicianContext, conversationHistory, isIndividualClient) {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const historyText = conversationHistory.slice(-8).map(m => `${m.role === "user" ? (isIndividualClient ? "Client" : "Parent") : "NeuroPath AI"}: ${m.content}`).join("\n\n");

  const voiceInstruction = isIndividualClient
    ? `You are speaking DIRECTLY to the client — they are the person the treatment plan is written about. They are reading this themselves.

STRICT RULES FOR INDIVIDUAL CLIENT MODE:
- ALWAYS speak in second person: "you", "your", "yourself"
- NEVER use these forbidden patterns:
  * "allow them to" / "let them" / "let [name]"
  * "[name] might feel..." or any sentence that refers to the reader in third person
  * "the client" — you are talking TO the client, not ABOUT them
  * "your child" — this person is not a caregiver
  * Any phrasing structured as if you are advising a third party who is absent
- EVERY piece of guidance must be a direct instruction or observation addressed to "you"
- Good examples: "Try moving to a quieter space", "You might feel better if you take a few slow breaths", "When you notice yourself getting overwhelmed, you can step away", "Your plan says to..."
- If the clinical document uses third-person language about the client, silently translate it to second person before using it`
    : `You are speaking to a parent or caregiver. Use caregiver-directed language — refer to the child by name or as "they/them". It's appropriate to say things like "Allow ${child?.child_name || "them"} to retreat to a quiet space" or "Pause verbal demands until ${child?.child_name || "they"} is regulated."`;

  const systemPrompt = `You are NeuroPath AI — a warm, practical behavioral support assistant for families and individual clients. ${voiceInstruction}

TODAY'S DATE: ${today}
${isIndividualClient ? `CLIENT: ${child?.child_name || "Unknown"}, Age: ${child?.age || "N/A"}, Diagnosis: ${child?.diagnosis || "N/A"}` : `CHILD: ${child?.child_name || "Unknown"}, Age: ${child?.age || "N/A"}, Diagnosis: ${child?.diagnosis || "N/A"}`}

=== CLINICIAN DATA & CONTEXT ===
${clinicianContext.context || "No data loaded yet."}
=== END CONTEXT ===

=== RECENT CONVERSATION ===
${historyText || "No prior messages."}
=== END CONVERSATION ===

IMPORTANT RESPONSE RULES:
1. TRANSLATE clinical jargon into plain, everyday language. Preserve the clinical meaning but remove technical wording that families won't understand.
   - Instead of "antecedent modification techniques" → say "removing things that usually set off the behavior before it starts"
   - Instead of "differential reinforcement" → say "praising the behavior you want to see more of"
   - Instead of "emotional dysregulation" → say "feeling overwhelmed or out of control"
   - Instead of "maladaptive behaviors" → say "challenging behaviors"
   - Instead of "extinction procedure" → say "consistently ignoring the behavior to help it fade"
2. Format responses with clear sections using markdown headers when answering guidance questions:
   ### What may be happening
   ### What to do right now
   ### What to avoid
   ### When to contact your clinician (only if relevant)
3. Be warm, specific, and practical. Write like a knowledgeable friend, not a clinical report.
4. NEVER invent strategies or advice not supported by the clinician's data above.
5. Keep crisis/safety guidance (aggression, self-harm, emergency instructions) clear and precise — do NOT water down safety steps.
6. Use the clinician's actual data — reference specific plan names, strategies, and steps when relevant.`;

  const securityRule = `CRITICAL SECURITY RULE: You ONLY have access to data for the client named ${child?.child_name || 'this client'}. If the user asks about any other person, client, or child by name, politely decline and say you can only discuss ${child?.child_name || 'this client'}\'s information. Never reveal data about any other clients.`;

  return await base44.integrations.Core.InvokeLLM({
    model: "claude_sonnet_4_6",
    prompt: `${systemPrompt}\n\n${securityRule}\n\n${isIndividualClient ? "Client's" : "Parent's"} message: "${userMessage}"\n\nRespond directly and helpfully:`
  });
}

export default function AIChat() {
  const { user } = useAuth();
  const [children, setChildren] = useState([]);
  const [selectedChildId, setSelectedChildId] = useState("");
  const [isIndividualClient, setIsIndividualClient] = useState(false);
  const [clinicianContext, setClinicianContext] = useState({ context: "", hasPlans: false, hasDocuments: false });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      // Check account_type from both OIDC user object and client-session (username+code)
      const cs = getClientSession();
      const accountType = user.account_type || cs?.account_type;
      if (accountType === "individual") setIsIndividualClient(true);
      // Support client sessions (username+code) which carry children directly
      let merged = user.children || [];
      if (merged.length === 0) {
        const [byId, byEmail] = await Promise.all([
          base44.entities.Child.filter({ parent_id: user.id }).catch(() => []),
          user.email ? base44.entities.Child.filter({ parent_email: user.email }).catch(() => []) : Promise.resolve([]),
        ]);
        const seen = new Set();
        merged = [...byId, ...byEmail].filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
      }
      setChildren(merged);
      if (merged.length > 0) setSelectedChildId(merged[0].id);
    };
    load();
  }, [user?.id]);

  useEffect(() => {
    if (!selectedChildId) return;
    const child = children.find(c => c.id === selectedChildId);
    setLoadingContext(true);
    // Read account_type from both OIDC user and client-session so detectIndividualClient
    // can skip the slow family-lookup when the type is already known.
    const cs = getClientSession();
    const knownAccountType = user?.account_type || cs?.account_type;
    Promise.all([
      detectIndividualClient(selectedChildId, user, knownAccountType),
    ]).then(([isInd]) => {
      setIsIndividualClient(isInd);
      return buildContext(selectedChildId, child?.child_name || "", user, isInd);
    }).then(ctx => {
      setClinicianContext(ctx);
      setLoadingContext(false);
    });
  }, [selectedChildId, children]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const sendMessage = async (text) => {
    const msg = text || input.trim();
    if (!msg || isLoading) return;
    setInput("");

    const userMsg = { role: "user", content: msg };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    const child = children.find(c => c.id === selectedChildId);
    const updatedHistory = [...messages, userMsg];
    const response = await generateResponse(msg, child, clinicianContext, updatedHistory, isIndividualClient);

    setMessages(prev => [...prev, { role: "assistant", content: response }]);
    setIsLoading(false);

    if (user && selectedChildId) {
      base44.entities.AIConversation.create({
        parent_id: user.id,
        child_id: selectedChildId,
        child_name: child?.child_name || "",
        question: msg,
        ai_response: response
      }).catch(() => {});
      // Engagement event for clinician analytics (topic only — full conversation is not exposed)
      base44.entities.EngagementEvent.create({
        child_id: selectedChildId,
        clinician_id: child?.clinician_id,
        event_type: "ai_question",
        topic: msg.slice(0, 80),
      }).catch(() => {});
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div className="flex flex-col h-screen font-inter">
      <div className="px-6 py-4 border-b border-border bg-card flex-shrink-0">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <Brain className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm">NeuroPath AI</p>
              <p className="text-xs text-muted-foreground">
                {loadingContext ? "Loading your data..." : clinicianContext.hasPlans || clinicianContext.hasDocuments ? "Data loaded ✓" : "Connected"}
              </p>
            </div>
          </div>
          {children.length > 1 && !isIndividualClient && (
            <Select value={selectedChildId} onValueChange={setSelectedChildId}>
              <SelectTrigger className="w-36 h-8 text-xs rounded-lg border-border">
                <SelectValue placeholder="Select child" />
              </SelectTrigger>
              <SelectContent>
                {children.map(c => <SelectItem key={c.id} value={c.id}>{c.child_name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-5">
          {messages.length === 0 && !isLoading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-8">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <h2 className="font-semibold text-foreground mb-1">How can I help today?</h2>
              <p className="text-sm text-muted-foreground mb-6">
                {isIndividualClient
                  ? "I'm here to support you directly. Ask me anything about your treatment plan, coping strategies, how to manage a difficult moment, or what to do right now."
                  : "I can summarize your child's treatment plan, build daily schedules, answer questions about specific sessions, and more."}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(isIndividualClient ? SUGGESTED_INDIVIDUAL : SUGGESTED).map(s => (
                  <button key={s} onClick={() => sendMessage(s)} className="text-left px-4 py-3 rounded-xl bg-card border border-border hover:border-primary/50 hover:bg-muted/50 text-sm text-foreground transition-all">
                    {s}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          <AnimatePresence>
            {messages.map((m, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Brain className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === "user" ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-card border border-border rounded-tl-sm text-foreground"}`}>
                  {m.role === "user" ? (
                    <p>{m.content}</p>
                  ) : (
                    <div className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-strong:font-semibold">
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p className="my-1 leading-relaxed text-foreground">{children}</p>,
                          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                          ul: ({ children }) => <ul className="my-1.5 ml-4 list-disc space-y-0.5">{children}</ul>,
                          ol: ({ children }) => <ol className="my-1.5 ml-4 list-decimal space-y-0.5">{children}</ol>,
                          li: ({ children }) => <li className="text-foreground">{children}</li>,
                          h1: ({ children }) => <h1 className="text-base font-semibold text-foreground mt-3 mb-1">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-sm font-semibold text-foreground mt-3 mb-1">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-sm font-medium text-foreground mt-2 mb-1">{children}</h3>,
                          code: ({ children }) => <code className="bg-muted px-1 py-0.5 rounded text-xs">{children}</code>,
                          hr: () => <hr className="my-3 border-border" />,
                        }}
                      >
                        {m.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isLoading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
              <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                <Brain className="w-4 h-4 text-primary-foreground" />
              </div>
              <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <motion.div key={i} className="w-2 h-2 rounded-full bg-primary/60"
                      animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }} />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">Thinking...</span>
              </div>
            </motion.div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <div className="flex-shrink-0 border-t border-border bg-card px-4 py-4">
        <div className="max-w-2xl mx-auto flex gap-3 items-end">
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isIndividualClient ? "Ask anything — what to do right now, coping strategies, your treatment plan..." : "Ask anything — schedules, document summaries, session history, behavior help..."}
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none rounded-xl border-border text-sm max-h-32 min-h-[44px]"
          />
          <Button onClick={() => sendMessage()} disabled={isLoading || !input.trim()} className="h-11 w-11 p-0 rounded-xl bg-primary hover:bg-primary/90 flex-shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-2 max-w-2xl mx-auto">
          {isIndividualClient
            ? "NeuroPath AI reads your clinician's documents and support plan to give you guidance you can use right now."
            : "NeuroPath AI reads your clinician's documents, support plans, and session history to give you personalized answers."}
        </p>
      </div>
    </div>
  );
}