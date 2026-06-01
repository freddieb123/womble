import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import ActivityFrame from "@/components/ActivityFrame";
import FullscreenPrompt from "@/components/FullscreenPrompt";
import type { PresentationFrame } from "@db/schema";

const LS_NAME_KEY = "womble_presentation_name";

interface PresentationMeta {
  id: number;
  title: string;
  frameCount: number;
  hasDeck: boolean;
}

interface PresentationState {
  phase: "waiting" | "live" | "finished";
  currentFrame: number;
  fullscreenMode: boolean;
  frameCount: number;
  lastAction: string | null;
  actionId: string | null;
}

export default function PresentationView() {
  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get("token");

  const [userName, setUserName] = useState<string>(() => localStorage.getItem(LS_NAME_KEY) ?? "");
  const [nameSubmitted, setNameSubmitted] = useState(() => !!localStorage.getItem(LS_NAME_KEY));
  const [fullscreenDismissed, setFullscreenDismissed] = useState(false);
  const participantId = useRef(crypto.randomUUID());
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastSeenActionId = useRef<string | null>(null);

  const { data: meta } = useQuery<PresentationMeta>({
    queryKey: ["/api/presentations/join", token],
    queryFn: async () => {
      const res = await fetch(`/api/presentations/join/${token}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!token,
    staleTime: Infinity,
  });

  const { data: state } = useQuery<PresentationState>({
    queryKey: ["/api/presentations/join", token, "state"],
    queryFn: async () => {
      const res = await fetch(`/api/presentations/join/${token}/state`);
      return res.json();
    },
    enabled: !!token && nameSubmitted,
    refetchInterval: 1000,
  });

  const { data: currentFrameData } = useQuery<PresentationFrame>({
    queryKey: ["/api/presentations/join", token, "frame", state?.currentFrame],
    queryFn: async () => {
      const res = await fetch(`/api/presentations/join/${token}/frame/${state!.currentFrame}`);
      return res.json();
    },
    enabled: !!token && !!state && state.phase === "live",
    staleTime: Infinity,
  });

  // Fire postMessage to iframe when a new slide action arrives
  useEffect(() => {
    if (!state?.actionId || state.actionId === lastSeenActionId.current) return;
    if (!state.lastAction) return;
    lastSeenActionId.current = state.actionId;
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    // "goto:N" encodes an absolute slide jump; everything else is a named action
    if (state.lastAction.startsWith('goto:')) {
      const slideIndex = parseInt(state.lastAction.slice(5));
      iframe.contentWindow.postMessage({ __womble: true, action: 'goto', slideIndex, actionId: state.actionId }, "*");
    } else {
      iframe.contentWindow.postMessage({ __womble: true, action: state.lastAction, actionId: state.actionId }, "*");
    }
  }, [state?.actionId, state?.lastAction]);

  // Heartbeat
  useEffect(() => {
    if (!nameSubmitted || !token) return;
    const ping = () => fetch(`/api/presentations/join/${token}/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId: participantId.current }),
    });
    ping();
    const interval = setInterval(ping, 10_000);
    return () => clearInterval(interval);
  }, [nameSubmitted, token]);

  useEffect(() => {
    if (!state?.fullscreenMode) setFullscreenDismissed(false);
  }, [state?.fullscreenMode]);

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = userName.trim();
    if (!trimmed) return;
    localStorage.setItem(LS_NAME_KEY, trimmed);
    setUserName(trimmed);
    setNameSubmitted(true);
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <p>Invalid presentation link.</p>
      </div>
    );
  }

  if (!nameSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="bg-white rounded-xl p-8 shadow-xl w-full max-w-sm">
          <h1 className="text-xl font-bold text-gray-900 mb-1">{meta?.title ?? "Presentation"}</h1>
          <p className="text-sm text-gray-500 mb-6">Enter your name to join</p>
          <form onSubmit={handleNameSubmit} className="flex flex-col gap-3">
            <input
              value={userName}
              onChange={e => setUserName(e.target.value)}
              placeholder="Your name"
              className="border rounded-lg px-4 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Join
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (state?.phase === "waiting") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white gap-4">
        <div className="animate-pulse text-2xl font-medium">{meta?.title}</div>
        <p className="text-gray-400">Waiting for presenter to start…</p>
      </div>
    );
  }

  if (state?.phase === "finished") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white gap-4">
        <div className="text-2xl font-medium">{meta?.title}</div>
        <p className="text-gray-400">The presentation has ended. Thank you!</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <div className="flex-1 overflow-hidden relative">
        {(currentFrameData?.type === "html-deck" || currentFrameData?.type === "html-slide") && token && (
          <iframe
            ref={iframeRef}
            src={`/api/presentations/join/${token}/deck`}
            sandbox="allow-scripts allow-same-origin allow-presentation"
            className="w-full h-screen border-none"
            title="Presentation"
          />
        )}
        {currentFrameData?.type === "activity" && (
          <div className="h-screen bg-white flex flex-col">
            <div className="flex-1 overflow-auto p-4 max-w-4xl mx-auto w-full">
              <ActivityFrame
                configId={currentFrameData.configId}
                configType={currentFrameData.configType}
                userName={userName}
                onUserNameChange={name => {
                  setUserName(name);
                  localStorage.setItem(LS_NAME_KEY, name);
                }}
              />
            </div>
          </div>
        )}
        {!currentFrameData && state?.phase === "live" && (
          <div className="flex items-center justify-center h-screen">
            <div className="animate-pulse text-white">Loading…</div>
          </div>
        )}
        {state?.fullscreenMode && !fullscreenDismissed && (
          <FullscreenPrompt onDismiss={() => setFullscreenDismissed(true)} />
        )}
      </div>
    </div>
  );
}
