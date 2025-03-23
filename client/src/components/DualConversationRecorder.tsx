
import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mic, MicOff, Trash, Save } from "lucide-react";

interface DualConversationRecorderProps {
  configId: number;
  sessionId: string;
  onTranscriptReady?: (transcript: any[]) => void;
}

interface TranscriptEntry {
  role: 'participant1' | 'participant2';
  content: string;
  timestamp: number;
}

export default function DualConversationRecorder({ 
  configId, 
  sessionId,
  onTranscriptReady 
}: DualConversationRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [participant1Name, setParticipant1Name] = useState("");
  const [participant2Name, setParticipant2Name] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();

  const startRecording = async () => {
    try {
      if (!participant1Name || !participant2Name) {
        toast({
          title: "Missing participant names",
          description: "Please enter names for both participants.",
          variant: "destructive"
        });
        return;
      }

      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setAudioBlob(audioBlob);
        setAudioUrl(audioUrl);
      };
      
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Error starting recording:", error);
      toast({
        title: "Recording failed",
        description: "Could not access microphone. Please check permissions.",
        variant: "destructive"
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      // Stop all audio tracks
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const processRecording = async () => {
    if (!audioBlob) return;
    
    setIsProcessing(true);
    
    try {
      // First, save the audio file
      const formData = new FormData();
      formData.append('audio', audioBlob);
      formData.append('configId', configId.toString());
      formData.append('sessionId', sessionId);
      formData.append('participant1Name', participant1Name);
      formData.append('participant2Name', participant2Name);
      
      const saveResponse = await fetch('/api/dual-conversation/save', {
        method: 'POST',
        body: formData
      });
      
      if (!saveResponse.ok) {
        throw new Error('Failed to save audio');
      }
      
      // Then request transcription and basic processing
      const transcribeResponse = await fetch(`/api/dual-conversation/transcribe?configId=${configId}&sessionId=${sessionId}`, {
        method: 'POST'
      });
      
      if (!transcribeResponse.ok) {
        throw new Error('Failed to transcribe audio');
      }
      
      const transcriptData = await transcribeResponse.json();
      setTranscript(transcriptData.transcript);
      
      if (onTranscriptReady) {
        onTranscriptReady(transcriptData.transcript);
      }
      
      toast({
        title: "Success!",
        description: "Your conversation has been processed and is ready for feedback.",
      });
    } catch (error) {
      console.error("Error processing recording:", error);
      toast({
        title: "Processing failed",
        description: error instanceof Error ? error.message : "Failed to process audio",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const discardRecording = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setTranscript([]);
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Record Conversation</CardTitle>
        <CardDescription>
          Record a conversation between two participants for feedback
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="participant1">Participant 1</Label>
            <Input
              id="participant1"
              placeholder="Name"
              value={participant1Name}
              onChange={(e) => setParticipant1Name(e.target.value)}
              disabled={isRecording || isProcessing}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="participant2">Participant 2</Label>
            <Input
              id="participant2"
              placeholder="Name"
              value={participant2Name}
              onChange={(e) => setParticipant2Name(e.target.value)}
              disabled={isRecording || isProcessing}
            />
          </div>
        </div>
        
        {audioUrl && (
          <div className="pt-2">
            <Label>Recording</Label>
            <audio src={audioUrl} controls className="w-full mt-2" />
          </div>
        )}
        
        {transcript.length > 0 && (
          <div className="pt-2 max-h-60 overflow-y-auto border rounded-md p-2">
            <Label className="mb-2 block">Transcript</Label>
            {transcript.map((entry, index) => (
              <div key={index} className={`mb-2 p-2 rounded ${entry.role === 'participant1' ? 'bg-blue-50' : 'bg-green-50'}`}>
                <div className="font-medium">
                  {entry.role === 'participant1' ? participant1Name : participant2Name}
                </div>
                <div>{entry.content}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-between space-x-2">
        {!audioBlob ? (
          <Button
            className="w-full"
            onClick={isRecording ? stopRecording : startRecording}
            variant={isRecording ? "destructive" : "default"}
            disabled={isProcessing}
          >
            {isRecording ? (
              <>
                <MicOff className="mr-2 h-4 w-4" /> Stop Recording
              </>
            ) : (
              <>
                <Mic className="mr-2 h-4 w-4" /> Start Recording
              </>
            )}
          </Button>
        ) : (
          <>
            <Button 
              variant="destructive" 
              onClick={discardRecording}
              disabled={isProcessing}
            >
              <Trash className="mr-2 h-4 w-4" /> Discard
            </Button>
            <Button 
              variant="default" 
              onClick={processRecording}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" /> Process
                </>
              )}
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
