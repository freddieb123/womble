import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Timer, Plus, Play, Pause, RotateCcw } from "lucide-react";

interface TimerState {
  status: 'idle' | 'running' | 'paused' | 'finished';
  totalSeconds: number;
  remainingSeconds: number;
}

function fmt(secs: number): string {
  const s = Math.max(0, Math.ceil(secs));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

function playDing() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1.2);
  } catch {}
}

export default function AgentTimer({ configId }: { configId: number }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingTime, setEditingTime] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [tick, setTick] = useState(0);
  const dingFiredRef = useRef(false);

  const { data: timer } = useQuery<TimerState>({
    queryKey: ['/api/timer', configId],
    queryFn: async () => {
      const res = await fetch(`/api/timer/${configId}`);
      return res.json();
    },
    refetchInterval: 1000,
  });

  // Local tick for smooth countdown
  useEffect(() => {
    if (timer?.status !== 'running') return;
    const id = setInterval(() => setTick(t => t + 1), 500);
    return () => clearInterval(id);
  }, [timer?.status]);

  // Compute display remaining
  const displayRemaining = timer?.remainingSeconds ?? 0;

  // Ding when hitting 0
  useEffect(() => {
    if (!timer) return;
    if (timer.status === 'finished' && !dingFiredRef.current) {
      dingFiredRef.current = true;
      playDing();
    }
    if (timer.status !== 'finished') {
      dingFiredRef.current = false;
    }
  }, [timer?.status]);

  const mutate = useMutation({
    mutationFn: async (body: { action: string; seconds?: number }) => {
      const res = await fetch(`/api/timer/${configId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/timer', configId] }),
  });

  const status = timer?.status ?? 'idle';
  const hasTime = (timer?.totalSeconds ?? 0) > 0;
  const isActive = status === 'running' || status === 'paused' || status === 'finished';

  if (!open && !isActive) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Set activity timer"
        className="flex items-center gap-1 px-2 py-1 rounded-full text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
      >
        <Timer className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0 bg-gray-50 rounded-lg px-2 py-1 border border-gray-200">
      {/* Time display — click to edit minutes when idle/paused */}
      {editingTime && (status === 'idle' || status === 'paused') ? (
        <input
          type="number"
          min={0}
          max={120}
          autoFocus
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => {
            const mins = parseFloat(editValue);
            if (!isNaN(mins) && mins >= 0) mutate.mutate({ action: 'set', seconds: Math.round(mins * 60) });
            setEditingTime(false);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const mins = parseFloat(editValue);
              if (!isNaN(mins) && mins >= 0) mutate.mutate({ action: 'set', seconds: Math.round(mins * 60) });
              setEditingTime(false);
            }
            if (e.key === 'Escape') setEditingTime(false);
          }}
          className="w-10 text-sm font-mono font-semibold text-center border border-green-400 rounded outline-none bg-white"
        />
      ) : (
        <button
          onClick={() => {
            if (status === 'idle' || status === 'paused') {
              const mins = (timer?.totalSeconds ?? 0) / 60;
              setEditValue(String(Math.round(mins)));
              setEditingTime(true);
            }
          }}
          title={status === 'idle' || status === 'paused' ? 'Click to set minutes' : undefined}
          className={`text-sm font-mono font-semibold w-12 text-center ${
            status === 'finished' ? 'text-red-500' :
            displayRemaining <= 60 && status === 'running' ? 'text-amber-600' : 'text-gray-700'
          } ${status === 'idle' || status === 'paused' ? 'cursor-text hover:text-green-600' : ''}`}
        >
          {status === 'finished' ? '0:00' : fmt(displayRemaining)}
        </button>
      )}

      {/* +1 min */}
      {(status === 'idle' || status === 'paused') && (
        <button
          onClick={() => mutate.mutate({ action: 'add', seconds: 60 })}
          className="text-gray-500 hover:text-green-600 transition-colors"
          title="Add 1 minute"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Start / Resume */}
      {(status === 'idle' || status === 'paused') && (timer?.totalSeconds ?? 0) > 0 && (
        <button
          onClick={() => mutate.mutate({ action: status === 'paused' ? 'resume' : 'start' })}
          className="text-green-600 hover:text-green-700 transition-colors"
          title={status === 'paused' ? 'Resume' : 'Start'}
        >
          <Play className="h-3.5 w-3.5 fill-current" />
        </button>
      )}

      {/* Pause */}
      {status === 'running' && (
        <button
          onClick={() => mutate.mutate({ action: 'pause' })}
          className="text-amber-600 hover:text-amber-700 transition-colors"
          title="Pause"
        >
          <Pause className="h-3.5 w-3.5 fill-current" />
        </button>
      )}

      {/* Stop / Reset */}
      {isActive && (
        <button
          onClick={() => {
            mutate.mutate({ action: 'reset' });
            setOpen(false);
          }}
          className="text-gray-400 hover:text-red-500 transition-colors"
          title="Reset timer"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}

      {/* Close (when idle and not started) */}
      {status === 'idle' && !hasTime && (
        <button
          onClick={() => setOpen(false)}
          className="text-gray-300 hover:text-gray-500 transition-colors text-xs leading-none"
          title="Close"
        >
          ✕
        </button>
      )}
    </div>
  );
}
