import { ReplitConnectors } from "@replit/connectors-sdk";

type ResetEmailInput = {
  recipient: string;
  resetUrl: string;
  accountType: "parent" | "clinician";
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]!);
}

export async function sendPasswordResetEmail({ recipient, resetUrl, accountType }: ResetEmailInput): Promise<void> {
  const from = process.env.RESEND_FROM_EMAIL
    || "NeuroPathways Password Reset <password-reset@nuropathways.com>";
  const safeUrl = escapeHtml(resetUrl);
  const accountLabel = accountType === "clinician" ? "clinician" : "parent";
  const text = [
    `We received a request to reset the password for your NeuroPathways ${accountLabel} account.`,
    "",
    `Reset your password: ${resetUrl}`,
    "",
    "This link expires in 30 minutes and can only be used once.",
    "If you did not request this, you can ignore this email.",
  ].join("\n");
  const html = [
    "<p>We received a request to reset the password for your NeuroPathways ",
    accountLabel,
    " account.</p>",
    `<p><a href="${safeUrl}">Reset your password</a></p>`,
    "<p>This link expires in 30 minutes and can only be used once.</p>",
    "<p>If you did not request this, you can ignore this email.</p>",
  ].join("");

  const connectors = new ReplitConnectors();
  const response = await connectors.proxy("resend", "/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: recipient,
      subject: "Reset your NeuroPathways password",
      text,
      html,
    }),
  });

  if (!response.ok) {
    throw Object.assign(new Error("Resend rejected the password reset email"), {
      statusCode: response.status,
    });
  }
}
