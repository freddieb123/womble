
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, Users, MessageSquare, FileAudio, BarChart } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ScrollArea } from '../components/ui/scroll-area';
import { useToast } from '../components/ui/use-toast';
import DualConversationRecorder from '../components/DualConversationRecorder';
import { v4 as uuidv4 } from 'uuid';

interface DualConversationPageProps {}

export default function DualConversationPage({}: DualConversationPageProps) {
  const { id: configId } = useParams<{ id: string }>();
  const parsedConfigId = configId ? parseInt(configId) : undefined;
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionId] = useState(uuidv4());
  const [conversations, setConversations] = useState<any[]>([]);
  const [transcript, setTranscript] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<any | null>(null);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
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
        
        // Fetch existing conversations
        const conversationsResponse = await fetch(`/api/dual-conversations/${parsedConfigId}`);
        if (conversationsResponse.ok) {
          const conversationsData = await conversationsResponse.json();
          setConversations(conversationsData);
        }
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
      const response = await fetch(`/api/dual-conversation/feedback?configId=${parsedConfigId}&sessionId=${sessionId}`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error("Failed to generate feedback");
      }
      
      const feedbackData = await response.json();
      setFeedback(feedbackData);
      
      // Refresh conversations list
      const conversationsResponse = await fetch(`/api/dual-conversations/${parsedConfigId}`);
      if (conversationsResponse.ok) {
        const conversationsData = await conversationsResponse.json();
        setConversations(conversationsData);
      }
      
      toast({
        title: "Feedback generated",
        description: "Conversation feedback is now available.",
      });
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
        <Link to="/dashboard">
          <Button variant="outline">Return to Dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center mb-6">
        <Link to="/dashboard">
          <Button variant="ghost" className="mr-2">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">{config?.title || 'Conversation Analysis'}</h1>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="h-5 w-5 mr-2" />
                New Conversation
              </CardTitle>
              <CardDescription>
                Record a conversation between two people and get feedback
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DualConversationRecorder 
                configId={parsedConfigId || 0} 
                sessionId={sessionId}
                onTranscriptReady={handleTranscriptReady}
              />
              
              {transcript.length > 0 && (
                <div className="mt-4">
                  <Button 
                    onClick={generateFeedback}
                    disabled={isGeneratingFeedback}
                    className="w-full"
                  >
                    {isGeneratingFeedback ? 'Generating Feedback...' : 'Generate Feedback'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          
          {feedback && (
            <Card className="mt-6">
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
          )}
        </div>
        
        <div className="md:col-span-2">
          {feedback ? (
            <Tabs defaultValue="participant1">
              <TabsList className="mb-4">
                <TabsTrigger value="participant1">
                  {feedback.participant1 ? config?.participant1Name || 'Participant 1' : 'Participant 1'}
                </TabsTrigger>
                <TabsTrigger value="participant2">
                  {feedback.participant2 ? config?.participant2Name || 'Participant 2' : 'Participant 2'}
                </TabsTrigger>
                <TabsTrigger value="transcript">Transcript</TabsTrigger>
                <TabsTrigger value="previous">Previous Conversations</TabsTrigger>
              </TabsList>
              
              <TabsContent value="participant1">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Feedback for {feedback.participant1 ? config?.participant1Name || 'Participant 1' : 'Participant 1'}</span>
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
              
              <TabsContent value="participant2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Feedback for {feedback.participant2 ? config?.participant2Name || 'Participant 2' : 'Participant 2'}</span>
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
              
              <TabsContent value="transcript">
                <Card>
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
                              {entry.role === 'participant1' 
                                ? config?.participant1Name || 'Participant 1' 
                                : config?.participant2Name || 'Participant 2'}
                            </div>
                            <p>{entry.content}</p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="previous">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <FileAudio className="h-5 w-5 mr-2" />
                      Previous Conversations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[500px]">
                      {conversations.length === 0 ? (
                        <p className="text-gray-500 text-center py-8">No previous conversations found</p>
                      ) : (
                        <div className="space-y-4">
                          {conversations.map((conv, idx) => (
                            <Card key={idx} className="mb-4 shadow-sm">
                              <CardHeader className="pb-2">
                                <CardTitle className="text-lg flex justify-between">
                                  <span>
                                    {conv.participant1Name || 'Participant 1'} & {conv.participant2Name || 'Participant 2'}
                                  </span>
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                {conv.feedback ? (
                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                      <h4 className="font-medium text-blue-700">
                                        {conv.participant1Name || 'Participant 1'}: {conv.feedback.participant1?.score}/10
                                      </h4>
                                      <p className="text-sm text-gray-600">{conv.feedback.participant1?.summary}</p>
                                    </div>
                                    <div className="space-y-2">
                                      <h4 className="font-medium text-green-700">
                                        {conv.participant2Name || 'Participant 2'}: {conv.feedback.participant2?.score}/10
                                      </h4>
                                      <p className="text-sm text-gray-600">{conv.feedback.participant2?.summary}</p>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-gray-500">No feedback available</p>
                                )}
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Previous Conversations</CardTitle>
                <CardDescription>View past conversations and their feedback</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  {conversations.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">No previous conversations found</p>
                  ) : (
                    <div className="space-y-4">
                      {conversations.map((conv, idx) => (
                        <Card key={idx} className="mb-4 shadow-sm">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-lg flex justify-between">
                              <span>
                                {conv.participant1Name || 'Participant 1'} & {conv.participant2Name || 'Participant 2'}
                              </span>
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            {conv.feedback ? (
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <h4 className="font-medium text-blue-700">
                                    {conv.participant1Name || 'Participant 1'}: {conv.feedback.participant1?.score}/10
                                  </h4>
                                  <p className="text-sm text-gray-600">{conv.feedback.participant1?.summary}</p>
                                </div>
                                <div className="space-y-2">
                                  <h4 className="font-medium text-green-700">
                                    {conv.participant2Name || 'Participant 2'}: {conv.feedback.participant2?.score}/10
                                  </h4>
                                  <p className="text-sm text-gray-600">{conv.feedback.participant2?.summary}</p>
                                </div>
                              </div>
                            ) : (
                              <p className="text-gray-500">No feedback available</p>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
