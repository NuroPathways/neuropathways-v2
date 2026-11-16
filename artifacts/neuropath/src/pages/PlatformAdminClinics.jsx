import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, RefreshCw, ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { useApprovePlatformClinicRequest, useCreatePlatformClinic, useDeclinePlatformClinicRequest, useListPlatformClinicRequests, useListPlatformClinics, useReissuePlatformClinicInvitation, useRevokePlatformClinicInvitation, getListPlatformClinicRequestsQueryKey, getListPlatformClinicsQueryKey } from "@workspace/api-client-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@workspace/neuropathways-foundations/components/ui/alert-dialog";
import { Button } from "@workspace/neuropathways-foundations/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/neuropathways-foundations/components/ui/card";
import { Input } from "@workspace/neuropathways-foundations/components/ui/input";
import { Label } from "@workspace/neuropathways-foundations/components/ui/label";
import { PageHeader, SectionHeading } from "@workspace/neuropathways-foundations/components/ui/page-header";
import { StatusBadge } from "@workspace/neuropathways-foundations/components/ui/status-badge";
import { Form } from "@/components/ui/form";
import { createRequestKey, formatDate, getApiMessage, invitationDeliveryMessage, statusLabel } from "@/lib/clinicOnboarding";
import "@workspace/neuropathways-foundations/scoped.css";
import "../clinic-onboarding.css";

function statusTone(status) {
  if (status === "active" || status === "accepted") return "support";
  if (status === "expired" || status === "revoked" || status === "failed") return "urgent";
  if (status === "pending") return "info";
  return "neutral";
}

export default function PlatformAdminClinics() {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [firstAdminEmails, setFirstAdminEmails] = useState({});
  const clinicsQuery = useListPlatformClinics({ query: { queryKey: getListPlatformClinicsQueryKey(), enabled: true } });
  const requestsQuery = useListPlatformClinicRequests({ query: { queryKey: getListPlatformClinicRequestsQueryKey(), enabled: true } });
  const createClinic = useCreatePlatformClinic();
  const approveRequest = useApprovePlatformClinicRequest();
  const declineRequest = useDeclinePlatformClinicRequest();
  const reissue = useReissuePlatformClinicInvitation();
  const revoke = useRevokePlatformClinicInvitation();
  const form = useForm({ defaultValues: { displayName: "", firstAdminEmail: "" } });
  const busy = createClinic.isPending || approveRequest.isPending || declineRequest.isPending || reissue.isPending || revoke.isPending;

  const refreshClinics = () => queryClient.invalidateQueries({ queryKey: getListPlatformClinicsQueryKey() });
  const refreshRequests = () => queryClient.invalidateQueries({ queryKey: getListPlatformClinicRequestsQueryKey() });
  const create = form.handleSubmit((values) => {
    setError(""); setFeedback("");
    createClinic.mutate({ data: { ...values, requestKey: createRequestKey() } }, {
      onSuccess: async (result) => {
        setFeedback(invitationDeliveryMessage(result));
        form.reset();
        await refreshClinics();
      },
      onError: (reason) => setError(getApiMessage(reason)),
    });
  });
  const runRequestAction = (action, request) => {
    setError(""); setFeedback("");
    if (action === "approve") {
      const firstAdminEmail = firstAdminEmails[request.requestId] || request.workEmail;
      approveRequest.mutate({ requestId: request.requestId, data: { firstAdminEmail } }, {
        onSuccess: async (result) => {
          setFeedback(invitationDeliveryMessage(result));
          await Promise.all([refreshClinics(), refreshRequests()]);
        },
        onError: (reason) => setError(getApiMessage(reason)),
      });
      return;
    }
    declineRequest.mutate({ requestId: request.requestId }, {
      onSuccess: async () => {
        setFeedback("Clinic request declined. No clinic or invitation was created.");
        await refreshRequests();
      },
      onError: (reason) => setError(getApiMessage(reason)),
    });
  };
  const runInvitationAction = (action, clinicId, invitationId) => {
    setError(""); setFeedback("");
    const options = {
      onSuccess: async (result) => {
        setFeedback(invitationDeliveryMessage(result));
        await refreshClinics();
      },
      onError: (reason) => setError(getApiMessage(reason)),
    };
    if (action === "reissue") reissue.mutate({ clinicId, invitationId, data: { requestKey: createRequestKey() } }, options);
    else revoke.mutate({ clinicId, invitationId }, { ...options, onSuccess: async (result) => {
      setRevokeTarget(null);
      setFeedback(result?.message || "Invitation revoked.");
      await refreshClinics();
    } });
  };

  return (
    <main className="np-foundations np-onboarding-page">
      <div className="np-onboarding-content">
        <PageHeader title="Clinic management" context="NeuroPathways · Platform administration" description="Review clinic requests, provision an approved clinic, and invite its first administrator. Platform access does not grant access to clinical records." data-testid="header-platform-clinics" />
        {feedback && <p role="status" className="np-feedback" data-testid="status-platform-feedback">{feedback}</p>}
        {error && <p role="alert" className="np-feedback np-feedback-error" data-testid="status-platform-error">{error}</p>}

        <section className="np-onboarding-section" aria-label="Clinic requests">
          <SectionHeading title="Clinic requests" description="A request creates no clinic, administrator, membership, or invitation until a platform administrator approves it." />
          {requestsQuery.isLoading ? <div className="np-skeleton-stack" role="status" data-testid="status-clinic-requests-loading"><div /><div /></div>
            : requestsQuery.isError ? <div className="np-empty-panel" role="alert" data-testid="status-clinic-requests-error"><p>Clinic requests could not be loaded.</p><Button variant="outline" onClick={() => requestsQuery.refetch()} data-testid="button-retry-clinic-requests">Try again</Button></div>
              : !requestsQuery.data?.requests?.length ? <div className="np-empty-panel" data-testid="empty-clinic-requests"><p>No pending clinic requests.</p></div>
                : <div className="np-list" data-testid="list-clinic-requests">
                  {requestsQuery.data.requests.map((request) => (
                    <Card key={request.requestId} className="np-onboarding-card" data-testid={`card-clinic-request-${request.requestId}`}>
                      <CardHeader className="np-clinic-heading">
                        <div>
                          <CardTitle className="np-card-title">{request.clinicName}</CardTitle>
                          <p className="np-muted">{request.contactName} · {request.workEmail}</p>
                          {request.website && <a href={request.website} target="_blank" rel="noreferrer" className="np-muted">{request.website}</a>}
                          <p className="np-muted">Received {formatDate(request.createdAt)}</p>
                        </div>
                        <StatusBadge tone="info">Pending review</StatusBadge>
                      </CardHeader>
                      <CardContent>
                        <div className="np-form-grid">
                          <div className="np-field">
                            <Label htmlFor={`first-admin-${request.requestId}`}>First administrator email</Label>
                            <Input
                              id={`first-admin-${request.requestId}`}
                              type="email"
                              value={firstAdminEmails[request.requestId] ?? request.workEmail}
                              onChange={(event) => setFirstAdminEmails((current) => ({ ...current, [request.requestId]: event.target.value }))}
                              disabled={busy}
                              data-testid={`input-request-first-admin-${request.requestId}`}
                            />
                            <p className="np-muted">Confirm the recipient before approval. The request contact is not automatically treated as a verified clinic administrator.</p>
                          </div>
                          <div className="np-row-actions">
                            <Button disabled={busy} onClick={() => runRequestAction("approve", request)} data-testid={`button-approve-clinic-request-${request.requestId}`}>Approve and invite</Button>
                            <Button variant="outline" disabled={busy} onClick={() => runRequestAction("decline", request)} data-testid={`button-decline-clinic-request-${request.requestId}`}>Decline request</Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>}
        </section>

        <Card className="np-onboarding-card">
          <CardHeader><CardTitle className="np-section-title">Create a clinic directly</CardTitle></CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={create} className="np-form-grid" data-testid="form-create-clinic">
                <div className="np-field">
                  <Label htmlFor="clinic-name">Clinic name</Label>
                  <Input id="clinic-name" data-testid="input-clinic-name" {...form.register("displayName", { required: "Enter a clinic name.", minLength: 2 })} placeholder="e.g. Northside Child Support" />
                  {form.formState.errors.displayName && <p className="np-field-error" data-testid="error-clinic-name">{form.formState.errors.displayName.message || "Clinic name must be at least two characters."}</p>}
                </div>
                <div className="np-field">
                  <Label htmlFor="first-admin-email">First administrator email</Label>
                  <Input id="first-admin-email" type="email" data-testid="input-first-admin-email" {...form.register("firstAdminEmail", { required: "Enter an email address." })} placeholder="admin@clinic.org" />
                  {form.formState.errors.firstAdminEmail && <p className="np-field-error" data-testid="error-first-admin-email">{form.formState.errors.firstAdminEmail.message}</p>}
                </div>
                <Button type="submit" disabled={busy} data-testid="button-create-clinic"><Building2 aria-hidden="true" />{createClinic.isPending ? "Creating clinic…" : "Create clinic and invite"}</Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <section className="np-onboarding-section" aria-label="Clinics and first-admin invitations">
          <SectionHeading title="Clinics and first-admin invitations" description="Invitation status and delivery are shown separately." />
          {clinicsQuery.isLoading ? <div className="np-skeleton-stack" role="status" data-testid="status-clinics-loading"><div /><div /><div /></div>
            : clinicsQuery.isError ? <div className="np-empty-panel" role="alert" data-testid="status-clinics-error"><p>Clinic information could not be loaded.</p><Button variant="outline" onClick={() => clinicsQuery.refetch()} data-testid="button-retry-clinics">Try again</Button></div>
              : !clinicsQuery.data?.clinics?.length ? <div className="np-empty-panel" data-testid="empty-clinics"><Building2 aria-hidden="true" /><h3>No clinics yet</h3><p>Create a clinic to begin setting up access.</p></div>
                : <div className="np-list" data-testid="list-platform-clinics">
                  {clinicsQuery.data.clinics.map((clinic) => (
                    <Card key={clinic.clinicId} className="np-onboarding-card" data-testid={`card-clinic-${clinic.clinicId}`}>
                      <CardHeader className="np-clinic-heading">
                        <div><CardTitle className="np-card-title" data-testid={`text-clinic-name-${clinic.clinicId}`}>{clinic.clinicName}</CardTitle><p className="np-muted" data-testid={`text-clinic-created-${clinic.clinicId}`}>Created {formatDate(clinic.createdAt)}</p></div>
                        <StatusBadge tone={statusTone(clinic.status)} data-testid={`status-clinic-${clinic.clinicId}`}>{statusLabel(clinic.status)}</StatusBadge>
                      </CardHeader>
                      <CardContent className="np-invitation-list">
                        {clinic.invitations.length === 0 ? <p className="np-muted">No invitations recorded.</p> : clinic.invitations.map((invitation) => (
                          <div className="np-invitation-row" key={invitation.id} data-testid={`row-invitation-${invitation.id}`}>
                            <div className="np-invitation-copy">
                              <strong data-testid={`text-invitation-email-${invitation.id}`}>{invitation.invitedEmail}</strong>
                              <span data-testid={`text-invitation-role-expiry-${invitation.id}`}>{statusLabel(invitation.role)} · Created {formatDate(invitation.createdAt)} · Expires {formatDate(invitation.expiresAt)}</span>
                              <span data-testid={`text-platform-invitation-attempt-${invitation.id}`}>Last delivery attempt: {invitation.deliveryAttemptedAt ? formatDate(invitation.deliveryAttemptedAt) : "None recorded"}</span>
                              <div className="np-badges">
                                <StatusBadge tone={statusTone(invitation.status)} data-testid={`status-invitation-${invitation.id}`}>{statusLabel(invitation.status)}</StatusBadge>
                                <StatusBadge tone="outline" data-testid={`status-delivery-${invitation.id}`}>Delivery: {statusLabel(invitation.deliveryStatus)}</StatusBadge>
                              </div>
                            </div>
                            {invitation.status === "pending" && <div className="np-row-actions">
                              <Button variant="outline" disabled={busy} onClick={() => runInvitationAction("reissue", clinic.clinicId, invitation.id)} data-testid={`button-reissue-${invitation.id}`}><RefreshCw aria-hidden="true" /> Reissue</Button>
                              <Button variant="destructive" disabled={busy} onClick={() => setRevokeTarget({ clinicId: clinic.clinicId, invitationId: invitation.id, email: invitation.invitedEmail, clinicName: clinic.clinicName })} data-testid={`button-revoke-${invitation.id}`}>Revoke</Button>
                            </div>}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  ))}
                </div>}
        </section>
        <p className="np-admin-note"><ShieldCheck aria-hidden="true" /> Platform administration access is enforced by the server. This page does not change staff roles.</p>
      </div>
      <AlertDialog open={Boolean(revokeTarget)} onOpenChange={(open) => { if (!open && !revoke.isPending) setRevokeTarget(null); }}>
        <AlertDialogContent className="np-foundations">
          <AlertDialogHeader><AlertDialogTitle>Revoke this invitation?</AlertDialogTitle><AlertDialogDescription>{revokeTarget ? `The invitation for ${revokeTarget.email} at ${revokeTarget.clinicName} will no longer be usable.` : "This invitation will no longer be usable."}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoke.isPending} data-testid="button-cancel-revoke-platform-invitation">Keep invitation</AlertDialogCancel>
            <AlertDialogAction disabled={revoke.isPending} onClick={(event) => { event.preventDefault(); if (revokeTarget) runInvitationAction("revoke", revokeTarget.clinicId, revokeTarget.invitationId); }} data-testid="button-confirm-revoke-platform-invitation">{revoke.isPending ? "Revoking…" : "Revoke invitation"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
