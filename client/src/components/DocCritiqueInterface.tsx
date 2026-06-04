import { useState, useEffect, useRef } from "react";
import { FileText, Mic, MicOff, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import UserNameModal from "@/components/UserNameModal";
import type { AdminConfig } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

interface Props {
  config: AdminConfig;
  sessionId: string;
  userName: string | null;
  onUserNameSubmit: (name: string, mode?: 'typed' | 'spoken') => string;
}

type Phase = 'observe' | 'submitting' | 'done';

export default function DocCritiqueInterface({ config, sessionId, userName, onUserNameSubmit }: Props) {
  const [pdfSrc, setPdfSrc] = useState<string | null>(null);
  const [observation, setObservation] = useState('');
  const [phase, setPhase] = useState<Phase>('observe');
  const [feedbackData, setFeedbackData] = useState<{ bullets: string[]; score?: number; summary?: string } | null>(null);
  const [isDictating, setIsDictating] = useState(false);
  const [showNameModal, setShowNameModal] = useState(!userName);
  const recognitionRef = useRef<any>(null);
  const { toast } = useToast();

  // Convert stored PDF data URL to blob URL for reliable iframe rendering
  useEffect(() => {
    const raw = config.referenceContent;
    if (!raw) return;
    if (raw.startsWith('data:application/pdf;base64,')) {
      try {
        const b64 = raw.split(',')[1];
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

  useEffect(() => () => { recognitionRef.current?.stop(); }, []);

  const handleDictate = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ description: 'Speech recognition is not supported in this browser.' });
      return;
    }
    if (isDictating) {
      recognitionRef.current?.stop();
      setIsDictating(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-GB';
    recognition.onresult = (event: any) => {
      let text = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) text += event.results[i][0].transcript;
      }
      if (text) setObservation(prev => prev ? prev.trimEnd() + ' ' + text.trim() : text.trim());
    };
    recognition.onerror = () => setIsDictating(false);
    recognition.onend = () => setIsDictating(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsDictating(true);
  };

  const handleSubmit = async () => {
    if (!observation.trim()) return;
    setPhase('submitting');
    const messages = [{ id: uuidv4(), role: 'user' as const, content: observation.trim(), timestamp: Date.now(), sessionId }];
    try {
      // Save transcript so admin feedback view shows this submission
      await fetch('/api/conversations/save-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configId: config.id, sessionId, userName, chatMode: 'typed', messages }),
      });

      // Generate feedback based on the observation vs criteria
      const res = await fetch('/api/chat-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configId: config.id, sessionId, messages, type: 'chat', userName, chatMode: 'typed' }),
      });
      if (!res.ok) throw new Error(await res.text());
      setFeedbackData(await res.json());
      setPhase('done');
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
      setPhase('observe');
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <UserNameModal
        open={showNameModal}
        interactionMode="typed"
        onSubmit={(name) => { onUserNameSubmit(name, 'typed'); setShowNameModal(false); }}
      />

      {/* ── Left: Document viewer ── */}
      <div className="w-1/2 flex-shrink-0 border-r border-gray-200 flex flex-col bg-gray-50">
        <div className="px-4 py-3 border-b border-gray-200 bg-white flex items-center gap-2">
          <FileText className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium text-gray-700">Document</span>
        </div>
        <div className="flex-1 min-h-0">
          {pdfSrc ? (
            <iframe src={pdfSrc} className="w-full h-full border-0" title="Reference document" />
          ) : config.referenceContent ? (
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

      {/* ── Right: Observation & feedback ── */}
      <div className="flex-1 flex flex-col min-h-0 p-6 gap-4 overflow-y-auto">

        {/* Instructions */}
        {config.userInstructions && (
          <div className="bg-blue-50 rounded-lg px-4 py-3 border border-blue-100">
            <p className="text-sm text-gray-700">{config.userInstructions}</p>
          </div>
        )}

        {phase !== 'done' ? (
          <>
            <div className="space-y-2 flex-1 flex flex-col">
              <label className="text-sm font-medium text-gray-700">Your observations</label>
              <Textarea
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
                placeholder="Write what you notice about this document — key points, risks, assumptions, decisions, or anything that stands out to you..."
                className="resize-none flex-1 min-h-[200px] text-sm"
                disabled={phase === 'submitting'}
              />
              <div className="flex items-center justify-between pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDictate}
                  className={isDictating ? 'text-red-600 border-red-300 hover:bg-red-50' : ''}
                  disabled={phase === 'submitting'}
                >
                  {isDictating
                    ? <><MicOff className="h-3.5 w-3.5 mr-1.5" /> Stop dictating</>
                    : <><Mic className="h-3.5 w-3.5 mr-1.5" /> Dictate</>
                  }
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!observation.trim() || phase === 'submitting' || !userName}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {phase === 'submitting'
                    ? <><div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-2" /> Submitting...</>
                    : <><Send className="h-4 w-4 mr-2" /> Submit observations</>
                  }
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Submitted observation */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Your observations</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{observation}</p>
            </div>

            {/* Feedback */}
            {feedbackData && (
              <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-5 space-y-4">
                <p className="text-sm font-semibold text-blue-700 uppercase tracking-wide">Feedback</p>
                {feedbackData.score !== undefined && (
                  <div className="text-center">
                    <span className="text-4xl font-bold text-blue-600">{feedbackData.score}</span>
                    <span className="text-xl text-gray-400">/10</span>
                  </div>
                )}
                {feedbackData.summary && (
                  <p className="text-gray-600 italic text-sm">{feedbackData.summary}</p>
                )}
                <ul className="space-y-2">
                  {feedbackData.bullets.map((b, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span className="text-blue-500 flex-shrink-0 mt-0.5">•</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
