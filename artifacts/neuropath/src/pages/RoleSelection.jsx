import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from '@/api/entities';
import { Brain, Stethoscope, Heart } from "lucide-react";
import { motion } from "framer-motion";

export default function RoleSelection() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(null);

  const selectRole = async (role) => {
    setLoading(role);
    await base44.auth.updateMe({ role });
    if (role === "clinician") {
      navigate(createPageUrl("ClinicianDashboard"));
    } else {
      navigate(createPageUrl("ParentDashboard"));
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 font-inter">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-10">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-5 shadow-lg shadow-primary/25">
            <Brain className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">How will you use Aspire?</h1>
          <p className="text-muted-foreground text-sm">Choose your role to personalize your experience</p>
        </div>

        <div className="space-y-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => selectRole("clinician")}
            disabled={!!loading}
            className="w-full bg-card border-2 border-border hover:border-primary rounded-2xl p-6 text-left transition-all group"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center transition-colors flex-shrink-0">
                <Stethoscope className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-base">I am a Clinician</p>
                <p className="text-muted-foreground text-sm mt-1 leading-relaxed">
                  Create behavior plans, manage clients, and build personalized strategies for families.
                </p>
              </div>
            </div>
            {loading === "clinician" && (
              <div className="mt-3 flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-primary"
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
                  />
                ))}
              </div>
            )}
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => selectRole("parent")}
            disabled={!!loading}
            className="w-full bg-card border-2 border-border hover:border-accent rounded-2xl p-6 text-left transition-all group"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-accent/10 group-hover:bg-accent/20 flex items-center justify-center transition-colors flex-shrink-0">
                <Heart className="w-6 h-6 text-accent" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-base">I am a Parent</p>
                <p className="text-muted-foreground text-sm mt-1 leading-relaxed">
                  Access your child's behavior plan and get AI-powered guidance in the moment.
                </p>
              </div>
            </div>
            {loading === "parent" && (
              <div className="mt-3 flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-accent"
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
                  />
                ))}
              </div>
            )}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}