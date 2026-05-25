import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, isSameDay,
  isSameMonth, isToday, parseISO, startOfDay, startOfMonth, startOfWeek, subMonths, subWeeks,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus, X as XIcon } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({ component: CalendarPage });

type ViewMode = "month" | "week" | "day";
type TaskType = "task" | "follow_up" | "meeting" | "billing" | "other";

type CalEvent = {
  id: string;
  title: string;
  due_date: string; // YYYY-MM-DD
  due_time: string | null; // HH:MM
  task_type: TaskType;
  status: string;
  assigned_to: string | null;
  notes: string | null;
  source?: "task" | "pipeline" | "lead";
  color?: string;
  readOnly?: boolean;
  lead?: { id: string; business_name: string; phone: string; follow_up_notes: string };
};
type LeadInfo = NonNullable<CalEvent["lead"]>;

const TYPE_LABEL: Record<TaskType, string> = {
  task: "Task",
  follow_up: "Follow-up",
  meeting: "Meeting",
  billing: "Billing",
  other: "Other",
};

function colorFor(ev: CalEvent): string {
  if (ev.color) return ev.color;
  if (ev.status === "completed" || ev.status === "done") return "#10B981";
  const due = parseISO(ev.due_date);
  if (due < startOfDay(new Date()) && ev.status !== "completed" && ev.status !== "done") return "#EF4444";
  switch (ev.task_type) {
    case "follow_up": return "#F59E0B";
    case "billing": return "#8B5CF6";
    case "meeting":
    case "task": return "#94A3B8";
    default: return "#2563EB";
  }
}

const HOUR_OPTIONS = Array.from({ length: 15 }, (_, i) => i + 6); // 6..20
const MINUTE_OPTIONS = ["00", "15", "30", "45"];
const formatHour12 = (h: number) => {
  const period = h >= 12 ? "pm" : "am";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${period}`;
};

function CalendarPage() {
  const { role, userId, displayName } = useAuth();
  const [view, setView] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState<Date>(new Date());
  const [selected, setSelected] = useState<Date>(new Date());
  const [taskEvents, setTaskEvents] = useState<CalEvent[]>([]);
  const [autoEvents, setAutoEvents] = useState<CalEvent[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [filterUser, setFilterUser] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of members) m.set(x.id, x.name);
    if (userId && displayName && !m.has(userId)) m.set(userId, displayName);
    return m;
  }, [members, userId, displayName]);

  const idByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of members) m.set(x.name.toLowerCase(), x.id);
    if (userId && displayName) m.set(displayName.toLowerCase(), userId);
    return m;
  }, [members, userId, displayName]);

  const nameFor = useCallback((id: string | null) => {
    if (!id) return "Unassigned";
    return nameById.get(id) ?? "Unassigned";
  }, [nameById]);

  const resolveAssignee = useCallback((username: string | null | undefined): string | null => {
    if (!username) return null;
    return idByName.get(username.toLowerCase()) ?? null;
  }, [idByName]);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("id,title,due_date,task_type,status,assigned_to,description,priority")
      .not("due_date", "is", null)
      .order("due_date", { ascending: true });
    if (error) { toast.error(error.message); return; }
    setTaskEvents((data ?? []).map((r) => {
      const desc = (r.description ?? "") as string;
      const timeMatch = desc.match(/^\[time:(\d{2}:\d{2})\]\s*/);
      return {
        id: r.id,
        title: r.title,
        due_date: r.due_date as string,
        due_time: timeMatch ? timeMatch[1] : null,
        task_type: (r.task_type as TaskType) ?? "task",
        status: r.status ?? "open",
        assigned_to: (r.assigned_to as string | null) ?? null,
        notes: timeMatch ? desc.slice(timeMatch[0].length) : desc,
        source: "task",
      };
    }));
  }, []);

  const loadAuto = useCallback(async () => {
    const [dealsRes, leadsRes] = await Promise.all([
      supabase
        .from("pipeline_deals")
        .select("id,business_name,assigned_to,next_action,next_action_date")
        .not("next_action_date", "is", null),
      supabase
        .from("leads")
        .select("id,business_name,phone,status,assigned_to,follow_up_date,follow_up_notes")
        .eq("status", "follow_up")
        .not("follow_up_date", "is", null),
    ]);

    if (dealsRes.error) console.error("pipeline_deals:", dealsRes.error.message);
    if (leadsRes.error) console.error("leads:", leadsRes.error.message);

    const out: CalEvent[] = [];
    const today = startOfDay(new Date());

    for (const d of dealsRes.data ?? []) {
      if (!d.next_action_date) continue;
      const assignee = resolveAssignee(d.assigned_to as string | null);
      const action = ((d.next_action as string | null) ?? "").trim();
      out.push({
        id: `deal-${d.id}`,
        title: action ? `${d.business_name} — ${action}` : `${d.business_name} — Next Action`,
        due_date: d.next_action_date as string,
        due_time: null,
        task_type: "other",
        status: "pending",
        assigned_to: assignee,
        notes: null,
        source: "pipeline",
        color: "#2563EB",
        readOnly: true,
      });
    }

    for (const l of leadsRes.data ?? []) {
      if (!l.follow_up_date) continue;
      const due = parseISO(l.follow_up_date as string);
      const overdue = startOfDay(due) < today;
      out.push({
        id: `lead-${l.id}`,
        title: `${l.business_name} — Follow Up`,
        due_date: format(due, "yyyy-MM-dd"),
        due_time: null,
        task_type: "follow_up",
        status: "pending",
        assigned_to: resolveAssignee(l.assigned_to as string | null),
        notes: (l.follow_up_notes as string | null) ?? null,
        source: "lead",
        color: overdue ? "#EF4444" : "#F59E0B",
        readOnly: true,
        lead: {
          id: l.id as string,
          business_name: l.business_name as string,
          phone: (l.phone as string) ?? "",
          follow_up_notes: (l.follow_up_notes as string) ?? "",
        },
      });
    }

    setAutoEvents(out);
  }, [resolveAssignee]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadAuto(); }, [loadAuto]);

  useEffect(() => {
    supabase.from("profiles").select("id,display_name,username,email").then(({ data }) => {
      setMembers((data ?? []).map((p) => ({
        id: p.id as string,
        name: (p.username ?? p.display_name ?? p.email) as string,
      })));
    });
  }, []);

  const allEvents = useMemo(() => [...taskEvents, ...autoEvents], [taskEvents, autoEvents]);

  const filteredEvents = useMemo(() => {
    if (role === "owner") {
      if (!filterUser) return allEvents;
      return allEvents.filter((e) => e.assigned_to === filterUser);
    }
    // sales: own events; allow unassigned only for manually created tasks
    return allEvents.filter((e) => e.assigned_to === userId || (e.assigned_to === null && e.source === "task"));
  }, [allEvents, role, filterUser, userId]);

  const eventsByDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const e of filteredEvents) {
      const k = e.due_date;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    return m;
  }, [filteredEvents]);

  const selectedKey = format(selected, "yyyy-MM-dd");
  const todayEvents = eventsByDay.get(selectedKey) ?? [];
  const upcoming = useMemo(() => {
    const now = startOfDay(new Date());
    return filteredEvents
      .filter((e) => parseISO(e.due_date) >= now)
      .sort((a, b) => (a.due_date + (a.due_time ?? "")).localeCompare(b.due_date + (b.due_time ?? "")))
      .slice(0, 5);
  }, [filteredEvents]);
  const overdue = useMemo(() => {
    const now = startOfDay(new Date());
    return filteredEvents.filter((e) => parseISO(e.due_date) < now && e.status !== "completed" && e.status !== "done");
  }, [filteredEvents]);

  const navigate = (dir: -1 | 1) => {
    if (view === "month") setCursor((c) => (dir < 0 ? subMonths(c, 1) : addMonths(c, 1)));
    else if (view === "week") setCursor((c) => (dir < 0 ? subWeeks(c, 1) : addWeeks(c, 1)));
    else setCursor((c) => addDays(c, dir));
  };

  const headerLabel = view === "month"
    ? format(cursor, "MMMM yyyy")
    : view === "week"
    ? `${format(startOfWeek(cursor), "MMM d")} – ${format(endOfWeek(cursor), "MMM d, yyyy")}`
    : format(cursor, "EEEE, MMMM d, yyyy");

  return (
    <AppShell>
      <div className="p-6 lg:p-10 max-w-[1600px] mx-auto">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-[#0f172a]">Calendar</h1>
            <p className="mt-1 text-sm text-slate-500">Your schedule, follow-ups, tasks and billing dates in one place</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-md border border-slate-200 bg-white p-0.5">
              {(["month", "week", "day"] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded capitalize transition",
                    view === v ? "bg-[#2563eb] text-white" : "text-slate-600 hover:bg-slate-50",
                  )}
                >{v}</button>
              ))}
            </div>
            <button
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm font-medium px-3 py-2"
            ><Plus className="h-4 w-4" /> Add Event</button>
          </div>
        </div>

        {role === "owner" && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <button
              onClick={() => setFilterUser(null)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md border transition",
                filterUser === null
                  ? "bg-[#2563eb] text-white border-[#2563eb]"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
              )}
            >All</button>
            {members.map((m) => (
              <button
                key={m.id}
                onClick={() => setFilterUser(m.id)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md border transition",
                  filterUser === m.id
                    ? "bg-[#2563eb] text-white border-[#2563eb]"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
                )}
              >{m.name}</button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button onClick={() => navigate(-1)} className="p-1.5 rounded hover:bg-slate-100"><ChevronLeft className="h-4 w-4" /></button>
                <button onClick={() => navigate(1)} className="p-1.5 rounded hover:bg-slate-100"><ChevronRight className="h-4 w-4" /></button>
                <button onClick={() => { setCursor(new Date()); setSelected(new Date()); }} className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50">Today</button>
              </div>
              <div className="text-sm font-medium text-[#0f172a]">{headerLabel}</div>
              <div className="w-[140px]" />
            </div>

            {view === "month" && (
              <MonthGrid
                cursor={cursor} selected={selected} setSelected={setSelected}
                eventsByDay={eventsByDay} expandedDay={expandedDay} setExpandedDay={setExpandedDay}
                nameFor={nameFor} onSelectEvent={setSelectedEvent}
              />
            )}
            {view === "week" && (
              <WeekGrid cursor={cursor} eventsByDay={eventsByDay} setSelected={setSelected} nameFor={nameFor} onSelectEvent={setSelectedEvent} />
            )}
            {view === "day" && (
              <DayGrid cursor={cursor} events={eventsByDay.get(format(cursor, "yyyy-MM-dd")) ?? []} nameFor={nameFor} onSelectEvent={setSelectedEvent} />
            )}
          </div>

          <aside className="space-y-4">
            <SidePanel title="Today's Agenda" empty="Nothing scheduled.">
              {todayEvents.map((e) => <EventRow key={e.id} ev={e} nameFor={nameFor} onSelectEvent={setSelectedEvent} />)}
            </SidePanel>
            <SidePanel title="Upcoming" empty="No upcoming events.">
              {upcoming.map((e) => <EventRow key={e.id} ev={e} showDate nameFor={nameFor} onSelectEvent={setSelectedEvent} />)}
            </SidePanel>
            <SidePanel title="Overdue" empty="Nothing overdue." accent="#EF4444">
              {overdue.map((e) => <EventRow key={e.id} ev={e} showDate nameFor={nameFor} onSelectEvent={setSelectedEvent} />)}
            </SidePanel>
          </aside>
        </div>
      </div>

      <AddEventDialog
        open={open}
        onClose={() => setOpen(false)}
        role={role}
        userId={userId}
        members={members}
        onSaved={() => { setOpen(false); load(); }}
      />

      <EventDetailsDialog
        event={selectedEvent}
        nameFor={nameFor}
        onClose={() => setSelectedEvent(null)}
        onChanged={() => { setSelectedEvent(null); load(); }}
      />

    </AppShell>
  );
}

function MonthGrid({ cursor, selected, setSelected, eventsByDay, expandedDay, setExpandedDay, nameFor, onSelectEvent }: {
  cursor: Date; selected: Date; setSelected: (d: Date) => void;
  eventsByDay: Map<string, CalEvent[]>; expandedDay: string | null; setExpandedDay: (k: string | null) => void;
  nameFor: (id: string | null) => string;
  onSelectEvent: (e: CalEvent) => void;
}) {
  const start = startOfWeek(startOfMonth(cursor));
  const end = endOfWeek(endOfMonth(cursor));
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);

  return (
    <div>
      <div className="grid grid-cols-7 text-xs font-medium text-slate-500 mb-1">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => <div key={d} className="px-2 py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-px bg-slate-200 rounded overflow-hidden">
        {days.map((d) => {
          const k = format(d, "yyyy-MM-dd");
          const dayEvents = eventsByDay.get(k) ?? [];
          const inMonth = isSameMonth(d, cursor);
          const sel = isSameDay(d, selected);
          const expanded = expandedDay === k;
          const show = expanded ? dayEvents : dayEvents.slice(0, 3);
          return (
            <div
              key={k}
              onClick={() => setSelected(d)}
              className={cn(
                "bg-white min-h-[110px] p-1.5 text-xs cursor-pointer hover:bg-slate-50",
                !inMonth && "bg-slate-50/50 text-slate-400",
                sel && "ring-2 ring-inset ring-[#2563eb]",
              )}
            >
              <div className="flex justify-end mb-1">
                {isToday(d) ? (
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#2563eb] text-white font-medium">{format(d, "d")}</span>
                ) : (
                  <span className="px-1">{format(d, "d")}</span>
                )}
              </div>
              <div className="space-y-0.5">
                {show.map((e) => (
                  <div key={e.id}
                    onClick={(ev) => { ev.stopPropagation(); onSelectEvent(e); }}
                    className="truncate rounded px-1.5 py-0.5 text-white text-[11px] cursor-pointer hover:opacity-90"
                    style={{ backgroundColor: colorFor(e) }}
                    title={e.title}
                  >
                    {e.due_time ? `${e.due_time} ` : ""}{e.title} — {nameFor(e.assigned_to)}
                  </div>
                ))}
                {!expanded && dayEvents.length > 3 && (
                  <button
                    onClick={(ev) => { ev.stopPropagation(); setExpandedDay(k); }}
                    className="text-[11px] text-[#2563eb] hover:underline"
                  >+{dayEvents.length - 3} more</button>
                )}
                {expanded && (
                  <button
                    onClick={(ev) => { ev.stopPropagation(); setExpandedDay(null); }}
                    className="text-[11px] text-slate-500 hover:underline"
                  >Show less</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7..20

function WeekGrid({ cursor, eventsByDay, setSelected, nameFor, onSelectEvent }: {
  cursor: Date; eventsByDay: Map<string, CalEvent[]>; setSelected: (d: Date) => void;
  nameFor: (id: string | null) => string;
  onSelectEvent: (e: CalEvent) => void;
}) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="overflow-auto">
      <div className="grid" style={{ gridTemplateColumns: "60px repeat(7, minmax(120px, 1fr))" }}>
        <div />
        {days.map((d) => (
          <div key={d.toISOString()} onClick={() => setSelected(d)}
            className={cn("px-2 py-1 text-xs font-medium text-center border-b cursor-pointer", isToday(d) && "text-[#2563eb]")}>
            {format(d, "EEE d")}
          </div>
        ))}
        {HOURS.map((h) => (
          <FragmentRow key={h} h={h} days={days} eventsByDay={eventsByDay} nameFor={nameFor} onSelectEvent={onSelectEvent} />
        ))}
      </div>
    </div>
  );
}

function FragmentRow({ h, days, eventsByDay, nameFor, onSelectEvent }: { h: number; days: Date[]; eventsByDay: Map<string, CalEvent[]>; nameFor: (id: string | null) => string; onSelectEvent: (e: CalEvent) => void }) {
  return (
    <>
      <div className="text-[11px] text-slate-500 text-right pr-2 py-1 border-t">{h}:00</div>
      {days.map((d) => {
        const k = format(d, "yyyy-MM-dd");
        const list = (eventsByDay.get(k) ?? []).filter((e) => {
          if (!e.due_time) return h === 7;
          const eh = parseInt(e.due_time.slice(0, 2), 10);
          return eh === h;
        });
        return (
          <div key={k + h} className="border-t border-l min-h-[44px] p-1 space-y-1">
            {list.map((e) => (
              <div key={e.id}
                onClick={() => onSelectEvent(e)}
                className="rounded px-1.5 py-1 text-white text-[11px] truncate cursor-pointer hover:opacity-90"
                style={{ backgroundColor: colorFor(e) }}>
                <div className="truncate">{e.due_time ? `${e.due_time} ` : ""}{e.title}</div>
                <div className="text-[10px] opacity-90 truncate">{nameFor(e.assigned_to)}</div>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

function DayGrid({ cursor, events, nameFor, onSelectEvent }: { cursor: Date; events: CalEvent[]; nameFor: (id: string | null) => string; onSelectEvent: (e: CalEvent) => void }) {
  return (
    <div className="space-y-px">
      {HOURS.map((h) => {
        const list = events.filter((e) => {
          if (!e.due_time) return h === 7;
          return parseInt(e.due_time.slice(0, 2), 10) === h;
        });
        return (
          <div key={h} className="grid grid-cols-[60px_1fr] gap-2 border-t py-2">
            <div className="text-xs text-slate-500 text-right pr-2">{h}:00</div>
            <div className="space-y-1">
              {list.length === 0 && <div className="text-xs text-slate-300">—</div>}
              {list.map((e) => (
                <div key={e.id}
                  onClick={() => onSelectEvent(e)}
                  className="rounded px-3 py-2 text-white text-sm cursor-pointer hover:opacity-90"
                  style={{ backgroundColor: colorFor(e) }}>
                  <div className="font-medium">{e.title}</div>
                  <div className="text-xs opacity-90">{nameFor(e.assigned_to)}</div>
                  <div className="text-xs opacity-90">{e.due_time ?? "All day"} · {TYPE_LABEL[e.task_type]}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <div className="text-xs text-slate-400 pt-2">{format(cursor, "EEEE, MMM d")}</div>
    </div>
  );
}

function SidePanel({ title, children, empty, accent }: { title: string; children: React.ReactNode; empty: string; accent?: string }) {
  const arr = Array.isArray(children) ? children : [children];
  const hasContent = arr.some(Boolean) && arr.length > 0 && arr[0] !== undefined && arr.flat().filter(Boolean).length > 0;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-[#0f172a] mb-3" style={accent ? { color: accent } : undefined}>{title}</h3>
      <div className="space-y-2">
        {hasContent ? children : <p className="text-xs text-slate-400">{empty}</p>}
      </div>
    </div>
  );
}

function EventRow({ ev, showDate, nameFor, onSelectEvent }: { ev: CalEvent; showDate?: boolean; nameFor: (id: string | null) => string; onSelectEvent: (e: CalEvent) => void }) {
  return (
    <div
      onClick={() => onSelectEvent(ev)}
      className="flex items-start gap-2 text-sm cursor-pointer hover:bg-slate-50 -mx-2 px-2 py-1 rounded"
    >
      <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colorFor(ev) }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-[#0f172a]">{ev.title}</div>
          <div className="text-[11px] text-slate-500 shrink-0">{nameFor(ev.assigned_to)}</div>
        </div>
        <div className="text-[11px] text-slate-500">
          {showDate ? format(parseISO(ev.due_date), "MMM d") : null}
          {showDate && ev.due_time ? " · " : null}
          {ev.due_time ?? (showDate ? null : "All day")}
          {" · "}{TYPE_LABEL[ev.task_type]}
        </div>
      </div>
    </div>
  );
}

function EventDetailsDialog({ event, nameFor, onClose, onChanged }: {
  event: CalEvent | null;
  nameFor: (id: string | null) => string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const completeTask = async () => {
    if (!event) return;
    setBusy(true);
    const { error } = await supabase.from("tasks").update({ status: "completed" }).eq("id", event.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Marked complete.");
    onChanged();
  };

  return (
    <Dialog open={!!event} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{event?.title ?? "Event"}</DialogTitle>
        </DialogHeader>
        {event && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-medium text-slate-500">Date</div>
                <div className="text-[#0f172a]">{format(parseISO(event.due_date), "EEE, MMM d, yyyy")}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500">Time</div>
                <div className="text-[#0f172a]">{event.due_time ?? "All day"}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-medium text-slate-500">Assigned to</div>
                <div className="text-[#0f172a]">{nameFor(event.assigned_to)}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500">Type</div>
                <div className="text-[#0f172a]">
                  {event.source === "pipeline" ? "Pipeline" : event.source === "lead" ? "Lead Follow-up" : TYPE_LABEL[event.task_type]}
                </div>
              </div>
            </div>
            {event.source === "lead" && event.lead && (
              <>
                <div>
                  <div className="text-xs font-medium text-slate-500">Business</div>
                  <div className="text-[#0f172a]">{event.lead.business_name}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Phone</div>
                  <div className="text-[#0f172a]">{event.lead.phone || "—"}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Follow-up notes</div>
                  <div className="text-[#0f172a] whitespace-pre-wrap">{event.lead.follow_up_notes || "—"}</div>
                </div>
              </>
            )}
            {event.source === "pipeline" && (
              <div>
                <div className="text-xs font-medium text-slate-500">Business</div>
                <div className="text-[#0f172a]">{event.title.split(" — ")[0]}</div>
              </div>
            )}
            {event.notes && event.source !== "lead" && (
              <div>
                <div className="text-xs font-medium text-slate-500">Notes</div>
                <div className="text-[#0f172a] whitespace-pre-wrap">{event.notes}</div>
              </div>
            )}
            {event.status && (
              <div>
                <div className="text-xs font-medium text-slate-500">Status</div>
                <div className="text-[#0f172a] capitalize">{event.status}</div>
              </div>
            )}
          </div>
        )}
        <DialogFooter className="flex-wrap gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-md border border-slate-200 text-sm">Close</button>
          {event?.source === "pipeline" && (
            <button
              onClick={() => { onClose(); navigate({ to: "/pipeline" }); }}
              className="px-3 py-2 rounded-md bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm"
            >Go to Pipeline</button>
          )}
          {event?.source === "lead" && (
            <button
              onClick={() => { onClose(); navigate({ to: "/leads" }); }}
              className="px-3 py-2 rounded-md bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm"
            >Go to Lead</button>
          )}
          {event?.source === "task" && event.status !== "completed" && event.status !== "done" && (
            <button
              onClick={completeTask}
              disabled={busy}
              className="px-3 py-2 rounded-md bg-[#10B981] hover:opacity-90 text-white text-sm disabled:opacity-50"
            >{busy ? "Saving…" : "Mark complete"}</button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

function AddEventDialog({ open, onClose, role, userId, members, onSaved }: {
  open: boolean; onClose: () => void; role: string | null; userId: string | null;
  members: { id: string; name: string }[]; onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [hour, setHour] = useState<number>(9);
  const [minute, setMinute] = useState<string>("00");
  const [type, setType] = useState<TaskType>("task");
  const [assigned, setAssigned] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(""); setDate(format(new Date(), "yyyy-MM-dd"));
      setHour(9); setMinute("00");
      setType("task"); setAssigned(""); setNotes("");
    }
  }, [open]);

  const save = async () => {
    if (!title.trim() || !date) { toast.error("Title and date are required."); return; }
    setSaving(true);
    const assigned_to = role === "owner"
      ? (assigned || null)
      : (userId ?? null);
    const hh = String(hour).padStart(2, "0");
    const timeStr = `${hh}:${minute}`;
    const description = `[time:${timeStr}] ${notes ?? ""}`.trim();
    const { error } = await supabase.from("tasks").insert({
      title: title.trim(),
      due_date: date,
      task_type: type,
      description,
      assigned_to,
      created_by: userId,
      priority: type,
      status: "pending",
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Event added.");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Event</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Title *">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
          </Field>
          <Field label="Date *">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hour">
              <select value={hour} onChange={(e) => setHour(parseInt(e.target.value, 10))} className="input">
                {HOUR_OPTIONS.map((h) => <option key={h} value={h}>{formatHour12(h)}</option>)}
              </select>
            </Field>
            <Field label="Minute">
              <select value={minute} onChange={(e) => setMinute(e.target.value)} className="input">
                {MINUTE_OPTIONS.map((m) => <option key={m} value={m}>:{m}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Type">
            <select value={type} onChange={(e) => setType(e.target.value as TaskType)} className="input">
              <option value="task">Task</option>
              <option value="follow_up">Follow-up</option>
              <option value="meeting">Meeting</option>
              <option value="billing">Billing</option>
              <option value="other">Other</option>
            </select>
          </Field>
          {role === "owner" && (
            <Field label="Assigned to">
              <select value={assigned} onChange={(e) => setAssigned(e.target.value)} className="input">
                <option value="">Unassigned</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input min-h-[80px]" />
          </Field>
        </div>
        <DialogFooter>
          <button onClick={onClose} className="px-3 py-2 rounded-md border border-slate-200 text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="px-3 py-2 rounded-md bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </DialogFooter>
        <style>{`.input { width:100%; border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px; font-size:14px; background:white; }`}</style>
      </DialogContent>
    </Dialog>
  );
}
