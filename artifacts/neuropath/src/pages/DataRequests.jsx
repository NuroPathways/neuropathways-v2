import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { parentRequest } from "@/lib/parentSession";
import LegalLinks from "@/components/legal/LegalLinks";

const options = [
  ["data_export", "Request a copy/export of my data"],
  ["account_deletion", "Request deletion of my account and associated records"],
  ["child_profile_deletion", "Request deletion of a child profile"],
  ["document_deletion", "Request deletion of an uploaded document"],
  ["behavior_log_deletion", "Request deletion of a behavior log"],
];

function endpointFor(user) {
  return user?.account_type === "parent_free" || user?.accountType === "parent_free" || user?.app_role === "parent" || user?.appRole === "parent"
    ? "/api/parent/data-requests"
    : "/api/data-requests";
}

async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Unable to load your data requests.");
  return data;
}

export default function DataRequests() {
  const { user, isLoadingAuth } = useAuth();
  const [requestType, setRequestType] = useState("");
  const [requests, setRequests] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isParent = user?.account_type === "parent_free" || user?.accountType === "parent_free" || user?.app_role === "parent" || user?.appRole === "parent";
  const isClinician = user?.app_role === "clinician" || user?.appRole === "clinician" || user?.account_type === "clinician" || user?.accountType === "clinician";
  const endpoint = endpointFor(user);
  const supportedAccount = isParent || isClinician;

  useEffect(() => {
    if (!supportedAccount) return;
    let current = true;
    fetch(endpoint, isParent ? parentRequest() : { credentials: "include" })
      .then(readJson)
      .then((data) => { if (current) setRequests(data.requests || []); })
      .catch(() => { if (current) setError("Your request history is not available. You can still submit a request or use Contact."); });
    return () => { current = false; };
  }, [endpoint, supportedAccount, isParent]);

  if (isLoadingAuth) return <main className="max-w-xl mx-auto p-6" aria-busy="true">Loading account…</main>;
  if (!user) return <Navigate to="/ParentLogin?next=%2FDataRequests" replace />;

  const submit = async (event) => {
    event.preventDefault();
    if (!requestType || loading) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        ...(isParent
          ? parentRequest({ method: "POST", headers: { "Content-Type": "application/json" } })
          : { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" } }),
        body: JSON.stringify({ requestType }),
      });
      const result = await readJson(response);
      setRequests((previous) => [{
        ...result,
        request_type: requestType,
        status: "received",
      }, ...previous]);
      setMessage(result.message);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Your request could not be recorded.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background px-5 py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <p className="text-sm text-muted-foreground">NeuroPathways · Account privacy</p>
          <h1 className="mt-2 text-2xl font-bold text-foreground">Data requests</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Submit a tracked request about your own account. It will be recorded as received, not completed.
            The operator must verify the request and review applicable retention and clinic-record requirements.
          </p>
        </header>

        {!supportedAccount ? (
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-semibold text-foreground">Client or clinic-linked account</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Ask your parent/guardian or clinician how to submit an account data request. Some clinic records may have separate retention requirements.
            </p>
            <Link className="mt-3 inline-block text-sm text-primary underline" to="/contact">Contact NeuroPathways</Link>
          </section>
        ) : (
          <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-5">
            <h2 className="font-semibold text-foreground">Create a request</h2>
            <label className="block text-sm font-medium text-foreground" htmlFor="data-request-type">Request type</label>
            <select id="data-request-type" className="w-full rounded-lg border border-input bg-background p-3 text-sm text-foreground" required value={requestType} onChange={(event) => setRequestType(event.target.value)}>
              <option value="">Select a request type</option>
              {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <p className="text-xs leading-5 text-muted-foreground">
              Submitting does not delete or export records automatically. Do not enter passwords, access codes, or unnecessary health details.
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
              If a clinician or clinic holds the record, it may have separate retention requirements. Submitting this form does not override those requirements.
            </p>
            {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" type="submit" disabled={!requestType || loading}>
              {loading ? "Submitting…" : "Submit request"}
            </button>
          </form>
        )}

        {requests.length > 0 && (
          <section aria-label="Previous data requests" className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-semibold text-foreground">Request history</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {requests.map((request) => (
                <li key={request.request_id} className="flex flex-wrap justify-between gap-2 border-t border-border pt-2">
                  <span>{options.find(([value]) => value === request.request_type)?.[1] || "Data request"}</span>
                  <span>{request.status || "received"} · {request.verification_status || "verification pending"} · {request.requested_at ? new Date(request.requested_at).toLocaleDateString() : "just now"}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {isClinician && (
          <p className="text-sm leading-6 text-muted-foreground">
            Some clinic-held records may have to be retained under the clinic's policies. NeuroPathways records are not automatically erased when you submit this request.
          </p>
        )}
        <footer className="border-t border-border pt-5"><LegalLinks /></footer>
      </div>
    </main>
  );
}
