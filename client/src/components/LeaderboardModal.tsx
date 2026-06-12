
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Medal } from "lucide-react";

interface LeaderboardEntry {
  userName: string;
  score: number;
  rank?: number;
  isTied?: boolean;
  isCurrentUser: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: LeaderboardEntry[];
  currentUserRank?: number;
  currentUserEntry?: LeaderboardEntry | null;
  title: string;
  maxScore: number;
  topN?: number;
  onRefresh?: () => void;
}

export default function LeaderboardModal({
  open,
  onOpenChange,
  entries,
  currentUserRank,
  currentUserEntry,
  title,
  maxScore,
  onRefresh
}: Props) {
  const getMedalColor = (rank: number) => {
    switch (rank) {
      case 1: return "text-yellow-500";
      case 2: return "text-gray-400";
      case 3: return "text-amber-600";
      default: return "text-gray-400";
    }
  };

  const rankLabel = (entry: LeaderboardEntry, index: number) => {
    const r = entry.rank ?? (index + 1);
    return entry.isTied ? `${r}=` : `${r}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
            {entries.map((entry, index) => (
              <Card
                key={index}
                className={`p-4 ${entry.isCurrentUser ? "bg-blue-50 border-2 border-blue-400" : "bg-white"}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Medal className={`h-5 w-5 flex-shrink-0 ${getMedalColor(entry.rank ?? index + 1)}`} />
                    <span className="text-xs text-gray-500 w-6 text-right">{rankLabel(entry, index)}</span>
                    <span className="font-medium">{entry.userName || "Anonymous"}</span>
                  </div>
                  <span className="font-bold">{entry.score}/{maxScore}</span>
                </div>
              </Card>
            ))}
          </div>

          {/* Current user if outside top 3 */}
          {currentUserEntry && (
            <>
              <div className="text-center text-sm text-gray-400">• • •</div>
              <Card className="p-4 bg-blue-50 border-2 border-blue-400">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-500">#{currentUserRank}</span>
                    <span className="font-medium">{currentUserEntry.userName || "Anonymous"}</span>
                  </div>
                  <span className="font-bold">{currentUserEntry.score}/{maxScore}</span>
                </div>
              </Card>
            </>
          )}

          {onRefresh && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={onRefresh} className="w-full">
                <RefreshCw className="h-4 w-4 mr-2" />
                Update
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
