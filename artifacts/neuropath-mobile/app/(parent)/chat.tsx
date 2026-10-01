import React, { useState } from "react";
import { View } from "react-native";
import { parentChat } from "@workspace/api-client-react";
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
      const a = await parentChat(child.id, { message }, opts);
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
      {turns.map((t, i) => (
        <View key={i} style={{ gap: 8 }}>
          <Card style={{ backgroundColor: c.muted }}><T weight="semi">{t.q}</T></Card>
          <Card>
            <T>{t.a?.answer}</T>
            {t.a?.sourceReferences?.map((r, j) => <T key={j} size={13} color={c.secondary}>Source: {r.title}{r.excerpt ? ` - ${r.excerpt}` : ""}</T>)}
            <T size={12} color={c.mutedForeground}>{t.a?.disclaimer}</T>
          </Card>
        </View>
      ))}
    </Screen>
  );
}
