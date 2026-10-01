import React, { useState } from "react";
import { router } from "expo-router";
import { createParentChild } from "@workspace/api-client-react";
import { Btn, ErrorBox, Field, H, Screen, msg } from "@/components/ParentUi";
import { useParent } from "@/context/ParentContext";

export default function AddChild() {
  const { opts, upsertChild, selectChild } = useParent();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const go = async () => {
    if (!name.trim()) return setError("Enter a nickname.");
    setBusy(true); setError("");
    try {
      const c = await createParentChild({ name: name.trim() }, opts);
      upsertChild(c);
      await selectChild(c.id);
      router.replace("/parent-quickstart" as never);
    } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  };
  return (
    <Screen>
      <H sub="You will pick a behavior and goal next.">Add another child</H>
      <Field label="Nickname" value={name} onChangeText={setName} />
      {error ? <ErrorBox message={error} /> : null}
      <Btn label="Continue" onPress={go} loading={busy} />
    </Screen>
  );
}
