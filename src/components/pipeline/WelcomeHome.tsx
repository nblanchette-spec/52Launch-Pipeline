import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  Clapperboard,
  Compass,
  Film,
  FolderOpen,
  Grid,
  Image as ImageIcon,
  Layers,
  List,
  Mic,
  Plus,
  Rocket,
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

interface GateDefinition {
  step: PipelineStepNumber;
  title: string;
  shortName: string;
  phase: string;
  description: string;
  deliverables: string[];
  icon: React.ComponentType<{ className?: string }>;
}

const GATES: GateDefinition[] = [
  {
    step: 1,
    shortName: '01. Intake',
    title: 'Project & Asset Intake',
    phase: 'Phase 1 · Strategy',
    description: 'Collect client brief, upload real product photos and logos, and extract style guidelines from brand guide PDFs.',
    deliverables: ['Client metadata', 'Product photos & logo', 'Extracted style guide rules'],
    icon: FolderOpen,
  },
  {
    step: 2,
    shortName: '02. Bible',
    title: 'Brand Bible',
    phase: 'Phase 1 · Strategy',
    description: 'Locks brand positioning, character appearances, lighting rules, provable claims, and banned clichés into one source of truth.',
    deliverables: ['Brand tone & grammar', 'Named recurring characters', 'Allowed claims list'],
    icon: BookOpen,
  },
  {
    step: 3,
    shortName: '03. Brief',
    title: 'Creative Brief',
    phase: 'Phase 1 · Strategy',
    description: 'Develops distinct commercial concepts tailored to your deliverables and sets voiceover pacing and emotional arc.',
    deliverables: ['Ranked concepts', 'Recommended logline', 'VO tone direction'],
    icon: Compass,
  },
  {
    step: 4,
    shortName: '04. Shots',
    title: 'Shot List & Board',
    phase: 'Phase 1 · Strategy',
    description: 'Breaks the approved concept into numbered shots (S01, S02…), routing each as AI Video, Hybrid, or Live Action.',
    deliverables: ['Sequenced shot list', 'Route assignment', 'Initial frame prompts'],
    icon: Clapperboard,
  },
  {
    step: 5,
    shortName: '05. Storyboard',
    title: 'Storyboard Studio',
    phase: 'Phase 2 · Visuals',
    description: 'Choose an art style, generate 2×2 Character Contact Sheets, Location Multi-Angle Sheets, and Product-Anchored Props via Fal Nano Banana.',
    deliverables: ['Locked continuity sheets', 'Storyboard frames', 'Custom image uploads'],
    icon: ImageIcon,
  },
  {
    step: 6,
    shortName: '06. QA',
    title: 'Frame Suggestions & QA',
    phase: 'Phase 2 · Visuals',
    description: 'Audits storyboard frames against your Brand Bible and real product photos, flagging fidelity drift and suggesting prompt rewrites.',
    deliverables: ['Continuity audit score', 'Product fidelity check', 'Approved reference frames'],
    icon: ShieldCheck,
  },
  {
    step: 7,
    shortName: '07. Video',
    title: 'Video Prompts & Studio',
    phase: 'Phase 2 · Visuals',
    description: 'Writes camera motion video prompts with negative constraints and renders clips using Veo 3.1, Gemini Omni, Kling, Seedance, Luma, Wan, or Topaz.',
    deliverables: ['Rendered AI clips', 'Clip take history', 'Optional 4K upscales'],
    icon: Video,
  },
  {
    step: 8,
    shortName: '08. Voice',
    title: 'VO Script & Audio',
    phase: 'Phase 2 · Visuals',
    description: 'Refines narration to match shot durations word-for-word and synthesizes broadcast-ready voice tracks via Gemini TTS.',
    deliverables: ['Shot-timed VO script', 'Generated TTS audio clips', 'Downloadable stem files'],
    icon: Mic,
  },
  {
    step: 9,
    shortName: '09. Shoot Plan',
    title: 'Live Shoot Plan & Call Sheet',
    phase: 'Phase 3 · Execution',
    description: 'Compiles call times, setup schedules, gear checklists, prop counts, crew roles, and one-click Master PDF & Printable Call Sheet packages.',
    deliverables: ['Day-by-day setup schedule', 'Equipment & crew checklist', 'Master Production PDF'],
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

const ContactThumbCell: React.FC<{
  url?: string;
  label?: string;
  index: number;
}> = ({ url, label, index }) => {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <div className="relative w-full h-full bg-[#EFEFF2] flex flex-col items-center justify-center p-1 select-none">
        <ImageIcon className="w-3.5 h-3.5 text-[#B0B0BC] mb-0.5" />
        <span className="text-[9px] font-mono tabular-nums text-[#8A8A98]">
          {label || `0${index + 1}`}
        </span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-[#18181D] overflow-hidden group/cell">
      <img
        src={url}
        alt={label || `Thumbnail ${index + 1}`}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="w-full h-full object-cover transition-transform duration-300 group-hover/card:scale-[1.03]"
      />
      <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />
      {label && (
        <span className="absolute left-1 bottom-0.5 max-w-[88%] truncate text-[9px] font-mono tabular-nums text-white/95">
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
  const inspectorRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'active' | 'completed'>('all');
  const [viewStyle, setViewStyle] = useState<'grid' | 'list'>('grid');
  const [hoveredGateStep, setHoveredGateStep] = useState<PipelineStepNumber>(1);
  const [selectedInspectProjectId, setSelectedInspectProjectId] = useState<string | null>(
    projects[0]?.id || null
  );
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Keep inspect selection valid if projects update
  const currentInspectProject = useMemo(() => {
    if (!projects.length) return null;
    const found = projects.find((p) => p.id === selectedInspectProjectId);
    return found || projects[0];
  }, [projects, selectedInspectProjectId]);

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

  const activeGate = GATES.find((g) => g.step === hoveredGateStep) || GATES[0];

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
      {/* 1. Simplified Hero: 3x3 9-Gate Interactive Grid & Logo */}
      <section className="bg-white border border-[#E2E2E6] brand-corner p-6 sm:p-9 shadow-xs space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-[#EFEFF2] pb-6">
          <div className="flex items-center gap-4">
            <img
              src="/brand/logo-badge-black.png"
              alt="52Launch Black Badge"
              referrerPolicy="no-referrer"
              className="h-14 w-auto object-contain shrink-0"
            />
            <div>
              <div className="text-xs font-semibold text-[#891A23] font-display uppercase tracking-wider">
                Production Studio
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#111114] font-display">
                3 Phases - 9 Gate Assembly Pipeline
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
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
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#5A5A66] hover:text-[#111114] bg-[#F6F6F7] hover:bg-[#EFEFF2] border border-[#D8D8DF] rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import backup</span>
            </button>
          </div>
        </div>

        {/* 3x3 Grid of 9 Gate Squares + Active Hover Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 grid grid-cols-3 gap-3">
            {GATES.map((gate) => {
              const GateIcon = gate.icon;
              const isSelected = hoveredGateStep === gate.step;
              return (
                <div
                  key={gate.step}
                  onMouseEnter={() => setHoveredGateStep(gate.step)}
                  onClick={() => setHoveredGateStep(gate.step)}
                  className={`p-4 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 min-h-[105px] ${
                    isSelected
                      ? 'bg-[#111114] text-white border-[#111114] shadow-md scale-[1.02]'
                      : 'bg-[#F6F6F7] text-[#111114] border-[#E2E2E6] hover:border-[#C6202F] hover:bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-mono font-bold tabular-nums ${
                        isSelected ? 'text-[#FDE68A]' : 'text-[#C6202F]'
                      }`}
                    >
                      GATE 0{gate.step}
                    </span>
                    <GateIcon
                      className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-[#5A5A66]'}`}
                    />
                  </div>
                  <div>
                    <div className="text-xs font-semibold leading-tight font-display line-clamp-1">
                      {gate.title.replace(/ & .*/, '')}
                    </div>
                    <div
                      className={`text-[10px] mt-0.5 truncate ${
                        isSelected ? 'text-white/70' : 'text-[#5A5A66]'
                      }`}
                    >
                      {gate.phase}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active Hover Gate Explanation Card */}
          <div className="lg:col-span-5 bg-[#FAF8F5] border border-[#E2E2E6] brand-corner p-6 flex flex-col justify-between space-y-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-[#C6202F]">
                <span>{activeGate.phase}</span>
                <span>GATE 0{activeGate.step} OF 09</span>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-[#111114] font-display">
                {activeGate.title}
              </h2>
              <p className="text-sm text-[#5A5A66] leading-relaxed">
                {activeGate.description}
              </p>
            </div>

            <div className="space-y-2 border-t border-[#E2E2E6] pt-4">
              <div className="text-xs font-semibold text-[#111114]">Key Deliverables:</div>
              <ul className="space-y-1 text-xs text-[#5A5A66]">
                {activeGate.deliverables.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#15803D] shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Primary CTA: "Let's Launch Your Production" */}
        <div className="flex justify-center pt-3">
          <button
            type="button"
            onClick={onStartNewProject}
            className="inline-flex items-center gap-2 px-8 py-3.5 text-base font-semibold text-white bg-[#C6202F] hover:bg-[#AD1A27] brand-corner-sm transition-colors cursor-pointer shadow-md"
          >
            <Rocket className="w-5 h-5" />
            Let&apos;s Launch Your Production
          </button>
        </div>
      </section>

      {/* 2. Saved Projects Section with Grid / List View Toggle */}
      <section className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E2E2E6] pb-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-[#111114] font-display">
              Saved Projects
            </h2>
            <p className="text-sm text-[#5A5A66] mt-0.5">
              Select any project below to inspect its gates in the interactive guide at the bottom.
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

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 p-1 bg-[#EFEFF2] rounded-md">
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
                      : 'text-[#5A5A66] hover:text-[#111114]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Grid / List View Toggle */}
            <div className="flex items-center gap-1 p-1 bg-[#EFEFF2] rounded-md" aria-label="View style toggle">
              <button
                type="button"
                onClick={() => setViewStyle('grid')}
                title="Grid contact sheet view"
                className={`p-1.5 rounded transition-colors cursor-pointer ${
                  viewStyle === 'grid' ? 'bg-white text-[#111114] shadow-xs' : 'text-[#5A5A66]'
                }`}
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewStyle('list')}
                title="List view with small thumbnail"
                className={`p-1.5 rounded transition-colors cursor-pointer ${
                  viewStyle === 'list' ? 'bg-white text-[#111114] shadow-xs' : 'text-[#5A5A66]'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
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
                No projects match your filter
              </h3>
              <p className="text-sm text-[#5A5A66]">
                Launch a new production or clear your search to view your saved films.
              </p>
            </div>
            <button
              type="button"
              onClick={onStartNewProject}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#C6202F] hover:bg-[#AD1A27] brand-corner-sm cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New project
            </button>
          </div>
        ) : viewStyle === 'grid' ? (
          /* Grid Contact Sheet View */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredProjects.map((proj) => {
              const thumbs = proj.thumbnailStrip || [];
              const sheetSlots = [0, 1, 2, 3].map((idx) => thumbs[idx]);
              const isSelectedInspect = currentInspectProject?.id === proj.id;
              const isConfirmingDelete = confirmDeleteId === proj.id;

              return (
                <article
                  key={proj.id}
                  onClick={() => {
                    setSelectedInspectProjectId(proj.id);
                    inspectorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className={`bg-white border brand-corner overflow-hidden flex flex-col justify-between transition-all cursor-pointer shadow-xs group/card ${
                    isSelectedInspect
                      ? 'border-[#C6202F] ring-2 ring-[#C6202F]/20'
                      : 'border-[#E2E2E6] hover:border-[#891A23]/60'
                  }`}
                >
                  <div className="relative w-full aspect-[16/10] bg-[#141418] grid grid-cols-2 grid-rows-2 gap-[1px]">
                    {sheetSlots.map((slot, idx) => (
                      <ContactThumbCell
                        key={`${proj.id}-slot-${idx}`}
                        url={slot?.url}
                        label={slot?.label}
                        index={idx}
                      />
                    ))}
                    {thumbs.length > 4 && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/75 text-white text-[10px] font-mono tabular-nums rounded">
                        +{thumbs.length - 4}
                      </div>
                    )}
                  </div>

                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-[#5A5A66]">
                        <span className="font-medium text-[#891A23] truncate">
                          {proj.client}
                        </span>
                        <span className="font-mono tabular-nums text-[11px]">
                          {formatRelativeDate(proj.updatedAt)}
                        </span>
                      </div>

                      <h3 className="text-lg font-semibold text-[#111114] leading-snug font-display line-clamp-1">
                        {proj.productName}
                      </h3>

                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-[#5A5A66] font-mono tabular-nums">
                        <span>{proj.shotCount} shots</span>
                        <span aria-hidden="true">·</span>
                        <span>{proj.framesReadyCount} frames</span>
                        <span aria-hidden="true">·</span>
                        <span>{proj.videosReadyCount} clips</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#EFEFF2]">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenProject(proj.id);
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#111114] hover:bg-[#C6202F] brand-corner-sm transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <span>Open Studio</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>

                      {isConfirmingDelete ? (
                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            disabled={deletingId === proj.id}
                            onClick={() => void handleConfirmDelete(proj.id)}
                            className="px-2 py-2 text-xs font-semibold text-white bg-[#C6202F] rounded-md cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-2 text-xs font-medium text-[#5A5A66] bg-[#F6F6F7] rounded-md cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(proj.id);
                          }}
                          className="p-2 text-[#7A7A86] hover:text-[#C6202F] border border-[#E2E2E6] rounded-md transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          /* List View with Small Thumbnails */
          <div className="bg-white border border-[#E2E2E6] brand-corner divide-y divide-[#EFEFF2] overflow-hidden shadow-xs">
            {filteredProjects.map((proj) => {
              const isSelectedInspect = currentInspectProject?.id === proj.id;
              const firstThumb = proj.thumbnailStrip?.[0]?.url;

              return (
                <div
                  key={proj.id}
                  onClick={() => {
                    setSelectedInspectProjectId(proj.id);
                    inspectorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer transition-colors ${
                    isSelectedInspect ? 'bg-[#FDF2F3]' : 'hover:bg-[#FAFAFB]'
                  }`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 rounded bg-[#18181D] overflow-hidden shrink-0 border border-[#E2E2E6]">
                      {firstThumb ? (
                        <img
                          src={firstThumb}
                          alt={proj.productName}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/50 text-[10px] font-mono">
                          52L
                        </div>
                      )}
                    </div>

                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2 text-xs text-[#5A5A66]">
                        <span className="font-semibold text-[#891A23] truncate">
                          {proj.client}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-[11px]">
                          {formatRelativeDate(proj.updatedAt)}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-[#111114] font-display truncate">
                        {proj.productName}
                      </h3>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-xs text-[#5A5A66] font-mono tabular-nums hidden md:block">
                      <span>{proj.shotCount} shots</span> · <span>{proj.framesReadyCount} frames</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenProject(proj.id);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#111114] hover:bg-[#C6202F] brand-corner-sm transition-colors cursor-pointer"
                      >
                        <span>Open</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. Combined Interactive Pipeline Guide & Project Gate Inspector (Bottom) */}
      <section
        ref={inspectorRef}
        className="bg-white border border-[#E2E2E6] brand-corner p-6 sm:p-9 space-y-6 shadow-xs"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#EFEFF2] pb-5">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-[#891A23] uppercase tracking-wider">
              Interactive Gate Inspector
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-[#111114] font-display">
              {currentInspectProject
                ? `Inspecting: ${currentInspectProject.client} — ${currentInspectProject.productName}`
                : 'Interactive Pipeline Guide'}
            </h2>
            <p className="text-sm text-[#5A5A66]">
              Click any gate below to jump directly to that step in the studio for the selected project.
            </p>
          </div>

          {currentInspectProject && (
            <button
              type="button"
              onClick={() => onOpenProject(currentInspectProject.id)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#C6202F] hover:bg-[#AD1A27] brand-corner-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Open Studio for {currentInspectProject.productName}</span>
            </button>
          )}
        </div>

        {/* 9 Interactive Jump-To-Gate Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-9 gap-2.5">
          {GATES.map((gate) => {
            const GateIcon = gate.icon;
            const a = currentInspectProject?.approvals;
            let isApproved = false;
            if (a) {
              if (gate.step === 1) isApproved = a.intakeCompleted;
              else if (gate.step === 2) isApproved = a.bibleApproved;
              else if (gate.step === 3) isApproved = a.briefApproved;
              else if (gate.step === 4) isApproved = a.shotListApproved;
              else if (gate.step === 5 || gate.step === 6) isApproved = a.storyboardApproved;
              else if (gate.step === 7) isApproved = a.videoPromptsApproved;
              else if (gate.step === 8) isApproved = a.voApproved;
              else if (gate.step === 9) isApproved = a.shootPlanApproved;
            }

            return (
              <button
                key={gate.step}
                type="button"
                disabled={!currentInspectProject}
                onClick={() => {
                  if (currentInspectProject) {
                    onOpenProject(currentInspectProject.id, gate.step);
                  }
                }}
                className={`p-3 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                  isApproved
                    ? 'bg-[#F0FDF4] border-[#15803D]/40 text-[#111114] hover:border-[#15803D]'
                    : currentInspectProject
                      ? 'bg-[#F6F6F7] border-[#E2E2E6] text-[#111114] hover:border-[#C6202F] hover:bg-white'
                      : 'bg-[#EFEFF2] border-[#E4E4EA] text-[#9A9AA6] cursor-not-allowed'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold text-[#891A23] tabular-nums">
                    0{gate.step}
                  </span>
                  {isApproved ? (
                    <Check className="w-3.5 h-3.5 text-[#15803D]" />
                  ) : (
                    <GateIcon className="w-3.5 h-3.5 text-[#5A5A66]" />
                  )}
                </div>
                <div>
                  <div className="text-xs font-semibold leading-tight font-display">
                    {gate.shortName.replace(/0\d+\.\s*/, '')}
                  </div>
                  <div className="text-[10px] text-[#5A5A66] mt-0.5">
                    {isApproved ? 'Gate Cleared' : 'Open Gate'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {currentInspectProject && (
          <div className="bg-[#FAFAFB] border border-[#E2E2E6] rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-mono text-[#5A5A66]">
                Selected Project Summary
              </div>
              <div className="text-sm font-semibold text-[#111114] font-display">
                {currentInspectProject.client} — {currentInspectProject.productName}
              </div>
              <div className="text-xs text-[#5A5A66]">
                {currentInspectProject.shotCount} shots · {currentInspectProject.framesReadyCount} frames ready · Updated {formatRelativeDate(currentInspectProject.updatedAt)}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onOpenProject(currentInspectProject.id)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-[#C6202F] hover:bg-[#AD1A27] brand-corner-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Resume Work on Project</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
