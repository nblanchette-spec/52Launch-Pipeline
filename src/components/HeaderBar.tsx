import React, { useRef } from 'react';
import {
  ChevronDown,
  Download,
  Upload,
  Plus,
  LayoutGrid,
  CheckCircle2,
  Clock,
  Film,
} from 'lucide-react';
import { BrandProject, MacroPhase, WorkflowStepId } from '../types/studio';

interface HeaderBarProps {
  projects: BrandProject[];
  activeProject: BrandProject;
  activeStep: WorkflowStepId;
  onSelectProject: (projectId: string) => void;
  onSelectStep: (step: WorkflowStepId) => void;
  onOpenNewProject: () => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onOpenPhaseModal: (phase: 'phase-2' | 'phase-3') => void;
  onSetActivePhase: (phase: MacroPhase) => void;
}

const PRE_PRO_STEPS: Array<{ id: WorkflowStepId; shortLabel: string }> = [
  { id: 'step-1', shortLabel: 'Onboarding' },
  { id: 'step-2', shortLabel: 'Brief & Mood' },
  { id: 'step-3', shortLabel: 'Ideation' },
  { id: 'step-4', shortLabel: 'Storyboards' },
  { id: 'step-5', shortLabel: 'Shot List & Schedule' },
  { id: 'step-6', shortLabel: 'Production PDF' },
];

export const HeaderBar: React.FC<HeaderBarProps> = ({
  projects,
  activeProject,
  activeStep,
  onSelectProject,
  onSelectStep,
  onOpenNewProject,
  onExportBackup,
  onImportBackup,
  onOpenPhaseModal,
  onSetActivePhase,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <header className="no-print sticky top-0 z-30 bg-[#0B0D10]/95 backdrop-blur-md border-b border-[#262B36]">
      {/* Primary Studio Bar */}
      <div className="flex items-center justify-between gap-4 px-5 py-3">
        <div className="flex items-center gap-4 min-w-0">
          <button
            type="button"
            onClick={() => onSelectStep('dashboard')}
            className="text-base font-bold tracking-tight text-zinc-100 hover:text-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            52Launch Director OS
          </button>

          <span className="text-zinc-700 select-none" aria-hidden="true">
            /
          </span>

          {/* Multi-Brand Switcher */}
          <div className="relative flex items-center">
            <select
              aria-label="Switch active startup brand project"
              value={activeProject.id}
              onChange={(e) => onSelectProject(e.target.value)}
              className="appearance-none bg-[#14171D] border border-[#262B36] hover:border-zinc-600 text-zinc-100 text-sm font-medium rounded-lg pl-3 pr-8 py-1.5 focus:outline-none focus:border-amber-500 transition-colors cursor-pointer max-w-[260px] truncate"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.brandName} — {p.projectTitle}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 pointer-events-none absolute right-2.5" />
          </div>

          <button
            type="button"
            onClick={() => onSelectStep('dashboard')}
            className={`hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeStep === 'dashboard'
                ? 'bg-zinc-800 text-zinc-100 border-zinc-700'
                : 'bg-transparent text-zinc-400 border-transparent hover:text-zinc-200 hover:bg-[#14171D]'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            All Projects
          </button>
        </div>

        {/* Right Actions: JSON Backup & New Brand Project */}
        <div className="flex items-center gap-2 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onImportBackup(file);
                e.target.value = '';
              }
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Import JSON Project Backup"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 bg-[#14171D] border border-[#262B36] rounded-lg hover:border-zinc-500 hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Import JSON
          </button>
          <button
            type="button"
            onClick={onExportBackup}
            title="Export JSON Project Backup"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 bg-[#14171D] border border-[#262B36] rounded-lg hover:border-zinc-500 hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Backup JSON
          </button>
          <button
            type="button"
            onClick={onOpenNewProject}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            New Brand Project
          </button>
        </div>
      </div>

      {/* Persistent 3-Phase Macro Tracker */}
      <div className="flex items-center justify-between gap-4 px-5 py-2 bg-[#101318] border-t border-[#1D222B] overflow-x-auto">
        <div className="flex items-center gap-2 min-w-max">
          {/* Phase 1 */}
          <button
            type="button"
            onClick={() => {
              onSetActivePhase('phase-1');
              if (activeStep === 'dashboard') onSelectStep('step-1');
            }}
            className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeProject.activePhase === 'phase-1'
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                : 'bg-[#14171D] border-[#262B36] text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Film className="w-3.5 h-3.5 text-amber-400" />
            <span>Phase 1: Pre-Production</span>
            <span className="text-[11px] text-amber-400/90 font-normal">In-App Active</span>
          </button>

          {/* Sub-steps trail inside Phase 1 */}
          <div className="hidden xl:flex items-center gap-1 pl-1 pr-2">
            {PRE_PRO_STEPS.map((st, idx) => {
              const isCurrent = activeStep === st.id;
              return (
                <React.Fragment key={st.id}>
                  <button
                    type="button"
                    onClick={() => onSelectStep(st.id)}
                    className={`px-2 py-0.5 text-[11px] rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isCurrent
                        ? 'text-amber-400 font-semibold bg-amber-500/10'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {st.shortLabel}
                  </button>
                  {idx < PRE_PRO_STEPS.length - 1 && (
                    <span className="text-zinc-700 text-[10px]" aria-hidden="true">
                      →
                    </span>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 min-w-max">
          {/* Phase 2: External Production */}
          <button
            type="button"
            onClick={() => onOpenPhaseModal('phase-2')}
            className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeProject.activePhase === 'phase-2'
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                : 'bg-[#14171D] border-[#262B36] text-zinc-300 hover:border-zinc-500'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <span>Phase 2: Production</span>
            <span className="text-[11px] text-zinc-400 font-normal">
              · {activeProject.phase2.status}
            </span>
          </button>

          {/* Phase 3: External Post-Production */}
          <button
            type="button"
            onClick={() => onOpenPhaseModal('phase-3')}
            className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeProject.activePhase === 'phase-3'
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                : 'bg-[#14171D] border-[#262B36] text-zinc-300 hover:border-zinc-500'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Phase 3: Post-Production</span>
            <span className="text-[11px] text-emerald-400 font-normal">
              · {activeProject.phase3.status}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
