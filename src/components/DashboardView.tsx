import React from 'react';
import {
  Plus,
  ArrowRight,
  Clapperboard,
  Calendar,
  Trash2,
  Printer,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { BrandProject, WorkflowStepId } from '../types/studio';

interface DashboardViewProps {
  projects: BrandProject[];
  activeProjectId: string;
  onSelectProjectAndStep: (projectId: string, step: WorkflowStepId) => void;
  onOpenNewProject: () => void;
  onDeleteProject: (projectId: string) => void;
  onOpenPhaseModal: (projectId: string, phase: 'phase-2' | 'phase-3') => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  projects,
  activeProjectId,
  onSelectProjectAndStep,
  onOpenNewProject,
  onDeleteProject,
  onOpenPhaseModal,
}) => {
  return (
    <div className="max-w-[1280px] mx-auto px-6 py-8 space-y-8">
      {/* Studio Overview Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#262B36] pb-6">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-amber-400">
            52Launch Creative Direction Studio
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">
            Startup Brand Production Portfolio
          </h1>
          <p className="text-sm text-zinc-400 max-w-2xl">
            Manage multi-brand Phase 1 pre-production pipelines from founder kickoff through
            ingredient-consistent storyboards, shot lists, and print-ready production books.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenNewProject}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          New Brand Project
        </button>
      </div>

      {/* Portfolio Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#14171D] border border-[#262B36] rounded-xl p-4">
          <div className="text-xs text-zinc-400">Active Brand Accounts</div>
          <div className="text-2xl font-bold text-zinc-100 font-mono tabular-nums mt-1">
            {projects.length}
          </div>
        </div>
        <div className="bg-[#14171D] border border-[#262B36] rounded-xl p-4">
          <div className="text-xs text-zinc-400">Locked Ingredients</div>
          <div className="text-2xl font-bold text-zinc-100 font-mono tabular-nums mt-1">
            {projects.reduce(
              (acc, p) =>
                acc +
                p.castLocker.filter((c) => c.locked).length +
                p.locationLocker.filter((l) => l.locked).length +
                p.propLocker.filter((pr) => pr.locked).length,
              0
            )}
          </div>
        </div>
        <div className="bg-[#14171D] border border-[#262B36] rounded-xl p-4">
          <div className="text-xs text-zinc-400">Storyboard Frames</div>
          <div className="text-2xl font-bold text-zinc-100 font-mono tabular-nums mt-1">
            {projects.reduce((acc, p) => acc + p.storyboardPanels.length, 0)}
          </div>
        </div>
        <div className="bg-[#14171D] border border-[#262B36] rounded-xl p-4">
          <div className="text-xs text-zinc-400">Scheduled Shoot Days</div>
          <div className="text-2xl font-bold text-amber-400 font-mono tabular-nums mt-1">
            {projects.filter((p) => p.schedule.length > 0).length}
          </div>
        </div>
      </div>

      {/* Brand Project Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {projects.map((project) => {
          const isCurrent = project.id === activeProjectId;
          const previewImage =
            project.storyboardPanels.find((p) => p.imageUrl)?.imageUrl ||
            project.moodBoard[0]?.imageUrl ||
            '';

          const completedStepsCount = [
            project.onboarding.kickoffCompleted,
            Boolean(project.brief.coreHookMessage),
            Boolean(project.lockedTerritoryId),
            project.storyboardPanels.some((p) => Boolean(p.imageUrl)),
            project.schedule.length > 0,
          ].filter(Boolean).length;

          return (
            <div
              key={project.id}
              className={`bg-[#14171D] border rounded-xl overflow-hidden flex flex-col justify-between transition-colors ${
                isCurrent ? 'border-amber-500/50' : 'border-[#262B36] hover:border-zinc-600'
              }`}
            >
              {/* Visual Slate Top */}
              <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr]">
                <div className="bg-[#0B0D10] border-b sm:border-b-0 sm:border-r border-[#262B36] aspect-video sm:aspect-auto sm:h-full min-h-[150px] relative overflow-hidden flex items-center justify-center">
                  {previewImage ? (
                    <img
                      src={previewImage}
                      alt={`${project.brandName} storyboard preview`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-zinc-600 p-4 text-center">
                      <Clapperboard className="w-6 h-6" />
                      <span className="text-xs">No storyboard frame yet</span>
                    </div>
                  )}
                </div>

                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <span className="font-medium text-amber-400">{project.brandName}</span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{project.industry}</span>
                      </div>
                      <h2 className="text-lg font-semibold text-zinc-100 mt-0.5 leading-snug">
                        {project.projectTitle}
                      </h2>
                    </div>

                    {projects.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onDeleteProject(project.id)}
                        title="Remove project"
                        className="p-1.5 text-zinc-500 hover:text-rose-400 rounded-lg hover:bg-[#0B0D10] transition-colors cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                    {project.brief.coreHookMessage ||
                      project.onboarding.founderProblemSolutionNotes ||
                      'Complete Step 1 kickoff notes to synthesize the Executive Creative Brief.'}
                  </p>

                  {/* Palette Swatches & Metadata */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-1.5">
                      {project.brief.colorPalette.slice(0, 5).map((sw) => (
                        <span
                          key={sw.id}
                          title={`${sw.name} (${sw.hex})`}
                          className="w-4 h-4 rounded border border-white/15"
                          style={{ backgroundColor: sw.hex }}
                        />
                      ))}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-zinc-400 font-mono tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                        {project.shootDate || 'TBD'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{completedStepsCount}/5 steps</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Phase 1-3 Quick Navigation Footer */}
              <div className="px-5 py-3.5 bg-[#101318] border-t border-[#1D222B] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => onOpenPhaseModal(project.id, 'phase-2')}
                    className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>P2: {project.phase2.status}</span>
                  </button>
                  <span className="text-zinc-700" aria-hidden="true">
                    ·
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenPhaseModal(project.id, 'phase-3')}
                    className="inline-flex items-center gap-1.5 text-emerald-400/90 hover:text-emerald-300 transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>P3: {project.phase3.status}</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectProjectAndStep(project.id, 'step-6')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 bg-[#14171D] border border-[#262B36] hover:border-zinc-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Prod PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectProjectAndStep(project.id, 'step-4')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-200 bg-[#14171D] border border-[#262B36] hover:border-amber-500/60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Storyboards
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectProjectAndStep(project.id, 'step-1')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Open Studio
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
