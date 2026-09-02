import { useState, useEffect } from "react";
import { base44 } from '@/api/entities';
import { useAuth } from "@/lib/AuthContext";
import { getClientSession, saveClientSession, clearClientSession } from "@/lib/clientSession";
import { Moon, Sun, User, LogOut, Trash2, AlertTriangle, Check, Pencil, Phone, Lock, Eye, EyeOff, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

export default function Settings() {
  const navigate = useNavigate();
  const { logout, refreshUser } = useAuth();

  const clientSession = getClientSession();
  const isClientSession = !!clientSession;

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMsg, setNameMsg] = useState("");

  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneSaving, setPhoneSaving] = useState(false);

  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved) {
      if (saved === "dark") document.documentElement.classList.add("dark");
      else document.documentElement.classList.remove("dark");
      return saved === "dark";
    }
    return document.documentElement.classList.contains("dark");
  });

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");

  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState({ text: "", ok: false });

  const [acForm, setAcForm] = useState({ current: "", next: "", confirm: "" });
  const [showAc, setShowAc] = useState({ current: false, next: false, confirm: false });
  const [acSaving, setAcSaving] = useState(false);
  const [acMsg, setAcMsg] = useState({ text: "", ok: false });

  useEffect(() => {
    if (isClientSession) {
      const child = clientSession.children?.[0] || {};
      setUser({
        id: clientSession.id,
        display_name: child.child_name || clientSession.child_name || "",
        username: child.username || "",
        access_code: child.access_code || "",
        app_role: "client",
        account_type: child.account_type || "client",
      });
      setNameInput(child.child_name || clientSession.child_name || "");
      setLoading(false);
    } else {
      base44.auth.me().then(u => {
        setUser(u);
        setNameInput(u?.display_name || u?.full_name || "");
        setPhoneInput(u?.phone || "");
      }).catch(() => {}).finally(() => setLoading(false));
    }
  }, []);

  const handleSaveName = async () => {
    if (!nameInput.trim()) return;
    setNameSaving(true);
    setNameMsg("");
    try {
      await base44.auth.updateMe({ display_name: nameInput.trim() });
      setUser(prev => ({ ...prev, display_name: nameInput.trim() }));
      setEditingName(false);
      setNameMsg("Name updated.");
    } catch {
      setNameMsg("Failed to save.");
    }
    setNameSaving(false);
  };

  const handleSavePhone = async () => {
    setPhoneSaving(true);
    try {
      await base44.auth.updateMe({ phone: phoneInput.trim() });
      setUser(prev => ({ ...prev, phone: phoneInput.trim() }));
      setEditingPhone(false);
    } catch {}
    setPhoneSaving(false);
  };

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  const handleLogout = () => {
    if (isClientSession) {
      clearClientSession();
      window.location.href = "/";
    } else {
      logout();
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteInput !== "DELETE") return;
    if (isClientSession) {
      clearClientSession();
      window.location.href = "/";
    } else {
      await base44.auth.updateMe({ account_deletion_requested: true }).catch(() => {});
      logout();
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwMsg({ text: "", ok: false });
    if (!pwForm.current || !pwForm.next) { setPwMsg({ text: "Fill in all fields.", ok: false }); return; }
    if (pwForm.next.length < 8) { setPwMsg({ text: "New password must be at least 8 characters.", ok: false }); return; }
    if (pwForm.next !== pwForm.confirm) { setPwMsg({ text: "New passwords don't match.", ok: false }); return; }
    setPwSaving(true);
    try {
      const res = await fetch("/api/clinician/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: pwForm.current, new_password: pwForm.next }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setPwMsg({ text: data.error || "Failed to change password.", ok: false }); }
      else { setPwMsg({ text: "Password updated successfully.", ok: true }); setPwForm({ current: "", next: "", confirm: "" }); }
    } catch { setPwMsg({ text: "Network error — please try again.", ok: false }); }
    setPwSaving(false);
  };

  const handleChangeAccessCode = async (e) => {
    e.preventDefault();
    setAcMsg({ text: "", ok: false });
    if (!acForm.current || !acForm.next) { setAcMsg({ text: "Fill in all fields.", ok: false }); return; }
    if (acForm.next.length < 4) { setAcMsg({ text: "New access code must be at least 4 characters.", ok: false }); return; }
    if (acForm.next.toUpperCase() !== acForm.confirm.toUpperCase()) { setAcMsg({ text: "New access codes don't match.", ok: false }); return; }
    setAcSaving(true);
    try {
      const username = user?.username || clientSession?.children?.[0]?.username;
      const res = await fetch("/api/client-session/change-access-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, current_access_code: acForm.current, new_access_code: acForm.next }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setAcMsg({ text: data.error || "Failed to change access code.", ok: false });
      } else {
        saveClientSession(data.session);
        setAcMsg({ text: "Access code updated. Use your new code next time you sign in.", ok: true });
        setAcForm({ current: "", next: "", confirm: "" });
        const child = data.session.children?.[0] || {};
        setUser(prev => ({ ...prev, access_code: child.access_code || acForm.next.toUpperCase() }));
      }
    } catch { setAcMsg({ text: "Network error — please try again.", ok: false }); }
    setAcSaving(false);
  };

  const isClinicianRole = !isClientSession && (user?.app_role === "clinician" || user?.app_role === "admin");

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 md:p-8 max-w-xl mx-auto font-inter pb-16">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your account and preferences</p>
      </div>

      {/* Profile card */}
      {user && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-2xl p-6 mb-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
            <User className="w-3.5 h-3.5" /> Profile
          </h2>

          <div className="flex items-center gap-4 mb-5">
            <div className="w-14 h-14 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
              <span className="text-accent-foreground text-xl font-semibold">
                {(nameInput || user.display_name || user.full_name)?.[0]?.toUpperCase() || "U"}
              </span>
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground">
                {user.display_name || user.full_name || <span className="text-muted-foreground italic">No name set</span>}
              </p>
              {!isClientSession && user.email && <p className="text-sm text-muted-foreground">{user.email}</p>}
              {isClientSession && user.username && (
                <p className="text-sm text-muted-foreground font-mono">@{user.username}</p>
              )}
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary capitalize mt-1 inline-block">
                {isClientSession ? "client" : (user.app_role || user.role || "user")}
              </span>
            </div>
          </div>

          {/* Display Name — only for non-client sessions (clinicians / OIDC users) */}
          {!isClientSession && (
            <div className="mb-4">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Display Name</label>
              {editingName ? (
                <div className="flex gap-2">
                  <input
                    autoFocus type="text" value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSaveName()}
                    placeholder="Your full name"
                    className="flex-1 border border-border rounded-xl px-4 py-2.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 min-h-[44px]"
                  />
                  <button onClick={handleSaveName} disabled={nameSaving || !nameInput.trim()}
                    className="min-h-[44px] px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-1.5">
                    {nameSaving ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />} Save
                  </button>
                  <button onClick={() => { setEditingName(false); setNameInput(user.display_name || user.full_name || ""); }}
                    className="min-h-[44px] px-3 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setEditingName(true)}
                  className="w-full min-h-[44px] flex items-center justify-between px-4 py-2.5 rounded-xl border border-border bg-background hover:border-primary/40 transition-colors text-sm">
                  <span className={(user.display_name || user.full_name) ? "text-foreground" : "text-muted-foreground italic"}>
                    {user.display_name || user.full_name || "Tap to set your name"}
                  </span>
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              )}
              {nameMsg && <p className="text-xs text-muted-foreground mt-1.5">{nameMsg}</p>}
            </div>
          )}

          {/* Username — read-only for client sessions */}
          {isClientSession && user.username && (
            <div className="mb-4">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Username</label>
              <div className="w-full min-h-[44px] flex items-center px-4 py-2.5 rounded-xl border border-border bg-muted text-sm font-mono text-muted-foreground select-all">
                {user.username}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Your username was assigned by your clinician and cannot be changed.</p>
            </div>
          )}

          {/* Phone — only for non-client sessions */}
          {!isClientSession && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Phone Number</label>
              {editingPhone ? (
                <div className="flex gap-2">
                  <input autoFocus type="tel" value={phoneInput}
                    onChange={e => setPhoneInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSavePhone()}
                    placeholder="Your phone number"
                    className="flex-1 border border-border rounded-xl px-4 py-2.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 min-h-[44px]"
                  />
                  <button onClick={handleSavePhone} disabled={phoneSaving}
                    className="min-h-[44px] px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-1.5">
                    {phoneSaving ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />} Save
                  </button>
                  <button onClick={() => { setEditingPhone(false); setPhoneInput(user?.phone || ""); }}
                    className="min-h-[44px] px-3 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setEditingPhone(true)}
                  className="w-full min-h-[44px] flex items-center justify-between px-4 py-2.5 rounded-xl border border-border bg-background hover:border-primary/40 transition-colors text-sm">
                  <span className={user?.phone ? "text-foreground" : "text-muted-foreground italic"}>{user?.phone || "Tap to add phone number"}</span>
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* Password change — clinicians only */}
      {isClinicianRole && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }} className="bg-card border border-border rounded-2xl p-6 mb-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5" /> Change Password
          </h2>
          <form onSubmit={handleChangePassword} className="space-y-3">
            {[
              { id: "current", label: "Current Password", key: "current" },
              { id: "next", label: "New Password", key: "next" },
              { id: "confirm", label: "Confirm New Password", key: "confirm" },
            ].map(({ id, label, key }) => (
              <div key={id}>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">{label}</label>
                <div className="relative">
                  <input
                    type={showPw[key] ? "text" : "password"}
                    value={pwForm[key]}
                    onChange={e => setPwForm(p => ({ ...p, [key]: e.target.value }))}
                    className="w-full min-h-[44px] border border-border rounded-xl px-4 py-2.5 pr-10 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    placeholder={key === "current" ? "Your current password" : key === "next" ? "At least 8 characters" : "Repeat new password"}
                  />
                  <button type="button" onClick={() => setShowPw(p => ({ ...p, [key]: !p[key] }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1">
                    {showPw[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}
            {pwMsg.text && (
              <p className={`text-xs rounded-lg px-3 py-2 ${pwMsg.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                {pwMsg.text}
              </p>
            )}
            <Button type="submit" className="w-full rounded-xl gap-2" disabled={pwSaving}>
              {pwSaving ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
              {pwSaving ? "Saving..." : "Update Password"}
            </Button>
          </form>
        </motion.div>
      )}

      {/* Access code change — client sessions only */}
      {isClientSession && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }} className="bg-card border border-border rounded-2xl p-6 mb-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-2">
            <Key className="w-3.5 h-3.5" /> Change Access Code
          </h2>
          <p className="text-xs text-muted-foreground mb-4">This is the code you use to sign in. You can create a new one and share it with yourself.</p>
          <form onSubmit={handleChangeAccessCode} className="space-y-3">
            {[
              { id: "current", label: "Current Access Code", key: "current" },
              { id: "next", label: "New Access Code", key: "next" },
              { id: "confirm", label: "Confirm New Code", key: "confirm" },
            ].map(({ id, label, key }) => (
              <div key={id}>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">{label}</label>
                <div className="relative">
                  <input
                    type={showAc[key] ? "text" : "password"}
                    value={acForm[key]}
                    onChange={e => setAcForm(p => ({ ...p, [key]: e.target.value.toUpperCase() }))}
                    className="w-full min-h-[44px] border border-border rounded-xl px-4 py-2.5 pr-10 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono tracking-widest uppercase"
                    placeholder={key === "current" ? "Your current code" : "e.g. AB3X7Q"}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <button type="button" onClick={() => setShowAc(p => ({ ...p, [key]: !p[key] }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1">
                    {showAc[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}
            {acMsg.text && (
              <p className={`text-xs rounded-lg px-3 py-2 ${acMsg.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                {acMsg.text}
              </p>
            )}
            <Button type="submit" className="w-full rounded-xl gap-2" disabled={acSaving}>
              {acSaving ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
              {acSaving ? "Saving..." : "Update Access Code"}
            </Button>
          </form>
        </motion.div>
      )}

      {/* Appearance */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card border border-border rounded-2xl p-6 mb-4">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Appearance</h2>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {darkMode ? <Moon className="w-5 h-5 text-primary" /> : <Sun className="w-5 h-5 text-primary" />}
            <div>
              <p className="text-sm font-medium text-foreground">{darkMode ? "Dark Mode" : "Light Mode"}</p>
              <p className="text-xs text-muted-foreground">Toggle app theme</p>
            </div>
          </div>
          <button onClick={toggleDarkMode}
            className={`relative w-12 h-6 rounded-full transition-colors ${darkMode ? "bg-primary" : "bg-border"}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${darkMode ? "translate-x-6" : "translate-x-0"}`} />
          </button>
        </div>
      </motion.div>

      {/* Actions */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card border border-border rounded-2xl p-6 space-y-3">
        <Button variant="destructive" className="w-full gap-2 min-h-[44px]" onClick={handleLogout}>
          <LogOut className="w-4 h-4" /> Sign Out
        </Button>
        {!isClientSession && (
          <button onClick={() => setShowDeleteConfirm(true)}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 text-sm text-destructive/70 hover:text-destructive transition-colors">
            <Trash2 className="w-4 h-4" /> Delete Account
          </button>
        )}
      </motion.div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 p-4">
          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            className="bg-card rounded-2xl p-6 w-full max-w-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h2 className="font-bold text-foreground">Delete Account</h2>
                <p className="text-xs text-muted-foreground">This cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">Type <strong>DELETE</strong> to confirm your account will be flagged for removal.</p>
            <input type="text" value={deleteInput} onChange={e => setDeleteInput(e.target.value)}
              placeholder="Type DELETE to confirm"
              className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-background text-foreground mb-4 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-destructive/40"
            />
            <div className="flex gap-3">
              <button onClick={() => { setShowDeleteConfirm(false); setDeleteInput(""); }}
                className="flex-1 min-h-[44px] rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors">
                Cancel
              </button>
              <button onClick={handleDeleteAccount} disabled={deleteInput !== "DELETE"}
                className="flex-1 min-h-[44px] rounded-xl bg-destructive text-white text-sm font-medium disabled:opacity-40 transition-colors">
                Delete Account
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
