import { createContext, useContext, useState, ReactNode, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Role = "owner" | "sales";

interface AuthState {
  userId: string | null;
  email: string | null;
  role: Role | null;
  displayName: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, role: Role, displayName: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const ROLE_CACHE_KEY = "pillaros_auth_role";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(() => {
    if (typeof window === "undefined") return null;
    const v = localStorage.getItem(ROLE_CACHE_KEY);
    return v === "owner" || v === "sales" ? v : null;
  });
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (uid: string) => {
    const [{ data: roleRow }, { data: prof }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid).limit(1).maybeSingle(),
      supabase.from("profiles").select("display_name, email, username").eq("id", uid).maybeSingle(),
    ]);
    const r = (roleRow?.role as Role) ?? "sales";
    setRole(r);
    localStorage.setItem(ROLE_CACHE_KEY, r);
    setDisplayName((prof as { username?: string | null; display_name?: string | null } | null)?.username ?? prof?.display_name ?? null);
  }, []);

  useEffect(() => {
    // Listen FIRST to avoid races
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      setUserId(u?.id ?? null);
      setEmail(u?.email ?? null);
      if (u) {
        // defer to avoid recursive supabase calls inside the callback
        setTimeout(() => loadProfile(u.id), 0);
      } else {
        setRole(null);
        setDisplayName(null);
        localStorage.removeItem(ROLE_CACHE_KEY);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      setUserId(u?.id ?? null);
      setEmail(u?.email ?? null);
      if (u) loadProfile(u.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const signIn: AuthState["signIn"] = async (em, pw) => {
    const { error } = await supabase.auth.signInWithPassword({ email: em, password: pw });
    return error ? { error: error.message } : {};
  };

  const signUp: AuthState["signUp"] = async (em, pw, r, name) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email: em,
      password: pw,
      options: {
        emailRedirectTo: redirectUrl,
        data: { role: r, display_name: name },
      },
    });
    return error ? { error: error.message } : {};
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem(ROLE_CACHE_KEY);
  };

  return (
    <AuthContext.Provider value={{ userId, email, role, displayName, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
