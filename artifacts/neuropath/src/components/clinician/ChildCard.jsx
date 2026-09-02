import { User, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

export default function ChildCard({ child }) {
  return (
    <Link
      to={`/ClientDetail?child_id=${child.id}`}
      className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:border-primary/40 hover:shadow-sm transition-all group"
    >
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        <span className="text-primary font-semibold text-sm">
          {child.child_name?.[0]?.toUpperCase() || "?"}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground text-sm truncate">{child.child_name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {child.age ? `Age ${child.age}` : "Age unknown"}
          {child.diagnosis ? ` · ${child.diagnosis}` : ""}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
    </Link>
  );
}
