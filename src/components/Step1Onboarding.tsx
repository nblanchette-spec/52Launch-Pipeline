import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Sparkles,
  Loader2,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { BrandProject, CreativeBrief, OnboardingData } from '../types/studio';

interface Step1OnboardingProps {
  project: BrandProject;
  onUpdateProject: (updated: BrandProject) => void;
  onNavigateStep: (step: 'step-2') => void;
}

interface ScriptSection {
  key: keyof Pick<
    OnboardingData,
    | 'philosophyNotes'
    | 'phaseExpectationsNotes'
    | 'founderProblemSolutionNotes'
    | 'visualPacingNotes'
  >;
  index: string;
  title: string;
  durationCue: string;
  teleprompterLines: string[];
  capturePrompt: string;
  placeholder: string;
}

const SCRIPT_SECTIONS: ScriptSection[] = [
  {
    key: 'philosophyNotes',
    index: '01',
    title: '52Launch Creative Philosophy',
    durationCue: '00:00 – 05:00',
    teleprompterLines: [
      '"At 52Launch, our goal is never to make a generic startup explainer. We build cinema-grade brand films that make an early-stage product feel inevitable."',
      '"Every frame needs a clear emotional wedge before it shows a single product feature. Today is about uncovering that wedge together."',
    ],
    capturePrompt: 'Creative Philosophy & Non-Negotiable Vibe',
    placeholder:
      'Capture what resonated with the founder, anti-references they want to avoid, and brand tone alignment...',
  },
  {
    key: 'phaseExpectationsNotes',
    index: '02',
    title: 'Setting 3-Phase Expectations',
    durationCue: '05:00 – 12:00',
    teleprompterLines: [
      '"We operate in three disciplined phases: Phase 1 is Pre-Production right here—locking the brief, visual ingredients, storyboards, and shot schedule before a single camera rents."',
      '"Phase 2 is Principal Photography on set—zero guesswork because every setup is already drawn and scheduled. Phase 3 is Post-Production—assembly, custom Foley, color grade, and cutdowns."',
    ],
    capturePrompt: '3-Phase Milestones, Shoot Window & Cutdown Deliverables',
    placeholder:
      'Note target launch deadline, investor/campaign dates, shoot city, and required aspect ratios (16:9 hero, 9:16 social)...',
  },
  {
    key: 'founderProblemSolutionNotes',
    index: '03',
    title: 'Startup Problem/Solution & Founder Story',
    durationCue: '12:00 – 25:00',
    teleprompterLines: [
      '"Walk me through the exact moment the old way broke for your customer—not the pitch deck bullet, the lived human frustration."',
      '"If someone only remembers one sentence and one visual image five seconds after watching this film, what must it be?"',
    ],
    capturePrompt: 'Core Problem, Product Wedge & Founder Insight',
    placeholder:
      'Capture the visceral customer pain point, the "aha" technical breakthrough, and key proof points...',
  },
  {
    key: 'visualPacingNotes',
    index: '04',
    title: 'Visual & Pacing Calibration',
    durationCue: '25:00 – 35:00',
    teleprompterLines: [
      '"Let’s calibrate texture and rhythm: are we living in calm architectural morning light with slow deliberate camera moves, or kinetic handheld energy with tight macro sound design?"',
      '"Which real-world environments, hero props, and cast archetypes feel unmistakably yours?"',
    ],
    capturePrompt: 'Lighting, Pacing, Cast, Locations & Hero Props',
    placeholder:
      'Capture camera style, lighting temperature, audio/music mood, talent archetype, and hero product details...',
  },
];

export const Step1Onboarding: React.FC<Step1OnboardingProps> = ({
  project,
  onUpdateProject,
  onNavigateStep,
}) => {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    philosophyNotes: true,
    phaseExpectationsNotes: true,
    founderProblemSolutionNotes: true,
    visualPacingNotes: true,
  });
  const [teleprompterLarge, setTeleprompterLarge] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const updateNotes = (
    key: keyof Pick<
      OnboardingData,
      | 'philosophyNotes'
      | 'phaseExpectationsNotes'
      | 'founderProblemSolutionNotes'
      | 'visualPacingNotes'
    >,
    value: string
  ) => {
    onUpdateProject({
      ...project,
      onboarding: {
        ...project.onboarding,
        [key]: value,
      },
      updatedAt: new Date().toISOString(),
    });
  };

  const handleGenerateBrief = async () => {
    setErrorMsg(null);
    setIsGenerating(true);
    try {
      const response = await fetch('/api/ai/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandName: project.brandName,
          projectTitle: project.projectTitle,
          industry: project.industry,
          onboarding: project.onboarding,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to synthesize Creative Brief.');
      }

      const validRatios = Array.isArray(data.deliverablesAspectRatios)
        ? data.deliverablesAspectRatios.filter((r: string) =>
            ['16:9', '9:16', '4:5', '1:1'].includes(r)
          )
        : ['16:9', '9:16'];

      const nextBrief: CreativeBrief = {
        objectiveAndKpis: data.objectiveAndKpis || '',
        targetAudiencePersona: data.targetAudiencePersona || '',
        coreHookMessage: data.coreHookMessage || '',
        toneAndPacing: data.toneAndPacing || '',
        visualStyleNotes: data.visualStyleNotes || '',
        colorPalette: Array.isArray(data.colorPalette)
          ? data.colorPalette.map(
              (sw: { name: string; hex: string }, idx: number) => ({
                id: `sw-${Date.now()}-${idx}`,
                name: sw.name || `Tone ${idx + 1}`,
                hex: /^#[0-9A-Fa-f]{6}$/.test(sw.hex) ? sw.hex : '#F59E0B',
              })
            )
          : project.brief.colorPalette,
        deliverablesAspectRatios: validRatios.length > 0 ? validRatios : ['16:9'],
        mandatories: data.mandatories || '',
      };

      onUpdateProject({
        ...project,
        onboarding: {
          ...project.onboarding,
          kickoffCompleted: true,
        },
        brief: nextBrief,
        updatedAt: new Date().toISOString(),
      });
      onNavigateStep('step-2');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to generate Creative Brief.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-[1360px] mx-auto px-6 py-7 space-y-6">
      {/* Top Step Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-[#262B36]">
        <div>
          <div className="text-xs font-medium text-amber-400">
            Step 01 · Client Onboarding
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 mt-1">
            The 52Launch Spiel — Split-Screen Kickoff Mode
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Follow the collapsible director teleprompter on the left while capturing live discovery
            notes on the right for <span className="text-zinc-200 font-medium">{project.brandName}</span>.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setTeleprompterLarge((v) => !v)}
            className="px-3 py-2 text-xs font-medium text-zinc-300 bg-[#14171D] border border-[#262B36] hover:border-zinc-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {teleprompterLarge ? 'Standard Script Size' : 'Large Teleprompter Type'}
          </button>

          <button
            type="button"
            disabled={isGenerating}
            onClick={handleGenerateBrief}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Synthesizing Brief...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate Creative Brief →
              </>
            )}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/40 text-xs text-rose-300">
          {errorMsg}
        </div>
      )}

      {/* Split Screen Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Panel: Interactive Teleprompter Script */}
        <div className="bg-[#14171D] border border-[#262B36] rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 bg-[#101318] border-b border-[#262B36] flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-200">
              Interactive Teleprompter Script
            </span>
            <span className="text-xs text-zinc-500 font-mono tabular-nums">
              35 min kickoff guide
            </span>
          </div>

          <div className="divide-y divide-[#262B36]">
            {SCRIPT_SECTIONS.map((sec) => {
              const isOpen = openSections[sec.key];
              return (
                <div key={sec.key} className="bg-[#14171D]">
                  <button
                    type="button"
                    onClick={() => toggleSection(sec.key)}
                    className="w-full px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[#191D25] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isOpen ? (
                        <ChevronDown className="w-4 h-4 text-amber-400 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
                      )}
                      <span className="text-sm font-semibold text-zinc-100 truncate">
                        {sec.index}. {sec.title}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-zinc-500 tabular-nums shrink-0">
                      {sec.durationCue}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-5 pt-1 space-y-3 bg-[#0E1116]">
                      {sec.teleprompterLines.map((line, idx) => (
                        <p
                          key={idx}
                          className={`text-zinc-200 leading-relaxed ${
                            teleprompterLarge ? 'text-base' : 'text-sm'
                          }`}
                        >
                          {line}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Panel: Live Discovery Capture */}
        <div className="bg-[#14171D] border border-[#262B36] rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 bg-[#101318] border-b border-[#262B36] flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-200">
              Live Discovery Capture
            </span>
            {project.onboarding.kickoffCompleted ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Brief Synced
              </span>
            ) : (
              <span className="text-xs text-zinc-500">Auto-saved locally</span>
            )}
          </div>

          <div className="p-5 space-y-5">
            {SCRIPT_SECTIONS.map((sec) => (
              <div key={sec.key} className="space-y-1.5">
                <label className="flex items-center justify-between text-xs font-medium text-zinc-300">
                  <span>
                    {sec.index}. {sec.capturePrompt}
                  </span>
                  <span className="text-[11px] font-mono text-zinc-500 tabular-nums">
                    {project.onboarding[sec.key].length} chars
                  </span>
                </label>
                <textarea
                  rows={4}
                  placeholder={sec.placeholder}
                  value={project.onboarding[sec.key]}
                  onChange={(e) => updateNotes(sec.key, e.target.value)}
                  className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 leading-relaxed"
                />
              </div>
            ))}

            <div className="pt-2 flex items-center justify-between gap-4 border-t border-[#262B36]">
              <button
                type="button"
                onClick={() => onNavigateStep('step-2')}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                Skip to Brief & Mood Board
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                disabled={isGenerating}
                onClick={handleGenerateBrief}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating Brief...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Creative Brief →
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
