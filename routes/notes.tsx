import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Bold, Italic, List, ListOrdered, Pin, PinOff, Plus, Search, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/notes")({ component: NotesPage });

type Note = {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

const PRIMARY = "#2563EB";

function NotesPage() {
  const { userId } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<{ title: string; content: string } | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .eq("created_by", userId)
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) { toast.error(error.message); return; }
    setNotes((data ?? []) as Note[]);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const selected = useMemo(() => notes.find((n) => n.id === selectedId) ?? null, [notes, selectedId]);

  // Hydrate editor when selection changes
  useEffect(() => {
    if (selected) {
      setDraftTitle(selected.title ?? "");
      setDraftContent(selected.content ?? "");
      lastSavedRef.current = { title: selected.title ?? "", content: selected.content ?? "" };
      setSavedAt(null);
    } else {
      setDraftTitle("");
      setDraftContent("");
      lastSavedRef.current = null;
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save every 3s while typing
  useEffect(() => {
    if (!selected) return;
    const last = lastSavedRef.current;
    if (last && last.title === draftTitle && last.content === draftContent) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      const { error } = await supabase
        .from("notes")
        .update({ title: draftTitle, content: draftContent })
        .eq("id", selected.id);
      setSaving(false);
      if (error) { toast.error(error.message); return; }
      lastSavedRef.current = { title: draftTitle, content: draftContent };
      setSavedAt(new Date());
      setNotes((arr) => arr.map((n) => n.id === selected.id
        ? { ...n, title: draftTitle, content: draftContent, updated_at: new Date().toISOString() } : n));
    }, 3000);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [draftTitle, draftContent, selected]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = notes;
    if (q) {
      list = list.filter((n) =>
        (n.title ?? "").toLowerCase().includes(q) ||
        (n.content ?? "").toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updated_at.localeCompare(a.updated_at);
    });
  }, [notes, search]);

  const createNote = async () => {
    if (!userId) return;
    const title = `Untitled Note — ${format(new Date(), "MMM d, yyyy")}`;
    const { data, error } = await supabase
      .from("notes")
      .insert({ title, content: "", pinned: false, created_by: userId })
      .select("*")
      .single();
    if (error) { toast.error(error.message); return; }
    const n = data as Note;
    setNotes((arr) => [n, ...arr]);
    setSelectedId(n.id);
  };

  const togglePin = async () => {
    if (!selected) return;
    const next = !selected.pinned;
    const { error } = await supabase.from("notes").update({ pinned: next }).eq("id", selected.id);
    if (error) { toast.error(error.message); return; }
    setNotes((arr) => arr.map((n) => n.id === selected.id ? { ...n, pinned: next } : n));
  };

  const deleteNote = async () => {
    if (!selected) return;
    const { error } = await supabase.from("notes").delete().eq("id", selected.id);
    if (error) { toast.error(error.message); return; }
    setNotes((arr) => arr.filter((n) => n.id !== selected.id));
    setSelectedId(null);
    setConfirmDelete(false);
    toast.success("Note deleted");
  };

  const wrapSelection = (before: string, after: string = before) => {
    const el = bodyRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const value = draftContent;
    const sel = value.slice(start, end);
    const next = value.slice(0, start) + before + sel + after + value.slice(end);
    setDraftContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = start + before.length;
      el.selectionEnd = end + before.length;
    });
  };

  const prefixLines = (prefix: (i: number) => string) => {
    const el = bodyRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const value = draftContent;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = value.indexOf("\n", end);
    const sliceEnd = lineEnd === -1 ? value.length : lineEnd;
    const block = value.slice(lineStart, sliceEnd);
    const lines = block.split("\n").map((l, i) => `${prefix(i)}${l}`);
    const next = value.slice(0, lineStart) + lines.join("\n") + value.slice(sliceEnd);
    setDraftContent(next);
    requestAnimationFrame(() => el.focus());
  };

  const savedLabel = saving ? "Saving…" : savedAt ? `Saved ${formatDistanceToNow(savedAt, { addSuffix: true })}` : selected ? "Saved" : "";

  return (
    <AppShell>
      <div className="p-6 lg:p-10 max-w-[1600px] mx-auto">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-[#0f172a]">Notes</h1>
            <p className="mt-1 text-sm text-slate-500">Your personal workspace — private to each user</p>
          </div>
          <button
            onClick={createNote}
            className="inline-flex items-center gap-1.5 rounded-md text-white text-sm font-medium px-3 py-2 hover:opacity-90"
            style={{ background: PRIMARY }}
          ><Plus className="h-4 w-4" /> New Note</button>
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: "30% 1fr" }}>
          {/* List */}
          <div className="rounded-lg border border-slate-200 bg-white flex flex-col min-h-[70vh]">
            <div className="p-3 border-b border-slate-200">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search notes…"
                  className="w-full border border-slate-200 rounded-md pl-8 pr-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {filtered.length === 0 ? (
                <p className="p-4 text-sm text-slate-400">No notes yet. Click "New Note" to begin.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filtered.map((n) => {
                    const firstLine = (n.content ?? "").split("\n").find((l) => l.trim()) ?? "";
                    return (
                      <li key={n.id}>
                        <button
                          onClick={() => setSelectedId(n.id)}
                          className={cn(
                            "w-full text-left px-3 py-3 hover:bg-slate-50",
                            selectedId === n.id && "bg-blue-50/60",
                          )}
                        >
                          <div className="flex items-center gap-1.5">
                            {n.pinned && <span aria-hidden>📌</span>}
                            <span className="text-sm font-medium text-[#0f172a] truncate">
                              {n.title || "Untitled"}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 truncate mt-0.5">{firstLine || "Empty note"}</div>
                          <div className="text-[11px] text-slate-400 mt-1">
                            Updated {format(new Date(n.updated_at), "MMM d, yyyy · h:mma")}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Editor */}
          <div className="rounded-lg border border-slate-200 bg-white flex flex-col min-h-[70vh]">
            {!selected ? (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
                Select a note or create a new one.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 p-3 border-b border-slate-200">
                  <div className="flex items-center gap-1">
                    <button onClick={() => wrapSelection("**")} className="p-1.5 rounded hover:bg-slate-100" title="Bold"><Bold className="h-4 w-4" /></button>
                    <button onClick={() => wrapSelection("*")} className="p-1.5 rounded hover:bg-slate-100" title="Italic"><Italic className="h-4 w-4" /></button>
                    <button onClick={() => prefixLines(() => "- ")} className="p-1.5 rounded hover:bg-slate-100" title="Bullet list"><List className="h-4 w-4" /></button>
                    <button onClick={() => prefixLines((i) => `${i + 1}. `)} className="p-1.5 rounded hover:bg-slate-100" title="Numbered list"><ListOrdered className="h-4 w-4" /></button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{savedLabel}</span>
                    <button onClick={togglePin} className="p-1.5 rounded hover:bg-slate-100" title={selected.pinned ? "Unpin" : "Pin"}>
                      {selected.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                    </button>
                    <button onClick={() => setConfirmDelete(true)} className="p-1.5 rounded hover:bg-red-50 text-red-600" title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <input
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder="Untitled"
                  className="px-5 pt-5 pb-2 text-2xl font-semibold text-[#0f172a] outline-none border-0 bg-transparent"
                />
                <textarea
                  ref={bodyRef}
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                  placeholder="Start writing…"
                  className="flex-1 px-5 pb-5 text-sm text-[#0f172a] outline-none border-0 resize-none bg-transparent leading-relaxed"
                />
              </>
            )}
          </div>
        </div>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete note</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Are you sure you want to delete this note? This cannot be undone.
          </p>
          <DialogFooter>
            <button onClick={() => setConfirmDelete(false)} className="px-3 py-2 rounded-md border border-slate-200 text-sm">Cancel</button>
            <button onClick={deleteNote} className="px-3 py-2 rounded-md bg-red-500 hover:bg-red-600 text-white text-sm">Delete</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
