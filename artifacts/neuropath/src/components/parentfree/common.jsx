import { Link } from "react-router-dom";
import BrandMark from "@/components/brand/BrandMark";

export function Brand({ to = "/" }) {
  return (
    <Link to={to} className="pf-serif pf-brand" style={{ display: "inline-flex", alignItems: "center", gap: 9, flexShrink: 0, whiteSpace: "nowrap", fontWeight: 700, fontSize: "1.2rem", color: "var(--pf-ink)", textDecoration: "none" }} data-testid="link-brand">
      <BrandMark size={32} />
      <span>Neuro<span style={{ color: "var(--pf-accent)" }}>Pathways</span></span>
    </Link>
  );
}

export function errMsg(err, fallback = "Something went wrong. Please try again.") {
  const d = err?.data;
  if (d && typeof d === "object" && (d.error || d.message)) return String(d.error || d.message);
  return err?.message && !/^HTTP \d+/.test(err.message) ? err.message : fallback;
}

export function ErrorBox({ error, onRetry, testid = "error-message" }) {
  if (!error) return null;
  return (
    <div className="pf-error" role="alert" data-testid={testid}>
      <span>{typeof error === "string" ? error : errMsg(error)}</span>
      {onRetry && (
        <button type="button" className="pf-btn small" style={{ marginLeft: 12 }} onClick={onRetry} data-testid="button-retry">Try again</button>
      )}
    </div>
  );
}

export function Skeleton({ h = 120 }) {
  return <div className="pf-skel" style={{ height: h }} />;
}

export function Field({ label, hint, children }) {
  return (
    <div>
      <label className="pf-label">{label}</label>
      {children}
      {hint && <p className="pf-hint">{hint}</p>}
    </div>
  );
}

export function Shell({ children, right }) {
  return (
    <div className="pf">
      <header className="pf-wrap pf-header" style={{ padding: "20px" }}>
        <Brand />
        <div className="pf-header-actions">{right}</div>
      </header>
      {children}
    </div>
  );
}
