import { useEffect, useState, useCallback } from "react";
import { Users, Trophy, Medal, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface LiveStats {
  participantCount: number;
  leaderboard: string[];
  topN?: number;
}

const GRADE_INTERVAL_MS = 3 * 60 * 1000;

function useCountdown(targetMs: number | null): string {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    if (targetMs === null) return;
    const tick = () => {
      const diff = Math.max(0, targetMs - Date.now());
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${m}:${s.toString().padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetMs]);
  return remaining;
}

const MEDAL_COLORS = ["text-yellow-500", "text-gray-400", "text-amber-600"];

interface Props {
  configId: number;
}

export function ParticipantCount({ configId }: Props) {
  const [count, setCount] = useState<number | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/live-stats/${configId}`);
      if (res.ok) {
        const data: LiveStats = await res.json();
        setCount(data.participantCount);
      }
    } catch { /* silent */ }
  }, [configId]);

  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, 15_000);
    return () => clearInterval(id);
  }, [fetchStats]);

  return (
    <Card className="p-4 text-center">
      <Users className="h-6 w-6 text-blue-500 mx-auto mb-2" />
      <div className="text-3xl font-bold text-blue-900">
        {count === null ? "—" : count}
      </div>
      <div className="text-xs text-gray-500 mt-1 leading-snug">
        {count === 1 ? "person" : "people"}<br />in this activity
      </div>
    </Card>
  );
}

export function LiveLeaderboard({ configId }: Props) {
  const [leaderboard, setLeaderboard] = useState<string[]>([]);
  const [topN, setTopN] = useState(3);
  const [nextGradeAt, setNextGradeAt] = useState<number | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/live-stats/${configId}`);
      if (res.ok) {
        const data: LiveStats = await res.json();
        setLeaderboard(data.leaderboard);
        if (data.topN) setTopN(data.topN);
      }
    } catch { /* silent */ }
  }, [configId]);

  const autoGrade = useCallback(async () => {
    try {
      const res = await fetch(`/api/auto-grade/${configId}`, { method: "POST" });
      if (res.ok) {
        const data: LiveStats = await res.json();
        setLeaderboard(data.leaderboard);
        if (data.topN) setTopN(data.topN);
      }
    } catch { /* silent */ }
    setNextGradeAt(Date.now() + GRADE_INTERVAL_MS);
  }, [configId]);

  useEffect(() => {
    fetchStats();
    setNextGradeAt(Date.now() + GRADE_INTERVAL_MS);
    const id = setInterval(autoGrade, GRADE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchStats, autoGrade]);

  const countdown = useCountdown(nextGradeAt);

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="h-4 w-4 text-yellow-500 flex-shrink-0" />
        <span className="text-sm font-semibold text-gray-700">Top {topN}</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3 w-3 text-gray-400 cursor-default flex-shrink-0" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-[180px] text-xs">
              The top {topN} participants by score. Updated automatically every 3 minutes.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      {leaderboard.length === 0 ? (
        <p className="text-xs text-gray-400 leading-snug">
          Results appear here after the first grading cycle.
        </p>
      ) : (
        <div className="space-y-2">
          {leaderboard.map((name, i) => (
            <div key={i} className="flex items-center gap-2">
              <Medal className={`h-4 w-4 flex-shrink-0 ${MEDAL_COLORS[i]}`} />
              <span className="text-sm font-medium truncate">{name}</span>
            </div>
          ))}
        </div>
      )}
      {countdown && (
        <p className="text-xs text-gray-400 mt-3 text-center">
          Next update in {countdown}
        </p>
      )}
    </Card>
  );
}
