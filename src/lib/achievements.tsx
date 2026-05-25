import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useSales } from "@/lib/salesStore";

export type AchievementMetric = "actions" | "follow" | "pipeline" | "xp" | "session";

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  threshold: number;
  metric: AchievementMetric;
  group: "Calling" | "Follow up" | "Pipeline" | "XP" | "Streak";
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // Calling
  { id: "first-blood", name: "First Blood", desc: "Make your first call (1 lead actioned)", threshold: 1, metric: "actions", group: "Calling" },
  { id: "dialler", name: "Dialler", desc: "Action 10 leads", threshold: 10, metric: "actions", group: "Calling" },
  { id: "on-the-phones", name: "On The Phones", desc: "Action 50 leads", threshold: 50, metric: "actions", group: "Calling" },
  { id: "century-club", name: "Century Club", desc: "Action 100 leads", threshold: 100, metric: "actions", group: "Calling" },
  { id: "five-hundred", name: "Five Hundred", desc: "Action 500 leads", threshold: 500, metric: "actions", group: "Calling" },
  { id: "the-grind", name: "The Grind", desc: "Action 1,000 leads", threshold: 1000, metric: "actions", group: "Calling" },
  // Follow up
  { id: "persistent", name: "Persistent", desc: "Schedule your first follow up", threshold: 1, metric: "follow", group: "Follow up" },
  { id: "chaser", name: "The Chaser", desc: "Schedule 10 follow ups", threshold: 10, metric: "follow", group: "Follow up" },
  { id: "follow-machine", name: "Follow Up Machine", desc: "Schedule 50 follow ups", threshold: 50, metric: "follow", group: "Follow up" },
  { id: "never-let-go", name: "Never Let Go", desc: "Schedule 100 follow ups", threshold: 100, metric: "follow", group: "Follow up" },
  // Pipeline
  { id: "pipeline-starter", name: "Pipeline Starter", desc: "Send your first lead to pipeline", threshold: 1, metric: "pipeline", group: "Pipeline" },
  { id: "deal-maker", name: "Deal Maker", desc: "Send 5 leads to pipeline", threshold: 5, metric: "pipeline", group: "Pipeline" },
  { id: "closer", name: "Closer", desc: "Send 10 leads to pipeline", threshold: 10, metric: "pipeline", group: "Pipeline" },
  { id: "revenue-driver", name: "Revenue Driver", desc: "Send 25 leads to pipeline", threshold: 25, metric: "pipeline", group: "Pipeline" },
  { id: "elite-closer", name: "Elite Closer", desc: "Send 50 leads to pipeline", threshold: 50, metric: "pipeline", group: "Pipeline" },
  // XP
  { id: "getting-started", name: "Getting Started", desc: "Earn 100 XP", threshold: 100, metric: "xp", group: "XP" },
  { id: "sales-hunter", name: "Sales Hunter", desc: "Earn 500 XP", threshold: 500, metric: "xp", group: "XP" },
  { id: "top-performer", name: "Top Performer", desc: "Earn 1,000 XP", threshold: 1000, metric: "xp", group: "XP" },
  { id: "legend", name: "Legend", desc: "Earn 5,000 XP", threshold: 5000, metric: "xp", group: "XP" },
  // Streak
  { id: "hot-streak", name: "Hot Streak", desc: "Action 10 leads in a single session", threshold: 10, metric: "session", group: "Streak" },
  { id: "on-fire", name: "On Fire", desc: "Action 25 leads in a single session", threshold: 25, metric: "session", group: "Streak" },
];

const STORAGE_KEY = "pillaros.achievements.v1";
const XP_BONUS = 25;

type UnlockMap = Record<string, string>; // id -> ISO date

function loadUnlocks(): UnlockMap {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}
function saveUnlocks(m: UnlockMap) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(m)); } catch {}
}

export interface AchievementState {
  def: AchievementDef;
  unlocked: boolean;
  date: string | null;
  value: number;
}

export function useAchievements(): AchievementState[] {
  const { xp, counters, actionsCount, sessionActions, addXp } = useSales();
  const unlocksRef = useRef<UnlockMap>(loadUnlocks());

  const metricValue = (m: AchievementMetric) => {
    switch (m) {
      case "actions": return actionsCount;
      case "follow": return counters.followUps;
      case "pipeline": return counters.sentToPipeline;
      case "xp": return xp;
      case "session": return sessionActions;
    }
  };

  // Detect new unlocks
  useEffect(() => {
    let changed = false;
    const now = new Date().toISOString();
    for (const a of ACHIEVEMENTS) {
      const v = metricValue(a.metric);
      if (v >= a.threshold && !unlocksRef.current[a.id]) {
        unlocksRef.current[a.id] = now;
        changed = true;
        toast.success(`${a.name} unlocked! +${XP_BONUS} XP`, {
          position: "bottom-right",
        });
        addXp(XP_BONUS);
      }
    }
    if (changed) saveUnlocks(unlocksRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xp, counters.followUps, counters.sentToPipeline, actionsCount, sessionActions]);

  return useMemo(() => {
    return ACHIEVEMENTS.map((def) => {
      const date = unlocksRef.current[def.id] || null;
      return {
        def,
        unlocked: !!date,
        date,
        value: metricValue(def.metric),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xp, counters.followUps, counters.sentToPipeline, actionsCount, sessionActions]);
}

export function formatEarned(iso: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch { return ""; }
}
