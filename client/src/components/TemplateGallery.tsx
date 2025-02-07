import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Plus, ArrowRight, Search } from "lucide-react";
import type { AdminConfig } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState } from "react";

interface Template {
  id: number;
  title: string;
  type: 'chat' | 'upload';
  description: string | null;
  systemPrompt: string;
  userInstructions: string | null;
  feedbackCriteria: string | null;
  usageCount?: number;
}

interface Props {
  templates: Template[];
  onSelectTemplate: (template: Template) => void;
  onStartFromScratch: () => void;
}

export default function TemplateGallery({ templates, onSelectTemplate, onStartFromScratch }: Props) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTemplates = templates.filter(template =>
    template.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (template.description?.toLowerCase() || "").includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-blue-900">Choose a Template</h2>
          <p className="text-muted-foreground">Start with a template or create from scratch</p>
        </div>
        <Button variant="outline" onClick={onStartFromScratch}>
          <Plus className="h-4 w-4 mr-2" />
          Start from Scratch
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <ScrollArea className="h-[60vh]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTemplates.map((template) => (
            <Card
              key={template.id}
              className="cursor-pointer hover:border-blue-500 transition-colors"
              onClick={() => onSelectTemplate(template)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle>{template.title}</CardTitle>
                    <CardDescription>Click to use this template</CardDescription>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant={template.type === 'chat' ? 'custom-green' : 'custom-purple'}>
                      {template.type}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {template.description || "No description provided"}
                </p>
                <div className="mt-4 flex justify-between items-center">
                  <Button variant="ghost" size="sm">
                    Preview Template
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                  {template.usageCount !== undefined && template.usageCount > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {template.usageCount} {template.usageCount === 1 ? 'person is' : 'people are'} using this
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}