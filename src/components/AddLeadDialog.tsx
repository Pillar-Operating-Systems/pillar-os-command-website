import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useSales } from "@/lib/salesStore";

export function AddLeadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addLead } = useSales();
  const [form, setForm] = useState({ business: "", industry: "", suburb: "", phone: "", website: "", notes: "", services: "" });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.business.trim() || saving) return;
    setSaving(true);
    await addLead({
      business: form.business.trim(),
      industry: form.industry,
      suburb: form.suburb,
      phone: form.phone,
      website: form.website,
      notes: "",
      rating: 0,
      reviewCount: 0,
      webScore: "None",
      whyNeedUs: form.services,
      coldCallOpener: form.notes,
      pillarOSPitch: "",
    });
    setSaving(false);
    setForm({ business: "", industry: "", suburb: "", phone: "", website: "", notes: "", services: "" });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Add lead manually</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {[
            { k: "business", label: "Business name *" },
            { k: "industry", label: "Industry" },
            { k: "suburb", label: "Suburb" },
            { k: "phone", label: "Phone" },
            { k: "website", label: "Website" },
          ].map((f) => (
            <div key={f.k}>
              <label className="text-xs font-medium text-slate-600 mb-1 block">{f.label}</label>
              <input
                value={form[f.k as keyof typeof form]}
                onChange={set(f.k as keyof typeof form)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent"
              />
            </div>
          ))}
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Services Interested In</label>
            <textarea
              value={form.services}
              onChange={set("services")}
              rows={3}
              placeholder="e.g. AI Receptionist, SEO Manager, Website"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Notes</label>
            <textarea
              value={form.notes}
              onChange={set("notes")}
              rows={3}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent"
            />
          </div>
        </div>
        <DialogFooter>
          <button onClick={onClose} className="px-3 py-2 text-sm rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200">Cancel</button>
          <button
            onClick={submit}
            disabled={!form.business.trim() || saving}
            className="px-3 py-2 text-sm rounded-md bg-[#2563eb] text-white hover:bg-[#1d4ed8] disabled:opacity-50"
          >
            {saving ? "Adding…" : "Add lead"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
