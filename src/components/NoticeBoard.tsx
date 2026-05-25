import { useEffect, useState, useCallback } from "react";
import { Megaphone, Pin, Trash2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

interface Notice {
  id: string;
  title: string;
  body: string;
  priority: string;
  pinned: boolean;
  created_at: string;
  created_by: string | null;
}

export function NoticeBoard() {
  const { role, userId } = useAuth();
  const isOwner = role === "owner";
  const [notices, setNotices] = useState<Notice[]>([]);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("normal");
  const [pinned, setPinned] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("notices")
      .select("*")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    setNotices((data ?? []) as Notice[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const { error } = await supabase.from("notices").insert({
      title: title.trim(), body: body.trim(), priority, pinned, created_by: userId,
    });
    if (error) return toast.error(error.message);
    toast.success("Notice posted");
    setTitle(""); setBody(""); setPriority("normal"); setPinned(false); setAdding(false);
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("notices").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const togglePin = async (n: Notice) => {
    const { error } = await supabase.from("notices").update({ pinned: !n.pinned }).eq("id", n.id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-[#2563eb]" />
          <h2 className="text-sm font-semibold text-[#0f172a]">Notice Board</h2>
        </div>
        {isOwner && (
          <button onClick={() => setAdding((v) => !v)}
            className="inline-flex items-center gap-1 px-3 py-1 rounded bg-[#2563eb] text-white text-xs hover:bg-[#1d4ed8]">
            <Plus className="h-3 w-3" /> {adding ? "Cancel" : "New Notice"}
          </button>
        )}
      </div>

      {isOwner && adding && (
        <form onSubmit={add} className="mb-4 space-y-2 p-3 rounded-md border border-slate-200 bg-slate-50">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" required
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Body" rows={3}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white" />
          <div className="flex items-center gap-3 text-xs">
            <select value={priority} onChange={(e) => setPriority(e.target.value)}
              className="px-2 py-1 border border-slate-300 rounded bg-white">
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <label className="flex items-center gap-1 text-slate-600">
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Pinned
            </label>
            <button type="submit" className="ml-auto px-3 py-1 bg-[#2563eb] text-white rounded text-xs hover:bg-[#1d4ed8]">Post</button>
          </div>
        </form>
      )}

      {notices.length === 0 ? (
        <p className="text-sm text-slate-500">No notices yet.</p>
      ) : (
        <ul className="space-y-2">
          {notices.map((n) => {
            const tone =
              n.priority === "urgent" ? "border-red-300 bg-red-50" :
              n.priority === "high" ? "border-amber-300 bg-amber-50" :
              "border-slate-200 bg-white";
            return (
              <li key={n.id} className={`rounded-md border p-3 ${tone}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {n.pinned && <Pin className="h-3 w-3 text-[#2563eb]" />}
                      <span className="text-sm font-semibold text-[#0f172a]">{n.title}</span>
                      {n.priority !== "normal" && (
                        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${n.priority === "urgent" ? "bg-red-600 text-white" : "bg-amber-500 text-white"}`}>
                          {n.priority}
                        </span>
                      )}
                    </div>
                    {n.body && <div className="mt-1 text-xs text-slate-600 whitespace-pre-wrap">{n.body}</div>}
                    <div className="mt-1 text-[10px] text-slate-400">{new Date(n.created_at).toLocaleString()}</div>
                  </div>
                  {isOwner && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => togglePin(n)} className="p-1 rounded hover:bg-white/60" title="Pin">
                        <Pin className={`h-3.5 w-3.5 ${n.pinned ? "text-[#2563eb]" : "text-slate-400"}`} />
                      </button>
                      <button onClick={() => remove(n.id)} className="p-1 rounded hover:bg-white/60" title="Delete">
                        <Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-red-600" />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
