import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  Clapperboard,
  Compass,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Mic,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import { PipelineStepNumber, ProjectSummary } from '../../types/pipeline';

interface WelcomeHomeProps {
  projects: ProjectSummary[];
  onOpenProject: (projectId: string, step?: PipelineStepNumber) => void;
  onStartNewProject: () => void;
  onImportBackup: (file: File) => void;
  onDeleteProject: (projectId: string) => Promise<void>;
}

interface PipelineWalkthroughStage {
  step: PipelineStepNumber;
  phase: 'Phase 1 · Strategy & Shot Design' | 'Phase 2 · Visuals, Video & Voice' | 'Phase 3 · On-Set Execution';
  title: string;
  shortLabel: string;
  summary: string;
  inputs: string[];
  outputs: string[];
  gateRule: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ASSEMBLY_STAGES: PipelineWalkthroughStage[] = [
  {
    step: 1,
    phase: 'Phase 1 · Strategy & Shot Design',
    title: 'Project & Asset Intake',
    shortLabel: 'Intake',
    summary:
      'Collect the client brief, upload real product photos and logos, pull in Google Drive folders, and extract typography, colors, and visual rules directly from brand guide PDFs.',
    inputs: ['Client & product details', 'Product photos & logo', 'Brand guide PDFs or Google Drive links'],
    outputs: ['Structured project intake', 'Extracted PDF color & style rules', 'Locked asset references'],
    gateRule: 'Creates the project workspace and saves every asset locally and to Google Drive.',
    icon: FolderOpen,
  },
  {
    step: 2,
    phase: 'Phase 1 · Strategy & Shot Design',
    title: 'Brand Bible',
    shortLabel: 'Brand Bible',
    summary:
      'Locks brand positioning, character appearances, lighting, camera rules, provable claims, and banned clichés into one source of truth before creative concepts begin.',
    inputs: ['Project intake notes', 'Extracted PDF style guide', 'Product visual constraints'],
    outputs: ['Brand tone & visual grammar', 'Named recurring characters', 'Claims & guardrails list'],
    gateRule: 'Approving the Brand Bible unlocks the Creative Brief and keeps all prompts compliant.',
    icon: BookOpen,
  },
  {
    step: 3,
    phase: 'Phase 1 · Strategy & Shot Design',
    title: 'Creative Brief',
    shortLabel: 'Brief',
    summary:
      'Develops distinct commercial concepts tailored to your deliverables, picks the strongest recommendation, and sets voiceover pace and emotional arc.',
    inputs: ['Approved Brand Bible', 'Deliverable specs (e.g. 30s Hero, 15s Cutdowns)'],
    outputs: ['Ranked creative concepts', 'Recommended spot logline', 'VO speaker & pacing direction'],
    gateRule: 'Approving the Creative Brief locks the narrative direction for the Shot List.',
    icon: Compass,
  },
  {
    step: 4,
    phase: 'Phase 1 · Strategy & Shot Design',
    title: 'Shot List & Board',
    shortLabel: 'Shot Board',
    summary:
      'Breaks the approved concept into numbered shots (S01, S02…), routes each shot as AI Video, Hybrid, or Live Action, and drafts consistent frame prompts and shoot notes.',
    inputs: ['Approved Creative Brief', 'Brand character descriptors', 'Real product placeholders'],
    outputs: ['Sequenced shot board', 'AI vs. Hybrid vs. Live routing', 'Voiceover draft per shot'],
    gateRule: 'Approving the Shot List unlocks Storyboard Studio, Frame QA, and Video rendering.',
    icon: Clapperboard,
  },
  {
    step: 5,
    phase: 'Phase 2 · Visuals, Video & Voice',
    title: 'Storyboard Studio',
    shortLabel: 'Storyboard',
    summary:
      'Choose a visual style, generate 2×2 Character Contact Sheets, Location Multi-Angle Sheets, and Product-Anchored Props via Fal Nano Banana, then render consistent storyboard frames.',
    inputs: ['Approved Shot List', 'Chosen art style & model', 'Real product photos & continuity sheets'],
    outputs: ['Locked continuity contact sheets', 'Complete visual storyboard frames', 'Uploaded or pasted Flow frames'],
    gateRule: 'Frames flow seamlessly into QA inspection and become start/end keyframes for video generation.',
    icon: ImageIcon,
  },
  {
    step: 6,
    phase: 'Phase 2 · Visuals, Video & Voice',
    title: 'Frame Suggestions & QA',
    shortLabel: 'Frame Check',
    summary:
      'Audits uploaded or generated frames against your Brand Bible and real product photography, flagging fidelity drift and offering tightened prompt rewrites.',
    inputs: ['Storyboard frames from Step 5', 'Real product photos', 'Brand Bible character/style rules'],
    outputs: ['Per-shot continuity audit', 'Product fidelity comparison', 'Approved production frames'],
    gateRule: 'Approving Storyboard Frames marks your visual boards production-ready for Video Studio.',
    icon: ShieldCheck,
  },
  {
    step: 7,
    phase: 'Phase 2 · Visuals, Video & Voice',
    title: 'Video Prompts & Studio',
    shortLabel: 'Video Studio',
    summary:
      'Writes camera-motion video prompts with negative constraints and renders clips using Veo 3.1, Gemini Omni Flash, Kling, Seedance, Luma, Wan, or Topaz 4K upscaling.',
    inputs: ['Approved storyboard frames', 'Shot timing & motion direction', 'Optional chained end-frames'],
    outputs: ['Rendered motion clips', 'Clip take history per shot', 'Optional Topaz AI upscales'],
    gateRule: 'Approving the Video step moves cleanly into Voiceover timing and synthesis.',
    icon: Video,
  },
  {
    step: 8,
    phase: 'Phase 2 · Visuals, Video & Voice',
    title: 'VO Script & Audio Studio',
    shortLabel: 'VO & Audio',
    summary:
      'Refines spoken narration to match shot durations word-for-word and synthesizes broadcast-ready voice tracks in MP3/WAV with tunable pacing, emotion, and delivery.',
    inputs: ['Shot durations & VO beats', 'Creative Brief speaker guidance'],
    outputs: ['Shot-timed VO script', 'Generated Gemini TTS audio clips', 'Downloadable stem files'],
    gateRule: 'Approving the Voiceover finalizes timing and unlocks the On-Set Shoot Plan.',
    icon: Mic,
  },
  {
    step: 9,
    phase: 'Phase 3 · On-Set Execution',
    title: 'Live Shoot Plan & Exports',
    shortLabel: 'Shoot Plan',
    summary:
      'Compiles call times, setup schedules, gear checklists, prop counts, crew roles, risk mitigations, and one-click Master PDF & Printable Call Sheet packages.',
    inputs: ['All live & hybrid shots', 'Location, dates & budget notes'],
    outputs: ['Day-by-day setup schedule', 'Equipment & prop checklist', 'Master PDF Production Book'],
    gateRule: 'Final approval completes the production assembly stream ready for client sign-off and set.',
    icon: Film,
  },
];

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Recently updated';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function countApprovedGates(summary: ProjectSummary): number {
  const a = summary.approvals;
  return [
    a.intakeCompleted,
    a.bibleApproved,
    a.briefApproved,
    a.shotListApproved,
    a.storyboardApproved,
    a.videoPromptsApproved,
    a.voApproved,
    a.shootPlanApproved,
  ].filter(Boolean).length;
}

const ContactThumbCell: React.FC<{
  url?: string;
  label?: string;
  index: number;
}> = ({ url, label, index }) => {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <div className="relative w-full h-full bg-[#EFEFF2] flex flex-col items-center justify-center p-2 select-none">
        <ImageIcon className="w-4 h-4 text-[#B0B0BC] mb-1" />
        <span className="text-[10px] font-mono tabular-nums text-[#8A8A98]">
          {label || `FRAME 0${index + 1}`}
        </span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-[#18181D] overflow-hidden group/cell">
      <img
        src={url}
        alt={label || `Project thumbnail ${index + 1}`}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="w-full h-full object-cover transition-transform duration-300 group-hover/card:scale-[1.03]"
      />
      <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/80 via-black/35 to-transparent pointer-events-none" />
      {label && (
        <span className="absolute left-1.5 bottom-1 max-w-[88%] truncate text-[10px] font-mono tabular-nums text-white/95 tracking-tight">
          {label}
        </span>
      )}
    </div>
  );
};

export const WelcomeHome: React.FC<WelcomeHomeProps> = ({
  projects,
  onOpenProject,
  onStartNewProject,
  onImportBackup,
  onDeleteProject,
}) => {
  const importRef = useRef<HTMLInputElement>(null);
  const walkthroughRef = useRef<HTMLElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'active' | 'completed'>('all');
  const [selectedStageStep, setSelectedStageStep] = useState<PipelineStepNumber>(1);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return projects.filter((proj) => {
      const isComplete = proj.approvals.shootPlanApproved;
      if (filterMode === 'active' && isComplete) return false;
      if (filterMode === 'completed' && !isComplete) return false;
      if (!q) return true;
      return (
        proj.client.toLowerCase().includes(q) ||
        proj.productName.toLowerCase().includes(q) ||
        (proj.conceptTitle || '').toLowerCase().includes(q)
      );
    });
  }, [projects, searchQuery, filterMode]);

  const activeWalkthroughStage =
    ASSEMBLY_STAGES.find((s) => s.step === selectedStageStep) || ASSEMBLY_STAGES[0];

  const latestProject = projects[0] || null;

  const handleConfirmDelete = async (projectId: string) => {
    setDeletingId(projectId);
    try {
      await onDeleteProject(projectId);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-[1360px] mx-auto px-5 sm:px-8 py-8 sm:py-10 space-y-12">
      {/* 1. Inviting Hero Section */}
      <section className="bg-white border border-[#E2E2E6] brand-corner p-6 sm:p-9 shadow-xs">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-medium text-[#891A23]">
                <span>52Launch Production Assembly</span>
                <span aria-hidden="true">·</span>
                <span className="text-[#5A5A66]">9-Gate Studio Pipeline</span>
              </div>

              <h1
                className="text-3xl sm:text-4xl lg:text-[42px] font-semibold tracking-tight text-[#111114] leading-[1.12] font-display"
                style={{ textWrap: 'balance' }}
              >
                Turn client intake into production-ready films without losing continuity.
              </h1>

              <p className="text-[15px] sm:text-base text-[#5A5A66] leading-relaxed max-w-2xl">
                Every commercial moves down one gated assembly line: lock your Brand Bible and
                real product photos first, build contact-sheet storyboards, generate clips and
                voiceovers, and export a shoot-ready Call Sheet.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={onStartNewProject}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#C6202F] hover:bg-[#AD1A27] brand-corner-sm transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-xs"
              >
                <Plus className="w-4 h-4" />
                New project
              </button>

              {latestProject && (
                <button
                  type="button"
                  onClick={() => onOpenProject(latestProject.id)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#111114] bg-[#F6F6F7] hover:bg-[#EFEFF2] border border-[#D8D8DF] rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <span>Resume {latestProject.productName}</span>
                  <ArrowRight className="w-4 h-4 text-[#891A23]" />
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  walkthroughRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium text-[#5A5A66] hover:text-[#111114] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>How the 9-step pipeline works</span>
              </button>

              <input
                ref={importRef}
                type="file"
                accept=".52launch-backup,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    onImportBackup(f);
                    e.target.value = '';
                  }
                }}
              />
              <button
                type="button"
                onClick={() => importRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium text-[#5A5A66] hover:text-[#111114] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Upload className="w-4 h-4" />
                <span>Import backup</span>
              </button>
            </div>
          </div>

          {/* Right Column: Compact Assembly Stream Overview */}
          <div className="lg:col-span-5 bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg p-5 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E2E6] pb-3">
              <h2 className="text-sm font-semibold text-[#111114] font-display">
                Foolproof Assembly Stream
              </h2>
              <span className="text-xs font-mono tabular-nums text-[#5A5A66]">
                3 Phases · 9 Gates
              </span>
            </div>

            <div className="space-y-3">
              <div className="bg-white border border-[#E2E2E6] rounded-md p-3.5">
                <div className="flex items-center justify-between text-xs font-semibold text-[#111114]">
                  <span>01. Foundation & Shot Design</span>
                  <span className="font-mono tabular-nums text-[#891A23]">Steps 1–4</span>
                </div>
                <p className="text-xs text-[#5A5A66] mt-1 leading-relaxed">
                  Intake & PDF guides feed a locked Brand Bible, Creative Brief, and sequenced Shot Board.
                </p>
              </div>

              <div className="bg-white border border-[#E2E2E6] rounded-md p-3.5">
                <div className="flex items-center justify-between text-xs font-semibold text-[#111114]">
                  <span>02. Visuals, Video & Voice</span>
                  <span className="font-mono tabular-nums text-[#891A23]">Steps 5–8</span>
                </div>
                <p className="text-xs text-[#5A5A66] mt-1 leading-relaxed">
                  Contact-sheet assets keep frames consistent through QA, AI video renders, and timed VO.
                </p>
              </div>

              <div className="bg-white border border-[#E2E2E6] rounded-md p-3.5">
                <div className="flex items-center justify-between text-xs font-semibold text-[#111114]">
                  <span>03. On-Set Execution & Handoff</span>
                  <span className="font-mono tabular-nums text-[#891A23]">Step 9</span>
                </div>
                <p className="text-xs text-[#5A5A66] mt-1 leading-relaxed">
                  Exports a shoot schedule, equipment list, printable call sheet, and Master Production PDF.
                </p>
              </div>
            </div>

            <p className="text-xs text-[#5A5A66] leading-relaxed">
              Editing an earlier approved step automatically clears downstream approvals so nothing stays out of sync.
            </p>
          </div>
        </div>
      </section>

      {/* 2. Saved Projects Contact-Sheet Gallery */}
      <section className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E2E2E6] pb-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-[#111114] font-display">
              Saved Projects
            </h2>
            <p className="text-sm text-[#5A5A66] mt-0.5">
              Select a contact sheet to jump straight back to its active production gate, or start a fresh client film.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Box */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#7A7A86] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search client or product..."
                aria-label="Search saved projects"
                className="bg-white border border-[#D8D8DF] focus:border-[#C6202F] rounded-md pl-8 pr-3 py-1.5 text-xs text-[#111114] placeholder:text-[#8A8A98] focus:outline-none w-52 sm:w-60 transition-colors"
              />
            </div>

            {/* Interactive Filter Tabs */}
            <div
              role="group"
              aria-label="Filter projects"
              className="flex items-center gap-1 p-1 bg-[#EFEFF2] rounded-md"
            >
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'active', label: 'In Progress' },
                  { id: 'completed', label: 'Completed' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterMode(tab.id)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    filterMode === tab.id
                      ? 'bg-white text-[#111114] shadow-xs font-semibold'
                      : 'text-[#5A5A66] hover:text-[#11114]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredProjects.length === 0 ? (
          <div className="bg-white border border-[#E2E2E6] rounded-lg p-10 text-center space-y-4">
            <div className="w-11 h-11 rounded-md bg-[#F6F6F7] border border-[#E2E2E6] mx-auto flex items-center justify-center text-[#891A23]">
              <Clapperboard className="w-5 h-5" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h3 className="text-base font-semibold text-[#111114] font-display">
                {projects.length === 0
                  ? 'No saved productions yet'
                  : 'No projects match your current filter'}
              </h3>
              <p className="text-sm text-[#5A5A66]">
                {projects.length === 0
                  ? 'Launch your first production by uploading a product photo, brand guide PDF, or intake notes.'
                  : 'Clear the search filter or start a brand new production right now.'}
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-1">
              {projects.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setFilterMode('all');
                  }}
                  className="px-4 py-2 text-xs font-medium text-[#111114] bg-[#F6F6F7] hover:bg-[#EFEFF2] border border-[#D8D8DF] rounded-md cursor-pointer transition-colors whitespace-nowrap shrink-0"
                >
                  Reset filters
                </button>
              ) : null}
              <button
                type="button"
                onClick={onStartNewProject}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#C6202F] hover:bg-[#AD1A27] brand-corner-sm cursor-pointer transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                New project
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredProjects.map((proj) => {
              const thumbs = proj.thumbnailStrip || [];
              // Always display a 4-panel 2x2 contact sheet grid cleanly
              const sheetSlots = [0, 1, 2, 3].map((idx) => thumbs[idx]);
              const gatesDone = countApprovedGates(proj);
              const progressPct = Math.round((gatesDone / 8) * 100);
              const isConfirmingDelete = confirmDeleteId === proj.id;

              return (
                <article
                  key={proj.id}
                  className="group/card bg-white border border-[#E2E2E6] hover:border-[#891A23]/60 brand-corner overflow-hidden flex flex-col justify-between transition-colors shadow-xs"
                >
                  {/* Contact Sheet Visual Strip (4-up 2x2 contact sheet) */}
                  <button
                    type="button"
                    onClick={() => onOpenProject(proj.id)}
                    aria-label={`Open ${proj.productName} contact sheet`}
                    className="relative w-full aspect-[16/10] bg-[#141418] grid grid-cols-2 grid-rows-2 gap-[1px] cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C6202F]"
                  >
                    {sheetSlots.map((slot, idx) => (
                      <ContactThumbCell
                        key={`${proj.id}-slot-${idx}`}
                        url={slot?.url}
                        label={slot?.label}
                        index={idx}
                      />
                    ))}

                    {thumbs.length > 4 && (
                      <div className="absolute top-2.5 right-2.5 px-2 py-0.5 bg-black/75 text-white text-[11px] font-mono tabular-nums rounded">
                        +{thumbs.length - 4} more
                      </div>
                    )}
                  </button>

                  {/* Project Metadata & Assembly Gate Progress */}
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-2.5">
                      {/* Unboxed Metadata with Typographic Separators */}
                      <div className="flex items-center justify-between gap-2 text-xs text-[#5A5A66]">
                        <span className="truncate font-medium text-[#891A23]">
                          {proj.client}
                        </span>
                        <span className="font-mono tabular-nums shrink-0 text-[11px]">
                          {formatRelativeDate(proj.updatedAt)}
                        </span>
                      </div>

                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-lg font-semibold text-[#111114] leading-snug font-display line-clamp-1">
                          {proj.productName}
                        </h3>
                        {proj.paletteHexes && proj.paletteHexes.length > 0 && (
                          <div
                            className="flex items-center gap-1 pt-1 shrink-0"
                            title={`Brand palette: ${proj.paletteHexes.join(', ')}`}
                          >
                            {proj.paletteHexes.slice(0, 4).map((hex) => (
                              <span
                                key={hex}
                                className="w-3 h-3 rounded-xs border border-black/15"
                                style={{ backgroundColor: hex }}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      {proj.conceptTitle && (
                        <p className="text-xs text-[#5A5A66] line-clamp-2 leading-relaxed">
                          {proj.conceptTitle}
                        </p>
                      )}

                      {/* Unboxed Shot / Frame / Video / VO Counts */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#5A5A66] font-mono tabular-nums pt-0.5">
                        <span>{proj.shotCount} shots</span>
                        <span aria-hidden="true">·</span>
                        <span>{proj.framesReadyCount} frames</span>
                        <span aria-hidden="true">·</span>
                        <span>{proj.videosReadyCount} clips</span>
                        {proj.totalVoCount > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>
                              {proj.voReadyCount}/{proj.totalVoCount} VO
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* 9-Gate Mini Progress Bar */}
                    <div className="space-y-2 pt-2 border-t border-[#EFEFF2]">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#5A5A66]">
                          Next:{' '}
                          <span className="font-semibold text-[#111114]">
                            {proj.nextStepNumber}. {proj.nextStepLabel}
                          </span>
                        </span>
                        <span className="font-mono tabular-nums text-[11px] text-[#5A5A66]">
                          {progressPct}%
                        </span>
                      </div>
                      <div className="grid grid-cols-8 gap-1">
                        {[
                          proj.approvals.intakeCompleted,
                          proj.approvals.bibleApproved,
                          proj.approvals.briefApproved,
                          proj.approvals.shotListApproved,
                          proj.approvals.storyboardApproved,
                          proj.approvals.videoPromptsApproved,
                          proj.approvals.voApproved,
                          proj.approvals.shootPlanApproved,
                        ].map((done, gateIdx) => (
                          <span
                            key={gateIdx}
                            className={`h-1.5 rounded-xs ${
                              done ? 'bg-[#C6202F]' : 'bg-[#E6E6EB]'
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => onOpenProject(proj.id)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#111114] hover:bg-[#C6202F] brand-corner-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <span>Open Studio</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>

                      {isConfirmingDelete ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={deletingId === proj.id}
                            onClick={() => void handleConfirmDelete(proj.id)}
                            className="px-2.5 py-2 text-xs font-semibold text-white bg-[#C6202F] hover:bg-[#AD1A27] rounded-md cursor-pointer whitespace-nowrap disabled:opacity-60"
                          >
                            {deletingId === proj.id ? 'Removing...' : 'Confirm'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2.5 py-2 text-xs font-medium text-[#5A5A66] bg-[#F6F6F7] hover:bg-[#EFEFF2] rounded-md cursor-pointer whitespace-nowrap"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(proj.id)}
                          title={`Delete ${proj.productName}`}
                          aria-label={`Delete ${proj.productName}`}
                          className="p-2 text-[#7A7A86] hover:text-[#C6202F] hover:bg-[#FDF2F3] border border-[#E2E2E6] rounded-md transition-colors cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}

            {/* Add New Project Contact Sheet Tile */}
            <button
              type="button"
              onClick={onStartNewProject}
              className="min-h-[290px] bg-[#FAFAFB] hover:bg-white border border-dashed border-[#C8C8D2] hover:border-[#C6202F] brand-corner p-6 flex flex-col items-center justify-center text-center gap-3 transition-colors cursor-pointer group"
            >
              <div className="w-11 h-11 rounded-md bg-white border border-[#E2E2E6] group-hover:border-[#C6202F] group-hover:text-[#C6202F] text-[#111114] flex items-center justify-center transition-colors">
                <Plus className="w-5 h-5" />
              </div>
              <div className="space-y-1 max-w-[230px]">
                <div className="text-sm font-semibold text-[#111114] font-display">
                  Start New Production
                </div>
                <p className="text-xs text-[#5A5A66] leading-relaxed">
                  Kick off a fresh 9-step project from client notes, product photos, or a PDF brand guide.
                </p>
              </div>
            </button>
          </div>
        )}
      </section>

      {/* 3. Interactive Foolproof Assembly Stream Walkthrough */}
      <section
        ref={walkthroughRef}
        className="bg-white border border-[#E2E2E6] brand-corner p-6 sm:p-8 space-y-6 shadow-xs"
      >
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#EFEFF2] pb-5">
          <div className="space-y-1">
            <div className="text-xs font-medium text-[#891A23]">
              Interactive Pipeline Guide
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-[#111114] font-display">
              Walk Through the 9-Stage Assembly Stream
            </h2>
            <p className="text-sm text-[#5A5A66] max-w-2xl">
              Click any stage below to see what inputs are needed, what the studio generates, and how each approval gate keeps your entire film aligned.
            </p>
          </div>

          <button
            type="button"
            onClick={onStartNewProject}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#C6202F] hover:bg-[#AD1A27] brand-corner-sm transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start md:self-auto"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Begin Step 1 Intake
          </button>
        </div>

        {/* 9-Step Clickable Horizontal Stream Selector */}
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
          {ASSEMBLY_STAGES.map((stage) => {
            const Icon = stage.icon;
            const active = stage.step === activeWalkthroughStage.step;
            return (
              <button
                key={stage.step}
                type="button"
                onClick={() => setSelectedStageStep(stage.step)}
                className={`p-3 rounded-md border text-left transition-colors cursor-pointer flex flex-col justify-between gap-2 ${
                  active
                    ? 'bg-[#111114] text-white border-[#111114] brand-corner-sm'
                    : 'bg-[#F6F6F7] text-[#111114] border-[#E2E2E6] hover:border-[#891A23] hover:bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[11px] font-mono tabular-nums font-semibold ${
                      active ? 'text-[#F3A8AF]' : 'text-[#891A23]'
                    }`}
                  >
                    0{stage.step}
                  </span>
                  <Icon
                    className={`w-3.5 h-3.5 ${active ? 'text-white' : 'text-[#5A5A66]'}`}
                  />
                </div>
                <span className="text-xs font-semibold leading-tight truncate">
                  {stage.shortLabel}
                </span>
              </button>
            );
          })}
        </div>

        {/* Focused Stage Blueprint Details */}
        <div className="bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 space-y-3">
            <div className="text-xs font-medium text-[#891A23]">
              {activeWalkthroughStage.phase}
            </div>
            <h3 className="text-xl font-semibold text-[#111114] font-display">
              0{activeWalkthroughStage.step}. {activeWalkthroughStage.title}
            </h3>
            <p className="text-sm text-[#5A5A66] leading-relaxed">
              {activeWalkthroughStage.summary}
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-2.5">
              {latestProject ? (
                <button
                  type="button"
                  onClick={() =>
                    onOpenProject(latestProject.id, activeWalkthroughStage.step)
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#891A23] hover:bg-[#6E141C] brand-corner-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <span>
                    Open {latestProject.productName} at Step {activeWalkthroughStage.step}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onStartNewProject}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#C6202F] hover:bg-[#AD1A27] brand-corner-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <span>Start a project here</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-[#E2E2E6] rounded-md p-4 space-y-2.5">
              <div className="text-xs font-semibold text-[#111114]">
                Inputs Needed
              </div>
              <ul className="space-y-1.5 text-xs text-[#5A5A66]">
                {activeWalkthroughStage.inputs.map((item) => (
                  <li key={item} className="flex items-start gap-1.5 leading-snug">
                    <span className="text-[#891A23] mt-0.5" aria-hidden="true">
                      ·
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white border border-[#E2E2E6] rounded-md p-4 space-y-2.5">
              <div className="text-xs font-semibold text-[#111114]">
                What Comes Out
              </div>
              <ul className="space-y-1.5 text-xs text-[#5A5A66]">
                {activeWalkthroughStage.outputs.map((item) => (
                  <li key={item} className="flex items-start gap-1.5 leading-snug">
                    <Check className="w-3.5 h-3.5 text-[#15803D] shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white border border-[#E2E2E6] rounded-md p-4 space-y-2.5">
              <div className="text-xs font-semibold text-[#111114]">
                Approval Gate Guardrail
              </div>
              <p className="text-xs text-[#5A5A66] leading-relaxed">
                {activeWalkthroughStage.gateRule}
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
