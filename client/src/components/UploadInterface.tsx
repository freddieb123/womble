import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { UploadCloud, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import type { AdminConfig, UploadState } from "@/lib/types";

interface Props {
  config: AdminConfig;
  sessionId: string;
}

export default function UploadInterface({ config, sessionId }: Props) {
  const [uploadState, setUploadState] = useState<UploadState>({
    file: null,
    fileName: '',
    isLoading: false,
    error: null,
    feedback: undefined
  });
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    await handleFile(file);
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('text/')) {
      toast({
        variant: "destructive",
        title: "Invalid file",
        description: "Please upload a text file"
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setUploadState(prev => ({
        ...prev,
        file: e.target?.result as string,
        fileName: file.name
      }));
    };
    reader.readAsText(file);
  };

  const getFeedback = async () => {
    if (!uploadState.file) {
      toast({
        variant: "destructive",
        title: "No file",
        description: "Please upload a file first"
      });
      return;
    }

    try {
      setUploadState(prev => ({ ...prev, isLoading: true, error: null }));
      const response = await fetch("/api/upload-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          configId: config.id,
          sessionId,
          fileContent: uploadState.file,
          fileName: uploadState.fileName
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const { bullets, score, summary } = await response.json();
      setUploadState(prev => ({
        ...prev,
        feedback: { bullets, score, summary }
      }));
      setFeedbackOpen(true);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to get feedback"
      });
      setUploadState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : "Failed to get feedback"
      }));
    } finally {
      setUploadState(prev => ({ ...prev, isLoading: false }));
    }
  };

  return (
    <div className="flex flex-col h-[600px]">
      {config.userInstructions && (
        <Alert className="mb-4">
          <Info className="h-4 w-4" />
          <AlertDescription>
            <div className="font-semibold text-lg mb-2">{config.title}</div>
            <pre className="font-sans whitespace-pre-wrap">{config.userInstructions}</pre>
          </AlertDescription>
        </Alert>
      )}

      <div 
        className="flex-1 border-2 border-dashed rounded-lg flex flex-col items-center justify-center p-6 relative cursor-pointer hover:bg-gray-50"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploadState.file ? (
          <div className="relative inline-block">
            <pre className="max-h-96 overflow-auto p-4 bg-gray-50 rounded-lg border border-gray-200">
              {uploadState.file}
            </pre>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setUploadState(prev => ({ ...prev, file: null, fileName: '' }));
              }}
              className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow-sm border border-gray-200"
            >
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>
        ) : (
          <>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="text/*"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <UploadCloud className="h-12 w-12 text-gray-400 mb-4" />
            <div className="text-center">
              <p className="text-lg font-semibold mb-2">Click or drag and drop</p>
              <p className="text-sm text-gray-600">Upload your text file to get feedback</p>
            </div>
          </>
        )}
      </div>

      <div className="mt-4">
        <Button 
          className="w-full" 
          size="lg"
          disabled={!uploadState.file || uploadState.isLoading}
          onClick={getFeedback}
        >
          {uploadState.isLoading ? "Analyzing..." : "Get Feedback"}
        </Button>
      </div>

      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Analysis Feedback</DialogTitle>
          </DialogHeader>
          {uploadState.feedback && (
            <div className="space-y-6">
              <div className="space-y-3">
                {uploadState.feedback.bullets.map((bullet, index) => (
                  <div key={index} className="flex items-start gap-2 text-sm">
                    <span>•</span>
                    <span>{bullet}</span>
                  </div>
                ))}
              </div>
              <div className="border-t pt-4">
                <div className="flex flex-col gap-2">
                  <span className="text-2xl font-bold">{uploadState.feedback.score}/10</span>
                  {uploadState.feedback.summary && (
                    <p className="text-sm text-muted-foreground">{uploadState.feedback.summary}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}