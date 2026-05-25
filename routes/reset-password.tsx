import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({ component: ResetPassword });

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Supabase recovery link sets a session via the URL hash. Wait for it.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Password updated. You're signed in.");
      navigate({ to: "/" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-[#0f172a]">
            Pillar<span className="text-[#2563eb]">OS</span>
          </h1>
          <p className="mt-2 text-sm text-slate-500">Set a new password</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-8 space-y-5">
          {!ready ? (
            <p className="text-sm text-slate-500 text-center">
              Verifying your reset link…
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-slate-600 mb-2">New password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent"
                  placeholder="••••••••" />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-slate-600 mb-2">Confirm password</label>
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent"
                  placeholder="••••••••" />
              </div>
              <button type="submit" disabled={busy}
                className="w-full py-2.5 rounded-md bg-[#2563eb] text-white text-sm font-medium hover:bg-[#1d4ed8] transition-colors disabled:opacity-60">
                {busy ? "Updating…" : "Update password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
