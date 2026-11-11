import React, { useState } from "react";
import { View } from "react-native";
import { aiChat } from "@workspace/api-client-react";
import type { ParentChatResult } from "@workspace/api-client-react";
import { Btn, Card, ErrorBox, Field, H, Screen, T, msg } from "@/components/ParentUi";
import { useParent } from "@/context/ParentContext";
import { useColors } from "@/hooks/useColors";

interface Turn { q: string; a?: ParentChatResult }

export default function Chat() {
  const c = useColors();
  const { child, opts } = useParent();
  const [text, setText] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ask = async () => {
    const message = text.trim();
    if (!message || !child) return;
    setBusy(true); setError("");
    try {
      const priorMessages = turns.slice(0, 4).reverse()
        .flatMap((turn) => [turn.q, turn.a?.answer].filter((value): value is string => Boolean(value)))
        .slice(-8);
      const a = await aiChat({ childId: child.id, message, priorMessages, mode: "chat" }, opts);
      setTurns((t) => [{ q: message, a }, ...t]);
      setText("");
    } catch (e) { setError(msg(e, "The answer could not load.")); } finally { setBusy(false); }
  };

  return (
    <Screen>
      <H sub="Answers use your child's card and documents. General guidance only.">Ask a question</H>
      <Field label="Your question" value={text} onChangeText={setText} multiline placeholder="What should I do if it starts again at bedtime?" testID="chat-input" />
      {error ? <ErrorBox message={error} /> : null}
      <Btn label="Ask" icon="send" onPress={ask} loading={busy} disabled={!text.trim() || !child} />
      {busy ? (
        <Card>
          <T size={13} weight="semi" color={c.secondary}>Preparing a response</T>
          {[0, 1, 2].map((line) => <View key={line} style={{ height: 10, width: line === 2 ? "58%" : "92%", borderRadius: 6, backgroundColor: c.muted }} />)}
        </Card>
      ) : null}
      {turns.map((t, i) => (
        <View key={i} style={{ gap: 7 }}>
          <Card style={{ backgroundColor: c.muted, borderWidth: 0, borderRadius: 12, padding: 13 }}>
            <T size={11} weight="semi" color={c.secondary}>Your question</T>
            <T weight="semi">{t.q}</T>
          </Card>
          <Card style={{ borderRadius: 12, padding: 14 }}>
            <T>{t.a?.answer}</T>
            {t.a?.sourceReferences?.length ? (
              <View style={{ borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8, gap: 5 }}>
                <T size={11} weight="semi" color={c.secondary}>References</T>
                {t.a.sourceReferences.map((r, j) => <T key={j} size={12} color={c.secondary}>{r.title}{r.excerpt ? ` · ${r.excerpt}` : ""}</T>)}
              </View>
            ) : null}
            <T size={12} color={c.mutedForeground}>{t.a?.disclaimer}</T>
          </Card>
        </View>
      ))}
    </Screen>
  );
}
