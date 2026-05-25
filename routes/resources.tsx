import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  createStripeInvoice,
  recordStripePayment,
  getStripeMode,
} from "@/lib/stripe.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/resources")({
  component: ResourcesPage,
});

type ResourceCard = {
  icon: string;
  title: string;
  description: string;
  href: string;
  ownerOnly?: boolean;
};

const CARDS: ResourceCard[] = [
  { icon: "📄", title: "Who We Are", description: "Company overview and mission. Send when prospects ask about PillarOS.", href: "https://drive.google.com/file/d/1yZbL9A15QO4vnjkJUqHWS-A8o6duHKvN/view?usp=sharing" },
  { icon: "📦", title: "Package Menu", description: "Full breakdown of services, digital employees and pricing tiers.", href: "#" },
  { icon: "⚖️", title: "Legal Framework & T&Cs", description: "Master terms and conditions for all client agreements.", href: "#" },
  { icon: "🔒", title: "Data Handling Policy", description: "How PillarOS collects, stores and protects client data.", href: "#" },
  { icon: "🏦", title: "Banking Details", description: "BSB, account number and payment information.", href: "#", ownerOnly: true },
  { icon: "🎴", title: "Business Cards & Materials", description: "Digital copies of all physical sales materials.", href: "#" },
  { icon: "📋", title: "BIF Collection Form", description: "Client-facing business information form to send at onboarding.", href: "#" },
  { icon: "✅", title: "Onboarding Checklist", description: "Internal step by step checklist from signed deal to go-live.", href: "#" },
];

type ToolCard = {
  icon: string;
  title: string;
  description: string;
  buttonLabel: string;
  caption: string;
  active: boolean;
  kind?: "invoice" | "receipt";
};

const TOOLS: ToolCard[] = [
  { icon: "🔍", title: "Audit Generator", description: "Generate a professional business audit from a client discovery submission.", buttonLabel: "Generate Audit", caption: "Coming soon — AI agent in development", active: false },
  { icon: "📝", title: "Proposal Generator", description: "Create a tailored proposal based on the client audit and their specific needs.", buttonLabel: "Generate Proposal", caption: "Coming soon — AI agent in development", active: false },
  { icon: "📃", title: "Contract Generator", description: "Generate a client contract based on services, payment terms and lock-in period.", buttonLabel: "Generate Contract", caption: "Coming soon — AI agent in development", active: false },
  { icon: "💳", title: "Send Invoice", description: "Create and send a professional invoice to a client.", buttonLabel: "Create Invoice", caption: "Powered by Stripe", active: true, kind: "invoice" },
  { icon: "🧾", title: "Send Receipt", description: "Send a payment receipt to confirm a client payment has been received.", buttonLabel: "Send Receipt", caption: "Powered by Stripe", active: true, kind: "receipt" },
];

type LineItem = {
  description: string;
  type: "one-time" | "monthly";
  amount: number;
};

type InvoiceDraft = {
  id: string;
  type: "invoice";
  number: string;
  createdAt: string;
  businessName: string;
  clientEmail: string;
  salesperson: string;
  serviceDescription: string;
  items: LineItem[];
  notes: string;
  status: string;
  stripeInvoiceId?: string | null;
};

type ReceiptDraft = {
  id: string;
  type: "receipt";
  number: string;
  createdAt: string;
  businessName: string;
  clientEmail: string;
  salesperson: string;
  items: LineItem[];
  paymentMethod: string;
  serviceDescription: string;
  notes: string;
  status: string;
};

type Draft = InvoiceDraft | ReceiptDraft;

function money(n: number) {
  return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
}

function emptyItem(): LineItem {
  return { description: "", type: "one-time", amount: 0 };
}

function normalizeItems(raw: any): LineItem[] {
  if (Array.isArray(raw) && raw.length) {
    return raw.map((r) => ({
      description: String(r?.description || ""),
      type: r?.type === "monthly" ? "monthly" : "one-time",
      amount: Number(r?.amount) || 0,
    }));
  }
  return [];
}

function totals(items: LineItem[]) {
  const oneTime = items
    .filter((i) => i.type === "one-time")
    .reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const monthly = items
    .filter((i) => i.type === "monthly")
    .reduce((s, i) => s + (Number(i.amount) || 0), 0);
  return { oneTime, monthly, dueToday: oneTime };
}

const db = supabase as unknown as {
  from: (t: string) => any;
};

function rowToInvoice(r: any): InvoiceDraft {
  let items = normalizeItems(r.items);
  if (!items.length) {
    // Back-compat with old fixed-fee rows
    const legacy: LineItem[] = [];
    if (Number(r.setup_fee) > 0) {
      legacy.push({
        description: r.service_description || "Setup",
        type: "one-time",
        amount: Number(r.setup_fee),
      });
    }
    if (Number(r.monthly_amount) > 0) {
      legacy.push({
        description: r.service_description || "Monthly Retainer",
        type: "monthly",
        amount: Number(r.monthly_amount),
      });
    }
    items = legacy;
  }
  return {
    id: r.id,
    type: "invoice",
    number: r.invoice_number,
    createdAt: r.created_at,
    businessName: r.client_name || "",
    clientEmail: r.client_email || "",
    salesperson: r.created_by || "",
    serviceDescription: r.service_description || "",
    items,
    notes: r.notes || "",
    status: r.status || "draft",
    stripeInvoiceId: r.stripe_invoice_id || null,
  };
}

function rowToReceipt(r: any): ReceiptDraft {
  let items = normalizeItems(r.items);
  if (!items.length && Number(r.amount) > 0) {
    items = [
      {
        description: r.service_description || "Payment",
        type: "one-time",
        amount: Number(r.amount),
      },
    ];
  }
  return {
    id: r.id,
    type: "receipt",
    number: r.receipt_number,
    createdAt: r.created_at,
    businessName: r.client_name || "",
    clientEmail: r.client_email || "",
    salesperson: r.created_by || "",
    items,
    paymentMethod: r.payment_method || "Bank Transfer",
    serviceDescription: r.service_description || "",
    notes: r.notes || "",
    status: r.status || "draft",
  };
}

function ResourcesPage() {
  const { role, displayName, email } = useAuth();
  const username = displayName || email || "";
  const cards = CARDS.filter((c) => !c.ownerOnly || role === "owner");

  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [editingDraft, setEditingDraft] = useState<Draft | null>(null);
  const [stripeTestMode, setStripeTestMode] = useState(false);

  const createInvoiceFn = useServerFn(createStripeInvoice);
  const recordPaymentFn = useServerFn(recordStripePayment);
  const getStripeModeFn = useServerFn(getStripeMode);

  useEffect(() => {
    getStripeModeFn().then((r) => setStripeTestMode(!!r?.test)).catch(() => {});
  }, [getStripeModeFn]);

  const stripeInvoiceUrl = (id: string) =>
    `https://dashboard.stripe.com/${stripeTestMode ? "test/" : ""}invoices/${id}`;

  const loadDrafts = useCallback(async () => {
    const [invRes, recRes] = await Promise.all([
      db.from("invoices").select("*").order("created_at", { ascending: false }),
      db.from("receipts").select("*").order("created_at", { ascending: false }),
    ]);
    const inv = (invRes.data || []).map(rowToInvoice);
    const rec = (recRes.data || []).map(rowToReceipt);
    const merged: Draft[] = [...inv, ...rec].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    setDrafts(merged);
  }, []);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  const openTool = (kind?: "invoice" | "receipt") => {
    setEditingDraft(null);
    if (kind === "invoice") setInvoiceOpen(true);
    else if (kind === "receipt") setReceiptOpen(true);
  };

  const openDraft = (d: Draft) => {
    setEditingDraft(d);
    if (d.type === "invoice") setInvoiceOpen(true);
    else setReceiptOpen(true);
  };

  const saveInvoice = async (d: InvoiceDraft): Promise<{ id: string } | null> => {
    const t = totals(d.items);
    const total = t.oneTime + t.monthly;
    const payload = {
      client_name: d.businessName,
      client_email: d.clientEmail,
      created_by: d.salesperson,
      service_description: d.serviceDescription,
      items: d.items,
      setup_fee: t.oneTime,
      monthly_amount: t.monthly,
      total_amount: total,
      notes: d.notes,
    };
    if (d.id) {
      await db.from("invoices").update(payload).eq("id", d.id);
      await loadDrafts();
      return { id: d.id };
    }
    const { data: row } = await db
      .from("invoices")
      .insert({ ...payload, status: "draft" })
      .select("id")
      .single();
    await loadDrafts();
    return row ? { id: row.id } : null;
  };

  const saveReceipt = async (d: ReceiptDraft): Promise<{ id: string } | null> => {
    const amount = d.items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const payload = {
      client_name: d.businessName,
      client_email: d.clientEmail,
      created_by: d.salesperson,
      service_description: d.serviceDescription,
      items: d.items,
      amount,
      payment_method: d.paymentMethod,
      notes: d.notes,
    };
    if (d.id) {
      await db.from("receipts").update(payload).eq("id", d.id);
      await loadDrafts();
      return { id: d.id };
    }
    const { data: row } = await db
      .from("receipts")
      .insert({ ...payload, status: "draft" })
      .select("id")
      .single();
    await loadDrafts();
    return row ? { id: row.id } : null;
  };

  const sendInvoice = async (d: InvoiceDraft) => {
    const saved = await saveInvoice(d);
    if (!saved) {
      toast.error("Could not save invoice");
      return;
    }
    // Fetch the saved row to get the assigned number
    const { data: row } = await db
      .from("invoices")
      .select("invoice_number")
      .eq("id", saved.id)
      .single();
    const invoiceNumber = row?.invoice_number || "";
    try {
      await createInvoiceFn({
        data: {
          invoiceId: saved.id,
          clientName: d.businessName,
          clientEmail: d.clientEmail,
          serviceDescription: d.serviceDescription,
          items: d.items.filter((i) => i.amount > 0 && i.description.trim()),
          salespersonEmail: email || undefined,
          salespersonName: username,
          invoiceNumber,
        },
      });
      await loadDrafts();
      toast.success(`Invoice ${invoiceNumber} sent to ${d.clientEmail}.`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to send Stripe invoice");
    }
  };

  const sendReceipt = async (d: ReceiptDraft) => {
    const saved = await saveReceipt(d);
    if (!saved) {
      toast.error("Could not save receipt");
      return;
    }
    const { data: row } = await db
      .from("receipts")
      .select("receipt_number")
      .eq("id", saved.id)
      .single();
    const receiptNumber = row?.receipt_number || "";
    try {
      await recordPaymentFn({
        data: {
          receiptId: saved.id,
          clientName: d.businessName,
          clientEmail: d.clientEmail,
          items: d.items.filter((i) => i.amount > 0 && i.description.trim()),
          paymentMethod: d.paymentMethod,
          receiptNumber,
          salespersonEmail: email || undefined,
          salespersonName: username,
        },
      });
      await loadDrafts();
      toast.success(`Receipt ${receiptNumber} sent successfully.`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to record payment");
    }
  };

  return (
    <AppShell>
      <div className="p-6 lg:p-10 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-[#0f172a]">Resources</h1>
          <p className="mt-1 text-sm text-slate-500">
            Everything you need to move a client from first contact to monthly billing
          </p>
        </div>

        <section>
          <h2 className="text-sm font-semibold text-[#0f172a] uppercase tracking-wider mb-4">
            Document Library
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {cards.map((card) => (
              <div
                key={card.title}
                className="bg-white rounded-lg border border-slate-200 p-5 flex flex-col h-full"
              >
                <div className="text-3xl mb-3">{card.icon}</div>
                <h3 className="text-base font-semibold text-[#0f172a]">{card.title}</h3>
                <p className="mt-2 text-sm text-slate-500 flex-1">{card.description}</p>
                <a
                  href={card.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center justify-center h-9 px-4 rounded-md bg-[#2563eb] text-white text-sm font-medium hover:bg-[#1d4fd8] transition-colors"
                >
                  Open
                </a>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-[#0f172a] uppercase tracking-wider mb-4">
            Generate &amp; Send
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {TOOLS.map((tool) => (
              <div
                key={tool.title}
                className={`rounded-lg border p-5 flex flex-col h-full ${
                  tool.active
                    ? "bg-white border-slate-200"
                    : "bg-slate-50 border-slate-200 opacity-75"
                }`}
              >
                <div className="text-3xl mb-3">{tool.icon}</div>
                <h3 className="text-base font-semibold text-[#0f172a]">{tool.title}</h3>
                <p className="mt-2 text-sm text-slate-500 flex-1">{tool.description}</p>
                {tool.active ? (
                  <button
                    type="button"
                    onClick={() => openTool(tool.kind)}
                    className="mt-4 inline-flex items-center justify-center h-9 px-4 rounded-md bg-[#2563eb] text-white text-sm font-medium hover:bg-[#1d4fd8] transition-colors"
                  >
                    {tool.buttonLabel}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="mt-4 inline-flex items-center justify-center h-9 px-4 rounded-md bg-slate-200 text-slate-400 text-sm font-medium cursor-not-allowed"
                  >
                    {tool.buttonLabel}
                  </button>
                )}
                <p className="mt-2 text-xs text-slate-400">{tool.caption}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-[#0f172a] uppercase tracking-wider mb-4">
            Saved Drafts
          </h2>
          {drafts.length === 0 ? (
            <div className="bg-white rounded-lg border border-slate-200 p-6 text-sm text-slate-500">
              No drafts yet. Create an invoice or receipt and save it as a draft to see it here.
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="bg-slate-50">
                  <tr className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                    <th className="text-left px-4 py-2 w-[130px]">Number</th>
                    <th className="text-left px-4 py-2 w-[90px]">Type</th>
                    <th className="text-left px-4 py-2">Client</th>
                    <th className="text-right px-4 py-2 w-[110px]">Amount</th>
                    <th className="text-left px-4 py-2 w-[90px]">Status</th>
                    <th className="text-left px-4 py-2 w-[110px]">Date</th>
                    <th className="text-right px-4 py-2 w-[200px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {drafts.map((d) => {
                    const amount =
                      d.type === "invoice"
                        ? d.items.reduce((s, i) => s + (Number(i.amount) || 0), 0)
                        : d.items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
                    return (
                      <tr key={d.id} className="align-middle">
                        <td className="px-4 py-3 text-xs font-mono text-[#0f172a] whitespace-nowrap">
                          {d.number}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                              d.type === "invoice"
                                ? "bg-[#2563eb]/10 text-[#2563eb]"
                                : "bg-[#0f172a]/10 text-[#0f172a]"
                            }`}
                          >
                            {d.type === "invoice" ? "Invoice" : "Receipt"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-[#0f172a] truncate max-w-[260px]">
                          {d.businessName || "Untitled"}
                        </td>
                        <td className="px-4 py-3 text-sm text-[#0f172a] tabular-nums text-right whitespace-nowrap">
                          {money(amount)}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <StatusBadge status={d.status} />
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {new Date(d.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                            {d.type === "invoice" && d.stripeInvoiceId && (
                              <a
                                href={stripeInvoiceUrl(d.stripeInvoiceId)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center h-7 px-2 rounded-md bg-[#2563eb] text-white text-[11px] font-medium hover:bg-[#1d4fd8]"
                              >
                                View in Stripe
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => openDraft(d)}
                              className="inline-flex items-center justify-center h-7 px-3 rounded-md border border-slate-200 text-[11px] font-medium text-[#0f172a] hover:bg-slate-50"
                            >
                              View
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <InvoiceModal
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        username={username}
        draft={editingDraft && editingDraft.type === "invoice" ? editingDraft : null}
        onSave={saveInvoice}
        onSend={sendInvoice}
      />
      <ReceiptModal
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        username={username}
        draft={editingDraft && editingDraft.type === "receipt" ? editingDraft : null}
        onSave={saveReceipt}
        onSend={sendReceipt}
      />
    </AppShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || "draft").toLowerCase();
  const cls =
    s === "sent"
      ? "bg-[#2563eb]/10 text-[#2563eb]"
      : s === "paid"
        ? "bg-emerald-100 text-emerald-700"
        : "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded capitalize ${cls}`}>
      {s}
    </span>
  );
}

function LineItemsEditor({
  items,
  onChange,
}: {
  items: LineItem[];
  onChange: (next: LineItem[]) => void;
}) {
  const update = (idx: number, patch: Partial<LineItem>) => {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const remove = (idx: number) => {
    if (items.length === 1) return;
    onChange(items.filter((_, i) => i !== idx));
  };
  const add = () => onChange([...items, emptyItem()]);

  return (
    <div>
      <Label>Line Items *</Label>
      <div className="mt-1 rounded-md border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-[1fr_140px_110px_32px] gap-2 px-2 py-1.5 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
          <div>Description</div>
          <div>Type</div>
          <div className="text-right">Amount ($)</div>
          <div></div>
        </div>
        <div className="divide-y divide-slate-100">
          {items.map((it, idx) => (
            <div
              key={idx}
              className="grid grid-cols-[1fr_140px_110px_32px] gap-2 px-2 py-1.5 items-center"
            >
              <Input
                value={it.description}
                onChange={(e) => update(idx, { description: e.target.value })}
                placeholder="e.g. Website Build"
                className="h-8 text-sm"
              />
              <select
                value={it.type}
                onChange={(e) =>
                  update(idx, { type: e.target.value as LineItem["type"] })
                }
                className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
              >
                <option value="one-time">One-time</option>
                <option value="monthly">Monthly recurring</option>
              </select>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={it.amount}
                onChange={(e) =>
                  update(idx, { amount: Number(e.target.value) || 0 })
                }
                className="h-8 text-sm text-right tabular-nums"
              />
              <button
                type="button"
                onClick={() => remove(idx)}
                disabled={items.length === 1}
                className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-[#0f172a] disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Remove line item"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={add}
        className="mt-2 inline-flex items-center justify-center h-8 px-3 rounded-md border border-slate-200 text-xs font-medium text-[#0f172a] hover:bg-slate-50"
      >
        + Add Line Item
      </button>
    </div>
  );
}

function InvoiceModal({
  open,
  onOpenChange,
  username,
  draft,
  onSave,
  onSend,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  username: string;
  draft: InvoiceDraft | null;
  onSave: (d: InvoiceDraft) => void | Promise<unknown>;
  onSend: (d: InvoiceDraft) => void | Promise<unknown>;
}) {
  const [id, setId] = useState<string>("");
  const [number, setNumber] = useState<string>("");
  const [createdAt, setCreatedAt] = useState<string>("");
  const [businessName, setBusinessName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [items, setItems] = useState<LineItem[]>([emptyItem()]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    if (draft) {
      setId(draft.id);
      setNumber(draft.number);
      setCreatedAt(draft.createdAt);
      setBusinessName(draft.businessName);
      setClientEmail(draft.clientEmail);
      setServiceDescription(draft.serviceDescription);
      setItems(draft.items.length ? draft.items : [emptyItem()]);
      setNotes(draft.notes);
    } else {
      setId("");
      setNumber("Auto-assigned on save");
      setCreatedAt(new Date().toISOString());
      setBusinessName("");
      setClientEmail("");
      setServiceDescription("");
      setItems([emptyItem()]);
      setNotes("");
    }
  }, [open, draft]);

  const t = totals(items);
  const dateLabel = useMemo(
    () => (createdAt ? new Date(createdAt).toLocaleDateString() : ""),
    [createdAt],
  );

  const [sending, setSending] = useState(false);

  const hasValidItem = items.some(
    (i) => i.description.trim() && Number(i.amount) > 0,
  );
  const canSave =
    businessName.trim() &&
    clientEmail.trim() &&
    serviceDescription.trim() &&
    hasValidItem;

  const buildDraft = (): InvoiceDraft => ({
    id,
    type: "invoice",
    number,
    createdAt,
    businessName,
    clientEmail,
    salesperson: username,
    serviceDescription,
    items,
    notes,
    status: "draft",
  });

  const handleSave = async () => {
    if (!canSave) return;
    await onSave(buildDraft());
    onOpenChange(false);
  };

  const handleSend = async () => {
    if (!canSave) return;
    setSending(true);
    try {
      await onSend(buildDraft());
      onOpenChange(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#0f172a]">Create Invoice</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div>
              <Label>Client Business Name *</Label>
              <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
            </div>
            <div>
              <Label>Client Email *</Label>
              <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
            </div>
            <div>
              <Label>Salesperson</Label>
              <Input value={username} readOnly className="bg-slate-50" />
            </div>
            <div>
              <Label>Service Description *</Label>
              <Textarea
                value={serviceDescription}
                onChange={(e) => setServiceDescription(e.target.value)}
                rows={2}
              />
            </div>
            <LineItemsEditor items={items} onChange={setItems} />
            <div>
              <Label>Notes to client</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg border border-slate-200 p-5 text-sm">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-xl font-bold text-[#0f172a] tracking-tight">INVOICE</h3>
              <div className="text-right text-xs text-slate-500">
                <div className="font-mono text-[#0f172a]">{number}</div>
                <div>{dateLabel}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">From</div>
                <div className="text-[#0f172a] font-medium">PillarOS</div>
                <div className="text-slate-500 text-xs">willc@pillaros.net</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">To</div>
                <div className="text-[#0f172a] font-medium">{businessName || "—"}</div>
                <div className="text-slate-500 text-xs">{clientEmail || "—"}</div>
              </div>
            </div>
            <div className="mb-4 text-xs">
              <span className="text-slate-400">Salesperson: </span>
              <span className="text-[#0f172a]">{username || "—"}</span>
            </div>
            {serviceDescription && (
              <div className="mb-4 text-xs text-slate-600 italic">{serviceDescription}</div>
            )}
            <div className="border-t border-slate-200 pt-3 space-y-1.5">
              {items.filter((i) => i.description.trim() || i.amount > 0).length === 0 ? (
                <div className="text-slate-400 text-xs italic">No line items yet</div>
              ) : (
                items
                  .filter((i) => i.description.trim() || i.amount > 0)
                  .map((i, idx) => (
                    <div key={idx} className="flex justify-between text-xs">
                      <span className="text-slate-600">
                        {i.description || "—"}{" "}
                        <span className="text-slate-400">
                          ({i.type === "monthly" ? "Monthly" : "One-time"})
                        </span>
                      </span>
                      <span className="text-[#0f172a] tabular-nums">
                        {money(i.amount)}
                        {i.type === "monthly" ? "/mo" : ""}
                      </span>
                    </div>
                  ))
              )}
            </div>
            <div className="border-t border-slate-200 mt-3 pt-3 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">One-time total</span>
                <span className="text-[#0f172a] tabular-nums">{money(t.oneTime)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Monthly recurring</span>
                <span className="text-[#0f172a] tabular-nums">{money(t.monthly)}/month</span>
              </div>
              <div className="flex justify-between items-center pt-2 mt-1 border-t border-slate-200">
                <span className="text-[#0f172a] font-semibold text-sm">Total due today</span>
                <span className="text-[#2563eb] font-bold text-base tabular-nums">
                  {money(t.dueToday)}
                </span>
              </div>
            </div>
            {notes && (
              <div className="mt-4 pt-3 border-t border-slate-200 text-xs text-slate-600">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Notes</div>
                {notes}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || sending}
            className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-slate-200 text-sm font-medium text-[#0f172a] hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save as Draft
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSave || sending}
            className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-[#2563eb] text-white text-sm font-medium hover:bg-[#1d4fd8] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? "Sending…" : "Preview and Send"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptModal({
  open,
  onOpenChange,
  username,
  draft,
  onSave,
  onSend,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  username: string;
  draft: ReceiptDraft | null;
  onSave: (d: ReceiptDraft) => void | Promise<unknown>;
  onSend: (d: ReceiptDraft) => void | Promise<unknown>;
}) {
  const [id, setId] = useState<string>("");
  const [number, setNumber] = useState<string>("");
  const [createdAt, setCreatedAt] = useState<string>("");
  const [businessName, setBusinessName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [items, setItems] = useState<LineItem[]>([emptyItem()]);
  const [paymentMethod, setPaymentMethod] = useState("Bank Transfer");
  const [serviceDescription, setServiceDescription] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    if (draft) {
      setId(draft.id);
      setNumber(draft.number);
      setCreatedAt(draft.createdAt);
      setBusinessName(draft.businessName);
      setClientEmail(draft.clientEmail);
      setItems(draft.items.length ? draft.items : [emptyItem()]);
      setPaymentMethod(draft.paymentMethod);
      setServiceDescription(draft.serviceDescription);
      setNotes(draft.notes);
    } else {
      setId("");
      setNumber("Auto-assigned on save");
      setCreatedAt(new Date().toISOString());
      setBusinessName("");
      setClientEmail("");
      setItems([emptyItem()]);
      setPaymentMethod("Bank Transfer");
      setServiceDescription("");
      setNotes("");
    }
  }, [open, draft]);

  const dateLabel = useMemo(
    () => (createdAt ? new Date(createdAt).toLocaleDateString() : ""),
    [createdAt],
  );

  const t = totals(items);
  const total = t.oneTime + t.monthly;

  const [sending, setSending] = useState(false);

  const hasValidItem = items.some(
    (i) => i.description.trim() && Number(i.amount) > 0,
  );
  const canSave =
    businessName.trim() &&
    clientEmail.trim() &&
    serviceDescription.trim() &&
    hasValidItem;

  const buildDraft = (): ReceiptDraft => ({
    id,
    type: "receipt",
    number,
    createdAt,
    businessName,
    clientEmail,
    salesperson: username,
    items,
    paymentMethod,
    serviceDescription,
    notes,
    status: "draft",
  });

  const handleSave = async () => {
    if (!canSave) return;
    await onSave(buildDraft());
    onOpenChange(false);
  };

  const handleSend = async () => {
    if (!canSave) return;
    setSending(true);
    try {
      await onSend(buildDraft());
      onOpenChange(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#0f172a]">Send Receipt</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div>
              <Label>Client Business Name *</Label>
              <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
            </div>
            <div>
              <Label>Client Email *</Label>
              <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
            </div>
            <div>
              <Label>Salesperson</Label>
              <Input value={username} readOnly className="bg-slate-50" />
            </div>
            <div>
              <Label>Payment Method</Label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option>Bank Transfer</option>
                <option>Card</option>
                <option>Cash</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <Label>Service Description *</Label>
              <Input
                value={serviceDescription}
                onChange={(e) => setServiceDescription(e.target.value)}
              />
            </div>
            <LineItemsEditor items={items} onChange={setItems} />
            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg border border-slate-200 p-5 text-sm">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-xl font-bold text-[#0f172a] tracking-tight">RECEIPT</h3>
              <div className="text-right text-xs text-slate-500">
                <div className="font-mono text-[#0f172a]">{number}</div>
                <div>{dateLabel}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">From</div>
                <div className="text-[#0f172a] font-medium">PillarOS</div>
                <div className="text-slate-500 text-xs">willc@pillaros.net</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">To</div>
                <div className="text-[#0f172a] font-medium">{businessName || "—"}</div>
                <div className="text-slate-500 text-xs">{clientEmail || "—"}</div>
              </div>
            </div>
            <div className="mb-4 text-xs">
              <span className="text-slate-400">Salesperson: </span>
              <span className="text-[#0f172a]">{username || "—"}</span>
              <span className="text-slate-400"> · Payment: </span>
              <span className="text-[#0f172a]">{paymentMethod}</span>
            </div>
            <div className="border-t border-slate-200 pt-3 space-y-1.5">
              {items.filter((i) => i.description.trim() || i.amount > 0).length === 0 ? (
                <div className="text-slate-400 text-xs italic">No line items yet</div>
              ) : (
                items
                  .filter((i) => i.description.trim() || i.amount > 0)
                  .map((i, idx) => (
                    <div key={idx} className="flex justify-between text-xs">
                      <span className="text-slate-600">
                        {i.description || "—"}{" "}
                        <span className="text-slate-400">
                          ({i.type === "monthly" ? "Monthly" : "One-time"})
                        </span>
                      </span>
                      <span className="text-[#0f172a] tabular-nums">
                        {money(i.amount)}
                        {i.type === "monthly" ? "/mo" : ""}
                      </span>
                    </div>
                  ))
              )}
            </div>
            <div className="border-t border-slate-200 mt-3 pt-3 flex justify-between items-center">
              <span className="text-[#0f172a] font-semibold">Total received</span>
              <span className="text-[#2563eb] font-bold text-lg tabular-nums">
                {money(total)}
              </span>
            </div>
            {notes && (
              <div className="mt-4 pt-3 border-t border-slate-200 text-xs text-slate-600">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Notes</div>
                {notes}
              </div>
            )}
            <div className="mt-4 pt-3 border-t border-slate-200 text-center text-xs font-medium text-[#2563eb]">
              Payment confirmed — Thank you
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || sending}
            className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-slate-200 text-sm font-medium text-[#0f172a] hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save as Draft
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSave || sending}
            className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-[#2563eb] text-white text-sm font-medium hover:bg-[#1d4fd8] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? "Sending…" : "Send Receipt"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
