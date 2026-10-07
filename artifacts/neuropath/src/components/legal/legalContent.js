// Informational copy only. These notices do not add consent requirements,
// authorize new processing, or change existing account and document workflows.
export const publicLegalContact = {
  businessName: "NeuroPathways",
  email: "NuroPathways@gmail.com",
};

export const legalContent = {
  "/terms": {
    title: "Terms of Use",
    description: "NeuroPathways account responsibilities, support limitations, acceptable use, and user-content information.",
    reviewDraft: true,
    contact: publicLegalContact,
    introduction: "These draft terms describe appropriate use of NeuroPathways and its limitations. They require operator and attorney review before being adopted as a binding agreement. Reading this page does not create a new acceptance record or change your existing consents.",
    sections: [
      ["Purpose and limits", [
        "NeuroPathways helps parents, authorized caregivers, clinicians, and clients organize behavior-support information. It is not a healthcare provider and does not independently diagnose conditions, prescribe treatment, or replace a licensed clinician.",
        "NeuroPathways is not an emergency service. If there is immediate danger, call 911 or your local emergency services. Do not wait for an AI answer or an in-app message.",
      ]],
      ["Adult-controlled accounts and child profiles", [
        "The service is intended for authorized adults managing their own information or information they are permitted to provide. Children under 13 should not create independent accounts. Any teen access should involve a parent, guardian, or authorized clinician as appropriate.",
        "Create a child profile only when you are authorized to do so. A first name or nickname can be used; avoid adding unnecessary identifying information. These usage statements do not mean that the current signup flow verifies an account holder's age or legal authority.",
        "Keep account credentials and access codes private. Account access does not establish permission to view or share every record about a child or another person.",
      ]],
      ["Support sources and AI", [
        "Starter support is general guidance based on common behavior patterns. It is not a clinician-approved treatment plan.",
        "Uploaded-plan support is based on information extracted from uploaded documents and is not clinician-reviewed unless the app identifies an actual clinician review. Review status applies to the identified information, not every answer or future change.",
        "AI-generated summaries and answers can be incomplete or wrong. Check original documents and consult your clinician for treatment and safety decisions. AI output is not a diagnosis or a guarantee of results.",
      ]],
      ["Uploads and acceptable use", [
        "Only upload documents or files you have permission to use and share. You retain your rights in your content; providing content allows the processing needed for the features you request, subject to applicable permissions and privacy notices.",
        "Do not upload malicious files, infringe others' rights, impersonate another person, harass users, bypass access controls, or use another person's credentials. Do not put unnecessary sensitive information in support requests.",
        "Access may need to be restricted or terminated for abuse, security risks, or legal obligations, subject to applicable law and the operator's reviewed procedures. This notice does not implement an automated termination or takedown system.",
      ]],
      ["Privacy and records", [
        "Read the Consumer Health Privacy Policy and the feature data notice for information about sensitive data and service providers. These terms do not certify HIPAA compliance or waive privacy rights that cannot legally be waived.",
        "A clinician or clinic may have separate obligations concerning its records. See Data requests for current limitations on account deletion and export.",
      ]],
      ["Billing and legal review", [
        "No active subscription checkout or automated billing integration was identified in the current app review. This page does not start a subscription or authorize a charge.",
        "Before introducing paid plans, the operator must publish reviewed pricing, renewal, trial, refund, and cancellation terms and implement the necessary consent and cancellation process.",
        "The operator has supplied NeuroPathways as its business name and the public contact shown on this page. Business mailing information, applicable jurisdiction, and any liability or dispute-resolution provisions still require confirmation and legal review. No new waiver of statutory rights is introduced by this draft.",
      ]],
    ],
  },
  "/privacy-details": {
    title: "Feature Data Notice",
    description: "How NeuroPathways accounts, documents, AI features, service providers, and engagement records handle information.",
    introduction: "This supplemental notice describes features found in the current implementation. It does not replace the existing Consumer Health Privacy Policy, change its version, or authorize new data collection or sharing.",
    sections: [
      ["Accounts and child profiles", [
        "Account features use information such as a name, email address or username, authentication credentials, and session information. Parent-created profiles use a child name or nickname and may include age, notes, selected behaviors, and goals. Clinician-managed records can contain additional care information.",
        "Child age, when entered, is profile information; it is not verification of the account holder's age. Only provide information you are authorized to share and that is needed for your use of the service.",
      ]],
      ["Documents, behavior records, and communications", [
        "Uploads can contain sensitive health, developmental, school, family, or behavioral information. The app stores document files and metadata and may extract text and generate summaries or support cards. Behavior logs, check-ins, goals, rewards, and messages can also contain sensitive information.",
        "Access depends on your account type, record ownership, existing permissions, and authorized sharing. Connecting to a clinician and sharing records are distinct actions; do not assume a record is clinician-reviewed simply because you connected an account.",
      ]],
      ["AI processing and providers", [
        "When you use AI chat or document scanning, the server may send your question, relevant care context, and document text or images to an AI service. The current implementation uses an Anthropic-compatible service through Replit AI Integrations.",
        "Database hosting and file storage also use service-provider infrastructure. Parent document storage uses Replit-managed App Storage accessed through a Google Cloud Storage client. This is different from displaying documents publicly or loading Google Fonts.",
        "Information is not confined to your browser during these features. Provider retention, model-training restrictions, processing locations, and applicable agreements must be confirmed by the operator; this notice does not certify them.",
      ]],
      ["Sessions, engagement records, and external fonts", [
        "Authentication uses session cookies or stored access tokens depending on the account and device. Some account types also create first-party engagement records about support use, check-ins, rewards, or topics for clinician-facing views. The existing client AI chat can use the first 80 characters of a question as an engagement topic, so these records can contain an excerpt of sensitive chat text. They can be linked to a client or child and are not necessarily anonymous.",
        "No third-party advertising pixel or session-replay SDK was identified in the reviewed application source. This is a source-code finding, not a guarantee about hosting-layer scripts or future releases.",
        "The web styles currently request Inter fonts from Google Fonts. Those requests disclose connection information such as an IP address to the font provider. This review has not changed font loading or added analytics preferences.",
      ]],
      ["Care limitations, retention, and requests", [
        "Starter support is general guidance, not a clinician-approved plan. Uploaded-plan support is based on uploaded documents; review labels apply only where review has occurred. NeuroPathways is not emergency care. If there is immediate danger, call 911 or your local emergency services.",
        "The current implementation does not provide a complete self-service account deletion or data export workflow. See Data requests and Contact for the public email channel and current processing limitations. Do not assume signing out deletes your records.",
        "Retention periods, backup deletion, incident-response arrangements, and the applicability of HIPAA or other health privacy laws require operator and legal review. No compliance certification is made.",
      ]],
    ],
  },
  "/contact": {
    title: "Contact",
    description: "NeuroPathways care, platform-support, privacy, and copyright contact information and current limitations.",
    contact: publicLegalContact,
    introduction: "Contact NeuroPathways using the public email address below for platform support, privacy questions, data requests, or copyright concerns. Opening the email link does not send a message automatically or confirm that a request has been received.",
    sections: [
      ["Immediate danger", [
        "If there is immediate danger, call 911 or your local emergency services. NeuroPathways and its AI features are not monitored emergency-response channels.",
      ]],
      ["Care and clinic records", [
        "For questions about your care, treatment plan, or records held by a clinician or clinic, contact that clinician or clinic using the contact information they provided. In-app clinician messaging, where available, is not a platform-operator privacy or copyright request channel.",
      ]],
      ["Platform, privacy, and copyright requests", [
        "Describe your question or request briefly and include only the account information needed to identify it. The public email address was supplied by the NeuroPathways operator; mailbox delivery and request handling have not been independently tested.",
        "Do not email passwords, access codes, payment details, or unnecessary health records. This page does not create an in-app support form, email delivery service, or designated copyright agent.",
      ]],
    ],
  },
  "/copyright": {
    title: "Copyright and Uploads",
    description: "Upload responsibilities and copyright notice information for NeuroPathways.",
    reviewDraft: true,
    contact: publicLegalContact,
    introduction: "Only upload documents or files you have permission to use. This draft describes upload responsibilities and information relevant to a copyright complaint; it does not establish DMCA safe-harbor eligibility.",
    sections: [
      ["Your uploads", [
        "You are responsible for ensuring that you may lawfully possess, upload, and share the documents you provide. Do not upload another person's records without authority or materials that infringe another person's rights. Upload only information needed for the support features you use.",
      ]],
      ["Copyright complaints", [
        "A copyright notice generally needs identification of the copyrighted work, identification and location of the allegedly infringing material, contact information, a good-faith statement that the disputed use is not authorized, a statement of accuracy and authority under penalty of perjury, and a physical or electronic signature.",
        "Send copyright questions or notices to the public email address on this page. Identify the relevant material without including unrelated health records. A reviewed notice-handling procedure remains necessary before this draft can serve as a complete operational complaint policy.",
      ]],
      ["Agent registration and review", [
        "No registered DMCA designated agent or completed notice/counter-notice process has been verified by this review. Publishing this page is not registration with the U.S. Copyright Office.",
        "The operator and its attorney must determine whether safe-harbor procedures apply and establish any required agent registration, notice review, uploader notification, counter-notice, and repeat-infringer procedures. No files are removed or access permissions changed by this notice.",
      ]],
    ],
  },
  "/data-requests": {
    title: "Data Requests and Deletion",
    description: "NeuroPathways account deletion and data export request information, current limitations, and clinic-retention considerations.",
    reviewDraft: true,
    contact: publicLegalContact,
    introduction: "The current app does not offer a complete self-service account deletion or data export process. This page is informational: it does not delete records, export data, or submit a request.",
    sections: [
      ["Request channel", [
        "Email the public address on this page to ask about access, export, correction, or deletion. State the request type and the email address or username associated with your account. Sending an email does not itself delete or export your records.",
        "Do not send your password, access code, or unnecessary health documents. The operator will need a reviewed identity-verification and request-handling process before releasing or deleting sensitive data. Mailbox delivery and processing timelines have not been independently verified.",
      ]],
      ["Records to consider", [
        "A full account request may involve child profiles, documents and extracted text, generated summaries and support cards, goals, behavior logs, check-ins, rewards, AI conversation records, messages, engagement records, and authorized sharing links.",
        "Signing out, removing a local app installation, or clearing a browser session does not delete server records. A delete control for a particular record, where available, should not be assumed to erase all related records or backups.",
      ]],
      ["Clinician records and retention", [
        "Some records may need to be retained by your clinician or clinic according to their policies and applicable law. Contact the clinic about records it holds; its retention responsibilities may differ from those of the platform.",
        "The operator must review retention periods, backup handling, deletion of uploaded files and derived data, and applicable request deadlines. This page does not guarantee immediate erasure, a particular deadline, or a new retention policy.",
      ]],
    ],
  },
};
