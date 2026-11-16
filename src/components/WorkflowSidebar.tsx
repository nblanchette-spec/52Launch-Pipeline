import React from 'react';
import {
  LayoutGrid,
  Mic,
  FileText,
  Sparkles,
  Clapperboard,
  ListChecks,
  Printer,
  PanelLeftClose,
  PanelLeftOpen,
  Check,
} from 'lucide-react';
import { BrandProject, WorkflowStepId } from '../types/studio';

interface WorkflowSidebarProps {
  project: BrandProject;
  activeStep: WorkflowStepId;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelectStep: (step: WorkflowStepId) => void;
}

export const WorkflowSidebar: React.FC<WorkflowSidebarProps> = ({
  project,
  activeStep,
  collapsed,
  onToggleCollapse,
  onSelectStep,
}) => {
  const stepStatuses: Record<WorkflowStepId, boolean> = {
    dashboard: true,
    'step-1': project.onboarding.kickoffCompleted,
    'step-2': Boolean(project.brief.coreHookMessage && project.brief.objectiveAndKpis),
    'step-3': Boolean(project.lockedTerritoryId),
    'step-4': project.storyboardPanels.some((p) => Boolean(p.imageUrl)),
    'step-5': project.schedule.length > 0 && project.requirements.length > 0,
    'step-6': project.storyboardPanels.length > 0,
  };

  const navItems: Array<{
    id: WorkflowStepId;
    indexLabel: string;
    title: string;
    subtitle: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'step-1',
      indexLabel: '01',
      title: 'Client Onboarding',
      subtitle: 'The 52Launch Spiel',
      icon: <Mic className="w-4 h-4" />,
    },
    {
      id: 'step-2',
      indexLabel: '02',
      title: 'Brief & Mood Board',
      subtitle: 'Palette & Visual Refs',
      icon: <FileText className="w-4 h-4" />,
    },
    {
      id: 'step-3',
      indexLabel: '03',
      title: 'Ideation & Concepts',
      subtitle: '3 Creative Territories',
      icon: <Sparkles className="w-4 h-4" />,
    },
    {
      id: 'step-4',
      indexLabel: '04',
      title: 'Storyboard Studio',
      subtitle: '3-Tier Ingredient Flow',
      icon: <Clapperboard className="w-4 h-4" />,
    },
    {
      id: 'step-5',
      indexLabel: '05',
      title: 'Shot List & Schedule',
      subtitle: 'Gear & Shoot Call Sheet',
      icon: <ListChecks className="w-4 h-4" />,
    },
    {
      id: 'step-6',
      indexLabel: '06',
      title: 'Production Book PDF',
      subtitle: 'Print-Ready Deck',
      icon: <Printer className="w-4 h-4" />,
    },
  ];

  return (
    <aside
      className={`no-print shrink-0 bg-[#0E1116] border-r border-[#262B36] flex flex-col justify-between transition-[width] duration-200 ${
        collapsed ? 'w-[68px]' : 'w-[252px]'
      }`}
    >
      <div className="p-3 space-y-4">
        {/* Collapse Toggle & Studio Home */}
        <div className="flex items-center justify-between gap-2">
          {!collapsed && (
            <button
              type="button"
              onClick={() => onSelectStep('dashboard')}
              className={`flex-1 flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                activeStep === 'dashboard'
                  ? 'bg-[#191E26] text-amber-400 border border-[#2C3340]'
                  : 'text-zinc-300 hover:bg-[#14171D] border border-transparent'
              }`}
            >
              <LayoutGrid className="w-4 h-4 shrink-0" />
              <span className="truncate">Studio Portfolio</span>
            </button>
          )}
          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-[#14171D] rounded-lg transition-colors cursor-pointer shrink-0"
          >
            {collapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        </div>

        {collapsed && (
          <button
            type="button"
            onClick={() => onSelectStep('dashboard')}
            title="Studio Portfolio"
            className={`w-full flex items-center justify-center p-2.5 rounded-lg transition-colors cursor-pointer ${
              activeStep === 'dashboard'
                ? 'bg-[#191E26] text-amber-400 border border-[#2C3340]'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-[#14171D]'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        )}

        {/* Phase 1 Pre-Production Steps */}
        <div className="space-y-1">
          {!collapsed && (
            <div className="px-2.5 pb-1 text-[11px] font-medium text-zinc-500">
              Phase 1 Pipeline
            </div>
          )}

          {navItems.map((item) => {
            const isActive = activeStep === item.id;
            const isComplete = stepStatuses[item.id];
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectStep(item.id)}
                title={collapsed ? `${item.indexLabel}. ${item.title}` : undefined}
                className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-left transition-colors cursor-pointer border ${
                  isActive
                    ? 'bg-[#14171D] border-amber-500/40 text-zinc-100'
                    : 'bg-transparent border-transparent text-zinc-400 hover:text-zinc-100 hover:bg-[#14171D]/70'
                } ${collapsed ? 'justify-center px-0' : ''}`}
              >
                <div
                  className={`shrink-0 flex items-center justify-center w-7 h-7 rounded-md border text-xs font-mono ${
                    isActive
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                      : 'bg-[#14171D] border-[#262B36] text-zinc-400'
                  }`}
                >
                  {item.icon}
                </div>

                {!collapsed && (
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold truncate">
                        {item.indexLabel}. {item.title}
                      </span>
                      {isComplete && (
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-500 truncate">{item.subtitle}</div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Brand Footer Summary */}
      {!collapsed && (
        <div className="p-4 border-t border-[#1D222B] bg-[#0B0D10]/50 space-y-1.5">
          <div className="text-xs font-semibold text-zinc-200 truncate">
            {project.brandName}
          </div>
          <div className="text-[11px] text-zinc-500 truncate">{project.industry}</div>
          <div className="pt-1 flex items-center justify-between text-[11px] text-zinc-400 font-mono tabular-nums">
            <span>Shoot: {project.shootDate || 'TBD'}</span>
            <span>{project.storyboardPanels.length} frames</span>
          </div>
        </div>
      )}
    </aside>
  );
};
