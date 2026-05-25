import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import {
  usePipeline,
  SERVICE_OPTIONS,
  INDUSTRIES,
  STAGE_DEFS,
  applicableStages,
  dealOneTimeTotal,
  dealContractValue,
  type Service,
  type Deal,
  type StageKey,
} from "@/lib/pipelineStore";
import { useClients } from "@/lib/clientsStore";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, ChevronDown, ChevronUp, Trash2, Pencil, Settings2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/pipeline")({
  component: PipelinePage,
});

const PRIMARY = "#2563eb";
const NAVY = "#0f172a";

function PipelinePage() {
  return (
    <AppShell>
      <Inner />
    </AppShell>
  );
}

type DialogMode =
  | { kind: "new" }
  | { kind: "configure"; deal: Deal }
  | { kind: "edit"; deal: Deal }
  | null;

function Inner() {
  const { role, email, userId, displayName } = useAuth();
  const { deals: localDeals, addDeal, updateDeal, removeDeal } = usePipeline();
  const { addClient } = useClients();

  const isOwner = role === "owner";
  const me = (email ?? "").toLowerCase();
  const myId = userId ?? "";

  const [remoteDeals, setRemoteDeals] = useState<Deal[]>([]);
  const [usernameById, setUsernameById] = useState<Record<string, string>>({});

  const idByUsername = useMemo(() => {
    const m: Record<string, string> = {};
    for (const [id, name] of Object.entries(usernameById)) {
      if (name) m[name.toLowerCase()] = id;
    }
    return m;
  }, [usernameById]);

  const createTask = useCallback(async (input: {
    title: string;
    due_date: string;
    assigned_to: string | null;
    notes?: string;
  }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("tasks") as any).insert({
      title: input.title,
      due_date: input.due_date,
      assigned_to: input.assigned_to,
      description: input.notes ?? "",
      task_type: "task",
      priority: "Task",
      status: "pending",
      created_by: userId ?? null,
    });
    if (error) console.error("auto task create failed", error);
  }, [userId]);

  const fetchProfiles = useCallback(async () => {
    const { data, error } = await supabase.from("profiles").select("id, username, display_name, email");
    if (error) { console.error("profiles fetch failed", error); return; }
    const map: Record<string, string> = {};
    for (const p of data ?? []) {
      const row = p as { id: string; username: string | null; display_name: string | null; email: string | null };
      map[row.id] = row.username ?? row.display_name ?? row.email ?? row.id;
    }
    setUsernameById(map);
  }, []);

  const fetchRemote = useCallback(async () => {
    const { data, error } = await supabase
      .from("pipeline_deals")
      .select("*")
      .neq("status", "graduated")
      .order("created_at", { ascending: false });
    if (error) { console.error("pipeline_deals fetch failed", error); return; }
    const mapped: Deal[] = (data ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      businessName: (r.business_name as string) ?? "",
      contactName: (r.contact_name as string) ?? "",
      contactMobile: (r.contact_mobile as string) ?? "",
      contactEmail: (r.contact_email as string) ?? "",
      industry: (r.industry as string) ?? "",
      suburb: (r.suburb as string) ?? "",
      assignedTo: (r.assigned_to as string) ?? "",
      services: (Array.isArray(r.services) ? (r.services as Service[]) : []),
      dealValue: Number(r.deal_value) || 0,
      mrr: Number(r.mrr) || 0,
      setupFee: Number(r.setup_fee) || 0,
      websiteFee: Number(r.website_fee) || 0,
      otherFee: Number(r.other_fee) || 0,
      otherFeeLabel: (r.other_fee_label as string) ?? "",
      notes: (r.notes as string) ?? "",
      nextAction: (r.next_action as string) ?? "",
      nextActionDate: (r.next_action_date as string) ?? "",
      stages: (r.stages && typeof r.stages === "object" ? (r.stages as Partial<Record<StageKey, string>>) : {}),
      createdAt: (r.created_at as string) ?? new Date().toISOString(),
      needsConfig: r.status === "needs_configuration",
      status: (r.status as string) ?? "active",
      waitingReason: (r.waiting_reason as string) ?? "",
      clientApproved: !!(r as Record<string, unknown>).client_approved,
      clientApprovedDate: ((r as Record<string, unknown>).client_approved_date as string) ?? "",
    }));

    setRemoteDeals(mapped);
  }, []);

  useEffect(() => {
    fetchProfiles();
    fetchRemote();
    const ch = supabase
      .channel("pipeline_deals-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "pipeline_deals" }, () => { fetchRemote(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchRemote, fetchProfiles]);

  const displayAssigned = useCallback(
    (raw: string) => usernameById[raw] ?? raw,
    [usernameById]
  );

  const deals = useMemo(() => {
    const byId = new Map<string, Deal>();
    for (const d of remoteDeals) byId.set(d.id, d);
    for (const d of localDeals) if (!byId.has(d.id)) byId.set(d.id, d);
    return Array.from(byId.values());
  }, [remoteDeals, localDeals]);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "mine" | string>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Toggle a stage and persist to Supabase, then refetch
  const handleToggleStage = useCallback(async (deal: Deal, key: StageKey) => {
    const next = { ...(deal.stages || {}) } as Partial<Record<StageKey, string>>;
    if (next[key]) delete next[key];
    else next[key] = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from("pipeline_deals")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ stages: next } as any)
      .eq("id", deal.id);
    if (error) { console.error("stage update failed", error); toast.error("Failed to update stage"); return; }
    await fetchRemote();
  }, [fetchRemote]);

  const [approveTarget, setApproveTarget] = useState<Deal | null>(null);
  const handleApproveDelivery = useCallback((deal: Deal) => {
    setApproveTarget(deal);
  }, []);
  const confirmApproveDelivery = useCallback(async () => {
    if (!approveTarget) return;
    const { error } = await supabase
      .from("pipeline_deals")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ status: "approved_for_delivery" } as any)
      .eq("id", approveTarget.id);
    if (error) { console.error(error); toast.error("Failed to approve"); setApproveTarget(null); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: depErr } = await (supabase.from("deployments" as any) as any).insert({
      client_name: approveTarget.businessName,
      deal_id: approveTarget.id,
      assigned_to: displayName ?? email ?? null,
      status: "pending",
    });
    if (depErr) console.error("Failed to create deployment record", depErr);
    const today = new Date().toISOString().slice(0, 10);
    const dealAssignee = idByUsername[(approveTarget.assignedTo ?? "").toLowerCase()] ?? null;
    await createTask({
      title: `Send onboarding documents — ${approveTarget.businessName}`,
      due_date: today,
      assigned_to: dealAssignee,
    });
    setApproveTarget(null);
    toast.success("Deal approved for delivery.");
    await fetchRemote();
  }, [approveTarget, fetchRemote, displayName, email, idByUsername, createTask]);

  const handleSetWaiting = useCallback(async (deal: Deal, reason: string) => {
    const { error } = await supabase
      .from("pipeline_deals")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ waiting_reason: reason || null } as any)
      .eq("id", deal.id);
    if (error) { console.error(error); toast.error("Failed to save"); return; }
    await fetchRemote();
  }, [fetchRemote]);

  const [deliverTarget, setDeliverTarget] = useState<Deal | null>(null);
  const handleServiceDelivered = useCallback((deal: Deal) => setDeliverTarget(deal), []);
  const confirmServiceDelivered = useCallback(async () => {
    if (!deliverTarget) return;
    const { error } = await supabase
      .from("pipeline_deals")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ status: "service_delivered" } as any)
      .eq("id", deliverTarget.id);
    const target = deliverTarget;
    setDeliverTarget(null);
    if (error) { console.error(error); toast.error("Failed to confirm delivery"); return; }
    const today = new Date().toISOString().slice(0, 10);
    await createTask({
      title: `Activate monthly billing — ${target.businessName}`,
      due_date: today,
      assigned_to: userId ?? null,
    });
    toast.success("Service delivery confirmed. Deal moved to Phase 3.");
    await fetchRemote();
  }, [deliverTarget, fetchRemote, createTask, userId]);

  const [approveClientTarget, setApproveClientTarget] = useState<Deal | null>(null);
  const handleClientApproved = useCallback((deal: Deal) => setApproveClientTarget(deal), []);
  const confirmClientApproved = useCallback(async () => {
    if (!approveClientTarget) return;
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from("pipeline_deals")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ client_approved: true, client_approved_date: today } as any)
      .eq("id", approveClientTarget.id);
    setApproveClientTarget(null);
    if (error) { console.error(error); toast.error("Failed to save approval"); return; }
    toast.success("Client approval recorded.");
    await fetchRemote();
  }, [approveClientTarget, fetchRemote]);


  const visible = useMemo(() => {
    let list = deals;
    if (filter === "mine") {
      list = list.filter((d) => d.assignedTo === myId || d.assignedTo.toLowerCase().includes(me));
    } else if (filter !== "all") {
      list = list.filter((d) => d.assignedTo === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((d) => d.businessName.toLowerCase().includes(q));
    }
    return list;
  }, [deals, filter, search, me, myId]);

  const needsConfigDeals = visible.filter((d) => d.needsConfig);
  const pipelineDeals = visible.filter((d) => !d.needsConfig);

  const totalValue = pipelineDeals.reduce((s, d) => s + dealContractValue(d), 0);
  const totalOneTime = pipelineDeals.reduce((s, d) => s + dealOneTimeTotal(d), 0);
  const totalMrr = pipelineDeals.reduce((s, d) => s + (d.mrr || 0), 0);

  const teamMembers = useMemo(
    () => Array.from(new Set(deals.map((d) => d.assignedTo).filter(Boolean))),
    [deals]
  );

  const onGraduate = async (deal: Deal) => {
    addClient({
      businessName: deal.businessName,
      industry: deal.industry,
      suburb: deal.suburb,
      mrr: deal.mrr,
      oneTimeFees: dealOneTimeTotal(deal),
      services: deal.services,
      stages: deal.stages,
      ownerName: deal.contactName,
      ownerMobile: deal.contactMobile,
      ownerEmail: deal.contactEmail,
      notes: deal.notes,
      extras: deal.services.filter((s) => s === "Website" || s === "Custom").map((s) => ({
        id: crypto.randomUUID(),
        name: s,
        description: s === "Website" ? "Website delivered via Pipeline" : "Custom service from Pipeline",
        link: "",
        status: "In Progress" as const,
      })),
    });
    removeDeal(deal.id);
    const due = new Date();
    due.setMonth(due.getMonth() + 1);
    await createTask({
      title: `Monthly report due — ${deal.businessName}`,
      due_date: due.toISOString().slice(0, 10),
      assigned_to: userId ?? null,
      notes: "Recurring monthly — recreate this task each month when completed",
    });
    toast.success(`${deal.businessName} graduated to Clients`);
  };

  const jumpToDeal = (id: string) => {
    setExpanded((e) => ({ ...e, [id]: true }));
    setHighlightId(id);
    setTimeout(() => {
      cardRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    setTimeout(() => setHighlightId(null), 2000);
  };

  return (
    <div className="p-6 lg:p-10 max-w-[1600px]">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: NAVY }}>Pipeline</h1>
          <p className="text-xs text-slate-500 mt-1">Pipeline data saved locally — Supabase sync coming soon.</p>
        </div>
        <Button onClick={() => setDialog({ kind: "new" })} style={{ background: PRIMARY }} className="text-white hover:opacity-90">
          <Plus className="h-4 w-4 mr-1" /> Add New Deal
        </Button>
      </div>

      {/* Stats / Filters */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Contract Value" value={`$${totalValue.toLocaleString()}`} />
        <StatCard label="MRR / mo · One-time" value={`$${totalMrr.toLocaleString()} · $${totalOneTime.toLocaleString()}`} />
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <Label className="text-xs text-slate-500">Filter</Label>
          <Select value={filter} onValueChange={(v) => setFilter(v)}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Deals</SelectItem>
              <SelectItem value="mine">My Deals</SelectItem>
              {isOwner && teamMembers.filter((m) => m !== myId).map((m) => (
                <SelectItem key={m} value={m}>{displayAssigned(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <Label className="text-xs text-slate-500">Search</Label>
          <Input
            placeholder="Search by business name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mt-1.5"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-4">
          {needsConfigDeals.length > 0 && (
            <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Settings2 className="h-4 w-4 text-amber-700" />
                <div className="text-sm font-semibold text-amber-900">Needs configuration</div>
              </div>
              <div className="text-xs text-amber-800 mb-3">
                Complete these details before moving to pipeline.
              </div>
              <div className="space-y-2">
                {needsConfigDeals.map((d) => (
                  <div key={d.id} className="bg-white rounded-md border border-amber-200 p-3 flex items-center justify-between flex-wrap gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold" style={{ color: NAVY }}>{d.businessName}</div>
                      <div className="text-xs text-slate-600">
                        {d.industry}{d.suburb ? ` · ${d.suburb}` : ""}{d.contactMobile ? ` · ${d.contactMobile}` : ""}
                      </div>
                    </div>
                    <Button onClick={() => setDialog({ kind: "configure", deal: d })} style={{ background: PRIMARY }} className="text-white hover:opacity-90" size="sm">
                      Configure
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pipelineDeals.length === 0 && needsConfigDeals.length === 0 ? (
            <div className="bg-white rounded-lg border border-dashed border-slate-300 p-12 text-center text-slate-500">
              No deals yet. Click <span className="font-medium" style={{ color: PRIMARY }}>Add New Deal</span> to get started.
            </div>
          ) : (
            pipelineDeals.map((d) => (
              <DealCard
                key={d.id}
                deal={d}
                assignedDisplay={displayAssigned(d.assignedTo)}
                expanded={!!expanded[d.id]}
                highlighted={highlightId === d.id}
                onRef={(el) => { cardRefs.current[d.id] = el; }}
                onToggle={() => setExpanded((e) => ({ ...e, [d.id]: !e[d.id] }))}
                onEdit={() => setDialog({ kind: "edit", deal: d })}
                onToggleStage={(k) => handleToggleStage(d, k)}
                onGraduate={() => onGraduate(d)}
                onApproveDelivery={() => handleApproveDelivery(d)}
                onServiceDelivered={() => handleServiceDelivered(d)}
                onClientApproved={() => handleClientApproved(d)}
                onSetWaiting={(reason) => handleSetWaiting(d, reason)}
              />
            ))

          )}
        </div>
        <div className="lg:col-span-2">
          <FunnelVisual deals={pipelineDeals} onView={jumpToDeal} />
        </div>
      </div>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog && (
          <DealFormDialog
            mode={dialog}
            defaultAssigned={myId}
            assignedDisplay={dialog.kind === "new" ? (usernameById[myId] ?? email ?? "") : displayAssigned(dialog.deal.assignedTo)}
            onClose={() => setDialog(null)}
            addDeal={addDeal}
            updateDeal={updateDeal}
            removeDeal={removeDeal}
            refetch={fetchRemote}
          />
        )}
      </Dialog>

      <Dialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <DialogContent
          className="border-0 shadow-2xl sm:rounded-xl p-7 text-white"
          style={{ backgroundColor: "#0F172A" }}
        >
          <DialogHeader>
            <DialogTitle className="text-white text-xl font-bold">Approve for Delivery</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-300 leading-relaxed">
            This will move the deal to Phase 2 and begin the delivery process. This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setApproveTarget(null)}
              className="bg-transparent border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmApproveDelivery}
              style={{ backgroundColor: "#2563eb" }}
              className="text-white hover:opacity-90"
            >
              Approve for Delivery
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deliverTarget} onOpenChange={(o) => !o && setDeliverTarget(null)}>
        <DialogContent
          className="border-0 shadow-2xl sm:rounded-xl p-7 text-white"
          style={{ backgroundColor: "#0F172A" }}
        >
          <DialogHeader>
            <DialogTitle className="text-white text-xl font-bold">Confirm Service Delivery</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-300 leading-relaxed">
            Confirm that all services have been delivered and the client is live. This moves the deal to Phase 3.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setDeliverTarget(null)}
              className="bg-transparent border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmServiceDelivered}
              style={{ backgroundColor: "#10B981" }}
              className="text-white hover:opacity-90"
            >
              Confirm Delivery
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!approveClientTarget} onOpenChange={(o) => !o && setApproveClientTarget(null)}>
        <DialogContent
          className="border-0 shadow-2xl sm:rounded-xl p-7 text-white"
          style={{ backgroundColor: "#0F172A" }}
        >
          <DialogHeader>
            <DialogTitle className="text-white text-xl font-bold">Client Sign-Off</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-300 leading-relaxed">
            Confirm the client has reviewed and approved all delivered work.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setApproveClientTarget(null)}
              className="bg-transparent border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmClientApproved}
              style={{ backgroundColor: "#2563eb" }}
              className="text-white hover:opacity-90"
            >
              Confirm Approval
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =============== Funnel ===============

function dealPhase(d: Deal): 1 | 2 | 3 | 4 {
  const depositPaid = !!d.stages["deposit_paid"];
  const billingActive = !!d.stages["billing_active"];
  const approved = d.status === "approved_for_delivery";
  const serviceDelivered = d.status === "service_delivered";
  if (!depositPaid && !approved) return 1;
  if (!serviceDelivered) return 2;
  if (!billingActive) return 3;
  return 4;
}


function daysBetween(a?: string, b?: string) {
  if (!a || !b) return null;
  const d1 = new Date(a).getTime();
  const d2 = new Date(b).getTime();
  if (isNaN(d1) || isNaN(d2)) return null;
  return Math.max(0, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
}

function daysSince(date?: string) {
  if (!date) return 0;
  return daysBetween(date, new Date().toISOString().slice(0, 10)) ?? 0;
}

function lastCompletedStageLabel(d: Deal): string {
  const stages = applicableStages(d.services);
  let last = "—";
  for (const s of stages) {
    if (d.stages[s.key]) last = s.label;
  }
  return last;
}

function phaseEntryDate(d: Deal, phase: 1 | 2 | 3): string | undefined {
  if (phase === 1) return d.createdAt?.slice(0, 10);
  if (phase === 2) return d.stages["deposit_paid"];
  return d.stages["invoice_paid"];
}

const PHASE_1_STAGES = [
  "Lead shows interest","Discovery call booked","Business audit sent","Audit report delivered",
  "Sales meeting held","Proposal sent","Deposit invoice sent","Deposit paid",
];
const PHASE_2_STAGES = [
  "Welcome email sent","Onboarding documents sent","Onboarding documents signed",
  "Business information collected (BIF)","Services configured","Internal QA completed",
  "Client walkthrough done","Client approval received","Services go live","Final invoice sent","Final invoice paid",
];
const PHASE_3_STAGES = [
  "All services confirmed working","Client sign-off received","Monthly billing activated",
  "Reporting set up","Account handed to management","Graduated to Client Management",
];

function FunnelVisual({ deals, onView }: { deals: Deal[]; onView: (id: string) => void }) {
  const [open, setOpen] = useState<Record<1 | 2 | 3, boolean>>({ 1: true, 2: true, 3: true });

  const grouped = { 1: [] as Deal[], 2: [] as Deal[], 3: [] as Deal[] };
  for (const d of deals) {
    const p = dealPhase(d);
    if (p <= 3) grouped[p as 1 | 2 | 3].push(d);
  }

  const avg = (vals: (number | null)[]) => {
    const nums = vals.filter((v): v is number => v !== null);
    if (!nums.length) return null;
    return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
  };

  const avg1 = avg(deals.map((d) => daysBetween(d.createdAt.slice(0, 10), d.stages["deposit_paid"])));
  const avg2 = avg(deals.map((d) => daysBetween(d.stages["deposit_paid"], d.stages["invoice_paid"])));
  const avg3 = avg(deals.map((d) => daysBetween(d.stages["invoice_paid"], d.stages["billing_active"])));

  return (
    <div className="sticky top-6 space-y-4">
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="text-sm font-semibold mb-3" style={{ color: NAVY }}>Delivery funnel</div>
        <div className="space-y-2">
          <PhaseBlock
            widthPct={100} title="Phase 1 — Pre-Sale" subtitle="First contact to approval for delivery"
            stages={PHASE_1_STAGES} deals={grouped[1]} phase={1}
            variant="light" expanded={open[1]} onToggle={() => setOpen((o) => ({ ...o, 1: !o[1] }))}
            onView={onView}
          />
          <FunnelConnector from={100} to={80} />
          <PhaseBlock
            widthPct={80} title="Phase 2 — Delivery" subtitle="Approved to service live"
            stages={PHASE_2_STAGES} deals={grouped[2]} phase={2}
            variant="mid" expanded={open[2]} onToggle={() => setOpen((o) => ({ ...o, 2: !o[2] }))}
            onView={onView}
          />
          <FunnelConnector from={80} to={60} />
          <PhaseBlock
            widthPct={60} title="Phase 3 — Activation" subtitle="Live to monthly billing"
            stages={PHASE_3_STAGES} deals={grouped[3]} phase={3}
            variant="dark" expanded={open[3]} onToggle={() => setOpen((o) => ({ ...o, 3: !o[3] }))}
            onView={onView}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <MiniStat label="Avg. days in Phase 1" value={avg1 == null ? "—" : `${avg1}d`} />
        <MiniStat label="Avg. days in Phase 2" value={avg2 == null ? "—" : `${avg2}d`} />
        <MiniStat label="Avg. days in Phase 3" value={avg3 == null ? "—" : `${avg3}d`} />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3">
      <div className="text-[11px] text-slate-500 leading-tight">{label}</div>
      <div className="mt-1 text-lg font-semibold" style={{ color: NAVY }}>{value}</div>
    </div>
  );
}

function FunnelConnector({ from, to }: { from: number; to: number }) {
  return (
    <div className="relative h-3 mx-auto" style={{ width: "100%" }}>
      <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="w-full h-full">
        <polygon
          points={`${(100 - from) / 2},0 ${100 - (100 - from) / 2},0 ${100 - (100 - to) / 2},10 ${(100 - to) / 2},10`}
          fill="#e2e8f0"
        />
      </svg>
    </div>
  );
}

function PhaseBlock({
  widthPct, title, subtitle, stages, deals, phase, variant, expanded, onToggle, onView,
}: {
  widthPct: number; title: string; subtitle: string; stages: string[];
  deals: Deal[]; phase: 1 | 2 | 3;
  variant: "light" | "mid" | "dark";
  expanded: boolean; onToggle: () => void; onView: (id: string) => void;
}) {
  const styles = {
    light: { bg: "#eff6ff", border: "#bfdbfe", text: NAVY, sub: "#475569", badgeBg: "#dbeafe", badgeText: PRIMARY, dot: PRIMARY },
    mid:   { bg: "#dbeafe", border: "#93c5fd", text: NAVY, sub: "#334155", badgeBg: "#bfdbfe", badgeText: PRIMARY, dot: PRIMARY },
    dark:  { bg: NAVY,      border: NAVY,      text: "#ffffff", sub: "#cbd5e1", badgeBg: "#ffffff", badgeText: NAVY, dot: "#ffffff" },
  }[variant];
  const isDark = variant === "dark";
  const count = deals.length;

  return (
    <div className="mx-auto" style={{ width: `${widthPct}%` }}>
      <div className="rounded-lg p-3.5 border" style={{ background: styles.bg, borderColor: styles.border }}>
        <button onClick={onToggle} className="w-full flex items-start justify-between gap-2 text-left">
          <div className="min-w-0">
            <div className="text-sm font-semibold" style={{ color: styles.text }}>{title}</div>
            <div className="text-[11px] mt-0.5" style={{ color: styles.sub }}>{subtitle}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: styles.badgeBg, color: styles.badgeText }}>
              {count} {count === 1 ? "deal" : "deals"}
            </span>
            {expanded
              ? <ChevronUp className="h-4 w-4" style={{ color: styles.text }} />
              : <ChevronDown className="h-4 w-4" style={{ color: styles.text }} />}
          </div>
        </button>

        {expanded && (
          <ul className="mt-3 space-y-1.5">
            {stages.map((s, i) => {
              const isExit = i === stages.length - 1;
              return (
                <li key={s} className="flex items-center gap-2 text-[12px]" style={{ color: styles.text }}>
                  <span className="inline-block h-1.5 w-1.5 rounded-full shrink-0" style={{ background: styles.dot, opacity: isExit ? 1 : 0.6 }} />
                  <span className="truncate">{s}</span>
                  {isExit && (
                    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded"
                      style={{ background: isDark ? "rgba(255,255,255,0.15)" : "rgba(37,99,235,0.12)", color: isDark ? "#fff" : PRIMARY }}>
                      exit
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-3 pt-3 border-t" style={{ borderColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(15,23,42,0.08)" }}>
          <div className="text-[11px] mb-2" style={{ color: styles.sub }}>Deals in this phase</div>
          {deals.length === 0 ? (
            <div className="text-[11px]" style={{ color: styles.sub }}>None yet.</div>
          ) : (
            <DealsScrollList
              deals={deals}
              phase={phase}
              isDark={isDark}
              styles={styles}
              onView={onView}
            />
          )}
        </div>


      </div>
    </div>
  );
}

function DealsScrollList({
  deals, phase, isDark, styles, onView,
}: {
  deals: Deal[];
  phase: 1 | 2 | 3;
  isDark: boolean;
  styles: { bg: string; border: string; text: string; sub: string; badgeBg: string; badgeText: string; dot: string };
  onView: (id: string) => void;
}) {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const overflowing = deals.length > 6;
  const hoverBg = isDark ? "rgba(37,99,235,0.25)" : "#eff6ff";
  const rowBg = isDark ? "rgba(255,255,255,0.08)" : "#ffffff";
  const rowBorder = isDark ? "rgba(255,255,255,0.15)" : "#e2e8f0";
  const pillBg = isDark ? "rgba(255,255,255,0.18)" : "#f1f5f9";
  const pillText = isDark ? "#ffffff" : "#475569";

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setScrolled(el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
        }}
        className="overflow-y-auto pr-1 space-y-1.5 [scrollbar-width:thin]"
        style={{ maxHeight: 280 }}
      >
        {deals.map((d) => {
          const entry = phaseEntryDate(d, phase);
          const days = daysSince(entry) ?? 0;
          const isOpen = !!expandedRows[d.id];
          const stageLabel = lastCompletedStageLabel(d) || "—";
          return (
            <div
              key={d.id}
              onClick={() => setExpandedRows((m) => ({ ...m, [d.id]: !m[d.id] }))}
              className="rounded-md border cursor-pointer transition-colors"
              style={{ background: rowBg, borderColor: rowBorder }}
              onMouseEnter={(e) => (e.currentTarget.style.background = hoverBg)}
              onMouseLeave={(e) => (e.currentTarget.style.background = rowBg)}
            >
              <div className="flex items-center gap-2 px-2 py-1.5">
                <span className="text-[12px] font-semibold truncate flex-1 min-w-0" style={{ color: styles.text }}>
                  {d.businessName}
                </span>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full truncate max-w-[40%]"
                  style={{ background: pillBg, color: pillText }}
                >
                  {stageLabel}
                </span>
                <span className="text-[10px] shrink-0" style={{ color: styles.sub }}>Day {days}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onView(d.id); }}
                  className="shrink-0 text-[11px] px-2 py-0.5 rounded border font-medium"
                  style={{
                    background: "transparent",
                    color: isDark ? "#ffffff" : PRIMARY,
                    borderColor: isDark ? "rgba(255,255,255,0.5)" : PRIMARY,
                  }}
                >
                  View
                </button>
              </div>
              {isOpen && (
                <div
                  className="px-2 pb-2 pt-1 border-t text-[11px] space-y-1"
                  style={{ borderColor: rowBorder, color: styles.sub }}
                >
                  <div><span style={{ color: styles.text }}>Current stage:</span> {stageLabel}</div>
                  <div>{days} {days === 1 ? "day" : "days"} in this phase</div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onView(d.id); }}
                    className="text-[11px] px-2 py-0.5 rounded border font-medium"
                    style={{
                      background: "transparent",
                      color: isDark ? "#ffffff" : PRIMARY,
                      borderColor: isDark ? "rgba(255,255,255,0.5)" : PRIMARY,
                    }}
                  >
                    View in list
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {overflowing && !scrolled && (
        <div
          className="pointer-events-none absolute left-0 right-1 bottom-0 h-8 flex items-end justify-center"
          style={{
            background: `linear-gradient(to bottom, rgba(0,0,0,0), ${isDark ? "rgba(15,23,42,0.9)" : "rgba(255,255,255,0.9)"})`,
          }}
        >
          <ChevronDown className="h-3.5 w-3.5 mb-0.5" style={{ color: isDark ? "#ffffff" : PRIMARY }} />
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold" style={{ color: NAVY }}>{value}</div>
    </div>
  );
}

function DealCard({
  deal, assignedDisplay, expanded, highlighted, onRef, onToggle, onEdit, onToggleStage, onGraduate,
  onApproveDelivery, onServiceDelivered, onClientApproved, onSetWaiting,
}: {
  deal: Deal; assignedDisplay: string; expanded: boolean; highlighted: boolean;
  onRef: (el: HTMLDivElement | null) => void;
  onToggle: () => void; onEdit: () => void;
  onToggleStage: (k: StageKey) => void; onGraduate: () => void;
  onApproveDelivery: () => void;
  onServiceDelivered: () => void;
  onClientApproved: () => void;
  onSetWaiting: (reason: string) => void;
}) {
  const stages = applicableStages(deal.services);
  const completed = stages.filter((s) => deal.stages[s.key]).length;
  const allDone = completed === stages.length && stages.length > 0;
  const overdue = deal.nextActionDate && new Date(deal.nextActionDate) < new Date(new Date().toISOString().slice(0,10));
  const phase = dealPhase(deal);
  const approved = deal.status === "approved_for_delivery";
  const delivered = deal.status === "service_delivered";
  const clientApproved = !!deal.clientApproved;
  const waiting = !!(deal.waitingReason && deal.waitingReason.trim());
  const [waitOpen, setWaitOpen] = useState(false);
  const [waitText, setWaitText] = useState("");


  return (
    <div
      ref={onRef}
      className="bg-white rounded-lg border overflow-hidden transition-all"
      style={{
        borderColor: highlighted ? PRIMARY : "#e2e8f0",
        boxShadow: highlighted ? `0 0 0 3px rgba(37,99,235,0.20)` : undefined,
      }}
    >
      <div className="p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold" style={{ color: NAVY }}>{deal.businessName}</h3>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{deal.industry}</span>
              {deal.suburb && <span className="text-xs text-slate-500">· {deal.suburb}</span>}
            </div>
            <div className="text-sm text-slate-600 mt-1">
              Assigned to <span className="font-medium" style={{ color: NAVY }}>{assignedDisplay || "—"}</span>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="text-right">
              <div className="text-lg font-semibold" style={{ color: NAVY }}>${dealContractValue(deal).toLocaleString()}</div>
              <div className="text-[11px] text-slate-500">Total contract value</div>
              <div className="text-xs text-slate-600 mt-1">${(deal.mrr || 0).toLocaleString()} MRR / mo</div>
              <div className="text-xs text-slate-600">${dealOneTimeTotal(deal).toLocaleString()} one-time</div>
            </div>
            <button
              onClick={onEdit}
              title="Edit deal"
              className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>
        </div>

        {deal.services.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {deal.services.map((s) => (
              <span key={s} className="text-[11px] px-2 py-0.5 rounded-full border border-slate-200 text-slate-700 bg-slate-50">{s}</span>
            ))}
          </div>
        )}

        {(deal.nextAction || deal.nextActionDate) && (
          <div className="mt-3 text-sm">
            <span className="text-slate-500">Next: </span>
            <span style={{ color: NAVY }}>{deal.nextAction || "—"}</span>
            {deal.nextActionDate && (
              <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${overdue ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-600"}`}>
                {deal.nextActionDate}{overdue ? " · overdue" : ""}
              </span>
            )}
          </div>
        )}

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
            <span>{completed} of {stages.length} stages complete</span>
            <button onClick={onToggle} className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900">
              {expanded ? <>Collapse <ChevronUp className="h-3 w-3" /></> : <>Expand <ChevronDown className="h-3 w-3" /></>}
            </button>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full transition-all" style={{ width: `${stages.length ? (completed / stages.length) * 100 : 0}%`, background: PRIMARY }} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {phase === 1 && (
            approved ? (
              <span className="text-xs font-medium px-3 py-1.5 rounded-md bg-blue-50 text-[#2563eb] border border-blue-200">
                Approved ✓
              </span>
            ) : (
              <Button
                onClick={onApproveDelivery}
                size="sm"
                style={{ background: PRIMARY }}
                className="text-white hover:opacity-90"
              >
                Approve for Delivery
              </Button>
            )
          )}
          {phase === 2 && (
            delivered ? (
              <span className="text-xs font-medium px-3 py-1.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                Delivered ✓
              </span>
            ) : (
              <Button
                onClick={onServiceDelivered}
                size="sm"
                style={{ background: "#10B981" }}
                className="text-white hover:opacity-90"
              >
                Service Delivered
              </Button>
            )
          )}
          {phase === 3 && (
            clientApproved ? (
              <span className="text-xs font-medium px-3 py-1.5 rounded-md bg-blue-50 text-[#2563eb] border border-blue-200">
                Client Approved ✓
              </span>
            ) : (
              <Button
                onClick={onClientApproved}
                size="sm"
                variant="outline"
                style={{ borderColor: "#2563eb", color: "#2563eb" }}
                className="bg-transparent hover:bg-blue-50"
              >
                Client Approved
              </Button>
            )
          )}
          {clientApproved && phase !== 3 && (
            <span className="text-xs font-medium px-3 py-1.5 rounded-md bg-blue-50 text-[#2563eb] border border-blue-200">
              Client Approved ✓
            </span>
          )}
          {!waiting && !waitOpen && (
            <Button
              onClick={() => { setWaitText(""); setWaitOpen(true); }}
              size="sm"
              variant="outline"
              className="border-amber-400 text-amber-700 hover:bg-amber-50"
            >
              Waiting on Client
            </Button>
          )}
          {waiting && (
            <button
              type="button"
              onClick={() => onSetWaiting("")}
              title="Click to clear"
              className="text-left rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 hover:bg-amber-100"
            >
              <div className="text-xs font-semibold text-amber-800">Waiting on Client</div>
              <div className="text-[11px] text-amber-700">{deal.waitingReason}</div>
            </button>
          )}
        </div>

        {waitOpen && !waiting && (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3">
            <Label className="text-xs text-amber-900">What are you waiting for?</Label>
            <div className="mt-1.5 flex gap-2">
              <Input
                autoFocus
                value={waitText}
                onChange={(e) => setWaitText(e.target.value)}
                placeholder="e.g. Onboarding docs"
                className="bg-white"
              />
              <Button
                size="sm"
                onClick={() => {
                  if (!waitText.trim()) return;
                  onSetWaiting(waitText.trim());
                  setWaitOpen(false);
                }}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setWaitOpen(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>


      {expanded && (
        <div className="border-t border-slate-200 bg-slate-50/50 p-5">
          <h4 className="text-sm font-medium mb-3" style={{ color: NAVY }}>Delivery stages</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {stages.map((s) => {
              const done = deal.stages[s.key];
              return (
                <label key={s.key} className="flex items-center gap-3 p-2.5 rounded-md bg-white border border-slate-200 cursor-pointer hover:border-slate-300">
                  <Checkbox checked={!!done} onCheckedChange={() => onToggleStage(s.key as StageKey)} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm" style={{ color: NAVY }}>{s.label}</div>
                    {done && <div className="text-[11px] text-slate-500">Completed {done}</div>}
                  </div>
                </label>
              );
            })}
          </div>

          {allDone && (
            <div className="mt-4 rounded-md p-4 border" style={{ borderColor: PRIMARY, background: "#eff6ff" }}>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="text-sm font-medium" style={{ color: NAVY }}>All stages complete — ready to graduate</div>
                <Button onClick={onGraduate} style={{ background: PRIMARY }} className="text-white hover:opacity-90">
                  Graduate to Client Management
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============== Unified form dialog (new / configure / edit) ===============

function DealFormDialog({
  mode, defaultAssigned, assignedDisplay, onClose, addDeal, updateDeal, removeDeal, refetch,
}: {
  mode: Exclude<DialogMode, null>;
  defaultAssigned: string;
  assignedDisplay: string;
  onClose: () => void;
  addDeal: ReturnType<typeof usePipeline>["addDeal"];
  updateDeal: ReturnType<typeof usePipeline>["updateDeal"];
  removeDeal: ReturnType<typeof usePipeline>["removeDeal"];
  refetch: () => Promise<void> | void;
}) {
  const existing = mode.kind === "new" ? null : mode.deal;

  const [form, setForm] = useState({
    businessName: existing?.businessName ?? "",
    contactName: existing?.contactName ?? "",
    contactMobile: existing?.contactMobile ?? "",
    contactEmail: existing?.contactEmail ?? "",
    industry: existing?.industry || "Trades",
    suburb: existing?.suburb ?? "",
    assignedTo: existing?.assignedTo || defaultAssigned,
    services: (existing?.services ?? []) as Service[],
    dealValue: existing ? String(existing.dealValue || "") : "",
    mrr: existing ? String(existing.mrr || "") : "",
    setupFee: existing ? String(existing.setupFee || "") : "",
    websiteFee: existing ? String(existing.websiteFee || "") : "",
    otherFee: existing ? String(existing.otherFee || "") : "",
    otherFeeLabel: existing?.otherFeeLabel ?? "",
    notes: existing?.notes ?? "",
    nextAction: existing?.nextAction ?? "",
    nextActionDate: existing?.nextActionDate ?? "",
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const toggleService = (s: Service) =>
    setForm((f) => ({ ...f, services: f.services.includes(s) ? f.services.filter((x) => x !== s) : [...f.services, s] }));

  const buildPayload = () => ({
    businessName: form.businessName.trim(),
    contactName: form.contactName,
    contactMobile: form.contactMobile,
    contactEmail: form.contactEmail,
    industry: form.industry,
    suburb: form.suburb,
    assignedTo: form.assignedTo,
    services: form.services,
    dealValue: Number(form.dealValue) || 0,
    mrr: Number(form.mrr) || 0,
    setupFee: Number(form.setupFee) || 0,
    websiteFee: Number(form.websiteFee) || 0,
    otherFee: Number(form.otherFee) || 0,
    otherFeeLabel: form.otherFeeLabel,
    notes: form.notes,
    nextAction: form.nextAction,
    nextActionDate: form.nextActionDate,
  });

  const matchIndustry = INDUSTRIES.includes(form.industry as typeof INDUSTRIES[number])
    ? form.industry
    : "Other";

  const handleNew = () => {
    if (!form.businessName.trim()) { toast.error("Business name is required"); return; }
    addDeal(buildPayload());
    toast.success("Deal added");
    onClose();
  };

  const handleConfigureMove = async () => {
    if (!form.businessName.trim()) { toast.error("Business name is required"); return; }
    const existingStages = existing?.stages ?? {};
    const stages = existingStages["lead_interest"]
      ? existingStages
      : { ...existingStages, lead_interest: new Date().toISOString().slice(0, 10) };
    const p = buildPayload();
    const { error } = await supabase.from("pipeline_deals").update({
      business_name: p.businessName,
      contact_name: p.contactName,
      contact_mobile: p.contactMobile,
      contact_email: p.contactEmail,
      industry: p.industry,
      suburb: p.suburb,
      assigned_to: p.assignedTo,
      services: p.services,
      deal_value: p.dealValue,
      mrr: p.mrr,
      setup_fee: p.setupFee,
      website_fee: p.websiteFee,
      other_fee: p.otherFee,
      other_fee_label: p.otherFeeLabel,
      notes: p.notes,
      next_action: p.nextAction,
      next_action_date: p.nextActionDate || null,
      stages,
      status: "active",
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any).eq("id", existing!.id);
    if (error) { console.error("configure update failed", error); toast.error("Failed to move to pipeline"); return; }
    updateDeal(existing!.id, { ...p, needsConfig: false, stages });
    await refetch();
    toast.success("Moved to pipeline");
    onClose();
  };

  const handleSaveDraft = async () => {
    const p = buildPayload();
    const { error } = await supabase.from("pipeline_deals").update({
      business_name: p.businessName,
      contact_name: p.contactName,
      contact_mobile: p.contactMobile,
      contact_email: p.contactEmail,
      industry: p.industry,
      suburb: p.suburb,
      assigned_to: p.assignedTo,
      services: p.services,
      deal_value: p.dealValue,
      mrr: p.mrr,
      setup_fee: p.setupFee,
      website_fee: p.websiteFee,
      other_fee: p.otherFee,
      other_fee_label: p.otherFeeLabel,
      notes: p.notes,
      next_action: p.nextAction,
      next_action_date: p.nextActionDate || null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any).eq("id", existing!.id);
    if (error) { console.error("draft save failed", error); toast.error("Failed to save draft"); return; }
    updateDeal(existing!.id, { ...p, needsConfig: true });
    await refetch();
    toast.success("Draft saved");
    onClose();
  };


  const handleEditSave = () => {
    if (!form.businessName.trim()) { toast.error("Business name is required"); return; }
    updateDeal(existing!.id, buildPayload());
    toast.success("Changes saved");
    onClose();
  };

  const handleDelete = () => {
    removeDeal(existing!.id);
    toast.success("Deal deleted");
    onClose();
  };

  const title =
    mode.kind === "new" ? "Add New Deal" :
    mode.kind === "configure" ? "Configure deal" :
    "Edit deal";

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Business Name *">
          <Input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
        </Field>
        <Field label="Industry">
          <Select value={matchIndustry} onValueChange={(v) => setForm({ ...form, industry: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Contact Name">
          <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
        </Field>
        <Field label="Contact Mobile">
          <Input value={form.contactMobile} onChange={(e) => setForm({ ...form, contactMobile: e.target.value })} />
        </Field>
        <Field label="Contact Email">
          <Input value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
        </Field>
        <Field label="Suburb">
          <Input value={form.suburb} onChange={(e) => setForm({ ...form, suburb: e.target.value })} />
        </Field>
        <Field label="Assigned To">
          <Input value={assignedDisplay} readOnly className="bg-slate-50 text-slate-700" />
        </Field>
        <Field label="Deal Value ($)">
          <Input type="number" value={form.dealValue} onChange={(e) => setForm({ ...form, dealValue: e.target.value })} />
        </Field>
        <Field label="Monthly Recurring ($)">
          <Input type="number" value={form.mrr} onChange={(e) => setForm({ ...form, mrr: e.target.value })} />
        </Field>
        <Field label="Setup / Installation Fee ($)">
          <Input type="number" value={form.setupFee} onChange={(e) => setForm({ ...form, setupFee: e.target.value })} />
        </Field>
        <Field label="Website Build Fee ($)">
          <Input type="number" value={form.websiteFee} onChange={(e) => setForm({ ...form, websiteFee: e.target.value })} />
        </Field>
        <Field label="Other One-Time Fee — Label">
          <Input value={form.otherFeeLabel} onChange={(e) => setForm({ ...form, otherFeeLabel: e.target.value })} placeholder="e.g. Migration" />
        </Field>
        <Field label="Other One-Time Fee ($)">
          <Input type="number" value={form.otherFee} onChange={(e) => setForm({ ...form, otherFee: e.target.value })} />
        </Field>
        <div className="md:col-span-2 grid grid-cols-2 gap-3 p-3 rounded-md bg-slate-50 border border-slate-200">
          <div>
            <div className="text-[11px] text-slate-500">Total One-Time Revenue</div>
            <div className="text-lg font-semibold" style={{ color: NAVY }}>
              ${((Number(form.setupFee)||0)+(Number(form.websiteFee)||0)+(Number(form.otherFee)||0)).toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Total Contract Value (yr 1)</div>
            <div className="text-lg font-semibold" style={{ color: PRIMARY }}>
              ${(((Number(form.setupFee)||0)+(Number(form.websiteFee)||0)+(Number(form.otherFee)||0)) + (Number(form.mrr)||0)*12).toLocaleString()}
            </div>
          </div>
        </div>
        <Field label="Next Action">
          <Input value={form.nextAction} onChange={(e) => setForm({ ...form, nextAction: e.target.value })} />
        </Field>
        <Field label="Next Action Date">
          <Input type="date" value={form.nextActionDate} onChange={(e) => setForm({ ...form, nextActionDate: e.target.value })} />
        </Field>
        <div className="md:col-span-2">
          <Label className="text-xs text-slate-600">Services Sold</Label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1.5">
            {SERVICE_OPTIONS.map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm border border-slate-200 rounded-md px-2.5 py-2 cursor-pointer hover:border-slate-300">
                <Checkbox checked={form.services.includes(s)} onCheckedChange={() => toggleService(s)} />
                <span>{s}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="md:col-span-2">
          <Field label="Notes">
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>
      </div>

      {mode.kind === "edit" && confirmDelete && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Are you sure you want to delete this deal? This cannot be undone.
          <div className="mt-2 flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button size="sm" onClick={handleDelete} className="bg-red-600 text-white hover:bg-red-700">Delete</Button>
          </div>
        </div>
      )}

      <DialogFooter className="flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
        {mode.kind === "edit" ? (
          <>
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-sm text-red-600 hover:text-red-700 inline-flex items-center gap-1"
            >
              <Trash2 className="h-4 w-4" /> Delete deal
            </button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleEditSave} style={{ background: PRIMARY }} className="text-white hover:opacity-90">Save changes</Button>
            </div>
          </>
        ) : mode.kind === "configure" ? (
          <>
            <div />
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={handleSaveDraft}>Save draft</Button>
              <Button onClick={handleConfigureMove} style={{ background: PRIMARY }} className="text-white hover:opacity-90">
                Save and move to pipeline
              </Button>
            </div>
          </>
        ) : (
          <>
            <div />
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleNew} style={{ background: PRIMARY }} className="text-white hover:opacity-90">Save Deal</Button>
            </div>
          </>
        )}
      </DialogFooter>
    </DialogContent>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs text-slate-600">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

// silence unused import warnings if any
void STAGE_DEFS;
// keep DialogTrigger import used (re-exported elsewhere)
void DialogTrigger;
