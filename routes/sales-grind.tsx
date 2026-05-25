import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  Phone, Star, Trophy, X as XIcon, CalendarIcon, ArrowLeft, ChevronDown, ChevronUp,
  RotateCcw, ExternalLink, Lock, CheckCircle2, Search, Plus,
} from "lucide-react";
import { AddLeadDialog } from "@/components/AddLeadDialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useSales, getLevel, rowToLead, type WebScore, type Lead, type LeadStatus } from "@/lib/salesStore";
import { useAchievements, formatEarned } from "@/lib/achievements";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";


export const Route = createFileRoute("/sales-grind")({ component: GrindPage });

const PAGE_SIZE = 25;

const SCORE_STYLES: Record<WebScore, string> = {
  Good: "bg-blue-50 text-[#2563eb] border-[#2563eb]/30",
  Poor: "bg-amber-50 text-amber-700 border-amber-300",
  None: "bg-slate-100 text-slate-500 border-slate-300",
};

// Sales Grind is intentionally locked to status='new'


const LEADERBOARD = [
  { name: "Jordan M.", xp: 3120 },
  { name: "Priya S.", xp: 2480 },
  { name: "Marcus L.", xp: 1860 },
  { name: "Chen W.", xp: 1310 },
  { name: "Sarah T.", xp: 980 },
];

interface Facets {
  statusCounts: Record<string, number>;
  industryCounts: Record<string, number>;
  newTotal: number;
}

function useDebounced<T>(v: T, ms: number) {
  const [s, setS] = useState(v);
  useEffect(() => { const t = setTimeout(() => setS(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return s;
}

function GrindPage() {
  const { role, email } = useAuth();
  if (!role) return <Navigate to="/login" />;

  const { newLeadsCount, xp, version, archiveLead, setFollowUp, markContacted, skipNoAnswer } = useSales();
  const navigate = useNavigate();

  const [tab, setTab] = useState<"leads" | "leaderboard">("leads");
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 250);
  const [statusFilter] = useState<"All" | LeadStatus>("new");
  const [industryFilters, setIndustryFilters] = useState<Set<string>>(new Set());

  const [leads, setLeads] = useState<Lead[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [facets, setFacets] = useState<Facets>({ statusCounts: {}, industryCounts: {}, newTotal: 0 });

  const [expanded, setExpanded] = useState<Record<string, { why?: boolean; opener?: boolean; pitch?: boolean }>>({});
  const [followFor, setFollowFor] = useState<string | null>(null);
  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState<string>("09:00");
  const [notes, setNotes] = useState("");
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const [fading, setFading] = useState<Set<string>>(new Set());

  const industryArray = useMemo(() => Array.from(industryFilters), [industryFilters]);

  // Build a base query with current filters applied.
  const applyFilters = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (q: any) => {
      if (statusFilter !== "All") q = q.eq("status", statusFilter);
      if (industryArray.length > 0) q = q.in("industry", industryArray);
      if (debouncedSearch.trim()) {
        const s = debouncedSearch.trim().replace(/[%,]/g, "");
        q = q.or(`business_name.ilike.%${s}%,suburb.ilike.%${s}%,industry.ilike.%${s}%`);
      }
      return q;
    },
    [statusFilter, industryArray, debouncedSearch],
  );

  const MEMORY_CAP = 100;

  const fetchPage = useCallback(async (from: number, replace: boolean) => {
    setLoading(true);
    const q = applyFilters(
      supabase.from("leads").select("*").order("created_at", { ascending: true }),
    ).range(from, from + PAGE_SIZE - 1);
    const { data, error } = await q;
    if (error) { setLoading(false); setInitialLoading(false); return; }
    const batch = (data ?? []).map(rowToLead);
    setLeads((prev) => {
      const next = replace ? batch : [...prev, ...batch];
      // Cap memory: keep only the last MEMORY_CAP leads
      return next.length > MEMORY_CAP ? next.slice(next.length - MEMORY_CAP) : next;
    });
    setOffset(from + batch.length);
    setHasMore(batch.length === PAGE_SIZE);
    setLoading(false);
    setInitialLoading(false);
  }, [applyFilters]);

  // Reload page 0 when filters or external version change.
  useEffect(() => { setInitialLoading(true); fetchPage(0, true); }, [fetchPage, version]);

  // Fetch facets (status + industry counts) once and on version bump.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("lead_facets");
      if (cancelled || error || !data) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = data as any;
      setFacets({
        statusCounts: d.status_counts ?? {},
        industryCounts: d.industry_counts ?? {},
        newTotal: d.new_total ?? 0,
      });
    })();
    return () => { cancelled = true; };
  }, [version]);

  // Infinite scroll sentinel.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loading && hasMore) {
        fetchPage(offset, false);
      }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [offset, loading, hasMore, fetchPage]);

  const industries = useMemo(
    () => Object.entries(facets.industryCounts).sort((a, b) => b[1] - a[1]),
    [facets.industryCounts],
  );

  // status counts no longer rendered in Sales Grind (locked to 'new'); facets kept for industry counts


  const toggle = (id: string, k: "why" | "opener" | "pitch") =>
    setExpanded((e) => ({ ...e, [id]: { ...e[id], [k]: !e[id]?.[k] } }));

  const handleNoAnswer = (l: Lead) => { skipNoAnswer(l.id); };
  const handleArchive = (l: Lead) => {
    setFading((s) => new Set(s).add(l.id));
    setTimeout(() => {
      archiveLead(l.id);
      setFading((s) => { const n = new Set(s); n.delete(l.id); return n; });
    }, 250);
  };
  const handlePipeline = (l: Lead) => { markContacted(l.id); setConfirmFor(null); };
  const openFollow = (id: string) => { setFollowFor(id); setDate(undefined); setTime("09:00"); setNotes(""); };
  const saveFollow = (l: Lead) => {
    if (!date) return;
    const [hh, mm] = time.split(":").map(Number);
    const dt = new Date(date); dt.setHours(hh || 0, mm || 0, 0, 0);
    setFollowUp(l.id, dt.toISOString(), notes);
    setFollowFor(null);
  };

  const resetProgress = () => {
    if (window.confirm("Reset your Sales Grind progress? This clears local action state on this device.")) {
      try { localStorage.removeItem("pillaros.grind.actions.v2"); } catch { /* ignore */ }
    }
  };

  const level = getLevel(xp);
  const meName = email?.split("@")[0] || "You";
  const board = [...LEADERBOARD, { name: `${meName} (you)`, xp }].sort((a, b) => b.xp - a.xp);
  const maxXp = Math.max(...board.map((b) => b.xp), 1);

  const achievements = useAchievements();

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar />
      <main className="flex-1 min-w-0 pt-14 lg:pt-0 flex flex-col">
        {/* Top bar */}
        <div className="sticky top-0 z-30 bg-[#0f172a] text-white px-4 lg:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-semibold tracking-tight">
              Pillar<span className="text-[#2563eb]">OS</span>
            </span>
            <span className="text-white/40 text-sm hidden sm:inline">Sales Grind</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Trophy className="h-4 w-4 text-[#2563eb]" />
            <span className="font-semibold tabular-nums">{xp.toLocaleString()} XP</span>
            <span className="text-white/50 hidden sm:inline">— Level {level.current.level} {level.current.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-[#2563eb] text-white hover:bg-[#1d4ed8] font-medium"
            >
              <Plus className="h-3.5 w-3.5" /> Add Lead Manually
            </button>
            <button
              onClick={() => navigate({ to: "/leads" })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-white/10 hover:bg-white/20"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Exit grind
            </button>
          </div>
        </div>
        <AddLeadDialog open={addOpen} onClose={() => setAddOpen(false)} />

        {/* Tabs */}
        <div className="bg-white border-b border-slate-200 px-4 lg:px-6">
          <div className="flex gap-1">
            {(["leads", "leaderboard"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px",
                  tab === t ? "border-[#2563eb] text-[#2563eb]" : "border-transparent text-slate-500 hover:text-[#0f172a]"
                )}
              >
                {t === "leads" ? "Leads Dashboard" : "Leaderboard"}
              </button>
            ))}
          </div>
        </div>

        {tab === "leads" ? (
          <div className="flex-1 p-4 lg:p-6 space-y-4">
            {/* Search + filters */}
            <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-3">
              <div className="flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search business, suburb, industry…"
                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
                  />
                </div>
                <div className="text-sm text-slate-600">
                  <span className="font-semibold text-[#0f172a]">{newLeadsCount.toLocaleString()}</span> new leads remaining
                </div>
              </div>

              {/* Sales Grind is locked to status='new' (raw scanner data) */}

              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setIndustryFilters(new Set())}
                  className={cn(
                    "px-3 py-1 text-xs rounded-md border",
                    industryFilters.size === 0
                      ? "bg-[#0f172a] text-white border-[#0f172a]"
                      : "bg-white text-slate-600 border-slate-200 hover:border-[#0f172a]/40"
                  )}
                >
                  All industries ({facets.newTotal.toLocaleString()})
                </button>
                {industries.map(([ind, count]) => {
                  const selected = industryFilters.has(ind);
                  return (
                    <button
                      key={ind}
                      onClick={() =>
                        setIndustryFilters((prev) => {
                          const next = new Set(prev);
                          if (next.has(ind)) next.delete(ind);
                          else next.add(ind);
                          return next;
                        })
                      }
                      className={cn(
                        "px-3 py-1 text-xs rounded-md border",
                        selected
                          ? "bg-[#0f172a] text-white border-[#0f172a]"
                          : "bg-white text-slate-600 border-slate-200 hover:border-[#0f172a]/40"
                      )}
                    >
                      {ind} ({count})
                    </button>
                  );
                })}
              </div>
            </div>


            {/* Cards grid */}
            {initialLoading ? (
              <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-white border border-slate-200 rounded-lg p-4 animate-pulse">
                    <div className="h-4 w-2/3 bg-slate-200 rounded mb-2" />
                    <div className="h-3 w-1/3 bg-slate-100 rounded mb-4" />
                    <div className="h-5 w-1/2 bg-slate-200 rounded mb-3" />
                    <div className="h-3 w-1/4 bg-slate-100 rounded mb-4" />
                    <div className="flex gap-1.5 mb-4">
                      <div className="h-5 w-20 bg-slate-100 rounded" />
                      <div className="h-5 w-24 bg-slate-100 rounded" />
                      <div className="h-5 w-20 bg-slate-100 rounded" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="h-8 bg-slate-100 rounded" />
                      <div className="h-8 bg-slate-100 rounded" />
                      <div className="h-8 bg-slate-100 rounded" />
                      <div className="h-8 bg-slate-100 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : leads.length === 0 && !loading ? (
              <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
                <h2 className="text-lg font-semibold text-[#0f172a]">No leads match these filters</h2>
                <p className="mt-1 text-sm text-slate-500">Adjust filters or import more leads from the Leads screen.</p>
              </div>
            ) : (
              <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                {leads.map((l) => {
                  const ex = expanded[l.id] || {};
                  const isFollow = followFor === l.id;
                  const isConfirm = confirmFor === l.id;
                  const isFading = fading.has(l.id);
                  const muted = l.status === "archived" || l.status === "pipeline";
                  const hasUrl = !!l.website && /^https?:\/\//i.test(l.website);
                  const rawScore = (l.webScore as string || "").toUpperCase();
                  let webLabel = "No Website";
                  let webStyle = SCORE_STYLES.None;
                  if (rawScore.includes("POOR")) { webLabel = "Poor Website"; webStyle = SCORE_STYLES.Poor; }
                  else if (rawScore.includes("NO WEBSITE")) { webLabel = "No Website"; webStyle = SCORE_STYLES.None; }
                  else if (hasUrl) { webLabel = "Has Website"; webStyle = SCORE_STYLES.Good; }
                  const openGoogle = () => window.open(
                    `https://www.google.com/search?q=${encodeURIComponent(`${l.business} ${l.suburb}`)}`,
                    "_blank",
                    "noopener,noreferrer",
                  );
                  return (
                    <div
                      key={l.id}
                      className={cn(
                        "bg-white border border-slate-200 rounded-lg shadow-sm p-4 flex flex-col transition-all duration-200",
                        isFading && "opacity-0 scale-95",
                        muted && "opacity-70"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-[#0f172a] text-base leading-tight truncate">{l.business}</div>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className="inline-flex items-center px-2 py-0.5 text-[10px] rounded-md bg-[#0f172a] text-white font-medium">{l.industry}</span>
                            <span className="text-xs text-slate-500">{l.suburb}</span>
                          </div>
                        </div>
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border whitespace-nowrap", webStyle)}>
                          {webLabel}
                        </span>
                      </div>

                      <a
                        href={`tel:${l.phone.replace(/\s/g, "")}`}
                        className="mt-3 inline-flex items-center gap-2 text-[#2563eb] font-semibold text-lg hover:underline"
                      >
                        <Phone className="h-4 w-4" /> {l.phone}
                      </a>

                      {hasUrl && (
                        <a
                          href={l.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-xs text-[#2563eb] hover:underline min-w-0"
                        >
                          <ExternalLink className="h-3 w-3 shrink-0" />
                          <span className="truncate">{l.website.replace(/^https?:\/\//i, "").replace(/\/$/, "")}</span>
                        </a>
                      )}

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-0.5">
                          {[1,2,3,4,5].map((i) => (
                            <Star key={i} className={cn("h-3.5 w-3.5", i <= Math.round(l.rating) ? "fill-[#2563eb] text-[#2563eb]" : "text-slate-300")} />
                          ))}
                          <span className="ml-1 text-xs text-slate-600">{l.rating.toFixed(1)} ({l.reviewCount})</span>
                        </div>
                        <button
                          type="button"
                          onClick={openGoogle}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:border-[#2563eb] hover:text-[#2563eb]"
                        >
                          <ExternalLink className="h-3 w-3" /> View on Google
                        </button>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {([
                          ["why", "Why they need us"],
                          ["opener", "Cold call opener"],
                          ["pitch", "PillarOS pitch"],
                        ] as const).map(([k, label]) => (
                          <button
                            key={k}
                            onClick={() => toggle(l.id, k)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
                          >
                            {ex[k] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            {label}
                          </button>
                        ))}
                      </div>

                      {ex.why && (
                        <div className="mt-2 rounded-md bg-slate-50 border border-slate-200 p-2.5 text-sm text-[#0f172a]">
                          {l.whyNeedUs}
                        </div>
                      )}
                      {ex.opener && (
                        <div className="mt-2 rounded-md bg-[#2563eb]/5 border border-[#2563eb]/20 p-2.5">
                          <div className="text-[10px] uppercase tracking-wider text-[#2563eb] font-semibold mb-1">Cold call opener</div>
                          <p className="text-sm text-[#0f172a] leading-relaxed">"{l.coldCallOpener}"</p>
                        </div>
                      )}
                      {ex.pitch && (
                        <div className="mt-2 rounded-md bg-slate-50 border border-slate-200 p-2.5">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">PillarOS pitch</div>
                          <p className="text-sm text-[#0f172a] leading-relaxed">{l.pillarOSPitch}</p>
                        </div>
                      )}

                      {isFollow && (
                        <div className="mt-3 rounded-md border border-[#2563eb]/30 p-3 bg-white">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-semibold text-[#0f172a]">Schedule follow-up</div>
                            <button onClick={() => setFollowFor(null)} className="text-slate-400 hover:text-slate-600">
                              <XIcon className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <Popover>
                            <PopoverTrigger asChild>
                              <button className="w-full inline-flex items-center justify-between gap-2 px-3 py-2 bg-white border border-slate-200 rounded-md text-sm">
                                {date ? format(date, "d MMM yyyy") : "Pick a date"}
                                <CalendarIcon className="h-4 w-4 text-slate-400" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={date}
                                onSelect={setDate}
                                disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))}
                                initialFocus
                                className={cn("p-3 pointer-events-auto")}
                              />
                            </PopoverContent>
                          </Popover>
                          <input
                            type="time"
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                            className="mt-2 w-full px-3 py-2 bg-white border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
                          />
                          <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="What was discussed / reason for follow up"
                            rows={2}
                            className="mt-2 w-full px-3 py-2 bg-white border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
                          />
                          <div className="mt-2 flex justify-end">
                            <button
                              onClick={() => saveFollow(l)}
                              disabled={!date}
                              className="px-3 py-1.5 text-xs rounded-md bg-[#2563eb] text-white hover:bg-[#1d4ed8] disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              Save follow-up
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="mt-auto pt-3 grid grid-cols-2 gap-2">
                        <button onClick={() => handleNoAnswer(l)} className="py-2 text-xs rounded-md bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300 transition">
                          No answer <span className="font-normal text-slate-500">+2</span>
                        </button>
                        <button onClick={() => handleArchive(l)} className="py-2 text-xs rounded-md border border-red-300 text-red-600 font-semibold hover:bg-red-50 transition">
                          Not interested <span className="font-normal text-red-400">+5</span>
                        </button>
                        <button onClick={() => openFollow(l.id)} className="py-2 text-xs rounded-md border border-[#2563eb] text-[#2563eb] font-semibold hover:bg-[#2563eb]/5 transition">
                          Follow up <span className="font-normal text-[#2563eb]/70">+10</span>
                        </button>
                        <div className="relative">
                          <button
                            onClick={() => setConfirmFor(isConfirm ? null : l.id)}
                            className="w-full py-2 text-xs rounded-md bg-[#2563eb] text-white font-semibold hover:bg-[#1d4ed8] transition"
                          >
                            Service delivery <span className="font-normal text-white/80">+50</span>
                          </button>
                          {isConfirm && (
                            <div className="absolute right-0 bottom-full mb-2 z-20 w-52 bg-[#0f172a] text-white rounded-md shadow-lg p-2 text-xs">
                              <div className="mb-2 font-medium">Move to Leads Dashboard?</div>
                              <div className="flex gap-1.5">
                                <button onClick={() => handlePipeline(l)} className="flex-1 py-1 rounded bg-[#2563eb] hover:bg-[#1d4ed8]">Yes</button>
                                <button onClick={() => setConfirmFor(null)} className="flex-1 py-1 rounded bg-white/10 hover:bg-white/20">No</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Infinite scroll sentinel + loading */}
            <div ref={sentinelRef} className="h-10 flex items-center justify-center text-xs text-slate-400">
              {loading ? "Loading more…" : hasMore ? "Scroll to load more" : leads.length > 0 ? "End of list" : ""}
            </div>
          </div>
        ) : (
          <div className="flex-1 p-4 lg:p-6 space-y-6 max-w-4xl">
            {/* Leaderboard */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-[#0f172a]">Sales leaderboard</h2>
                <button
                  onClick={resetProgress}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reset my progress
                </button>
              </div>
              <div className="space-y-2">
                {board.map((p, i) => {
                  const isMe = p.name.includes("(you)");
                  const lv = getLevel(p.xp).current;
                  return (
                    <div
                      key={p.name}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border",
                        isMe ? "bg-[#2563eb]/5 border-[#2563eb]/30" : "bg-white border-slate-200"
                      )}
                    >
                      <div className="w-6 text-sm font-bold text-slate-400">#{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className={cn("text-sm font-semibold truncate", isMe ? "text-[#2563eb]" : "text-[#0f172a]")}>{p.name}</div>
                        <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-[#2563eb]" style={{ width: `${(p.xp / maxXp) * 100}%` }} />
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-[#0f172a] tabular-nums">{p.xp.toLocaleString()} XP</div>
                        <div className="text-[10px] text-slate-500">Lv {lv.level} · {lv.name}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Achievements */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-[#0f172a]">Achievements</h2>
                <span className="text-xs text-slate-500">
                  {achievements.filter((a) => a.unlocked).length} / {achievements.length} unlocked
                </span>
              </div>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {achievements.map(({ def, unlocked, date, value }) => {
                  const pct = Math.min(100, Math.round((value / def.threshold) * 100));
                  return (
                    <div
                      key={def.id}
                      className={cn(
                        "p-4 rounded-lg border flex flex-col transition-opacity",
                        unlocked ? "bg-[#2563eb]/5 border-[#2563eb]/30" : "bg-slate-50 border-slate-200 opacity-60"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className={cn("h-8 w-8 rounded-full flex items-center justify-center", unlocked ? "bg-[#2563eb] text-white" : "bg-slate-200 text-slate-500")}>
                          {unlocked ? <CheckCircle2 className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                        </div>
                        <span className={cn("text-[10px] uppercase tracking-wider font-semibold", unlocked ? "text-[#2563eb]" : "text-slate-400")}>
                          {def.group}
                        </span>
                      </div>
                      <div className={cn("mt-2 font-semibold text-sm", unlocked ? "text-[#0f172a]" : "text-slate-500")}>{def.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{def.desc}</div>
                      <div className="mt-3 h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#2563eb]" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500 tabular-nums">
                        <span>{Math.min(value, def.threshold).toLocaleString()} / {def.threshold.toLocaleString()}</span>
                        {unlocked && <span className="text-[#2563eb] font-medium">Earned {formatEarned(date)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}
      </main>
    </div>
  );
}
