
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
  participant1Name?: string;
  participant2Name?: string;
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
  participant1Name: propParticipant1Name,
  participant2Name: propParticipant2Name,
  onTranscriptReady 
}: DualConversationRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  // Use the prop values if provided, otherwise use empty strings
  const [participant1Name, setParticipant1Name] = useState(propParticipant1Name || "");
  const [participant2Name, setParticipant2Name] = useState(propParticipant2Name || "");
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();
  
  // Update local state when prop values change
  useEffect(() => {
    if (propParticipant1Name) {
      setParticipant1Name(propParticipant1Name);
    }
    if (propParticipant2Name) {
      setParticipant2Name(propParticipant2Name);
    }
  }, [propParticipant1Name, propParticipant2Name]);

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

      console.log("Requesting microphone access...");
      
      // Check if browser supports getUserMedia
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Your browser doesn't support audio recording. Please try a modern browser like Chrome, Firefox, or Edge.");
      }

      audioChunksRef.current = [];
      
      // Request microphone access with specific constraints for better audio quality
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
        } 
      });
      
      console.log("Microphone access granted. Setting up recorder...");
      
      // Set up audio context for potential future enhancements
      // const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      // const source = audioContext.createMediaStreamSource(stream);
      
      // Create MediaRecorder with improved settings
      const options = { 
        mimeType: 'audio/webm;codecs=opus',  // Widely supported format
        audioBitsPerSecond: 128000  // 128kbps for better quality
      };
      
      // Check if the browser supports our preferred format
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.log("Preferred mime type not supported, falling back to browser default");
        // Let the browser choose the format
        const mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            console.log("Audio chunk received:", event.data.size, "bytes");
            audioChunksRef.current.push(event.data);
          }
        };
        
        mediaRecorder.onstop = () => {
          console.log("Recording stopped, processing audio...");
          // Use webm audio format if available, otherwise use wav as fallback
          const audioBlob = new Blob(audioChunksRef.current, { 
            type: mediaRecorder.mimeType || 'audio/webm' 
          });
          console.log("Audio blob created:", audioBlob.size, "bytes,", audioBlob.type);
          const audioUrl = URL.createObjectURL(audioBlob);
          setAudioBlob(audioBlob);
          setAudioUrl(audioUrl);
        };
        
        mediaRecorderRef.current = mediaRecorder;
        
        // Request data every second instead of waiting until stop
        mediaRecorder.start(1000);
      } else {
        // Use our preferred high-quality settings
        const mediaRecorder = new MediaRecorder(stream, options);
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            console.log("Audio chunk received:", event.data.size, "bytes");
            audioChunksRef.current.push(event.data);
          }
        };
        
        mediaRecorder.onstop = () => {
          console.log("Recording stopped, processing audio...");
          // Use webm audio format if available, otherwise use wav as fallback
          const audioBlob = new Blob(audioChunksRef.current, { 
            type: mediaRecorder.mimeType || 'audio/webm' 
          });
          console.log("Audio blob created:", audioBlob.size, "bytes,", audioBlob.type);
          const audioUrl = URL.createObjectURL(audioBlob);
          setAudioBlob(audioBlob);
          setAudioUrl(audioUrl);
        };
        
        mediaRecorderRef.current = mediaRecorder;
        
        // Request data every second instead of waiting until stop
        mediaRecorder.start(1000);
      }
      
      setIsRecording(true);
      
      toast({
        title: "Recording started",
        description: "Speak clearly into your microphone. Press Stop when finished.",
      });
    } catch (error) {
      console.error("Error starting recording:", error);
      
      let errorMessage = "Could not access microphone. Please check permissions.";
      let errorTitle = "Recording Failed";
      
      if (error instanceof Error) {
        console.log("Error message:", error.message, error.name);
        
        if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
          errorMessage = "Microphone access was denied. Please allow microphone access in your browser settings.";
          errorTitle = "Permission Denied";
        } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
          errorMessage = "No microphone found. Please connect a microphone and try again.";
          errorTitle = "No Microphone";
        } else if (error.name === "NotReadableError" || error.name === "TrackStartError") {
          errorMessage = "Your microphone is busy or not working properly. Please close other apps using your microphone.";
          errorTitle = "Microphone Busy";
        } else if (error.name === "SecurityError") {
          errorMessage = "Your browser's security settings blocked microphone access. Try using HTTPS or a different browser.";
          errorTitle = "Security Error";
        } else if (error.message.includes("support")) {
          errorTitle = "Browser Not Supported";
        }
      }
      
      toast({
        title: errorTitle,
        description: errorMessage,
        variant: "destructive",
        duration: 6000
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
    if (!audioBlob) {
      toast({
        title: "No Recording Available",
        description: "Please record a conversation first.",
        variant: "destructive"
      });
      return;
    }
    
    setIsProcessing(true);
    console.log("Processing audio recording:", {
      blobSize: audioBlob.size,
      blobType: audioBlob.type,
      configId,
      sessionId
    });
    
    try {
      // First, save the audio file to temporary storage
      const formData = new FormData();
      formData.append('audio', audioBlob);
      formData.append('configId', configId.toString());
      formData.append('sessionId', sessionId);
      formData.append('participant1Name', participant1Name);
      formData.append('participant2Name', participant2Name);
      
      console.log("Saving audio recording to server...");
      
      const saveResponse = await fetch('/api/dual-conversation/save', {
        method: 'POST',
        body: formData
      });
      
      console.log("Save response status:", saveResponse.status);
      
      // If the save request was not successful, try to get more detailed error info
      if (!saveResponse.ok) {
        const errorData = await saveResponse.json().catch(e => ({ error: "Could not parse error response" }));
        console.error("Server error details:", errorData);
        
        // Provide specific error messages based on status codes
        if (saveResponse.status === 413) {
          throw new Error('Audio file is too large to upload. Try a shorter recording.');
        } else if (saveResponse.status === 415) {
          throw new Error('Unsupported audio format. Please try again with a different browser.');
        } else if (saveResponse.status === 400) {
          throw new Error(errorData.message || 'Invalid request: ' + (errorData.error || 'unknown error'));
        } else {
          throw new Error(errorData.message || 'Failed to save audio: ' + (errorData.error || 'Server error'));
        }
      }
      
      // If we get here, the save was successful
      const saveData = await saveResponse.json();
      console.log("Audio saved successfully:", saveData);
      const audioUrl = saveData.audioUrl;
      
      // Then request transcription with participant names
      const transcribeParams = new URLSearchParams({
        configId: configId.toString(),
        sessionId,
        audioUrl,
        participant1Name,
        participant2Name
      });
      
      console.log("Requesting transcription...");
      
      const transcribeResponse = await fetch(`/api/dual-conversation/transcribe?${transcribeParams.toString()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log("Transcribe response status:", transcribeResponse.status);
      
      if (!transcribeResponse.ok) {
        const errorData = await transcribeResponse.json().catch(e => ({ error: "Could not parse error response" }));
        console.error("Transcription error details:", errorData);
        throw new Error(errorData.message || 'Failed to transcribe audio: ' + (errorData.error || 'Server error'));
      }
      
      const transcriptData = await transcribeResponse.json();
      console.log("Transcription completed:", transcriptData);
      
      // Make sure we have a valid transcript array
      const transcriptArray = transcriptData.transcript || [];
      setTranscript(transcriptArray);
      
      // Check if we received a note indicating mock data
      if (transcriptData.note) {
        console.log("Note from server:", transcriptData.note);
        toast({
          title: "Sample Data Notice",
          description: transcriptData.note,
          duration: 6000
        });
      }
      
      if (onTranscriptReady) {
        onTranscriptReady(transcriptArray);
      }
      
      toast({
        title: "Success!",
        description: "Your conversation has been processed and is ready for feedback.",
      });
    } catch (error) {
      console.error("Error processing recording:", error);
      
      // Try to provide more specific error messages
      let errorMessage = error instanceof Error ? error.message : "Failed to process audio";
      let errorTitle = "Processing Failed";
      
      if (errorMessage.includes("quota")) {
        errorTitle = "API Quota Exceeded";
        errorMessage = "The OpenAI API quota has been exceeded. Please add a payment method to your OpenAI account or wait until the quota resets.";
      } else if (errorMessage.includes("too large")) {
        errorTitle = "File Too Large";
        errorMessage = "The recording exceeds the maximum file size. Try recording a shorter conversation.";
      } else if (errorMessage.includes("network") || errorMessage.includes("connection")) {
        errorTitle = "Network Error";
        errorMessage = "There was a problem with your internet connection. Please check your connection and try again.";
      }
      
      toast({
        title: errorTitle,
        description: errorMessage,
        variant: "destructive",
        duration: 6000
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
      <CardContent className="space-y-4">
        
        {audioUrl && transcript.length === 0 && (
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
      {/* Only show card footer with buttons if transcript is not ready */}
      {transcript.length === 0 && (
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
      )}
    </Card>
  );
}
