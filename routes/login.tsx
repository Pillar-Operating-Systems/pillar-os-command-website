import { createFileRoute, useNavigate, Navigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { lookupEmailByUsername } from "@/lib/auth.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const lookup = useServerFn(lookupEmailByUsername);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loading && role) return <Navigate to="/" />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setBusy(true);
    try {
      const { email } = await lookup({ data: { username: username.trim() } });
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (/invalid/i.test(error.message)) toast.error("Incorrect password");
        else toast.error(error.message);
        return;
      }
      navigate({ to: "/" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign in failed";
      toast.error(msg);
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
          <p className="mt-2 text-sm text-slate-500">Command Centre</p>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-8 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-slate-600 mb-2">Username</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username"
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent"
                placeholder="yourusername" />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-slate-600 mb-2">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password"
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent"
                placeholder="••••••••" />
            </div>
            <button type="submit" disabled={busy}
              className="w-full py-2.5 rounded-md bg-[#2563eb] text-white text-sm font-medium hover:bg-[#1d4ed8] transition-colors disabled:opacity-60">
              {busy ? "Please wait…" : "Sign in"}
            </button>
          </form>
          <div className="text-xs text-slate-500 text-center pt-3 border-t border-slate-100 space-y-2">
            <p>
              Been authorised by your administrator?{" "}
              <Link to="/signup" className="text-[#2563eb] font-medium hover:underline">
                Create your account
              </Link>
            </p>
            <p className="text-slate-400">Access to PillarOS Command Centre is by invitation only.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
