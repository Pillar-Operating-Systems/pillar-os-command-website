import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";

export const SERVICE_OPTIONS = [
  "AI Receptionist",
  "Social Media Manager",
  "SEO Manager",
  "Lead Qualifier",
  "Follow-Up Agent",
  "Reputation Manager",
  "Marketing Manager",
  "Website",
  "Custom",
] as const;
export type Service = (typeof SERVICE_OPTIONS)[number];

export const DIGITAL_EMPLOYEE_SERVICES: Service[] = [
  "AI Receptionist",
  "Social Media Manager",
  "SEO Manager",
  "Lead Qualifier",
  "Follow-Up Agent",
  "Reputation Manager",
  "Marketing Manager",
];

export const INDUSTRIES = ["Trades", "Automotive", "Health", "Real Estate", "Legal", "Other"] as const;

export const STAGE_DEFS = [
  { key: "lead_interest", label: "Lead shows interest", always: true },
  { key: "audit_sent", label: "Audit sent", always: true },
  { key: "meeting_booked", label: "Meeting booked", always: true },
  { key: "proposal_sent", label: "Proposal sent", always: true },
  { key: "deposit_paid", label: "Deposit paid", always: true },
  { key: "contract_signed", label: "Contract signed", always: true },
  { key: "onboarding_sent", label: "Onboarding documents sent", always: true },
  { key: "onboarding_received", label: "Onboarding documents received", always: true },
  { key: "invoice_sent", label: "Invoice sent", always: true },
  { key: "invoice_paid", label: "Invoice paid", always: true },
  { key: "website_ordered", label: "Website ordered", requires: "website" as const },
  { key: "website_live", label: "Website live", requires: "website" as const },
  { key: "de_configured", label: "Digital employee configured", requires: "de" as const },
  { key: "de_live", label: "Digital employee live", requires: "de" as const },
  { key: "billing_active", label: "Monthly billing active", always: true },
] as const;

export interface LeadLike {
  business: string;
  industry: string;
  suburb?: string;
  phone: string;
}

export type StageKey = (typeof STAGE_DEFS)[number]["key"];

export function applicableStages(services: Service[]) {
  const hasWebsite = services.includes("Website");
  const hasDE = services.some((s) => DIGITAL_EMPLOYEE_SERVICES.includes(s));
  return STAGE_DEFS.filter((s) => {
    if ("always" in s && s.always) return true;
    if ("requires" in s) {
      if (s.requires === "website") return hasWebsite;
      if (s.requires === "de") return hasDE;
    }
    return false;
  });
}

export interface Deal {
  id: string;
  businessName: string;
  contactName: string;
  contactMobile: string;
  contactEmail: string;
  industry: string;
  suburb: string;
  assignedTo: string;
  services: Service[];
  dealValue: number;
  mrr: number;
  setupFee: number;
  websiteFee: number;
  otherFee: number;
  otherFeeLabel: string;
  notes: string;
  nextAction: string;
  nextActionDate: string;
  stages: Partial<Record<StageKey, string>>;
  createdAt: string;
  needsConfig?: boolean;
  status?: string;
  waitingReason?: string;
  clientApproved?: boolean;
  clientApprovedDate?: string;
}


export function dealOneTimeTotal(d: Pick<Deal, "setupFee" | "websiteFee" | "otherFee">) {
  return (d.setupFee || 0) + (d.websiteFee || 0) + (d.otherFee || 0);
}
export function dealContractValue(d: Pick<Deal, "setupFee" | "websiteFee" | "otherFee" | "mrr">) {
  return dealOneTimeTotal(d) + (d.mrr || 0) * 12;
}

interface Ctx {
  deals: Deal[];
  addDeal: (d: Omit<Deal, "id" | "stages" | "createdAt">) => void;
  addDealFromLead: (lead: LeadLike, assignedTo: string) => void;
  updateDeal: (id: string, patch: Partial<Deal>) => void;
  toggleStage: (id: string, key: StageKey) => void;
  removeDeal: (id: string) => void;
}

const PipelineCtx = createContext<Ctx | null>(null);
const KEY = "pillaros.pipeline.v1";

export function PipelineProvider({ children }: { children: ReactNode }) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setDeals(JSON.parse(raw));
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(KEY, JSON.stringify(deals));
  }, [deals, hydrated]);

  const addDeal: Ctx["addDeal"] = useCallback((d) => {
    setDeals((ds) => [
      { ...d, id: crypto.randomUUID(), stages: {}, createdAt: new Date().toISOString() },
      ...ds,
    ]);
  }, []);

  const updateDeal: Ctx["updateDeal"] = useCallback((id, patch) => {
    setDeals((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }, []);

  const toggleStage: Ctx["toggleStage"] = useCallback((id, key) => {
    setDeals((ds) =>
      ds.map((d) => {
        if (d.id !== id) return d;
        const stages = { ...d.stages };
        if (stages[key]) delete stages[key];
        else stages[key] = new Date().toISOString().slice(0, 10);
        return { ...d, stages };
      })
    );
  }, []);

  const removeDeal: Ctx["removeDeal"] = useCallback((id) => {
    setDeals((ds) => ds.filter((d) => d.id !== id));
  }, []);

  const addDealFromLead: Ctx["addDealFromLead"] = useCallback((lead, assignedTo) => {
    const today = new Date().toISOString().slice(0, 10);
    const exists = (ds: Deal[]) =>
      ds.some((d) => d.businessName === lead.business && d.contactMobile === lead.phone);
    setDeals((ds) => {
      if (exists(ds)) return ds;
      const newDeal: Deal = {
        id: crypto.randomUUID(),
        businessName: lead.business,
        contactName: "",
        contactMobile: lead.phone,
        contactEmail: "",
        industry: lead.industry,
        suburb: lead.suburb ?? "",
        assignedTo,
        services: [],
        dealValue: 0,
        mrr: 0,
        setupFee: 0,
        websiteFee: 0,
        otherFee: 0,
        otherFeeLabel: "",
        notes: "",
        nextAction: "",
        nextActionDate: "",
        stages: { lead_interest: today },
        createdAt: new Date().toISOString(),
        needsConfig: true,
      };
      return [newDeal, ...ds];
    });
  }, []);

  return (
    <PipelineCtx.Provider value={{ deals, addDeal, addDealFromLead, updateDeal, toggleStage, removeDeal }}>
      {children}
    </PipelineCtx.Provider>
  );
}

export function usePipeline() {
  const c = useContext(PipelineCtx);
  if (!c) throw new Error("usePipeline must be inside PipelineProvider");
  return c;
}
