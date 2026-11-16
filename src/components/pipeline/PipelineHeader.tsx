import React, { useRef } from 'react';
import {
  ChevronDown,
  Download,
  Upload,
  Plus,
  Check,
  Lock,
  Printer,
  Layers,
} from 'lucide-react';
import {
  PipelineProject,
  PipelineStepNumber,
  ProjectSummary,
} from '../../types/pipeline';

interface PipelineHeaderProps {
  projects: ProjectSummary[];
  activeProject: PipelineProject | null;
  activeStep: PipelineStepNumber;
  isNewProjectMode: boolean;
  isPrintableOpen: boolean;
  onSelectProject: (id: string) => void;
  onStartNewProject: () => void;
  onSelectStep: (step: PipelineStepNumber) => void;
  onTogglePrintable: () => void;
  onDownloadBackup: () => void;
  onImportBackup: (file: File) => void;
  onSwitchToClassicStudio: () => void;
}

const STEPS: Array<{
  num: PipelineStepNumber;
  label: string;
  phaseNote?: string;
}> = [
  { num: 1, label: 'Project & Intake' },
  { num: 2, label: 'Brand Bible' },
  { num: 3, label: 'Creative Brief' },
  { num: 4, label: 'Shot List & Board' },
  { num: 5, label: 'Storyboard Frames' },
  { num: 6, label: 'Frame Suggestions' },
  { num: 7, label: 'Video Prompts & Video' },
  { num: 8, label: 'VO Script & Audio' },
  { num: 9, label: 'Shoot Plan' },
];

export const PipelineHeader: React.FC<PipelineHeaderProps> = ({
  projects,
  activeProject,
  activeStep,
  isNewProjectMode,
  isPrintableOpen,
  onSelectProject,
  onStartNewProject,
  onSelectStep,
  onTogglePrintable,
  onDownloadBackup,
  onImportBackup,
  onSwitchToClassicStudio,
}) => {
  const importInputRef = useRef<HTMLInputElement>(null);

  const isStepEnabled = (step: PipelineStepNumber): boolean => {
    if (step === 1) return true;
    if (!activeProject || isNewProjectMode) return false;
    const a = activeProject.approvals;
    switch (step) {
      case 2:
        return a.intakeCompleted;
      case 3:
        return a.bibleApproved;
      case 4:
        return a.briefApproved;
      case 5:
        return a.shotListApproved;
      case 6:
        return a.shotListApproved;
      case 7:
        return a.shotListApproved;
      case 8:
        return a.videoPromptsApproved;
      case 9:
        return a.voApproved;
      default:
        return false;
    }
  };

  const isStepApproved = (step: PipelineStepNumber): boolean => {
    if (!activeProject) return false;
    const a = activeProject.approvals;
    switch (step) {
      case 1:
        return a.intakeCompleted;
      case 2:
        return a.bibleApproved;
      case 3:
        return a.briefApproved;
      case 4:
        return a.shotListApproved;
      case 5: {
        if (a.storyboardApproved) return true;
        const aiHybrid = activeProject.shots.filter((s) => s.route !== 'live');
        return (
          activeProject.shots.length > 0 &&
          aiHybrid.every((s) => Boolean(s.frameImageUrl))
        );
      }
      case 6:
        return a.storyboardApproved;
      case 7:
        return a.videoPromptsApproved;
      case 8:
        return a.voApproved;
      case 9:
        return a.shootPlanApproved;
      default:
        return false;
    }
  };

  return (
    <header className="no-print sticky top-0 z-30 bg-[#0B0D10]/95 backdrop-blur-md border-b border-[#262B36]">
      {/* Top Row: Brand, Project Picker, Backup Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-base font-bold tracking-tight text-zinc-100 whitespace-nowrap shrink-0">
            52Launch Production Studio
          </span>

          <span className="text-zinc-700" aria-hidden="true">
            /
          </span>

          {/* Server Project Picker */}
          <div className="relative flex items-center">
            <select
              aria-label="Choose client project"
              value={isNewProjectMode ? '__new__' : activeProject?.id || ''}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  onStartNewProject();
                } else {
                  onSelectProject(e.target.value);
                }
              }}
              className="appearance-none bg-[#14171D] border border-[#262B36] hover:border-zinc-500 text-zinc-100 text-sm font-medium rounded-lg pl-3 pr-8 py-1.5 focus:outline-none focus:border-amber-500 cursor-pointer max-w-[280px] truncate"
            >
              {isNewProjectMode && <option value="__new__">New client project...</option>}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.client} — {p.productName}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 pointer-events-none absolute right-2.5" />
          </div>

          <button
            type="button"
            onClick={onStartNewProject}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            New project
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {activeProject && activeProject.shots.length > 0 && (
            <button
              type="button"
              onClick={onTogglePrintable}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isPrintableOpen
                  ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                  : 'bg-[#14171D] border-[#262B36] text-zinc-200 hover:border-zinc-500'
              }`}
            >
              <Printer className="w-3.5 h-3.5" />
              {isPrintableOpen ? 'Back to workspace' : 'Printable storyboard'}
            </button>
          )}

          <input
            ref={importInputRef}
            type="file"
            accept=".52launch-backup,.json"
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
            onClick={() => importInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 bg-[#14171D] border border-[#262B36] hover:border-zinc-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Import project backup
          </button>

          {activeProject && !isNewProjectMode && (
            <button
              type="button"
              onClick={onDownloadBackup}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 bg-[#14171D] border border-[#262B36] hover:border-zinc-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download project backup
            </button>
          )}

          <button
            type="button"
            onClick={onSwitchToClassicStudio}
            title="Open original Google Flow Storyboard Studio view"
            className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 border border-transparent hover:border-[#262B36] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5" />
            Classic Studio
          </button>
        </div>
      </div>

      {/* Left-to-Right Gated 9-Step Workflow Bar */}
      <nav
        aria-label="Production workflow steps"
        className="flex items-center gap-1.5 px-5 py-2 bg-[#101318] border-t border-[#1D222B] overflow-x-auto"
      >
        {STEPS.map((st, idx) => {
          const enabled = isStepEnabled(st.num);
          const approved = isStepApproved(st.num);
          const current = !isPrintableOpen && activeStep === st.num;

          return (
            <React.Fragment key={st.num}>
              <button
                type="button"
                disabled={!enabled}
                onClick={() => enabled && onSelectStep(st.num)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                  current
                    ? 'bg-amber-500 text-zinc-950 border-amber-400 font-semibold cursor-pointer'
                    : enabled
                      ? 'bg-[#14171D] text-zinc-200 border-[#262B36] hover:border-zinc-500 cursor-pointer'
                      : 'bg-[#0D1015] text-zinc-600 border-[#1B2029] cursor-not-allowed'
                }`}
              >
                {approved && !current ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : !enabled ? (
                  <Lock className="w-3 h-3 text-zinc-600 shrink-0" />
                ) : null}
                <span>
                  {st.num}. {st.label}
                </span>
                {st.phaseNote && (
                  <span
                    className={`text-[10px] font-normal ${
                      current ? 'text-zinc-900' : 'text-zinc-500'
                    }`}
                  >
                    · {st.phaseNote}
                  </span>
                )}
              </button>
              {idx < STEPS.length - 1 && (
                <span className="text-zinc-700 text-xs select-none" aria-hidden="true">
                  →
                </span>
              )}
            </React.Fragment>
          );
        })}
      </nav>
    </header>
  );
};
