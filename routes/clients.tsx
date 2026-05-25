import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import {
  useClients, EMPLOYEE_DEFS, type Client, type EmployeeName, type EmployeeStatus,
  type ExtraService, type ClientPlan, type ClientStatus,
} from "@/lib/clientsStore";
import { applicableStages, INDUSTRIES, type StageKey } from "@/lib/pipelineStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/clients")({
  component: ClientsPage,
});

const PRIMARY = "#2563eb";
const NAVY = "#0f172a";

function ClientsPage() {
  return (
    <AppShell requireRole="owner">
      <Inner />
    </AppShell>
  );
}

function Inner() {
  const { clients } = useClients();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = clients.find((c) => c.id === selectedId);

  if (selected) return <ClientDetail client={selected} onBack={() => setSelectedId(null)} />;
  return <ClientList onSelect={setSelectedId} />;
}

function ClientList({ onSelect }: { onSelect: (id: string) => void }) {
  const { clients, addClient } = useClients();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const visible = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter((c) => c.businessName.toLowerCase().includes(q));
  }, [clients, search]);

  const activeCount = clients.filter((c) => c.status === "Active").length;
  const totalMRR = clients.reduce((s, c) => s + (c.mrr || 0), 0);

  return (
    <div className="p-6 lg:p-10 max-w-[1600px]">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: NAVY }}>Clients</h1>
          <p className="text-xs text-slate-500 mt-1">Client data saved locally — Supabase sync coming soon.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button style={{ background: PRIMARY }} className="text-white hover:opacity-90">
              <Plus className="h-4 w-4 mr-1" /> Add Client Manually
            </Button>
          </DialogTrigger>
          <AddClientDialog onClose={() => setOpen(false)} addClient={addClient} />
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Stat label="Active Clients" value={activeCount.toString()} />
        <Stat label="Total MRR" value={`$${totalMRR.toLocaleString()}`} />
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <Label className="text-xs text-slate-500">Search</Label>
          <Input className="mt-1.5" placeholder="Search by business name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="bg-white rounded-lg border border-dashed border-slate-300 p-12 text-center text-slate-500">
          No clients yet. Graduate a deal from Pipeline or add one manually.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((c) => (
            <div key={c.id} className="bg-white rounded-lg border border-slate-200 p-5 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold truncate" style={{ color: NAVY }}>{c.businessName}</h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{c.industry}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{c.plan}</span>
                    <StatusPill status={c.status} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-base font-semibold" style={{ color: NAVY }}>${(c.mrr || 0).toLocaleString()}</div>
                  <div className="text-[11px] text-slate-500">MRR / mo</div>
                </div>
              </div>

              <div className="mt-3">
                <div className="text-[11px] text-slate-500 mb-1.5">Active digital employees</div>
                <div className="flex flex-wrap gap-1.5">
                  {EMPLOYEE_DEFS.filter((e) => c.employees[e] === "Active").length === 0 && (
                    <span className="text-xs text-slate-400">None active</span>
                  )}
                  {EMPLOYEE_DEFS.filter((e) => c.employees[e] === "Active").map((e) => (
                    <span key={e} className="text-[11px] px-2 py-0.5 rounded-full text-white" style={{ background: PRIMARY }}>{e}</span>
                  ))}
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
                <Button size="sm" onClick={() => onSelect(c.id)} style={{ background: PRIMARY }} className="text-white hover:opacity-90">
                  Manage
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold" style={{ color: NAVY }}>{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: ClientStatus }) {
  const map: Record<ClientStatus, string> = {
    Active: "bg-blue-50 text-blue-700",
    Paused: "bg-amber-50 text-amber-700",
    Churned: "bg-red-50 text-red-700",
  };
  return <span className={`text-[11px] px-2 py-0.5 rounded-full ${map[status]}`}>{status}</span>;
}

function AddClientDialog({
  onClose, addClient,
}: { onClose: () => void; addClient: ReturnType<typeof useClients>["addClient"] }) {
  const [form, setForm] = useState({
    businessName: "", industry: "Trades", suburb: "",
    plan: "Starter" as ClientPlan, status: "Active" as ClientStatus, mrr: "",
    ownerName: "", ownerMobile: "", ownerEmail: "",
  });

  const save = () => {
    if (!form.businessName.trim()) { toast.error("Business name is required"); return; }
    addClient({ ...form, mrr: Number(form.mrr) || 0 });
    toast.success("Client added");
    onClose();
  };

  return (
    <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Add Client Manually</DialogTitle></DialogHeader>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <F label="Business Name *"><Input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} /></F>
        <F label="Industry">
          <Select value={form.industry} onValueChange={(v) => setForm({ ...form, industry: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
          </Select>
        </F>
        <F label="Suburb"><Input value={form.suburb} onChange={(e) => setForm({ ...form, suburb: e.target.value })} /></F>
        <F label="Plan">
          <Select value={form.plan} onValueChange={(v) => setForm({ ...form, plan: v as ClientPlan })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{(["Starter","Growth","Pro"] as ClientPlan[]).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </F>
        <F label="Status">
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ClientStatus })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{(["Active","Paused","Churned"] as ClientStatus[]).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </F>
        <F label="MRR ($)"><Input type="number" value={form.mrr} onChange={(e) => setForm({ ...form, mrr: e.target.value })} /></F>
        <F label="Owner Name"><Input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} /></F>
        <F label="Owner Mobile"><Input value={form.ownerMobile} onChange={(e) => setForm({ ...form, ownerMobile: e.target.value })} /></F>
        <F label="Owner Email"><Input value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} /></F>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} style={{ background: PRIMARY }} className="text-white hover:opacity-90">Save</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs text-slate-600">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/* ---------------- Detail view ---------------- */

function ClientDetail({ client, onBack }: { client: Client; onBack: () => void }) {
  const { updateClient, removeClient } = useClients();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await removeClient(client.id);
      toast.success(`${client.businessName} has been removed`);
      setConfirmOpen(false);
      onBack();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to remove client");
      setRemoving(false);
    }
  };

  return (
    <div className="p-6 lg:p-10 max-w-[1400px]">
      <button onClick={onBack} className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900 mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to clients
      </button>

      <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: NAVY }}>{client.businessName}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{client.industry}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{client.plan}</span>
            <StatusPill status={client.status} />
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-semibold" style={{ color: NAVY }}>${(client.mrr || 0).toLocaleString()}</div>
          <div className="text-xs text-slate-500">MRR / mo</div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <BusinessInfoSection client={client} updateClient={updateClient} />
        <EmployeesSection client={client} updateClient={updateClient} />
        <ExtraServicesSection client={client} updateClient={updateClient} />
        <DeliveryChecklistSection client={client} updateClient={updateClient} />
        <AnalyticsSection />
        <CostsSection client={client} updateClient={updateClient} />
        <div className="xl:col-span-2">
          <NotesSection client={client} updateClient={updateClient} />
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <Button
          variant="outline"
          onClick={() => setConfirmOpen(true)}
          style={{ color: "#EF4444", borderColor: "#EF4444" }}
          className="hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4 mr-1.5" /> Remove Client
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(v) => !removing && setConfirmOpen(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove Client</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Are you sure you want to remove <span className="font-medium" style={{ color: NAVY }}>{client.businessName}</span>? This will permanently delete their record and cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={removing}>Cancel</Button>
            <Button
              onClick={handleRemove}
              disabled={removing}
              style={{ background: "#EF4444" }}
              className="text-white hover:opacity-90"
            >
              {removing ? "Removing…" : "Remove Client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-lg border border-slate-200 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-4">{title}</h2>
      {children}
    </section>
  );
}

function BusinessInfoSection({ client, updateClient }: { client: Client; updateClient: ReturnType<typeof useClients>["updateClient"] }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(client);

  const save = () => { updateClient(client.id, form); setEditing(false); toast.success("Saved"); };

  return (
    <Panel title="A. Business Info">
      {!editing ? (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Info label="Business" value={client.businessName} />
          <Info label="Industry" value={client.industry} />
          <Info label="Suburb" value={client.suburb || "—"} />
          <Info label="Plan" value={client.plan} />
          <Info label="Status" value={client.status} />
          <Info label="MRR" value={`$${(client.mrr || 0).toLocaleString()}`} />
          <Info label="Owner Name" value={client.ownerName || "—"} />
          <Info label="Owner Mobile" value={client.ownerMobile || "—"} />
          <Info label="Owner Email" value={client.ownerEmail || "—"} />
          <div className="col-span-2 flex justify-end pt-2">
            <Button variant="outline" size="sm" onClick={() => { setForm(client); setEditing(true); }}>Edit</Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <F label="Business"><Input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} /></F>
          <F label="Industry">
            <Select value={form.industry} onValueChange={(v) => setForm({ ...form, industry: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
            </Select>
          </F>
          <F label="Suburb"><Input value={form.suburb} onChange={(e) => setForm({ ...form, suburb: e.target.value })} /></F>
          <F label="Plan">
            <Select value={form.plan} onValueChange={(v) => setForm({ ...form, plan: v as ClientPlan })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(["Starter","Growth","Pro"] as ClientPlan[]).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </F>
          <F label="Status">
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ClientStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(["Active","Paused","Churned"] as ClientStatus[]).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </F>
          <F label="MRR ($)"><Input type="number" value={form.mrr} onChange={(e) => setForm({ ...form, mrr: Number(e.target.value) || 0 })} /></F>
          <F label="Owner Name"><Input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} /></F>
          <F label="Owner Mobile"><Input value={form.ownerMobile} onChange={(e) => setForm({ ...form, ownerMobile: e.target.value })} /></F>
          <F label="Owner Email"><Input value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} /></F>
          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" onClick={save} style={{ background: PRIMARY }} className="text-white hover:opacity-90">Save</Button>
          </div>
        </div>
      )}
    </Panel>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm" style={{ color: NAVY }}>{value}</div>
    </div>
  );
}

function EmployeesSection({ client, updateClient }: { client: Client; updateClient: ReturnType<typeof useClients>["updateClient"] }) {
  const setEmp = (name: EmployeeName, status: EmployeeStatus) => {
    updateClient(client.id, { employees: { ...client.employees, [name]: status } });
  };

  const empPill = (s: EmployeeStatus) => {
    const m: Record<EmployeeStatus, string> = {
      Active: "bg-blue-50 text-blue-700",
      Paused: "bg-amber-50 text-amber-700",
      "Not configured": "bg-slate-100 text-slate-600",
    };
    return <span className={`text-[11px] px-2 py-0.5 rounded-full ${m[s]}`}>{s}</span>;
  };

  return (
    <Panel title="B. Digital Employees">
      <div className="divide-y divide-slate-100">
        {EMPLOYEE_DEFS.map((name) => {
          const status = client.employees[name];
          const on = status === "Active";
          return (
            <div key={name} className="py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium" style={{ color: NAVY }}>{name}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Awaiting n8n connection</div>
              </div>
              {empPill(status)}
              <Switch
                checked={on}
                onCheckedChange={(v) => setEmp(name, v ? "Active" : "Paused")}
              />
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function ExtraServicesSection({ client, updateClient }: { client: Client; updateClient: ReturnType<typeof useClients>["updateClient"] }) {
  const update = (extras: ExtraService[]) => updateClient(client.id, { extras });
  const add = () => update([...client.extras, { id: crypto.randomUUID(), name: "", description: "", link: "", status: "In Progress" }]);
  const patch = (id: string, p: Partial<ExtraService>) => update(client.extras.map((e) => (e.id === id ? { ...e, ...p } : e)));
  const remove = (id: string) => update(client.extras.filter((e) => e.id !== id));

  return (
    <Panel title="C. Extra Services">
      <div className="space-y-3">
        {client.extras.length === 0 && <p className="text-sm text-slate-500">No extra services. Click Add Service to create one.</p>}
        {client.extras.map((e) => (
          <div key={e.id} className="grid grid-cols-12 gap-2 items-start border border-slate-200 rounded-md p-3">
            <Input className="col-span-12 md:col-span-3" placeholder="Service name" value={e.name} onChange={(ev) => patch(e.id, { name: ev.target.value })} />
            <Input className="col-span-12 md:col-span-4" placeholder="Description" value={e.description} onChange={(ev) => patch(e.id, { description: ev.target.value })} />
            <Input className="col-span-12 md:col-span-3" placeholder="https://…" value={e.link} onChange={(ev) => patch(e.id, { link: ev.target.value })} />
            <div className="col-span-10 md:col-span-1">
              <Select value={e.status} onValueChange={(v) => patch(e.id, { status: v as ExtraService["status"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Live">Live</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Paused">Paused</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <button onClick={() => remove(e.id)} className="col-span-2 md:col-span-1 text-slate-400 hover:text-red-600 flex justify-end pt-2">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4 mr-1" /> Add Service</Button>
      </div>
    </Panel>
  );
}

function DeliveryChecklistSection({ client, updateClient }: { client: Client; updateClient: ReturnType<typeof useClients>["updateClient"] }) {
  const stages = applicableStages(client.services);
  const toggle = (key: StageKey) => {
    const next = { ...client.stages };
    if (next[key]) delete next[key];
    else next[key] = new Date().toISOString().slice(0, 10);
    updateClient(client.id, { stages: next });
  };

  return (
    <Panel title="D. Delivery Checklist">
      {stages.length === 0 ? (
        <p className="text-sm text-slate-500">No services on file. Add services in Business Info to populate the checklist.</p>
      ) : (
        <div className="space-y-1.5">
          {stages.map((s) => {
            const done = client.stages[s.key];
            return (
              <label key={s.key} className="flex items-center gap-3 p-2 rounded-md hover:bg-slate-50 cursor-pointer">
                <Checkbox checked={!!done} onCheckedChange={() => toggle(s.key as StageKey)} />
                <span className="text-sm flex-1" style={{ color: NAVY }}>{s.label}</span>
                {done && <span className="text-[11px] text-slate-500">{done}</span>}
              </label>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function AnalyticsSection() {
  const metrics = ["Posts Published","Calls Handled","Leads Processed","Reviews Requested","Emails Sent","Follow-Ups Fired"];
  return (
    <Panel title="E. Analytics">
      <p className="text-sm text-slate-500 mb-4">Live analytics will display here once n8n automations are connected.</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {metrics.map((m) => (
          <div key={m} className="border border-slate-200 rounded-md p-3">
            <div className="text-[11px] text-slate-500">{m}</div>
            <div className="mt-1 flex items-end justify-between">
              <span className="text-2xl font-semibold" style={{ color: NAVY }}>0</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">pending</span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function CostsSection({ client, updateClient }: { client: Client; updateClient: ReturnType<typeof useClients>["updateClient"] }) {
  const c = client.costs;
  const total = c.vapi + c.twilio + c.searchAtlas + c.blotato + c.sendgrid + c.other;
  const margin = (client.mrr || 0) - total;
  const pct = client.mrr ? (margin / client.mrr) * 100 : 0;
  const oneTime = client.oneTimeFees || 0;
  const monthsActive = Math.max(1, Math.round(
    (Date.now() - new Date(client.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30),
  ));
  const totalRevenue = oneTime + (client.mrr || 0) * monthsActive;

  const set = (k: keyof typeof c, v: string) => {
    updateClient(client.id, { costs: { ...c, [k]: Number(v) || 0 } });
  };

  const rows: [string, keyof typeof c][] = [
    ["VAPI", "vapi"],
    ["Twilio", "twilio"],
    ["Search Atlas", "searchAtlas"],
    ["Blotato", "blotato"],
    ["SendGrid", "sendgrid"],
    ["Other", "other"],
  ];

  return (
    <Panel title="F. Costs & Margin">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          {rows.map(([label, k]) => (
            <tr key={k}>
              <td className="py-2 text-slate-600">{label}</td>
              <td className="py-2 text-right w-32">
                <Input type="number" className="h-8 text-right" value={c[k] || ""} onChange={(e) => set(k, e.target.value)} />
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-slate-200">
            <td className="py-2 font-medium" style={{ color: NAVY }}>Total tool cost</td>
            <td className="py-2 text-right font-medium" style={{ color: NAVY }}>${total.toLocaleString()}</td>
          </tr>
          <tr>
            <td className="py-2 text-slate-600">Client MRR</td>
            <td className="py-2 text-right">${(client.mrr || 0).toLocaleString()}</td>
          </tr>
          <tr>
            <td className="py-2 font-medium" style={{ color: NAVY }}>Gross margin</td>
            <td className="py-2 text-right font-semibold" style={{ color: margin >= 0 ? PRIMARY : "#dc2626" }}>
              ${margin.toLocaleString()}
            </td>
          </tr>
          <tr>
            <td className="py-2 text-slate-600">Margin %</td>
            <td className="py-2 text-right" style={{ color: NAVY }}>{pct.toFixed(1)}%</td>
          </tr>
          <tr className="border-t-2 border-slate-200">
            <td className="py-2 text-slate-600">One-time fees received</td>
            <td className="py-2 text-right">
              <Input
                type="number"
                className="h-8 text-right"
                value={oneTime || ""}
                onChange={(e) => updateClient(client.id, { oneTimeFees: Number(e.target.value) || 0 })}
              />
            </td>
          </tr>
          <tr>
            <td className="py-2 font-medium" style={{ color: NAVY }}>Total revenue to date</td>
            <td className="py-2 text-right font-semibold" style={{ color: PRIMARY }}>
              ${totalRevenue.toLocaleString()}
            </td>
          </tr>
          <tr>
            <td className="py-2 text-[11px] text-slate-400" colSpan={2}>
              Based on {monthsActive} {monthsActive === 1 ? "month" : "months"} active × MRR + one-time fees
            </td>
          </tr>
        </tbody>
      </table>
    </Panel>
  );
}

function NotesSection({ client, updateClient }: { client: Client; updateClient: ReturnType<typeof useClients>["updateClient"] }) {
  return (
    <Panel title="G. Internal Notes">
      <Textarea
        rows={6}
        placeholder="Private notes about this client…"
        value={client.notes}
        onChange={(e) => updateClient(client.id, { notes: e.target.value })}
      />
      <p className="text-[11px] text-slate-400 mt-2">Auto-saves as you type.</p>
    </Panel>
  );
}
