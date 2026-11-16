import React, { useState } from 'react';
import {
  Sparkles,
  Loader2,
  Lock,
  CheckCircle2,
  ArrowRight,
  Clapperboard,
} from 'lucide-react';
import {
  BrandProject,
  CameraAngle,
  CreativeTerritory,
  ShotSize,
  StoryboardPanel,
} from '../types/studio';

interface Step3IdeationProps {
  project: BrandProject;
  onUpdateProject: (updated: BrandProject) => void;
  onNavigateStep: (step: 'step-4') => void;
}

const VALID_SHOT_SIZES: ShotSize[] = ['ECU', 'CU', 'MCU', 'MS', 'WS', 'EWS'];
const VALID_ANGLES: CameraAngle[] = [
  'Eye Level',
  'Low Angle',
  'High Angle',
  'Dutch Tilt',
  'Overhead / Top-Down',
  'Over-the-Shoulder',
];

export const Step3Ideation: React.FC<Step3IdeationProps> = ({
  project,
  onUpdateProject,
  onNavigateStep,
}) => {
  const [isBrainstorming, setIsBrainstorming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleBrainstorm = async () => {
    setErrorMsg(null);
    setIsBrainstorming(true);
    try {
      const response = await fetch('/api/ai/territories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandName: project.brandName,
          projectTitle: project.projectTitle,
          industry: project.industry,
          brief: project.brief,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to brainstorm creative territories.');
      }

      const territories: CreativeTerritory[] = (data.territories || []).map(
        (t: CreativeTerritory, idx: number) => ({
          id: `terr-${Date.now()}-${idx}`,
          label: t.label || `Territory ${String.fromCharCode(65 + idx)}`,
          title: t.title || `Concept ${idx + 1}`,
          loglineHook: t.loglineHook || '',
          narrativeArc: {
            act1: t.narrativeArc?.act1 || '',
            act2: t.narrativeArc?.act2 || '',
            act3: t.narrativeArc?.act3 || '',
          },
          visualTreatment: t.visualTreatment || '',
          soundDesignDirection: t.soundDesignDirection || '',
          seedScenes: Array.isArray(t.seedScenes) ? t.seedScenes : [],
        })
      );

      onUpdateProject({
        ...project,
        territories,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to generate concepts.');
    } finally {
      setIsBrainstorming(false);
    }
  };

  const handleLockAndSeed = (territory: CreativeTerritory) => {
    const defaultRatio = project.brief.deliverablesAspectRatios[0] || '16:9';
    const seededPanels: StoryboardPanel[] =
      territory.seedScenes.length > 0
        ? territory.seedScenes.map((scene, idx) => {
            const shotSize = VALID_SHOT_SIZES.includes(scene.suggestedShotSize)
              ? scene.suggestedShotSize
              : 'MS';
            const cameraAngle = VALID_ANGLES.includes(scene.suggestedAngle)
              ? scene.suggestedAngle
              : 'Eye Level';
            return {
              id: `panel-${Date.now()}-${idx}`,
              panelOrder: idx,
              shotNumber: scene.sceneNumber || `${idx + 1}A`,
              sceneLabel: scene.title || `Scene ${idx + 1}`,
              castIds: project.castLocker[0] ? [project.castLocker[0].id] : [],
              locationId: project.locationLocker[0]?.id || null,
              propIds: project.propLocker[0] ? [project.propLocker[0].id] : [],
              shotSize,
              cameraAngle,
              cameraMovement: 'Slow Push-In',
              aspectRatio: defaultRatio,
              actionPrompt: scene.actionSummary,
              inpaintNote: '',
              dialogueAudio: scene.dialogueOrAudio,
              estDurationMins: 35,
            };
          })
        : project.storyboardPanels;

    onUpdateProject({
      ...project,
      lockedTerritoryId: territory.id,
      storyboardPanels:
        seededPanels.length > 0 ? seededPanels : project.storyboardPanels,
      updatedAt: new Date().toISOString(),
    });
    onNavigateStep('step-4');
  };

  return (
    <div className="max-w-[1360px] mx-auto px-6 py-7 space-y-7">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-[#262B36]">
        <div>
          <div className="text-xs font-medium text-amber-400">
            Step 03 · Content Conceptualization & Ideation
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 mt-1">
            Creative Territories & Narrative Direction
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Generate three distinct directorial territories from the Creative Brief, then lock the
            winning direction to seed initial scenes in the Storyboard Studio.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            disabled={isBrainstorming}
            onClick={handleBrainstorm}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isBrainstorming ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Brainstorming 3 Territories...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Brainstorm 3 Creative Territories
              </>
            )}
          </button>

          {project.lockedTerritoryId && (
            <button
              type="button"
              onClick={() => onNavigateStep('step-4')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-200 bg-[#14171D] border border-[#262B36] hover:border-amber-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Open Storyboard Studio
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/40 text-xs text-rose-300">
          {errorMsg}
        </div>
      )}

      {project.territories.length === 0 ? (
        <div className="bg-[#14171D] border border-dashed border-[#262B36] rounded-xl p-12 flex flex-col items-center justify-center text-center space-y-3">
          <Clapperboard className="w-8 h-8 text-zinc-600" />
          <div className="text-base font-semibold text-zinc-200">
            Ready to pitch creative concepts for {project.brandName}
          </div>
          <p className="text-xs text-zinc-400 max-w-md">
            Click &ldquo;Brainstorm 3 Creative Territories&rdquo; to generate three tailored video
            treatments with 3-act arcs, sound design direction, and seed scenes.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {project.territories.map((territory) => {
            const isLocked = project.lockedTerritoryId === territory.id;
            return (
              <div
                key={territory.id}
                className={`bg-[#14171D] border rounded-xl flex flex-col justify-between transition-colors ${
                  isLocked ? 'border-amber-500' : 'border-[#262B36]'
                }`}
              >
                <div className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-medium text-amber-400">
                        {territory.label}
                      </div>
                      <h2 className="text-lg font-bold text-zinc-100 mt-0.5">
                        {territory.title}
                      </h2>
                    </div>
                    {isLocked && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                        Locked
                      </span>
                    )}
                  </div>

                  <div className="p-3.5 rounded-lg bg-[#0B0D10] border border-[#262B36]">
                    <div className="text-[11px] font-medium text-zinc-500 mb-1">
                      Logline / Hook
                    </div>
                    <p className="text-sm text-zinc-200 leading-relaxed">
                      {territory.loglineHook}
                    </p>
                  </div>

                  {/* 3-Act Narrative Arc */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-zinc-300">
                      3-Act Narrative Arc
                    </div>
                    <div className="space-y-1.5 text-xs text-zinc-400 leading-relaxed">
                      <p>
                        <span className="text-zinc-200 font-medium">Act I:</span>{' '}
                        {territory.narrativeArc.act1}
                      </p>
                      <p>
                        <span className="text-zinc-200 font-medium">Act II:</span>{' '}
                        {territory.narrativeArc.act2}
                      </p>
                      <p>
                        <span className="text-zinc-200 font-medium">Act III:</span>{' '}
                        {territory.narrativeArc.act3}
                      </p>
                    </div>
                  </div>

                  {/* Visual Treatment & Sound Design */}
                  <div className="grid grid-cols-1 gap-3 pt-2 border-t border-[#262B36]">
                    <div>
                      <div className="text-[11px] font-medium text-zinc-500">
                        Visual Treatment
                      </div>
                      <p className="text-xs text-zinc-300 mt-0.5 leading-relaxed">
                        {territory.visualTreatment}
                      </p>
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-zinc-500">
                        Sound Design Direction
                      </div>
                      <p className="text-xs text-zinc-300 mt-0.5 leading-relaxed">
                        {territory.soundDesignDirection}
                      </p>
                    </div>
                  </div>

                  {territory.seedScenes.length > 0 && (
                    <div className="pt-2 border-t border-[#262B36]">
                      <div className="text-[11px] font-medium text-zinc-500 mb-1.5">
                        Included Seed Scenes ({territory.seedScenes.length})
                      </div>
                      <div className="space-y-1">
                        {territory.seedScenes.map((sc, idx) => (
                          <div
                            key={idx}
                            className="text-xs text-zinc-300 flex items-center gap-2 truncate"
                          >
                            <span className="font-mono text-amber-400 tabular-nums shrink-0">
                              {sc.sceneNumber}
                            </span>
                            <span className="truncate">{sc.title}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 bg-[#101318] border-t border-[#262B36]">
                  <button
                    type="button"
                    onClick={() => handleLockAndSeed(territory)}
                    className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                      isLocked
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/25'
                        : 'bg-amber-500 text-zinc-950 hover:bg-amber-400'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    {isLocked
                      ? 'Re-Seed Scenes & Open Step 4'
                      : 'Lock Concept & Seed Scenes'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
