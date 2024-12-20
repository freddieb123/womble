import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AdminConfig } from "@/lib/types";

interface Props {
  config: AdminConfig;
  onConfigChange: (config: AdminConfig) => void;
}

export default function AdminPanel({ config, onConfigChange }: Props) {
  return (
    <div className="space-y-6">
      
      
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <input
            id="title"
            type="text"
            value={config.title}
            onChange={(e) => onConfigChange({
              ...config,
              title: e.target.value
            })}
            placeholder="Enter a title for this GPT..."
            className="w-full px-3 py-2 border rounded-md"
          />
          <p className="text-sm text-muted-foreground">
            Give your GPT a memorable title.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="system-prompt">System Prompt</Label>
          <Textarea
            id="system-prompt"
            value={config.systemPrompt}
            onChange={(e) => onConfigChange({
              ...config,
              systemPrompt: e.target.value
            })}
            placeholder="Enter system prompt..."
            className="resize-none"
            rows={6}
          />
          <p className="text-sm text-muted-foreground">
            Customize how the AI assistant behaves by providing specific instructions.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="user-instructions">User Instructions</Label>
          <Textarea
            id="user-instructions"
            value={config.userInstructions}
            onChange={(e) => onConfigChange({
              ...config,
              userInstructions: e.target.value
            })}
            placeholder="Enter instructions for users..."
            className="resize-none"
            rows={4}
          />
          <p className="text-sm text-muted-foreground">
            Add helpful instructions or context that will be shown to users of this chat.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="feedback-criteria">Feedback Criteria</Label>
          <Textarea
            id="feedback-criteria"
            value={config.feedbackCriteria}
            onChange={(e) => onConfigChange({
              ...config,
              feedbackCriteria: e.target.value
            })}
            placeholder="Enter criteria for providing feedback to users..."
            className="resize-none"
            rows={4}
          />
          <p className="text-sm text-muted-foreground">
            Specify criteria that will be used to assess and provide feedback on user interactions.
          </p>
        </div>
      </div>
    </div>
  );
}
