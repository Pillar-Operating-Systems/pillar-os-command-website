import { ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { Sidebar } from "@/components/Sidebar";
import { useAuth, type Role } from "@/lib/auth";

export function AppShell({
  children,
  requireRole,
}: {
  children: ReactNode;
  requireRole?: Role;
}) {
  const { role } = useAuth();

  if (!role) return <Navigate to="/login" />;
  if (requireRole && role !== requireRole) return <Navigate to="/leads" />;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar />
      <main className="flex-1 min-w-0 pt-14 lg:pt-0">{children}</main>
    </div>
  );
}

export function Placeholder({ title }: { title: string }) {
  return (
    <AppShell>
      <div className="p-6 lg:p-10">
        <h1 className="text-2xl font-semibold text-[#0f172a]">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">Coming soon.</p>
      </div>
    </AppShell>
  );
}
