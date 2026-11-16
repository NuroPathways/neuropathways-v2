import { Navigate, Link } from "react-router-dom";
import { ArrowRight, Building2, Users, Stethoscope } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { getAuthorizedWorkspaces } from "@/lib/workspaceRouting";
import { Button } from "@workspace/neuropathways-foundations/components/ui/button";
import { Card, CardContent } from "@workspace/neuropathways-foundations/components/ui/card";
import { PageHeader } from "@workspace/neuropathways-foundations/components/ui/page-header";
import { Shell } from "@/components/parentfree/common";
import "@workspace/neuropathways-foundations/scoped.css";
import "../clinic-onboarding.css";

const ICONS = {
  platform_admin: Building2,
  clinic_admin: Users,
  clinician: Stethoscope,
};

export default function WorkspaceSelect() {
  const { user, isLoadingAuth } = useAuth();
  if (isLoadingAuth) return <div role="status" className="min-h-screen grid place-items-center">Loading workspaces…</div>;
  if (!user) return <Navigate to="/ClinicianLogin" replace />;
  const workspaces = getAuthorizedWorkspaces(user);
  if (workspaces.length === 1) return <Navigate to={workspaces[0].homePath} replace />;
  if (!workspaces.length) {
    return <Navigate to={user.app_role === "parent" ? "/ParentHome" : "/RoleSetup?role=clinician"} replace />;
  }

  return (
    <Shell>
      <main className="np-foundations np-onboarding-page">
        <div className="np-onboarding-content">
          <PageHeader title="Choose a workspace" context="NeuroPathways · Account access" description="These options come from your active account and clinic permissions. Choosing a workspace does not grant additional access." />
          <div className="np-list" data-testid="list-authorized-workspaces">
            {workspaces.map((workspace) => {
              const Icon = ICONS[workspace.type];
              return (
                <Card key={workspace.id} className="np-onboarding-card">
                  <CardContent className="np-workspace-choice">
                    <div><Icon aria-hidden="true" /><div><h2 className="np-card-title">{workspace.label}</h2><p className="np-muted">{workspace.type === "platform_admin"
                      ? "Platform clinic requests and clinic provisioning."
                      : workspace.type === "clinic_admin"
                        ? "Clinic staff, invitations, and assignments."
                        : "Clinical tools for clients you are authorized to support."}</p></div></div>
                    <Button asChild data-testid={`link-workspace-${workspace.id}`}>
                      <Link to={`${workspace.homePath}?workspace=${workspace.id}`}>Open workspace <ArrowRight aria-hidden="true" /></Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <Link to="/" className="np-link" data-testid="link-workspace-select-home">Back to NeuroPathways</Link>
        </div>
      </main>
    </Shell>
  );
}
