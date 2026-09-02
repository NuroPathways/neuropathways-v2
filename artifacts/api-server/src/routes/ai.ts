import { Router } from "express";
import path from "node:path";
import fs from "node:fs/promises";
import { getAnthropicClient, CLAUDE_MODEL } from "../lib/anthropic";

const router = Router();

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

router.post("/ai/invoke-llm", async (req, res) => {
  const { prompt, model, file_urls, response_json_schema } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt required" });

  try {
    const client = await getAnthropicClient();

    // Build message content array — support text + local file content
    const contentParts: Array<{ type: string; text?: string; source?: any }> = [];

    // If file_urls are provided, try to inline local uploaded files as text
    if (file_urls && Array.isArray(file_urls) && file_urls.length > 0) {
      for (const url of file_urls) {
        try {
          // Support local /api/uploads/<filename> paths
          const match = String(url).match(/\/api\/uploads\/(.+)$/);
          if (match) {
            const filename = path.basename(match[1]);
            const filePath = path.join(UPLOAD_DIR, filename);
            const safePath = path.normalize(filePath);
            if (safePath.startsWith(UPLOAD_DIR)) {
              try {
                const fileContent = await fs.readFile(safePath);
                const ext = path.extname(filename).toLowerCase();
                const imageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
                if (imageExts.includes(ext)) {
                  const mimeMap: Record<string, string> = {
                    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                    ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp"
                  };
                  contentParts.push({
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: mimeMap[ext] ?? "image/jpeg",
                      data: fileContent.toString("base64"),
                    },
                  });
                } else {
                  // Non-image: treat as plain text (PDF/DOCX content approximation)
                  contentParts.push({ type: "text", text: `[File: ${filename}]\n${fileContent.toString("utf-8")}` });
                }
              } catch {
                contentParts.push({ type: "text", text: `[File ${url} could not be read]` });
              }
            }
          } else {
            // Public URL reference — include as text note (Claude can't fetch external URLs)
            contentParts.push({ type: "text", text: `[Document URL: ${url}]` });
          }
        } catch {
          // Skip files that can't be processed
        }
      }
    }

    // Build the final prompt, injecting schema instructions if provided
    let finalPrompt = prompt;
    if (response_json_schema) {
      finalPrompt += `\n\nIMPORTANT: Respond with ONLY valid JSON that exactly matches this JSON Schema (no markdown, no code blocks, no explanation — raw JSON only):\n${JSON.stringify(response_json_schema, null, 2)}`;
    }
    contentParts.push({ type: "text", text: finalPrompt });

    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      messages: [{ role: "user", content: contentParts as any }],
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

    res.json(rawText);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
