import { ArrowLeft, Brain, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

const sections = [
  {
    title: "1. Important Information About NeuroPathways",
    paragraphs: [
      "The current consumer version of NeuroPathways is designed for individuals who independently choose to use the platform.",
      "NeuroPathways is not a healthcare provider, health plan, or health insurance company. Unless NeuroPathways is specifically providing services on behalf of a healthcare provider or another HIPAA-regulated entity under an applicable agreement, use of the consumer application does not necessarily create a relationship governed by HIPAA.",
      "Health information voluntarily provided to a consumer application that is not acting for a HIPAA covered entity may not receive the same HIPAA protections that apply while the information is maintained by a healthcare provider. Other federal and state privacy, consumer-protection, health-information, breach-notification, and security laws may nevertheless apply.",
    ],
  },
  {
    title: "2. Information You Choose to Provide",
    paragraphs: [
      "NeuroPathways may collect account and contact information; information identifying the person receiving services; treatment, behavior intervention, safety, crisis, progress, and clinical plans or records; assessments; goals; caregiver observations; behavioral logs; communications; and other information or documents you choose to provide.",
      "Uploaded documents may contain highly sensitive medical, behavioral-health, mental-health, disability, developmental, family, or other personal information. Upload only information that you are legally authorized to possess and share.",
    ],
  },
  {
    title: "3. Parent, Guardian, and Authorized-User Responsibility",
    paragraphs: [
      "When uploading information concerning another person, including a minor child, you represent that you have the legal authority necessary to possess and provide that information to NeuroPathways.",
      "By uploading a document, you represent that it was lawfully obtained, that you are authorized to possess and upload it, that providing it does not knowingly violate another person's legal rights, and that you understand it may contain sensitive health information.",
      "NeuroPathways does not independently determine whether every parent, guardian, caregiver, or other user has a legal right to every uploaded document. Rights concerning minors' health information vary by circumstance and law.",
    ],
  },
  {
    title: "4. Your Choice to Share Health Information",
    paragraphs: [
      "Uploading health information is voluntary. By agreeing or continuing, you acknowledge that you are voluntarily providing potentially sensitive health information and that NeuroPathways must receive, store, and process it to provide requested features.",
      "Electronic storage and transmission involve security risks, and no electronic system can guarantee absolute security. This acknowledgment does not waive rights that cannot legally be waived or eliminate NeuroPathways' obligations under applicable privacy, security, consumer-protection, or breach-notification laws.",
    ],
  },
  {
    title: "5. How NeuroPathways Uses Uploaded Information",
    paragraphs: [
      "NeuroPathways may store and organize documents; identify and simplify information they contain; organize clinician-defined goals; identify behaviors, interventions, recommendations, and safety information; create support cards and summaries; maintain logs; let users review information; and share information with a clinician when the user affirmatively chooses to connect or share.",
      "NeuroPathways supports access to existing care information. It is not intended to independently diagnose conditions or replace licensed healthcare professionals.",
    ],
  },
  {
    title: "6. Artificial Intelligence and Automated Processing",
    paragraphs: [
      "Certain features may use automated systems or artificial intelligence to organize, extract, summarize, or present information in documents users provide. Applicable service providers must meet NeuroPathways' privacy and security requirements.",
      "NeuroPathways will not intentionally use identifiable private health documents to train public or general-purpose AI models unless legally sufficient notice and consent are provided where required. Automated output may contain errors; consult original documents and qualified professionals for treatment or safety decisions.",
    ],
  },
  {
    title: "7. Information Sharing",
    paragraphs: [
      "NeuroPathways does not sell users' private medical records or disclose private health documents to advertisers for targeted advertising based on their contents.",
      "Information may be disclosed as reasonably necessary to provide infrastructure, hosting, security, and document processing; comply with legal obligations; respond to valid process; protect security and integrity; investigate fraud, abuse, or incidents; protect individuals where legally permitted or required; or carry out another disclosure the user authorizes.",
    ],
  },
  {
    title: "8. Sharing Information With a Clinician",
    paragraphs: [
      "NeuroPathways does not automatically treat a healthcare provider as having access to a consumer account merely because the provider created an uploaded document. A user may affirmatively choose to connect a clinician or healthcare organization.",
      "Additional notices, permissions, authorizations, contractual terms, or Business Associate Agreements may apply when NeuroPathways provides services for a HIPAA covered healthcare provider.",
    ],
  },
  {
    title: "9. Security",
    paragraphs: [
      "No electronic service can guarantee that a security incident will never occur. NeuroPathways will maintain reasonable administrative, technical, and organizational safeguards appropriate to the sensitivity of the information it maintains.",
      "Safeguards may include access controls, authentication, encryption, logging, secure infrastructure, monitoring, backups, vulnerability management, employee access restrictions, and incident-response procedures. Users must protect their credentials and report suspected account compromise.",
    ],
  },
  {
    title: "10. Data Breaches and Security Incidents",
    paragraphs: [
      "If NeuroPathways discovers unauthorized acquisition, access, use, or disclosure of health information, it will investigate and take appropriate steps consistent with applicable law. Where legally required, it will notify affected individuals and governmental authorities.",
      "Acceptance of this policy does not waive legally required breach-notification rights.",
    ],
  },
  {
    title: "11. Data Retention and Deletion",
    paragraphs: [
      "NeuroPathways retains personal information as reasonably necessary to provide services, meet operational or legal requirements, resolve disputes, maintain security, and comply with law.",
      "Users may request deletion of eligible account information and documents. Some information may be retained where required by law or needed for security, fraud prevention, or another lawful retention requirement.",
    ],
  },
  {
    title: "12. Children and Minors",
    paragraphs: [
      "NeuroPathways may contain information about minors when an authorized parent, guardian, healthcare provider, or other legally authorized person uses the service. The consumer service is intended to be controlled by authorized adults unless a separate direct-minor service is expressly offered.",
      "Parents and guardians should not assume they are legally entitled to every category of a minor's medical or mental-health information. State law, minor-consent rules, court orders, confidentiality protections, or other circumstances may limit access.",
    ],
  },
  {
    title: "13. Third-Party Documents and Intellectual Property",
    paragraphs: [
      "Uploading a document does not transfer ownership to NeuroPathways. Users retain their rights and grant only those rights reasonably necessary to process information and provide requested services.",
      "Do not upload copyrighted, proprietary, licensed, or confidential materials you are not authorized to provide. Uploading patient-specific records does not grant NeuroPathways the right to redistribute a provider's proprietary materials.",
    ],
  },
  {
    title: "14. Changes to This Privacy Policy",
    paragraphs: [
      "NeuroPathways may update this policy as its service, technology, legal requirements, or privacy practices change. Material changes affecting sensitive health information will be communicated as required by applicable law.",
    ],
  },
  {
    title: "15. Contact and Privacy Requests",
    paragraphs: [
      "Questions, complaints, access requests, deletion requests, or privacy concerns may be directed to the NeuroPathways Privacy Team. Contact details will be provided through NeuroPathways account support.",
    ],
  },
];

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background font-inter">
      <header className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-5 py-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Brain className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <p className="font-semibold text-foreground">NeuroPathways</p>
            <p className="text-xs text-muted-foreground">Privacy Policy · Version 1.0</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-8">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="flex items-start gap-4 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">NeuroPathways Consumer Health Privacy Policy</h1>
            <p className="text-sm text-muted-foreground mt-2">Effective September 23, 2026 · Last updated September 23, 2026</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5 md:p-7 mb-5">
          <p className="text-sm text-foreground leading-7">
            NeuroPathways provides a behavioral-health support platform that allows parents, caregivers, clients, and other authorized users to upload health-related documents and convert their information into accessible summaries, goals, support information, and other tools.
          </p>
          <p className="text-sm text-foreground leading-7 mt-3">
            We recognize that behavioral and mental health information is highly sensitive. This policy explains what we collect, why we collect it, how it is used and protected, when it may be disclosed, and your choices.
          </p>
        </div>

        <div className="space-y-5">
          {sections.map(section => (
            <section key={section.title} className="bg-card border border-border rounded-2xl p-5 md:p-7">
              <h2 className="text-lg font-semibold text-foreground mb-3">{section.title}</h2>
              <div className="space-y-3">
                {section.paragraphs.map(paragraph => (
                  <p key={paragraph} className="text-sm text-muted-foreground leading-7">{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}