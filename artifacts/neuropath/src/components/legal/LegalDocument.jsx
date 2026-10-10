import { FileText } from "lucide-react";
import { Link } from "react-router-dom";
import BrandMark from "@/components/brand/BrandMark";
import LegalLinks from "./LegalLinks";
import useLegalMetadata from "./useLegalMetadata";
import BackButton from "@/components/navigation/BackButton";

export default function LegalDocument({ document: content }) {
  useLegalMetadata(content.title, content.description);
  return (
    <div className="min-h-screen bg-background font-inter">
      <header className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-5 py-5">
          <Link to="/" className="inline-flex items-center gap-3 font-semibold text-foreground">
            <BrandMark size={40} />
            NeuroPathways
          </Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-5 py-8">
        {content.title === "Data Requests and Deletion" && <BackButton />}
        <div className="flex items-start gap-4 mb-6">
          <FileText className="w-8 h-8 text-primary flex-shrink-0" aria-hidden="true" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">{content.title}</h1>
            <p className="text-sm text-muted-foreground mt-2">Prepared for review October 7, 2026</p>
          </div>
        </div>
        {content.reviewDraft && <p className="border border-amber-200 bg-amber-50 text-amber-900 rounded-xl p-4 text-sm mb-5">Draft for operator and attorney review. Publishing contact information does not establish reviewed request-handling procedures or legal compliance.</p>}
        {content.contact && (
          <section aria-label="Public contact" className="bg-card border border-border rounded-2xl p-5 mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-2">Public contact</h2>
            <p className="text-sm text-foreground">{content.contact.businessName}</p>
            <a href={`mailto:${content.contact.email}`} className="text-sm text-primary underline underline-offset-4 break-all">{content.contact.email}</a>
          </section>
        )}
        {content.title === "Data Requests and Deletion" && (
          <section className="bg-card border border-border rounded-2xl p-5 mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-2">Signed-in account holders</h2>
            <p className="text-sm text-muted-foreground leading-6 mb-3">Parent and clinician account holders can sign in to submit a tracked request. Submitting does not delete records automatically.</p>
            <Link to="/DataRequests" className="text-sm text-primary underline underline-offset-4">Open data request form</Link>
          </section>
        )}
        <p className="text-sm text-foreground leading-7 mb-6">{content.introduction}</p>
        <div className="space-y-5">
          {content.sections.map(([heading, paragraphs]) => (
            <section key={heading} className="bg-card border border-border rounded-2xl p-5 md:p-7">
              <h2 className="text-lg font-semibold text-foreground mb-3">{heading}</h2>
              <div className="space-y-3">{paragraphs.map((paragraph) => <p key={paragraph} className="text-sm text-muted-foreground leading-7">{paragraph}</p>)}</div>
            </section>
          ))}
        </div>
        <footer className="border-t border-border mt-8 pt-6"><LegalLinks /></footer>
      </main>
    </div>
  );
}
