import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Search, Plus, Copy, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Template } from "@/lib/types";

type Tab = 'template' | 'duplicate';

type AgentItem = {
  id: number;
  title: string;
  type: string;
  userInstructions: string | null;
  systemPrompt: string;
};

interface Props {
  onSelectTemplate: (template: Template) => void;
  onDuplicate: (agent: AgentItem) => void;
  onStartFromScratch: () => void;
}

const TYPE_LABEL: Record<string, string> = {
  chat: 'Conversation',
  'teach-ai': 'Teach an AI',
  'thought-partner': 'Thought Partner',
  'two-way-conversation': 'Two-way',
  quiz: 'Quiz',
  upload: 'Document Review',
  'quick-fire-quiz': 'Quick Fire Quiz',
};

const TYPE_CLASSES: Record<string, string> = {
  chat: 'bg-green-50 text-green-700 border-green-200',
  'teach-ai': 'bg-blue-50 text-blue-700 border-blue-200',
  'thought-partner': 'bg-teal-50 text-teal-700 border-teal-200',
  'two-way-conversation': 'bg-orange-50 text-orange-700 border-orange-200',
  quiz: 'bg-gray-50 text-gray-600 border-gray-200',
  upload: 'bg-purple-50 text-purple-700 border-purple-200',
  'quick-fire-quiz': 'bg-amber-50 text-amber-700 border-amber-200',
};

export default function AddAgentDialog({ onSelectTemplate, onDuplicate, onStartFromScratch }: Props) {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('template');
  const [search, setSearch] = useState("");

  const { data: templates = [], refetch: refetchTemplates } = useQuery<Template[]>({
    queryKey: ["/api/templates"],
    queryFn: async () => {
      const res = await fetch("/api/templates");
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    },
  });

  useEffect(() => { refetchTemplates(); }, [refetchTemplates]);

  const { data: agents = [] } = useQuery<AgentItem[]>({
    queryKey: ['/api/chat-configs', user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/chat-configs?userId=${user?.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user?.id && tab === 'duplicate',
  });

  const filteredTemplates = templates.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    (t.templateDescription || "").toLowerCase().includes(search.toLowerCase())
  );

  const filteredAgents = agents.filter(a =>
    a.title.toLowerCase().includes(search.toLowerCase())
  );

  const switchTab = (t: Tab) => { setTab(t); setSearch(""); };

  return (
    <div className="flex flex-col h-full -mt-6">
      {/* Green header */}
      <div className="bg-green-700 text-white px-6 pt-6 pb-5 -mx-6 mb-5 rounded-t-lg">
        <h2 className="text-xl font-bold mb-1">Add Agent</h2>
        <p className="text-green-200 text-sm mb-4">Choose how you'd like to create your agent</p>

        {/* Tab toggle */}
        <div className="flex gap-1 bg-green-800/60 rounded-lg p-1 w-fit">
          <button
            onClick={() => switchTab('template')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === 'template' ? 'bg-white text-green-800 shadow-sm' : 'text-green-100 hover:text-white'
            }`}
          >
            From Template
          </button>
          <button
            onClick={() => switchTab('duplicate')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === 'duplicate' ? 'bg-white text-green-800 shadow-sm' : 'text-green-100 hover:text-white'
            }`}
          >
            Duplicate Agent
          </button>
        </div>
      </div>

      {/* Start from Scratch */}
      <button
        onClick={onStartFromScratch}
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed border-green-200 text-green-700 hover:bg-green-50 hover:border-green-400 text-sm font-medium transition-colors mb-4 self-start"
      >
        <Plus className="h-4 w-4" />
        Start from Scratch
      </button>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder={tab === 'template' ? "Search templates…" : "Search your agents…"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 -mx-6 px-6">
        {tab === 'template' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-4">
            {filteredTemplates.map((template) => (
              <div
                key={template.id}
                onClick={() => onSelectTemplate(template)}
                className="border border-gray-200 rounded-lg p-4 cursor-pointer hover:border-green-400 hover:bg-green-50/40 transition-colors group"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="font-semibold text-gray-900 text-sm leading-snug">{template.title}</p>
                  <Badge variant="outline" className={`text-xs flex-shrink-0 ${TYPE_CLASSES[template.type] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                    {TYPE_LABEL[template.type] ?? template.type}
                  </Badge>
                </div>
                <p className="text-xs text-gray-500 line-clamp-3 mb-3">
                  {template.templateDescription || template.systemPrompt?.slice(0, 120) + "…"}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-green-600 font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                    Use template <ArrowRight className="h-3 w-3" />
                  </span>
                  {(template as any).creator && (
                    <span className="text-xs text-gray-400">
                      By: {(template as any).creator.firstName || 'Anonymous'}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {filteredTemplates.length === 0 && (
              <div className="col-span-2 text-center py-10 text-gray-400 text-sm">No templates found.</div>
            )}
          </div>
        )}

        {tab === 'duplicate' && (
          <div className="space-y-2 pb-4">
            {filteredAgents.map((agent) => (
              <div
                key={agent.id}
                onClick={() => onDuplicate(agent)}
                className="flex items-center gap-3 border border-gray-200 rounded-lg px-4 py-3 cursor-pointer hover:border-green-400 hover:bg-green-50/40 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{agent.title}</p>
                  {agent.userInstructions && (
                    <p className="text-xs text-gray-500 truncate mt-0.5">{agent.userInstructions}</p>
                  )}
                </div>
                <Badge variant="outline" className={`text-xs flex-shrink-0 ${TYPE_CLASSES[agent.type] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                  {TYPE_LABEL[agent.type] ?? agent.type}
                </Badge>
                <Copy className="h-4 w-4 text-gray-400 group-hover:text-green-600 flex-shrink-0 transition-colors" />
              </div>
            ))}
            {filteredAgents.length === 0 && (
              <div className="text-center py-10 text-gray-400 text-sm">
                {agents.length === 0 ? "No agents yet." : "No agents match your search."}
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
