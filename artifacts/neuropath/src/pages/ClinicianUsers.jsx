import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MailPlus, RefreshCw, Users } from "lucide-react";
import { useForm } from "react-hook-form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@workspace/neuropathways-foundations/components/ui/alert-dialog";
import {
  getGetManagedClinicClientsQueryKey,
  getListManagedClinicStaffQueryKey,
  useGetManagedClinicClients,
  useInviteClinicClinician,
  useListManagedClinicStaff,
  useReassignClinicClient,
  useReissueClinicStaffInvitation,
  useRevokeClinicStaffAccess,
  useRevokeClinicStaffInvitation,
} from "@workspace/api-client-react";
import { Button } from "@workspace/neuropathways-foundations/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/neuropathways-foundations/components/ui/card";
import { Input } from "@workspace/neuropathways-foundations/components/ui/input";
import { Label } from "@workspace/neuropathways-foundations/components/ui/label";
import { PageHeader, SectionHeading } from "@workspace/neuropathways-foundations/components/ui/page-header";
import { StatusBadge } from "@workspace/neuropathways-foundations/components/ui/status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/neuropathways-foundations/components/ui/select";
import { Form } from "@/components/ui/form";
import { useAuth } from "@/lib/AuthContext";
import { createRequestKey, formatDate, getApiMessage, invitationDeliveryMessage, statusLabel } from "@/lib/clinicOnboarding";
import "@workspace/neuropathways-foundations/scoped.css";
import "../clinic-onboarding.css";

function toneFor(status) {
  if (status === "active" || status === "accepted") return "support";
  if (status === "pending") return "info";
  if (status === "revoked" || status === "expired" || status === "failed") return "urgent";
  return "neutral";
}

export default function ClinicianUsers() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedClinicId, setSelectedClinicId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [removeStaffTarget, setRemoveStaffTarget] = useState(null);
  const [staffSearch, setStaffSearch] = useState("");
  const [staffStatus, setStaffStatus] = useState("all");
  const [invitationStatus, setInvitationStatus] = useState("all");
  const enabled = Boolean(user?.id && ["clinician", "clinic_admin"].includes(user?.app_role || user?.appRole));
  const staffQuery = useListManagedClinicStaff({ query: { queryKey: getListManagedClinicStaffQueryKey(), enabled } });
  const clinics = staffQuery.data?.clinics || [];
  const selectedClinic = clinics.find((clinic) => clinic.clinicId === selectedClinicId) || null;
  const clientsQuery = useGetManagedClinicClients(selectedClinicId || "", {
    query: { queryKey: getGetManagedClinicClientsQueryKey(selectedClinicId || ""), enabled: Boolean(selectedClinicId) },
  });
  const clients = clientsQuery.data?.clients || [];
  const activeClinicians = useMemo(
    () => (selectedClinic?.staff || []).filter((person) => person.status === "active" && person.roles.includes("treating_clinician")),
    [selectedClinic],
  );
  const filteredStaff = useMemo(() => {
    const search = staffSearch.trim().toLowerCase();
    return (selectedClinic?.staff || []).filter((person) => {
      const textMatch = !search || [person.displayName, person.email, ...(person.roles || [])]
        .some((value) => String(value || "").toLowerCase().includes(search));
      return textMatch && (staffStatus === "all" || person.status === staffStatus);
    });
  }, [selectedClinic, staffSearch, staffStatus]);
  const filteredInvitations = useMemo(() => {
    const search = staffSearch.trim().toLowerCase();
    return (selectedClinic?.invitations || []).filter((invitation) => {
      const textMatch = !search || [invitation.invitedEmail, invitation.role, invitation.status, invitation.deliveryStatus]
        .some((value) => String(value || "").toLowerCase().includes(search));
      return textMatch && (invitationStatus === "all" || invitation.status === invitationStatus);
    });
  }, [selectedClinic, staffSearch, invitationStatus]);
  const invite = useInviteClinicClinician();
  const reissue = useReissueClinicStaffInvitation();
  const revoke = useRevokeClinicStaffInvitation();
  const revokeStaffAccess = useRevokeClinicStaffAccess();
  const reassign = useReassignClinicClient();
  const inviteForm = useForm({ defaultValues: { invitedEmail: "" } });
  const busy = invite.isPending || reissue.isPending || revoke.isPending || revokeStaffAccess.isPending || reassign.isPending;

  useEffect(() => {
    if (clinics.length && !clinics.some((clinic) => clinic.clinicId === selectedClinicId)) setSelectedClinicId(clinics[0].clinicId);
  }, [clinics, selectedClinicId]);

  const refreshStaff = () => queryClient.invalidateQueries({ queryKey: getListManagedClinicStaffQueryKey() });
  const refreshClients = () => selectedClinicId && queryClient.invalidateQueries({ queryKey: getGetManagedClinicClientsQueryKey(selectedClinicId) });
  const inviteClinician = inviteForm.handleSubmit(({ invitedEmail }) => {
    if (!selectedClinicId) return;
    setFeedback(""); setError("");
    invite.mutate({ clinicId: selectedClinicId, data: { invitedEmail, requestKey: createRequestKey() } }, {
      onSuccess: async (result) => {
        setFeedback(invitationDeliveryMessage(result));
        inviteForm.reset();
        await refreshStaff();
      },
      onError: (reason) => setError(getApiMessage(reason)),
    });
  });
  const handleInvitationAction = (kind, invitationId) => {
    if (!selectedClinicId) return;
    setFeedback(""); setError("");
    const options = {
      onSuccess: async (result) => { setFeedback(invitationDeliveryMessage(result)); await refreshStaff(); },
      onError: (reason) => setError(getApiMessage(reason)),
    };
    if (kind === "reissue") reissue.mutate({ clinicId: selectedClinicId, invitationId, data: { requestKey: createRequestKey() } }, options);
    else revoke.mutate({ clinicId: selectedClinicId, invitationId }, { ...options, onSuccess: async (result) => {
      setRevokeTarget(null);
      setFeedback(result?.message || "Invitation revoked.");
      await refreshStaff();
    } });
  };
  const assignClient = (childId, clinicianId) => {
    if (!selectedClinicId || !clinicianId) return;
    setFeedback(""); setError("");
    reassign.mutate({ clinicId: selectedClinicId, childId, data: { clinicianId } }, {
      onSuccess: async () => { setFeedback("Client assignment updated."); await refreshClients(); },
      onError: (reason) => setError(getApiMessage(reason)),
    });
  };
  const removeStaff = () => {
    if (!selectedClinicId || !removeStaffTarget) return;
    setFeedback(""); setError("");
    revokeStaffAccess.mutate({ clinicId: selectedClinicId, staffUserId: removeStaffTarget.userId }, {
      onSuccess: async () => {
        setRemoveStaffTarget(null);
        setFeedback("Staff access revoked. Existing sessions were signed out; clinical records were retained.");
        await Promise.all([refreshStaff(), refreshClients()]);
      },
      onError: (reason) => setError(getApiMessage(reason)),
    });
  };

  return (
    <main className="np-foundations np-onboarding-page">
      <div className="np-onboarding-content">
        <PageHeader title="Clinic management" context="NeuroPathways · Clinic administration" description="View clinic membership, manage staff invitations, and maintain client assignments. This page does not grant clinical record access or allow role editing." data-testid="header-clinician-users" />
        {feedback && <p role="status" className="np-feedback" data-testid="status-clinic-team-feedback">{feedback}</p>}
        {error && <p role="alert" className="np-feedback np-feedback-error" data-testid="status-clinic-team-error">{error}</p>}

        {staffQuery.isLoading ? <div className="np-skeleton-stack" role="status" data-testid="status-clinic-staff-loading"><div /><div /><div /></div>
          : staffQuery.isError ? <div className="np-empty-panel" role="alert" data-testid="status-clinic-staff-error"><p>Clinic team information could not be loaded.</p><Button variant="outline" onClick={() => staffQuery.refetch()} data-testid="button-retry-clinic-team">Try again</Button></div>
            : !clinics.length ? <div className="np-empty-panel" data-testid="empty-clinic-team"><Users aria-hidden="true" /><h2>No clinic administration access</h2><p>Clinic staff and client assignments are available to clinic administrators. Contact your clinic administrator if you need access.</p></div>
              : <>
                <section className="np-clinic-selector" id="overview">
                  <h2 className="np-section-title">Clinic overview</h2>
                  <Label htmlFor="clinic-selector">Clinic</Label>
                  <Select value={selectedClinicId} onValueChange={setSelectedClinicId}>
                    <SelectTrigger id="clinic-selector" className="np-select-trigger" data-testid="select-managed-clinic"><SelectValue placeholder="Choose a clinic" /></SelectTrigger>
                    <SelectContent>{clinics.map((clinic) => <SelectItem key={clinic.clinicId} value={clinic.clinicId}>{clinic.clinicName}</SelectItem>)}</SelectContent>
                  </Select>
                  <div className="np-field">
                    <Label htmlFor="staff-search">Search staff and invitations</Label>
                    <Input id="staff-search" value={staffSearch} onChange={(event) => setStaffSearch(event.target.value)} placeholder="Name, email, role, or status" data-testid="input-search-clinic-staff" />
                  </div>
                </section>

                {selectedClinic && <>
                  <Card className="np-onboarding-card" id="staff">
                    <CardHeader><CardTitle className="np-section-title">Invite a treating clinician</CardTitle></CardHeader>
                    <CardContent>
                      <Form {...inviteForm}>
                        <form onSubmit={inviteClinician} className="np-inline-form" data-testid="form-invite-clinician">
                          <div className="np-field"><Label htmlFor="clinician-email">Work email</Label><Input id="clinician-email" type="email" required placeholder="clinician@clinic.org" data-testid="input-clinician-email" {...inviteForm.register("invitedEmail", { required: "Enter a work email address." })} /></div>
                          <Button type="submit" disabled={busy} data-testid="button-invite-clinician"><MailPlus aria-hidden="true" />{invite.isPending ? "Creating invitation…" : "Invite clinician"}</Button>
                        </form>
                      </Form>
                      <p className="np-muted">The invitation creates a treating-clinician role only. Administrative roles are not available here.</p>
                    </CardContent>
                  </Card>

                  <section className="np-onboarding-section">
                    <div className="np-filter-row">
                      <SectionHeading title="Clinic staff" description="Staff roles and account states are provided by the server." />
                      <Select value={staffStatus} onValueChange={setStaffStatus}>
                        <SelectTrigger className="np-select-trigger" aria-label="Filter clinic staff by status" data-testid="select-staff-status"><SelectValue /></SelectTrigger>
                        <SelectContent>{["all", "active", "pending", "suspended", "revoked"].map((status) => <SelectItem key={status} value={status}>{status === "all" ? "All staff statuses" : statusLabel(status)}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    {filteredStaff.length ? <div className="np-people-list" data-testid={`list-clinic-staff-${selectedClinic.clinicId}`}>
                       {filteredStaff.map((person) => {
                         const matchingInvitations = selectedClinic.invitations
                           .filter((invitation) => invitation.invitedEmail.toLowerCase() === String(person.email || "").toLowerCase())
                           .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                         const latestInvitation = matchingInvitations[0];
                         return <div className="np-person-row" key={person.userId} data-testid={`row-managed-staff-${person.userId}`}>
                         <div className="np-person-copy">
                           <strong data-testid={`text-managed-staff-name-${person.userId}`}>{person.displayName}</strong>
                           {person.email && <span data-testid={`text-managed-staff-email-${person.userId}`}>{person.email}</span>}
                           <span data-testid={`text-managed-staff-roles-${person.userId}`}>{person.roles.map(statusLabel).join(", ")}</span>
                           <span>Member since {formatDate(person.membershipCreatedAt)}</span>
                           <span data-testid={`text-managed-staff-invitation-history-${person.userId}`}>{latestInvitation ? `Recorded invitation: ${statusLabel(latestInvitation.status)}` : "No recorded invitation history."}</span>
                         </div>
                         <div className="np-row-actions">
                           <StatusBadge tone={toneFor(person.status)} data-testid={`status-managed-staff-${person.userId}`}>{statusLabel(person.status)}</StatusBadge>
                           {person.status === "active" && person.roles.includes("treating_clinician") && <Button variant="destructive" disabled={busy} onClick={() => setRemoveStaffTarget({ userId: person.userId, displayName: person.displayName })} data-testid={`button-remove-clinician-${person.userId}`}>Remove access</Button>}
                         </div>
                       </div>;
                       })}
                     </div> : <div className="np-empty-panel" data-testid="empty-clinic-staff"><p>No staff match these filters.</p></div>}
                  </section>

                  <section className="np-onboarding-section" id="invitations">
                    <div className="np-filter-row">
                      <SectionHeading title="Staff invitation history" description="Invitation status, delivery status, creation date, actual delivery attempt, and expiry are tracked separately." />
                      <Select value={invitationStatus} onValueChange={setInvitationStatus}>
                        <SelectTrigger className="np-select-trigger" aria-label="Filter invitations by status" data-testid="select-invitation-status"><SelectValue /></SelectTrigger>
                        <SelectContent>{["all", "pending", "accepted", "expired", "revoked", "superseded"].map((status) => <SelectItem key={status} value={status}>{status === "all" ? "All invitation statuses" : statusLabel(status)}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    {filteredInvitations.length ? <div className="np-invitation-list" data-testid={`list-pending-invitations-${selectedClinic.clinicId}`}>
                      {filteredInvitations.map((invitation) => <div className="np-invitation-row" key={invitation.id} data-testid={`row-staff-invitation-${invitation.id}`}>
                        <div className="np-invitation-copy">
                          <strong data-testid={`text-staff-invitation-email-${invitation.id}`}>{invitation.invitedEmail}</strong>
                          <span>{statusLabel(invitation.role)} · Created {formatDate(invitation.createdAt)} · Expires {formatDate(invitation.expiresAt)}</span>
                          <span data-testid={`text-staff-invitation-attempt-${invitation.id}`}>Last delivery attempt: {invitation.deliveryAttemptedAt ? formatDate(invitation.deliveryAttemptedAt) : "None recorded"}</span>
                          <div className="np-badges"><StatusBadge tone={toneFor(invitation.status)} data-testid={`status-staff-invitation-${invitation.id}`}>{statusLabel(invitation.status)}</StatusBadge><StatusBadge tone="outline" data-testid={`status-staff-delivery-${invitation.id}`}>Delivery: {statusLabel(invitation.deliveryStatus)}</StatusBadge></div>
                        </div>
                        <div className="np-row-actions">
                          {invitation.status === "pending" && <>
                            <Button variant="outline" disabled={busy} onClick={() => handleInvitationAction("reissue", invitation.id)} data-testid={`button-reissue-staff-${invitation.id}`}><RefreshCw aria-hidden="true" /> Reissue</Button>
                            <Button variant="destructive" disabled={busy} onClick={() => setRevokeTarget({ invitationId: invitation.id, email: invitation.invitedEmail })} data-testid={`button-revoke-staff-${invitation.id}`}>Revoke</Button>
                          </>}
                        </div>
                      </div>)}
                    </div> : <div className="np-empty-panel" data-testid="empty-pending-invitations"><p>No invitations match these filters.</p></div>}
                  </section>

                  <section className="np-onboarding-section" id="assignments">
                    <SectionHeading title="Client assignments" description="Assignments are limited to active treating clinicians in this clinic." />
                    {clientsQuery.isLoading ? <div className="np-skeleton-stack" role="status" data-testid="status-clients-loading"><div /><div /></div>
                      : clientsQuery.isError ? <div className="np-empty-panel" role="alert" data-testid="status-clients-error"><p>Clinic client assignments could not be loaded.</p><Button variant="outline" onClick={() => clientsQuery.refetch()} data-testid="button-retry-clients">Try again</Button></div>
                        : clients.length ? <div className="np-people-list" data-testid={`list-clinic-clients-${selectedClinic.clinicId}`}>
                          {clients.map((client) => <div className="np-client-row" key={client.childId} data-testid={`row-clinic-client-${client.childId}`}>
                            <div className="np-person-copy"><strong data-testid={`text-clinic-client-name-${client.childId}`}>{client.displayName}</strong><span data-testid={`text-clinic-client-assignee-${client.childId}`}>{activeClinicians.find((staff) => staff.userId === client.treatingClinicianId)?.displayName || "Unassigned"}</span></div>
                            <div className="np-assignment-control">
                              <Label htmlFor={`assign-${client.childId}`}>Treating clinician</Label>
                              <Select value={client.treatingClinicianId || "unassigned"} onValueChange={(value) => assignClient(client.childId, value)} disabled={busy || activeClinicians.length === 0}>
                                <SelectTrigger id={`assign-${client.childId}`} className="np-select-trigger" data-testid={`select-client-clinician-${client.childId}`}><SelectValue placeholder="Select clinician" /></SelectTrigger>
                                <SelectContent><SelectItem value="unassigned" disabled>Unassigned</SelectItem>{activeClinicians.map((staff) => <SelectItem key={staff.userId} value={staff.userId}>{staff.displayName}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                          </div>)}
                        </div> : <div className="np-empty-panel" data-testid="empty-clinic-clients"><p>No clinic clients are available for assignment.</p></div>}
                    {activeClinicians.length === 0 && <p className="np-muted" data-testid="text-no-active-clinicians">Invite and activate a treating clinician before making assignments.</p>}
                  </section>
                </>}
              </>}
      </div>
      <AlertDialog open={Boolean(revokeTarget)} onOpenChange={(open) => { if (!open && !revoke.isPending) setRevokeTarget(null); }}>
        <AlertDialogContent className="np-foundations">
          <AlertDialogHeader><AlertDialogTitle>Revoke this invitation?</AlertDialogTitle><AlertDialogDescription>{revokeTarget ? `The invitation for ${revokeTarget.email} will no longer be usable.` : "This invitation will no longer be usable."}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoke.isPending} data-testid="button-cancel-revoke-staff-invitation">Keep invitation</AlertDialogCancel>
            <AlertDialogAction disabled={revoke.isPending} onClick={(event) => { event.preventDefault(); if (revokeTarget) handleInvitationAction("revoke", revokeTarget.invitationId); }} data-testid="button-confirm-revoke-staff-invitation">{revoke.isPending ? "Revoking…" : "Revoke invitation"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={Boolean(removeStaffTarget)} onOpenChange={(open) => { if (!open && !revokeStaffAccess.isPending) setRemoveStaffTarget(null); }}>
        <AlertDialogContent className="np-foundations">
          <AlertDialogHeader><AlertDialogTitle>Remove clinician access?</AlertDialogTitle><AlertDialogDescription>{removeStaffTarget ? `${removeStaffTarget.displayName} will lose access to this clinic and assigned clients. Existing sessions will be signed out. Clinical records will remain.` : "This clinician will lose clinic access."}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeStaffAccess.isPending} data-testid="button-cancel-remove-clinician">Keep access</AlertDialogCancel>
            <AlertDialogAction disabled={revokeStaffAccess.isPending} onClick={(event) => { event.preventDefault(); removeStaff(); }} data-testid="button-confirm-remove-clinician">{revokeStaffAccess.isPending ? "Removing access…" : "Remove access"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
