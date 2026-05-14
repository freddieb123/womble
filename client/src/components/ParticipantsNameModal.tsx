import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface ParticipantsNameModalProps {
  open: boolean;
  onSubmit: (names: { participant1Name: string; participant2Name: string }) => void;
  participant1Role?: string;
  participant2Role?: string;
}

export default function ParticipantsNameModal({ open, onSubmit, participant1Role, participant2Role }: ParticipantsNameModalProps) {
  const [participant1Name, setParticipant1Name] = useState("");
  const [participant2Name, setParticipant2Name] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName1 = participant1Name.trim();
    const trimmedName2 = participant2Name.trim();
    if (trimmedName1 && trimmedName2) {
      onSubmit({
        participant1Name: trimmedName1,
        participant2Name: trimmedName2
      });
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Welcome to Conversation Recording</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          {participant1Role && participant2Role && (
            <p className="text-sm text-muted-foreground">
              Agree who is the <strong>{participant1Role}</strong> and who is the <strong>{participant2Role}</strong>, then enter your names below.
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="participant1">
              {participant1Role ? `Speaker 1 — ${participant1Role}` : "Participant 1 Name"}
            </Label>
            <Input
              id="participant1"
              value={participant1Name}
              onChange={(e) => setParticipant1Name(e.target.value)}
              placeholder="Enter name..."
              className="w-full"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="participant2">
              {participant2Role ? `Speaker 2 — ${participant2Role}` : "Participant 2 Name"}
            </Label>
            <Input
              id="participant2"
              value={participant2Name}
              onChange={(e) => setParticipant2Name(e.target.value)}
              placeholder="Enter name..."
              className="w-full"
            />
          </div>
          <Button 
            type="submit" 
            className="w-full" 
            disabled={!participant1Name.trim() || !participant2Name.trim()}
          >
            Start Recording Session
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}