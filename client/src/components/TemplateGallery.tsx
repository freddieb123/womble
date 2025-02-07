import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Plus, ArrowRight } from "lucide-react";
import type { AdminConfig } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

interface Template {
  id: number;
  title: string;
  type: 'chat' | 'upload';
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

      <ScrollArea className="h-[60vh]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((template) => (
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
                    {template.usageCount !== undefined && template.usageCount > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {template.usageCount} {template.usageCount === 1 ? 'person is' : 'people are'} using this
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {template.systemPrompt}
                </p>
                <Button variant="ghost" size="sm" className="mt-4">
                  Use Template
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}