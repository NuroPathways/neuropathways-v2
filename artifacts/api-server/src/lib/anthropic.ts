import type AnthropicSDK from "@anthropic-ai/sdk";

// Model used across the app. Kept at sonnet-4-5 (supported by AI integrations);
// do not eagerly upgrade without an explicit request.
export const CLAUDE_MODEL = "claude-sonnet-4-5";

// Returns a configured Anthropic client. The Replit AI Integrations proxy sets
// AI_INTEGRATIONS_ANTHROPIC_API_KEY (a dummy key) and AI_INTEGRATIONS_ANTHROPIC_BASE_URL.
// A bare `new Anthropic()` would look for ANTHROPIC_API_KEY (unset) and throw, which
// is what made the document scan fail. Always pass both apiKey and baseURL.
export async function getAnthropicClient(): Promise<AnthropicSDK> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  return new Anthropic({
    apiKey:
      process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || undefined,
  });
}
