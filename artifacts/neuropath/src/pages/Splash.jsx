import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from '@/api/entities';
import { Brain, ArrowRight, CheckCircle2, Shield, Clock } from "lucide-react";
import { motion } from "framer-motion";

const HOW_IT_WORKS = [
  { icon: "📋", title: "Clinicians upload plans", desc: "Treatment plans, behavior protocols, and session notes are securely stored and AI-analyzed." },
  { icon: "🔐", title: "Clients join securely", desc: "Parents and clients receive a secure invite link to create their personalized account." },
  { icon: "🤝", title: "Personalized support", desc: "The AI provides real-time, clinician-approved behavioral guidance anytime it's needed." },
];

export default function Splash() {
  const navigate = useNavigate();

  useEffect(() => {
    base44.auth.isAuthenticated().then(async (authed) => {
      if (!authed) return;
      const user = await base44.auth.me().catch(() => null);
      if (!user) return;
      if (user.app_role === "clinician") navigate("/ClinicianDashboard");
      else if (user.app_role === "parent") navigate("/ParentDashboard");
      // No role yet — stay on the welcome page so they choose the right portal
    });
  }, []);

  return (
    <div className="min-h-screen font-inter overflow-x-hidden" style={{ background: "linear-gradient(135deg, #f0f7ff 0%, #e8f5f0 50%, #f5f0ff 100%)" }}>

      {/* Navbar */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-sm">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-foreground text-lg tracking-tight">NeuroPathways</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/ClinicianLogin")}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-4 py-2 rounded-xl hover:bg-white/60"
          >
            Clinician Login
          </button>
          <button
            onClick={() => navigate("/ClientLogin")}
            className="text-sm font-medium bg-primary text-white px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors shadow-sm"
          >
            Client Login
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-12 pb-20 text-center">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div className="inline-flex items-center gap-2 bg-white/80 backdrop-blur-sm border border-primary/20 rounded-full px-4 py-1.5 mb-8 shadow-sm">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-semibold text-primary uppercase tracking-wide">Behavioral Health Platform</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-5 leading-tight max-w-4xl mx-auto">
            Real-Time Behavioral Support{" "}
            <span className="text-primary">Between Sessions</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-12 leading-relaxed">
            Helping clinicians, parents, and clients access personalized behavioral support anytime — powered by AI and your clinical plans.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 mb-14 text-sm text-muted-foreground">
            {[
              { icon: Shield, text: "HIPAA-Conscious Design" },
              { icon: CheckCircle2, text: "Evidence-Based Strategies" },
              { icon: Clock, text: "24/7 Support Access" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-1.5 bg-white/70 rounded-full px-3 py-1.5 border border-border/50">
                <Icon className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-medium">{text}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Login Cards */}
        <div className="grid md:grid-cols-2 gap-5 max-w-2xl mx-auto">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
            <button
              onClick={() => navigate("/ClientLogin")}
              className="w-full bg-white/90 backdrop-blur-sm border-2 border-border hover:border-primary/60 rounded-2xl p-8 transition-all group text-left shadow-sm hover:shadow-md"
            >
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 text-3xl" style={{ background: "linear-gradient(135deg, #e8f5f0, #d0ede8)" }}>
                👨‍👩‍👧
              </div>
              <h2 className="text-xl font-bold text-foreground mb-1.5">Parent / Client Login</h2>
              <p className="text-sm text-muted-foreground mb-4 leading-relaxed">Access your personalized support tools, behavior strategies, and AI assistance</p>
              <div className="flex items-center gap-2 text-primary font-semibold text-sm group-hover:gap-3 transition-all">
                Sign in <ArrowRight className="w-4 h-4" />
              </div>
            </button>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
            <button
              onClick={() => navigate("/ClinicianLogin")}
              className="w-full bg-white/90 backdrop-blur-sm border-2 border-border hover:border-primary/60 rounded-2xl p-8 transition-all group text-left shadow-sm hover:shadow-md"
            >
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 text-3xl" style={{ background: "linear-gradient(135deg, #eef3ff, #dde8ff)" }}>
                🩺
              </div>
              <h2 className="text-xl font-bold text-foreground mb-1.5">Clinician Login</h2>
              <p className="text-sm text-muted-foreground mb-4 leading-relaxed">Manage clients, upload care plans, and monitor behavioral progress</p>
              <div className="flex items-center gap-2 text-primary font-semibold text-sm group-hover:gap-3 transition-all">
                Sign in <ArrowRight className="w-4 h-4" />
              </div>
            </button>
          </motion.div>
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">How NeuroPathways Works</h2>
            <p className="text-muted-foreground">A complete behavioral support system for clinicians and families</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {HOW_IT_WORKS.map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 + i * 0.1 }}
                className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-border/50 shadow-sm text-center"
              >
                <div className="text-4xl mb-4">{item.icon}</div>
                <h3 className="font-bold text-foreground mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      <footer className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Brain className="w-3.5 h-3.5 text-primary" />
          <span className="font-semibold text-foreground">NeuroPathways</span>
        </div>
        <p>Behavioral health support platform for clinicians, families, and clients.</p>
      </footer>
    </div>
  );
}