import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart, MessageSquare } from "lucide-react";

interface DualConversationFeedback {
  participant1: {
    bullets: string[];
    score: number;
    summary: string | null;
  };
  participant2: {
    bullets: string[];
    score: number;
    summary: string | null;
  };
  overall: {
    bullets: string[];
    summary: string | null;
  };
}

interface TranscriptEntry {
  role: 'participant1' | 'participant2';
  content: string;
  timestamp: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feedback: DualConversationFeedback | null;
  transcript: TranscriptEntry[];
}

export default function FeedbackModal({
  open,
  onOpenChange,
  feedback,
  transcript
}: Props) {
  if (!feedback) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Conversation Feedback</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden">
          <Tabs defaultValue="overall">
            <TabsList className="mb-4">
              <TabsTrigger value="overall">Overall</TabsTrigger>
              <TabsTrigger value="participant1">Participant 1</TabsTrigger>
              <TabsTrigger value="participant2">Participant 2</TabsTrigger>
              <TabsTrigger value="transcript">Transcript</TabsTrigger>
            </TabsList>
            
            <TabsContent value="overall" className="h-full overflow-auto">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <BarChart className="h-5 w-5 mr-2" />
                    Overall Feedback
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {feedback.overall?.bullets?.map((bullet: string, i: number) => (
                      <div key={i} className="flex items-start">
                        <span className="text-sm text-gray-700 mr-2">•</span>
                        <p className="text-sm text-gray-700">{bullet}</p>
                      </div>
                    ))}
                    
                    {feedback.overall?.summary && (
                      <div className="mt-4 pt-4 border-t">
                        <p className="font-medium text-gray-800">{feedback.overall.summary}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="participant1" className="h-full overflow-auto">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Feedback for Participant 1</span>
                    {feedback.participant1?.score && (
                      <span className="text-2xl font-bold text-blue-600">{feedback.participant1.score}/10</span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {feedback.participant1?.bullets?.map((bullet: string, i: number) => (
                      <div key={i} className="flex items-start p-3 rounded-md bg-blue-50">
                        <span className="font-medium text-blue-700 mr-2">•</span>
                        <p className="text-blue-700">{bullet}</p>
                      </div>
                    ))}
                    
                    {feedback.participant1?.summary && (
                      <div className="mt-6 pt-4 border-t">
                        <p className="font-medium text-gray-800">{feedback.participant1.summary}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="participant2" className="h-full overflow-auto">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Feedback for Participant 2</span>
                    {feedback.participant2?.score && (
                      <span className="text-2xl font-bold text-green-600">{feedback.participant2.score}/10</span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {feedback.participant2?.bullets?.map((bullet: string, i: number) => (
                      <div key={i} className="flex items-start p-3 rounded-md bg-green-50">
                        <span className="font-medium text-green-700 mr-2">•</span>
                        <p className="text-green-700">{bullet}</p>
                      </div>
                    ))}
                    
                    {feedback.participant2?.summary && (
                      <div className="mt-6 pt-4 border-t">
                        <p className="font-medium text-gray-800">{feedback.participant2.summary}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="transcript" className="h-full overflow-auto">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <MessageSquare className="h-5 w-5 mr-2" />
                    Conversation Transcript
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-4">
                      {transcript.map((entry, index) => (
                        <div 
                          key={index} 
                          className={`p-3 rounded-lg ${
                            entry.role === 'participant1' ? 'bg-blue-50 ml-0 mr-12' : 'bg-green-50 ml-12 mr-0'
                          }`}
                        >
                          <div className="font-medium mb-1">
                            {entry.role === 'participant1' ? 'Participant 1' : 'Participant 2'}
                          </div>
                          <p>{entry.content}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}