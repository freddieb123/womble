
import React, { useState, useEffect } from 'react';
import { useParams } from 'wouter';
import { ChevronLeft, Mic, ChevronDown, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import DualConversationRecorder from '@/components/DualConversationRecorder';
import ParticipantsNameModal from '@/components/ParticipantsNameModal';
import FeedbackModal from '@/components/FeedbackModal';
import WombleHeader from '@/components/WombleHeader';
import WombleFooter from '@/components/WombleFooter';
import { v4 as uuidv4 } from 'uuid';

interface DualConversationPageProps {}

export default function DualConversationPage({}: DualConversationPageProps) {
  const { id: configId } = useParams<{ id: string }>();
  const parsedConfigId = configId ? parseInt(configId) : undefined;
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionId] = useState(uuidv4());
  const [transcript, setTranscript] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<any | null>(null);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [showNamesModal, setShowNamesModal] = useState(true);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [participant1Name, setParticipant1Name] = useState("");
  const [participant2Name, setParticipant2Name] = useState("");
  const [instructionsOpen, setInstructionsOpen] = useState(true);
  const [autoStartRecording, setAutoStartRecording] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!parsedConfigId) {
      setError("Invalid configuration ID");
      setLoading(false);
      return;
    }

    const fetchConfig = async () => {
      try {
        const response = await fetch(`/api/chat-configs/${parsedConfigId}`);
        if (!response.ok) {
          throw new Error("Failed to fetch configuration");
        }
        const data = await response.json();
        setConfig(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [parsedConfigId]);

  const handleTranscriptReady = (newTranscript: any[]) => {
    setTranscript(newTranscript);
    generateFeedbackWith(newTranscript);
  };
  
  const handleNameSubmit = (names: { participant1Name: string; participant2Name: string }) => {
    setParticipant1Name(names.participant1Name);
    setParticipant2Name(names.participant2Name);
    
    // Update config with participant names for this session only
    if (config) {
      const updatedConfig = { 
        ...config, 
        participant1Name: names.participant1Name, 
        participant2Name: names.participant2Name 
      };
      setConfig(updatedConfig);
    }
    
    setShowNamesModal(false);
    setAutoStartRecording(true);
  };

  const generateFeedbackWith = async (transcriptToUse: any[]) => {
    if (!parsedConfigId || !sessionId || transcriptToUse.length === 0) return;

    setIsGeneratingFeedback(true);
    try {
      const p1 = config?.participant1Name || participant1Name || 'Participant 1';
      const p2 = config?.participant2Name || participant2Name || 'Participant 2';
      const response = await fetch(`/api/dual-conversation/feedback?configId=${parsedConfigId}&sessionId=${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: transcriptToUse, participant1Name: p1, participant2Name: p2 })
      });
      if (!response.ok) throw new Error("Failed to generate feedback");
      const feedbackData = await response.json();
      setFeedback(feedbackData);
      setShowFeedbackModal(true);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate feedback",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingFeedback(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <p className="text-red-500 mb-4">{error}</p>
        <Button variant="outline" onClick={() => window.location.href = "/dashboard"}>
          Return to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <WombleHeader />
    <div className="container mx-auto py-6 flex-1">
      {/* Names modal - always shown on page load */}
      <ParticipantsNameModal
        open={showNamesModal}
        onSubmit={handleNameSubmit}
        participant1Role={config?.participant1Role}
        participant2Role={config?.participant2Role}
      />
      
      {/* Feedback modal - shown when feedback is available and modal is open */}
      <FeedbackModal
        open={showFeedbackModal}
        onOpenChange={setShowFeedbackModal}
        feedback={feedback}
        transcript={transcript}
      />
      
      <div className="flex items-center justify-center mb-6">
        <h1 className="text-2xl font-bold">{config?.title || 'Conversation Analysis'}</h1>
      </div>
      
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="max-w-2xl mx-auto">
            <div className="flex flex-col justify-center items-center mb-4">
              <Mic className="h-10 w-10 text-primary mb-2" />
            </div>

            {config?.userInstructions && (
              <Collapsible
                open={instructionsOpen}
                onOpenChange={setInstructionsOpen}
                className="mb-8">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <HelpCircle className="h-4 w-4 text-blue-600" />
                    <h3 className="text-sm font-medium">Instructions</h3>
                  </div>
                  <CollapsibleTrigger className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
                    {instructionsOpen ? "Hide" : "Show"} Instructions
                    <ChevronDown 
                      className={`h-4 w-4 transition-transform ${instructionsOpen ? 'transform rotate-180' : ''}`} 
                    />
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent>
                  <Alert className="bg-blue-50 border-blue-200">
                    <AlertDescription className="text-sm whitespace-pre-line">
                      {config?.userInstructions}
                    </AlertDescription>
                  </Alert>
                </CollapsibleContent>
              </Collapsible>
            )}
            
            <DualConversationRecorder
              configId={parsedConfigId || 0}
              sessionId={sessionId}
              participant1Name={participant1Name}
              participant2Name={participant2Name}
              onTranscriptReady={handleTranscriptReady}
              autoStart={autoStartRecording}
            />
            
            {isGeneratingFeedback && (
              <div className="mt-6">
                <Button disabled className="w-full py-6 text-lg">
                  <span className="mr-2 h-4 w-4 animate-spin inline-block border-2 border-white border-t-transparent rounded-full" />
                  Generating Feedback…
                </Button>
              </div>
            )}
            {!isGeneratingFeedback && feedback && (
              <div className="mt-6">
                <Button onClick={() => setShowFeedbackModal(true)} className="w-full py-6 text-lg">
                  View Feedback
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
    <WombleFooter />
    </div>
  );
}
