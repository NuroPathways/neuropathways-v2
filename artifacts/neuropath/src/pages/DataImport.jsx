import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, CheckCircle2, XCircle, Loader2, FileJson, AlertTriangle, Download } from "lucide-react";

const ENTITIES = [
  { key: "User",             label: "Users",               desc: "Clinician & parent user accounts" },
  { key: "Family",           label: "Families",            desc: "Family records" },
  { key: "Child",            label: "Children / Clients",  desc: "Client profiles" },
  { key: "BehaviorPlan",     label: "Behavior Plans",      desc: "Clinical behavior plans" },
  { key: "InterventionPlan", label: "Intervention Plans",  desc: "Intervention strategies" },
  { key: "Document",         label: "Documents",           desc: "Uploaded clinical documents" },
  { key: "ClientProfile",    label: "Client Profiles",     desc: "AI-generated client profiles" },
  { key: "BehaviorLog",      label: "Behavior Logs",       desc: "Logged behavior events" },
  { key: "RewardToken",      label: "Goals & Rewards",     desc: "Token/reward tracking" },
  { key: "Message",          label: "Messages",            desc: "Clinician ↔ parent messages" },
  { key: "AIConversation",   label: "AI Conversations",    desc: "Parent AI chat history" },
  { key: "DailyCheckIn",     label: "Daily Check-Ins",     desc: "Daily mood check-ins" },
  { key: "WinLog",           label: "Win Logs",            desc: "Logged wins & celebrations" },
  { key: "EngagementEvent",  label: "Engagement Events",   desc: "Portal engagement tracking" },
];

const STATUS = { idle: "idle", loading: "loading", done: "done", error: "error" };

export default function DataImport() {
  const navigate = useNavigate();
  const fileRefs = useRef({});
  const [results, setResults] = useState({});
  const [globalLoading, setGlobalLoading] = useState(false);

  const handleFile = async (entityKey, file) => {
    if (!file) return;
    setResults(r => ({ ...r, [entityKey]: { status: STATUS.loading, message: "Reading file…" } }));

    let records;
    try {
      const text = await file.text();
      if (file.name.endsWith(".csv")) {
        records = csvToObjects(text);
      } else {
        const parsed = JSON.parse(text);
        records = Array.isArray(parsed) ? parsed : parsed.data ?? parsed.items ?? Object.values(parsed);
      }
    } catch (e) {
      setResults(r => ({ ...r, [entityKey]: { status: STATUS.error, message: "Could not parse file: " + e.message } }));
      return;
    }

    if (!records.length) {
      setResults(r => ({ ...r, [entityKey]: { status: STATUS.done, message: "File was empty — nothing to import." } }));
      return;
    }

    setResults(r => ({ ...r, [entityKey]: { status: STATUS.loading, message: `Importing ${records.length} records…` } }));

    try {
      const res = await fetch("/api/import/" + entityKey, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server error");
      setResults(r => ({
        ...r,
        [entityKey]: {
          status: STATUS.done,
          message: `✓ ${data.imported} imported, ${data.skipped} skipped, ${data.errors} errors`,
          detail: data.errorDetails,
        },
      }));
    } catch (e) {
      setResults(r => ({ ...r, [entityKey]: { status: STATUS.error, message: e.message } }));
    }
  };

  const handleImportAll = async () => {
    const hasFiles = ENTITIES.some(e => fileRefs.current[e.key]?.files?.[0]);
    if (!hasFiles) return;
    setGlobalLoading(true);
    for (const entity of ENTITIES) {
      const file = fileRefs.current[entity.key]?.files?.[0];
      if (file) await handleFile(entity.key, file);
    }
    setGlobalLoading(false);
  };

  const doneCount = Object.values(results).filter(r => r.status === STATUS.done).length;
  const errorCount = Object.values(results).filter(r => r.status === STATUS.error).length;

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="font-bold text-foreground text-lg">Data Import</h1>
          <p className="text-xs text-muted-foreground">Import your Base44 data into your private database</p>
        </div>
        {(doneCount > 0 || errorCount > 0) && (
          <div className="flex items-center gap-2 text-xs">
            {doneCount > 0 && <span className="text-emerald-600 font-medium">{doneCount} done</span>}
            {errorCount > 0 && <span className="text-red-500 font-medium">{errorCount} failed</span>}
          </div>
        )}
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-1">
          <p className="font-semibold flex items-center gap-1.5"><Download className="w-4 h-4" /> How to export from Base44</p>
          <ol className="list-decimal list-inside space-y-0.5 text-blue-700">
            <li>Log in to your Base44 dashboard</li>
            <li>Go to <strong>Data</strong> → select each entity type</li>
            <li>Click <strong>Export → JSON</strong> (or CSV)</li>
            <li>Upload each file in the matching row below</li>
          </ol>
          <p className="text-blue-600 pt-1">Import order matters: upload <strong>Users</strong> and <strong>Families</strong> first, then Children, then everything else.</p>
        </div>

        {/* Import All button */}
        <div className="flex justify-end">
          <button
            onClick={handleImportAll}
            disabled={globalLoading}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {globalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Import All Selected Files
          </button>
        </div>

        {/* Entity rows */}
        <div className="space-y-2">
          {ENTITIES.map((entity) => {
            const result = results[entity.key];
            return (
              <div key={entity.key} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-foreground">{entity.label}</span>
                    <span className="text-xs text-muted-foreground hidden sm:inline">— {entity.desc}</span>
                  </div>
                  {result && (
                    <p className={`text-xs mt-0.5 ${result.status === STATUS.error ? "text-red-500" : result.status === STATUS.done ? "text-emerald-600" : "text-muted-foreground"}`}>
                      {result.message}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {result?.status === STATUS.loading && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                  {result?.status === STATUS.done && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  {result?.status === STATUS.error && <XCircle className="w-4 h-4 text-red-500" />}

                  <label className="cursor-pointer flex items-center gap-1.5 bg-secondary text-secondary-foreground px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-secondary/80 transition-colors">
                    <FileJson className="w-3.5 h-3.5" />
                    {result?.status === STATUS.done ? "Re-import" : "Choose file"}
                    <input
                      type="file"
                      accept=".json,.csv"
                      className="hidden"
                      ref={el => fileRefs.current[entity.key] = el}
                      onChange={e => handleFile(entity.key, e.target.files?.[0])}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        {/* Warning */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Duplicate records (same ID) are skipped automatically. You can safely re-import the same file. All data stays on your private Replit database — nothing is sent to Base44.</span>
        </div>
      </div>
    </div>
  );
}

// ── CSV parser ────────────────────────────────────
function csvToObjects(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h.trim(), values[i] ?? ""]));
  }).filter(row => Object.values(row).some(v => v !== ""));
}

function parseCsvLine(line) {
  const result = [];
  let cur = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(cur); cur = ""; continue; }
    cur += ch;
  }
  result.push(cur);
  return result;
}
