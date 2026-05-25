import { createFileRoute, useNavigate, Navigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { signUpWithAllowlist } from "@/lib/auth.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({ component: SignUp });

function SignUp() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const signUp = useServerFn(signUpWithAllowlist);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loading && role) return <Navigate to="/" />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim();
    if (!/^[A-Za-z0-9_]{3,}$/.test(u)) {
      toast.error("Username: letters, numbers, underscores only, min 3 characters");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setBusy(true);
    try {
      await signUp({ data: { email: email.trim(), username: u, password } });
      // sign them in
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        toast.success("Account created. Please sign in.");
        navigate({ to: "/login" });
        return;
      }
      toast.success("Welcome to PillarOS");
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign up failed");
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
          <p className="mt-2 text-sm text-slate-500">Create your account</p>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-8 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-slate-600 mb-2">Email address</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent"
                placeholder="you@example.com" />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-slate-600 mb-2">Username</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} pattern="[A-Za-z0-9_]+"
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent"
                placeholder="yourusername" />
              <p className="mt-1 text-xs text-slate-400">Letters, numbers, underscores. Min 3 characters.</p>
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-slate-600 mb-2">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent"
                placeholder="At least 8 characters" />
            </div>
            <button type="submit" disabled={busy}
              className="w-full py-2.5 rounded-md bg-[#2563eb] text-white text-sm font-medium hover:bg-[#1d4ed8] transition-colors disabled:opacity-60">
              {busy ? "Creating account…" : "Create account"}
            </button>
          </form>
          <p className="text-xs text-slate-500 text-center pt-3 border-t border-slate-100">
            Already have an account?{" "}
            <Link to="/login" className="text-[#2563eb] font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
