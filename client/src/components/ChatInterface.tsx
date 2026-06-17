import { useState, useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Lightbulb, Info, X, Trophy, ChevronDown, Loader2, Brain, Copy, Check, Mic, Keyboard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import MessageBubble from "./MessageBubble";
import UserNameModal from "./UserNameModal";
import LeaderboardModal from "./LeaderboardModal";
import ThinkingMapModal from "./ThinkingMapModal";
import type { Message, ChatState, AdminConfig, MessageContent } from "@/lib/types";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { track, EventName } from "@/lib/mixpanel";


interface ThinkingMap {
  keyThemes: string[];
  insights: string[];
  openQuestions: string[];
  nextSteps: string[];
}

interface AttemptData {
  attemptNumber: number;
  chatMode: string | null;
  feedback: { bullets: string[]; score?: number | null; summary?: string | null; thinkingMap?: ThinkingMap } | null;
}

interface Props {
  config: AdminConfig;
  sessionId: string;
  userName: string | null;
  isViewOnly: boolean;
  attemptNumber?: number;
  onUserNameSubmit: (name: string, mode?: 'typed' | 'spoken') => string;
  onSwitchMode?: (mode: 'typed' | 'spoken') => void;
}

interface LeaderboardEntry {
  userName: string;
  score: number;
  total: number;
  rank?: number;
  isTied?: boolean;
  isCurrentUser: boolean;
}

export default function ChatInterface({ config, sessionId, userName, isViewOnly, attemptNumber = 1, onUserNameSubmit, onSwitchMode }: Props) {
  const [input, setInput] = useState("");
  const [pastedImage, setPastedImage] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [currentUserEntry, setCurrentUserEntry] = useState<LeaderboardEntry | null>(null);
  const [userRank, setUserRank] = useState<number>();
  const inputRef = useRef<HTMLInputElement>(null);
  const [feedbackData, setFeedbackData] = useState<{ bullets: string[]; score?: number; summary?: string }>({ bullets: [] });
  const [allAttempts, setAllAttempts] = useState<AttemptData[]>([]);
  const [isGettingHint, setIsGettingHint] = useState(false);
  const [isConfirmingFeedback, setIsConfirmingFeedback] = useState(false);
  const [isGettingFeedback, setIsGettingFeedback] = useState(false);
  const [isGettingSummary, setIsGettingSummary] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [copiedFeedback, setCopiedFeedback] = useState(false);

  const isThoughtPartner = (config.type as string) === 'thought-partner';
  const [confirmSwitchMode, setConfirmSwitchMode] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showNameModal, setShowNameModal] = useState(!isViewOnly && !userName);

  const messagesQueryKey = `/api/messages?configId=${config.id}&sessionId=${sessionId}&attempt=${attemptNumber}`;
  const { data: chatState = { messages: [], isLoading: false, error: null } } = useQuery<ChatState>({
    queryKey: [messagesQueryKey],
    enabled: !!config.id && !!sessionId,
  });

  const { data: existingAttempts = [] } = useQuery<AttemptData[]>({
    queryKey: [`/api/conversations/${config.id}/session/${sessionId}`],
    enabled: !!config.id && !!sessionId,
  });

  const existingAttempt = existingAttempts.find(a => a.attemptNumber === attemptNumber) ?? existingAttempts[0];
  const isComplete = isThoughtPartner
    ? summaryData !== null || existingAttempt?.feedback?.thinkingMap != null
    : feedbackData.score !== undefined || (existingAttempt?.feedback?.score != null);
  const displayFeedback = feedbackData.score !== undefined ? feedbackData : existingAttempt?.feedback ?? null;
  const displayThinkingMap: ThinkingMap | null = summaryData ?? existingAttempt?.feedback?.thinkingMap ?? null;

  const hasEnoughMessages = chatState.messages.length >= 5;

  const getHint = async () => {
    if (!config.feedbackCriteria) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No feedback criteria specified for this chat."
      });
      return;
    }

    track(EventName.HINT_REQUESTED, { type: config.type, configId: config.id });
    try {
      setIsGettingHint(true);
      const response = await fetch("/api/chat-hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedbackCriteria: config.feedbackCriteria,
          userInstructions: config.userInstructions,
          messages: chatState.messages
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const hint = await response.json();
      toast({
        title: "Hint",
        description: hint.message,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to get hint",
      });
    } finally {
      setIsGettingHint(false);
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const params = new URLSearchParams();
      if (sessionId) params.set('sessionId', sessionId);
      if (userName) params.set('userName', userName);
      const response = await fetch(`/api/final-leaderboard/${config.id}?${params}`);
      if (!response.ok) throw new Error('Failed to fetch leaderboard data');

      const { entries, currentUserEntry: cue } = await response.json();
      setLeaderboardData(entries);
      setCurrentUserEntry(cue || null);
      if (cue?.rank) setUserRank(cue.rank);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load leaderboard data",
      });
    }
  };

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      // Register participant on first message (not on name entry)
      if (!hasRegistered.current && userName && config.id && !isViewOnly) {
        hasRegistered.current = true;
        track(EventName.SESSION_STARTED_TYPED, { type: config.type, configId: config.id });
        fetch('/api/conversations/save-transcript', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ configId: config.id, sessionId, userName, chatMode: 'typed', messages: [], attemptNumber }),
        }).catch(() => {});
      }

      const url = new URL("/api/messages", window.location.origin);
      url.searchParams.set('configId', config.id?.toString() || '');
      url.searchParams.set('sessionId', sessionId);
      url.searchParams.set('chatMode', 'typed');
      if (userName) {
        url.searchParams.set('userName', userName);
      }

      const messageContent: MessageContent = {
        text: content,
        image: pastedImage
      };

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: messageContent, config }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const userMessage: Message = {
        id: crypto.randomUUID(),
        content: messageContent,
        role: 'user',
        timestamp: Date.now(),
        sessionId
      };

      queryClient.setQueryData<ChatState>([messagesQueryKey], (old) => ({
        messages: [...(old?.messages || []), userMessage],
        isLoading: false,
        error: null
      }));

      let assistantMessage: Message = {
        id: '',
        content: '',
        role: 'assistant',
        timestamp: Date.now(),
        sessionId
      };

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("Failed to read response");
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(5);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.error) throw new Error(parsed.error);

              if (!assistantMessage.id) {
                assistantMessage.id = parsed.messageId;
              }

              assistantMessage.content += parsed.content;

              queryClient.setQueryData<ChatState>([messagesQueryKey], (old) => {
                const existingMessages = old?.messages || [];
                const updatedMessages = existingMessages.filter(m => m.id !== assistantMessage.id);
                return {
                  messages: [...updatedMessages, { ...assistantMessage }],
                  isLoading: false,
                  error: null
                };
              });
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }

      return { success: true };
    },
    onSuccess: () => {
      setInput("");
      setPastedImage(null);
      inputRef.current?.focus();
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() || pastedImage) {
      sendMessage.mutate(input.trim());
    } else {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please provide either a message or an image",
      });
    }
  };

  useEffect(() => {
    const scrollToBottom = () => {
      if (scrollRef.current) {
        const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) {
          viewport.scrollTop = viewport.scrollHeight;
        }
      }
    };

    scrollToBottom();

    const timeout = setTimeout(scrollToBottom, 100);
    return () => clearTimeout(timeout);
  }, [chatState.messages]);

  const hasRegistered = useRef(false);

  // Restore focus to input whenever sending finishes or modal closes
  useEffect(() => {
    if (!sendMessage.isPending && !showNameModal) {
      inputRef.current?.focus();
    }
  }, [sendMessage.isPending, showNameModal]);

  const handleGetSummary = async () => {
    setIsGettingSummary(true);
    try {
      const response = await fetch('/api/thought-partner/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: chatState.messages,
          userInstructions: config.userInstructions,
          feedbackCriteria: config.feedbackCriteria,
          configId: config.id,
          sessionId,
        }),
      });
      if (!response.ok) throw new Error('Failed to generate summary');
      const data = await response.json();
      setSummaryData(data);
      queryClient.setQueryData<AttemptData[]>(
        [`/api/conversations/${config.id}/session/${sessionId}`],
        (old = []) => {
          const updated: AttemptData = { attemptNumber, chatMode: 'typed', feedback: { bullets: [], score: null, thinkingMap: data } };
          return [updated, ...(old).filter(a => a.attemptNumber !== attemptNumber)];
        }
      );
      setSummaryOpen(true);
    } catch (error) {
      toast({ title: "Error", description: "Failed to generate thinking map. Please try again.", variant: "destructive" });
    } finally {
      setIsGettingSummary(false);
    }
  };

  const handleGetFeedback = async () => {
    setIsConfirmingFeedback(true);
  };

  const confirmFeedback = async () => {
    setIsConfirmingFeedback(false);
    track(EventName.FEEDBACK_REQUESTED, { type: config.type, configId: config.id });
    setIsGettingFeedback(true);
    try {
      const hasUserMessage = chatState.messages.some(m => m.role === 'user');
      const hasAssistantMessage = chatState.messages.some(m => m.role === 'assistant');
      if (!hasUserMessage || !hasAssistantMessage) {
        toast({
          variant: "destructive",
          title: "Incomplete Conversation",
          description: "Please complete at least one exchange before requesting feedback.",
        });
        return;
      }

      if (!config.feedbackCriteria) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "No feedback criteria specified for this chat configuration.",
        });
        return;
      }

      if (chatState.messages.length === 0) {
        toast({
          variant: "destructive",
          title: "No Messages",
          description: "Please have a conversation first before requesting feedback.",
        });
        return;
      }


      const response = await fetch("/api/chat-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          configId: config.id,
          sessionId,
          messages: chatState.messages,
          type: config.type,
          attemptNumber,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const { bullets, score, summary } = await response.json();
      setFeedbackData({ bullets, score, summary });
      if (score != null) track(EventName.FEEDBACK_SCORE, { type: config.type, configId: config.id, score });
      queryClient.setQueryData<AttemptData[]>(
        [`/api/conversations/${config.id}/session/${sessionId}`],
        (old = []) => {
          const updated: AttemptData = { attemptNumber, chatMode: 'typed', feedback: { bullets, score, summary } };
          return [updated, ...(old).filter(a => a.attemptNumber !== attemptNumber)];
        }
      );

      // Fetch all attempts to display history
      const attemptsRes = await fetch(`/api/conversations/${config.id}/session/${sessionId}`);
      if (attemptsRes.ok) setAllAttempts(await attemptsRes.json());

      setFeedbackOpen(true);
    } catch (error) {
      console.error("Error getting feedback:", error);
      toast({
        title: "Error",
        description: "Failed to get feedback. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGettingFeedback(false);
    }
  };

  const cancelFeedback = () => {
    setIsConfirmingFeedback(false);
  };

  return (
    <div className="flex flex-col h-full">
      {config.userInstructions && !isViewOnly && (
        <Collapsible open={instructionsOpen} onOpenChange={setInstructionsOpen} className="mb-4">
          <div className={`border rounded-lg ${instructionsOpen ? 'rounded-b-none border-b-0' : ''}`}>
            <CollapsibleTrigger className="w-full block cursor-pointer">
              <Alert className="mb-0 border-0 relative">
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <div className="font-semibold text-lg">{config.title}</div>
                </AlertDescription>
                <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                  <ChevronDown className={`h-5 w-5 text-gray-500 transition-transform ${instructionsOpen ? 'transform rotate-180' : ''}`} />
                </div>
              </Alert>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <div className="border border-t-0 rounded-t-none rounded-b-lg p-4 bg-muted/20">
              <pre className="font-sans whitespace-pre-wrap text-sm">{config.userInstructions}</pre>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
      {isViewOnly && userName && (
        <div className="p-4 border-b bg-blue-50">
          <h2 className="text-lg font-semibold text-blue-900">
            {userName}'s Chat History
          </h2>
        </div>
      )}
      {showNameModal && (
        <UserNameModal
          open={showNameModal}
          interactionMode={config.interactionMode}
          onSubmit={(name, mode) => {
            onUserNameSubmit(name, mode);
            setShowNameModal(false);
          }}
        />
      )}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {chatState.messages.map((message: Message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {sendMessage.isPending && (
            <div className="flex justify-start">
              <div className="bg-blue-100 text-blue-900 rounded-lg p-3 max-w-[80%] animate-pulse">
                Thinking...
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
      {!isViewOnly && (
        <>
          {isComplete ? (
            /* ── Frozen / completed view ─────────────────────── */
            <div className="border-t bg-gray-50 px-4 py-4 space-y-4 overflow-y-auto max-h-[50vh]">
              {isThoughtPartner && displayThinkingMap ? (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                      <Brain className="h-4 w-4 text-green-600" />
                      Your Thinking Map
                    </div>
                    <button
                      onClick={() => {
                        const sections: string[] = [];
                        if (displayThinkingMap.keyThemes?.length) sections.push(`Key Themes Explored\n${displayThinkingMap.keyThemes.map(t => `• ${t}`).join('\n')}`);
                        if (displayThinkingMap.insights?.length) sections.push(`Insights Reached\n${displayThinkingMap.insights.map(t => `• ${t}`).join('\n')}`);
                        if (displayThinkingMap.openQuestions?.length) sections.push(`Open Questions\n${displayThinkingMap.openQuestions.map(t => `• ${t}`).join('\n')}`);
                        if (displayThinkingMap.nextSteps?.length) sections.push(`Suggested Next Steps\n${displayThinkingMap.nextSteps.map(t => `• ${t}`).join('\n')}`);
                        navigator.clipboard.writeText(sections.join('\n\n')).then(() => { setCopiedFeedback(true); setTimeout(() => setCopiedFeedback(false), 2000); });
                      }}
                      className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded"
                      title="Copy to clipboard"
                    >
                      {copiedFeedback ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                  {displayThinkingMap.keyThemes?.length > 0 && (
                    <InlineMapSection color="blue" title="Key Themes Explored" items={displayThinkingMap.keyThemes} />
                  )}
                  {displayThinkingMap.insights?.length > 0 && (
                    <InlineMapSection color="yellow" title="Insights Reached" items={displayThinkingMap.insights} />
                  )}
                  {displayThinkingMap.openQuestions?.length > 0 && (
                    <InlineMapSection color="purple" title="Open Questions" items={displayThinkingMap.openQuestions} />
                  )}
                  {displayThinkingMap.nextSteps?.length > 0 && (
                    <InlineMapSection color="green" title="Suggested Next Steps" items={displayThinkingMap.nextSteps} />
                  )}
                  {displayFeedback && displayFeedback.bullets.length > 0 && (
                    <div className="pt-2 border-t space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Feedback</span>
                        {displayFeedback.score != null && <span className="text-sm font-bold text-blue-900">{displayFeedback.score}/10</span>}
                      </div>
                      {displayFeedback.bullets.map((b, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm text-gray-700"><span className="text-green-500 mt-0.5">•</span><span>{b}</span></div>
                      ))}
                      {displayFeedback.summary && <p className="text-sm text-muted-foreground italic">{displayFeedback.summary}</p>}
                    </div>
                  )}
                </>
              ) : displayFeedback ? (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                      <Trophy className="h-4 w-4 text-blue-600" />
                      Session Complete
                      {displayFeedback.score != null && <span className="text-blue-900 font-bold">{displayFeedback.score}/10</span>}
                    </div>
                    <button
                      onClick={() => {
                        const text = [...(displayFeedback.bullets || []).map(b => `• ${b}`), displayFeedback.summary].filter(Boolean).join('\n');
                        navigator.clipboard.writeText(text).then(() => { setCopiedFeedback(true); setTimeout(() => setCopiedFeedback(false), 2000); });
                      }}
                      className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded"
                      title="Copy to clipboard"
                    >
                      {copiedFeedback ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                  {displayFeedback.bullets.map((b, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-gray-700"><span className="text-green-500 mt-0.5">•</span><span>{b}</span></div>
                  ))}
                  {displayFeedback.summary && <p className="text-sm text-muted-foreground italic">{displayFeedback.summary}</p>}
                  <Button size="sm" variant="outline" className="w-full" onClick={() => { fetchLeaderboard(); setShowLeaderboard(true); }}>
                    <Trophy className="h-4 w-4 mr-2" />View Leaderboard
                  </Button>
                </>
              ) : (
                <div className="text-sm text-gray-500 text-center py-2">Session complete</div>
              )}
            </div>
          ) : (
            <>
              {pastedImage && (
                <div className="px-4 pb-2">
                  <div className="relative inline-block">
                    <img src={pastedImage} alt="Pasted screenshot" className="max-h-32 rounded-lg border border-gray-200" />
                    <button onClick={() => setPastedImage(null)} className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow-sm border border-gray-200">
                      <X className="h-4 w-4 text-gray-500" />
                    </button>
                  </div>
                </div>
              )}
              <div className="p-4 border-t">
                <form onSubmit={handleSubmit} className="flex gap-2">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={pastedImage ? "Add a message (optional) and press send..." : "Type your message..."}
                    className="flex-1"
                    disabled={sendMessage.isPending || showNameModal}
                    ref={inputRef}
                    autoFocus
                  />
                  <Button type="submit" disabled={sendMessage.isPending || !input.trim() && !pastedImage}>
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </div>
              <div className="px-4 pb-4 space-y-2">
                {isThoughtPartner ? (() => {
                  const userMsgCount = chatState.messages?.filter((m: any) => m.role === 'user').length ?? 0;
                  const hasEnough = userMsgCount >= 5;
                  return (
                    <div className="space-y-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="w-full block">
                              <Button onClick={handleGetSummary} disabled={isGettingSummary || !hasEnough} className="w-full bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed">
                                {isGettingSummary ? "Building summary..." : "Get Summary"}
                              </Button>
                            </span>
                          </TooltipTrigger>
                          {!hasEnough && <TooltipContent><p>We need at least 5 messages from you before we can create this</p></TooltipContent>}
                        </Tooltip>
                      </TooltipProvider>
                      <Button onClick={handleGetFeedback} variant="outline" disabled={isGettingFeedback} className="w-full">
                        {isGettingFeedback ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating summary...</> : "End & Get Summary"}
                      </Button>
                    </div>
                  );
                })() : (
                  <div className="flex gap-2">
                    <Button onClick={getHint} variant="outline" className="flex-1" disabled={isGettingHint}>
                      <Lightbulb className="h-4 w-4 mr-2" />{isGettingHint ? 'Getting hint...' : 'Get Hint'}
                    </Button>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex-1">
                            <Button onClick={handleGetFeedback} variant="default" disabled={!hasEnoughMessages || isGettingFeedback} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                              {isGettingFeedback ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating feedback...</> : "End & Get Feedback"}
                            </Button>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{hasEnoughMessages ? "End your conversation and get feedback" : "Have a longer conversation (at least 5 messages) to get meaningful feedback"}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}
                {onSwitchMode && (
                  <button
                    onClick={() => setConfirmSwitchMode(true)}
                    className="w-full text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Mic className="h-3 w-3" />Switch to Voice
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* Legacy feedback Dialog — retained only if somehow needed */}
      <Dialog open={feedbackOpen && !isComplete} onOpenChange={setFeedbackOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Feedback</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {[
              allAttempts.find(attempt => attempt.attemptNumber === attemptNumber)
                ?? allAttempts[0]
                ?? { attemptNumber, chatMode: 'typed', feedback: feedbackData },
            ].map((attempt, idx) => (
              <Collapsible key={attempt.attemptNumber} defaultOpen={idx === 0}>
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between w-full px-3 py-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Feedback</span>
                      {attempt.chatMode === 'spoken' ? (
                        <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">Voice</span>
                      ) : (
                        <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Typed</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {attempt.feedback?.score != null && (
                        <span className="text-sm font-bold text-blue-900">{attempt.feedback.score}/10</span>
                      )}
                      <ChevronDown className="h-4 w-4 text-gray-400 transition-transform [[data-state=open]_&]:rotate-180" />
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-3 pt-2 pb-3 space-y-3">
                    {attempt.feedback?.bullets?.map((bullet, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <span>•</span><span>{bullet}</span>
                      </div>
                    ))}
                    {attempt.feedback?.summary && (
                      <p className="text-sm text-muted-foreground italic">{attempt.feedback.summary}</p>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
          <div className="flex flex-col gap-2 pt-2 border-t">
            <Button
              onClick={() => { fetchLeaderboard(); setShowLeaderboard(true); }}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              <Trophy className="w-4 h-4 mr-2" />
              View Leaderboard
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <LeaderboardModal
        open={showLeaderboard}
        onOpenChange={setShowLeaderboard}
        entries={leaderboardData}
        currentUserRank={userRank}
        currentUserEntry={currentUserEntry}
        title="Final Leaderboard"
        maxScore={10}
        onRefresh={fetchLeaderboard}
      />
      <AlertDialog open={isConfirmingFeedback} onOpenChange={setIsConfirmingFeedback}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isThoughtPartner ? "End & Get Summary?" : "End & Get Feedback?"}</AlertDialogTitle>
            <AlertDialogDescription>
              This will end your session and generate your {isThoughtPartner ? "summary" : "feedback"}. You can dismiss this to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelFeedback}>Continue session</AlertDialogCancel>
            <AlertDialogAction onClick={confirmFeedback}>{isThoughtPartner ? "End & Get Summary" : "End & Get Feedback"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <AlertDialog open={confirmSwitchMode} onOpenChange={setConfirmSwitchMode}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch to Voice?</AlertDialogTitle>
            <AlertDialogDescription>
              Switching will discard your current conversation and start this activity again in voice mode. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay in Typed</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmSwitchMode(false); onSwitchMode?.('spoken'); }}>
              Switch to Voice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="mt-auto py-2 text-center text-xs text-gray-400">
        Your trainer has access to the transcript and feedback.
      </div>
    </div>
  );
}

const sectionColors = {
  blue:   { card: 'bg-blue-50 border-blue-100',   dot: 'bg-blue-400' },
  yellow: { card: 'bg-yellow-50 border-yellow-100', dot: 'bg-yellow-400' },
  purple: { card: 'bg-purple-50 border-purple-100', dot: 'bg-purple-400' },
  green:  { card: 'bg-green-50 border-green-100',  dot: 'bg-green-500' },
} as const;

function InlineMapSection({ color, title, items }: { color: keyof typeof sectionColors; title: string; items: string[] }) {
  const { card, dot } = sectionColors[color];
  return (
    <div className={`rounded-lg border p-3 ${card}`}>
      <p className="font-semibold text-xs text-gray-600 mb-2">{title}</p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
            <span className={`mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0 ${dot}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
