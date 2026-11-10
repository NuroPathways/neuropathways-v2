import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, LoaderCircle, ShieldCheck, UserMinus, Users } from "lucide-react";
import {
  getListManagedClinicStaffQueryKey,
  useListManagedClinicStaff,
  useRevokeClinicStaffAccess,
} from "@workspace/api-client-react";
import { Badge } from "@workspace/neuropathways-foundations/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/neuropathways-foundations/components/ui/alert-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/neuropathways-foundations/components/ui/card";
import { Button } from "@workspace/neuropathways-foundations/components/ui/button";
import "@workspace/neuropathways-foundations/scoped.css";
import "./ClinicStaffManagement.css";

const roleLabels = {
  clinic_admin: "Clinic administrator",
  clinical_supervisor: "Clinical supervisor",
  treating_clinician: "Treating clinician",
};

const statusLabels = {
  active: "Active",
  pending: "Pending",
  suspended: "Suspended",
  revoked: "Access removed",
};

function statusClass(status) {
  return `np-clinic-staff-status--${status}`;
}

export default function ClinicStaffManagement({ currentUserId, enabled }) {
  const queryClient = useQueryClient();
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const staffQuery = useListManagedClinicStaff({
    query: {
      queryKey: getListManagedClinicStaffQueryKey(),
      enabled: Boolean(enabled && currentUserId),
      staleTime: 30_000,
    },
  });
  const revokeMutation = useRevokeClinicStaffAccess();

  const handleRevoke = () => {
    if (!selectedStaff) return;
    const staff = selectedStaff;
    setError("");
    setMessage("");
    revokeMutation.mutate(
      { clinicId: staff.clinicId, staffUserId: staff.userId },
      {
        onSuccess: async () => {
          setMessage(`${staff.displayName} no longer has access to ${staff.clinicName}.`);
          await queryClient.invalidateQueries({ queryKey: getListManagedClinicStaffQueryKey() });
        },
        onError: () => {
          setError("Access could not be removed. Your clinic permissions may have changed; refresh and try again.");
        },
      },
    );
  };

  if (!enabled || !currentUserId) return null;

  if (staffQuery.isLoading) {
    return (
      <section className="np-foundations np-clinic-staff-panel" aria-label="Clinic staff access">
        <Card className="np-clinic-staff-card">
          <CardContent className="np-clinic-staff-loading" role="status" data-testid="status-clinic-staff-loading">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>Checking clinic administrator access…</span>
          </CardContent>
        </Card>
      </section>
    );
  }

  if (staffQuery.isError) {
    return (
      <section className="np-foundations np-clinic-staff-panel" aria-label="Clinic staff access">
        <Card className="np-clinic-staff-card">
          <CardContent className="np-clinic-staff-content">
            <p role="alert" className="np-clinic-staff-error" data-testid="status-clinic-staff-error">
              Staff access information could not be loaded. Refresh the page and try again.
            </p>
            <Button
              type="button"
              variant="outline"
              className="np-clinic-staff-button np-clinic-staff-button--outline"
              onClick={() => staffQuery.refetch()}
              data-testid="button-retry-clinic-staff"
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  const clinics = staffQuery.data?.clinics || [];
  if (clinics.length === 0) return null;

  return (
    <section className="np-foundations np-clinic-staff-panel" aria-labelledby="clinic-staff-heading">
      <Card className="np-clinic-staff-card">
        <CardHeader className="np-clinic-staff-card-header">
          <div className="np-clinic-staff-heading-row">
            <div className="np-clinic-staff-heading-icon" aria-hidden="true">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="np-clinic-staff-heading-copy">
              <CardTitle id="clinic-staff-heading" className="np-clinic-staff-title">
                Clinic staff access
              </CardTitle>
              <CardDescription className="np-clinic-staff-description">
                View staff in clinics where you are an active administrator. You can remove staff access; role elevation and platform access are not managed here.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="np-clinic-staff-content">
          {message && (
            <p role="status" className="np-clinic-staff-message" data-testid="status-clinic-staff-success">
              {message}
            </p>
          )}
          {error && (
            <p role="alert" className="np-clinic-staff-error" data-testid="status-clinic-staff-action-error">
              {error}
            </p>
          )}

          {clinics.map((clinic) => (
            <section
              key={clinic.clinicId}
              className="np-clinic-staff-clinic"
              aria-labelledby={`clinic-staff-clinic-${clinic.clinicId}`}
              data-testid={`section-clinic-staff-${clinic.clinicId}`}
            >
              <div className="np-clinic-staff-clinic-heading">
                <Building2 className="h-4 w-4" aria-hidden="true" />
                <h3 id={`clinic-staff-clinic-${clinic.clinicId}`}>{clinic.clinicName}</h3>
                <span className="np-clinic-staff-count" data-testid={`text-clinic-staff-count-${clinic.clinicId}`}>
                  {clinic.staff.length} {clinic.staff.length === 1 ? "staff member" : "staff members"}
                </span>
              </div>

              {clinic.staff.length === 0 ? (
                <p className="np-clinic-staff-empty" data-testid={`text-clinic-staff-empty-${clinic.clinicId}`}>
                  No clinician memberships are listed for this clinic.
                </p>
              ) : (
                <ul className="np-clinic-staff-list" aria-label={`Staff at ${clinic.clinicName}`}>
                  {clinic.staff.map((staff) => {
                    const isSelf = staff.userId === currentUserId;
                    const canRevoke = staff.status !== "revoked" && !isSelf;
                    return (
                      <li
                        key={`${clinic.clinicId}-${staff.userId}`}
                        className="np-clinic-staff-row"
                        data-testid={`row-clinic-staff-${clinic.clinicId}-${staff.userId}`}
                      >
                        <div className="np-clinic-staff-person">
                          <span className="np-clinic-staff-avatar" aria-hidden="true">
                            <Users className="h-4 w-4" />
                          </span>
                          <div className="np-clinic-staff-person-copy">
                            <p className="np-clinic-staff-name" data-testid={`text-clinic-staff-name-${clinic.clinicId}-${staff.userId}`}>
                              {staff.displayName}{isSelf ? " (you)" : ""}
                            </p>
                            {staff.email && (
                              <p className="np-clinic-staff-email" data-testid={`text-clinic-staff-email-${clinic.clinicId}-${staff.userId}`}>
                                {staff.email}
                              </p>
                            )}
                            <div className="np-clinic-staff-roles" aria-label="Clinic roles">
                              {staff.roles.map((role) => (
                                <span key={role} className="np-clinic-staff-role" data-testid={`text-clinic-staff-role-${clinic.clinicId}-${staff.userId}-${role}`}>
                                  {roleLabels[role] || "Clinic staff"}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="np-clinic-staff-row-actions">
                          <Badge
                            variant="outline"
                            className={`np-clinic-staff-status ${statusClass(staff.status)}`}
                            data-testid={`status-clinic-staff-${clinic.clinicId}-${staff.userId}`}
                          >
                            {statusLabels[staff.status] || "Status unavailable"}
                          </Badge>
                          {canRevoke ? (
                            <Button
                              type="button"
                              variant="destructive"
                              className="np-clinic-staff-button np-clinic-staff-button--destructive"
                              onClick={() => {
                                setError("");
                                setSelectedStaff({ ...staff, clinicId: clinic.clinicId, clinicName: clinic.clinicName });
                              }}
                              disabled={revokeMutation.isPending}
                              data-testid={`button-revoke-clinic-staff-${clinic.clinicId}-${staff.userId}`}
                              aria-label={`Remove ${staff.displayName} from ${clinic.clinicName}`}
                            >
                              <UserMinus aria-hidden="true" />
                              Remove access
                            </Button>
                          ) : isSelf ? (
                            <span className="np-clinic-staff-self-note" data-testid={`text-clinic-staff-self-${clinic.clinicId}-${staff.userId}`}>
                              Your access is managed by clinic membership
                            </span>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </CardContent>
      </Card>

      <AlertDialog
        open={Boolean(selectedStaff)}
        onOpenChange={(open) => {
          if (!open && !revokeMutation.isPending) setSelectedStaff(null);
        }}
      >
        <AlertDialogContent className="np-foundations np-clinic-staff-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="np-clinic-staff-dialog-title">
              Remove clinic access?
            </AlertDialogTitle>
            <AlertDialogDescription className="np-clinic-staff-dialog-description">
              {selectedStaff
                ? `This signs ${selectedStaff.displayName} out and removes their access, assignments, and document shares in ${selectedStaff.clinicName}. Clinical records and uploaded files are kept.`
                : "This action removes the selected clinician’s access from this clinic."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="np-clinic-staff-button np-clinic-staff-button--outline"
              disabled={revokeMutation.isPending}
              data-testid="button-cancel-revoke-clinic-staff"
            >
              Keep access
            </AlertDialogCancel>
            <AlertDialogAction
              className="np-clinic-staff-button np-clinic-staff-button--destructive"
              disabled={revokeMutation.isPending}
              onClick={handleRevoke}
              data-testid="button-confirm-revoke-clinic-staff"
            >
              {revokeMutation.isPending ? "Removing…" : "Remove access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
