import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface ParticipantsNameModalProps {
  open: boolean;
  onSubmit: (names: { participant1Name: string; participant2Name: string }) => void;
}

export default function ParticipantsNameModal({ open, onSubmit }: ParticipantsNameModalProps) {
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
          <div className="space-y-2">
            <Label htmlFor="participant1">Participant 1 Name</Label>
            <Input
              id="participant1"
              value={participant1Name}
              onChange={(e) => setParticipant1Name(e.target.value)}
              placeholder="Enter first participant's name..."
              className="w-full"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="participant2">Participant 2 Name</Label>
            <Input
              id="participant2"
              value={participant2Name}
              onChange={(e) => setParticipant2Name(e.target.value)}
              placeholder="Enter second participant's name..."
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