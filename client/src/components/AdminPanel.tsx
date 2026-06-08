import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Sparkles, X, Upload, Keyboard, Mic, Lock, Users } from "lucide-react";
import type { AdminConfig } from "@/lib/types";
import { useState, useRef } from "react";

interface Props {
  config: AdminConfig;
  onConfigChange: (config: AdminConfig) => void;
  isEditMode?: boolean;
}

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

export default function AdminPanel({ config, onConfigChange, isEditMode = false }: Props) {
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTypeChange = (newType: 'chat' | 'two-way-conversation' | 'teach-ai' | 'thought-partner' | 'group-board') => {
    const extra = newType === 'teach-ai'
      ? { knowledgeLevel: 2, attitude: 2, systemPrompt: config.systemPrompt || ' ' }
      : newType === 'thought-partner'
      ? { coachingStyle: 2, systemPrompt: config.systemPrompt || ' ' }
      : newType === 'group-board'
      ? { groupBoardSettings: { numGroups: 4, showOtherGroups: true } }
      : {};
    onConfigChange({ ...config, type: newType, ...extra });
  };

  const handleGenerateWithAI = async () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    try {
      const res = await fetch("/api/configs/generate-with-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt, type: config.type }),
      });
      if (!res.ok) throw new Error("Generation failed");
      const data = await res.json();
      onConfigChange({
        ...config,
        title: data.title ?? config.title,
        systemPrompt: data.systemPrompt ?? config.systemPrompt,
        userInstructions: data.userInstructions ?? config.userInstructions,
        feedbackCriteria: data.feedbackCriteria ?? config.feedbackCriteria,
      });
      setShowAiPrompt(false);
      setAiPrompt("");
    } catch {
      // silently fail — user can try again
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
        const current = config.referenceImages || [];
        if (!current.includes(dataUrl)) {
          onConfigChange({ ...config, referenceImages: [...current, dataUrl] });
        }
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (index: number) => {
    const updated = (config.referenceImages || []).filter((_, i) => i !== index);
    onConfigChange({ ...config, referenceImages: updated });
  };

  const isTeachAi = config.type === 'teach-ai';
  const isThoughtPartner = config.type === 'thought-partner';
  const isGroupBoard = config.type === 'group-board';
  const isUserTester = config.type === 'user-tester';
  const isTaskWalkthrough = config.type === 'task-walkthrough';
  const isDocCritique = config.type === 'doc-critique';
  const isScreenShareType = isUserTester || isTaskWalkthrough;
  const showHarshness = config.type === 'chat' || config.type === 'two-way-conversation' || config.type === 'teach-ai';

  const HARSHNESS_LEVELS = [
    { value: 'encouraging', label: 'Encouraging' },
    { value: 'developmental', label: 'Developmental' },
    { value: 'standard', label: 'Standard' },
    { value: 'high-performance', label: 'High Performance' },
    { value: 'elite', label: 'Elite' },
  ] as const;
  const knowledgeLevel = config.knowledgeLevel ?? 2;
  const attitude = config.attitude ?? 2;
  const coachingStyle = config.coachingStyle ?? 2;

  return (
    <div className="space-y-6">
      {/* Type selector */}
      {isEditMode ? (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">Activity Type</Label>
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-50 border border-gray-200 w-fit">
            <Lock className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-700">
              {config.type === 'chat' ? 'Conversation with AI' :
               config.type === 'two-way-conversation' ? 'Two-way Conversation' :
               config.type === 'teach-ai' ? 'Teach an AI' :
               config.type === 'thought-partner' ? 'Thought Partner' :
               config.type === 'quick-fire-quiz' ? 'Quick Fire Quiz' :
               config.type === 'group-board' ? 'Group Board' :
               config.type === 'user-tester' ? 'User Tester' :
               config.type === 'doc-critique' ? 'Critique a Document' :
               config.type === 'task-walkthrough' ? 'Task Walkthrough' :
               config.type}
            </span>
            <span className="text-xs text-gray-400 ml-1">— cannot be changed</span>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="inline-flex items-center justify-start space-x-px rounded-md border overflow-hidden flex-wrap">
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium focus:outline-none ${config.type === 'chat' ? "bg-green-200 text-green-900" : "bg-white text-gray-700 hover:bg-gray-50"}`}
              onClick={() => handleTypeChange('chat')}
            >
              Conversation with AI
            </button>
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium focus:outline-none ${config.type === 'two-way-conversation' ? "bg-green-200 text-green-900" : "bg-white text-gray-700 hover:bg-gray-50"}`}
              onClick={() => handleTypeChange('two-way-conversation')}
            >
              Two-way Conversation
            </button>
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium focus:outline-none ${isTeachAi ? "bg-green-200 text-green-900" : "bg-white text-gray-700 hover:bg-gray-50"}`}
              onClick={() => handleTypeChange('teach-ai')}
            >
              Teach an AI
            </button>
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium focus:outline-none ${isThoughtPartner ? "bg-green-200 text-green-900" : "bg-white text-gray-700 hover:bg-gray-50"}`}
              onClick={() => handleTypeChange('thought-partner')}
            >
              Thought Partner
            </button>
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium focus:outline-none ${isGroupBoard ? "bg-green-200 text-green-900" : "bg-white text-gray-700 hover:bg-gray-50"}`}
              onClick={() => handleTypeChange('group-board')}
            >
              Group Board
            </button>
          </div>
        </div>
      )}

      {/* Interaction mode selector — not applicable for group boards or screen-share types */}
      {!isGroupBoard && !isScreenShareType && <div className="space-y-1">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Interaction Mode</Label>
        <div className="inline-flex items-center gap-1 rounded-md border p-1">
          {([
            { value: 'typed', label: 'Typed only', icon: <Keyboard className="h-4 w-4" /> },
            { value: 'spoken', label: 'Voice only', icon: <Mic className="h-4 w-4" /> },
            { value: 'both', label: 'Voice or typed — user\'s choice', icon: <><Keyboard className="h-4 w-4" /><Mic className="h-4 w-4 ml-0.5" /></> },
          ] as const).map(({ value, label, icon }) => (
            <button
              key={value}
              type="button"
              title={label}
              onClick={() => onConfigChange({ ...config, interactionMode: value })}
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
      </div>}

      {/* Create with AI */}
      {!isEditMode && <div className="space-y-2">
        {!showAiPrompt ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAiPrompt(true)}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Create with AI
          </Button>
        ) : (
          <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
            <Label>Describe what you want to create</Label>
            <Textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="e.g. A sales call practice scenario where a rep is pitching a SaaS product to a sceptical IT manager..."
              rows={3}
              className="resize-none"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleGenerateWithAI}
                disabled={isGenerating || !aiPrompt.trim()}
              >
                {isGenerating ? "Generating..." : "Generate"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setShowAiPrompt(false); setAiPrompt(""); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <input
            id="title"
            type="text"
            value={config.title}
            onChange={(e) => onConfigChange({ ...config, title: e.target.value })}
            placeholder="Give your activity a memorable title"
            className="w-full px-3 py-2 border rounded-md"
          />
        </div>

        {/* Two-way conversation role fields */}
        {config.type === 'two-way-conversation' && (
          <div className="space-y-3 border rounded-lg p-4">
            <p className="text-sm font-medium">Participant Roles</p>
            <p className="text-sm text-muted-foreground">Define the roles so participants know who plays who.</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="role1">Speaker 1 Role</Label>
                <Input
                  id="role1"
                  value={config.participant1Role || ''}
                  onChange={(e) => onConfigChange({ ...config, participant1Role: e.target.value })}
                  placeholder="e.g. Interviewer"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="role2">Speaker 2 Role</Label>
                <Input
                  id="role2"
                  value={config.participant2Role || ''}
                  onChange={(e) => onConfigChange({ ...config, participant2Role: e.target.value })}
                  placeholder="e.g. Interviewee"
                />
              </div>
            </div>
          </div>
        )}

        {/* Teach an AI — sliders */}
        {isTeachAi && (
          <div className="space-y-5 border rounded-lg p-4">
            <p className="text-sm font-medium">AI-as-the-learner settings</p>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label>Knowledge Level</Label>
                <span className="text-sm font-medium text-green-700">{KNOWLEDGE_LABELS[knowledgeLevel]}</span>
              </div>
              <Slider min={0} max={4} step={1} value={[knowledgeLevel]}
                onValueChange={([v]) => onConfigChange({ ...config, knowledgeLevel: v })} />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Beginner</span><span>Expert</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label>Attitude</Label>
                <span className="text-sm font-medium text-green-700">{ATTITUDE_LABELS[attitude]}</span>
              </div>
              <Slider min={0} max={4} step={1} value={[attitude]}
                onValueChange={([v]) => onConfigChange({ ...config, attitude: v })} />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Enthusiastic</span><span>Very Skeptical</span>
              </div>
            </div>
          </div>
        )}

        {/* Thought Partner — coaching style slider + reference material */}
        {isThoughtPartner && (
          <div className="space-y-5 border rounded-lg p-4">
            <p className="text-sm font-medium">Thought Partner Style</p>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label>Style</Label>
                <span className="text-sm font-medium text-green-700">{COACHING_LABELS[coachingStyle]}</span>
              </div>
              <Slider min={0} max={4} step={1} value={[coachingStyle]}
                onValueChange={([v]) => onConfigChange({ ...config, coachingStyle: v })} />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Coach</span><span>Advisor</span>
              </div>
              <p className="text-xs text-muted-foreground italic">{COACHING_DESCRIPTIONS[coachingStyle]}</p>
            </div>

            {/* Reference content */}
            <div className="space-y-2">
              <Label htmlFor="reference-content">Reference Material (paste notes, frameworks, content)</Label>
              <Textarea
                id="reference-content"
                value={config.referenceContent || ''}
                onChange={(e) => onConfigChange({ ...config, referenceContent: e.target.value })}
                placeholder="Paste any frameworks, session notes, reading material, or key concepts you want the AI to draw on..."
                className="resize-none"
                rows={6}
              />
            </div>

            {/* Reference image upload */}
            <div className="space-y-2">
              <Label>Reference Screenshots</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleImageUpload}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Screenshots
              </Button>
              {config.referenceImages && config.referenceImages.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {config.referenceImages.map((img, i) => (
                    <div key={i} className="relative group">
                      <img src={img} alt={`Reference ${i + 1}`} className="h-20 w-20 object-cover rounded border" />
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        className="absolute -top-1.5 -right-1.5 bg-white rounded-full p-0.5 shadow border border-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3 text-gray-500" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Screenshots are stored with this activity but not included in templates.</p>
            </div>
          </div>
        )}

        {/* Group Board settings */}
        {isGroupBoard && (
          <div className="space-y-4 border rounded-lg p-4">
            <p className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-green-600" /> Board Setup
            </p>
            <div className="space-y-2">
              <Label>Number of Groups</Label>
              <div className="flex items-center gap-3">
                <Slider
                  min={2} max={8} step={1}
                  value={[config.groupBoardSettings?.numGroups ?? 4]}
                  onValueChange={([v]) => onConfigChange({
                    ...config,
                    groupBoardSettings: { ...(config.groupBoardSettings ?? { showOtherGroups: true }), numGroups: v },
                  })}
                  className="flex-1"
                />
                <span className="text-sm font-medium text-green-700 w-8 text-right">
                  {config.groupBoardSettings?.numGroups ?? 4}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="board-instructions">Board Instructions</Label>
              <Textarea
                id="board-instructions"
                value={config.groupBoardSettings?.boardInstructions ?? ''}
                onChange={e => onConfigChange({
                  ...config,
                  groupBoardSettings: { ...(config.groupBoardSettings ?? { numGroups: 4 }), boardInstructions: e.target.value },
                })}
                placeholder="e.g. In your group, identify the top 3 risks and add them as post-its in your zone."
                className="resize-none"
                rows={3}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="show-other-groups"
                checked={config.groupBoardSettings?.showOtherGroups !== false}
                onChange={e => onConfigChange({
                  ...config,
                  groupBoardSettings: { ...(config.groupBoardSettings ?? { numGroups: 4 }), showOtherGroups: e.target.checked },
                })}
                className="rounded"
              />
              <Label htmlFor="show-other-groups" className="font-normal text-sm cursor-pointer">
                Show other groups' boards to participants
              </Label>
            </div>
          </div>
        )}

        {/* User Tester fields */}
        {isUserTester && (
          <>
            <div className="space-y-2">
              <Label htmlFor="ut-criteria">Evaluation criteria</Label>
              <Textarea
                id="ut-criteria"
                value={config.feedbackCriteria || ''}
                onChange={(e) => onConfigChange({ ...config, feedbackCriteria: e.target.value })}
                placeholder={"e.g.\n- Is the navigation intuitive?\n- Is the visual hierarchy clear?\n- Does it address the user need stated in the brief?"}
                className="resize-none"
                rows={6}
              />
              <p className="text-xs text-muted-foreground">The AI will ask questions and give final feedback based on these criteria.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ut-instructions">Additional context for the AI (optional)</Label>
              <Textarea
                id="ut-instructions"
                value={config.userInstructions || ''}
                onChange={(e) => onConfigChange({ ...config, userInstructions: e.target.value })}
                placeholder="e.g. The prototype is a mobile app for booking GP appointments. Apprentices should focus on the booking flow."
                className="resize-none"
                rows={3}
              />
            </div>
          </>
        )}

        {/* Task Walkthrough fields */}
        {isTaskWalkthrough && (
          <>
            <div className="space-y-2">
              <Label htmlFor="tw-task">Task instructions</Label>
              <Textarea
                id="tw-task"
                value={config.referenceContent || ''}
                onChange={(e) => onConfigChange({ ...config, referenceContent: e.target.value })}
                placeholder={"Paste the full task instructions here — exactly what apprentices were asked to do."}
                className="resize-none"
                rows={7}
              />
              <p className="text-xs text-muted-foreground">The AI uses this to understand the task and coach apprentices through it.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tw-criteria">Completion criteria</Label>
              <Textarea
                id="tw-criteria"
                value={config.feedbackCriteria || ''}
                onChange={(e) => onConfigChange({ ...config, feedbackCriteria: e.target.value })}
                placeholder={"e.g.\n- Pivot table is on a sheet called 'Analysis'\n- Data is grouped by product category and region"}
                className="resize-none"
                rows={5}
              />
              <p className="text-xs text-muted-foreground">What the task looks like when fully and correctly completed.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tw-instructions">Instructions for apprentices (shown before they start)</Label>
              <Textarea
                id="tw-instructions"
                value={config.userInstructions || ''}
                onChange={(e) => onConfigChange({ ...config, userInstructions: e.target.value })}
                placeholder="e.g. Tell the AI what task you were given and how far you've got. It will help you complete the rest."
                className="resize-none"
                rows={2}
              />
            </div>
          </>
        )}

        {/* Doc Critique fields */}
        {isDocCritique && (
          <>
            <div className="space-y-2">
              <Label htmlFor="dc-system">System Prompt</Label>
              <Textarea
                id="dc-system"
                value={config.systemPrompt || ''}
                onChange={(e) => onConfigChange({ ...config, systemPrompt: e.target.value })}
                placeholder="Act as a..."
                className="resize-none"
                rows={6}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dc-criteria">Feedback criteria</Label>
              <Textarea
                id="dc-criteria"
                value={config.feedbackCriteria || ''}
                onChange={(e) => onConfigChange({ ...config, feedbackCriteria: e.target.value })}
                placeholder="e.g. Did the apprentice identify the key risks? Did they notice the over-reliance on a single supplier?"
                className="resize-none"
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dc-instructions">Instructions for apprentices (optional)</Label>
              <Textarea
                id="dc-instructions"
                value={config.userInstructions || ''}
                onChange={(e) => onConfigChange({ ...config, userInstructions: e.target.value })}
                placeholder="e.g. Read the document carefully and share your observations."
                className="resize-none"
                rows={2}
              />
            </div>
          </>
        )}

        {/* System prompt — hidden for auto-generated types and dedicated-form types */}
        {!isTeachAi && !isThoughtPartner && !isGroupBoard && !isUserTester && !isTaskWalkthrough && !isDocCritique && (
          <div className="space-y-2">
            <Label htmlFor="system-prompt">System Prompt</Label>
            <Textarea
              id="system-prompt"
              value={config.systemPrompt || ''}
              onChange={(e) => onConfigChange({ ...config, systemPrompt: e.target.value })}
              placeholder="Act as a..."
              className="resize-none"
              rows={6}
            />
            <p className="text-sm text-muted-foreground">
              Customize how the AI assistant behaves by providing specific instructions.
            </p>
          </div>
        )}

        {!isGroupBoard && !isUserTester && !isTaskWalkthrough && !isDocCritique && (
          <div className="space-y-2">
            <Label htmlFor="user-instructions">
              {isTeachAi ? 'Topic & Key Points' : isThoughtPartner ? 'Topic / Focus Area' : 'User Instructions'}
            </Label>
            <Textarea
              id="user-instructions"
              value={config.userInstructions || ''}
              onChange={(e) => onConfigChange({ ...config, userInstructions: e.target.value })}
              placeholder={
                isTeachAi
                  ? "e.g. Topic: The water cycle\n\nKey points to cover:\n- Evaporation\n- Condensation\n- Precipitation\n- Collection"
                  : isThoughtPartner
                  ? "e.g. AI strategy — how to identify the right use cases and build an implementation roadmap"
                  : "Enter instructions for users..."
              }
              className="resize-none"
              rows={4}
            />
            <p className="text-sm text-muted-foreground">
              {isTeachAi
                ? 'Describe the topic and list the key points the learner should cover.'
                : isThoughtPartner
                ? 'Describe the concept or challenge this session helps learners think through. The AI will use this to open the conversation.'
                : 'Add helpful instructions or context that will be shown to users.'}
            </p>
          </div>
        )}

        {showHarshness && (
          <div className="space-y-2">
            <Label>Feedback Standard</Label>
            <div className="flex gap-1 flex-wrap">
              {HARSHNESS_LEVELS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onConfigChange({ ...config, feedbackHarshness: value })}
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

        {!isGroupBoard && !isUserTester && !isTaskWalkthrough && !isDocCritique && <div className="space-y-2">
          <Label htmlFor="feedback-criteria">
            {isThoughtPartner ? 'Summary Focus (optional)' : 'Feedback Criteria'}
          </Label>
          <Textarea
            id="feedback-criteria"
            value={config.feedbackCriteria || ''}
            onChange={(e) => onConfigChange({ ...config, feedbackCriteria: e.target.value })}
            placeholder={
              isTeachAi
                ? "e.g. Did the apprentice clearly explain all key points? Did they use appropriate examples?"
                : isThoughtPartner
                ? "e.g. Pay particular attention to how the learner connects the frameworks to their own organisation's context"
                : "Enter criteria for providing feedback to users..."
            }
            className="resize-none"
            rows={4}
          />
          {isThoughtPartner && (
            <p className="text-sm text-muted-foreground">
              Optionally guide what the AI highlights in the thinking map summary.
            </p>
          )}
        </div>}
      </div>
    </div>
  );
}
