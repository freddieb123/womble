import { useState } from "react";
import { Card, CardHeader, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Copy, ExternalLink, MoreVertical, BarChart2, Trash2, ArrowUpCircle, Flag, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import AdminPanel from "@/components/AdminPanel";
import type { AdminConfig } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import TemplateGallery from "@/components/TemplateGallery";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut } from "lucide-react";
import QuizEditor from "@/components/QuizEditor";
import type { Template } from "@/lib/types"; // Add this import

type ChatConfig = {
  id: number;
  title: string;
  type: 'chat' | 'upload' | 'quiz';
  systemPrompt: string;
  userInstructions: string | null;
  feedbackCriteria: string | null;
  createdAt: string;
  conversationCount: number;
  deleted?: boolean;
  deletedAt?: string;
  isTemplate?: boolean;
  templateDescription?: string;
  questions?: Array<{
    question: string;
    expectedAnswer: string;
  }>;
  quizQuestions?: Array<{
    id: number;
    question: string;
    expectedAnswer: string;
    orderIndex: number;
  }>;
  temperature?: number;
  maxTokens?: number;
  userId?: number; //Added userId
};

export default function Home() {
  const { logoutMutation, user } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isTemplateGalleryOpen, setIsTemplateGalleryOpen] = useState(false);
  const [isPreviewingTemplate, setIsPreviewingTemplate] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ChatConfig | null>(null);
  const [deletingConfig, setDeletingConfig] = useState<ChatConfig | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [viewingFeedbackConfig, setViewingFeedbackConfig] = useState<ChatConfig | null>(null);
  const [config, setConfig] = useState<AdminConfig>({
    title: "",
    type: "chat",
    systemPrompt: "You are a helpful AI assistant.",
    userInstructions: "",
    feedbackCriteria: "",
    temperature: 0.7,
    maxTokens: 1000,
    questions: []
  });
  const [savingAsTemplate, setSavingAsTemplate] = useState<ChatConfig | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: configs, isLoading } = useQuery<ChatConfig[]>({
    queryKey: ['/api/chat-configs', showDeleted, user?.id],
    queryFn: async () => {
      const response = await fetch(`/api/chat-configs?userId=${user?.id}${showDeleted ? '&showDeleted=true' : ''}`);
      if (!response.ok) {
        throw new Error('Failed to fetch GPTs');
      }
      const data = await response.json();
      console.log('Fetched configs:', data.map(c => ({
        id: c.id,
        title: c.title,
        isTemplate: c.isTemplate,
        userId: c.userId
      })));
      return data;
    },
    enabled: !!user?.id // Only run query when user ID is available
  });

  const saveConfig = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/chat-configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: config.title,
          type: config.type,
          systemPrompt: config.type === 'quiz' ? "Quiz Configuration" : config.systemPrompt,
          userInstructions: config.type === 'quiz' ? "" : config.userInstructions || "",
          feedbackCriteria: config.type === 'quiz' ? "" : config.feedbackCriteria || "",
          questions: config.type === 'quiz' ? config.questions : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save GPT");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat-configs'] });
      setIsCreateOpen(false);
      setIsPreviewingTemplate(false);
      setIsTemplateGalleryOpen(false);
      setConfig({
        title: "",
        type: "chat",
        systemPrompt: "You are a helpful AI assistant.",
        userInstructions: "",
        feedbackCriteria: "",
        temperature: 0.7,
        maxTokens: 1000,
        questions: []
      });
      toast({
        description: "GPT saved successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const updateConfig = useMutation({
    mutationFn: async (configToUpdate: ChatConfig) => {
      const response = await fetch(`/api/chat-configs/${configToUpdate.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configToUpdate),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update GPT");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat-configs'] });
      setEditingConfig(null);
      toast({
        description: "GPT updated successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const deleteConfig = useMutation({
    mutationFn: async (configToDelete: ChatConfig) => {
      const response = await fetch(`/api/chat-configs/${configToDelete.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete GPT");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat-configs'] });
      setDeletingConfig(null);
      toast({
        description: "GPT deleted successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const restoreConfig = useMutation({
    mutationFn: async (configToRestore: ChatConfig) => {
      const response = await fetch(`/api/chat-configs/${configToRestore.id}/restore`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to restore GPT");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat-configs'] });
      toast({
        description: "GPT restored successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const saveAsTemplate = useMutation({
    mutationFn: async (configToTemplate: ChatConfig) => {
      console.log('Saving template with description:', configToTemplate.templateDescription);
      const response = await fetch(`/api/chat-configs/${configToTemplate.id}/template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateDescription: configToTemplate.templateDescription })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save as template");
      }

      const result = await response.json();
      console.log('Template save response:', result);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat-configs'] });
      setSavingAsTemplate(null);
      toast({
        description: "GPT saved as public template successfully! It will remain in your list and be available in the template gallery.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const handleCopyLink = async (configId: number) => {
    try {
      const url = `${window.location.origin}/chat?configId=${configId}`;
      await navigator.clipboard.writeText(url);
      toast({
        description: "Link copied to clipboard!",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to copy link",
      });
    }
  };

  const handleViewFeedback = (configToView: ChatConfig) => {
    window.open(`${window.location.origin}/analysis?configId=${configToView.id}`, '_blank');
  };

  const handleDuplicate = async (configToDuplicate: ChatConfig) => {
    try {
      // Fetch the full config including quiz questions if it's a quiz
      let fullConfig = configToDuplicate;
      if (configToDuplicate.type === 'quiz') {
        const response = await fetch(`/api/chat-configs/${configToDuplicate.id}`);
        if (!response.ok) {
          throw new Error("Failed to fetch full config");
        }
        fullConfig = await response.json();
      }

      setConfig({
        title: `${fullConfig.title} (Copy)`,
        type: fullConfig.type,
        systemPrompt: fullConfig.systemPrompt,
        userInstructions: fullConfig.userInstructions || "",
        feedbackCriteria: fullConfig.feedbackCriteria || "",
        temperature: 0.7,
        maxTokens: 1000,
        questions: fullConfig.questions || []
      });
      setIsCreateOpen(true);
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to duplicate GPT",
      });
    }
  };

  const handleTemplateSelect = async (template: ChatConfig) => {
    try {
      // Fetch the full config including quiz questions if it's a quiz
      let fullConfig = template;
      if (template.type === 'quiz') {
        const response = await fetch(`/api/chat-configs/${template.id}`);
        if (!response.ok) {
          throw new Error("Failed to fetch full template config");
        }
        fullConfig = await response.json();
      }

      setConfig({
        title: `${fullConfig.title} (Copy)`,
        type: fullConfig.type,
        systemPrompt: fullConfig.systemPrompt,
        userInstructions: fullConfig.userInstructions || "",
        feedbackCriteria: fullConfig.feedbackCriteria || "",
        temperature: 0.7,
        maxTokens: 1000,
        questions: fullConfig.questions || []
      });
      setIsPreviewingTemplate(true);
      setIsCreateOpen(true);
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load template",
      });
    }
  };

  const handleCreateModalClose = (open: boolean) => {
    setIsCreateOpen(open);
    if (!open && isPreviewingTemplate) {
      setIsPreviewingTemplate(false);
      setIsTemplateGalleryOpen(true);
    }
  };

  const handleStartFromScratch = () => {
    setConfig({
      title: "",
      type: "chat",
      systemPrompt: "You are a helpful AI assistant.",
      userInstructions: "",
      feedbackCriteria: "",
      temperature: 0.7,
      maxTokens: 1000,
      questions: []
    });
    setIsTemplateGalleryOpen(false);
    setIsCreateOpen(true);
  };


  const handleEditConfig = async (configToEdit: ChatConfig) => {
    try {
      // Fetch the full config including quiz questions
      const response = await fetch(`/api/chat-configs/${configToEdit.id}`);
      if (!response.ok) {
        throw new Error("Failed to fetch full config");
      }
      const fullConfig: ChatConfig = await response.json();
      // Set the editing config with full details (including questions)
      setEditingConfig(fullConfig);
    } catch (error) {
      console.error(error);
      // Optionally show a toast notification here
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <Card className="p-6">
            <CardContent>Loading GPTs...</CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-start mb-6">
          <div className="w-full flex flex-col items-center gap-4">
            <div className="self-start">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative size-8 rounded-full">
                    <Avatar className="size-8 shadow-md">
                      <AvatarFallback className="bg-blue-900 text-white">
                        {user?.firstName
                          ? user.firstName[0].toUpperCase()
                          : user?.email
                            ? user.email[0].toUpperCase()
                            : '✓'}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => logoutMutation.mutate()}>
                    <LogOut className="mr-2 size-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
                
              </DropdownMenu>
            </div>
            <h1 className="text-2xl font-bold text-blue-900 text-center">Admin Home</h1>
          </div>
          <Dialog open={isTemplateGalleryOpen} onOpenChange={setIsTemplateGalleryOpen}>
            <DialogTrigger asChild>
              <Button className="bg-purple-800 hover:bg-purple-900">
                <Plus className="h-4 w-4 mr-2" />
                New GPT
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <TemplateGallery
                onSelectTemplate={handleTemplateSelect}
                onStartFromScratch={handleStartFromScratch}
                templates={(configs?.filter(c => c.isTemplate) || []).map(template => ({
                  ...template,
                  temperature: template.temperature || 0.7,
                  maxTokens: template.maxTokens || 1000,
                  usageCount: configs?.filter(c =>
                    !c.isTemplate &&
                    c.systemPrompt === template.systemPrompt &&
                    c.type === template.type
                  ).length || 0
                }))}
              />
            </DialogContent>
          </Dialog>

          <Dialog open={isCreateOpen} onOpenChange={handleCreateModalClose}>
            <DialogContent className="max-w-2xl h-[80vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>Create New GPT</DialogTitle>
              </DialogHeader>
              <ScrollArea className="flex-1 -mx-6 px-6">
                <div className="py-4">
                  <AdminPanel config={config} onConfigChange={setConfig} />
                </div>
              </ScrollArea>
              <div className="pt-4 border-t flex justify-end">
                <Button onClick={() => saveConfig.mutate()} disabled={saveConfig.isPending}>
                  Save GPT
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <ScrollArea className="h-[calc(100vh-12rem)]">
            <div className="space-y-4">
              {(!configs || configs.length === 0) ? (
                <div className="flex flex-col items-center justify-center h-[60vh] text-center">
                  <div className="w-48 h-48 mb-6 relative">
                    <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-blue-100">
                      <path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2"/>
                      <path d="M12 8V12L14.5 14.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">Get Started with GPTs</h2>
                  <p className="text-gray-600 max-w-md mb-8">
                    Start getting bespoke formative feedback to your participants. You can create quizzes, give feedback on screenshots of documents or create practice conversations.
                  </p>
                  <Dialog open={isTemplateGalleryOpen} onOpenChange={setIsTemplateGalleryOpen}>
                    <Button 
                      size="lg"
                      onClick={() => setIsTemplateGalleryOpen(true)}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create your first GPT
                    </Button>
                  </Dialog>
                </div>
              ) : (
                configs.map((config) => (
              <Card
                key={config.id}
                className={`p-6 ${config.deleted ? 'opacity-60' : ''}`}
              >
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle>{config.title}</CardTitle>
                        <Badge
                          variant={config.type === 'chat' ? 'default' : config.type === 'upload' ? 'secondary' : 'outline'}
                          className={
                            config.type === 'chat' ? 'bg-green-100 text-green-800' :
                              config.type === 'upload' ? 'bg-purple-100 text-purple-800' :
                                'bg-blue-100 text-blue-800'
                          }
                        >
                          {config.type === 'chat' ? 'conversation' :
                            config.type === 'upload' ? 'upload' : 'quiz'}
                        </Badge>
                        {config.isTemplate && (
                          <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200 flex items-center gap-1">
                            <Flag className="h-3 w-3" />
                            Public Template
                          </Badge>
                        )}
                      </div>
                      <CardDescription>
                        Created on: {new Date(config.createdAt).toLocaleDateString()}
                        {config.deleted && config.deletedAt && (
                          <span className="text-red-500 ml-2">
                            (Deleted on: {new Date(config.deletedAt).toLocaleDateString()})
                          </span>
                        )}
                      </CardDescription>
                    </div>
                    <div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {!config.deleted ? (
                            <>
                              <DropdownMenuItem onClick={() => handleEditConfig(config)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDuplicate(config)}>
                                <Copy className="h-4 w-4 mr-2" />
                                Duplicate
                              </DropdownMenuItem>
                              {!config.isTemplate && (
                                <DropdownMenuItem onClick={() => setSavingAsTemplate(config)}>
                                  <Flag className="h-4 w-4 mr-2" />
                                  Save as Public Template
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => setDeletingConfig(config)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => restoreConfig.mutate(config)}
                            >
                              <ArrowUpCircle className="h-4 w-4 mr-2" />
                              Restore
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Dialog open={editingConfig?.id === config.id} onOpenChange={(open) => !open && setEditingConfig(null)}>
                        <DialogContent className="max-w-2xl h-[80vh] flex flex-col">
                          <DialogHeader>
                            <DialogTitle>Edit GPT</DialogTitle>
                            <DialogDescription>
                              Modify your GPT configuration below.
                            </DialogDescription>
                          </DialogHeader>
                          {editingConfig && (
                            <>
                              <ScrollArea className="flex-1 -mx-6 px-6">
                                <div className="py-4">
                                  {editingConfig.type === 'quiz' ? (
                                    <QuizEditor
                                      config={{
                                        title: editingConfig.title,
                                        type: editingConfig.type,
                                        systemPrompt: editingConfig.systemPrompt,
                                        userInstructions: editingConfig.userInstructions || "",
                                        feedbackCriteria: editingConfig.feedbackCriteria || "",
                                        temperature: 0.7,
                                        maxTokens: 1000,
                                        questions: editingConfig.questions || []
                                      }}
                                      onConfigChange={(updatedConfig) => {
                                        console.log('QuizEditor onConfigChange called with:', updatedConfig);
                                        console.log('Current editingConfig:', editingConfig);
                                        setEditingConfig(prev => {
                                          const updated = prev ? {
                                            ...prev,
                                            title: updatedConfig.title,
                                            questions: updatedConfig.questions
                                          } : null;
                                          console.log('Updated editingConfig:', updated);
                                          return updated;
                                        });
                                      }}
                                    />
                                  ) : (
                                    <AdminPanel
                                      config={{
                                        title: editingConfig.title,
                                        type: editingConfig.type,
                                        systemPrompt: editingConfig.systemPrompt,
                                        userInstructions: editingConfig.userInstructions || "",
                                        feedbackCriteria: editingConfig.feedbackCriteria || "",
                                        temperature: 0.7,
                                        maxTokens: 1000,
                                        questions: editingConfig.questions || []
                                      }}
                                      onConfigChange={(updatedConfig) => {
                                        setEditingConfig({
                                          ...editingConfig,
                                          title: updatedConfig.title,
                                          type: updatedConfig.type,
                                          systemPrompt: updatedConfig.systemPrompt,
                                          userInstructions: updatedConfig.userInstructions || null,
                                          feedbackCriteria: updatedConfig.feedbackCriteria || null,
                                          questions: updatedConfig.questions || []
                                        });
                                      }}
                                      isEditMode={true}
                                    />
                                  )}
                                </div>
                              </ScrollArea>
                              <div className="pt-4 border-t flex justify-end">
                                <Button
                                  onClick={() => editingConfig && updateConfig.mutate(editingConfig)}
                                  disabled={updateConfig.isPending}
                                >
                                  Update GPT
                                </Button>
                              </div>
                            </>
                          )}
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      {config.type === 'quiz' ? (
                        <>
                        </>
                      ) : (
                        <>
                          <h3 className="font-semibold mb-1">System Prompt</h3>
                          <p className="text-sm text-gray-600">
                            {config.systemPrompt.split(' ').slice(0, 30).join(' ')}
                            {config.systemPrompt.split(' ').length > 30 ? '...' : ''}
                          </p>
                        </>
                      )}
                    </div>
                    {config.userInstructions && (
                      <div>
                        <h3 className="font-semibold mb-1">User Instructions</h3>
                        <p className="text-sm text-gray-600">{config.userInstructions}</p>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleCopyLink(config.id)}>
                          <Share2 className="h-4 w-4 mr-2" />
                          Share GPT
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleViewFeedback(config)}
                          disabled={config.type === 'chat' ? (!config.feedbackCriteria || config.conversationCount === 0) : config.conversationCount === 0}
                        >
                          <BarChart2 className="h-4 w-4 mr-2" />
                          <span className="md:hidden">View Feedback</span>
                          <span className="hidden md:inline">View Current Feedback</span>
                        </Button>
                      </div>
                      <span className="hidden md:inline text-sm text-muted-foreground">
                        {config.conversationCount} submission{config.conversationCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
                ))
              )}
            </div>
          </ScrollArea>
      </div>
      <AlertDialog
        open={deletingConfig !== null}
        onOpenChange={(open) => !open && setDeletingConfig(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the GPT
              "{deletingConfig?.title}" and all associated conversations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deletingConfig && deleteConfig.mutate(deletingConfig)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={savingAsTemplate !== null}
        onOpenChange={(open) => !open && setSavingAsTemplate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save as Public Template?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>This will make "{savingAsTemplate?.title}" available as a public template for other users.</p>
              <div className="space-y-2">
                <label htmlFor="templateDescription" className="text-sm font-medium">
                  Template Description (Required)
                </label>
                <textarea
                  id="templateDescription"
                  className="w-full min-h-[100px] px-3 py-2 text-sm rounded-md border border-input bg-transparent"
                  placeholder="Describe what this template is for and how it can be used..."
                  value={savingAsTemplate?.templateDescription || ""}
                  onChange={(e) =>
                    setSavingAsTemplate(prev =>
                      prev ? { ...prev, templateDescription: e.target.value } : null
                    )
                  }
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => savingAsTemplate && saveAsTemplate.mutate(savingAsTemplate)}
              disabled={!savingAsTemplate?.templateDescription?.trim()}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}