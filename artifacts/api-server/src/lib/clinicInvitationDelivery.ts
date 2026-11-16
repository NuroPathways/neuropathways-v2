export type ClinicInvitationDeliveryStatus =
  | "not_sent"
  | "test_sink_accepted"
  | "provider_accepted"
  | "failed";

export type ClinicInvitationEmail = {
  to: string;
  clinicName: string;
  roleLabel: string;
  invitationUrl: string;
};

export type ClinicInvitationMailer = (email: ClinicInvitationEmail) => Promise<ClinicInvitationDeliveryStatus>;

type MailerOptions = {
  nodeEnv?: string;
  sinkUrl?: string;
  invitationBaseUrl?: string;
  fetchImpl?: typeof fetch;
};

function isLoopbackSink(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "http:" ||
      url.hostname !== "127.0.0.1" ||
      !url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) return null;
    return url;
  } catch {
    return null;
  }
}

export function createClinicInvitationMailer(options: MailerOptions = {}): ClinicInvitationMailer {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  const sinkUrl = options.sinkUrl ?? process.env.NP_CLINIC_INVITATION_TEST_SINK_URL;
  const invitationBaseUrl = options.invitationBaseUrl ?? process.env.NP_CLINIC_INVITATION_BASE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sink = nodeEnv === "test" ? isLoopbackSink(sinkUrl) : null;

  return async (email) => {
    if (!sink || !invitationBaseUrl) return "not_sent";
    try {
      const response = await fetchImpl(sink, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: email.to,
          subject: `NeuroPathways clinic invitation — ${email.clinicName}`,
          text: `You have been invited as ${email.roleLabel} to ${email.clinicName}. Sign in or create your clinician account, then accept: ${email.invitationUrl}`,
        }),
        signal: AbortSignal.timeout(2_000),
      });
      return response.ok ? "test_sink_accepted" : "failed";
    } catch {
      return "failed";
    }
  };
}

export const sendClinicInvitationEmail = createClinicInvitationMailer();
