import { useNavigate, useSearchParams } from "react-router-dom";
import { BookOpen, Bot, ClipboardList, FileText, Heart, Link2, Mail, Settings, Upload } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

const entries = [
  ["History", "Existing behavior notes and activity", ClipboardList, "/History"],
  ["Support library", "Saved guidance for your child", BookOpen, "/HelpNow"],
  ["Care plan & documents", "Review plans and shared files", FileText, "/DocumentCenter"],
  ["Upload a plan", "Add a document for your care team", Upload, "/ParentUpload"],
  ["AI Chat", "Ask a question between visits", Bot, "/AIChat"],
  ["Enjoyment & preferences", "Update what your child enjoys", Heart, "/ChildProfile"],
  ["Clinic connection", "See your care team connection", Link2, "/ParentHome?tab=clinic"],
  ["Settings", "Account and privacy options", Settings, "/Settings"],
  ["Messages", "Talk with your clinician", Mail, "/Messages"],
];

export default function ParentMenu() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [search] = useSearchParams();
  const childId = search.get("child_id");
  const open = (path) => {
    if (user?.account_type === "parent_free") {
      const mapped = {
        "/HelpNow": "/ParentHome?tab=today&section=library",
        "/DocumentCenter": "/ParentHome?tab=docs",
        "/ParentUpload": "/ParentHome?tab=docs",
        "/AIChat": "/ParentHome?tab=ask",
        "/ChildProfile": "/ParentHome?tab=edit&section=profile",
      }[path];
      if (mapped) path = mapped;
    }
    const [pathname, query = ""] = path.split("?");
    const params = new URLSearchParams(query);
    if (childId && !params.has("child_id")) params.set("child_id", childId);
    navigate(`${pathname}${params.size ? `?${params.toString()}` : ""}`);
  };

  return (
    <main className="np-parent-directory" data-testid="parent-menu">
      <header><span>Family tools</span><h1>Menu</h1><p>Everything else, in one place.</p></header>
      <nav aria-label="Parent features">
        {entries.map(([title, description, Icon, path]) => (
          <button type="button" key={title} onClick={() => open(path)} data-testid={`menu-link-${title.toLowerCase().replaceAll(/[^a-z]+/g, "-")}`}>
            <span className="np-directory-icon"><Icon size={19} aria-hidden="true" /></span>
            <span><strong>{title}</strong><small>{description}</small></span>
            <span className="np-directory-arrow" aria-hidden="true">›</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
