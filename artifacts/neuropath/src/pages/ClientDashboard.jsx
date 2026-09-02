import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from '@/api/entities';
import { AlertCircle, FileText, Star, MessageCircle, Baby, ChevronRight, Bell, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { format } from "date-fns";
import BehaviorProgressChart from "@/components/parent/BehaviorProgressChart";
import DailyCheckInBanner from "@/components/parent/DailyCheckInBanner";
import { useAuth } from "@/lib/AuthContext";

export default function ClientDashboard() {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const [user, setUser] = useState(null);
  const [children, setChildren] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [allLogs, setAllLogs] = useState([]);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const me = authUser;
      if (!me) return;
      setUser(me);

      // If client session has pre-loaded children (no-email accounts), use those
      let merged = [];
      if (me.children && me.children.length > 0) {
        merged = me.children;
      } else {
        const [byId, byEmail] = await Promise.all([
          base44.entities.Child.filter({ parent_id: me.id }).catch(() => []),
          me.email ? base44.entities.Child.filter({ parent_email: me.email }).catch(() => []) : Promise.resolve([]),
        ]);
        const seen = new Set();
        merged = [...byId, ...byEmail].filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
      }
      setChildren(merged);

      if (merged.length > 0) {
        const logPromises = merged.map(c => base44.entities.BehaviorLog.filter({ child_id: c.id }));
        const logResults = await Promise.all(logPromises);
        const allLogs = logResults.flat().sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
        setAllLogs(allLogs);
        setRecentLogs(allLogs.slice(0, 5));

        const msgResults = await Promise.all(merged.map(c => base44.entities.Message.filter({ child_id: c.id, to_user_id: me.id, is_read: false })));
        setUnreadMessages(msgResults.flat().length);
      }
      setLoading(false);
    };
    if (authUser) load();
  }, [authUser]);

  const primaryChild = children[0];

  return (
    <div className="bg-background min-h-screen font-inter">
      <div className="p-5 pb-0 max-w-2xl mx-auto">
        {/* Greeting */}
        <div className="mb-5">
          <p className="text-muted-foreground text-sm">Welcome back</p>
          <h1 className="text-2xl font-bold text-foreground">{user?.full_name || "Parent"}</h1>
        </div>

        {/* HELP NOW — Hero Button */}
        <motion.button
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => navigate(primaryChild ? `/HelpNow?child_id=${primaryChild.id}` : "/HelpNow")}
          className="w-full bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-2xl p-6 mb-5 text-left transition-colors shadow-lg"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-8 h-8 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-white font-bold text-xl leading-tight">I Need Help Now</p>
              <p className="text-white/80 text-sm mt-0.5">Get step-by-step guidance for your child's behavior</p>
            </div>
            <ChevronRight className="w-6 h-6 text-white/70" />
          </div>
        </motion.button>

        {/* Daily check-in banner */}
        <DailyCheckInBanner
          logs={allLogs}
          childId={primaryChild?.id}
          onLogClick={() => navigate(primaryChild ? `/LogBehavior?child_id=${primaryChild.id}` : "/LogBehavior")}
        />

        {/* Behavior Progress Chart */}
        {allLogs.length > 0 && <BehaviorProgressChart logs={allLogs} />}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <QuickCard icon={ClipboardList} label="Log Behavior" color="bg-purple-50 text-purple-700 border-purple-200" onClick={() => navigate(primaryChild ? `/LogBehavior?child_id=${primaryChild.id}` : "/LogBehavior")} />
          <QuickCard icon={FileText} label="Documents" color="bg-blue-50 text-blue-700 border-blue-200" onClick={() => navigate("/DocumentCenter")} />
          <QuickCard icon={Star} label="Rewards" color="bg-yellow-50 text-yellow-700 border-yellow-200" onClick={() => navigate(primaryChild ? `/RewardTracker?child_id=${primaryChild.id}` : "/RewardTracker")} />
          <QuickCard
            icon={MessageCircle}
            label="Messages"
            color="bg-green-50 text-green-700 border-green-200"
            badge={unreadMessages > 0 ? unreadMessages : null}
            onClick={() => navigate("/Messages")}
          />
        </div>

        {/* Children */}
        <section className="mb-5">
          <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2 text-sm">
            <Baby className="w-4 h-4" /> My Children
          </h2>
          {loading ? (
            <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}</div>
          ) : children.length === 0 ? (
            <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center">
              <Baby className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground mb-1">No children linked yet</p>
              <p className="text-xs text-muted-foreground">Ask your clinician to connect your account to your child's profile.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {children.map((child, i) => (
                <motion.div
                  key={child.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  onClick={() => navigate(`/ChildProfile?child_id=${child.id}`)}
                  className="bg-card border border-border rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:border-primary/40 transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary text-lg font-bold">{child.child_name?.[0]?.toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">{child.child_name}</p>
                    <p className="text-xs text-muted-foreground">{[child.age && `Age ${child.age}`, child.diagnosis].filter(Boolean).join(" • ")}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </motion.div>
              ))}
            </div>
          )}
        </section>

        {/* Recent Activity */}
        {recentLogs.length > 0 && (
          <section className="mb-8">
            <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2 text-sm">
              <Bell className="w-4 h-4" /> Recent Activity
            </h2>
            <div className="space-y-2">
              {recentLogs.map(log => (
                <div key={log.id} className="flex items-start gap-3 p-3 bg-card border border-border rounded-xl">
                  <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${log.intensity === "high" ? "bg-red-500" : log.intensity === "moderate" ? "bg-yellow-500" : "bg-green-500"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{log.behavior_type || "Behavior logged"}</p>
                    {log.context && <p className="text-xs text-muted-foreground truncate">{log.context}</p>}
                  </div>
                  <p className="text-xs text-muted-foreground flex-shrink-0">
                    {log.created_date ? format(new Date(log.created_date), "MMM d") : ""}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function QuickCard({ icon: Icon, label, color, onClick, badge }) {
  return (
    <button onClick={onClick} className={`border-2 rounded-2xl p-4 text-left transition-all hover:scale-[1.02] active:scale-100 relative ${color}`}>
      <Icon className="w-6 h-6 mb-2" />
      <p className="text-sm font-semibold leading-tight">{label}</p>
      {badge && (
        <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold">{badge}</span>
      )}
    </button>
  );
}