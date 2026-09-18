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
    <div className="min-h-screen font-inter overflow-x-hidden" style={{ background: "linear-gradient(135deg, #f3f0ff 0%, #ede8f5 50%, #f0f4ff 100%)" }}>

      {/* Navbar */}
      <nav className="flex items-center justify-between flex-wrap gap-3 px-4 sm:px-6 py-4 sm:py-5 max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-sm">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-foreground text-lg tracking-tight">NeuroPathways</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/ClinicianLogin")}
            className="text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 sm:px-4 py-2 rounded-xl hover:bg-white/60"
          >
            Clinician
          </button>
          <button
            onClick={() => navigate("/ClientLogin")}
            className="text-xs sm:text-sm font-medium bg-primary text-white px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl hover:bg-primary/90 transition-colors shadow-sm"
          >
            Family Login
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

        {/* Login Cards — parent/family is primary */}
        <div className="flex flex-col items-center gap-5 max-w-2xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="w-full">
            <button
              onClick={() => navigate("/ClientLogin")}
              className="w-full bg-white backdrop-blur-sm border-2 border-primary/30 hover:border-primary/60 rounded-2xl p-8 md:p-10 transition-all group text-left shadow-md hover:shadow-lg"
            >
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 text-4xl" style={{ background: "linear-gradient(135deg, #e8f5f0, #d0ede8)" }}>
                👨‍👩‍👧
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Family and Client Login</h2>
              <p className="text-sm text-muted-foreground mb-5 leading-relaxed max-w-md">Access your personalized support tools, log behaviors, and get AI-powered guidance between sessions</p>
              <div className="inline-flex items-center gap-2 bg-primary text-white font-semibold text-sm px-6 py-3 rounded-xl group-hover:gap-3 transition-all shadow-sm">
                Get Started <ArrowRight className="w-4 h-4" />
              </div>
            </button>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="w-full max-w-md">
            <button
              onClick={() => navigate("/ClinicianLogin")}
              className="w-full bg-white/80 backdrop-blur-sm border border-border hover:border-primary/40 rounded-2xl px-6 py-5 transition-all group text-left shadow-sm hover:shadow-md"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0" style={{ background: "linear-gradient(135deg, #eef3ff, #dde8ff)" }}>
                  🩺
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold text-foreground">Clinician Portal</h2>
                  <p className="text-xs text-muted-foreground">Manage clients and care plans</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
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