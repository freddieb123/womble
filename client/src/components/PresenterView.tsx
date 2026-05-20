import { useQuery, useMutation } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Play, Square, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PresentationFrame } from "@db/schema";

interface Stats {
  participantCount: number;
  submissionCount: number;
  phase: string;
  currentFrame: number;
}

interface Props {
  presentationId: number;
  frames: PresentationFrame[];
  open: boolean;
  onClose: () => void;
}

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  chat: "Chat",
  quiz: "Quiz",
  upload: "Document Review",
  "quick-fire-quiz": "Quick Fire Quiz",
  "teach-ai": "Teach AI",
  "thought-partner": "Thought Partner",
  "group-board": "Group Board",
};

function FramePreview({ frame, label }: { frame: PresentationFrame | undefined; label: string }) {
  if (!frame) return (
    <div className="flex items-center justify-center h-full bg-gray-100 rounded text-gray-400 text-sm">{label}</div>
  );
  if (frame.type === 'slide') {
    return <img src={frame.imageDataUrl} alt={label} className="w-full h-full object-contain rounded" />;
  }
  return (
    <div className="flex flex-col items-center justify-center h-full bg-blue-50 rounded text-center px-2">
      <span className="text-sm font-semibold text-blue-700">{ACTIVITY_TYPE_LABELS[frame.configType] ?? frame.configType}</span>
      <span className="text-xs text-blue-500 mt-1">{frame.configTitle}</span>
    </div>
  );
}

export default function PresenterView({ presentationId, frames, open, onClose }: Props) {
  const { data: stats, refetch: refetchStats } = useQuery<Stats>({
    queryKey: ["/api/presentations", presentationId, "stats"],
    queryFn: async () => {
      const res = await fetch(`/api/presentations/${presentationId}/stats`);
      return res.json();
    },
    refetchInterval: 2000,
    enabled: open,
  });

  const mutate = async (action: string, body?: object) => {
    await fetch(`/api/presentations/${presentationId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    refetchStats();
  };

  const phase = stats?.phase ?? "waiting";
  const currentFrame = stats?.currentFrame ?? 0;
  const current = frames[currentFrame];
  const next = frames[currentFrame + 1];
  const speakerNotes = current?.type === 'slide' ? current.speakerNotes : undefined;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Presenter View</DialogTitle>
        </DialogHeader>

        <div className="flex gap-4">
          {/* Current frame preview */}
          <div className="flex-1">
            <div className="text-xs text-gray-500 mb-1">Current ({currentFrame + 1} / {frames.length})</div>
            <div className="h-48 bg-gray-100 rounded overflow-hidden">
              <FramePreview frame={current} label="No frames" />
            </div>
          </div>
          {/* Next frame preview */}
          <div className="w-36">
            <div className="text-xs text-gray-500 mb-1">Next</div>
            <div className="h-48 bg-gray-100 rounded overflow-hidden">
              <FramePreview frame={next} label="End" />
            </div>
          </div>
        </div>

        {speakerNotes && (
          <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-gray-700">
            <div className="text-xs font-semibold text-yellow-700 mb-1">Speaker notes</div>
            {speakerNotes}
          </div>
        )}

        {/* Stats */}
        <div className="flex gap-4 text-sm">
          <div className="bg-gray-50 rounded px-3 py-2">
            <span className="text-gray-500">Participants: </span>
            <span className="font-semibold">{stats?.participantCount ?? 0}</span>
          </div>
          {current?.type === 'activity' && (
            <div className="bg-gray-50 rounded px-3 py-2">
              <span className="text-gray-500">Submissions: </span>
              <span className="font-semibold">{stats?.submissionCount ?? 0}</span>
            </div>
          )}
          <div className="bg-gray-50 rounded px-3 py-2 capitalize">
            <span className="text-gray-500">Phase: </span>
            <span className="font-semibold">{phase}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-2 mt-1">
          {phase === "waiting" && (
            <Button onClick={() => mutate("start")} className="bg-green-600 hover:bg-green-700">
              <Play className="h-4 w-4 mr-1" /> Start
            </Button>
          )}
          {phase === "live" && (
            <Button variant="destructive" onClick={() => mutate("end")}>
              <Square className="h-4 w-4 mr-1" /> End
            </Button>
          )}
          <Button variant="outline" disabled={currentFrame <= 0 || phase !== "live"} onClick={() => mutate("prev")}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Prev
          </Button>
          <Button variant="outline" disabled={currentFrame >= frames.length - 1 || phase !== "live"} onClick={() => mutate("next")}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
          <Button variant="outline" onClick={() => mutate("fullscreen")}>
            <Maximize2 className="h-4 w-4 mr-1" /> Request Fullscreen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
