export function getInviteDeliveryStatus(responseData) {
  if (responseData?.delivery_status === "delivered") return "delivered";
  if (responseData?.delivery_status === "unavailable") return "unavailable";
  return "unconfirmed";
}

export function getFamilyInviteDeliveryMessage(status, email) {
  if (status === "delivered") return `Invitation email delivered to ${email}.`;
  if (status === "unavailable") {
    return "The invite was refreshed, but no email was sent because email delivery is not configured.";
  }
  return "The invite was refreshed, but email delivery was not confirmed.";
}
