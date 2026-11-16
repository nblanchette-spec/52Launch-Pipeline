import React, { useState } from 'react';
import { X } from 'lucide-react';
import { BrandProject } from '../types/studio';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (project: BrandProject) => void;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  isOpen,
  onClose,
  onCreate,
}) => {
  const [brandName, setBrandName] = useState('');
  const [projectTitle, setProjectTitle] = useState('');
  const [industry, setIndustry] = useState('');
  const [directorName, setDirectorName] = useState('N. Blanchette');
  const [shootDate, setShootDate] = useState('2026-12-20');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandName.trim() || !projectTitle.trim()) return;

    const id = `proj-${Date.now()}`;
    const newProject: BrandProject = {
      id,
      brandName: brandName.trim(),
      projectTitle: projectTitle.trim(),
      industry: industry.trim() || 'Startup Launch',
      directorName: directorName.trim() || '52Launch Director',
      shootDate,
      activePhase: 'phase-1',
      updatedAt: new Date().toISOString(),
      onboarding: {
        philosophyNotes: '',
        phaseExpectationsNotes: '',
        founderProblemSolutionNotes: '',
        visualPacingNotes: '',
        kickoffCompleted: false,
      },
      brief: {
        objectiveAndKpis: '',
        targetAudiencePersona: '',
        coreHookMessage: '',
        toneAndPacing: '',
        visualStyleNotes: '',
        colorPalette: [
          { id: `sw-${Date.now()}-1`, name: 'Studio Obsidian', hex: '#0B0D10' },
          { id: `sw-${Date.now()}-2`, name: 'Slate Neutral', hex: '#475569' },
          { id: `sw-${Date.now()}-3`, name: 'Tungsten Accent', hex: '#F59E0B' },
          { id: `sw-${Date.now()}-4`, name: 'Clean Paper', hex: '#F8FAFC' },
        ],
        deliverablesAspectRatios: ['16:9', '9:16'],
        mandatories: '',
      },
      moodBoard: [],
      territories: [],
      lockedTerritoryId: null,
      castLocker: [],
      locationLocker: [],
      propLocker: [],
      storyboardPanels: [],
      extraShots: [],
      requirements: [],
      schedule: [],
      phase2: {
        status: 'Pending Pre-Pro Lock',
        shootDate,
        dpName: 'TBD',
        producerName: 'TBD',
        handoffNotes: 'Pending Step 6 Production Book PDF sign-off.',
      },
      phase3: {
        status: 'Awaiting Footage',
        editorName: 'TBD',
        deliveryTargetDate: '',
        checklist: [
          { id: `p3-${Date.now()}-1`, label: 'DIT Proxy Transcode & Select Reels', completed: false },
          { id: `p3-${Date.now()}-2`, label: 'Hero Assembly & Rhythm Cut', completed: false },
          { id: `p3-${Date.now()}-3`, label: 'Sound Design & Broadcast Mix', completed: false },
          { id: `p3-${Date.now()}-4`, label: 'Color Grade & Aspect Ratio Masters', completed: false },
        ],
      },
    };

    onCreate(newProject);
    setBrandName('');
    setProjectTitle('');
    setIndustry('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-[#14171D] border border-[#262B36] rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#262B36]">
          <h2 className="text-base font-semibold text-zinc-100">
            New Startup Brand Project
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Startup Brand Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g., Solstice Robotics"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Campaign / Film Title
            </label>
            <input
              type="text"
              required
              placeholder="e.g., Built for Autonomous Orchards — Launch Film"
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Industry / Vertical
              </label>
              <input
                type="text"
                placeholder="e.g., AgTech / Robotics"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Target Shoot Date
              </label>
              <input
                type="date"
                value={shootDate}
                onChange={(e) => setShootDate(e.target.value)}
                className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3.5 py-2 text-sm text-zinc-100 font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Creative Director
            </label>
            <input
              type="text"
              value={directorName}
              onChange={(e) => setDirectorName(e.target.value)}
              className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3.5 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-zinc-300 bg-[#0B0D10] border border-[#262B36] rounded-lg hover:border-zinc-500 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors cursor-pointer"
            >
              Create Brand Project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
