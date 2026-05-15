import { useState } from "react";
import { Card, CardHeader, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus, Pencil, Copy, MoreVertical, BarChart2, Trash2, ArrowUpCircle, Flag, Share2, EyeOff, Keyboard, Mic, MessageSquare, Users, GraduationCap, Brain, HelpCircle, Upload, LogOut, LayoutGrid } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { track, EventName } from "@/lib/mixpanel";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import AdminPanel from "@/components/AdminPanel";
import CreateGptWizard from "@/components/CreateGptWizard";
import type { AdminConfig } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
} from "@/components/ui/alert-dialog";
import TemplateGallery from "@/components/TemplateGallery";
import QuizEditor from "@/components/QuizEditor";
import type { Template } from "@/lib/types";

const FILTER_TYPES = [
  { type: 'all', label: 'All Agents', icon: LayoutGrid },
  { type: 'chat', label: 'Conversation with AI', icon: MessageSquare },
  { type: 'two-way-conversation', label: 'Two-way Conversation', icon: Users },
  { type: 'teach-ai', label: 'Teach an AI', icon: GraduationCap },
  { type: 'thought-partner', label: 'Thought Partner', icon: Brain },
] as const;

type FilterType = typeof FILTER_TYPES[number]['type'];

type ChatConfig = {
  id: number;
  title: string;
  type: 'chat' | 'upload' | 'quiz' | 'two-way-conversation' | 'teach-ai' | 'thought-partner';
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
  userId?: number;
  interactionMode?: 'typed' | 'spoken' | 'both';
};

export default function Home() {
  const { logoutMutation, user } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [wizardPrefill, setWizardPrefill] = useState<AdminConfig | undefined>(undefined);
  const [isTemplateGalleryOpen, setIsTemplateGalleryOpen] = useState(false);
  const [isPreviewingTemplate, setIsPreviewingTemplate] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ChatConfig | null>(null);
  const [deletingConfig, setDeletingConfig] = useState<ChatConfig | null>(null);
  const [showDeleted] = useState(false);
  const [viewingFeedbackConfig, setViewingFeedbackConfig] = useState<ChatConfig | null>(null);
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');

  const getInitials = (): string => {
    if (!user) return 'U';
    if (user.firstName) {
      return `${user.firstName.charAt(0)}${(user.lastName || '').charAt(0)}`.toUpperCase();
    }
    return user.email?.charAt(0).toUpperCase() ?? 'U';
  };
  const [config, setConfig] = useState<AdminConfig>({
    title: "",
    type: "chat",
    systemPrompt: "Act as a...",
    userInstructions: "",
    feedbackCriteria: "",
    temperature: 0.7,
    maxTokens: 1000,
    questions: []
  });
  const [savingAsTemplate, setSavingAsTemplate] = useState<ChatConfig | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: configs, isLoading } = useQuery<ChatConfig[]>({
    queryKey: ['/api/chat-configs', showDeleted, user?.id],
    queryFn: async () => {
      const response = await fetch(`/api/chat-configs?userId=${user?.id}${showDeleted ? '&showDeleted=true' : ''}`);
      if (!response.ok) {
        throw new Error('Failed to fetch Agents');
      }
      const data = await response.json();
      console.log('Fetched configs:', data.map((c: ChatConfig) => ({
        id: c.id,
        title: c.title,
        isTemplate: c.isTemplate,
        userId: c.userId
      })));
      return data;
    },
    enabled: !!user?.id,
    refetchInterval: 15_000,
  });

  const saveConfig = useMutation({
    mutationFn: async (configToSave?: AdminConfig) => {
      const c = configToSave || config;
      const response = await fetch("/api/chat-configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: c.title,
          type: c.type,
          systemPrompt: c.type === 'quiz' ? "Quiz Configuration" : c.systemPrompt,
          userInstructions: c.type === 'quiz' ? "" : c.userInstructions || "",
          feedbackCriteria: c.type === 'quiz' ? "" : c.feedbackCriteria || "",
          questions: c.type === 'quiz' ? c.questions : undefined,
          participant1Role: c.participant1Role ?? null,
          participant2Role: c.participant2Role ?? null,
          knowledgeLevel: c.knowledgeLevel ?? null,
          attitude: c.attitude ?? null,
          coachingStyle: c.coachingStyle ?? null,
          referenceContent: c.referenceContent ?? null,
          referenceImages: c.referenceImages ?? null,
          interactionMode: c.interactionMode ?? 'both',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save Agent");
      }

      return response.json();
    },
    onSuccess: (data) => {
      // Track GPT creation event
      track(EventName.GPT_CONFIRM_CREATION, { 
        type: config.type, 
        hasQuestions: config.type === 'quiz' && (config.questions?.length ?? 0) > 0
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/chat-configs'] });
      setIsCreateOpen(false);
      setIsPreviewingTemplate(false);
      setIsTemplateGalleryOpen(false);
      setConfig({
        title: "",
        type: "chat",
        systemPrompt: "Act as a...",
        userInstructions: "",
        feedbackCriteria: "",
        temperature: 0.7,
        maxTokens: 1000,
        questions: []
      });
      toast({
        description: "Agent saved successfully!",
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
        throw new Error(errorData.error || "Failed to update Agent");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat-configs'] });
      setEditingConfig(null);
      toast({
        description: "Agent updated successfully!",
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
        throw new Error(error.error || "Failed to delete Agent");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat-configs'] });
      setDeletingConfig(null);
      toast({
        description: "Agent deleted successfully!",
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
        throw new Error(error.error || "Failed to restore Agent");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat-configs'] });
      toast({
        description: "Agent restored successfully!",
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
    mutationFn: async ({ id, templateDescription }: { id: number; templateDescription: string }) => {
      const response = await fetch(`/api/chat-configs/${id}/template`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ templateDescription }),
      });
      if (!response.ok) {
        throw new Error('Failed to save as template');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/chat-configs'],
      });
      toast({
        title: 'Saved as template',
        description: 'Your Agent is now available as a public template.',
      });
      setSavingAsTemplate(null);
    },
    onError: (error) => {
      toast({
        title: 'Failed to save as template',
        description: error.message,
        variant: 'destructive',
      });
    }
  });

  const removeFromTemplates = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/chat-configs/${id}/template/remove`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      if (!response.ok) {
        throw new Error('Failed to remove from templates');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/chat-configs'],
      });
      toast({
        title: 'Removed from templates',
        description: 'Your Agent is no longer available as a public template.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to remove from templates',
        description: error.message,
        variant: 'destructive',
      });
    }
  });

  const handleCopyLink = async (configId: number) => {
    try {
      const url = `${window.location.origin}/chat?configId=${configId}`;
      await navigator.clipboard.writeText(url);

      // Track GPT share link event
      track(EventName.GPT_SHARE_LINK, { configId });

      // Record share time so we can poll for new activity over the next 20 mins
      const stored = JSON.parse(localStorage.getItem('womble_shared_links') || '{}');
      stored[configId] = Date.now();
      localStorage.setItem('womble_shared_links', JSON.stringify(stored));

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

  const handleCopyMiroLink = async (configId: number) => {
    try {
      const url = `${window.location.origin}/miro?configId=${configId}`;
      await navigator.clipboard.writeText(url);
      toast({ description: "Miro link copied to clipboard!" });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to copy Miro link" });
    }
  };

  const handleViewFeedback = (configToView: ChatConfig) => {
    if (configToView.type === 'two-way-conversation') {
      window.open(`${window.location.origin}/dual-analysis?configId=${configToView.id}`, '_blank');
    } else {
      window.open(`${window.location.origin}/analysis?configId=${configToView.id}`, '_blank');
    }
  };

  const handleDuplicate = async (configToDuplicate: ChatConfig) => {
    try {
      let fullConfig = configToDuplicate;
      if (configToDuplicate.type === 'quiz') {
        const response = await fetch(`/api/chat-configs/${configToDuplicate.id}`);
        if (!response.ok) {
          throw new Error("Failed to fetch full config");
        }
        fullConfig = await response.json();
      }

      setWizardPrefill({
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
        description: "Failed to duplicate Agent",
      });
    }
  };

  const handleTemplateSelect = async (template: Template) => {
    try {
      let fullConfig = template;
      if (template.type === 'quiz') {
        const response = await fetch(`/api/chat-configs/${template.id}`);
        if (!response.ok) {
          throw new Error("Failed to fetch full template config");
        }
        fullConfig = await response.json();
      }

      setWizardPrefill({
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
    if (!open) {
      setWizardPrefill(undefined);
      if (isPreviewingTemplate) {
        setIsPreviewingTemplate(false);
        setIsTemplateGalleryOpen(true);
      }
    }
  };

  const handleStartFromScratch = () => {
    setWizardPrefill(undefined);
    setIsTemplateGalleryOpen(false);
    setIsCreateOpen(true);
  };

  const handleEditConfig = async (configToEdit: ChatConfig) => {
    try {
      const response = await fetch(`/api/chat-configs/${configToEdit.id}`);
      if (!response.ok) {
        throw new Error("Failed to fetch full config");
      }
      const fullConfig: ChatConfig = await response.json();
      setEditingConfig(fullConfig);
    } catch (error) {
      console.error(error);
    }
  };

  const navigateToLanding = () => {
    window.location.href = "/";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <Card className="p-6">
            <CardContent>Loading Agents...</CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const filteredConfigs = (configs || []).filter(c => {
    const matchesSearch = c.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || c.type === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">

      {/* ── Left Sidebar ─────────────────────────────────────── */}
      <aside className="w-64 flex-shrink-0 flex flex-col bg-white border-r border-gray-200">

        {/* Logo */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2.5 px-4 py-5 border-b border-gray-100 w-full hover:bg-gray-50 transition-colors">
              <img src="/womble-icon.svg" alt="Womble" className="h-8 w-8" />
              <span className="text-xl font-bold text-green-700">Womble</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-72 p-3 ml-2" side="right" align="start">
            <div className="space-y-2">
              <h4 className="font-bold">Womble</h4>
              <p className="text-sm">
                <span className="italic text-muted-foreground">noun</span>
                <br />
                A fictional animal inhabiting Wimbledon Common in London, characterised as clearing up litter.
              </p>
              <p className="text-sm">
                <span className="italic text-muted-foreground">verb (informal)</span>
                <br />
                Wander in a casual or relaxed way.
                <br />
                <span className="italic">"once we'd arrived back in Cambridge, we wombled quietly home"</span>
              </p>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* New Agent button */}
        <div className="px-3 pt-4 pb-2">
          <button
            onClick={() => {
              track(EventName.GPT_CREATE_CLICK, { location: 'sidebar' });
              setIsTemplateGalleryOpen(true);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-medium text-gray-700 transition-colors"
          >
            <Plus className="h-4 w-4 flex-shrink-0" />
            New Agent
          </button>
        </div>

        {/* Type filters */}
        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider px-2 mb-2 mt-2">Filter by type</p>
          {FILTER_TYPES.map(({ type, label, icon: Icon }) => {
            const count = (configs || []).filter(c => type === 'all' ? true : c.type === type).length;
            const isActive = typeFilter === type;
            if (type !== 'all' && count === 0) return null;
            return (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-colors
                  ${isActive
                    ? 'bg-gray-100 text-gray-900 font-medium'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1 text-left truncate">{label}</span>
                <span className={`text-xs tabular-nums ${isActive ? 'text-gray-500' : 'text-gray-400'}`}>{count}</span>
              </button>
            );
          })}
        </nav>

        {/* User + logout */}
        <div className="border-t border-gray-200 p-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarFallback className="bg-green-600 text-white text-xs font-medium">
                {getInitials()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user?.email}
              </p>
              {user?.firstName && (
                <p className="text-xs text-gray-400 truncate">{user?.email}</p>
              )}
            </div>
            <button
              onClick={() => logoutMutation.mutate()}
              title="Log out"
              className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Content ──────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-8 py-8">

          {/* Page header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">
              {typeFilter === 'all' ? 'All Agents' : FILTER_TYPES.find(f => f.type === typeFilter)?.label}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {filteredConfigs.length} agent{filteredConfigs.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Search */}
          {configs && configs.length > 3 && (
            <div className="mb-6">
              <input
                type="text"
                placeholder="Search agents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          )}

          {/* Agent list */}
          <div className="space-y-4">
            {filteredConfigs.length === 0 ? (
              configs?.length === 0 ? (
                /* True empty state — no agents at all */
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                    <Plus className="h-8 w-8 text-gray-400" />
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">Create your first agent</h2>
                  <p className="text-sm text-gray-500 max-w-sm mb-6">
                    Build practice conversations, quizzes, or document review activities for your learners.
                  </p>
                  <Button
                    onClick={() => {
                      track(EventName.GPT_CREATE_CLICK, { location: 'empty_state' });
                      setIsTemplateGalleryOpen(true);
                    }}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New Agent
                  </Button>
                </div>
              ) : (
                /* Filter/search returned nothing */
                <div className="text-center py-16 text-gray-400 text-sm">
                  No agents match this filter.
                </div>
              )
            ) : (
              filteredConfigs.map((config) => (
                <Card
                  key={config.id}
                  className={`${config.deleted ? 'opacity-60' : ''}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div className="min-w-0 flex-1 mr-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-base">{config.title}</CardTitle>
                          <Badge
                            variant="outline"
                            className={
                              config.type === 'chat' ? 'bg-green-50 text-green-700 border-green-200' :
                              config.type === 'upload' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                              config.type === 'two-way-conversation' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                              config.type === 'teach-ai' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                              config.type === 'thought-partner' ? 'bg-teal-50 text-teal-700 border-teal-200' :
                              'bg-gray-50 text-gray-600 border-gray-200'
                            }
                          >
                            {config.type === 'chat' ? 'Conversation with AI' :
                             config.type === 'upload' ? 'Document Review' :
                             config.type === 'two-way-conversation' ? 'Two-way Conversation' :
                             config.type === 'teach-ai' ? 'Teach an AI' :
                             config.type === 'thought-partner' ? 'Thought Partner' :
                             'Quiz'}
                          </Badge>
                          {/* Interaction mode indicator */}
                          {(() => {
                            const mode = config.interactionMode ?? 'both';
                            const label = mode === 'typed' ? 'Typed only' : mode === 'spoken' ? 'Voice only' : 'Voice or typed — user\'s choice';
                            return (
                              <span title={label} className="inline-flex items-center gap-0.5 text-gray-400">
                                {(mode === 'typed' || mode === 'both') && <Keyboard className="h-3.5 w-3.5" />}
                                {(mode === 'spoken' || mode === 'both') && <Mic className="h-3.5 w-3.5" />}
                              </span>
                            );
                          })()}
                          {config.isTemplate && (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1">
                              <Flag className="h-3 w-3" />
                              Public Template
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="mt-1">
                          Created {new Date(config.createdAt).toLocaleDateString()}
                          {config.deleted && config.deletedAt && (
                            <span className="text-red-500 ml-2">
                              · Deleted {new Date(config.deletedAt).toLocaleDateString()}
                            </span>
                          )}
                        </CardDescription>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-600">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {!config.deleted ? (
                            <>
                              <DropdownMenuItem onClick={() => handleEditConfig(config)}>
                                <Pencil className="h-4 w-4 mr-2" />Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDuplicate(config)}>
                                <Copy className="h-4 w-4 mr-2" />Duplicate
                              </DropdownMenuItem>
                              {!config.isTemplate && (
                                <DropdownMenuItem onClick={() => setSavingAsTemplate(config)}>
                                  <Flag className="h-4 w-4 mr-2" />Save as Public Template
                                </DropdownMenuItem>
                              )}
                              {config.isTemplate && (
                                <DropdownMenuItem onClick={() => removeFromTemplates.mutate(config.id)}>
                                  <EyeOff className="h-4 w-4 mr-2" />Remove from Templates
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem className="text-red-600" onClick={() => setDeletingConfig(config)}>
                                <Trash2 className="h-4 w-4 mr-2" />Delete
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <DropdownMenuItem onClick={() => restoreConfig.mutate(config)}>
                              <ArrowUpCircle className="h-4 w-4 mr-2" />Restore
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {config.userInstructions && (
                      <p className="text-sm text-gray-500 mb-4 line-clamp-2">{config.userInstructions}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleCopyLink(config.id)}>
                          <Share2 className="h-3.5 w-3.5 mr-1.5" />
                          Share
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleCopyMiroLink(config.id)}>
                          <img src="/miro-icon.svg" className="h-3.5 w-3.5 mr-1.5" alt="" />
                          Miro
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewFeedback(config)}
                          disabled={config.conversationCount === 0}
                        >
                          <BarChart2 className="h-3.5 w-3.5 mr-1.5" />
                          {config.type === 'thought-partner' ? 'View Activity' : 'View Feedback'}
                        </Button>
                      </div>
                      <span className="text-xs text-gray-400 tabular-nums">
                        {config.conversationCount} submission{config.conversationCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </main>

      {/* Template Gallery Dialog */}
      <Dialog 
        open={isTemplateGalleryOpen} 
        onOpenChange={(open) => {
          setIsTemplateGalleryOpen(open);
          if (!open) {
            queryClient.invalidateQueries({ queryKey: ["/api/chat-configs"] });
          }
        }}
      >
        <DialogContent className="max-w-4xl">
          <TemplateGallery
            onSelectTemplate={handleTemplateSelect}
            onStartFromScratch={handleStartFromScratch}
          />
        </DialogContent>
      </Dialog>

      {/* Create GPT Dialog */}
      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          handleCreateModalClose(open);
          if (!open) {
            queryClient.invalidateQueries({ queryKey: ["/api/chat-configs"] });
          }
        }}
      >
        <DialogContent className="max-w-2xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Create New Agent</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="py-4">
              <CreateGptWizard
                key={isCreateOpen ? 'open' : 'closed'}
                onSave={(finalConfig) => saveConfig.mutate(finalConfig)}
                isSaving={saveConfig.isPending}
                prefill={wizardPrefill}
              />
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Edit Agent Dialog */}
      {editingConfig && (
        <Dialog 
          open={editingConfig !== null} 
          onOpenChange={(open) => {
            if (!open) {
              setEditingConfig(null);
              queryClient.invalidateQueries({ queryKey: ["/api/chat-configs"] });
            }
          }}
        >
          <DialogContent className="max-w-2xl h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Edit Agent</DialogTitle>
              <DialogDescription>
                Modify your Agent configuration below.
              </DialogDescription>
            </DialogHeader>
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
                      setEditingConfig(prev => {
                        const updated = prev ? {
                          ...prev,
                          title: updatedConfig.title,
                          questions: updatedConfig.questions
                        } : null;
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
                      questions: editingConfig.questions || [],
                      interactionMode: editingConfig.interactionMode ?? 'both',
                    }}
                    onConfigChange={(updatedConfig) => {
                      setEditingConfig({
                        ...editingConfig,
                        title: updatedConfig.title,
                        type: updatedConfig.type,
                        systemPrompt: updatedConfig.systemPrompt,
                        userInstructions: updatedConfig.userInstructions || null,
                        feedbackCriteria: updatedConfig.feedbackCriteria || null,
                        questions: updatedConfig.questions || [],
                        interactionMode: updatedConfig.interactionMode ?? 'both',
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
                Update Agent
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deletingConfig !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingConfig(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the Agent
              "{deletingConfig?.title}" and all associated conversations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingConfig && deleteConfig.mutate(deletingConfig)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Save as Template Dialog */}
      <Dialog
        open={savingAsTemplate !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSavingAsTemplate(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as Public Template</DialogTitle>
            <DialogDescription>
              Public templates are available to all users. Please provide a description for this template.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <textarea
              className="w-full p-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Describe what this template is for and how it should be used... (25 words max)"
              value={savingAsTemplate?.templateDescription || ''}
              onChange={(e) => {
                const words = e.target.value.trim().split(/\s+/);
                if (words.length <= 25 || e.target.value.length < (savingAsTemplate?.templateDescription || '').length) {
                  savingAsTemplate && setSavingAsTemplate({
                    ...savingAsTemplate,
                    templateDescription: e.target.value
                  });
                }
              }}
            />
            <div className="text-xs text-right mt-1 text-muted-foreground">
              {savingAsTemplate?.templateDescription ? 
                `${savingAsTemplate.templateDescription.trim().split(/\s+/).length}/25 words` : 
                "0/25 words"}
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <Button 
              onClick={() => savingAsTemplate && saveAsTemplate.mutate({
                id: savingAsTemplate.id as number,
                templateDescription: savingAsTemplate.templateDescription || ''
              })}
              disabled={!savingAsTemplate?.templateDescription || saveAsTemplate.isPending}
            >
              Save as Template
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}