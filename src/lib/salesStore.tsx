import { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export type LeadStatus = "new" | "contacted" | "follow_up" | "pipeline" | "archived";

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  follow_up: "Follow Up",
  pipeline: "In Pipeline",
  archived: "Archived",
};
export type WebScore = "Good" | "Poor" | "None";

export interface Lead {
  id: string;
  business: string;
  industry: string;
  suburb: string;
  phone: string;
  website: string;
  rating: number;
  reviewCount: number;
  webScore: WebScore;
  whyNeedUs: string;
  coldCallOpener: string;
  pillarOSPitch: string;
  notes?: string;
  lastContacted: string | null;
  status: LeadStatus;
  followUpDate?: string | null;
  followUpNotes?: string;
  createdAt?: string | null;
}

interface Counters { followUps: number; sentToPipeline: number; contacted: number; }

const STATUS_NORMALIZE: Record<string, LeadStatus> = {
  new: "new",
  contacted: "contacted",
  follow_up: "follow_up",
  pipeline: "pipeline",
  in_pipeline: "pipeline",
  archived: "archived",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToLead(r: any): Lead {
  return {
    id: r.id,
    business: r.business_name ?? "",
    industry: r.industry ?? "",
    suburb: r.suburb ?? "",
    phone: r.phone ?? "",
    website: r.website ?? "",
    rating: Number(r.rating) || 0,
    reviewCount: r.review_count ?? 0,
    webScore: (r.web_score as WebScore) ?? "None",
    whyNeedUs: r.why_need_us ?? "",
    coldCallOpener: r.cold_call_opener ?? "",
    pillarOSPitch: r.pillaros_pitch ?? "",
    notes: r.notes ?? "",
    lastContacted: r.last_contacted ?? null,
    status: STATUS_NORMALIZE[String(r.status).toLowerCase()] ?? "new",
    followUpDate: r.follow_up_date ?? null,
    followUpNotes: r.follow_up_notes ?? "",
    createdAt: r.created_at ?? null,
  };
}

export interface SalesState {
  newLeadsCount: number;
  live: boolean;
  version: number;
  xp: number;
  counters: Counters;
  actionsCount: number;
  sessionActions: number;
  addXp: (n: number) => void;
  refresh: () => void;
  addLead: (lead: Omit<Lead, "id" | "lastContacted" | "status">) => Promise<void>;
  importLeads: (leads: Omit<Lead, "id" | "lastContacted" | "status">[]) => Promise<void>;
  archiveLead: (id: string) => Promise<void>;
  setFollowUp: (id: string, date: string, notes: string) => Promise<void>;
  sendToPipeline: (id: string) => Promise<void>;
  moveToPipelineFromLeads: (lead: Lead) => Promise<void>;
  skipNoAnswer: (id: string) => Promise<void>;
  restoreLead: (id: string) => Promise<void>;
  markContacted: (id: string) => Promise<void>;
}

const Ctx = createContext<SalesState | null>(null);

export const LEVELS = [
  { level: 1, name: "Rookie", threshold: 0 },
  { level: 2, name: "Prospector", threshold: 250 },
  { level: 3, name: "Closer in Training", threshold: 600 },
  { level: 4, name: "Sales Hunter", threshold: 1000 },
  { level: 5, name: "Deal Maker", threshold: 1500 },
  { level: 6, name: "Pipeline Master", threshold: 2500 },
];
export function getLevel(xp: number) {
  let current = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.threshold) current = l;
  const next = LEVELS.find((l) => l.threshold > xp);
  return { current, next };
}

const todayStr = () => new Date().toISOString().slice(0, 10);
const XP_KEY = "pillaros.xp";
const COUNTERS_KEY = "pillaros.counters";

const errorToast = () => toast.error("Something went wrong, please try again");

export function SalesProvider({ children }: { children: ReactNode }) {
  const { userId, displayName, email } = useAuth();
  const [newLeadsCount, setNewLeadsCount] = useState(0);
  const [live, setLive] = useState(false);
  const [version, setVersion] = useState(0);
  const [xp, setXp] = useState<number>(() => {
    if (typeof window === "undefined") return 1240;
    const v = localStorage.getItem(XP_KEY);
    return v ? Number(v) : 1240;
  });
  const [counters, setCounters] = useState<Counters>(() => {
    if (typeof window === "undefined") return { followUps: 0, sentToPipeline: 0, contacted: 0 };
    try { return JSON.parse(localStorage.getItem(COUNTERS_KEY) || "") || { followUps: 0, sentToPipeline: 0, contacted: 0 }; }
    catch { return { followUps: 0, sentToPipeline: 0, contacted: 0 }; }
  });
  const [actionsCount, setActionsCount] = useState(0);
  const [sessionActions, setSessionActions] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => { localStorage.setItem(XP_KEY, String(xp)); }, [xp]);
  useEffect(() => { localStorage.setItem(COUNTERS_KEY, JSON.stringify(counters)); }, [counters]);

  const fetchNewCount = useCallback(async () => {
    const { count, error } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("status", "new");
    if (!error && typeof count === "number") setNewLeadsCount(count);
  }, []);

  const bump = useCallback(() => { setVersion((v) => v + 1); fetchNewCount(); }, [fetchNewCount]);
  const refresh = bump;

  useEffect(() => {
    if (!userId) { setLive(false); setNewLeadsCount(0); return; }
    fetchNewCount();

    const ch = supabase
      .channel("leads-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => { bump(); })
      .subscribe((status) => { setLive(status === "SUBSCRIBED"); });
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); setLive(false); };
  }, [userId, fetchNewCount, bump]);

  const addXp = useCallback((n: number) => setXp((x) => x + n), []);
  const bumpAction = useCallback(() => {
    setActionsCount((n) => n + 1);
    setSessionActions((n) => n + 1);
  }, []);

  const addLead: SalesState["addLead"] = async (l) => {
    const assigned = displayName || (email ? email.split("@")[0] : "");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("leads").insert({
      business_name: l.business, industry: l.industry, suburb: l.suburb, phone: l.phone,
      website: l.website, rating: l.rating, review_count: l.reviewCount, web_score: l.webScore,
      why_need_us: l.whyNeedUs, cold_call_opener: l.coldCallOpener, pillaros_pitch: l.pillarOSPitch,
      notes: l.notes ?? "", status: "contacted", created_by: userId, assigned_to: assigned,
      source: "manual", last_contacted: todayStr(),
    } as any);
    if (error) { errorToast(); return; }
    toast.success("Lead added successfully");
    bump();
  };

  const importLeads: SalesState["importLeads"] = async (rows) => {
    if (!rows.length) return;
    const payload = rows.map((l) => ({
      business_name: l.business, industry: l.industry, suburb: l.suburb, phone: l.phone,
      website: l.website, rating: l.rating, review_count: l.reviewCount, web_score: l.webScore,
      why_need_us: l.whyNeedUs, cold_call_opener: l.coldCallOpener, pillaros_pitch: l.pillarOSPitch,
      notes: l.notes ?? "", status: "new", created_by: userId,
    }));
    const { error } = await supabase.from("leads").upsert(payload, { onConflict: "business_name,phone" });
    if (error) { errorToast(); return; }
    toast.success(`Imported ${rows.length} lead${rows.length === 1 ? "" : "s"}`);
    bump();
  };

  const recordAction = useCallback(
    async (id: string, action: "called" | "archived" | "follow_up" | "pipeline", business: string) => {
      if (!userId) return;
      await supabase.from("analytics").insert({
        user_id: userId,
        action_type: action,
        lead_id: id,
        lead_business_name: business,
      });
    },
    [userId],
  );

  const fetchLeadName = async (id: string): Promise<string> => {
    const { data } = await supabase.from("leads").select("business_name").eq("id", id).maybeSingle();
    return (data?.business_name as string) ?? "";
  };

  const updateStatus = async (id: string, patch: Record<string, unknown>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("leads").update(patch as any).eq("id", id);
    if (error) { errorToast(); }
    bump();
  };

  const archiveLead = async (id: string) => {
    const name = await fetchLeadName(id);
    await updateStatus(id, { status: "archived" });
    await recordAction(id, "archived", name);
    addXp(5); bumpAction();
  };

  const setFollowUp = async (id: string, date: string, notes: string) => {
    const name = await fetchLeadName(id);
    await updateStatus(id, { status: "follow_up", follow_up_date: date, follow_up_notes: notes, last_contacted: todayStr() });
    await recordAction(id, "follow_up", name);
    setCounters((c) => ({ ...c, followUps: c.followUps + 1, contacted: c.contacted + 1 }));
    addXp(10); bumpAction();
  };

  const sendToPipeline = async (id: string) => {
    const name = await fetchLeadName(id);
    await updateStatus(id, { status: "pipeline", last_contacted: todayStr() });
    await recordAction(id, "pipeline", name);
    setCounters((c) => ({ ...c, sentToPipeline: c.sentToPipeline + 1, contacted: c.contacted + 1 }));
    addXp(50); bumpAction();
  };

  const skipNoAnswer = async (id: string) => {
    const name = await fetchLeadName(id);
    await updateStatus(id, { last_contacted: todayStr() });
    await recordAction(id, "called", name);
    addXp(2); bumpAction();
  };

  const restoreLead = async (id: string) => { await updateStatus(id, { status: "new", follow_up_date: null, follow_up_notes: "" }); };
  const markContacted = async (id: string) => {
    const name = await fetchLeadName(id);
    await updateStatus(id, { status: "contacted", last_contacted: todayStr() });
    await recordAction(id, "called", name);
  };

  const moveToPipelineFromLeads: SalesState["moveToPipelineFromLeads"] = async (lead) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const assigned = sessionData.session?.user?.id ?? userId ?? "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dealErr } = await supabase.from("pipeline_deals").insert({
      business_name: lead.business,
      contact_mobile: lead.phone,
      industry: lead.industry,
      suburb: lead.suburb,
      assigned_to: assigned,
      status: "needs_configuration",
    } as any);
    if (dealErr) { console.error("pipeline_deals insert failed", dealErr); errorToast(); return; }
    await updateStatus(lead.id, { status: "pipeline", last_contacted: todayStr() });
    await recordAction(lead.id, "pipeline", lead.business);
    setCounters((c) => ({ ...c, sentToPipeline: c.sentToPipeline + 1 }));
    addXp(50); bumpAction();
    toast.success("Moved to Pipeline");
  };

  return (
    <Ctx.Provider value={{
      newLeadsCount, live, version, xp, counters, actionsCount, sessionActions,
      addXp, refresh, addLead, importLeads, archiveLead, setFollowUp, sendToPipeline,
      moveToPipelineFromLeads, skipNoAnswer, restoreLead, markContacted,
    }}>{children}</Ctx.Provider>
  );
}

export function useSales() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSales must be inside SalesProvider");
  return c;
}
