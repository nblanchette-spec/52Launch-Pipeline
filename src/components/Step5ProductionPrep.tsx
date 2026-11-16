import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Sparkles,
  Loader2,
  CalendarClock,
  CheckSquare,
  Square,
  ArrowRight,
  Clapperboard,
} from 'lucide-react';
import {
  BrandProject,
  CameraAngle,
  CameraMovement,
  ExtraShotItem,
  ProductionRequirementItem,
  RequirementCategory,
  ScheduleBlock,
  ShotSize,
  StoryboardPanel,
} from '../types/studio';

interface Step5ProductionPrepProps {
  project: BrandProject;
  onUpdateProject: (updated: BrandProject) => void;
  onNavigateStep: (step: 'step-6') => void;
}

const SHOT_SIZES: ShotSize[] = ['ECU', 'CU', 'MCU', 'MS', 'WS', 'EWS'];
const CAMERA_ANGLES: CameraAngle[] = [
  'Eye Level',
  'Low Angle',
  'High Angle',
  'Dutch Tilt',
  'Overhead / Top-Down',
  'Over-the-Shoulder',
];
const CAMERA_MOVEMENTS: CameraMovement[] = [
  'Static / Locked-Off',
  'Slow Push-In',
  'Tracking / Dolly',
  'Handheld / Kinetic',
  'Whip Pan',
  'Steadicam Orbit',
  'Macro Slider',
];
const REQ_CATEGORIES: RequirementCategory[] = [
  'Camera & Lenses',
  'Lighting & Grip',
  'Audio',
  'Art/Props/Wardrobe',
  'Talent & Releases',
];
const BLOCK_TYPES: ScheduleBlock['blockType'][] = [
  'Call Time',
  'Setup',
  'Shoot Block',
  'Company Move',
  'Meal Break',
  'Wrap',
];

export const Step5ProductionPrep: React.FC<Step5ProductionPrepProps> = ({
  project,
  onUpdateProject,
  onNavigateStep,
}) => {
  const [activeTab, setActiveTab] = useState<'shots' | 'requirements' | 'schedule'>('shots');
  const [isSuggestingReqs, setIsSuggestingReqs] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [newReqText, setNewReqText] = useState('');
  const [newReqCategory, setNewReqCategory] = useState<RequirementCategory>('Camera & Lenses');

  // Build unified shot list view for AI and summary calculations
  const buildUnifiedShotsForAi = () => {
    const panelShots = project.storyboardPanels.map((p) => {
      const loc =
        project.locationLocker.find((l) => l.id === p.locationId)?.name || 'Unassigned Location';
      const cast =
        project.castLocker
          .filter((c) => p.castIds.includes(c.id))
          .map((c) => c.name)
          .join(', ') || '—';
      const props =
        project.propLocker
          .filter((pr) => p.propIds.includes(pr.id))
          .map((pr) => pr.name)
          .join(', ') || '—';
      return {
        shotNumber: p.shotNumber,
        scene: p.sceneLabel,
        shotSize: p.shotSize,
        angle: p.cameraAngle,
        movement: p.cameraMovement,
        location: loc,
        cast,
        props,
        dialogueAudio: p.dialogueAudio,
        estDurationMins: p.estDurationMins,
      };
    });

    const extra = project.extraShots.map((e) => ({
      shotNumber: e.shotNumber,
      scene: e.sceneLabel,
      shotSize: e.shotSize,
      angle: e.cameraAngle,
      movement: e.cameraMovement,
      location: e.locationName,
      cast: e.castNames,
      props: e.propNames,
      dialogueAudio: e.dialogueAudio,
      estDurationMins: e.estDurationMins,
    }));

    return [...panelShots, ...extra];
  };

  const totalShotMins =
    project.storyboardPanels.reduce((sum, p) => sum + (Number(p.estDurationMins) || 0), 0) +
    project.extraShots.reduce((sum, e) => sum + (Number(e.estDurationMins) || 0), 0);

  const updatePanelField = (id: string, patch: Partial<StoryboardPanel>) => {
    onUpdateProject({
      ...project,
      storyboardPanels: project.storyboardPanels.map((p) =>
        p.id === id ? { ...p, ...patch } : p
      ),
      updatedAt: new Date().toISOString(),
    });
  };

  const addBrollShot = () => {
    const nextNum = project.extraShots.length + 1;
    const newShot: ExtraShotItem = {
      id: `extra-${Date.now()}`,
      shotNumber: `B${nextNum}`,
      sceneLabel: 'Insert / Atmospheric B-Roll',
      shotSize: 'CU',
      cameraAngle: 'Eye Level',
      cameraMovement: 'Static / Locked-Off',
      locationName: project.locationLocker[0]?.name || 'Primary Set',
      castNames: '—',
      propNames: project.propLocker[0]?.name || '—',
      dialogueAudio: 'Room tone / ambient Foley',
      estDurationMins: 15,
      isBroll: true,
    };
    onUpdateProject({
      ...project,
      extraShots: [...project.extraShots, newShot],
      updatedAt: new Date().toISOString(),
    });
  };

  const updateExtraShot = (id: string, patch: Partial<ExtraShotItem>) => {
    onUpdateProject({
      ...project,
      extraShots: project.extraShots.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      updatedAt: new Date().toISOString(),
    });
  };

  const removeExtraShot = (id: string) => {
    onUpdateProject({
      ...project,
      extraShots: project.extraShots.filter((s) => s.id !== id),
      updatedAt: new Date().toISOString(),
    });
  };

  // --- Production Requirements ---
  const handleAiSuggestRequirements = async () => {
    setErrorMsg(null);
    setIsSuggestingReqs(true);
    try {
      const response = await fetch('/api/ai/requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandName: project.brandName,
          projectTitle: project.projectTitle,
          brief: project.brief,
          shots: buildUnifiedShotsForAi(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to suggest production requirements.');
      }

      const items: ProductionRequirementItem[] = (data.requirements || []).map(
        (
          r: {
            category: string;
            item: string;
            quantity: string;
            notes: string;
          },
          idx: number
        ) => ({
          id: `req-${Date.now()}-${idx}`,
          category: REQ_CATEGORIES.includes(r.category as RequirementCategory)
            ? (r.category as RequirementCategory)
            : 'Camera & Lenses',
          item: r.item || 'Production Item',
          quantity: r.quantity || '1',
          notes: r.notes || '',
          checked: false,
        })
      );

      onUpdateProject({
        ...project,
        requirements: items,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to suggest requirements.');
    } finally {
      setIsSuggestingReqs(false);
    }
  };

  const toggleRequirement = (id: string) => {
    onUpdateProject({
      ...project,
      requirements: project.requirements.map((r) =>
        r.id === id ? { ...r, checked: !r.checked } : r
      ),
      updatedAt: new Date().toISOString(),
    });
  };

  const addManualRequirement = () => {
    if (!newReqText.trim()) return;
    const item: ProductionRequirementItem = {
      id: `req-${Date.now()}`,
      category: newReqCategory,
      item: newReqText.trim(),
      quantity: '1',
      notes: '',
      checked: false,
    };
    onUpdateProject({
      ...project,
      requirements: [...project.requirements, item],
      updatedAt: new Date().toISOString(),
    });
    setNewReqText('');
  };

  const removeRequirement = (id: string) => {
    onUpdateProject({
      ...project,
      requirements: project.requirements.filter((r) => r.id !== id),
      updatedAt: new Date().toISOString(),
    });
  };

  // --- Smart Shoot Day Scheduler ---
  const handleAutoSchedule = async () => {
    setErrorMsg(null);
    setIsScheduling(true);
    try {
      const response = await fetch('/api/ai/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandName: project.brandName,
          projectTitle: project.projectTitle,
          shootDate: project.shootDate,
          shots: buildUnifiedShotsForAi(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate shoot schedule.');
      }

      const blocks: ScheduleBlock[] = (data.schedule || []).map(
        (b: ScheduleBlock, idx: number) => ({
          id: `sch-${Date.now()}-${idx}`,
          startTime: b.startTime || '08:00 AM',
          endTime: b.endTime || '09:00 AM',
          blockType: BLOCK_TYPES.includes(b.blockType) ? b.blockType : 'Shoot Block',
          title: b.title || 'Production Block',
          location: b.location || 'Primary Set',
          shotNumbers: Array.isArray(b.shotNumbers) ? b.shotNumbers : [],
          lightingSetup: b.lightingSetup || 'Natural / Key',
          notes: b.notes || '',
        })
      );

      onUpdateProject({
        ...project,
        schedule: blocks,
        updatedAt: new Date().toISOString(),
      });
      setActiveTab('schedule');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Auto-schedule failed.');
    } finally {
      setIsScheduling(false);
    }
  };

  const updateScheduleBlock = (id: string, patch: Partial<ScheduleBlock>) => {
    onUpdateProject({
      ...project,
      schedule: project.schedule.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      updatedAt: new Date().toISOString(),
    });
  };

  const addManualBlock = () => {
    const block: ScheduleBlock = {
      id: `sch-${Date.now()}`,
      startTime: '01:00 PM',
      endTime: '02:00 PM',
      blockType: 'Shoot Block',
      title: 'Additional Setup & Coverage',
      location: project.locationLocker[0]?.name || 'Primary Set',
      shotNumbers: [],
      lightingSetup: 'Key + Negative Fill',
      notes: '',
    };
    onUpdateProject({
      ...project,
      schedule: [...project.schedule, block],
      updatedAt: new Date().toISOString(),
    });
  };

  const removeScheduleBlock = (id: string) => {
    onUpdateProject({
      ...project,
      schedule: project.schedule.filter((b) => b.id !== id),
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-7 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-[#262B36]">
        <div>
          <div className="text-xs font-medium text-amber-400">
            Step 05 · Master Shot List, Gear Checklist & Shoot Schedule
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 mt-1">
            Production Logistics & Call Sheet Builder
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            All storyboard frames mirror automatically into your Master Shot List. Group setups
            by location and lighting to lock your shoot day timeline.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={isScheduling}
            onClick={handleAutoSchedule}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-zinc-100 bg-[#14171D] border border-amber-500/50 hover:bg-amber-500/10 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isScheduling ? (
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
            ) : (
              <CalendarClock className="w-4 h-4 text-amber-400" />
            )}
            {isScheduling ? 'Scheduling Shoot Day...' : 'Auto-Schedule Shoot Day'}
          </button>

          <button
            type="button"
            onClick={() => onNavigateStep('step-6')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Preview Production Book PDF
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sub-navigation tabs + summary counters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 p-1 bg-[#101318] border border-[#262B36] rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('shots')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'shots'
                ? 'bg-[#191E26] text-amber-300 border border-amber-500/40'
                : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
            }`}
          >
            Master Shot List ({project.storyboardPanels.length + project.extraShots.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('requirements')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'requirements'
                ? 'bg-[#191E26] text-amber-300 border border-amber-500/40'
                : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
            }`}
          >
            What We Need ({project.requirements.filter((r) => r.checked).length}/
            {project.requirements.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('schedule')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'schedule'
                ? 'bg-[#191E26] text-amber-300 border border-amber-500/40'
                : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
            }`}
          >
            Shoot Day Call Sheet ({project.schedule.length})
          </button>
        </div>

        <div className="text-xs text-zinc-400 font-mono tabular-nums">
          Est. Camera Time: <span className="text-zinc-100">{totalShotMins} mins</span> (
          {(totalShotMins / 60).toFixed(1)} hrs)
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/40 text-xs text-rose-300">
          {errorMsg}
        </div>
      )}

      {/* TAB 1: MASTER SHOT LIST */}
      {activeTab === 'shots' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">
              Synced live with Step 4 Storyboard Studio. Edit specs inline or add B-roll / insert
              shots.
            </span>
            <button
              type="button"
              onClick={addBrollShot}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-200 bg-[#14171D] border border-[#262B36] hover:border-amber-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add B-Roll / Insert Shot
            </button>
          </div>

          <div className="bg-[#14171D] border border-[#262B36] rounded-xl overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1120px]">
              <thead>
                <tr className="bg-[#101318] border-b border-[#262B36] text-[11px] font-semibold text-zinc-400">
                  <th className="py-3 px-3 w-16">Shot #</th>
                  <th className="py-3 px-3 w-44">Scene</th>
                  <th className="py-3 px-3 w-28">Frame</th>
                  <th className="py-3 px-3 w-24">Size</th>
                  <th className="py-3 px-3 w-36">Angle</th>
                  <th className="py-3 px-3 w-40">Movement</th>
                  <th className="py-3 px-3 w-40">Location</th>
                  <th className="py-3 px-3 w-36">Cast</th>
                  <th className="py-3 px-3 w-36">Props</th>
                  <th className="py-3 px-3">Dialogue / Audio</th>
                  <th className="py-3 px-3 w-24 text-right">Mins</th>
                  <th className="py-3 px-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1D222B] text-xs">
                {project.storyboardPanels.map((panel) => {
                  const locName =
                    project.locationLocker.find((l) => l.id === panel.locationId)?.name ||
                    'Unassigned';
                  const castNames =
                    project.castLocker
                      .filter((c) => panel.castIds.includes(c.id))
                      .map((c) => c.name)
                      .join(', ') || '—';
                  const propNames =
                    project.propLocker
                      .filter((pr) => panel.propIds.includes(pr.id))
                      .map((pr) => pr.name)
                      .join(', ') || '—';

                  return (
                    <tr key={panel.id} className="hover:bg-[#181C24] transition-colors">
                      <td className="py-2.5 px-3 font-mono font-semibold text-amber-400 tabular-nums">
                        <input
                          type="text"
                          value={panel.shotNumber}
                          onChange={(e) =>
                            updatePanelField(panel.id, { shotNumber: e.target.value })
                          }
                          className="w-12 bg-transparent border border-transparent focus:border-amber-500 rounded px-1 py-0.5 focus:outline-none"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={panel.sceneLabel}
                          onChange={(e) =>
                            updatePanelField(panel.id, { sceneLabel: e.target.value })
                          }
                          className="w-full bg-transparent text-zinc-100 font-medium border border-transparent focus:border-amber-500 rounded px-1 py-0.5 focus:outline-none"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="w-20 h-11 rounded bg-[#0B0D10] border border-[#262B36] overflow-hidden flex items-center justify-center">
                          {panel.imageUrl ? (
                            <img
                              src={panel.imageUrl}
                              alt={panel.shotNumber}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Clapperboard className="w-3.5 h-3.5 text-zinc-600" />
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          value={panel.shotSize}
                          onChange={(e) =>
                            updatePanelField(panel.id, {
                              shotSize: e.target.value as ShotSize,
                            })
                          }
                          className="bg-[#0B0D10] border border-[#262B36] rounded px-1.5 py-1 text-xs font-mono text-zinc-200 focus:outline-none focus:border-amber-500"
                        >
                          {SHOT_SIZES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          value={panel.cameraAngle}
                          onChange={(e) =>
                            updatePanelField(panel.id, {
                              cameraAngle: e.target.value as CameraAngle,
                            })
                          }
                          className="w-full bg-[#0B0D10] border border-[#262B36] rounded px-1.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                        >
                          {CAMERA_ANGLES.map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          value={panel.cameraMovement}
                          onChange={(e) =>
                            updatePanelField(panel.id, {
                              cameraMovement: e.target.value as CameraMovement,
                            })
                          }
                          className="w-full bg-[#0B0D10] border border-[#262B36] rounded px-1.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                        >
                          {CAMERA_MOVEMENTS.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 px-3 text-zinc-300">{locName}</td>
                      <td className="py-2.5 px-3 text-zinc-300">{castNames}</td>
                      <td className="py-2.5 px-3 text-zinc-300">{propNames}</td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={panel.dialogueAudio}
                          onChange={(e) =>
                            updatePanelField(panel.id, { dialogueAudio: e.target.value })
                          }
                          className="w-full bg-transparent text-zinc-300 border border-transparent focus:border-amber-500 rounded px-1 py-0.5 focus:outline-none"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <input
                          type="number"
                          min={5}
                          step={5}
                          value={panel.estDurationMins}
                          onChange={(e) =>
                            updatePanelField(panel.id, {
                              estDurationMins: Number(e.target.value) || 0,
                            })
                          }
                          className="w-14 bg-[#0B0D10] border border-[#262B36] rounded px-1.5 py-1 text-right font-mono tabular-nums text-zinc-200 focus:outline-none focus:border-amber-500"
                        />
                      </td>
                      <td className="py-2.5 px-2 text-zinc-600 text-[10px]">Sync</td>
                    </tr>
                  );
                })}

                {project.extraShots.map((shot) => (
                  <tr key={shot.id} className="hover:bg-[#181C24] transition-colors bg-[#11151B]">
                    <td className="py-2.5 px-3 font-mono font-semibold text-emerald-400 tabular-nums">
                      <input
                        type="text"
                        value={shot.shotNumber}
                        onChange={(e) =>
                          updateExtraShot(shot.id, { shotNumber: e.target.value })
                        }
                        className="w-12 bg-transparent border border-transparent focus:border-amber-500 rounded px-1 py-0.5 focus:outline-none"
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="text"
                        value={shot.sceneLabel}
                        onChange={(e) =>
                          updateExtraShot(shot.id, { sceneLabel: e.target.value })
                        }
                        className="w-full bg-transparent text-zinc-100 font-medium border border-transparent focus:border-amber-500 rounded px-1 py-0.5 focus:outline-none"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-[11px] text-zinc-500">B-Roll</td>
                    <td className="py-2.5 px-3">
                      <select
                        value={shot.shotSize}
                        onChange={(e) =>
                          updateExtraShot(shot.id, { shotSize: e.target.value as ShotSize })
                        }
                        className="bg-[#0B0D10] border border-[#262B36] rounded px-1.5 py-1 text-xs font-mono text-zinc-200"
                      >
                        {SHOT_SIZES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 px-3">
                      <select
                        value={shot.cameraAngle}
                        onChange={(e) =>
                          updateExtraShot(shot.id, {
                            cameraAngle: e.target.value as CameraAngle,
                          })
                        }
                        className="w-full bg-[#0B0D10] border border-[#262B36] rounded px-1.5 py-1 text-xs text-zinc-200"
                      >
                        {CAMERA_ANGLES.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 px-3">
                      <select
                        value={shot.cameraMovement}
                        onChange={(e) =>
                          updateExtraShot(shot.id, {
                            cameraMovement: e.target.value as CameraMovement,
                          })
                        }
                        className="w-full bg-[#0B0D10] border border-[#262B36] rounded px-1.5 py-1 text-xs text-zinc-200"
                      >
                        {CAMERA_MOVEMENTS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="text"
                        value={shot.locationName}
                        onChange={(e) =>
                          updateExtraShot(shot.id, { locationName: e.target.value })
                        }
                        className="w-full bg-transparent text-zinc-300 border border-transparent focus:border-amber-500 rounded px-1 py-0.5 focus:outline-none"
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="text"
                        value={shot.castNames}
                        onChange={(e) =>
                          updateExtraShot(shot.id, { castNames: e.target.value })
                        }
                        className="w-full bg-transparent text-zinc-300 border border-transparent focus:border-amber-500 rounded px-1 py-0.5 focus:outline-none"
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="text"
                        value={shot.propNames}
                        onChange={(e) =>
                          updateExtraShot(shot.id, { propNames: e.target.value })
                        }
                        className="w-full bg-transparent text-zinc-300 border border-transparent focus:border-amber-500 rounded px-1 py-0.5 focus:outline-none"
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="text"
                        value={shot.dialogueAudio}
                        onChange={(e) =>
                          updateExtraShot(shot.id, { dialogueAudio: e.target.value })
                        }
                        className="w-full bg-transparent text-zinc-300 border border-transparent focus:border-amber-500 rounded px-1 py-0.5 focus:outline-none"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <input
                        type="number"
                        min={5}
                        step={5}
                        value={shot.estDurationMins}
                        onChange={(e) =>
                          updateExtraShot(shot.id, {
                            estDurationMins: Number(e.target.value) || 0,
                          })
                        }
                        className="w-14 bg-[#0B0D10] border border-[#262B36] rounded px-1.5 py-1 text-right font-mono tabular-nums text-zinc-200"
                      />
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeExtraShot(shot.id)}
                        className="p-1 text-zinc-500 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: PRODUCTION REQUIREMENTS ("WHAT WE NEED") */}
      {activeTab === 'requirements' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={newReqCategory}
                onChange={(e) => setNewReqCategory(e.target.value as RequirementCategory)}
                className="bg-[#14171D] border border-[#262B36] rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
              >
                {REQ_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Add gear, prop, or release requirement..."
                value={newReqText}
                onChange={(e) => setNewReqText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addManualRequirement()}
                className="bg-[#14171D] border border-[#262B36] rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 w-64"
              />
              <button
                type="button"
                onClick={addManualRequirement}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-zinc-200 bg-[#14171D] border border-[#262B36] hover:border-amber-500 rounded-lg cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Item
              </button>
            </div>

            <button
              type="button"
              disabled={isSuggestingReqs}
              onClick={handleAiSuggestRequirements}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isSuggestingReqs ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {isSuggestingReqs
                ? 'Analyzing Shot List...'
                : 'AI Auto-Suggest Gear & Crew'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {REQ_CATEGORIES.map((cat) => {
              const items = project.requirements.filter((r) => r.category === cat);
              return (
                <div
                  key={cat}
                  className="bg-[#14171D] border border-[#262B36] rounded-xl overflow-hidden"
                >
                  <div className="px-4 py-3 bg-[#101318] border-b border-[#262B36] flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-200">{cat}</span>
                    <span className="text-xs font-mono text-zinc-500 tabular-nums">
                      {items.filter((i) => i.checked).length}/{items.length} ready
                    </span>
                  </div>

                  <div className="p-3 space-y-2">
                    {items.length === 0 ? (
                      <div className="text-xs text-zinc-600 py-3 px-2">
                        No items listed under {cat}.
                      </div>
                    ) : (
                      items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-start justify-between gap-2.5 p-2.5 rounded-lg bg-[#0B0D10] border border-[#262B36]"
                        >
                          <button
                            type="button"
                            onClick={() => toggleRequirement(item.id)}
                            className="flex items-start gap-2.5 text-left flex-1 cursor-pointer"
                          >
                            {item.checked ? (
                              <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                            ) : (
                              <Square className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                            )}
                            <div>
                              <div
                                className={`text-xs font-medium ${
                                  item.checked
                                    ? 'line-through text-zinc-500'
                                    : 'text-zinc-200'
                                }`}
                              >
                                {item.item}{' '}
                                <span className="font-mono text-amber-400/90">
                                  ({item.quantity})
                                </span>
                              </div>
                              {item.notes && (
                                <div className="text-[11px] text-zinc-500 mt-0.5">
                                  {item.notes}
                                </div>
                              )}
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => removeRequirement(item.id)}
                            className="p-1 text-zinc-600 hover:text-rose-400 cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: SMART SHOOT DAY SCHEDULE */}
      {activeTab === 'schedule' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-zinc-400">
              Shoot Date:{' '}
              <span className="font-mono text-zinc-200">{project.shootDate || 'TBD'}</span> ·
              Grouped by Location & Lighting Setup to minimize company moves.
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={addManualBlock}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-200 bg-[#14171D] border border-[#262B36] hover:border-zinc-500 rounded-lg cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Call Block
              </button>
              <button
                type="button"
                disabled={isScheduling}
                onClick={handleAutoSchedule}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 rounded-lg cursor-pointer"
              >
                {isScheduling ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                {isScheduling ? 'Optimizing...' : 'Auto-Schedule Shoot Day'}
              </button>
            </div>
          </div>

          {project.schedule.length === 0 ? (
            <div className="bg-[#14171D] border border-dashed border-[#262B36] rounded-xl p-12 text-center space-y-3">
              <CalendarClock className="w-8 h-8 text-zinc-600 mx-auto" />
              <div className="text-sm font-medium text-zinc-200">
                No call sheet timeline generated yet
              </div>
              <p className="text-xs text-zinc-400 max-w-md mx-auto">
                Click &ldquo;Auto-Schedule Shoot Day&rdquo; to automatically organize your shot
                list by location and lighting setup into a minute-by-minute call sheet.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {project.schedule.map((block) => (
                <div
                  key={block.id}
                  className="bg-[#14171D] border border-[#262B36] rounded-xl p-4 grid grid-cols-1 lg:grid-cols-[190px_1fr_auto] gap-4 items-start"
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={block.startTime}
                        onChange={(e) =>
                          updateScheduleBlock(block.id, { startTime: e.target.value })
                        }
                        className="w-[84px] bg-[#0B0D10] border border-[#262B36] rounded px-2 py-1 text-xs font-mono tabular-nums text-amber-300 focus:outline-none focus:border-amber-500"
                      />
                      <span className="text-zinc-600">–</span>
                      <input
                        type="text"
                        value={block.endTime}
                        onChange={(e) =>
                          updateScheduleBlock(block.id, { endTime: e.target.value })
                        }
                        className="w-[84px] bg-[#0B0D10] border border-[#262B36] rounded px-2 py-1 text-xs font-mono tabular-nums text-zinc-200 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <select
                      value={block.blockType}
                      onChange={(e) =>
                        updateScheduleBlock(block.id, {
                          blockType: e.target.value as ScheduleBlock['blockType'],
                        })
                      }
                      className="w-full bg-[#0B0D10] border border-[#262B36] rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-amber-500"
                    >
                      {BLOCK_TYPES.map((bt) => (
                        <option key={bt} value={bt}>
                          {bt}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={block.title}
                        onChange={(e) =>
                          updateScheduleBlock(block.id, { title: e.target.value })
                        }
                        className="bg-transparent text-sm font-semibold text-zinc-100 focus:outline-none border-b border-transparent focus:border-amber-500 flex-1 min-w-[200px]"
                      />
                      {block.shotNumbers.length > 0 && (
                        <span className="text-xs font-mono text-amber-400">
                          Shots: {block.shotNumbers.join(', ')}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <input
                        type="text"
                        value={block.location}
                        onChange={(e) =>
                          updateScheduleBlock(block.id, { location: e.target.value })
                        }
                        placeholder="Location"
                        className="bg-[#0B0D10] border border-[#262B36] rounded px-2.5 py-1 text-zinc-300 focus:outline-none focus:border-amber-500"
                      />
                      <input
                        type="text"
                        value={block.lightingSetup}
                        onChange={(e) =>
                          updateScheduleBlock(block.id, { lightingSetup: e.target.value })
                        }
                        placeholder="Lighting Setup"
                        className="bg-[#0B0D10] border border-[#262B36] rounded px-2.5 py-1 text-zinc-300 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <input
                      type="text"
                      value={block.notes}
                      onChange={(e) =>
                        updateScheduleBlock(block.id, { notes: e.target.value })
                      }
                      placeholder="AD / crew notes..."
                      className="w-full bg-transparent text-xs text-zinc-400 focus:outline-none border-b border-transparent focus:border-amber-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => removeScheduleBlock(block.id)}
                    className="p-1.5 text-zinc-500 hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
