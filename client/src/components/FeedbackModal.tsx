import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feedback: {
    overall: {
      bullets: string[];
      score: number | null;
      summary: string | null;
    };
  } | null;
  transcript: any[];
}

export default function FeedbackModal({ open, onOpenChange, feedback }: Props) {
  if (!feedback) return null;

  const { overall } = feedback;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Conversation Feedback</DialogTitle>
        </DialogHeader>

        {overall?.score != null && (
          <div className="flex items-center justify-center py-2">
            <div className="text-5xl font-bold text-blue-600">
              {overall.score}
              <span className="text-2xl text-muted-foreground">/10</span>
            </div>
          </div>
        )}

        {overall?.summary && (
          <p className="text-sm text-muted-foreground text-center italic px-2">
            {overall.summary}
          </p>
        )}

        <ScrollArea className="max-h-60">
          <ul className="space-y-2 px-1 pb-2">
            {overall?.bullets?.map((bullet, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="text-blue-500 mt-0.5 flex-shrink-0">•</span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
