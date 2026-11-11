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

const CHAT_DISCLAIMER =
  "General ABA-informed information only—not medical or professional advice. It does not replace guidance from your clinician or care team.";

function buildGeneralSupportFallback(question) {
  const emergency = /\b(?:right now|immediate danger|serious injury|self[- ]harm|suicid\w*|chok\w*|overdose|weapon|someone is hurt)\b/i.test(question);
  const safety = emergency
    ? "If someone may be hurt or is in immediate danger, move to a safer place if possible and contact 911 or your local emergency services."
    : "";
  return `${safety ? `${safety}\n\n` : ""}For the behavior you described, first make the area safer and use fewer, simpler words. Notice what happened just before the behavior and what happened after, without assuming why it occurred. When it is safe, offer one clear next step or a choice and encourage a safe request for help or a break. If the behavior is frequent, worsening, or causing injury, write down the pattern and discuss it with the child’s clinician.`;
}

function isBareAssistantRefusal(value) {
  const beginsWithRefusal = /^\s*(?:I(?:['’]m| am)\s+(?:unable|not able)\s+to|I\s+(?:cannot|can['’]t|won't))\s+(?:help|assist|answer|provide|discuss)\b/i.test(value);
  return beginsWithRefusal && !/\b(?:instead|you can|try|safe|general information|for example)\b/i.test(value);
}

function includesUnsafePhysicalInstructions(value) {
  return /\b(?:restraint|restrain\w*|seclusion|pin\w*|physical block(?:ing)?|immobiliz\w*)\b/i.test(value)
    || /\bhold(?:ing)?\s+(?:them|a child|the child|your child|him|her)\s+(?:down|still|in place)\b/i.test(value);
}

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

const field = (object, ...keys) => {
  for (const key of keys) {
    const value = object?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
};

function profileValue(value) {
  if (Array.isArray(value)) {
    return value.map(item => typeof item === "string"
      ? item
      : field(item, "title", "name", "description", "target_behavior", "targetBehavior")
    ).filter(Boolean).slice(0, 10).join("; ");
  }
  return typeof value === "string" ? value.trim() : "";
}

function childProfileContext(child) {
  if (!child) return "No child profile details are available.";
  const details = [];
  const age = field(child, "age");
  const diagnosis = profileValue(field(child, "diagnosis"));
  const triggers = profileValue(field(child, "triggers"));
  if (age !== null && age !== undefined) details.push(`Age: ${age}`);
  if (diagnosis) details.push(`Recorded diagnosis: ${diagnosis.slice(0, 500)}`);
  if (triggers) details.push(`Profile notes about triggers: ${triggers.slice(0, 1200)}`);
  return details.length ? details.join("\n") : "No additional profile details are recorded.";
}

function scannedProfileContext(profile, documents, isIndividual) {
  if (!profile) return "";
  const sourceIds = field(profile, "source_doc_ids", "sourceDocIds");
  const sourceDocIds = Array.isArray(sourceIds) ? sourceIds : [];
  const documentsById = new Map(documents.map(document => [document.id, document]));
  const hasUnscannedDocument = documents.some(document => {
    const status = String(field(document, "scan_status", "scanStatus") || "").toLowerCase();
    return ["pending", "error", "failed", "processing", "scanning"].includes(status);
  });
  const staleSource = hasUnscannedDocument || sourceDocIds.some(id => {
    const document = documentsById.get(id);
    if (!document) return true;
    const status = String(field(document, "scan_status", "scanStatus") || "").toLowerCase();
    return ["pending", "error", "failed", "processing", "scanning"].includes(status);
  });
  const heading = isIndividual ? "=== YOUR DOCUMENT-BASED PLAN SUMMARY ===" : "=== DOCUMENT-BASED CLINICAL SUMMARY ===";
  if (staleSource) {
    return `${heading}\nA document used for the saved summary has not been successfully re-read. Do not treat the previous summary as current. Ask the user to open Documents and re-scan the document before giving document-specific guidance.\n\n`;
  }

  const lines = [];
  const diagnoses = profileValue(field(profile, "diagnoses"));
  if (diagnoses) lines.push(`Recorded diagnoses: ${diagnoses.slice(0, 500)}`);

  const behaviors = field(profile, "behaviors");
  if (Array.isArray(behaviors)) {
    behaviors.slice(0, 12).forEach(behavior => {
      const name = field(behavior, "name", "behavior_name", "behaviorName") || "Support target";
      lines.push(`\nTarget: ${String(name).slice(0, 300)}`);
      const behaviorFields = [
        ["Description", ["description"]],
        ["What may be happening", ["what_may_be_happening", "whatMayBeHappening"]],
        ["What to do right now", ["do_this_right_now", "doThisRightNow"]],
        ["Strategies", ["interventions"]],
        ["Clinical interventions", ["clinical_interventions", "clinicalInterventions"]],
        ["If it escalates", ["if_it_escalates", "ifItEscalates"]],
        ["Avoid", ["avoid"]],
        ["Prevention", ["prevention_tips", "preventionTips"]],
        ["Triggers", ["triggers"]],
        ["Reinforcement", ["reinforcement_rewards", "reinforcementRewards"]],
        ["When to contact the clinician", ["when_to_contact_clinician", "whenToContactClinician"]],
        ["Related goals", ["linked_goals", "linkedGoals"]],
      ];
      behaviorFields.forEach(([label, keys]) => {
        const text = profileValue(field(behavior, ...keys));
        if (text) lines.push(`${label}: ${text.slice(0, 700)}`);
      });
    });
  }

  const goals = field(profile, "goals");
  if (Array.isArray(goals) && goals.length) {
    lines.push(`\n${isIndividual ? "Your goals" : "Treatment goals"}:`);
    goals.slice(0, 12).forEach(goal => {
      const title = field(goal, "title", "name") || "Goal";
      const description = field(goal, "description");
      lines.push(`- ${String(title).slice(0, 300)}${description ? `: ${String(description).slice(0, 600)}` : ""}`);
    });
  }

  const objectives = field(profile, "objectives");
  if (Array.isArray(objectives) && objectives.length) {
    lines.push("\nMeasurable objectives:");
    objectives.slice(0, 10).forEach(objective => {
      const target = field(objective, "target_behavior", "targetBehavior");
      const outcome = field(objective, "measurable_outcome", "measurableOutcome");
      const criteria = field(objective, "completion_criteria", "completionCriteria");
      const text = [target, outcome, criteria].filter(Boolean).join(" — ");
      if (text) lines.push(`- ${String(text).slice(0, 700)}`);
    });
  }

  const safetyProcedures = profileValue(field(profile, "safety_procedures", "safetyProcedures"));
  if (safetyProcedures) lines.push(`Safety procedures: ${safetyProcedures.slice(0, 1800)}`);
  const content = lines.join("\n").slice(0, 18000);
  return content ? `${heading}\n${content}\n\n` : "";
}

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
  const isClientSession = Boolean(user?.invite_token);
  let portalPlans = [], portalDocs = [], portalInterventions = [];
  let portalProfile = null;
  if (isClientSession) {
    const portalRes = await base44.functions.invoke("getClientPortalData", {
      child_id: childId,
      account_id: user.id,
      invite_token: user.invite_token,
    });
    if (!portalRes?.data) throw new Error("The latest child and document information could not be loaded.");
    if (portalRes?.data) {
      portalPlans = portalRes.data.plans || [];
      portalDocs = portalRes.data.documents || [];
      portalInterventions = portalRes.data.interventionPlans || [];
      portalProfile = portalRes.data.profile || null;
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
      const createdDate = field(doc, "created_date", "createdDate");
      const uploadDate = createdDate ? new Date(createdDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "Unknown date";
      const status = String(field(doc, "scan_status", "scanStatus") || "unknown").toLowerCase();
      const statusLabel = ["done", "scanned", "complete", "completed", "ready"].includes(status)
        ? "read by AI"
        : ["error", "failed"].includes(status)
          ? "could not be read"
          : ["pending", "scanning", "processing"].includes(status)
            ? "not yet read successfully"
            : "scan status unknown";
      context += `\nDocument: "${field(doc, "title", "file_name", "fileName") || "Untitled document"}" (${String(field(doc, "category") || "uncategorized").replace(/_/g, " ")}) — uploaded ${uploadDate}; scan status: ${statusLabel}\n`;
      const scanError = field(doc, "scan_error", "scanError");
      if (scanError) {
        context += `${["done", "scanned", "complete", "completed", "ready"].includes(status) ? "Safety note" : "Scan issue"}: ${scanError}\n`;
      }
      const notes = field(doc, "notes");
      if (notes) context += `Content/Notes: ${notes}\n`;
      const fileName = field(doc, "file_name", "fileName");
      if (fileName) context += `File: ${fileName}\n`;
    });
    context += `\n`;
  }

  if (isClientSession && portalProfile) {
    context += scannedProfileContext(portalProfile, documents, isIndividual);
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

  return {
    context,
    hasPlans: plans.length + interventions.length > 0,
    hasDocuments: documents.length > 0 || !!portalProfile,
    documentIds: [...new Set(documents
      .map(doc => field(doc, "id", "document_id"))
      .filter(id => typeof id === "string" && id.trim()))],
  };
}

async function generateResponse(userMessage, child, clinicianContext, conversationHistory, isIndividualClient) {
  const session = getClientSession();
  const result = await base44.integrations.Core.Chat({
    child_id: child?.id || child?.child_id,
    message: userMessage,
    prior_messages: conversationHistory.slice(-8).map((item) => item.content),
    client_session_token: user?.invite_token || session?.invite_token,
    client_session_type: user?.account_type || session?.account_type,
    mode: "chat",
  });
  return result?.answer ?? "";
}

export default function AIChat() {
  const { user } = useAuth();
  const [children, setChildren] = useState([]);
  const [selectedChildId, setSelectedChildId] = useState("");
  const [isIndividualClient, setIsIndividualClient] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
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
    setMessages([]);
  }, [selectedChildId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const sendMessage = async (text) => {
    const msg = text || input.trim();
    if (!msg || isLoading || !selectedChildId) return;
    setInput("");

    const userMsg = { role: "user", content: msg };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    const child = children.find(c => c.id === selectedChildId);
    try {
      const generatedResponse = await generateResponse(msg, child || { id: selectedChildId }, null, messages, isIndividualClient);
      if (!generatedResponse.trim()) throw new Error("Empty AI response");
      const response = `${generatedResponse.trim()}\n\n> ${CHAT_DISCLAIMER}`;
      setMessages(prev => [...prev, { role: "assistant", content: response }]);
      if (user && selectedChildId) {
        base44.entities.AIConversation.create({
          parent_id: user.id,
          child_id: selectedChildId,
          child_name: child?.child_name || "",
          question: msg,
          ai_response: response,
        }).catch(() => {});
        base44.entities.EngagementEvent.create({
          child_id: selectedChildId,
          clinician_id: child?.clinician_id,
          event_type: "ai_question",
          topic: "general_support_question",
        }).catch(() => {});
      }
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "The AI support service could not complete this response. Please try again. If someone is in immediate danger, contact 911 or local emergency services.",
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div className="np-ai-chat flex flex-col h-[100dvh] min-h-[100dvh] font-inter bg-background text-foreground">
      <div className="np-ai-chat-header px-4 sm:px-6 py-3 border-b border-border bg-card flex-shrink-0">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <Brain className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm">NeuroPath AI</p>
              <p className="text-xs text-muted-foreground">
                {selectedChildId ? "Server-checked child context" : "Select a child to begin"}
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

      <div className="np-ai-chat-scroll min-h-0 flex-1 overflow-y-auto px-3 sm:px-4 py-5">
        <div className="max-w-2xl mx-auto space-y-4">
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
              <div className="np-ai-chat-suggestions grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(isIndividualClient ? SUGGESTED_INDIVIDUAL : SUGGESTED).map(s => (
                  <button key={s} onClick={() => sendMessage(s)} disabled={isLoading || !selectedChildId} className="text-left px-4 py-3 rounded-xl bg-card border border-border hover:border-primary/50 hover:bg-muted/50 text-sm text-foreground transition-all disabled:opacity-50">
                    {s}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          <AnimatePresence>
            {messages.map((m, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`np-ai-chat-turn flex min-w-0 gap-2.5 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Brain className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
                <div className={`np-ai-chat-bubble min-w-0 max-w-[85%] break-words whitespace-normal [overflow-wrap:anywhere] rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === "user" ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-card border border-border rounded-tl-sm text-foreground"}`}>
                  {m.role === "user" ? (
                    <p>{m.content}</p>
                  ) : (
                    <div className="min-w-0 max-w-full break-words whitespace-normal [overflow-wrap:anywhere] prose prose-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-strong:font-semibold">
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

      <div className="np-ai-chat-composer flex-shrink-0 border-t border-border bg-card px-3 sm:px-4 py-3">
        <div className="max-w-2xl mx-auto flex gap-3 items-end">
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isIndividualClient ? "Ask anything — what to do right now, coping strategies, your treatment plan..." : "Ask anything — schedules, document summaries, session history, behavior help..."}
            rows={1}
            disabled={isLoading || !selectedChildId}
            className="flex-1 resize-none rounded-xl border-border text-sm max-h-32 min-h-[44px]"
          />
          <Button
            type="button"
            aria-label={isLoading ? "Sending message" : "Send message"}
            title="Send message"
            onClick={() => sendMessage()}
            disabled={isLoading || !selectedChildId || !input.trim()}
            className="h-11 min-w-[84px] px-3 gap-2 rounded-xl bg-primary hover:bg-primary/90 flex-shrink-0"
          >
            <Send className="w-4 h-4" aria-hidden="true" />
            <span>Send</span>
          </Button>
        </div>
        <p className="text-center text-[11px] leading-relaxed text-muted-foreground mt-2 max-w-2xl mx-auto">
          {isIndividualClient
            ? "AI uses only information the server verifies for your account and selected profile. It can make mistakes and does not replace your clinician."
            : "AI uses only information the server verifies for your account and selected child. It can make mistakes and does not replace your clinician."}
          {" "}If there is immediate danger, call 911 or your local emergency services.
        </p>
      </div>
    </div>
  );
}