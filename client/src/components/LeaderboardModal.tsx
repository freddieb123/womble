import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Medal } from "lucide-react";

interface LeaderboardEntry {
  userName: string;
  score: number;
  isCurrentUser: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: LeaderboardEntry[];
  currentUserRank?: number;
  title: string;
  maxScore: number;
}

export default function LeaderboardModal({
  open,
  onOpenChange,
  entries,
  currentUserRank,
  title,
  maxScore,
}: Props) {
  // Get top 3 entries
  const topEntries = entries.slice(0, 3);

  // Get current user entry if not in top 3
  const currentUserEntry = currentUserRank && currentUserRank > 3
    ? entries.find(entry => entry.isCurrentUser)
    : null;

  const getMedalColor = (index: number) => {
    switch (index) {
      case 0:
        return "text-yellow-500";
      case 1:
        return "text-gray-400";
      case 2:
        return "text-amber-600";
      default:
        return "text-gray-400";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Top 3 Podium */}
          <div className="space-y-2">
            {topEntries.map((entry, index) => (
              <Card
                key={index}
                className={`p-4 ${
                  entry.isCurrentUser
                    ? "bg-blue-50 border-2 border-red-500"
                    : "bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Medal className={`h-5 w-5 ${getMedalColor(index)}`} />
                    <span className="font-medium">
                      {entry.userName || "Anonymous"}
                    </span>
                  </div>
                  <span className="font-bold">
                    {((entry.score / maxScore) * 100).toFixed(1)}%
                  </span>
                </div>
              </Card>
            ))}
          </div>

          {/* Current User (if not in top 3) */}
          {currentUserEntry && (
            <>
              <div className="text-center text-sm text-gray-500">• • •</div>
              <Card className="p-4 bg-blue-50 border-2 border-red-500">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-500">
                      #{currentUserRank}
                    </span>
                    <span className="font-medium">
                      {currentUserEntry.userName || "Anonymous"}
                    </span>
                  </div>
                  <span className="font-bold">
                    {((currentUserEntry.score / maxScore) * 100).toFixed(1)}%
                  </span>
                </div>
              </Card>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}