import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, GraduationCap, Sparkles } from "lucide-react";

export default function OnboardingPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [subject, setSubject] = useState("");
  const [context, setContext] = useState("");
  const [saving, setSaving] = useState(false);

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/user/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, context }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      queryClient.setQueryData(["/api/user"], updated);
    } catch (e: any) {
      // Don't trap the user on the onboarding screen if the save fails —
      // let them through and we'll have captured nothing this time.
      toast({ title: "Couldn't save that", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
      navigate("/dashboard");
    }
  };

  // If somehow reached when already onboarded, move along.
  useEffect(() => {
    if (user?.onboardedAt) navigate("/dashboard");
  }, [user, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className={step === 1 ? "font-semibold text-foreground" : ""}>Subject</span>
            <ArrowRight className="h-3.5 w-3.5" />
            <span className={step === 2 ? "font-semibold text-foreground" : ""}>Context</span>
            <span className="ml-auto text-xs">Step {step} of 2</span>
          </div>
          {step === 1 ? (
            <>
              <div className="app-icon-surface w-11 h-11 flex items-center justify-center">
                <GraduationCap className="h-5 w-5 text-gray-600" />
              </div>
              <CardTitle className="text-xl">What subject are you thinking of teaching using Womble?</CardTitle>
              <CardDescription>
                We use this to suggest starter activities for you. You can skip this and add it later.
              </CardDescription>
            </>
          ) : (
            <>
              <div className="app-icon-surface w-11 h-11 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-gray-600" />
              </div>
              <CardTitle className="text-xl">Tell us a bit about what you want to use Womble for</CardTitle>
              <CardDescription>
                A sentence or two about your context helps us tailor activities. Optional.
              </CardDescription>
            </>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {step === 1 ? (
            <>
              <Input
                autoFocus
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") setStep(2); }}
                placeholder="e.g. GCSE Biology, sales onboarding, leadership skills"
              />
              <div className="flex items-center justify-between pt-1">
                <Button variant="ghost" onClick={() => setStep(2)}>Skip</Button>
                <Button onClick={() => setStep(2)}>
                  Continue <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </div>
            </>
          ) : (
            <>
              <Textarea
                autoFocus
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="e.g. I run apprenticeship workshops and want learners to practise between sessions"
                rows={4}
              />
              <div className="flex items-center justify-between pt-1">
                <Button variant="ghost" onClick={() => setStep(1)} disabled={saving}>Back</Button>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={finish} disabled={saving}>Skip</Button>
                  <Button onClick={finish} disabled={saving}>
                    {saving ? "Saving…" : "Finish"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
