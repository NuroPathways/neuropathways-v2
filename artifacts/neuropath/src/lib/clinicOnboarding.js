export function createRequestKey() {
  return crypto.randomUUID();
}

export function getApiMessage(error) {
  const body = error?.data || error?.response?.data;
  return body?.error || body?.message || body?.detail || error?.message || "The request could not be completed. Try again.";
}

export function invitationDeliveryMessage(result) {
  const status = result?.invitation?.deliveryStatus;
  const apiMessage = result?.message?.trim() || "";
  if (status === "not_sent") {
    return /email not sent/i.test(apiMessage)
      ? apiMessage
      : `${apiMessage ? `${apiMessage} ` : ""}Invitation created, email not sent.`;
  }
  if (apiMessage) return apiMessage;
  if (status === "provider_accepted" || status === "test_sink_accepted") return "Invitation created and email delivery was accepted.";
  if (status === "failed") return "Invitation created, but email delivery failed.";
  return "Invitation state updated.";
}

export function formatDate(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Not available" : date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function statusLabel(value) {
  return String(value || "unknown").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
