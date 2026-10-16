import { Router } from "express";
import { getAnthropicClient, CLAUDE_MODEL } from "../lib/anthropic";
import { validateClientSession } from "./entities-helpers";
import { requireMobileAuth } from "./mobile";
import { resolveParent } from "../lib/parentAuth";

const router = Router();

async function requireAiAuth(req: any, res: any, next: any) {
  if (req.user) return next();
  const parent = await resolveParent(req);
  if (parent) {
    req.parentAccount = parent;
    return next();
  }
  if (req.headers["x-mobile-token"]) {
    return requireMobileAuth(req, res, next);
  }
  const inviteToken = req.body?.invite_token;
  if (typeof inviteToken === "string" && await validateClientSession(inviteToken)) {
    return next();
  }
  return res.status(401).json({ error: "Authentication required" });
}

router.post("/ai/invoke-llm", requireAiAuth, async (req, res) => {
  const { prompt, model, file_urls, response_json_schema } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt required" });
  if (file_urls?.length) {
    return res.status(400).json({ error: "Files must be read through an authorized document workflow." });
  }

  try {
    const client = await getAnthropicClient();

    // Build the final prompt, injecting schema instructions if provided
    let finalPrompt = prompt;
    if (response_json_schema) {
      finalPrompt += `\n\nIMPORTANT: Respond with ONLY valid JSON that exactly matches this JSON Schema (no markdown, no code blocks, no explanation — raw JSON only):\n${JSON.stringify(response_json_schema, null, 2)}`;
    }

    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      messages: [{ role: "user", content: finalPrompt }],
    });

    const textContent = message.content.find((b: any) => b.type === "text");
    const rawText = (textContent as any)?.text ?? "";

    // If a JSON schema was requested, parse and return the JSON object
    if (response_json_schema) {
      try {
        // Strip any accidental markdown code fences
        const cleaned = rawText.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
        return res.json(JSON.parse(cleaned));
      } catch {
        // If Claude returned invalid JSON, return the raw text in the error
        return res.status(422).json({ error: "Model returned invalid JSON", raw: rawText });
      }
    }

    return res.json(rawText);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
