
import React, { useState, useEffect } from 'react';
import { useParams } from 'wouter';
import { ChevronLeft, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import DualConversationRecorder from '@/components/DualConversationRecorder';
import ParticipantsNameModal from '@/components/ParticipantsNameModal';
import FeedbackModal from '@/components/FeedbackModal';
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
    
    toast({
      title: "Names Saved",
      description: `Participants: ${names.participant1Name} and ${names.participant2Name}`,
    });
  };

  const generateFeedback = async () => {
    if (!parsedConfigId || !sessionId || transcript.length === 0) {
      toast({
        title: "Cannot generate feedback",
        description: "Ensure a conversation has been recorded and transcribed first.",
        variant: "destructive"
      });
      return;
    }

    setIsGeneratingFeedback(true);
    
    try {
      // Get the participant names from the transcript UI
      const participant1Name = config?.participant1Name || 'Participant 1';
      const participant2Name = config?.participant2Name || 'Participant 2';
      
      // Send the entire transcript to the backend
      const response = await fetch(`/api/dual-conversation/feedback?configId=${parsedConfigId}&sessionId=${sessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          transcript,
          participant1Name,
          participant2Name
        })
      });
      
      if (!response.ok) {
        throw new Error("Failed to generate feedback");
      }
      
      const feedbackData = await response.json();
      setFeedback(feedbackData);
      
      // Show the feedback modal
      setShowFeedbackModal(true);
      
      // Check if we received a note indicating mock data
      if (feedbackData.note) {
        toast({
          title: "Sample Data Notice",
          description: feedbackData.note
        });
      } else {
        toast({
          title: "Feedback Generated",
          description: "Conversation feedback is now available.",
        });
      }
    } catch (error) {
      console.error("Error generating feedback:", error);
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
    <div className="container mx-auto py-6">
      {/* Names modal - always shown on page load */}
      <ParticipantsNameModal 
        open={showNamesModal} 
        onSubmit={handleNameSubmit} 
      />
      
      {/* Feedback modal - shown when feedback is available and modal is open */}
      <FeedbackModal
        open={showFeedbackModal}
        onOpenChange={setShowFeedbackModal}
        feedback={feedback}
        transcript={transcript}
      />
      
      <div className="flex items-center mb-6">
        <Button 
          variant="ghost" 
          className="mr-2" 
          onClick={() => window.location.href = "/dashboard"}
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <h1 className="text-2xl font-bold">{config?.title || 'Conversation Analysis'}</h1>
      </div>
      
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="max-w-2xl mx-auto">
            <div className="flex flex-col justify-center items-center mb-8">
              <Mic className="h-10 w-10 text-primary mb-2" />
              <h2 className="text-xl font-semibold">Record Conversation</h2>
            </div>
            
            <DualConversationRecorder 
              configId={parsedConfigId || 0} 
              sessionId={sessionId}
              participant1Name={participant1Name}
              participant2Name={participant2Name}
              onTranscriptReady={handleTranscriptReady}
            />
            
            {transcript.length > 0 && (
              <div className="mt-6">
                <Button 
                  onClick={generateFeedback}
                  disabled={isGeneratingFeedback}
                  className="w-full py-6 text-lg"
                >
                  {isGeneratingFeedback ? 'Generating Feedback...' : 'Generate Feedback'}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
