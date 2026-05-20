import { useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, Upload, Share2, MonitorPlay, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import PresentationFrameStrip from "@/components/PresentationFrameStrip";
import PresentationActivityLibrary from "@/components/PresentationActivityLibrary";
import PresenterView from "@/components/PresenterView";
import type { PresentationFrame, SelectPresentation } from "@db/schema";
import WombleHeader from "@/components/WombleHeader";

type Presentation = SelectPresentation & { state?: { phase: string; currentFrame: number; fullscreenMode: boolean } | null };

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
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Upload failed");
      }
      await qc.invalidateQueries({ queryKey: ["/api/presentations", presId] });
      toast({ title: "Slides uploaded", description: "Slides have been added to your presentation." });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSpeakerNotesChange = (notes: string) => {
    const frames = pres?.frames ?? [];
    const frame = frames[selectedFrame];
    if (!frame || frame.type !== 'slide') return;
    const updated = frames.map((f, i) => i === selectedFrame ? { ...f, speakerNotes: notes } as PresentationFrame : f);
    updateMutation.mutate({ frames: updated });
  };

  const handleShare = () => {
    if (!pres) return;
    const url = `${window.location.origin}/present?token=${pres.shareToken}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied", description: url });
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
            Upload PPTX
          </Button>
          <input ref={fileInputRef} type="file" accept=".pptx" className="hidden" onChange={handleUpload} />
          <Button size="sm" onClick={() => setPresenterOpen(true)}>
            <MonitorPlay className="h-4 w-4 mr-1" /> Present
          </Button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Activity library sidebar */}
        <div className="w-48 border-r border-gray-200 bg-white p-3 overflow-y-auto">
          <PresentationActivityLibrary onAdd={handleAddActivity} />
        </div>

        {/* Editor center */}
        <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
          {/* Preview of selected frame */}
          <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden flex items-center justify-center">
            {!selectedFrameData ? (
              <div className="text-gray-400 text-sm text-center">
                <p>No frames yet.</p>
                <p className="mt-1">Upload a PPTX or add activities from the sidebar.</p>
              </div>
            ) : selectedFrameData.type === 'slide' ? (
              <img src={selectedFrameData.imageDataUrl} alt="Selected slide" className="max-w-full max-h-full object-contain" />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 text-center">
                <div className="text-2xl font-bold text-blue-700">{selectedFrameData.configType}</div>
                <div className="text-gray-600">{selectedFrameData.configTitle}</div>
                <div className="text-sm text-gray-400">Activity frame — participants will interact with this</div>
              </div>
            )}
          </div>

          {/* Frame strip */}
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <PresentationFrameStrip
              frames={pres.frames}
              selectedIndex={selectedFrame}
              onSelect={setSelectedFrame}
              onReorder={frames => handleFramesChange(frames)}
              onRemove={handleRemoveFrame}
            />
          </div>
        </div>

        {/* Speaker notes sidebar */}
        <div className="w-52 border-l border-gray-200 bg-white p-3 flex flex-col">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Speaker Notes</div>
          {selectedFrameData?.type === 'slide' ? (
            <Textarea
              className="flex-1 resize-none text-sm"
              placeholder="Add notes for this slide…"
              value={selectedFrameData.speakerNotes ?? ""}
              onChange={e => handleSpeakerNotesChange(e.target.value)}
            />
          ) : (
            <p className="text-xs text-gray-400">Speaker notes are only available for slide frames.</p>
          )}
        </div>
      </div>

      <PresenterView
        presentationId={presId}
        frames={pres.frames}
        open={presenterOpen}
        onClose={() => setPresenterOpen(false)}
      />
    </div>
  );
}
