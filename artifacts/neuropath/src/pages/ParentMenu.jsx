import { useNavigate, useSearchParams } from "react-router-dom";
import { BookOpen, Bot, ClipboardList, FileText, Heart, Link2, Mail, Settings, Upload } from "lucide-react";
import { MenuRow } from "@workspace/neuropathways-foundations/components/ui/menu-row";
import { PageHeader } from "@workspace/neuropathways-foundations/components/ui/page-header";
import { useAuth } from "@/lib/AuthContext";
import "@workspace/neuropathways-foundations/scoped.css";
import "./parent-menu-phase-six.css";

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

// Presentation-only grouping of the existing entries (by title).
const groups = [
  ["resources", "Resources", ["History", "Support library", "Care plan & documents", "Upload a plan", "AI Chat"]],
  ["family", "Family & Care Team", ["Enjoyment & preferences", "Clinic connection", "Messages"]],
  ["account", "Account", ["Settings"]],
];

export default function ParentMenu() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [search] = useSearchParams();
  const childId = search.get("child_id");
  const open = (path) => {
    const unified = ["parent_free", "legacy_family"].includes(user?.accountType || user?.account_type);
    if (unified) {
      const mapped = {
        "/HelpNow": "/ParentHome?tab=today&section=library",
        "/DocumentCenter": "/ParentHome?tab=docs",
        "/ParentUpload": "/ParentHome?tab=docs",
        "/AIChat": "/ParentHome?tab=ask",
        "/ChildProfile": "/ParentHome?tab=practice&section=preferences",
        "/Messages": "/ParentHome?tab=messages",
      }[path];
      if (mapped) path = mapped;
    }
    const [pathname, query = ""] = path.split("?");
    const params = new URLSearchParams(query);
    if (childId && !params.has("child_id")) params.set("child_id", childId);
    navigate(`${pathname}${params.size ? `?${params.toString()}` : ""}`);
  };

  const visible = entries.filter(([title]) => !((user?.accountType || user?.account_type) === "legacy_family" && title === "Clinic connection"));

  return (
    <main className="np-foundations np-menu6" data-testid="parent-menu">
      <PageHeader className="np-menu6-header" context="Family tools" title="Menu" description="Everything else, in one place." />
      <nav aria-label="Parent features" className="np-menu6-nav">
        {groups.map(([key, heading, titles]) => {
          const items = titles.map((t) => visible.find(([title]) => title === t)).filter(Boolean);
          if (!items.length) return null;
          return (
            <section key={key} className="np-menu6-group" aria-labelledby={`menu-group-${key}`} data-testid={`menu-group-${key}`}>
              <h2 id={`menu-group-${key}`} className="np-menu6-heading">{heading}</h2>
              <ul className="np-menu6-list">
                {items.map(([title, description, Icon, path]) => (
                  <li key={title}>
                    <MenuRow
                      className="np-menu6-row"
                      onClick={() => open(path)}
                      data-testid={`menu-link-${title.toLowerCase().replaceAll(/[^a-z]+/g, "-")}`}
                      icon={<Icon />}
                      label={title}
                      description={description}
                    />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </nav>
    </main>
  );
}
