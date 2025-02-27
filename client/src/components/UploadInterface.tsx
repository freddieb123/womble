import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Trophy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { AdminConfig, UploadState, Feedback, Message } from "@/lib/types";
import UserNameModal from "./UserNameModal";
import LeaderboardModal from "./LeaderboardModal";

interface Props {
  config: AdminConfig;
  sessionId: string;
  userName: string | null;
  onUserNameSubmit: (name: string) => string;
}

interface LeaderboardEntry {
  userName: string;
  score: number;
  total: number;
  isCurrentUser: boolean;
}

export default function UploadInterface({ config, sessionId, userName, onUserNameSubmit }: Props) {
  const [uploadState, setUploadState] = useState<UploadState>({
    file: null,
    isLoading: false,
    error: null,
    feedback: null
  });
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [localUserName, setLocalUserName] = useState(userName);
  const [showNameModal, setShowNameModal] = useState(!localUserName);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<number>();
  const { toast } = useToast();

  useEffect(() => {
    setLocalUserName(userName);
  }, [userName]);

  // Fetch existing feedback if available
  const { data: conversations = [], error: fetchError } = useQuery<Array<{
    sessionId: string;
    feedback: Feedback | null;
    messages: Array<Message>;
  }>>({
    queryKey: [`/api/conversations/${config.id}`],
    enabled: !!config.id,
  });

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch(`/api/conversations/${config.id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch leaderboard data');
      }

      const data = await response.json();

      const scoredEntries = data
        .filter((entry: any) => entry.feedback && entry.feedback.score !== null)
        .map((entry: any) => ({
          userName: entry.userName || 'Anonymous',
          score: entry.feedback.score,
          total: 10, // Feedback scores are out of 10
          isCurrentUser: entry.userName === localUserName && entry.sessionId === sessionId
        }));

      const sortedEntries = scoredEntries.sort((a: LeaderboardEntry, b: LeaderboardEntry) =>
        b.score - a.score
      );

      const userRankIndex = sortedEntries.findIndex(entry => entry.isCurrentUser);
      if (userRankIndex !== -1) {
        setUserRank(userRankIndex + 1);
      }

      setLeaderboardData(sortedEntries);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load leaderboard data",
      });
    }
  };

  useEffect(() => {
    if (fetchError && uploadState.feedback) {
      console.error('Error fetching conversations:', fetchError);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load feedback data"
      });
    }
  }, [fetchError, uploadState.feedback, toast]);

  // Get the latest feedback if available
  useEffect(() => {
    if (conversations && conversations.length > 0) {
      const currentConversation = conversations.find(conv => conv.sessionId === sessionId);

      if (currentConversation?.feedback) {
        setUploadState(prev => ({
          ...prev,
          feedback: currentConversation.feedback
        }));
        // Automatically show feedback if available
        setFeedbackOpen(true);
      }
    }
  }, [conversations, sessionId]);

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (!e.clipboardData) return;

      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (!blob) continue;

          const reader = new FileReader();
          reader.onload = (event) => {
            const base64String = event.target?.result as string;
            setUploadState(prev => ({
              ...prev,
              file: base64String
            }));
          };
          reader.readAsDataURL(blob);
          break;
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);

  const getFeedback = async () => {
    if (!uploadState.file) {
      toast({
        variant: "destructive",
        title: "No screenshot",
        description: "Please paste a screenshot first"
      });
      return;
    }

    if (!localUserName) {
      setShowNameModal(true);
      return;
    }
    
    // Show confirmation dialog
    if (!window.confirm("Are you sure? You can only get feedback once so make sure you've finished.")) {
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
          userName: localUserName,
          fileContent: uploadState.file,
          fileName: "pasted_screenshot.png"
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const feedbackData = await response.json();
      setUploadState(prev => ({
        ...prev,
        feedback: feedbackData
      }));
      setFeedbackOpen(true);

      // Fetch leaderboard data after getting feedback
      await fetchLeaderboard();
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
      {showNameModal && (
        <UserNameModal
          open={showNameModal}
          onSubmit={(name) => {
            onUserNameSubmit(name);
            setLocalUserName(name);
            setShowNameModal(false);
          }}
        />
      )}

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
        className="flex-1 border-2 border-dashed rounded-lg flex flex-col items-center justify-center p-6 relative"
      >
        {uploadState.file ? (
          <div className="relative inline-block">
            <img
              src={uploadState.file}
              alt="Pasted screenshot"
              className="max-h-96 rounded-lg border border-gray-200"
            />
            <button
              onClick={() => setUploadState(prev => ({ ...prev, file: null, feedback: null }))}
              className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow-sm border border-gray-200"
            >
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-lg font-semibold mb-2">Press Ctrl+V (Cmd+V on Mac)</p>
            <p className="text-sm text-gray-600">Paste your screenshot here to get feedback</p>
          </div>
        )}
      </div>

      <div className="mt-4">
        <Button
          className={`w-full ${(uploadState.feedback && uploadState.feedback.score !== undefined) ? 'bg-green-600 hover:bg-green-700' : ''}`}
          size="lg"
          disabled={!uploadState.file || uploadState.isLoading}
          onClick={(uploadState.feedback && uploadState.feedback.score !== undefined) 
            ? () => setFeedbackOpen(true) 
            : getFeedback}
        >
          {uploadState.isLoading 
            ? "Analyzing..." 
            : (uploadState.feedback && uploadState.feedback.score !== undefined)
              ? "View Feedback" 
              : "Get Feedback"}
        </Button>
      </div>

      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{localUserName ? `${localUserName}'s Upload` : 'Feedback'}</DialogTitle>
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
                <div className="flex flex-col gap-4">
                  <span className="text-2xl font-bold">{uploadState.feedback.score}/10</span>
                  {uploadState.feedback.summary && (
                    <p className="text-sm text-muted-foreground">{uploadState.feedback.summary}</p>
                  )}
                  <Button
                    onClick={() => {
                      fetchLeaderboard();
                      setShowLeaderboard(true);
                    }}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Trophy className="w-4 h-4 mr-2" />
                    View Leaderboard
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <LeaderboardModal
        open={showLeaderboard}
        onOpenChange={setShowLeaderboard}
        entries={leaderboardData}
        currentUserRank={userRank}
        title="Upload Leaderboard"
        maxScore={10}
        onRefresh={fetchLeaderboard}
      />
    </div>
  );
}