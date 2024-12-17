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
      <h2 className="text-lg font-semibold text-blue-900">Admin Controls</h2>
      
      <div className="space-y-4">
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
            rows={4}
          />
        </div>

        <div className="space-y-2">
          <Label>Temperature: {config.temperature}</Label>
          <Slider
            value={[config.temperature]}
            onValueChange={(value) => onConfigChange({
              ...config,
              temperature: value[0]
            })}
            min={0}
            max={2}
            step={0.1}
          />
        </div>

        <div className="space-y-2">
          <Label>Max Tokens: {config.maxTokens}</Label>
          <Slider
            value={[config.maxTokens]}
            onValueChange={(value) => onConfigChange({
              ...config,
              maxTokens: value[0]
            })}
            min={100}
            max={4000}
            step={100}
          />
        </div>
      </div>
    </div>
  );
}
