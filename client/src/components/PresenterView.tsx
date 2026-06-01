import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Play, Square, Maximize2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PresentationFrame } from "@db/schema";

interface Stats {
  participantCount: number;
  submissionCount: number;
  phase: string;
  currentFrame: number;
  lastAction: string | null;
  actionId: string | null;
}

interface Props {
  presentationId: number;
  shareToken: string;
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

export default function PresenterView({ presentationId, shareToken, frames, open, onClose }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

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

  const fireSlideAction = async (action: "next" | "prev") => {
    iframeRef.current?.contentWindow?.postMessage(
      { __womble: true, action, actionId: crypto.randomUUID() },
      "*"
    );
    await mutate(`slide-${action}`);
  };

  const fireFrameAction = async (action: "next" | "prev") => {
    await mutate(action);
    // Refresh stats immediately so iframe reflects new frame
    refetchStats();
  };

  const phase = stats?.phase ?? "waiting";
  const currentFrame = stats?.currentFrame ?? 0;
  const current = frames[currentFrame];
  const next = frames[currentFrame + 1];
  const isDeck = current?.type === "html-deck" || current?.type === "html-slide";

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Presenter View</DialogTitle>
        </DialogHeader>

        <div className="flex gap-4">
          {/* Current frame — iframe for html-deck, card for activity */}
          <div className="flex-1">
            <div className="text-xs text-gray-500 mb-1">
              Current ({currentFrame + 1} / {frames.length || "—"})
            </div>
            <div className="h-56 bg-gray-900 rounded overflow-hidden">
              {isDeck && shareToken ? (
                <iframe
                  ref={iframeRef}
                  src={`/api/presentations/join/${shareToken}/deck`}
                  sandbox="allow-scripts allow-same-origin allow-presentation"
                  className="w-full h-full border-none"
                  title="Deck preview"
                />
              ) : current?.type === "activity" ? (
                <div className="flex flex-col items-center justify-center h-full bg-blue-50 rounded text-center px-4">
                  <span className="text-sm font-semibold text-blue-700">{ACTIVITY_TYPE_LABELS[current.configType] ?? current.configType}</span>
                  <span className="text-xs text-blue-500 mt-1">{current.configTitle}</span>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">No content</div>
              )}
            </div>
          </div>

          {/* Next frame */}
          <div className="w-36">
            <div className="text-xs text-gray-500 mb-1">Next</div>
            <div className="h-56 bg-gray-100 rounded overflow-hidden">
              {!next ? (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">End</div>
              ) : (next.type === "html-deck" || next.type === "html-slide") ? (
                <div className="flex items-center justify-center h-full bg-gray-800 text-gray-300 text-xs text-center px-2">
                  {next.type === "html-slide" ? `Slide ${(next as any).slideIndex + 1}` : "HTML Deck"}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full bg-blue-50 rounded text-center px-2">
                  <span className="text-xs font-semibold text-blue-700">{ACTIVITY_TYPE_LABELS[next.configType] ?? next.configType}</span>
                  <span className="text-xs text-blue-500 mt-1 truncate w-full text-center">{next.configTitle}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-3 text-sm flex-wrap">
          <div className="bg-gray-50 rounded px-3 py-2">
            <span className="text-gray-500">Participants: </span>
            <span className="font-semibold">{stats?.participantCount ?? 0}</span>
          </div>
          {current?.type === "activity" && (
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
        <div className="flex flex-wrap gap-2">
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

          {/* Within-deck slide controls — only when current frame is html-deck */}
          {isDeck && phase === "live" && (
            <>
              <Button variant="outline" onClick={() => fireSlideAction("prev")}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Prev Slide
              </Button>
              <Button variant="outline" onClick={() => fireSlideAction("next")}>
                Next Slide <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          )}

          {/* Frame-level navigation */}
          <Button variant="secondary" disabled={currentFrame <= 0 || phase !== "live"} onClick={() => fireFrameAction("prev")}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Prev
          </Button>
          <Button variant="secondary" disabled={currentFrame >= frames.length - 1 || phase !== "live"} onClick={() => fireFrameAction("next")}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>

          <Button variant="outline" onClick={() => mutate("fullscreen")}>
            <Maximize2 className="h-4 w-4 mr-1" /> Request Fullscreen
          </Button>
          {shareToken && (
            <Button variant="outline" onClick={() => window.open(`/api/presentations/join/${shareToken}/deck`, "_blank")}>
              <ExternalLink className="h-4 w-4 mr-1" /> Preview Deck
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
