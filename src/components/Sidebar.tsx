import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Home, Users, GitBranch, Briefcase, UserCog, LogOut, Menu, X, Flame, BookOpen, Calendar as CalendarIcon, StickyNote, Cog } from "lucide-react";
import { useState } from "react";
import { useAuth, type Role } from "@/lib/auth";

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; roles: Role[] };

const NAV: NavItem[] = [
  { to: "/", label: "Home", icon: Home, roles: ["owner", "sales"] },
  { to: "/leads", label: "Leads Dashboard", icon: Users, roles: ["owner", "sales"] },
  { to: "/sales-grind", label: "Sales Grind", icon: Flame, roles: ["owner", "sales"] },
  { to: "/pipeline", label: "Pipeline", icon: GitBranch, roles: ["owner", "sales"] },
  { to: "/resources", label: "Resources", icon: BookOpen, roles: ["owner", "sales"] },
  { to: "/calendar", label: "Calendar", icon: CalendarIcon, roles: ["owner", "sales"] },
  { to: "/notes", label: "Notes", icon: StickyNote, roles: ["owner", "sales"] },
  { to: "/clients", label: "Clients", icon: Briefcase, roles: ["owner"] },
  { to: "/engine-room", label: "Engine Room", icon: Cog, roles: ["owner"] },
  { to: "/sales-team", label: "Staff", icon: UserCog, roles: ["owner"] },
];

export function Sidebar() {
  const { role, email, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  if (!role) return null;
  const items = NAV.filter((i) => i.roles.includes(role));

  const handleSignOut = () => {
    signOut();
    navigate({ to: "/login" });
  };

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-[#0f172a] text-white flex items-center justify-between px-4">
        <span className="font-semibold tracking-tight">PillarOS</span>
        <button onClick={() => setOpen(!open)} aria-label="Toggle menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/50"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:sticky top-0 left-0 z-30 h-screen w-64 bg-[#0f172a] text-white flex flex-col transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        <div className="h-16 px-6 flex items-center border-b border-white/10">
          <span className="text-lg font-semibold tracking-tight">
            Pillar<span className="text-[#2563eb]">OS</span>
          </span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {items.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={`relative flex items-center gap-3 px-4 py-2.5 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-white/5 text-white"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-[#2563eb]" />
                )}
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="text-xs text-white/50 mb-2 truncate">{email}</div>
          <div className="text-xs text-white/40 mb-3 uppercase tracking-wider">
            {role}
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-white/70 hover:bg-white/5 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
