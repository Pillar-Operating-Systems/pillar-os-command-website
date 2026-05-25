import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import type { Service, StageKey } from "./pipelineStore";

export type ClientStatus = "Active" | "Paused" | "Churned";
export type ClientPlan = "Starter" | "Growth" | "Pro";

export const EMPLOYEE_DEFS = [
  "AI Receptionist", "Lead Qualifier", "Follow-Up Agent", "Reputation Manager",
  "Social Media Manager", "Marketing Manager", "SEO Manager", "Operations Coordinator",
] as const;
export type EmployeeName = (typeof EMPLOYEE_DEFS)[number];
export type EmployeeStatus = "Active" | "Paused" | "Not configured";

export interface ExtraService {
  id: string; name: string; description: string; link: string;
  status: "Live" | "In Progress" | "Paused";
}
export interface CostBreakdown {
  vapi: number; twilio: number; searchAtlas: number; blotato: number; sendgrid: number; other: number;
}
export interface Client {
  id: string; businessName: string; industry: string; suburb: string;
  plan: ClientPlan; status: ClientStatus; mrr: number;
  ownerName: string; ownerMobile: string; ownerEmail: string;
  services: Service[];
  employees: Record<EmployeeName, EmployeeStatus>;
  extras: ExtraService[];
  stages: Partial<Record<StageKey, string>>;
  costs: CostBreakdown;
  oneTimeFees: number;
  notes: string;
  createdAt: string;
}

const defaultEmployees = (): Record<EmployeeName, EmployeeStatus> =>
  EMPLOYEE_DEFS.reduce((acc, e) => ({ ...acc, [e]: "Not configured" }), {} as Record<EmployeeName, EmployeeStatus>);
const defaultCosts = (): CostBreakdown => ({ vapi: 0, twilio: 0, searchAtlas: 0, blotato: 0, sendgrid: 0, other: 0 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToClient(r: any): Client {
  const bif = (r.bif_data ?? {}) as Record<string, unknown>;
  return {
    id: r.id,
    businessName: r.business_name,
    industry: r.industry ?? "Other",
    suburb: r.suburb ?? "",
    plan: (r.plan as ClientPlan) ?? "Starter",
    status: (r.status as ClientStatus) ?? "Active",
    mrr: Number(r.mrr) || 0,
    ownerName: r.owner_name ?? "",
    ownerMobile: r.owner_mobile ?? "",
    ownerEmail: r.owner_email ?? "",
    services: (bif.services as Service[]) ?? [],
    employees: { ...defaultEmployees(), ...((r.active_employees as Record<EmployeeName, EmployeeStatus>) ?? {}) },
    extras: (bif.extra_services as ExtraService[]) ?? [],
    stages: (bif.stages as Partial<Record<StageKey, string>>) ?? {},
    costs: { ...defaultCosts(), ...((bif.costs as Partial<CostBreakdown>) ?? {}) },
    oneTimeFees: Number(bif.one_time_fees) || 0,
    notes: r.internal_notes ?? "",
    createdAt: r.created_at,
  };
}

interface Ctx {
  clients: Client[];
  loading: boolean;
  addClient: (c: Partial<Client> & { businessName: string }) => Promise<string | null>;
  updateClient: (id: string, patch: Partial<Client>) => Promise<void>;
  removeClient: (id: string) => Promise<void>;
  getClient: (id: string) => Client | undefined;
}

const ClientsCtx = createContext<Ctx | null>(null);
const errorToast = () => toast.error("Something went wrong, please try again");

export function ClientsProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchClients = useCallback(async () => {
    const { data, error } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
    if (error) { errorToast(); return; }
    setClients((data ?? []).map(rowToClient));
  }, []);

  useEffect(() => {
    if (!userId) { setClients([]); setLoading(false); return; }
    setLoading(true);
    fetchClients().finally(() => setLoading(false));
  }, [userId, fetchClients]);

  const addClient: Ctx["addClient"] = async (c) => {
    const { data, error } = await supabase.from("clients").insert({
      business_name: c.businessName,
      industry: c.industry ?? "Other",
      suburb: c.suburb ?? "",
      plan: c.plan ?? "Starter",
      status: c.status ?? "Active",
      mrr: c.mrr ?? 0,
      owner_name: c.ownerName ?? "",
      owner_mobile: c.ownerMobile ?? "",
      owner_email: c.ownerEmail ?? "",
      active_employees: c.employees ?? {},
      bif_data: { services: c.services ?? [], extra_services: c.extras ?? [], stages: c.stages ?? {}, costs: c.costs ?? defaultCosts(), one_time_fees: c.oneTimeFees ?? 0 } as any,
      internal_notes: c.notes ?? "",
    }).select("id").maybeSingle();
    if (error || !data) { errorToast(); return null; }
    fetchClients();
    return data.id;
  };

  const updateClient: Ctx["updateClient"] = async (id, patch) => {
    const existing = clients.find((c) => c.id === id);
    const bif = {
      services: patch.services ?? existing?.services ?? [],
      extra_services: patch.extras ?? existing?.extras ?? [],
      stages: patch.stages ?? existing?.stages ?? {},
      costs: patch.costs ?? existing?.costs ?? defaultCosts(),
      one_time_fees: patch.oneTimeFees ?? existing?.oneTimeFees ?? 0,
    };
    const row: Record<string, unknown> = { bif_data: bif };
    if (patch.businessName !== undefined) row.business_name = patch.businessName;
    if (patch.industry !== undefined) row.industry = patch.industry;
    if (patch.suburb !== undefined) row.suburb = patch.suburb;
    if (patch.plan !== undefined) row.plan = patch.plan;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.mrr !== undefined) row.mrr = patch.mrr;
    if (patch.ownerName !== undefined) row.owner_name = patch.ownerName;
    if (patch.ownerMobile !== undefined) row.owner_mobile = patch.ownerMobile;
    if (patch.ownerEmail !== undefined) row.owner_email = patch.ownerEmail;
    if (patch.employees !== undefined) row.active_employees = patch.employees;
    if (patch.notes !== undefined) row.internal_notes = patch.notes;
    setClients((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const { error } = await supabase.from("clients").update(row as any).eq("id", id);
    if (error) { errorToast(); fetchClients(); }
  };

  const removeClient: Ctx["removeClient"] = async (id) => {
    setClients((cs) => cs.filter((c) => c.id !== id));
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) { errorToast(); fetchClients(); }
  };

  const getClient = useCallback((id: string) => clients.find((c) => c.id === id), [clients]);

  return (
    <ClientsCtx.Provider value={{ clients, loading, addClient, updateClient, removeClient, getClient }}>
      {children}
    </ClientsCtx.Provider>
  );
}

export function useClients() {
  const c = useContext(ClientsCtx);
  if (!c) throw new Error("useClients must be inside ClientsProvider");
  return c;
}
