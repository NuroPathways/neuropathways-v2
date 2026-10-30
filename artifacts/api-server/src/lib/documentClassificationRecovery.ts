import { getAnthropicClient, CLAUDE_MODEL } from "./anthropic";
import { requestDocumentAi, requireCompleteDocumentAiResponse } from "./documentAi";
import { DOCUMENT_EXTRACTION_SYSTEM_GUIDANCE, documentExtractionsToolProperty } from "./documentExtractions";

/** Recover an omitted classification field from the real source, not fabricated
 * placeholders. Keep the already-read support profile separate from this pass.
 */
export async function recoverDocumentClassifications(content: any[]): Promise<unknown[]> {
  const anthropic = await getAnthropicClient();
  const response = await requestDocumentAi(options => anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 16_384,
    system: DOCUMENT_EXTRACTION_SYSTEM_GUIDANCE,
    tools: [{
      name: "save_document_classification",
      description: "Read the supplied sources and return source-cited document classification records only.",
      input_schema: {
        type: "object",
        properties: { document_extractions: documentExtractionsToolProperty() },
        required: ["document_extractions"],
      },
    }],
    tool_choice: { type: "tool", name: "save_document_classification" },
    messages: [{ role: "user", content }],
  }, options));
  requireCompleteDocumentAiResponse(response);
  const tool = response.content.find(block => block.type === "tool_use");
  const records = tool?.type === "tool_use"
    ? (tool.input as { document_extractions?: unknown }).document_extractions
    : undefined;
  if (!Array.isArray(records)) throw new Error("The document classification was incomplete.");
  return records;
}
