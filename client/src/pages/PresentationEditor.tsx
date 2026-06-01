import { useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, Upload, Share2, MonitorPlay, Loader2, FileCode2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import PresentationFrameStrip from "@/components/PresentationFrameStrip";
import PresentationActivityLibrary from "@/components/PresentationActivityLibrary";
import PresenterView from "@/components/PresenterView";
import type { PresentationFrame, SelectPresentation } from "@db/schema";
import WombleHeader from "@/components/WombleHeader";

type Presentation = SelectPresentation & {
  state?: { phase: string; currentFrame: number; fullscreenMode: boolean } | null;
  sessionId?: number | null;
};

export default function PresentationEditor() {
  const { id } = useParams<{ id: string }>();
  const presId = parseInt(id ?? "0");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFrame, setSelectedFrame] = useState(0);
  const [presenterOpen, setPresenterOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeDragData, setActiveDragData] = useState<any>(null);
  const [isDraggingFromLibrary, setIsDraggingFromLibrary] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const { data: pres, isLoading } = useQuery<Presentation>({
    queryKey: ["/api/presentations", presId],
    queryFn: async () => {
      const res = await fetch(`/api/presentations/${presId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { title?: string; frames?: PresentationFrame[] }) => {
      const res = await fetch(`/api/presentations/${presId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/presentations", presId] }),
  });

  const handleFramesChange = (frames: PresentationFrame[]) => {
    updateMutation.mutate({ frames });
    setSelectedFrame(i => Math.min(i, frames.length - 1));
  };

  const handleAddActivity = (frame: PresentationFrame) => {
    const current = pres?.frames ?? [];
    const insertAt = selectedFrame + 1;
    const updated = [...current.slice(0, insertAt), frame, ...current.slice(insertAt)];
    updateMutation.mutate({ frames: updated });
    setSelectedFrame(insertAt);
  };

  const handleAddActivityAt = (frame: PresentationFrame, insertAt: number) => {
    const current = pres?.frames ?? [];
    const clamped = Math.max(0, Math.min(insertAt, current.length));
    const updated = [...current.slice(0, clamped), frame, ...current.slice(clamped)];
    updateMutation.mutate({ frames: updated });
    setSelectedFrame(clamped);
  };

  const handleRemoveFrame = (i: number) => {
    const current = pres?.frames ?? [];
    const updated = current.filter((_, idx) => idx !== i);
    updateMutation.mutate({ frames: updated });
    setSelectedFrame(j => Math.max(0, j >= i ? j - 1 : j));
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/presentations/${presId}/upload-deck`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      await qc.invalidateQueries({ queryKey: ["/api/presentations", presId] });
      const msg = data.slideCount > 0
        ? `Detected ${data.slideCount} slides. Drag activities into the timeline.`
        : "Deck uploaded. Format not auto-detected — use the Set Slides button to configure.";
      toast({ title: "Deck uploaded", description: msg });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleShare = () => {
    if (!pres) return;
    const url = `${window.location.origin}/present?token=${pres.shareToken}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied", description: url });
  };

  // DnD handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    setActiveDragData(event.active.data.current);
    setIsDraggingFromLibrary(event.active.data.current?.source === 'library');
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveDragData(null);
    setIsDraggingFromLibrary(false);
    if (!over) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    const frames = pres?.frames ?? [];

    if (activeIdStr.startsWith('library:')) {
      // Drop from activity library onto a frame or drop zone
      const config = active.data.current?.config;
      if (!config) return;
      const newFrame: PresentationFrame = {
        id: crypto.randomUUID(),
        type: 'activity',
        configId: config.id,
        configTitle: config.title,
        configType: config.type,
      };

      // Determine insert position from over.id
      let insertAt = frames.length; // default: end
      if (overIdStr.startsWith('drop-before-')) {
        insertAt = 0;
      } else if (overIdStr.startsWith('drop-after-')) {
        insertAt = parseInt(overIdStr.replace('drop-after-', '')) + 1;
      } else {
        // Dropped on a frame — insert after it
        const idx = frames.findIndex(f => f.id === overIdStr);
        if (idx !== -1) insertAt = idx + 1;
      }
      handleAddActivityAt(newFrame, insertAt);
    } else {
      // Reorder existing frames
      if (activeIdStr === overIdStr) return;
      const oldIndex = frames.findIndex(f => f.id === activeIdStr);
      const newIndex = frames.findIndex(f => f.id === overIdStr);
      if (oldIndex !== -1 && newIndex !== -1) {
        handleFramesChange(arrayMove(frames, oldIndex, newIndex));
      }
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!pres) {
    return <div className="p-8 text-center text-gray-500">Presentation not found</div>;
  }

  const selectedFrameData = pres.frames[selectedFrame];

  // Active drag overlay content
  const DragOverlayContent = activeDragData?.source === 'library' ? (
    <div className="bg-white border-2 border-blue-400 rounded px-3 py-2 shadow-lg text-xs text-blue-700 font-medium">
      {activeDragData.config?.title}
    </div>
  ) : null;

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <WombleHeader />

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Dashboard
        </Button>
        <Input
          className="max-w-xs text-sm font-medium"
          value={pres.title}
          onChange={e => updateMutation.mutate({ title: e.target.value })}
        />
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={handleShare}>
            <Share2 className="h-4 w-4 mr-1" /> Share
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
            Upload HTML
          </Button>
          <input ref={fileInputRef} type="file" accept=".html" className="hidden" onChange={handleUpload} />
          <Button size="sm" onClick={() => setPresenterOpen(true)}>
            <MonitorPlay className="h-4 w-4 mr-1" /> Present
          </Button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <DragOverlay>{DragOverlayContent}</DragOverlay>

        {/* Main area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Activity library sidebar */}
          <div className="w-48 border-r border-gray-200 bg-white p-3 overflow-y-auto flex-shrink-0">
            <PresentationActivityLibrary presentationId={presId} />
          </div>

          {/* Editor center */}
          <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
            {/* Preview of selected frame */}
            <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden flex items-center justify-center min-h-0">
              {!selectedFrameData ? (
                <div className="text-gray-400 text-sm text-center p-8">
                  <p>No frames yet.</p>
                  <p className="mt-1">Upload an HTML deck, then set the slide count. Drag activities from the sidebar into the timeline.</p>
                </div>
              ) : selectedFrameData.type === 'html-slide' ? (
                <div className="flex flex-col items-center justify-center gap-3 text-center p-6">
                  <FileCode2 className="h-10 w-10 text-gray-400" />
                  <div className="text-lg font-semibold text-gray-700">Slide {selectedFrameData.slideIndex + 1}</div>
                  {pres.originalFilename && <div className="text-sm text-gray-400">{pres.originalFilename}</div>}
                  <a
                    href={`/api/presentations/join/${pres.shareToken}/deck`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Preview deck in new tab →
                  </a>
                </div>
              ) : selectedFrameData.type === 'html-deck' ? (
                <div className="flex flex-col items-center justify-center gap-3 text-center p-6">
                  <div className="text-4xl">🎞️</div>
                  <div className="text-lg font-semibold text-gray-700">HTML Deck</div>
                  {pres.originalFilename && <div className="text-sm text-gray-500">{pres.originalFilename}</div>}
                  <a
                    href={`/api/presentations/join/${pres.shareToken}/deck`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Preview in new tab →
                  </a>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 text-center p-6">
                  <div className="text-2xl font-bold text-blue-700">{selectedFrameData.configType}</div>
                  <div className="text-gray-600">{selectedFrameData.configTitle}</div>
                  <div className="text-sm text-gray-400">Activity — participants interact with this when you navigate here</div>
                </div>
              )}
            </div>

            {/* Frame strip timeline */}
            <div className="bg-white rounded-xl border border-gray-200 p-3 flex-shrink-0">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Timeline</div>
              <PresentationFrameStrip
                frames={pres.frames}
                selectedIndex={selectedFrame}
                onSelect={setSelectedFrame}
                onReorder={frames => handleFramesChange(frames)}
                onRemove={handleRemoveFrame}
                isDraggingFromLibrary={isDraggingFromLibrary}
              />
            </div>
          </div>

          {/* Frame info sidebar */}
          <div className="w-44 border-l border-gray-200 bg-white p-3 flex flex-col gap-3 flex-shrink-0">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Frame Info</div>
            {!selectedFrameData ? (
              <p className="text-xs text-gray-400">No frame selected.</p>
            ) : selectedFrameData.type === 'html-slide' ? (
              <div className="text-xs text-gray-600 space-y-1">
                <div className="font-medium">Slide {selectedFrameData.slideIndex + 1}</div>
                {pres.originalFilename && <div className="text-gray-400 break-all">{pres.originalFilename}</div>}
                <p className="text-gray-400 mt-2">Use Prev / Next in Presenter View to navigate slides.</p>
              </div>
            ) : selectedFrameData.type === 'html-deck' ? (
              <div className="text-xs text-gray-600 space-y-1">
                <div className="font-medium">HTML Deck (legacy)</div>
                <p className="text-gray-400">Upload a new deck to replace.</p>
              </div>
            ) : (
              <div className="text-xs text-gray-600 space-y-1">
                <div className="font-medium">{selectedFrameData.configType}</div>
                <div className="text-gray-400">{selectedFrameData.configTitle}</div>
                <p className="text-gray-400 mt-2">Participants interact when you navigate here during a live session.</p>
              </div>
            )}
          </div>
        </div>
      </DndContext>

      <PresenterView
        presentationId={presId}
        shareToken={pres.shareToken}
        frames={pres.frames}
        open={presenterOpen}
        onClose={() => setPresenterOpen(false)}
      />
    </div>
  );
}
