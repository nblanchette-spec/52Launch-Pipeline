import React, { useState } from 'react';
import { X, Plus, CheckSquare, Square, Trash2 } from 'lucide-react';
import { BrandProject, Phase2Handoff, Phase3Delivery } from '../types/studio';

interface ExternalPhaseModalProps {
  mode: 'phase-2' | 'phase-3' | null;
  project: BrandProject;
  onClose: () => void;
  onUpdateProject: (updated: BrandProject) => void;
}

export const ExternalPhaseModal: React.FC<ExternalPhaseModalProps> = ({
  mode,
  project,
  onClose,
  onUpdateProject,
}) => {
  const [newTaskLabel, setNewTaskLabel] = useState('');

  if (!mode) return null;

  const updatePhase2 = (patch: Partial<Phase2Handoff>) => {
    onUpdateProject({
      ...project,
      phase2: { ...project.phase2, ...patch },
      updatedAt: new Date().toISOString(),
    });
  };

  const updatePhase3 = (patch: Partial<Phase3Delivery>) => {
    onUpdateProject({
      ...project,
      phase3: { ...project.phase3, ...patch },
      updatedAt: new Date().toISOString(),
    });
  };

  const togglePhase3Item = (itemId: string) => {
    updatePhase3({
      checklist: project.phase3.checklist.map((item) =>
        item.id === itemId ? { ...item, completed: !item.completed } : item
      ),
    });
  };

  const addPhase3Item = () => {
    if (!newTaskLabel.trim()) return;
    updatePhase3({
      checklist: [
        ...project.phase3.checklist,
        { id: `p3-${Date.now()}`, label: newTaskLabel.trim(), completed: false },
      ],
    });
    setNewTaskLabel('');
  };

  const removePhase3Item = (itemId: string) => {
    updatePhase3({
      checklist: project.phase3.checklist.filter((i) => i.id !== itemId),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl bg-[#14171D] border border-[#262B36] rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#262B36]">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              {mode === 'phase-2'
                ? 'Phase 2: Production (External Execution)'
                : 'Phase 3: Post-Production (External Execution)'}
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              {project.brandName} · {project.projectTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {mode === 'phase-2' ? (
            <>
              <div className="flex items-center justify-between gap-3 p-3.5 rounded-lg bg-[#0B0D10] border border-[#262B36]">
                <div>
                  <div className="text-xs text-zinc-400">Active Macro Phase</div>
                  <div className="text-sm font-medium text-zinc-100 mt-0.5">
                    Promote project to Phase 2 once Production PDF is locked
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateProject({
                      ...project,
                      activePhase: project.activePhase === 'phase-2' ? 'phase-1' : 'phase-2',
                    })
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    project.activePhase === 'phase-2'
                      ? 'bg-emerald-500 text-zinc-950'
                      : 'bg-[#1C212A] text-zinc-200 border border-[#2E3543] hover:border-amber-500'
                  }`}
                >
                  {project.activePhase === 'phase-2' ? 'Phase 2 Active' : 'Mark Phase 2 Active'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Production Status
                  </label>
                  <select
                    value={project.phase2.status}
                    onChange={(e) =>
                      updatePhase2({ status: e.target.value as Phase2Handoff['status'] })
                    }
                    className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="Pending Pre-Pro Lock">Pending Pre-Pro Lock</option>
                    <option value="Crew Booked">Crew Booked</option>
                    <option value="In Principal Photography">In Principal Photography</option>
                    <option value="Wrapped">Wrapped</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Principal Shoot Date
                  </label>
                  <input
                    type="date"
                    value={project.phase2.shootDate}
                    onChange={(e) => updatePhase2({ shootDate: e.target.value })}
                    className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-sm text-zinc-100 font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Director of Photography (DP)
                  </label>
                  <input
                    type="text"
                    value={project.phase2.dpName}
                    onChange={(e) => updatePhase2({ dpName: e.target.value })}
                    className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Line Producer
                  </label>
                  <input
                    type="text"
                    value={project.phase2.producerName}
                    onChange={(e) => updatePhase2({ producerName: e.target.value })}
                    className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  On-Set Handoff Summary
                </label>
                <textarea
                  rows={4}
                  value={project.phase2.handoffNotes}
                  onChange={(e) => updatePhase2({ handoffNotes: e.target.value })}
                  className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="p-3.5 rounded-lg bg-[#0B0D10] border border-[#262B36] text-xs text-zinc-400 flex items-center justify-between">
                <span>Pre-Pro Synced Deliverables</span>
                <span className="font-mono text-zinc-200 tabular-nums">
                  {project.storyboardPanels.length + project.extraShots.length} Shots ·{' '}
                  {project.requirements.filter((r) => r.checked).length}/
                  {project.requirements.length} Gear Ready · {project.schedule.length} Call Blocks
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 p-3.5 rounded-lg bg-[#0B0D10] border border-[#262B36]">
                <div>
                  <div className="text-xs text-zinc-400">Active Macro Phase</div>
                  <div className="text-sm font-medium text-zinc-100 mt-0.5">
                    Track editorial, sound mix, color, and aspect ratio deliverables
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateProject({
                      ...project,
                      activePhase: project.activePhase === 'phase-3' ? 'phase-1' : 'phase-3',
                    })
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    project.activePhase === 'phase-3'
                      ? 'bg-emerald-500 text-zinc-950'
                      : 'bg-[#1C212A] text-zinc-200 border border-[#2E3543] hover:border-amber-500'
                  }`}
                >
                  {project.activePhase === 'phase-3' ? 'Phase 3 Active' : 'Mark Phase 3 Active'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Post Status
                  </label>
                  <select
                    value={project.phase3.status}
                    onChange={(e) =>
                      updatePhase3({ status: e.target.value as Phase3Delivery['status'] })
                    }
                    className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="Awaiting Footage">Awaiting Footage</option>
                    <option value="Assembly Cut">Assembly Cut</option>
                    <option value="Color & Sound Mix">Color & Sound Mix</option>
                    <option value="Masters Delivered">Masters Delivered</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Lead Editor
                  </label>
                  <input
                    type="text"
                    value={project.phase3.editorName}
                    onChange={(e) => updatePhase3({ editorName: e.target.value })}
                    className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Target Delivery
                  </label>
                  <input
                    type="date"
                    value={project.phase3.deliveryTargetDate}
                    onChange={(e) => updatePhase3({ deliveryTargetDate: e.target.value })}
                    className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-sm text-zinc-100 font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium text-zinc-300">
                  Final Delivery Checklist
                </div>
                {project.phase3.checklist.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-[#0B0D10] border border-[#262B36]"
                  >
                    <button
                      type="button"
                      onClick={() => togglePhase3Item(item.id)}
                      className="flex items-center gap-2.5 text-left text-sm text-zinc-200 cursor-pointer flex-1"
                    >
                      {item.completed ? (
                        <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-zinc-500 shrink-0" />
                      )}
                      <span className={item.completed ? 'line-through text-zinc-500' : ''}>
                        {item.label}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removePhase3Item(item.id)}
                      className="p-1 text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Add post-production deliverable..."
                    value={newTaskLabel}
                    onChange={(e) => setNewTaskLabel(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addPhase3Item()}
                    className="flex-1 bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={addPhase3Item}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-[#1C212A] border border-[#262B36] hover:border-amber-500 text-zinc-200 rounded-lg transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-3.5 border-t border-[#262B36] bg-[#101318] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
