import { ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

export default function BackButton({ fallback = "/" }) {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(location.key === "default" ? fallback : -1)}
      className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-primary hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      aria-label="Go back"
    >
      <ArrowLeft className="h-5 w-5" aria-hidden="true" />
      Back
    </button>
  );
}
