import { Link } from "react-router-dom";

export const legalLinks = [
  ["/privacy", "Privacy policy"],
  ["/privacy-details", "Feature data notice"],
  ["/terms", "Terms of use"],
  ["/contact", "Contact"],
  ["/copyright", "Copyright"],
  ["/data-requests", "Data requests"],
];

export default function LegalLinks() {
  return (
    <nav aria-label="Legal information" className="flex flex-wrap gap-x-5 gap-y-3 text-sm text-muted-foreground">
      {legalLinks.map(([to, label]) => <Link key={to} to={to} className="underline underline-offset-4 hover:text-foreground">{label}</Link>)}
    </nav>
  );
}
