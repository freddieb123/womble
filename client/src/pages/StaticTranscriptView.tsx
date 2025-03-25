import React, { useEffect, useState } from 'react';
import { useRoute } from 'wouter';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, MessageSquare } from 'lucide-react';

interface TranscriptEntry {
  role: 'participant1' | 'participant2';
  content: string;
  timestamp: number;
}

interface DualConversation {
  sessionId: string;
  participant1Name: string;
  participant2Name: string;
  transcript: TranscriptEntry[];
  createdAt: string;
}

export default function StaticTranscriptView() {
  const [, params] = useRoute('/transcript/:configId/:sessionId');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<DualConversation | null>(null);
  const [requestSent, setRequestSent] = useState(false);

  useEffect(() => {
    if (!params?.configId || !params?.sessionId || requestSent) {
      return;
    }
    
    const fetchData = async () => {
      try {
        setLoading(true);
        setRequestSent(true);
        
        console.log('StaticTranscriptView - Fetching data with:', {
          configId: params.configId,
          sessionId: params.sessionId
        });
        
        const url = `/api/dual-conversations/${params.configId}?sessionId=${params.sessionId}`;
        console.log('Making request to:', url);
        
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch conversation: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('StaticTranscriptView - Response data:', data);
        
        if (!data || !data.length) {
          throw new Error('No conversation data found');
        }
        
        setConversation(data[0]);
      } catch (err) {
        console.error('Error fetching conversation:', err);
        setError(err instanceof Error ? err.message : 'Failed to load conversation');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [params, requestSent]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
        <span className="ml-2 text-gray-600">Loading transcript...</span>
      </div>
    );
  }

  if (error || !conversation) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-3xl mx-4">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-700">Transcript Not Found</h2>
              <p className="text-gray-500 mt-2">{error || 'Unable to load the conversation transcript'}</p>
              <Button className="mt-6" onClick={() => window.close()}>Close</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { participant1Name, participant2Name, transcript } = conversation;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto max-w-4xl px-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Conversation Transcript</span>
              <Button variant="outline" size="sm" onClick={() => window.close()}>
                Close
              </Button>
            </CardTitle>
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Conversation Transcript</span>
            </div>
          </CardHeader>
          
          <CardContent>
            <ScrollArea className="h-[70vh]">
              <div className="space-y-4">
                {transcript.map((entry, index) => (
                  <div 
                    key={index} 
                    className={`p-4 rounded-lg ${
                      entry.role === 'participant1' 
                        ? 'bg-blue-50 border-l-4 border-blue-300' 
                        : 'bg-green-50 border-l-4 border-green-300'
                    }`}
                  >
                    <div className="font-medium text-sm mb-1">
                      {entry.role === 'participant1' ? 'Participant 1' : 'Participant 2'}
                    </div>
                    <div className="text-sm">{entry.content}</div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
          
          <CardFooter className="justify-end border-t pt-4">
            <Button variant="outline" onClick={() => window.print()}>
              Print Transcript
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}