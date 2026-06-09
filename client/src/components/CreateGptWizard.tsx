import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Users, GraduationCap, Brain, Zap, ArrowLeft, ArrowRight, Sparkles, Loader2, Upload, X, Mic, MicOff, Keyboard, LayoutGrid, Monitor, FileText, ClipboardList } from "lucide-react";
import type { AdminConfig } from "@/lib/types";
import QuickFireQuizEditor from "@/components/QuickFireQuizEditor";

interface Props {
  onSave: (config: AdminConfig) => void;
  isSaving: boolean;
  prefill?: AdminConfig;
}

type WizardType = 'chat' | 'two-way-conversation' | 'teach-ai' | 'thought-partner' | 'quick-fire-quiz' | 'group-board' | 'user-tester' | 'doc-critique' | 'task-walkthrough';

const TYPE_CONFIG: Record<WizardType, {
  icon: React.ElementType;
  label: string;
  subtitle: string;
  placeholder: string;
  badge: string;
}> = {
  chat: {
    icon: MessageSquare,
    label: 'Conversation with AI',
    subtitle: 'Learners chat with an AI playing a role',
    placeholder: "e.g. A sales negotiation where the AI plays a sceptical procurement manager and the learner practises handling price objections and closing the deal...",
    badge: 'Chat with an Activity',
  },
  'two-way-conversation': {
    icon: Users,
    label: 'Two-way Conversation',
    subtitle: 'Two people practise a real conversation together',
    placeholder: "e.g. A mock job interview for a digital marketing manager role — one person is the interviewer, the other is the candidate...",
    badge: 'Two-way Conversation',
  },
  'teach-ai': {
    icon: GraduationCap,
    label: 'Teach an AI',
    subtitle: 'Learners explain a topic to an AI learner',
    placeholder: "e.g. Apprentices must explain how agile sprint planning works to a complete beginner with no software development background...",
    badge: 'Teach an AI',
  },
  'thought-partner': {
    icon: Brain,
    label: 'Thought Partner',
    subtitle: 'Helps learners think through how an idea applies to their context',
    placeholder: "e.g. Help participants think through how to build an AI strategy for their organisation — what use cases to prioritise, how to get buy-in, and how to start...",
    badge: 'Thought Partner',
  },
  'quick-fire-quiz': {
    icon: Zap,
    label: 'Quick Fire Quiz',
    subtitle: 'Kahoot-style live quiz — everyone answers simultaneously, speed earns bonus points',
    placeholder: '',
    badge: 'Quick Fire Quiz',
  },
  'group-board': {
    icon: LayoutGrid,
    label: 'Group Board',
    subtitle: 'Collaborative canvas — groups add post-its to their zone in real time',
    placeholder: '',
    badge: 'Group Board',
  },
  'user-tester': {
    icon: Monitor,
    label: 'User Tester',
    subtitle: 'AI watches a prototype demo via screen share and gives spoken feedback against criteria',
    placeholder: "e.g. A UX review where the AI evaluates a prototype demo of a mobile banking app — it should assess whether the onboarding flow is intuitive, whether the key actions are discoverable, and whether the visual design builds trust...",
    badge: 'User Tester',
  },
  'doc-critique': {
    icon: FileText,
    label: 'Critique a Document',
    subtitle: 'Apprentices read an uploaded document and share observations — AI coaches them on what to notice',
    placeholder: "e.g. A case study analysis where apprentices read a business case and identify the key risks, assumptions, and strategic decisions — they should notice the over-reliance on a single supplier, the optimistic revenue forecast, and the lack of a mitigation plan...",
    badge: 'Critique a Document',
  },
  'task-walkthrough': {
    icon: ClipboardList,
    label: 'Task Walkthrough',
    subtitle: 'Apprentices talk through how far they got with a task — AI coaches them through completion via voice',
    placeholder: "e.g. An Excel data analysis task where apprentices create a pivot table showing Q1 sales by region — the AI should understand where they are in the process and guide them step-by-step through anything they haven't completed yet...",
    badge: 'Task Walkthrough',
  },
};

const KNOWLEDGE_LABELS = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Expert'];
const ATTITUDE_LABELS = ['Enthusiastic', 'Curious', 'Neutral', 'Skeptical', 'Very Skeptical'];
const COACHING_LABELS = ['Coach', 'Coaching-led', 'Balanced', 'Advisory', 'Advisor'];
const COACHING_DESCRIPTIONS = [
  'Open-ended questions only — no advice given',
  'Mostly questions, occasional frameworks',
  'Mix of questions and suggestions',
  'Leans towards recommendations and frameworks',
  'Direct recommendations and guidance',
];

function normaliseCriteria(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((s: any) => `- ${String(s).trim()}`).join('\n');
    } catch {}
  }
  return raw;
}

export default function CreateGptWizard({ onSave, isSaving, prefill }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(prefill ? 3 : 1);
  const [selectedType, setSelectedType] = useState<WizardType | null>(
    prefill ? (prefill.type as WizardType) : null
  );
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [config, setConfig] = useState<AdminConfig>(prefill ?? {
    title: '',
    type: 'chat',
    systemPrompt: '',
    userInstructions: '',
    feedbackCriteria: '',
    feedbackHarshness: 'standard',
    temperature: 0.7,
    maxTokens: 1000,
    knowledgeLevel: 2,
    attitude: 2,
    coachingStyle: 2,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [pdfFileName, setPdfFileName] = useState<string>('');
  const recognitionRef = useRef<any>(null);
  const [isDictating, setIsDictating] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);

  useEffect(() => {
    return () => { recognitionRef.current?.stop(); };
  }, []);

  const handleDictate = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (isDictating) {
      recognitionRef.current?.stop();
      setIsDictating(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let newText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) newText += event.results[i][0].transcript;
      }
      if (newText) {
        setAiPrompt(prev => prev ? prev.trimEnd() + ' ' + newText.trim() : newText.trim());
        setGenerateError('');
      }
    };

    recognition.onerror = () => setIsDictating(false);
    recognition.onend = () => setIsDictating(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsDictating(true);
  };

  const handleEnhance = async () => {
    if (!aiPrompt.trim()) return;
    setIsEnhancing(true);
    try {
      const res = await fetch('/api/configs/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt, type: selectedType }),
      });
      if (!res.ok) throw new Error('Enhancement failed');
      const data = await res.json();
      setAiPrompt(data.enhanced);
      setGenerateError('');
    } catch {
      setGenerateError('Could not enhance prompt. Please try again.');
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleGenerate = async () => {
    if (!aiPrompt.trim() || !selectedType) return;
    setIsGenerating(true);
    setGenerateError('');
    try {
      const res = await fetch('/api/configs/generate-with-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt, type: selectedType }),
      });
      if (!res.ok) throw new Error('Generation failed');
      const data = await res.json();
      setConfig(prev => ({
        ...prev,
        type: selectedType,
        title: data.title ?? '',
        systemPrompt: data.systemPrompt ?? '',
        userInstructions: data.userInstructions ?? '',
        feedbackCriteria: data.feedbackCriteria ?? '',
      }));
      setStep(3);
    } catch {
      setGenerateError('Something went wrong. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setConfig(prev => {
          const current = prev.referenceImages || [];
          if (current.includes(dataUrl)) return prev;
          return { ...prev, referenceImages: [...current, dataUrl] };
        });
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (index: number) => {
    setConfig(prev => ({
      ...prev,
      referenceImages: (prev.referenceImages || []).filter((_, i) => i !== index),
    }));
  };

  const StepIndicator = ({ current }: { current: number }) => (
    <div className="flex items-center gap-2 mb-6">
      {[1, 2, 3].map((n) => (
        <div key={n} className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold
            ${n === current ? 'bg-green-600 text-white' : n < current ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
            {n}
          </div>
          {n < 3 && <div className={`h-px w-8 ${n < current ? 'bg-green-300' : 'bg-gray-200'}`} />}
        </div>
      ))}
      <span className="ml-2 text-xs text-muted-foreground">
        {current === 1 ? 'Choose type' : current === 2 ? 'Describe' : 'Review & save'}
      </span>
    </div>
  );

  // ── Step 1: Choose type ──────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div className="space-y-6">
        <StepIndicator current={1} />
        <p className="text-sm text-muted-foreground -mt-2">
          What kind of learning activity do you want to create?
        </p>
        <div className="grid grid-cols-2 gap-3">
          {(Object.entries(TYPE_CONFIG) as [WizardType, typeof TYPE_CONFIG['chat']][]).map(([type, cfg]) => {
            const Icon = cfg.icon;
            const isSelected = selectedType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedType(type)}
                className={`flex flex-col items-center gap-3 rounded-lg border p-6 text-sm transition-colors text-center
                  ${isSelected
                    ? 'border-green-500 bg-green-50 text-green-800'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
              >
                <Icon className="h-8 w-8" />
                <div>
                  <div className="font-medium">{cfg.label}</div>
                  <div className={`text-xs mt-1 ${isSelected ? 'text-green-700' : 'text-muted-foreground'}`}>
                    {cfg.subtitle}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={() => {
            const skipDescribe = selectedType === 'quick-fire-quiz' || selectedType === 'group-board';
            setConfig(prev => ({
              ...prev,
              type: selectedType!,
              ...(selectedType === 'group-board' ? { groupBoardSettings: { numGroups: 4, showOtherGroups: true } } : {}),
            }));
            skipDescribe ? setStep(3) : setStep(2);
          }} disabled={!selectedType}>
            Continue <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  }

  // ── Step 2: Describe ─────────────────────────────────────────────────────
  if (step === 2) {
    const typeCfg = TYPE_CONFIG[selectedType!];
    return (
      <div className="space-y-5">
        <StepIndicator current={2} />
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-green-50 text-green-800 border-green-200">
            {typeCfg.badge}
          </Badge>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ai-prompt">Describe the activity you want to create</Label>
          <Textarea
            id="ai-prompt"
            value={aiPrompt}
            onChange={(e) => { setAiPrompt(e.target.value); setGenerateError(''); }}
            placeholder={typeCfg.placeholder}
            rows={8}
            className="resize-none"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDictate}
              className={isDictating ? 'text-red-600 border-red-300 hover:bg-red-50' : ''}
            >
              {isDictating
                ? <><MicOff className="h-3.5 w-3.5 mr-1.5" /> Stop dictating</>
                : <><Mic className="h-3.5 w-3.5 mr-1.5" /> Dictate</>
              }
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleEnhance}
              disabled={!aiPrompt.trim() || isEnhancing}
            >
              {isEnhancing
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Building out...</>
                : <><Brain className="h-3.5 w-3.5 mr-1.5" /> Build out this idea</>
              }
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Include the subject matter, scenario, and what you want learners to practise. More detail = better result.
          </p>
          {generateError && <p className="text-xs text-red-600">{generateError}</p>}
        </div>
        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={() => setStep(1)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setConfig(prev => ({ ...prev, type: selectedType! })); setStep(3); }} disabled={isGenerating}>
              Skip
            </Button>
            <Button onClick={handleGenerate} disabled={!aiPrompt.trim() || isGenerating}>
              {isGenerating
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
                : <><Sparkles className="h-4 w-4 mr-2" /> Generate</>
              }
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 3: Review & edit ────────────────────────────────────────────────
  const isTeachAi = config.type === 'teach-ai';
  const isTwoWay = config.type === 'two-way-conversation';
  const isThoughtPartner = config.type === 'thought-partner';
  const isQuickFireQuiz = config.type === 'quick-fire-quiz';
  const isGroupBoard = config.type === 'group-board';
  const isUserTester = config.type === 'user-tester';
  const isDocCritique = config.type === 'doc-critique';
  const isTaskWalkthrough = config.type === 'task-walkthrough';

  if (isGroupBoard) {
    const settings = config.groupBoardSettings ?? { numGroups: 4, showOtherGroups: true };
    return (
      <div className="space-y-5">
        <StepIndicator current={3} />
        <div className="space-y-2">
          <Label htmlFor="gb-title">Title</Label>
          <input
            id="gb-title"
            type="text"
            className="w-full px-3 py-2 border rounded-md text-sm"
            value={config.title}
            onChange={e => setConfig(prev => ({ ...prev, title: e.target.value }))}
            maxLength={30}
            placeholder="e.g. Identify the key risks"
          />
        </div>
        <div className="space-y-3 border rounded-lg p-4">
          <p className="text-sm font-medium flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-green-600" /> Board Setup
          </p>
          <div className="space-y-2">
            <Label>Number of Groups</Label>
            <div className="flex items-center gap-3">
              <Slider
                min={2} max={8} step={1}
                value={[settings.numGroups ?? 4]}
                onValueChange={([v]) => setConfig(prev => ({ ...prev, groupBoardSettings: { ...settings, numGroups: v } }))}
                className="flex-1"
              />
              <span className="text-sm font-medium text-green-700 w-8 text-right">{settings.numGroups ?? 4}</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="gb-instructions">Board Instructions</Label>
            <Textarea
              id="gb-instructions"
              value={settings.boardInstructions ?? ''}
              onChange={e => setConfig(prev => ({ ...prev, groupBoardSettings: { ...settings, boardInstructions: e.target.value } }))}
              placeholder="e.g. In your group, identify the top 3 risks and add them as post-its in your zone."
              className="resize-none"
              rows={3}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.showOtherGroups !== false}
              onChange={e => setConfig(prev => ({ ...prev, groupBoardSettings: { ...settings, showOtherGroups: e.target.checked } }))}
              className="rounded"
            />
            <span className="text-sm text-gray-700">Show other groups' boards to participants</span>
          </label>
        </div>
        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={() => setStep(1)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <Button onClick={() => onSave(config)} disabled={isSaving || !config.title.trim()}>
            {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : 'Save Board'}
          </Button>
        </div>
      </div>
    );
  }

  if (isQuickFireQuiz) {
    return (
      <div className="space-y-5">
        <StepIndicator current={3} />
        <QuickFireQuizEditor config={config} onConfigChange={setConfig} />
        <div className="flex justify-between pt-4 border-t">
          <Button variant="ghost" onClick={() => setStep(1)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <Button
            onClick={() => onSave(config)}
            disabled={isSaving || !config.title.trim() || !(config.quickFireQuestions?.length)}
          >
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Save Quiz
          </Button>
        </div>
      </div>
    );
  }

  if (isUserTester) {
    return (
      <div className="space-y-5">
        <StepIndicator current={3} />
        <div className="space-y-2">
          <Label htmlFor="ut-title">Title</Label>
          <Input
            id="ut-title"
            value={config.title}
            onChange={(e) => setConfig(prev => ({ ...prev, title: e.target.value }))}
            maxLength={30}
            placeholder="e.g. Prototype Demo Review"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ut-criteria">Evaluation criteria</Label>
          <Textarea
            id="ut-criteria"
            value={normaliseCriteria(config.feedbackCriteria || '')}
            onChange={(e) => setConfig(prev => ({ ...prev, feedbackCriteria: e.target.value }))}
            placeholder={"e.g.\n- Is the navigation intuitive?\n- Is the visual hierarchy clear?\n- Does it address the user need stated in the brief?\n- Is the call to action obvious?"}
            rows={6}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">The AI will ask questions and give final feedback based on these criteria.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ut-persona">Evaluator persona (optional)</Label>
          <Textarea
            id="ut-persona"
            value={config.referenceContent || ''}
            onChange={(e) => setConfig(prev => ({ ...prev, referenceContent: e.target.value }))}
            placeholder={"e.g. You are a busy HR manager at a mid-sized professional services firm. You primarily use your phone and have limited technical knowledge. You care most about whether tools are quick to learn and don't require IT support."}
            rows={3}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">Define who the AI is playing — their role, context, and what they care about.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ut-instructions">Additional context for the AI (optional)</Label>
          <Textarea
            id="ut-instructions"
            value={config.userInstructions || ''}
            onChange={(e) => setConfig(prev => ({ ...prev, userInstructions: e.target.value }))}
            placeholder="e.g. The prototype is a mobile app for booking GP appointments. Apprentices should focus on the booking flow."
            rows={3}
            className="resize-none"
          />
        </div>
        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={() => setStep(1)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <Button onClick={() => onSave(config)} disabled={isSaving || !config.title.trim()}>
            {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : 'Save User Tester'}
          </Button>
        </div>
      </div>
    );
  }

  if (isDocCritique) {
    return (
      <div className="space-y-5">
        <StepIndicator current={3} />
        <div className="space-y-2">
          <Label htmlFor="dc-title">Title</Label>
          <Input
            id="dc-title"
            value={config.title}
            onChange={(e) => setConfig(prev => ({ ...prev, title: e.target.value }))}
            maxLength={30}
            placeholder="e.g. Case Study Analysis"
          />
        </div>

        {/* PDF upload */}
        <div className="space-y-2">
          <Label>Document (PDF)</Label>
          <input
            ref={pdfInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 8 * 1024 * 1024) {
                alert('PDF must be under 8 MB.');
                return;
              }
              setPdfFileName(file.name);
              const reader = new FileReader();
              reader.onload = (ev) => {
                const dataUrl = ev.target?.result as string;
                setConfig(prev => ({ ...prev, referenceContent: dataUrl }));
              };
              reader.readAsDataURL(file);
              if (pdfInputRef.current) pdfInputRef.current.value = '';
            }}
          />
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={() => pdfInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              {pdfFileName ? 'Replace PDF' : 'Upload PDF'}
            </Button>
            {pdfFileName && (
              <span className="text-sm text-gray-600 flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-blue-500" /> {pdfFileName}
                <button
                  type="button"
                  onClick={() => { setConfig(prev => ({ ...prev, referenceContent: '' })); setPdfFileName(''); }}
                  className="ml-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Apprentices will see this document alongside the chat. Max 8 MB.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dc-criteria">What should apprentices notice?</Label>
          <Textarea
            id="dc-criteria"
            value={normaliseCriteria(config.feedbackCriteria || '')}
            onChange={(e) => setConfig(prev => ({ ...prev, feedbackCriteria: e.target.value }))}
            placeholder={"e.g.\n- The supplier dependency risk on page 3\n- The revenue forecast assumptions are too optimistic\n- There is no contingency plan for the main risk\n- The stakeholder analysis is incomplete"}
            rows={6}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">The AI uses these to guide and evaluate apprentice observations.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dc-instructions">Instructions for apprentices</Label>
          <Textarea
            id="dc-instructions"
            value={config.userInstructions || ''}
            onChange={(e) => setConfig(prev => ({ ...prev, userInstructions: e.target.value }))}
            placeholder="e.g. Read the case study on the left, then share what you notice — look for risks, assumptions, decisions, and anything that stands out."
            rows={3}
            className="resize-none"
          />
        </div>

        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={() => setStep(2)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <Button onClick={() => onSave(config)} disabled={isSaving || !config.title.trim()}>
            {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : 'Save Activity'}
          </Button>
        </div>
      </div>
    );
  }

  if (isTaskWalkthrough) {
    return (
      <div className="space-y-5">
        <StepIndicator current={3} />
        <div className="space-y-2">
          <Label htmlFor="tw-title">Title</Label>
          <Input
            id="tw-title"
            value={config.title}
            onChange={(e) => setConfig(prev => ({ ...prev, title: e.target.value }))}
            maxLength={30}
            placeholder="e.g. Excel Pivot Table Walkthrough"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="tw-task">Task instructions</Label>
          <Textarea
            id="tw-task"
            value={config.referenceContent || ''}
            onChange={(e) => setConfig(prev => ({ ...prev, referenceContent: e.target.value }))}
            placeholder={"Paste the full task instructions here — exactly what apprentices were asked to do.\n\ne.g. Using the sales dataset provided, create a pivot table in Excel that shows total revenue by product category and region for Q1 2024. The data is on the 'Raw Data' tab. Save the pivot table on a new sheet called 'Analysis'."}
            rows={7}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">The AI uses this to understand the task and coach apprentices through it.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tw-criteria">Completion criteria</Label>
          <Textarea
            id="tw-criteria"
            value={normaliseCriteria(config.feedbackCriteria || '')}
            onChange={(e) => setConfig(prev => ({ ...prev, feedbackCriteria: e.target.value }))}
            placeholder={"e.g.\n- Pivot table is on a sheet called 'Analysis'\n- Data is grouped by product category and region\n- Q1 2024 filter is applied\n- Revenue figures are correct"}
            rows={5}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">What the task looks like when fully and correctly completed.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tw-instructions">Instructions for apprentices (shown before they start)</Label>
          <Textarea
            id="tw-instructions"
            value={config.userInstructions || ''}
            onChange={(e) => setConfig(prev => ({ ...prev, userInstructions: e.target.value }))}
            placeholder="e.g. Tell the AI what task you were given and how far you've got. It will help you complete the rest."
            rows={2}
            className="resize-none"
          />
        </div>

        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={() => setStep(2)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <Button onClick={() => onSave(config)} disabled={isSaving || !config.title.trim()}>
            {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : 'Save Activity'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <StepIndicator current={3} />

      <div className="space-y-2">
        <Label htmlFor="wiz-title">Title</Label>
        <Input
          id="wiz-title"
          value={config.title}
          onChange={(e) => setConfig(prev => ({ ...prev, title: e.target.value }))}
          maxLength={30}
          placeholder="Give your activity a title"
        />
      </div>

      {/* Interaction mode selector */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Interaction Mode</Label>
        <div className="inline-flex items-center gap-1 rounded-md border p-1">
          {([
            { value: 'typed', label: 'Typed only', icon: <Keyboard className="h-4 w-4" /> },
            { value: 'spoken', label: 'Voice only', icon: <Mic className="h-4 w-4" /> },
            { value: 'both', label: "Voice or typed — user's choice", icon: <><Keyboard className="h-4 w-4" /><Mic className="h-4 w-4 ml-0.5" /></> },
          ] as const).map(({ value, label, icon }) => (
            <button
              key={value}
              type="button"
              title={label}
              onClick={() => setConfig(prev => ({ ...prev, interactionMode: value }))}
              className={`flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium transition-colors
                ${(config.interactionMode ?? 'both') === value
                  ? 'bg-green-100 text-green-800'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
            >
              {icon}
              <span className="ml-1">{value === 'both' ? 'Both' : value === 'typed' ? 'Typed' : 'Voice'}</span>
            </button>
          ))}
        </div>
      </div>

      {isTwoWay && (
        <div className="space-y-3 border rounded-lg p-4">
          <p className="text-sm font-medium">Participant Roles</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Speaker 1 Role</Label>
              <Input
                value={config.participant1Role || ''}
                onChange={(e) => setConfig(prev => ({ ...prev, participant1Role: e.target.value }))}
                placeholder="e.g. Interviewer"
              />
            </div>
            <div className="space-y-1">
              <Label>Speaker 2 Role</Label>
              <Input
                value={config.participant2Role || ''}
                onChange={(e) => setConfig(prev => ({ ...prev, participant2Role: e.target.value }))}
                placeholder="e.g. Interviewee"
              />
            </div>
          </div>
        </div>
      )}

      {isTeachAi && (
        <div className="space-y-5 border rounded-lg p-4">
          <p className="text-sm font-medium">AI-as-the-learner settings</p>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label>Knowledge Level</Label>
              <span className="text-sm font-medium text-green-700">{KNOWLEDGE_LABELS[config.knowledgeLevel ?? 2]}</span>
            </div>
            <Slider min={0} max={4} step={1} value={[config.knowledgeLevel ?? 2]}
              onValueChange={([v]) => setConfig(prev => ({ ...prev, knowledgeLevel: v }))} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Beginner</span><span>Expert</span>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label>Attitude</Label>
              <span className="text-sm font-medium text-green-700">{ATTITUDE_LABELS[config.attitude ?? 2]}</span>
            </div>
            <Slider min={0} max={4} step={1} value={[config.attitude ?? 2]}
              onValueChange={([v]) => setConfig(prev => ({ ...prev, attitude: v }))} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Enthusiastic</span><span>Very Skeptical</span>
            </div>
          </div>
        </div>
      )}

      {isThoughtPartner && (
        <div className="space-y-5 border rounded-lg p-4">
          <p className="text-sm font-medium">Thought Partner Style</p>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label>Style</Label>
              <span className="text-sm font-medium text-green-700">{COACHING_LABELS[config.coachingStyle ?? 2]}</span>
            </div>
            <Slider min={0} max={4} step={1} value={[config.coachingStyle ?? 2]}
              onValueChange={([v]) => setConfig(prev => ({ ...prev, coachingStyle: v }))} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Coach</span><span>Advisor</span>
            </div>
            <p className="text-xs text-muted-foreground italic">{COACHING_DESCRIPTIONS[config.coachingStyle ?? 2]}</p>
          </div>

          <div className="space-y-2">
            <Label>Reference Material</Label>
            <Textarea
              value={config.referenceContent || ''}
              onChange={(e) => setConfig(prev => ({ ...prev, referenceContent: e.target.value }))}
              placeholder="Paste any frameworks, session notes, reading material, or key concepts you want the AI to draw on..."
              className="resize-none"
              rows={5}
            />
          </div>

          <div className="space-y-2">
            <Label>Reference Screenshots</Label>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" /> Upload Screenshots
            </Button>
            {config.referenceImages && config.referenceImages.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {config.referenceImages.map((img, i) => (
                  <div key={i} className="relative group">
                    <img src={img} alt={`Reference ${i + 1}`} className="h-20 w-20 object-cover rounded border" />
                    <button type="button" onClick={() => removeImage(i)}
                      className="absolute -top-1.5 -right-1.5 bg-white rounded-full p-0.5 shadow border border-gray-200 opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="h-3 w-3 text-gray-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!isTeachAi && !isThoughtPartner && (
        <div className="space-y-2">
          <Label htmlFor="wiz-system-prompt">System Prompt</Label>
          <Textarea
            id="wiz-system-prompt"
            value={config.systemPrompt}
            onChange={(e) => setConfig(prev => ({ ...prev, systemPrompt: e.target.value }))}
            className="resize-none font-mono text-sm leading-relaxed whitespace-pre-wrap"
            rows={10}
          />
          <p className="text-xs text-muted-foreground">Review and edit how the AI will behave.</p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="wiz-user-instructions">
          {isTeachAi ? 'Topic & Key Points' : isThoughtPartner ? 'Topic / Focus Area' : 'User Instructions'}
        </Label>
        <Textarea
          id="wiz-user-instructions"
          value={config.userInstructions || ''}
          onChange={(e) => setConfig(prev => ({ ...prev, userInstructions: e.target.value }))}
          className="resize-none whitespace-pre-wrap"
          rows={5}
        />
        <p className="text-xs text-muted-foreground">
          {isThoughtPartner ? 'Describe the concept or challenge this session helps learners think through.' : 'Shown to learners before they start.'}
        </p>
      </div>

      {(config.type === 'chat' || config.type === 'two-way-conversation' || config.type === 'teach-ai') && (
        <div className="space-y-2">
          <Label>Feedback Standard</Label>
          <div className="flex gap-1 flex-wrap">
            {([
              { value: 'encouraging', label: 'Encouraging' },
              { value: 'developmental', label: 'Developmental' },
              { value: 'standard', label: 'Standard' },
              { value: 'high-performance', label: 'High Performance' },
              { value: 'elite', label: 'Elite' },
            ] as const).map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setConfig(prev => ({ ...prev, feedbackHarshness: value }))}
                className={`px-3 py-1.5 text-xs rounded-full border font-medium transition-colors ${
                  (config.feedbackHarshness ?? 'standard') === value
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {(config.feedbackHarshness ?? 'standard') === 'encouraging' && 'Generous scoring — 7–8 for solid effort, 9–10 for excellent work.'}
            {(config.feedbackHarshness ?? 'standard') === 'developmental' && 'Supportive but honest — 6–7 for good effort, 8–9 for strong work.'}
            {(config.feedbackHarshness ?? 'standard') === 'standard' && 'Balanced — 5–6 is average, 7–8 is good, 9–10 is excellent.'}
            {(config.feedbackHarshness ?? 'standard') === 'high-performance' && 'High bar — 5–6 is competent, 7–8 is strong, 9–10 for exceptional work.'}
            {(config.feedbackHarshness ?? 'standard') === 'elite' && 'Rigorous — a 5 is decent, 8–9 is excellent. Only truly outstanding responses score 9–10.'}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="wiz-feedback">
          {isThoughtPartner ? 'Summary Focus (optional)' : 'Feedback Criteria'}
        </Label>
        <Textarea
          id="wiz-feedback"
          value={config.feedbackCriteria || ''}
          onChange={(e) => setConfig(prev => ({ ...prev, feedbackCriteria: e.target.value }))}
          className="resize-none whitespace-pre-wrap"
          rows={4}
        />
        {isThoughtPartner && (
          <p className="text-xs text-muted-foreground">Optionally guide what the AI highlights in the thinking map summary.</p>
        )}
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="ghost" onClick={() => setStep(prefill ? 1 : 2)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <Button onClick={() => onSave(config)} disabled={isSaving || !config.title.trim()}>
          {isSaving
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
            : 'Save Activity'
          }
        </Button>
      </div>
    </div>
  );
}
