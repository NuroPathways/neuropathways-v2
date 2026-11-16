import { useState } from "react";
import { Link } from "react-router-dom";
import { useSubmitClinicRequest } from "@workspace/api-client-react";
import { Button } from "@workspace/neuropathways-foundations/components/ui/button";
import { Card, CardContent } from "@workspace/neuropathways-foundations/components/ui/card";
import { Input } from "@workspace/neuropathways-foundations/components/ui/input";
import { Label } from "@workspace/neuropathways-foundations/components/ui/label";
import { PageHeader } from "@workspace/neuropathways-foundations/components/ui/page-header";
import { Shell } from "@/components/parentfree/common";
import { createRequestKey, getApiMessage } from "@/lib/clinicOnboarding";
import "@workspace/neuropathways-foundations/scoped.css";
import "../clinic-onboarding.css";

export default function ClinicRequest() {
  const [form, setForm] = useState({ clinicName: "", contactName: "", workEmail: "", website: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const submitRequest = useSubmitClinicRequest();

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    submitRequest.mutate({
      data: {
        ...form,
        website: form.website.trim() || null,
        requestKey: createRequestKey(),
      },
    }, {
      onSuccess: (result) => {
        setSuccess(result.message);
        setForm({ clinicName: "", contactName: "", workEmail: "", website: "" });
      },
      onError: (reason) => setError(getApiMessage(reason)),
    });
  };

  return (
    <Shell>
      <main className="np-foundations np-onboarding-page">
        <div className="np-onboarding-content">
          <PageHeader
            title="Register your clinic"
            context="NeuroPathways · Clinic onboarding"
            description="Submit a request for review. This does not create a clinic, administrator account, or access to client records."
            data-testid="header-clinic-request"
          />
          {error && <p role="alert" className="np-feedback np-feedback-error" data-testid="clinic-request-error">{error}</p>}
          {success && <p role="status" className="np-feedback" data-testid="clinic-request-success">{success}</p>}
          <Card className="np-onboarding-card">
            <CardContent>
              <form onSubmit={submit} className="np-form-grid" data-testid="form-clinic-request">
                <div className="np-field">
                  <Label htmlFor="request-clinic-name">Clinic name</Label>
                  <Input id="request-clinic-name" value={form.clinicName} onChange={update("clinicName")} minLength={2} maxLength={200} required data-testid="input-request-clinic-name" />
                </div>
                <div className="np-field">
                  <Label htmlFor="request-contact-name">Your name</Label>
                  <Input id="request-contact-name" value={form.contactName} onChange={update("contactName")} minLength={2} maxLength={160} required data-testid="input-request-contact-name" />
                </div>
                <div className="np-field">
                  <Label htmlFor="request-work-email">Work email</Label>
                  <Input id="request-work-email" type="email" value={form.workEmail} onChange={update("workEmail")} maxLength={254} required data-testid="input-request-work-email" />
                </div>
                <div className="np-field">
                  <Label htmlFor="request-website">Clinic website (optional)</Label>
                  <Input id="request-website" type="url" value={form.website} onChange={update("website")} maxLength={500} placeholder="https://example.org" data-testid="input-request-website" />
                </div>
                <p className="np-muted">Do not include client names, health information, or other patient details.</p>
                <Button type="submit" disabled={submitRequest.isPending} data-testid="button-submit-clinic-request">
                  {submitRequest.isPending ? "Submitting…" : "Submit clinic request"}
                </Button>
              </form>
            </CardContent>
          </Card>
          <p className="np-muted">A platform administrator reviews each request. If approved, they separately confirm who should receive the first administrator invitation.</p>
          <Link to="/" className="np-link" data-testid="link-clinic-request-home">Back to NeuroPathways</Link>
        </div>
      </main>
    </Shell>
  );
}
