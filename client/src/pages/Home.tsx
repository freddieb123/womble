import { useState, useCallback, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Plus, Pencil, Copy, MoreVertical, BarChart2, Trash2,
  Share2, Keyboard, Mic, LogOut, Settings, GripVertical, Radio,
  Layers, FolderOpen, Library, Play, Users, MonitorPlay,
  MessageSquare, GraduationCap, Brain, Zap, LayoutGrid, Monitor,
  FileText, ClipboardList, HelpCircle, Upload, Sparkles, Link2, X, Check,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { track, EventName } from "@/lib/mixpanel";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import AdminPanel from "@/components/AdminPanel";
import CreateGptWizard from "@/components/CreateGptWizard";
import type { AdminConfig } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import AddAgentDialog from "@/components/AddAgentDialog";
import QuizEditor from "@/components/QuizEditor";
import QuickFireQuizEditor from "@/components/QuickFireQuizEditor";
import QuickFireQuizAdminControl from "@/components/QuickFireQuizAdminControl";
import AgentTimer from "@/components/AgentTimer";
import type { Template } from "@/lib/types";

const LS_SESSION_KEY = 'womble_last_session_id';
const LS_INSPIRATION_KEY = 'womble_inspiration_session_id';
const MAX_SLIDE_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_SLIDE_UPLOAD_LABEL = '100MB';

async function readApiError(response: Response, fallback: string) {
  const text = await response.text();
  try {
    const body = JSON.parse(text);
    return body.error || body.message || fallback;
  } catch {
    return text || fallback;
  }
}

type Suggestion = {
  id: string;
  type: AdminConfig['type'];
  title: string;
  description: string;
  slideReference?: string | null;
  // First/last slide this activity relates to. Kept on the suggestion so that
  // /api/build-suggestion can pull the exact referenced slides back out of the
  // tagged slideContext when the trainer clicks Build.
  slideStartIndex?: number | null;
  slideEndIndex?: number | null;
  // Populated later by /api/build-suggestion when the trainer picks a suggestion —
  // the /api/suggest-activities response is intentionally lightweight and omits these.
  systemPrompt?: string;
  feedbackCriteria?: string;
  userInstructions?: string;
};

const AGENT_TYPE_FILTERS = [
  { type: 'all', label: 'All' },
  { type: 'chat', label: 'Conversation' },
  { type: 'two-way-conversation', label: 'Two-way' },
  { type: 'teach-ai', label: 'Teach an AI' },
  { type: 'thought-partner', label: 'Thought Partner' },
  { type: 'quiz', label: 'Quiz' },
  { type: 'quick-fire-quiz', label: 'Quick Fire Quiz' },
  { type: 'group-board', label: 'Group Board' },
  { type: 'upload', label: 'Document Review' },
  { type: 'user-tester', label: 'User Tester' },
  { type: 'doc-critique', label: 'Doc Critique' },
  { type: 'task-walkthrough', label: 'Task Walkthrough' },
] as const;

type AgentTypeFilter = typeof AGENT_TYPE_FILTERS[number]['type'];

function todayTitle() {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = String(now.getFullYear()).slice(2);
  return `Session - ${d}/${m}/${y}`;
}

type ChatConfig = {
  id: number;
  title: string;
  type: 'chat' | 'upload' | 'quiz' | 'two-way-conversation' | 'teach-ai' | 'thought-partner' | 'quick-fire-quiz' | 'group-board' | 'user-tester' | 'doc-critique' | 'task-walkthrough';
  systemPrompt: string;
  userInstructions: string | null;
  feedbackCriteria: string | null;
  createdAt: string;
  conversationCount: number;
  deleted?: boolean;
  deletedAt?: string;
  isTemplate?: boolean;
  templateDescription?: string;
  questions?: Array<{ question: string; expectedAnswer: string }>;
  quizQuestions?: Array<{ id: number; question: string; expectedAnswer: string; orderIndex: number }>;
  quickFireQuestions?: Array<{ id?: number; question: string; options: [string, string, string, string]; correctIndex: 0 | 1 | 2 | 3; timeLimit: number; orderIndex: number }>;
  temperature?: number;
  maxTokens?: number;
  userId?: number;
  feedbackHarshness?: 'encouraging' | 'developmental' | 'standard' | 'high-performance' | 'elite';
  interactionMode?: 'typed' | 'spoken' | 'both';
  sessionId?: number | null;
  sessionOrder?: number | null;
  isLive?: boolean;
};

type SessionSummary = {
  id: number;
  title: string;
  shareToken: string;
  isLibrary: boolean;
  createdAt: string;
  updatedAt: string;
  configCount: number;
};

type SessionDetail = SessionSummary & {
  configs: ChatConfig[];
  suggestions?: Suggestion[];
  suggestionsFile?: { name: string; slideCount?: number } | null;
  slideContext?: string | null;
};

// ─── Editable main title ──────────────────────────────────────────────────────

function EditableTitle({ title, onSave }: { title: string; onSave: (t: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);

  useEffect(() => { setValue(title); }, [title]);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== title) onSave(trimmed);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') setEditing(false);
        }}
        autoFocus
        className="text-xl font-bold text-gray-900 border-b-2 border-green-500 outline-none bg-transparent min-w-0 w-full max-w-sm"
      />
    );
  }

  return (
    <div
      className="group flex items-center gap-2 cursor-text"
      onClick={() => setEditing(true)}
      title="Click to rename"
    >
      <h1 className="text-xl font-bold text-gray-900">{title}</h1>
      <Pencil className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </div>
  );
}

// ─── Sidebar session item ─────────────────────────────────────────────────────

function SessionSidebarItem({
  session,
  isSelected,
  onSelect,
  onDuplicate,
  onDelete,
  onRename,
  onShare,
}: {
  session: SessionSummary;
  isSelected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
  onShare: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(session.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setValue(session.title); }, [session.title]);

  const startEditing = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setValue(session.title);
    setEditing(true);
  };

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== session.title) onRename(trimmed);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="px-2 py-1">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') setEditing(false);
          }}
          autoFocus
          className="w-full text-sm px-2 py-1.5 rounded border border-green-400 outline-none bg-white"
        />
      </div>
    );
  }

  const icon = session.isLibrary
    ? <Library className={`h-3.5 w-3.5 flex-shrink-0 ${isSelected ? 'text-green-600' : 'text-gray-400'}`} />
    : <FolderOpen className={`h-3.5 w-3.5 flex-shrink-0 ${isSelected ? 'text-green-600' : 'text-gray-400'}`} />;

  return (
    <div
      onClick={onSelect}
      onDoubleClick={startEditing}
      className={`group flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors ${
        isSelected ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {icon}
      <span className="flex-1 text-sm truncate">{session.title}</span>
      <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">{session.configCount}</span>

      {/* Pencil — visible on hover, only for non-library or library sessions */}
      <button
        onClick={startEditing}
        title="Rename"
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-foreground transition-opacity flex-shrink-0"
      >
        <Pencil className="h-3 w-3" />
      </button>

      {/* Three-dot — only if not library */}
      {!session.isLibrary && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-foreground transition-opacity flex-shrink-0"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={onShare}>
              <Share2 className="h-4 w-4 mr-2" />Share
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="h-4 w-4 mr-2" />Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem className="text-red-600" onClick={onDelete}>
              <Trash2 className="h-4 w-4 mr-2" />Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

// ─── Sortable agent row ────────────────────────────────────────────────────────

function SortableAgentCard({
  config,
  isLibraryView,
  sessions,
  onToggleLive,
  onEdit,
  onDelete,
  onCopyLink,
  onViewFeedback,
  onDuplicate,
  onAddToSession,
  onControlQuiz,
}: {
  config: ChatConfig;
  isLibraryView: boolean;
  sessions: SessionSummary[];
  onToggleLive: (isLive: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopyLink: () => void;
  onViewFeedback: () => void;
  onDuplicate: () => void;
  onAddToSession: (sessionId: number) => void;
  onControlQuiz?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: config.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const typeBadge = {
    chat: { label: 'Conversation', classes: 'bg-green-50 text-green-700 border-green-200' },
    'teach-ai': { label: 'Teach an AI', classes: 'bg-blue-50 text-blue-700 border-blue-200' },
    'thought-partner': { label: 'Thought Partner', classes: 'bg-teal-50 text-teal-700 border-teal-200' },
    'two-way-conversation': { label: 'Two-way', classes: 'bg-orange-50 text-orange-700 border-orange-200' },
    quiz: { label: 'Quiz', classes: 'bg-gray-50 text-gray-600 border-gray-200' },
    upload: { label: 'Document Review', classes: 'bg-purple-50 text-purple-700 border-purple-200' },
    'quick-fire-quiz': { label: 'Quick Fire Quiz', classes: 'bg-amber-50 text-amber-700 border-amber-200' },
    'group-board': { label: 'Group Board', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    'user-tester': { label: 'User Tester', classes: 'bg-violet-50 text-violet-700 border-violet-200' },
    'doc-critique': { label: 'Doc Critique', classes: 'bg-blue-50 text-blue-700 border-blue-200' },
    'task-walkthrough': { label: 'Task Walkthrough', classes: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  }[config.type] ?? { label: config.type, classes: 'bg-gray-50 text-gray-600 border-gray-200' };

  const TypeIcon = {
    chat: MessageSquare,
    'two-way-conversation': Users,
    'teach-ai': GraduationCap,
    'thought-partner': Brain,
    'quick-fire-quiz': Zap,
    'group-board': LayoutGrid,
    'user-tester': Monitor,
    'doc-critique': FileText,
    'task-walkthrough': ClipboardList,
    quiz: HelpCircle,
    upload: Upload,
  }[config.type] ?? MessageSquare;

  const typeIconColor = {
    chat: 'text-green-600',
    'two-way-conversation': 'text-orange-500',
    'teach-ai': 'text-blue-600',
    'thought-partner': 'text-teal-600',
    'quick-fire-quiz': 'text-amber-500',
    'group-board': 'text-emerald-600',
    'user-tester': 'text-violet-600',
    'doc-critique': 'text-purple-600',
    'task-walkthrough': 'text-cyan-600',
    quiz: 'text-gray-600',
    upload: 'text-purple-600',
  }[config.type] ?? 'text-gray-400';

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-4 shadow-sm">
      <button {...attributes} {...listeners} className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing flex-shrink-0">
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <TypeIcon className={`h-4 w-4 flex-shrink-0 ${typeIconColor}`} />
          <span className="text-sm font-medium text-foreground truncate">{config.title}</span>
          <Badge variant="outline" className={`text-xs flex-shrink-0 ${typeBadge.classes}`}>{typeBadge.label}</Badge>
          {config.type !== 'quick-fire-quiz' && config.type !== 'user-tester' && (() => {
            const mode = config.interactionMode ?? 'both';
            return (
              <span className="inline-flex items-center gap-0.5 text-gray-400 flex-shrink-0">
                {(mode === 'typed' || mode === 'both') && <Keyboard className="h-3.5 w-3.5" />}
                {(mode === 'spoken' || mode === 'both') && <Mic className="h-3.5 w-3.5" />}
              </span>
            );
          })()}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {config.conversationCount ?? 0} submission{(config.conversationCount ?? 0) !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Live toggle — hidden in library view */}
      {!isLibraryView && (
        <button
          onClick={() => onToggleLive(!config.isLive)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex-shrink-0 ${
            config.isLive ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          <Radio className={`h-3 w-3 ${config.isLive ? 'text-green-600' : 'text-gray-400'}`} />
          {config.isLive ? 'Live' : 'Not live'}
        </button>
      )}

      {/* Activity timer — for timed activity types */}
      {!isLibraryView && (config.type === 'chat' || config.type === 'teach-ai' || config.type === 'two-way-conversation') && (
        <AgentTimer configId={config.id} />
      )}

      {/* View Board button — directly visible on group-board cards */}
      {config.type === 'group-board' && !isLibraryView && (
        <a
          href={`/group-board/${config.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors flex-shrink-0"
          onClick={e => e.stopPropagation()}
        >
          <Users className="h-3 w-3" />
          View Board
        </a>
      )}

      {/* Control Quiz button — directly visible on quick-fire-quiz cards */}
      {config.type === 'quick-fire-quiz' && onControlQuiz && !isLibraryView && (
        <button
          onClick={onControlQuiz}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors flex-shrink-0"
        >
          <Play className="h-3 w-3" />
          Control
        </button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-gray-600 flex-shrink-0">
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
          {isLibraryView ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Layers className="h-4 w-4 mr-2" />Add to session
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {sessions.length === 0 ? (
                  <DropdownMenuItem disabled>No sessions yet</DropdownMenuItem>
                ) : (
                  sessions.map(s => (
                    <DropdownMenuItem key={s.id} onClick={() => onAddToSession(s.id)}>
                      {s.title}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : (
            <DropdownMenuItem onClick={onDuplicate}><Copy className="h-4 w-4 mr-2" />Duplicate</DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onCopyLink}><Share2 className="h-4 w-4 mr-2" />Share individual link</DropdownMenuItem>
          {!isLibraryView && config.type !== 'group-board' && (
            <DropdownMenuItem onClick={onViewFeedback}><BarChart2 className="h-4 w-4 mr-2" />View Feedback</DropdownMenuItem>
          )}
          <DropdownMenuItem className="text-red-600" onClick={onDelete}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function startProgressSimulation(setProgress: (v: number) => void): ReturnType<typeof setInterval> {
  setProgress(5);
  let current = 5;
  return setInterval(() => {
    current = current < 18 ? current + 3
            : current < 72 ? current + 0.8
            : current < 88 ? current + 0.3
            : current;
    setProgress(Math.round(current));
  }, 400);
}

// ─── Share dialog ──────────────────────────────────────────────────────────────

function ShareRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        aria-label={label}
        className="flex-1 min-w-0 text-sm px-3 py-2 rounded-md border bg-muted/50 text-muted-foreground truncate outline-none"
      />
      <Button size="sm" variant="outline" onClick={copy} className="flex-shrink-0">
        {copied ? <Check className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}

function ShareDialog({
  open,
  onOpenChange,
  session,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: SessionSummary | SessionDetail | null;
}) {
  const [templateToken, setTemplateToken] = useState<string | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const { toast } = useToast();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  // Lazily mint the trainer-share token when the dialog opens.
  useEffect(() => {
    if (!open || !session) return;
    setTemplateToken(null);
    setLoadingTemplate(true);
    fetch(`/api/sessions/${session.id}/share-template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })
      .then((res) => { if (!res.ok) throw new Error(); return res.json(); })
      .then((data) => setTemplateToken(data.templateShareToken))
      .catch(() => toast({ variant: 'destructive', title: 'Error', description: 'Could not create the trainer link.' }))
      .finally(() => setLoadingTemplate(false));
  }, [open, session, toast]);

  if (!session) return null;

  const learnerUrl = `${origin}/session?token=${session.shareToken}`;
  const trainerUrl = templateToken ? `${origin}/import/${templateToken}` : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share “{session.title}”</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Share with learners */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-green-600" />
              <span className="font-semibold text-sm">Share with learners</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Send this link to the people taking part. They join and complete the live activities.
            </p>
            <ShareRow label="Learner link" url={learnerUrl} />
          </div>

          <div className="border-t" />

          {/* Share with another trainer */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-blue-600" />
              <span className="font-semibold text-sm">Share with another trainer</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Send this to another trainer. They’ll get their own copy of these activities to run with their own
              learners — none of your learner data is shared.
            </p>
            {loadingTemplate || !trainerUrl ? (
              <div className="h-[38px] rounded-md border bg-muted/50 animate-pulse" />
            ) : (
              <ShareRow label="Trainer link" url={trainerUrl} />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function Home() {
  const { logoutMutation, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(() => {
    // A ?session=<id> param (e.g. after importing a shared session) wins over
    // the last-viewed session persisted in localStorage.
    const fromQuery = new URLSearchParams(window.location.search).get('session');
    if (fromQuery && !isNaN(parseInt(fromQuery))) return parseInt(fromQuery);
    const stored = localStorage.getItem(LS_SESSION_KEY);
    return stored ? parseInt(stored) : null;
  });
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [wizardPrefill, setWizardPrefill] = useState<AdminConfig | undefined>(undefined);
  const [wizardStartType, setWizardStartType] = useState<string | undefined>(undefined);
  const [wizardFromAddDialog, setWizardFromAddDialog] = useState(false);
  const [isAddAgentOpen, setIsAddAgentOpen] = useState(false);
  const [isPreviewingTemplate, setIsPreviewingTemplate] = useState(false); // kept for wizard flow
  const [editingConfig, setEditingConfig] = useState<ChatConfig | null>(null);
  const [deletingConfig, setDeletingConfig] = useState<ChatConfig | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<number | null>(null);
  const [shareSession, setShareSession] = useState<SessionSummary | null>(null);
  const [controllingQuizId, setControllingQuizId] = useState<number | null>(null);
  const [agentOrderOverride, setAgentOrderOverride] = useState<ChatConfig[]>([]);
  const [libraryTypeFilter, setLibraryTypeFilter] = useState<AgentTypeFilter>('all');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsFile, setSuggestionsFile] = useState<{ name: string; slideCount?: number } | null>(null);
  const [slideContext, setSlideContext] = useState<string>('');
  const [suggestionsProgress, setSuggestionsProgress] = useState<number | null>(null);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const suggestionsInitializedForRef = useRef<number | null>(null);
  const subjectIdeasTriedForRef = useRef<number | null>(null);
  // The first-login session keeps the upload/paste widget visible while the user
  // builds inspiration ideas, unlike normal sessions. Cleared once they upload a
  // deck/link or create an activity manually. Persisted so a reload doesn't lose it.
  const [inspirationSessionId, setInspirationSessionId] = useState<number | null>(() => {
    const stored = localStorage.getItem(LS_INSPIRATION_KEY);
    return stored ? parseInt(stored) : null;
  });
  useEffect(() => {
    if (inspirationSessionId == null) localStorage.removeItem(LS_INSPIRATION_KEY);
    else localStorage.setItem(LS_INSPIRATION_KEY, String(inspirationSessionId));
  }, [inspirationSessionId]);
  const [linkInputValue, setLinkInputValue] = useState('');
  const slideFileInputRef = useRef<HTMLInputElement>(null);
  const buildingSuggestionIdRef = useRef<string | null>(null);
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [config, setConfig] = useState<AdminConfig>({
    title: '', type: 'chat', systemPrompt: 'Act as a...', userInstructions: '',
    feedbackCriteria: '', temperature: 0.7, maxTokens: 1000, questions: [],
  });

  const selectSession = (id: number) => {
    setSelectedSessionId(id);
    setAgentOrderOverride([]);
    setLibraryTypeFilter('all');
    setShowLinkInput(false);
    setLinkInputValue('');
    // Clear local state — DB data loaded via useEffect once selectedSession resolves
    suggestionsInitializedForRef.current = null;
    setSuggestions([]);
    setSuggestionsFile(null);
    setSlideContext('');
    localStorage.setItem(LS_SESSION_KEY, String(id));
  };

  const getInitials = (): string => {
    if (!user) return 'U';
    if (user.firstName) return `${user.firstName.charAt(0)}${(user.lastName || '').charAt(0)}`.toUpperCase();
    return user.email?.charAt(0).toUpperCase() ?? 'U';
  };

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: sessionList = [], isLoading: loadingSessions } = useQuery<SessionSummary[]>({
    queryKey: ['/api/sessions'],
    queryFn: async () => {
      const res = await fetch('/api/sessions');
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user?.id,
    refetchInterval: 30_000,
  });

  const regularSessions = sessionList.filter(s => !s.isLibrary);
  const librarySessions = sessionList.filter(s => s.isLibrary);

  // ── Presentations ─────────────────────────────────────────────────────────
  type PresentationSummary = { id: number; title: string; shareToken: string; createdAt: string };

  const createPresentation = useMutation({
    mutationFn: async (sessionId?: number) => {
      const res = await fetch('/api/presentations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: selectedSession?.title ?? 'New Presentation', sessionId }),
      });
      return res.json() as Promise<PresentationSummary>;
    },
    onSuccess: (pres) => {
      navigate(`/presentations/${pres.id}/edit`);
    },
  });

  // Auto-select on first load or after deletion
  useEffect(() => {
    if (loadingSessions || sessionList.length === 0) return;
    const ids = sessionList.map(s => s.id);
    if (selectedSessionId && ids.includes(selectedSessionId)) return;
    // Prefer first regular session, fall back to library
    const first = regularSessions[0] ?? librarySessions[0];
    if (first) selectSession(first.id);
  }, [sessionList, loadingSessions]);

  const { data: selectedSession, isLoading: loadingSession } = useQuery<SessionDetail | null>({
    queryKey: ['/api/sessions', selectedSessionId],
    queryFn: async () => {
      const res = await fetch(`/api/sessions/${selectedSessionId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!selectedSessionId,
    refetchInterval: 10_000,
    placeholderData: keepPreviousData,
  });

  // Initialize suggestions from DB when session data first loads
  useEffect(() => {
    if (!selectedSession || suggestionsInitializedForRef.current === selectedSession.id) return;
    suggestionsInitializedForRef.current = selectedSession.id;
    setSuggestions(selectedSession.suggestions ?? []);
    setSuggestionsFile(selectedSession.suggestionsFile ?? null);
    setSlideContext(selectedSession.slideContext ?? '');
  }, [selectedSession]);

  // Persist suggestions to DB whenever they change (after initialization)
  useEffect(() => {
    if (!selectedSessionId || suggestionsInitializedForRef.current !== selectedSessionId) return;
    const handle = setTimeout(() => {
      fetch(`/api/sessions/${selectedSessionId}/suggestions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestions, suggestionsFile, slideContext }),
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(handle);
  }, [selectedSessionId, suggestions, suggestionsFile, slideContext]);

  // New users (no onboardedAt) are sent through the onboarding flow first.
  // This is the single source of truth, so email + social sign-ups are both caught.
  useEffect(() => {
    if (user && user.onboardedAt == null) navigate('/onboarding');
  }, [user, navigate]);

  // A brand-new account: every session is still empty. We only show subject-based
  // starter ideas on this very first visit, never on later empty sessions.
  const isBrandNewAccount = !loadingSessions && sessionList.length > 0 && sessionList.every(s => s.configCount === 0);

  // When a brand-new user lands on the empty dashboard and has given us a subject,
  // generate a few starter activity ideas so they don't face a blank screen.
  // Reuses the same suggestions state/persistence as the slide flow.
  useEffect(() => {
    if (!selectedSession) return;
    // Only after suggestions have been initialised from the DB for this session.
    if (suggestionsInitializedForRef.current !== selectedSession.id) return;
    if (subjectIdeasTriedForRef.current === selectedSession.id) return;
    if (selectedSession.isLibrary) return;
    if (!isBrandNewAccount) return;
    if ((selectedSession.configs?.length ?? 0) > 0) return;
    if (suggestions.length > 0 || suggestionsProgress !== null) return;
    if (!user?.subject) return;

    subjectIdeasTriedForRef.current = selectedSession.id;
    setInspirationSessionId(selectedSession.id); // first-session inspiration mode
    const progressInterval = startProgressSimulation(setSuggestionsProgress);
    (async () => {
      try {
        const res = await fetch('/api/suggest-activities/from-subject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject: user.subject, context: user.context }),
        });
        if (!res.ok) throw new Error(await readApiError(res, 'Failed to generate ideas.'));
        const { suggestions: newSuggestions } = await res.json();
        clearInterval(progressInterval);
        setSuggestionsProgress(100);
        setTimeout(() => setSuggestionsProgress(null), 600);
        setSuggestions(newSuggestions ?? []);
        // Leave suggestionsFile null — these are subject ideas, not from a deck.
      } catch {
        // Silent: just fall back to the normal blank upload panel.
        clearInterval(progressInterval);
        setSuggestionsProgress(null);
      }
    })();
  }, [selectedSession, suggestions.length, suggestionsProgress, user, isBrandNewAccount]);

  // True during the brief gap between selecting a session and the query resolving
  const sessionLoading = loadingSession || (!!selectedSessionId && selectedSession?.id !== selectedSessionId);

  const isLibraryView = selectedSession?.isLibrary ?? false;

  const allSessionAgents = agentOrderOverride.length > 0 && selectedSession
    ? agentOrderOverride
    : (selectedSession?.configs ?? []);
  const hasSessionActivities = allSessionAgents.length > 0;

  const sessionAgents = isLibraryView && libraryTypeFilter !== 'all'
    ? allSessionAgents.filter(a => a.type === libraryTypeFilter)
    : allSessionAgents;

  // ── DnD ──────────────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const reorderAgents = useMutation({
    mutationFn: async (configIds: number[]) => {
      if (!selectedSessionId) return;
      await fetch(`/api/sessions/${selectedSessionId}/order`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configIds }),
      });
    },
  });

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    // Library view shows activities from all sessions — reordering would corrupt
    // session-specific ordering, so we disable it here.
    if (isLibraryView) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = allSessionAgents.findIndex(c => c.id === active.id);
    const newIndex = allSessionAgents.findIndex(c => c.id === over.id);
    const reordered = arrayMove(allSessionAgents, oldIndex, newIndex);
    setAgentOrderOverride(reordered);
    reorderAgents.mutate(reordered.map(c => c.id));
  }, [allSessionAgents, reorderAgents, isLibraryView]);

  // ── Slide suggestions ─────────────────────────────────────────────────────

  const handleSlideUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (file.size > MAX_SLIDE_UPLOAD_BYTES) {
      toast({
        variant: 'destructive',
        description: `That deck is too large. Please upload a PDF, PPT, or PPTX under ${MAX_SLIDE_UPLOAD_LABEL}.`,
      });
      return;
    }

    setInspirationSessionId(null); // a deck upload ends first-session inspiration mode
    setSuggestionsFile({ name: file.name });
    const progressInterval = startProgressSimulation(setSuggestionsProgress);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunk = 8192;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(i + chunk, bytes.length))));
      }
      const base64 = btoa(binary);
      const res = await fetch('/api/suggest-activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: base64, fileName: file.name }),
      });
      if (!res.ok) throw new Error(await readApiError(res, 'Failed to analyse slides.'));
      const { suggestions: newSuggestions, slideCount, slideContext: newCtx } = await res.json();
      clearInterval(progressInterval);
      setSuggestionsProgress(100);
      setTimeout(() => setSuggestionsProgress(null), 600);
      setSuggestions(newSuggestions);
      setSuggestionsFile({ name: file.name, slideCount });
      setSlideContext(newCtx ?? '');
    } catch (err: any) {
      clearInterval(progressInterval);
      setSuggestionsProgress(null);
      toast({ variant: 'destructive', description: err.message || 'Failed to analyse slides.' });
      setSuggestionsFile(null);
    }
  };

  const handleLinkSubmit = async () => {
    const trimmed = linkInputValue.trim();
    if (!trimmed) return;
    setInspirationSessionId(null); // a pasted link ends first-session inspiration mode
    setSuggestionsFile({ name: trimmed });
    const progressInterval = startProgressSimulation(setSuggestionsProgress);
    try {
      const res = await fetch('/api/suggest-activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      if (!res.ok) throw new Error(await readApiError(res, 'Failed to analyse slides.'));
      const { suggestions: newSuggestions, slideCount, slideContext: newCtx } = await res.json();
      clearInterval(progressInterval);
      setSuggestionsProgress(100);
      setTimeout(() => setSuggestionsProgress(null), 600);
      setSuggestions(newSuggestions);
      setSuggestionsFile({ name: trimmed, slideCount });
      setSlideContext(newCtx ?? '');
      setShowLinkInput(false);
      setLinkInputValue('');
    } catch (err: any) {
      clearInterval(progressInterval);
      setSuggestionsProgress(null);
      toast({ variant: 'destructive', description: err.message || 'Failed to analyse slides.' });
      setSuggestionsFile(null);
    }
  };

  const handleBuildSuggestion = async (suggestion: Suggestion) => {
    // Quiz suggestions can't be auto-built — questions aren't generated. Drop the
    // user straight into the quiz builder (wizard step 3) with the title prefilled
    // so they create the questions themselves.
    if (suggestion.type === 'quick-fire-quiz') {
      buildingSuggestionIdRef.current = suggestion.id;
      setWizardPrefill({
        title: suggestion.title,
        type: 'quick-fire-quiz',
        systemPrompt: '',
        userInstructions: '',
        feedbackCriteria: '',
        temperature: 0.7,
        maxTokens: 1000,
        quickFireQuestions: [],
        interactionMode: 'both',
      });
      setIsCreateOpen(true);
      return;
    }
    setBuildingId(suggestion.id);
    try {
      const res = await fetch('/api/build-suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestion, slideContext }),
      });
      if (!res.ok) throw new Error(await res.text());
      const detailed = await res.json();
      buildingSuggestionIdRef.current = suggestion.id;
      setWizardPrefill({
        ...detailed,
        temperature: 0.7,
        maxTokens: 1000,
        questions: [],
        interactionMode: 'both',
      });
      setIsCreateOpen(true);
    } catch (err: any) {
      toast({ variant: 'destructive', description: err.message || 'Failed to build activity.' });
    } finally {
      setBuildingId(null);
    }
  };

  // ── Session mutations ─────────────────────────────────────────────────────

  const createSession = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: todayTitle() }),
      });
      if (!res.ok) throw new Error('Failed to create session');
      return res.json() as Promise<SessionSummary>;
    },
    onSuccess: (newSession) => {
      track(EventName.SESSION_CREATED, {});
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
      selectSession(newSession.id);
    },
  });

  const updateSessionTitle = useMutation({
    mutationFn: async ({ id, title }: { id: number; title: string }) => {
      await fetch(`/api/sessions/${id}/title`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
    },
    // Update the title in the cache immediately so the sidebar and page header
    // change on Enter, rather than after the server round-trip.
    onMutate: async ({ id, title }) => {
      await queryClient.cancelQueries({ queryKey: ['/api/sessions'] });
      await queryClient.cancelQueries({ queryKey: ['/api/sessions', id] });
      const prevList = queryClient.getQueryData<SessionSummary[]>(['/api/sessions']);
      const prevDetail = queryClient.getQueryData<SessionDetail | null>(['/api/sessions', id]);
      queryClient.setQueryData<SessionSummary[]>(['/api/sessions'], (old) =>
        old?.map(s => s.id === id ? { ...s, title } : s));
      queryClient.setQueryData<SessionDetail | null>(['/api/sessions', id], (old) =>
        old ? { ...old, title } : old);
      return { prevList, prevDetail, id };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prevList !== undefined) queryClient.setQueryData(['/api/sessions'], ctx.prevList);
      if (ctx?.prevDetail !== undefined) queryClient.setQueryData(['/api/sessions', ctx.id], ctx.prevDetail);
    },
    onSettled: (_data, _err, vars) => {
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sessions', vars.id] });
    },
  });

  const duplicateSession = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/sessions/${id}/duplicate`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to duplicate session');
      return res.json() as Promise<SessionSummary>;
    },
    onSuccess: (newSession) => {
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
      selectSession(newSession.id);
      toast({ description: 'Session duplicated.' });
    },
    onError: () => toast({ variant: 'destructive', description: 'Failed to duplicate session.' }),
  });

  const deleteSession = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    },
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
      setDeletingSessionId(null);
      setSelectedSessionId(prev => {
        if (prev === deletedId) { localStorage.removeItem(LS_SESSION_KEY); return null; }
        return prev;
      });
      toast({ description: 'Session deleted.' });
    },
  });

  // ── Add activity to session ──────────────────────────────────────────────────

  const addToSession = useMutation({
    mutationFn: async ({ configId, sessionId }: { configId: number; sessionId: number }) => {
      await fetch(`/api/chat-configs/${configId}/session`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sessions', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['/api/sessions', selectedSessionId] });
      toast({ description: 'Activity added to session.' });
    },
    onError: () => toast({ variant: 'destructive', description: 'Failed to add agent to session.' }),
  });

  // ── Live toggle ───────────────────────────────────────────────────────────

  const toggleLive = useMutation({
    mutationFn: async ({ configId, isLive }: { configId: number; isLive: boolean }) => {
      await fetch(`/api/chat-configs/${configId}/live`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isLive }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/sessions', selectedSessionId] }),
  });

  // ── Agent CRUD ────────────────────────────────────────────────────────────

  const saveConfig = useMutation({
    mutationFn: async (configToSave?: AdminConfig) => {
      const c = configToSave || config;
      const response = await fetch('/api/chat-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: c.title,
          type: c.type,
          systemPrompt: c.type === 'quiz' ? 'Quiz Configuration' : c.systemPrompt,
          userInstructions: c.type === 'quiz' ? '' : c.userInstructions || '',
          feedbackCriteria: c.type === 'quiz' ? '' : c.feedbackCriteria || '',
          questions: c.type === 'quiz' ? c.questions : undefined,
          quickFireQuestions: c.type === 'quick-fire-quiz' ? c.quickFireQuestions : undefined,
          participant1Role: c.participant1Role ?? null,
          participant2Role: c.participant2Role ?? null,
          knowledgeLevel: c.knowledgeLevel ?? null,
          attitude: c.attitude ?? null,
          coachingStyle: c.coachingStyle ?? null,
          feedbackHarshness: c.feedbackHarshness ?? 'standard',
          referenceContent: c.referenceContent ?? null,
          referenceImages: c.referenceImages ?? null,
          interactionMode: c.interactionMode ?? 'both',
          groupBoardSettings: c.groupBoardSettings ?? null,
          sessionId: selectedSessionId,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save activity');
      }
      return response.json();
    },
    onSuccess: (data: any) => {
      track(EventName.GPT_CONFIRM_CREATION, {
        type: config.type,
        hasQuestions: config.type === 'quiz' && (config.questions?.length ?? 0) > 0,
        interactionMode: config.interactionMode ?? 'both',
      });
      // Optimistically add the new activity to the open session so it appears in
      // the list straight away, instead of waiting for the background refetch.
      if (data?.id && selectedSessionId) {
        queryClient.setQueryData<SessionDetail | null>(['/api/sessions', selectedSessionId], (old) => {
          if (!old) return old;
          if (old.configs?.some(c => c.id === data.id)) return old;
          const optimistic = { ...data, conversationCount: 0 } as ChatConfig;
          return { ...old, configs: [...(old.configs ?? []), optimistic], configCount: (old.configCount ?? 0) + 1 };
        });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sessions', selectedSessionId] });
      setAgentOrderOverride([]);
      setIsCreateOpen(false);
      setIsPreviewingTemplate(false);
      setIsAddAgentOpen(false);
      setConfig({ title: '', type: 'chat', systemPrompt: 'Act as a...', userInstructions: '', feedbackCriteria: '', temperature: 0.7, maxTokens: 1000, questions: [] });
      // Capture the id first: the setSuggestions updater runs asynchronously, so
      // reading the ref inside it would see the null we set on the next line.
      const builtId = buildingSuggestionIdRef.current;
      if (builtId) {
        // Built from an inspiration idea — drop it from the list, keep the
        // upload widget (first-session inspiration mode stays active).
        setSuggestions(prev => prev.filter(s => s.id !== builtId));
        buildingSuggestionIdRef.current = null;
      } else {
        // Created manually — first-session inspiration mode ends here.
        setInspirationSessionId(null);
      }
      toast({ description: 'Activity saved successfully!' });
    },
    onError: (error: Error) => toast({ variant: 'destructive', title: 'Error', description: error.message }),
  });

  const updateConfig = useMutation({
    mutationFn: async (configToUpdate: ChatConfig) => {
      const response = await fetch(`/api/chat-configs/${configToUpdate.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configToUpdate),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update activity');
      }
      return response.json();
    },
    onSuccess: () => {
      track(EventName.ACTIVITY_EDITED, { type: editingConfig?.type, configId: editingConfig?.id });
      queryClient.invalidateQueries({ queryKey: ['/api/sessions', selectedSessionId] });
      setEditingConfig(null);
      toast({ description: 'Activity updated successfully!' });
    },
    onError: (error: Error) => toast({ variant: 'destructive', title: 'Error', description: error.message }),
  });

  const deleteConfig = useMutation({
    mutationFn: async (configToDelete: ChatConfig) => {
      const response = await fetch(`/api/chat-configs/${configToDelete.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete activity');
      }
      return response.json();
    },
    onSuccess: () => {
      track(EventName.ACTIVITY_DELETED, { type: deletingConfig?.type, configId: deletingConfig?.id });
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sessions', selectedSessionId] });
      setAgentOrderOverride([]);
      setDeletingConfig(null);
      toast({ description: 'Activity deleted successfully!' });
    },
    onError: (error: Error) => toast({ variant: 'destructive', title: 'Error', description: error.message }),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCopyLink = async (configId: number) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/chat?configId=${configId}`);
      track(EventName.GPT_SHARE_LINK, { configId });
      const stored = JSON.parse(localStorage.getItem('womble_shared_links') || '{}');
      stored[configId] = Date.now();
      localStorage.setItem('womble_shared_links', JSON.stringify(stored));
      toast({ description: 'Link copied to clipboard!' });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to copy link' });
    }
  };

  const handleViewFeedback = (configToView: ChatConfig) => {
    if (configToView.type === 'two-way-conversation') {
      window.open(`${window.location.origin}/dual-analysis?configId=${configToView.id}`, '_blank');
    } else {
      window.open(`${window.location.origin}/analysis?configId=${configToView.id}`, '_blank');
    }
  };

  const handleViewSessionFeedback = () => {
    if (!selectedSession) return;
    window.open(`${window.location.origin}/session-analysis?token=${selectedSession.shareToken}`, '_blank');
  };

  const handleDuplicateAgent = async (configToDuplicate: ChatConfig) => {
    track(EventName.ACTIVITY_DUPLICATED, { type: configToDuplicate.type, configId: configToDuplicate.id });
    try {
      let fullConfig = configToDuplicate;
      if (configToDuplicate.type === 'quiz' || configToDuplicate.type === 'quick-fire-quiz') {
        const response = await fetch(`/api/chat-configs/${configToDuplicate.id}`);
        if (!response.ok) throw new Error('Failed to fetch full config');
        fullConfig = await response.json();
      }
      setWizardPrefill({
        title: `${fullConfig.title} (Copy)`,
        type: fullConfig.type,
        systemPrompt: fullConfig.systemPrompt,
        userInstructions: fullConfig.userInstructions || '',
        feedbackCriteria: fullConfig.feedbackCriteria || '',
        temperature: 0.7,
        maxTokens: 1000,
        questions: fullConfig.questions || [],
      });
      setIsCreateOpen(true);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to duplicate activity' });
    }
  };

  const handleTemplateSelect = async (template: Template) => {
    track(EventName.TEMPLATE_USED, { templateId: template.id, type: template.type });
    try {
      let fullConfig = template;
      if (template.type === 'quiz') {
        const response = await fetch(`/api/chat-configs/${template.id}`);
        if (!response.ok) throw new Error('Failed to fetch full template config');
        fullConfig = await response.json();
      }
      setWizardPrefill({
        title: `${fullConfig.title} (Copy)`,
        type: fullConfig.type,
        systemPrompt: fullConfig.systemPrompt,
        userInstructions: fullConfig.userInstructions || '',
        feedbackCriteria: fullConfig.feedbackCriteria || '',
        temperature: 0.7,
        maxTokens: 1000,
        questions: fullConfig.questions || [],
      });
      setIsPreviewingTemplate(true);
      setIsCreateOpen(true);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load template' });
    }
  };

  const handleDuplicateFromDialog = async (agent: { id: number; title: string; type: string; userInstructions: string | null; systemPrompt: string }) => {
    try {
      let fullConfig: any = agent;
      if (agent.type === 'quiz' || agent.type === 'quick-fire-quiz') {
        const response = await fetch(`/api/chat-configs/${agent.id}`);
        if (!response.ok) throw new Error('Failed to fetch full config');
        fullConfig = await response.json();
      }
      setWizardPrefill({
        title: `${fullConfig.title} (Copy)`,
        type: fullConfig.type,
        systemPrompt: fullConfig.systemPrompt,
        userInstructions: fullConfig.userInstructions || '',
        feedbackCriteria: fullConfig.feedbackCriteria || '',
        temperature: 0.7,
        maxTokens: 1000,
        questions: fullConfig.questions || [],
      });
      setWizardFromAddDialog(true);
      setIsAddAgentOpen(false);
      setIsCreateOpen(true);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to duplicate activity' });
    }
  };

  const handleCreateModalClose = (open: boolean) => {
    setIsCreateOpen(open);
    if (!open) {
      // Cancelled without saving — forget any in-progress build so a later save
      // doesn't wrongly treat itself as that build.
      buildingSuggestionIdRef.current = null;
      setWizardPrefill(undefined);
      setWizardStartType(undefined);
      setWizardFromAddDialog(false);
      if (isPreviewingTemplate) {
        setIsPreviewingTemplate(false);
        setIsAddAgentOpen(true);
      }
    }
  };

  const handleEditConfig = async (configToEdit: ChatConfig) => {
    try {
      const response = await fetch(`/api/chat-configs/${configToEdit.id}`);
      if (!response.ok) throw new Error('Failed to fetch full config');
      setEditingConfig(await response.json());
    } catch (error) {
      console.error(error);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="app-shell flex h-screen overflow-hidden">

      {/* ── Left Sidebar ─────────────────────────────────────── */}
      <aside className="app-sidebar w-64 flex-shrink-0 flex flex-col border-r">

        {/* Logo */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2.5 px-4 py-5 border-b w-full hover:bg-accent transition-colors">
              <img src="/womble-icon.svg" alt="Womble" className="h-8 w-8" />
              <span className="text-xl font-bold text-primary">Womble</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-72 p-3 ml-2" side="right" align="start">
            <div className="space-y-2">
              <h4 className="font-bold">Womble</h4>
              <p className="text-sm">
                <span className="italic text-muted-foreground">noun</span><br />
                A fictional animal inhabiting Wimbledon Common, characterised as clearing up litter.
              </p>
              <p className="text-sm">
                <span className="italic text-muted-foreground">verb (informal)</span><br />
                Wander in a casual or relaxed way.
              </p>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Action buttons */}
        <div className="px-3 pt-4 pb-3 flex flex-col gap-2">
          <Button
            onClick={() => createSession.mutate()}
            disabled={createSession.isPending}
            className="w-full justify-start"
          >
            <Plus className="h-4 w-4 flex-shrink-0" />
            New Session
          </Button>
        </div>

        {/* Sessions section */}
        <div className="flex-1 overflow-y-auto">
          {regularSessions.length > 0 && (
            <div className="px-3 pb-1 pt-1">
              <p className="app-section-label">Sessions</p>
              <div className="space-y-0.5">
                {regularSessions.map(session => (
                  <SessionSidebarItem
                    key={session.id}
                    session={session}
                    isSelected={session.id === selectedSessionId}
                    onSelect={() => selectSession(session.id)}
                    onDuplicate={() => duplicateSession.mutate(session.id)}
                    onDelete={() => setDeletingSessionId(session.id)}
                    onRename={(title) => updateSessionTitle.mutate({ id: session.id, title })}
                    onShare={() => setShareSession(session)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* My Activities section */}
          {librarySessions.length > 0 && (
            <div className="px-3 pt-3 pb-2">
              <p className="app-section-label">Activities</p>
              <div className="space-y-0.5">
                {librarySessions.map(session => (
                  <SessionSidebarItem
                    key={session.id}
                    session={session}
                    isSelected={session.id === selectedSessionId}
                    onSelect={() => selectSession(session.id)}
                    onDuplicate={() => {}}
                    onDelete={() => {}}
                    onRename={(title) => updateSessionTitle.mutate({ id: session.id, title })}
                    onShare={() => {}}
                  />
                ))}
              </div>
            </div>
          )}

          {loadingSessions && (
            <p className="text-xs text-muted-foreground px-5 py-3">Loading...</p>
          )}

        </div>

        {/* User + logout */}
        <div className="border-t p-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                {getInitials()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="w-full text-left rounded p-1 -m-1 hover:bg-muted transition-colors">
                    <p className="text-sm font-medium text-foreground truncate">
                      {user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user?.email}
                    </p>
                    {user?.firstName && (
                      <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-48">
                  <DropdownMenuItem onClick={() => navigate('/settings')}>
                    <Settings className="h-4 w-4 mr-2" /> Settings
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <button
              onClick={() => logoutMutation.mutate()}
              title="Log out"
              className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Content ──────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        {sessionLoading && selectedSessionId ? (
          <div className="max-w-3xl mx-auto px-8 py-8">
            <div className="h-8 w-48 bg-gray-100 rounded animate-pulse mb-6" />
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          </div>
        ) : !selectedSession ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <Layers className="h-12 w-12 text-gray-200 mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">No session selected</h2>
            <p className="text-sm text-gray-500 mb-6 max-w-xs">
              Create a new session to organise your agents and share a single link with participants.
            </p>
            <Button onClick={() => createSession.mutate()}>
              <Plus className="h-4 w-4 mr-2" />New Session
            </Button>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-8 py-8">

            {/* Session header */}
            <div className="flex items-center gap-3 mb-6 flex-wrap">
              <EditableTitle
                title={selectedSession.title}
                onSave={(title) => updateSessionTitle.mutate({ id: selectedSession.id, title })}
              />
              {!isLibraryView && hasSessionActivities && (
                <>
                  {/* Right-side actions */}
                  <div className="flex gap-2 ml-auto">
                    <Button size="sm" variant="outline" onClick={handleViewSessionFeedback}>
                      <BarChart2 className="h-3.5 w-3.5 mr-1.5" />View feedback
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        track(EventName.GPT_CREATE_CLICK, { location: 'session_header' });
                        setIsAddAgentOpen(true);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" />Add activity
                    </Button>
                    <Button size="sm" onClick={() => setShareSession(selectedSession)}>
                      <Share2 className="h-3.5 w-3.5 mr-1.5" />Share
                    </Button>
                  </div>
                </>
              )}
            </div>

            {/* Type filter — library view only */}
            {isLibraryView && (
              <div className="flex flex-wrap gap-1.5 mb-5">
                {AGENT_TYPE_FILTERS.map(({ type, label }) => {
                  const count = type === 'all'
                    ? allSessionAgents.length
                    : allSessionAgents.filter(a => a.type === type).length;
                  if (type !== 'all' && count === 0) return null;
                  return (
                    <button
                      key={type}
                      onClick={() => setLibraryTypeFilter(type)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        libraryTypeFilter === type
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      }`}
                    >
                      {label} <span className="opacity-70">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Hidden file input */}
            <input
              ref={slideFileInputRef}
              type="file"
              accept=".pdf,.pptx,.ppt"
              className="hidden"
              onChange={handleSlideUpload}
            />

            {/* Agents */}
            {sessionLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : isLibraryView && sessionAgents.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-10 text-center">
                <p className="text-sm text-gray-400">No activities match this filter.</p>
              </div>
            ) : (
              <>
                {/* Existing agents */}
                {sessionAgents.length > 0 && (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={sessionAgents.map(c => c.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-3">
                        {sessionAgents.map((cfg) => (
                          <SortableAgentCard
                            key={cfg.id}
                            config={cfg}
                            isLibraryView={isLibraryView}
                            sessions={regularSessions}
                            onToggleLive={(isLive) => toggleLive.mutate({ configId: cfg.id, isLive })}
                            onEdit={() => handleEditConfig(cfg)}
                            onDelete={() => setDeletingConfig(cfg)}
                            onCopyLink={() => handleCopyLink(cfg.id)}
                            onViewFeedback={() => handleViewFeedback(cfg)}
                            onDuplicate={() => handleDuplicateAgent(cfg)}
                            onAddToSession={(sessionId) => addToSession.mutate({ configId: cfg.id, sessionId })}
                            onControlQuiz={cfg.type === 'quick-fire-quiz' ? () => setControllingQuizId(cfg.id) : undefined}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}

                {/* Upload/paste panel. Normally empty-dashboard only, but on the
                    first-login session it persists through building inspiration
                    ideas — until a deck/link upload or a manual activity. Hidden
                    once deck suggestions are showing. */}
                {!isLibraryView && !(suggestions.length > 0 && suggestionsFile && suggestionsProgress === null) && (sessionAgents.length === 0 || (inspirationSessionId != null && inspirationSessionId === selectedSessionId) || suggestionsProgress !== null) && (
                  <div className={sessionAgents.length > 0 ? 'mt-6' : ''}>
                    <div className="border-2 border-dashed border-border rounded-lg p-8 bg-card/60">
                      {suggestionsProgress !== null ? (
                        <div className="text-center py-4">
                          <div className="relative w-16 h-16 mx-auto mb-3">
                            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                              <circle cx="32" cy="32" r="26" fill="none" stroke="#e5e7eb" strokeWidth="5" />
                              <circle cx="32" cy="32" r="26" fill="none" stroke="hsl(var(--primary))" strokeWidth="5"
                                strokeDasharray={`${2 * Math.PI * 26}`}
                                strokeDashoffset={`${2 * Math.PI * 26 * (1 - suggestionsProgress / 100)}`}
                                strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.4s ease' }}
                              />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-gray-700">
                              {suggestionsProgress}%
                            </span>
                          </div>
                          <p className="text-sm text-gray-500">
                            {!suggestionsFile && user?.subject
                              ? 'Confabulating ideas for activities…'
                              : suggestionsProgress < 20 ? 'Reading slides…' : suggestionsProgress < 75 ? 'Analysing content…' : 'Generating suggestions…'}
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-center mb-4">
                            <div className="app-icon-surface w-12 h-12">
                              <Sparkles className="h-5 w-5 text-gray-600" />
                            </div>
                          </div>
                          <h3 className="text-base font-semibold text-gray-800 text-center mb-1">
                            Generate activities from your slides
                          </h3>
                          <p className="text-sm text-gray-500 text-center mb-5 max-w-xs mx-auto">
                            Upload a slide deck or paste a link and Womble will suggest activities based on your content
                          </p>
                          {showLinkInput ? (
                            <div className="max-w-sm mx-auto space-y-2">
                              <div className="flex gap-2">
                                <input
                                  autoFocus
                                  type="url"
                                  value={linkInputValue}
                                  onChange={e => setLinkInputValue(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') handleLinkSubmit(); if (e.key === 'Escape') setShowLinkInput(false); }}
                                  placeholder="Google Slides link (set to Anyone can view)"
                                  className="flex-1 text-sm border border-input bg-card rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                                />
                                <Button size="sm" onClick={handleLinkSubmit} className="flex-shrink-0">Go</Button>
                                <Button size="sm" variant="ghost" onClick={() => setShowLinkInput(false)} className="flex-shrink-0"><X className="h-4 w-4" /></Button>
                              </div>
                              {linkInputValue.includes('gamma.app') && (
                                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                  Gamma decks work best as PDFs — export yours and upload it instead.
                                </p>
                              )}
                            </div>
                          ) : (
                            <div className="flex gap-3 justify-center">
                              <Button variant="outline" size="sm" onClick={() => slideFileInputRef.current?.click()}>
                                <Upload className="h-3.5 w-3.5 mr-1.5" />Upload deck
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => setShowLinkInput(true)}>
                                <Link2 className="h-3.5 w-3.5 mr-1.5" />Paste link
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {/* Manual-add only when there are no ideas below to offer it */}
                    {suggestions.length === 0 && (
                      <div className="text-center mt-5">
                        <span className="text-xs text-gray-400 block mb-2">or</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            track(EventName.GPT_CREATE_CLICK, { location: 'empty_state' });
                            setIsAddAgentOpen(true);
                          }}
                        >
                          <Plus className="h-4 w-4 mr-1.5" />Add activity manually
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Suggestions — deck-based or subject-based starter ideas. Persist
                    until dismissed or replaced by a fresh deck/link upload. Hidden
                    while a deck is processing so only the spinner shows (the cards
                    return untouched if that upload fails). */}
                {!isLibraryView && suggestions.length > 0 && suggestionsProgress === null && (
                  <div className="mt-6">
                    {suggestionsFile && (
                      <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 mb-4 text-sm text-gray-600">
                        <FileText className="h-4 w-4 flex-shrink-0 text-gray-400" />
                        <span className="flex-1 truncate">{suggestionsFile.name}</span>
                        {suggestionsFile.slideCount && (
                          <span className="text-xs bg-white border border-gray-200 rounded-full px-2 py-0.5 flex-shrink-0">
                            {suggestionsFile.slideCount} slides analysed
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold text-gray-700">
                        {suggestionsFile
                          ? `${suggestions.length} suggested ${suggestions.length === 1 ? 'activity' : 'activities'}`
                          : 'Get inspiration from these ideas'}
                      </p>
                      <button
                        onClick={() => { setSuggestions([]); setSuggestionsFile(null); }}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        Dismiss all
                      </button>
                    </div>
                    <div className="space-y-3">
                      {suggestions.map(s => (
                        <SuggestionCard
                          key={s.id}
                          suggestion={s}
                          isBuilding={buildingId === s.id}
                          onBuild={() => handleBuildSuggestion(s)}
                          onDismiss={() => setSuggestions(prev => prev.filter(x => x.id !== s.id))}
                        />
                      ))}
                    </div>
                    <div className="text-center mt-5">
                      <span className="text-xs text-gray-400 block mb-2">or</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          track(EventName.GPT_CREATE_CLICK, { location: 'after_suggestions' });
                          setIsAddAgentOpen(true);
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1.5" />Add activity manually
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {/* ── Dialogs ───────────────────────────────────────────── */}

      <ShareDialog
        open={!!shareSession}
        onOpenChange={(open) => { if (!open) setShareSession(null); }}
        session={shareSession}
      />

      <Dialog open={isAddAgentOpen} onOpenChange={(open) => {
        setIsAddAgentOpen(open);
        if (!open) queryClient.invalidateQueries({ queryKey: ['/api/sessions', selectedSessionId] });
      }}>
        <DialogContent className="max-w-2xl h-[80vh] flex flex-col">
          <AddAgentDialog
            onSelectTemplate={handleTemplateSelect}
            onDuplicate={handleDuplicateFromDialog}
            onTypeSelected={(type) => {
              setWizardPrefill(undefined);
              setWizardStartType(type);
              setWizardFromAddDialog(true);
              setIsAddAgentOpen(false);
              setIsCreateOpen(true);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateOpen} onOpenChange={(open) => {
        handleCreateModalClose(open);
        if (!open) queryClient.invalidateQueries({ queryKey: ['/api/sessions', selectedSessionId] });
      }}>
        <DialogContent className="max-w-2xl h-[85vh] flex flex-col">
          <DialogHeader><DialogTitle>Create New Activity</DialogTitle></DialogHeader>
          <ScrollArea className="flex-1 -mx-6 pl-6 pr-4">
            <div className="py-4 pr-2">
              <CreateGptWizard
                key={isCreateOpen ? 'open' : 'closed'}
                onSave={(finalConfig) => saveConfig.mutate(finalConfig)}
                isSaving={saveConfig.isPending}
                prefill={wizardPrefill}
                startType={wizardPrefill ? undefined : (wizardStartType as any)}
                onBack={wizardFromAddDialog ? () => { setIsCreateOpen(false); setIsAddAgentOpen(true); } : undefined}
              />
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {editingConfig && (
        <Dialog open={editingConfig !== null} onOpenChange={(open) => {
          if (!open) { setEditingConfig(null); queryClient.invalidateQueries({ queryKey: ['/api/sessions', selectedSessionId] }); }
        }}>
          <DialogContent className="max-w-2xl h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Edit Activity</DialogTitle>
              <DialogDescription>Modify your activity configuration below.</DialogDescription>
            </DialogHeader>
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="py-4">
                {editingConfig.type === 'quiz' ? (
                  <QuizEditor
                    config={{ title: editingConfig.title, type: editingConfig.type, systemPrompt: editingConfig.systemPrompt, userInstructions: editingConfig.userInstructions || '', feedbackCriteria: editingConfig.feedbackCriteria || '', temperature: 0.7, maxTokens: 1000, questions: editingConfig.questions || [] }}
                    onConfigChange={(u) => setEditingConfig(prev => prev ? { ...prev, title: u.title, questions: u.questions } : null)}
                  />
                ) : editingConfig.type === 'quick-fire-quiz' ? (
                  <QuickFireQuizEditor
                    config={{ ...editingConfig, temperature: 0.7, maxTokens: 1000, userInstructions: editingConfig.userInstructions || '', feedbackCriteria: editingConfig.feedbackCriteria || '', questions: [] }}
                    onConfigChange={(u) => setEditingConfig(prev => prev ? { ...prev, title: u.title, quickFireQuestions: u.quickFireQuestions } : null)}
                  />
                ) : (
                  <AdminPanel
                    config={{ title: editingConfig.title, type: editingConfig.type, systemPrompt: editingConfig.systemPrompt, userInstructions: editingConfig.userInstructions || '', feedbackCriteria: editingConfig.feedbackCriteria || '', feedbackHarshness: editingConfig.feedbackHarshness ?? 'standard', temperature: 0.7, maxTokens: 1000, questions: editingConfig.questions || [], interactionMode: editingConfig.interactionMode ?? 'both', coachingStyle: editingConfig.coachingStyle ?? undefined, knowledgeLevel: editingConfig.knowledgeLevel ?? undefined, attitude: editingConfig.attitude ?? undefined, referenceContent: editingConfig.referenceContent ?? undefined }}
                    onConfigChange={(u) => setEditingConfig({ ...editingConfig, title: u.title, type: u.type, systemPrompt: u.systemPrompt, userInstructions: u.userInstructions || null, feedbackCriteria: u.feedbackCriteria || null, feedbackHarshness: u.feedbackHarshness, questions: u.questions || [], interactionMode: u.interactionMode ?? 'both', coachingStyle: u.coachingStyle ?? null, knowledgeLevel: u.knowledgeLevel ?? null, attitude: u.attitude ?? null, referenceContent: u.referenceContent ?? null })}
                    isEditMode={true}
                  />
                )}
              </div>
            </ScrollArea>
            <div className="pt-4 border-t flex justify-end">
              <Button onClick={() => editingConfig && updateConfig.mutate(editingConfig)} disabled={updateConfig.isPending}>
                Update Agent
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={deletingConfig !== null} onOpenChange={(open) => { if (!open) setDeletingConfig(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deletingConfig?.title}" and all associated conversations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingConfig && deleteConfig.mutate(deletingConfig)} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deletingSessionId !== null} onOpenChange={(open) => { if (!open) setDeletingSessionId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete session?</AlertDialogTitle>
            <AlertDialogDescription>
              The session will be deleted. Agents inside will not be deleted — their feedback remains accessible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingSessionId !== null && deleteSession.mutate(deletingSessionId)} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {controllingQuizId !== null && (
        <QuickFireQuizAdminControl
          configId={controllingQuizId}
          shareToken={selectedSession?.shareToken}
          open={true}
          onClose={() => setControllingQuizId(null)}
        />
      )}
    </div>
  );
}

// ── Suggestion card ───────────────────────────────────────────────────────────

const SUGGESTION_ICON_MAP: Record<string, React.ElementType> = {
  chat: MessageSquare,
  'two-way-conversation': Users,
  'teach-ai': GraduationCap,
  'thought-partner': Brain,
  'quick-fire-quiz': Zap,
  'group-board': LayoutGrid,
  'user-tester': Monitor,
  'doc-critique': FileText,
  'task-walkthrough': ClipboardList,
  quiz: HelpCircle,
  upload: Upload,
};

const SUGGESTION_TYPE_LABEL: Record<string, string> = {
  chat: 'Conversation with AI',
  'two-way-conversation': 'Two-way Conversation',
  'teach-ai': 'Teach an AI',
  'thought-partner': 'Thought Partner',
  'quick-fire-quiz': 'Quick Fire Quiz',
  'group-board': 'Group Board',
  'user-tester': 'User Tester',
  'doc-critique': 'Critique a Document',
  'task-walkthrough': 'Task Walkthrough',
  quiz: 'Quiz',
  upload: 'Document Review',
};

const SUGGESTION_ICON_COLOR: Record<string, string> = {
  chat: 'bg-green-50 text-green-600',
  'two-way-conversation': 'bg-orange-50 text-orange-600',
  'teach-ai': 'bg-blue-50 text-blue-600',
  'thought-partner': 'bg-teal-50 text-teal-600',
  'quick-fire-quiz': 'bg-amber-50 text-amber-600',
  'group-board': 'bg-emerald-50 text-emerald-600',
  'user-tester': 'bg-violet-50 text-violet-600',
  'doc-critique': 'bg-blue-50 text-blue-600',
  'task-walkthrough': 'bg-cyan-50 text-cyan-600',
  quiz: 'bg-gray-50 text-gray-600',
  upload: 'bg-purple-50 text-purple-600',
};

function SuggestionCard({
  suggestion,
  isBuilding,
  onBuild,
  onDismiss,
}: {
  suggestion: Suggestion;
  isBuilding: boolean;
  onBuild: () => void;
  onDismiss: () => void;
}) {
  const Icon = SUGGESTION_ICON_MAP[suggestion.type] ?? MessageSquare;
  const label = SUGGESTION_TYPE_LABEL[suggestion.type] ?? suggestion.type;
  const iconColor = SUGGESTION_ICON_COLOR[suggestion.type] ?? 'bg-gray-50 text-gray-600';

  return (
    <div className="flex items-start gap-3 bg-card border border-border rounded-lg px-4 py-4 shadow-sm">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${iconColor}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <span className={`text-xs font-medium ${iconColor.split(' ')[1]} mb-1 block`}>{label}</span>
        <p className="text-sm font-semibold text-gray-800 mb-0.5">{suggestion.title}</p>
        <p className="text-sm text-gray-500 leading-snug">{suggestion.description}</p>
        {suggestion.slideReference && (
          <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
            <FileText className="h-3 w-3" />{suggestion.slideReference}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-2 mt-0.5">
        <Button size="sm" onClick={onBuild} disabled={isBuilding} className="h-8 px-3 min-w-[64px]">
          {isBuilding
            ? <div className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
            : 'Build'}
        </Button>
        <button onClick={onDismiss} disabled={isBuilding} className="text-gray-300 hover:text-gray-500 transition-colors disabled:opacity-30">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
