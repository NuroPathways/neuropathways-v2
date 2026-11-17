import { useState } from "react";
import { Link2, RefreshCw } from "lucide-react";
import { Button } from "@workspace/neuropathways-foundations/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/neuropathways-foundations/components/ui/card";

function localInvitationPath(href) {
  return typeof href === "string" && /^\/ClinicInvitation#token=[A-Za-z0-9_%~-]{32,256}$/.test(href);
}

export default function DemoInvitationLinks() {
  const [links, setLinks] = useState([]);
  const [state, setState] = useState("idle");
  const [message, setMessage] = useState("");

  if (import.meta.env.VITE_CLINIC_ONBOARDING_DEMO_INBOX !== "1") return null;

  const loadLinks = async () => {
    setState("loading");
    setMessage("");
    try {
      const response = await fetch("/api/demo/clinic-invitation-links", {
        credentials: "include",
        cache: "no-store",
      });
      if (response.status === 404) {
        setLinks([]);
        setState("unavailable");
        return;
      }
      if (!response.ok) {
        setLinks([]);
        setMessage(response.status === 401 || response.status === 403
          ? "Your current account is not authorized to view these invitation links."
          : "Local invitation links could not be loaded. Try again.");
        setState("error");
        return;
      }
      const result = await response.json();
      setLinks(Array.isArray(result.links) ? result.links : []);
      setState("loaded");
    } catch {
      setLinks([]);
      setMessage("Local invitation links could not be loaded. Try again.");
      setState("error");
    }
  };

  if (state === "unavailable") return null;

  return (
    <Card className="np-onboarding-card" data-testid="panel-demo-invitation-links">
      <CardHeader>
        <CardTitle className="np-section-title">Local invitation links</CardTitle>
        <p className="np-muted">
          Isolated demo only. Links are available to administrators for invitations they are allowed to manage.
          Open them privately; do not share or screenshot the links.
        </p>
      </CardHeader>
      <CardContent className="np-invitation-list">
        <Button
          type="button"
          variant="outline"
          onClick={loadLinks}
          disabled={state === "loading"}
          data-testid="button-load-demo-invitation-links"
        >
          <RefreshCw aria-hidden="true" />
          {state === "loading" ? "Loading links…" : state === "loaded" ? "Refresh local links" : "Show local links"}
        </Button>
        {message && <p role="alert" className="np-feedback np-feedback-error" data-testid="status-demo-invitation-links-error">{message}</p>}
        {state === "loaded" && !links.length && <p className="np-muted" data-testid="empty-demo-invitation-links">No active local invitation links.</p>}
        {links.map((link) => (
          <div className="np-invitation-row" key={link.invitationId} data-testid={`row-demo-invitation-link-${link.invitationId}`}>
            <div className="np-invitation-copy">
              <strong>{link.invitedEmail}</strong>
              <span>{link.clinicName} · {link.role === "clinic_admin" ? "Clinic administrator" : "Treating clinician"}</span>
              <span>Expires {new Date(link.expiresAt).toLocaleDateString()}</span>
            </div>
            {localInvitationPath(link.href) && (
              <Button asChild variant="outline">
                <a
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  data-testid={`link-demo-invitation-${link.invitationId}`}
                >
                  <Link2 aria-hidden="true" />
                  Open invitation
                </a>
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
