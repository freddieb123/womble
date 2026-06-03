import { useState, useEffect } from "react";
import { FileText } from "lucide-react";
import ChatInterface from "@/components/ChatInterface";
import type { AdminConfig } from "@/lib/types";

interface Props {
  config: AdminConfig;
  sessionId: string;
  userName: string | null;
  onUserNameSubmit: (name: string, mode?: 'typed' | 'spoken') => string;
}

export default function DocCritiqueInterface({ config, sessionId, userName, onUserNameSubmit }: Props) {
  const [pdfSrc, setPdfSrc] = useState<string | null>(null);

  // Convert stored data URL to blob URL for reliable iframe display
  useEffect(() => {
    const raw = config.referenceContent;
    if (!raw) return;

    if (raw.startsWith('data:application/pdf;base64,')) {
      const b64 = raw.split(',')[1];
      try {
        const bytes = atob(b64);
        const ab = new ArrayBuffer(bytes.length);
        const view = new Uint8Array(ab);
        for (let i = 0; i < bytes.length; i++) view[i] = bytes.charCodeAt(i);
        const blob = new Blob([ab], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        setPdfSrc(url);
        return () => URL.revokeObjectURL(url);
      } catch {
        setPdfSrc(raw);
      }
    } else if (raw.startsWith('http') || raw.startsWith('/')) {
      setPdfSrc(raw);
    }
  }, [config.referenceContent]);

  return (
    <div className="flex h-full min-h-0">
      {/* ── Left: Document viewer ── */}
      <div className="w-1/2 flex-shrink-0 border-r border-gray-200 flex flex-col bg-gray-50">
        <div className="px-4 py-3 border-b border-gray-200 bg-white flex items-center gap-2">
          <FileText className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium text-gray-700">Document</span>
        </div>
        <div className="flex-1 min-h-0">
          {pdfSrc ? (
            <iframe
              src={pdfSrc}
              className="w-full h-full border-0"
              title="Reference document"
            />
          ) : config.referenceContent ? (
            // Plain text fallback
            <div className="p-4 overflow-y-auto h-full">
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                {config.referenceContent}
              </pre>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              No document uploaded for this activity.
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Chat ── */}
      <div className="flex-1 flex flex-col min-h-0 p-4">
        <ChatInterface
          config={config}
          sessionId={sessionId}
          userName={userName}
          isViewOnly={false}
          onUserNameSubmit={onUserNameSubmit}
        />
      </div>
    </div>
  );
}
