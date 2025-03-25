import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, UserRound, Users } from 'lucide-react';

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
  if (!feedback) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Conversation Feedback</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="overall" className="w-full overflow-hidden">
          <TabsList className="grid grid-cols-3 mb-4">
            <TabsTrigger value="overall">
              <Users className="h-4 w-4 mr-2" />
              Overall Feedback
            </TabsTrigger>
            <TabsTrigger value="participant1">
              <UserRound className="h-4 w-4 mr-2" />
              Participant 1
            </TabsTrigger>
            <TabsTrigger value="participant2">
              <UserRound className="h-4 w-4 mr-2" />
              Participant 2
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="overall" className="overflow-hidden">
            <Card>
              <CardHeader>
                <CardTitle>Overall Feedback</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[50vh]">
                  <div className="space-y-4">
                    {feedback.overall?.bullets?.map((bullet, i) => (
                      <div key={i} className="flex items-start p-3 rounded-md bg-gray-50">
                        <span className="font-medium text-gray-700 mr-2">•</span>
                        <p className="text-gray-700">{bullet}</p>
                      </div>
                    ))}
                    
                    {feedback.overall?.summary && (
                      <div className="mt-6 pt-4 border-t">
                        <p className="font-medium text-gray-800">{feedback.overall.summary}</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="participant1" className="overflow-hidden">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Participant 1 Feedback</span>
                  {feedback.participant1?.score && (
                    <span className="text-2xl font-bold text-blue-600">{feedback.participant1.score}/10</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[50vh]">
                  <div className="space-y-4">
                    {feedback.participant1?.bullets?.map((bullet, i) => (
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
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="participant2" className="overflow-hidden">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Participant 2 Feedback</span>
                  {feedback.participant2?.score && (
                    <span className="text-2xl font-bold text-green-600">{feedback.participant2.score}/10</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[50vh]">
                  <div className="space-y-4">
                    {feedback.participant2?.bullets?.map((bullet, i) => (
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
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        
        <DialogFooter className="flex justify-between items-center">
          <div className="flex-1">
            <Button 
              variant="outline" 
              className="mr-2"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            <Button 
              variant="outline"
              onClick={() => {
                // Add logic to view transcript if needed
                onOpenChange(false);
              }}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              View Conversation
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}