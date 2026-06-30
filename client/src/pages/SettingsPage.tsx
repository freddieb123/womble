import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [subject, setSubject] = useState("");
  const [context, setContext] = useState("");
  const [saving, setSaving] = useState(false);

  // Seed the form once the user has loaded.
  useEffect(() => {
    if (user) {
      setSubject(user.subject ?? "");
      setContext(user.context ?? "");
    }
  }, [user]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, context }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      queryClient.setQueryData(["/api/user"], updated);
      toast({ description: "Settings saved" });
      navigate("/dashboard");
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="max-w-lg mx-auto">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to dashboard
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Settings</CardTitle>
            <CardDescription>Update the details we use to tailor your activities.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={user?.email ?? ""} disabled />
              <p className="text-xs text-muted-foreground">Your email can't be changed.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject you teach</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. GCSE Biology, sales onboarding, leadership skills"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="context">What you want to use Womble for</Label>
              <Textarea
                id="context"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                rows={4}
                placeholder="e.g. I run apprenticeship workshops and want learners to practise between sessions"
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
