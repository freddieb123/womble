import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Brain, Lightbulb, HelpCircle, ArrowRight } from 'lucide-react';

interface ThinkingMap {
  keyThemes: string[];
  insights: string[];
  openQuestions: string[];
  nextSteps: string[];
  sessionCount?: number;
}

interface ThinkingMapModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: ThinkingMap | null;
}

export default function ThinkingMapModal({ open, onOpenChange, summary }: ThinkingMapModalProps) {
  if (!summary) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Brain className="h-5 w-5 text-green-600" />
            Your Thinking Map
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-2">
          {summary.keyThemes?.length > 0 && (
            <Section
              icon={<div className="h-2 w-2 rounded-full bg-blue-500" />}
              title="Key Themes Explored"
              color="blue"
              items={summary.keyThemes}
            />
          )}

          {summary.insights?.length > 0 && (
            <Section
              icon={<Lightbulb className="h-4 w-4 text-yellow-500" />}
              title="Insights Reached"
              color="yellow"
              items={summary.insights}
            />
          )}

          {summary.openQuestions?.length > 0 && (
            <Section
              icon={<HelpCircle className="h-4 w-4 text-purple-500" />}
              title="Open Questions"
              color="purple"
              items={summary.openQuestions}
            />
          )}

          {summary.nextSteps?.length > 0 && (
            <Section
              icon={<ArrowRight className="h-4 w-4 text-green-600" />}
              title="Suggested Next Steps"
              color="green"
              items={summary.nextSteps}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const colorMap = {
  blue: 'bg-blue-50 border-blue-100',
  yellow: 'bg-yellow-50 border-yellow-100',
  purple: 'bg-purple-50 border-purple-100',
  green: 'bg-green-50 border-green-100',
} as const;

const dotColorMap = {
  blue: 'bg-blue-400',
  yellow: 'bg-yellow-400',
  purple: 'bg-purple-400',
  green: 'bg-green-500',
} as const;

function Section({ icon, title, color, items }: {
  icon: React.ReactNode;
  title: string;
  color: keyof typeof colorMap;
  items: string[];
}) {
  return (
    <div className={`rounded-lg border p-4 ${colorMap[color]}`}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="font-semibold text-sm text-gray-700">{title}</h3>
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
            <span className={`mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0 ${dotColorMap[color]}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
