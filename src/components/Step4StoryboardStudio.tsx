import React, { useState } from 'react';
import {
  User,
  MapPin,
  Package,
  Clapperboard,
  Lock,
  Unlock,
  Plus,
  Trash2,
  Sparkles,
  Loader2,
  RefreshCw,
  Wand2,
  GripVertical,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  Upload,
  Check,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import {
  AspectRatioOption,
  BrandProject,
  CameraAngle,
  CameraMovement,
  CastIngredient,
  LocationIngredient,
  PropIngredient,
  ShotSize,
  StoryboardPanel,
} from '../types/studio';
import { imageSrcToInlineData, readAndOptimizeLocalImage } from '../utils/imageUtils';

interface Step4StoryboardStudioProps {
  project: BrandProject;
  onUpdateProject: (updated: BrandProject) => void;
  onNavigateStep: (step: 'step-5') => void;
}

type StudioTier = 'cast' | 'location' | 'prop' | 'composer';

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
const ASPECT_RATIOS: AspectRatioOption[] = ['16:9', '9:16', '4:5', '1:1'];

export const Step4StoryboardStudio: React.FC<Step4StoryboardStudioProps> = ({
  project,
  onUpdateProject,
  onNavigateStep,
}) => {
  const [activeTier, setActiveTier] = useState<StudioTier>('composer');
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [focusedPanelId, setFocusedPanelId] = useState<string | null>(
    project.storyboardPanels[0]?.id ?? null
  );
  const [generatingIds, setGeneratingIds] = useState<Record<string, boolean>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [draggedPanelId, setDraggedPanelId] = useState<string | null>(null);

  const lockedCast = project.castLocker.filter((c) => c.locked);
  const lockedLocations = project.locationLocker.filter((l) => l.locked);
  const lockedProps = project.propLocker.filter((p) => p.locked);

  const setItemGenerating = (id: string, val: boolean) => {
    setGeneratingIds((prev) => ({ ...prev, [id]: val }));
  };

  // --- Tier 1: Cast Helpers ---
  const addCastCard = () => {
    const newCast: CastIngredient = {
      id: `cast-${Date.now()}`,
      name: 'New Talent',
      role: 'Principal Subject',
      ageAppearance: 'Late 20s, expressive features',
      wardrobe: 'Minimalist modern workwear',
      vibe: 'Grounded, authentic',
      locked: false,
    };
    onUpdateProject({
      ...project,
      castLocker: [...project.castLocker, newCast],
      updatedAt: new Date().toISOString(),
    });
  };

  const updateCastCard = (id: string, patch: Partial<CastIngredient>) => {
    onUpdateProject({
      ...project,
      castLocker: project.castLocker.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      updatedAt: new Date().toISOString(),
    });
  };

  const removeCastCard = (id: string) => {
    onUpdateProject({
      ...project,
      castLocker: project.castLocker.filter((c) => c.id !== id),
      storyboardPanels: project.storyboardPanels.map((p) => ({
        ...p,
        castIds: p.castIds.filter((cid) => cid !== id),
      })),
      updatedAt: new Date().toISOString(),
    });
  };

  // --- Tier 2: Location Helpers ---
  const addLocationCard = () => {
    const newLoc: LocationIngredient = {
      id: `loc-${Date.now()}`,
      name: 'New Set Location',
      interiorExterior: 'INT',
      timeOfDay: 'Morning Golden Hour',
      architecturalLightingDetails:
        'Clean industrial windows casting directional shadows across minimalist surfaces',
      locked: false,
    };
    onUpdateProject({
      ...project,
      locationLocker: [...project.locationLocker, newLoc],
      updatedAt: new Date().toISOString(),
    });
  };

  const updateLocationCard = (id: string, patch: Partial<LocationIngredient>) => {
    onUpdateProject({
      ...project,
      locationLocker: project.locationLocker.map((l) =>
        l.id === id ? { ...l, ...patch } : l
      ),
      updatedAt: new Date().toISOString(),
    });
  };

  const removeLocationCard = (id: string) => {
    onUpdateProject({
      ...project,
      locationLocker: project.locationLocker.filter((l) => l.id !== id),
      storyboardPanels: project.storyboardPanels.map((p) => ({
        ...p,
        locationId: p.locationId === id ? null : p.locationId,
      })),
      updatedAt: new Date().toISOString(),
    });
  };

  // --- Tier 3: Prop Helpers ---
  const addPropCard = () => {
    const newProp: PropIngredient = {
      id: `prop-${Date.now()}`,
      name: 'Hero Product Unit',
      materialFinish: 'Bead-blasted anodized aluminum + matte glass',
      scale: 'Handheld tabletop scale',
      brandDetails: 'Minimalist etched emblem, clean hardware silhouette',
      locked: false,
    };
    onUpdateProject({
      ...project,
      propLocker: [...project.propLocker, newProp],
      updatedAt: new Date().toISOString(),
    });
  };

  const updatePropCard = (id: string, patch: Partial<PropIngredient>) => {
    onUpdateProject({
      ...project,
      propLocker: project.propLocker.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      updatedAt: new Date().toISOString(),
    });
  };

  const removePropCard = (id: string) => {
    onUpdateProject({
      ...project,
      propLocker: project.propLocker.filter((p) => p.id !== id),
      storyboardPanels: project.storyboardPanels.map((panel) => ({
        ...panel,
        propIds: panel.propIds.filter((pid) => pid !== id),
      })),
      updatedAt: new Date().toISOString(),
    });
  };

  // --- Ingredient Sketch Generation ---
  const generateIngredientSketch = async (
    tier: 'cast' | 'location' | 'prop',
    item: CastIngredient | LocationIngredient | PropIngredient
  ) => {
    setErrorMsg(null);
    setItemGenerating(item.id, true);
    try {
      const response = await fetch('/api/ai/ingredient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier,
          brandName: project.brandName,
          payload: item,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate ingredient sketch.');
      }

      if (tier === 'cast') {
        updateCastCard(item.id, { imageUrl: data.imageDataUrl });
      } else if (tier === 'location') {
        updateLocationCard(item.id, { imageUrl: data.imageDataUrl });
      } else {
        updatePropCard(item.id, { imageUrl: data.imageDataUrl });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Sketch generation failed.');
    } finally {
      setItemGenerating(item.id, false);
    }
  };

  const handleIngredientFileUpload = async (
    tier: 'cast' | 'location' | 'prop',
    id: string,
    file: File
  ) => {
    try {
      const dataUrl = await readAndOptimizeLocalImage(file, 1024);
      if (tier === 'cast') updateCastCard(id, { imageUrl: dataUrl });
      if (tier === 'location') updateLocationCard(id, { imageUrl: dataUrl });
      if (tier === 'prop') updatePropCard(id, { imageUrl: dataUrl });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to upload image.');
    }
  };

  // --- Tier 4: Storyboard Panel Helpers ---
  const addPanel = () => {
    const nextIdx = project.storyboardPanels.length;
    const defaultRatio = project.brief.deliverablesAspectRatios[0] || '16:9';
    const newPanel: StoryboardPanel = {
      id: `panel-${Date.now()}`,
      panelOrder: nextIdx,
      shotNumber: `${nextIdx + 1}A`,
      sceneLabel: `Scene ${nextIdx + 1}`,
      castIds: lockedCast[0] ? [lockedCast[0].id] : [],
      locationId: lockedLocations[0]?.id ?? null,
      propIds: lockedProps[0] ? [lockedProps[0].id] : [],
      shotSize: 'MS',
      cameraAngle: 'Eye Level',
      cameraMovement: 'Slow Push-In',
      aspectRatio: defaultRatio,
      actionPrompt: '',
      inpaintNote: '',
      dialogueAudio: '',
      estDurationMins: 30,
    };
    onUpdateProject({
      ...project,
      storyboardPanels: [...project.storyboardPanels, newPanel],
      updatedAt: new Date().toISOString(),
    });
    setFocusedPanelId(newPanel.id);
  };

  const updatePanel = (id: string, patch: Partial<StoryboardPanel>) => {
    onUpdateProject({
      ...project,
      storyboardPanels: project.storyboardPanels.map((p) =>
        p.id === id ? { ...p, ...patch } : p
      ),
      updatedAt: new Date().toISOString(),
    });
  };

  const removePanel = (id: string) => {
    const remaining = project.storyboardPanels
      .filter((p) => p.id !== id)
      .map((p, idx) => ({ ...p, panelOrder: idx }));
    onUpdateProject({
      ...project,
      storyboardPanels: remaining,
      updatedAt: new Date().toISOString(),
    });
    if (focusedPanelId === id) {
      setFocusedPanelId(remaining[0]?.id ?? null);
    }
  };

  const movePanel = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= project.storyboardPanels.length || fromIdx === toIdx) return;
    const copy = [...project.storyboardPanels];
    const [moved] = copy.splice(fromIdx, 1);
    copy.splice(toIdx, 0, moved);
    onUpdateProject({
      ...project,
      storyboardPanels: copy.map((p, idx) => ({ ...p, panelOrder: idx })),
      updatedAt: new Date().toISOString(),
    });
  };

  const handlePanelDrop = (targetId: string) => {
    if (!draggedPanelId || draggedPanelId === targetId) return;
    const fromIdx = project.storyboardPanels.findIndex((p) => p.id === draggedPanelId);
    const toIdx = project.storyboardPanels.findIndex((p) => p.id === targetId);
    if (fromIdx !== -1 && toIdx !== -1) {
      movePanel(fromIdx, toIdx);
    }
    setDraggedPanelId(null);
  };

  const toggleCastOnPanel = (panelId: string, castId: string) => {
    const panel = project.storyboardPanels.find((p) => p.id === panelId);
    if (!panel) return;
    const exists = panel.castIds.includes(castId);
    updatePanel(panelId, {
      castIds: exists
        ? panel.castIds.filter((id) => id !== castId)
        : [...panel.castIds, castId],
    });
  };

  const toggleLocationOnPanel = (panelId: string, locId: string) => {
    const panel = project.storyboardPanels.find((p) => p.id === panelId);
    if (!panel) return;
    updatePanel(panelId, {
      locationId: panel.locationId === locId ? null : locId,
    });
  };

  const togglePropOnPanel = (panelId: string, propId: string) => {
    const panel = project.storyboardPanels.find((p) => p.id === panelId);
    if (!panel) return;
    const exists = panel.propIds.includes(propId);
    updatePanel(panelId, {
      propIds: exists
        ? panel.propIds.filter((id) => id !== propId)
        : [...panel.propIds, propId],
    });
  };

  // --- Multimodal Storyboard Frame Rendering ---
  const renderStoryboardFrame = async (
    panel: StoryboardPanel,
    applyInpaintEdit: boolean
  ) => {
    setErrorMsg(null);
    setItemGenerating(panel.id, true);
    try {
      const selectedCast = lockedCast.filter((c) => panel.castIds.includes(c.id));
      const selectedLocation =
        lockedLocations.find((l) => l.id === panel.locationId) || null;
      const selectedProps = lockedProps.filter((pr) => panel.propIds.includes(pr.id));

      const castRefs = await Promise.all(
        selectedCast.map(async (c) => {
          const inline = c.imageUrl ? await imageSrcToInlineData(c.imageUrl) : null;
          return {
            name: c.name,
            wardrobe: c.wardrobe,
            data: inline?.data,
            mimeType: inline?.mimeType,
          };
        })
      );

      const locInline = selectedLocation?.imageUrl
        ? await imageSrcToInlineData(selectedLocation.imageUrl)
        : null;
      const locationRef = selectedLocation
        ? {
            name: selectedLocation.name,
            interiorExterior: selectedLocation.interiorExterior,
            timeOfDay: selectedLocation.timeOfDay,
            data: locInline?.data,
            mimeType: locInline?.mimeType,
          }
        : null;

      const propRefs = await Promise.all(
        selectedProps.map(async (pr) => {
          const inline = pr.imageUrl ? await imageSrcToInlineData(pr.imageUrl) : null;
          return {
            name: pr.name,
            materialFinish: pr.materialFinish,
            data: inline?.data,
            mimeType: inline?.mimeType,
          };
        })
      );

      const previousFrameData =
        applyInpaintEdit && panel.imageUrl
          ? await imageSrcToInlineData(panel.imageUrl)
          : null;

      const response = await fetch('/api/ai/storyboard-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          castRefs,
          locationRef,
          propRefs,
          shotSize: panel.shotSize,
          cameraAngle: panel.cameraAngle,
          cameraMovement: panel.cameraMovement,
          aspectRatio: panel.aspectRatio,
          actionPrompt:
            panel.actionPrompt || `${panel.sceneLabel} — cinematic commercial framing`,
          inpaintNote: applyInpaintEdit ? panel.inpaintNote : '',
          previousFrameData,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to render storyboard frame.');
      }

      updatePanel(panel.id, { imageUrl: data.imageDataUrl });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Frame rendering failed.');
    } finally {
      setItemGenerating(panel.id, false);
    }
  };

  const focusedPanel =
    project.storyboardPanels.find((p) => p.id === focusedPanelId) ??
    project.storyboardPanels[0] ??
    null;

  return (
    <div className="flex min-h-[calc(100vh-110px)]">
      {/* Main Studio Canvas */}
      <div className="flex-1 min-w-0 px-6 py-7 space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-[#262B36]">
          <div>
            <div className="text-xs font-medium text-amber-400">
              Step 04 · Souped-Up Google Flow Storyboard Studio
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100 mt-1">
              3-Tier Ingredient Consistency Pipeline
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Generate and lock People, Locations, and Hero Props first, then compose multimodal
              storyboard frames with strict visual continuity.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setDrawerOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-300 bg-[#14171D] border border-[#262B36] hover:border-zinc-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {drawerOpen ? (
                <>
                  <PanelRightClose className="w-3.5 h-3.5" />
                  Hide Ingredient Drawer
                </>
              ) : (
                <>
                  <PanelRightOpen className="w-3.5 h-3.5" />
                  Ingredient Drawer
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => onNavigateStep('step-5')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sync to Shot List & Schedule
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 4-Tier Pipeline Tabs */}
        <div className="flex flex-wrap items-center gap-2 p-1.5 bg-[#101318] border border-[#262B36] rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTier('cast')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTier === 'cast'
                ? 'bg-[#191E26] text-amber-300 border border-amber-500/40'
                : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Tier 1: Cast Locker</span>
            <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
              {lockedCast.length}/{project.castLocker.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTier('location')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTier === 'location'
                ? 'bg-[#191E26] text-amber-300 border border-amber-500/40'
                : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Tier 2: Location Locker</span>
            <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
              {lockedLocations.length}/{project.locationLocker.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTier('prop')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTier === 'prop'
                ? 'bg-[#191E26] text-amber-300 border border-amber-500/40'
                : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Tier 3: Hero Prop Locker</span>
            <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
              {lockedProps.length}/{project.propLocker.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTier('composer')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTier === 'composer'
                ? 'bg-amber-500 text-zinc-950 font-semibold'
                : 'text-zinc-300 hover:text-zinc-100 border border-transparent'
            }`}
          >
            <Clapperboard className="w-3.5 h-3.5" />
            <span>Tier 4: Flow Scene Composer</span>
            <span
              className={`font-mono text-[11px] tabular-nums ${
                activeTier === 'composer' ? 'text-zinc-900' : 'text-zinc-500'
              }`}
            >
              {project.storyboardPanels.length} panels
            </span>
          </button>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/40 text-xs text-rose-300">
            {errorMsg}
          </div>
        )}

        {/* TIER 1: CAST & TALENT LOCKER */}
        {activeTier === 'cast' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-zinc-100">
                  Tier 1 — Cast & Talent Locker
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Generate character reference sheets first and lock approved talent before
                  composing storyboard frames.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={addCastCard}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Cast Member
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTier('location')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-200 bg-[#14171D] border border-[#262B36] hover:border-zinc-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Next: Tier 2 Locations →
                </button>
              </div>
            </div>

            {project.castLocker.length === 0 ? (
              <div className="bg-[#14171D] border border-dashed border-[#262B36] rounded-xl p-10 text-center space-y-3">
                <User className="w-7 h-7 text-zinc-600 mx-auto" />
                <div className="text-sm font-medium text-zinc-300">
                  No cast ingredients yet
                </div>
                <button
                  type="button"
                  onClick={addCastCard}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create First Character Card
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {project.castLocker.map((cast) => {
                  const busy = Boolean(generatingIds[cast.id]);
                  return (
                    <div
                      key={cast.id}
                      className={`bg-[#14171D] border rounded-xl overflow-hidden grid grid-cols-1 sm:grid-cols-[200px_1fr] ${
                        cast.locked ? 'border-emerald-500/50' : 'border-[#262B36]'
                      }`}
                    >
                      <div className="bg-[#0B0D10] border-b sm:border-b-0 sm:border-r border-[#262B36] flex flex-col items-center justify-center p-3 min-h-[240px]">
                        {cast.imageUrl ? (
                          <img
                            src={cast.imageUrl}
                            alt={cast.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-56 object-contain bg-white rounded-md"
                          />
                        ) : (
                          <div className="text-center space-y-2 text-zinc-600 p-4">
                            <User className="w-7 h-7 mx-auto" />
                            <div className="text-xs">No character sheet</div>
                          </div>
                        )}
                      </div>

                      <div className="p-4 space-y-3 flex flex-col justify-between">
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <input
                              type="text"
                              value={cast.name}
                              onChange={(e) => updateCastCard(cast.id, { name: e.target.value })}
                              className="bg-transparent text-sm font-semibold text-zinc-100 focus:outline-none border-b border-transparent focus:border-amber-500 w-full"
                              placeholder="Character Name"
                            />
                            <button
                              type="button"
                              onClick={() => removeCastCard(cast.id)}
                              className="p-1 text-zinc-500 hover:text-rose-400 cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <input
                            type="text"
                            value={cast.role}
                            onChange={(e) => updateCastCard(cast.id, { role: e.target.value })}
                            placeholder="Role (e.g., Founder, Lead Athlete)"
                            className="w-full bg-[#0B0D10] border border-[#262B36] rounded-md px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                          />
                          <input
                            type="text"
                            value={cast.ageAppearance}
                            onChange={(e) =>
                              updateCastCard(cast.id, { ageAppearance: e.target.value })
                            }
                            placeholder="Age & Physical Appearance"
                            className="w-full bg-[#0B0D10] border border-[#262B36] rounded-md px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                          />
                          <input
                            type="text"
                            value={cast.wardrobe}
                            onChange={(e) =>
                              updateCastCard(cast.id, { wardrobe: e.target.value })
                            }
                            placeholder="Wardrobe"
                            className="w-full bg-[#0B0D10] border border-[#262B36] rounded-md px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                          />
                          <input
                            type="text"
                            value={cast.vibe}
                            onChange={(e) => updateCastCard(cast.id, { vibe: e.target.value })}
                            placeholder="Vibe & Expression"
                            className="w-full bg-[#0B0D10] border border-[#262B36] rounded-md px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#262B36]">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => generateIngredientSketch('cast', cast)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 rounded-md transition-colors cursor-pointer"
                          >
                            {busy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5" />
                            )}
                            {busy ? 'Sketching...' : 'Generate Character Sheet'}
                          </button>

                          <label className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-zinc-300 bg-[#0B0D10] border border-[#262B36] hover:border-zinc-500 rounded-md cursor-pointer">
                            <Upload className="w-3.5 h-3.5" />
                            Upload
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleIngredientFileUpload('cast', cast.id, f);
                                e.target.value = '';
                              }}
                            />
                          </label>

                          <button
                            type="button"
                            onClick={() => updateCastCard(cast.id, { locked: !cast.locked })}
                            className={`ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                              cast.locked
                                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                                : 'bg-[#0B0D10] border-[#262B36] text-zinc-300 hover:border-amber-500'
                            }`}
                          >
                            {cast.locked ? (
                              <>
                                <Lock className="w-3.5 h-3.5" />
                                Locked
                              </>
                            ) : (
                              <>
                                <Unlock className="w-3.5 h-3.5" />
                                Lock
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TIER 2: LOCATIONS & SETS LOCKER */}
        {activeTier === 'location' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-zinc-100">
                  Tier 2 — Locations & Sets Locker
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Generate empty establishing set concepts and lock approved environments before
                  Tier 3 props.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={addLocationCard}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Location Set
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTier('prop')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-200 bg-[#14171D] border border-[#262B36] hover:border-zinc-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Next: Tier 3 Props →
                </button>
              </div>
            </div>

            {project.locationLocker.length === 0 ? (
              <div className="bg-[#14171D] border border-dashed border-[#262B36] rounded-xl p-10 text-center space-y-3">
                <MapPin className="w-7 h-7 text-zinc-600 mx-auto" />
                <div className="text-sm font-medium text-zinc-300">
                  No location sets yet
                </div>
                <button
                  type="button"
                  onClick={addLocationCard}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create First Location Card
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {project.locationLocker.map((loc) => {
                  const busy = Boolean(generatingIds[loc.id]);
                  return (
                    <div
                      key={loc.id}
                      className={`bg-[#14171D] border rounded-xl overflow-hidden flex flex-col ${
                        loc.locked ? 'border-emerald-500/50' : 'border-[#262B36]'
                      }`}
                    >
                      <div className="aspect-video bg-[#0B0D10] border-b border-[#262B36] flex items-center justify-center overflow-hidden">
                        {loc.imageUrl ? (
                          <img
                            src={loc.imageUrl}
                            alt={loc.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="text-center space-y-1.5 text-zinc-600 p-4">
                            <MapPin className="w-7 h-7 mx-auto" />
                            <div className="text-xs">No location concept sketch yet</div>
                          </div>
                        )}
                      </div>

                      <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <input
                              type="text"
                              value={loc.name}
                              onChange={(e) =>
                                updateLocationCard(loc.id, { name: e.target.value })
                              }
                              className="bg-transparent text-sm font-semibold text-zinc-100 focus:outline-none border-b border-transparent focus:border-amber-500 w-full"
                              placeholder="Set Name"
                            />
                            <button
                              type="button"
                              onClick={() => removeLocationCard(loc.id)}
                              className="p-1 text-zinc-500 hover:text-rose-400 cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <select
                              value={loc.interiorExterior}
                              onChange={(e) =>
                                updateLocationCard(loc.id, {
                                  interiorExterior: e.target.value as 'INT' | 'EXT' | 'INT/EXT',
                                })
                              }
                              className="bg-[#0B0D10] border border-[#262B36] rounded-md px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                            >
                              <option value="INT">INT</option>
                              <option value="EXT">EXT</option>
                              <option value="INT/EXT">INT/EXT</option>
                            </select>

                            <input
                              type="text"
                              value={loc.timeOfDay}
                              onChange={(e) =>
                                updateLocationCard(loc.id, { timeOfDay: e.target.value })
                              }
                              placeholder="Time of Day"
                              className="bg-[#0B0D10] border border-[#262B36] rounded-md px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                            />
                          </div>

                          <textarea
                            rows={2}
                            value={loc.architecturalLightingDetails}
                            onChange={(e) =>
                              updateLocationCard(loc.id, {
                                architecturalLightingDetails: e.target.value,
                              })
                            }
                            placeholder="Architectural lines, surface materials, lighting direction..."
                            className="w-full bg-[#0B0D10] border border-[#262B36] rounded-md px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#262B36]">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => generateIngredientSketch('location', loc)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 rounded-md transition-colors cursor-pointer"
                          >
                            {busy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5" />
                            )}
                            {busy ? 'Sketching...' : 'Generate Location Concept'}
                          </button>

                          <label className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-zinc-300 bg-[#0B0D10] border border-[#262B36] hover:border-zinc-500 rounded-md cursor-pointer">
                            <Upload className="w-3.5 h-3.5" />
                            Upload
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleIngredientFileUpload('location', loc.id, f);
                                e.target.value = '';
                              }}
                            />
                          </label>

                          <button
                            type="button"
                            onClick={() => updateLocationCard(loc.id, { locked: !loc.locked })}
                            className={`ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                              loc.locked
                                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                                : 'bg-[#0B0D10] border-[#262B36] text-zinc-300 hover:border-amber-500'
                            }`}
                          >
                            {loc.locked ? (
                              <>
                                <Lock className="w-3.5 h-3.5" />
                                Locked
                              </>
                            ) : (
                              <>
                                <Unlock className="w-3.5 h-3.5" />
                                Lock
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TIER 3: HERO PROPS & PRODUCTS LOCKER */}
        {activeTier === 'prop' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-zinc-100">
                  Tier 3 — Hero Props & Products Locker
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Generate isolated industrial-design studies of your hero product or signature
                  props and lock them into the Prop Locker.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={addPropCard}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Hero Prop
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTier('composer')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-200 bg-[#14171D] border border-[#262B36] hover:border-zinc-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Next: Tier 4 Composer →
                </button>
              </div>
            </div>

            {project.propLocker.length === 0 ? (
              <div className="bg-[#14171D] border border-dashed border-[#262B36] rounded-xl p-10 text-center space-y-3">
                <Package className="w-7 h-7 text-zinc-600 mx-auto" />
                <div className="text-sm font-medium text-zinc-300">
                  No hero props yet
                </div>
                <button
                  type="button"
                  onClick={addPropCard}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create First Prop Card
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {project.propLocker.map((prop) => {
                  const busy = Boolean(generatingIds[prop.id]);
                  return (
                    <div
                      key={prop.id}
                      className={`bg-[#14171D] border rounded-xl overflow-hidden grid grid-cols-1 sm:grid-cols-[190px_1fr] ${
                        prop.locked ? 'border-emerald-500/50' : 'border-[#262B36]'
                      }`}
                    >
                      <div className="bg-[#0B0D10] border-b sm:border-b-0 sm:border-r border-[#262B36] flex items-center justify-center p-3 min-h-[200px]">
                        {prop.imageUrl ? (
                          <img
                            src={prop.imageUrl}
                            alt={prop.name}
                            referrerPolicy="no-referrer"
                            className="w-44 h-44 object-contain bg-white rounded-md"
                          />
                        ) : (
                          <div className="text-center space-y-1.5 text-zinc-600 p-4">
                            <Package className="w-7 h-7 mx-auto" />
                            <div className="text-xs">No prop study</div>
                          </div>
                        )}
                      </div>

                      <div className="p-4 space-y-3 flex flex-col justify-between">
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <input
                              type="text"
                              value={prop.name}
                              onChange={(e) => updatePropCard(prop.id, { name: e.target.value })}
                              className="bg-transparent text-sm font-semibold text-zinc-100 focus:outline-none border-b border-transparent focus:border-amber-500 w-full"
                              placeholder="Prop / Product Name"
                            />
                            <button
                              type="button"
                              onClick={() => removePropCard(prop.id)}
                              className="p-1 text-zinc-500 hover:text-rose-400 cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <input
                            type="text"
                            value={prop.materialFinish}
                            onChange={(e) =>
                              updatePropCard(prop.id, { materialFinish: e.target.value })
                            }
                            placeholder="Material & Finish"
                            className="w-full bg-[#0B0D10] border border-[#262B36] rounded-md px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                          />
                          <input
                            type="text"
                            value={prop.scale}
                            onChange={(e) => updatePropCard(prop.id, { scale: e.target.value })}
                            placeholder="Scale & Dimensions"
                            className="w-full bg-[#0B0D10] border border-[#262B36] rounded-md px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                          />
                          <input
                            type="text"
                            value={prop.brandDetails}
                            onChange={(e) =>
                              updatePropCard(prop.id, { brandDetails: e.target.value })
                            }
                            placeholder="Brand Etching, LEDs, Key Details"
                            className="w-full bg-[#0B0D10] border border-[#262B36] rounded-md px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#262B36]">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => generateIngredientSketch('prop', prop)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 rounded-md transition-colors cursor-pointer"
                          >
                            {busy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5" />
                            )}
                            {busy ? 'Sketching...' : 'Generate Prop Study'}
                          </button>

                          <label className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-zinc-300 bg-[#0B0D10] border border-[#262B36] hover:border-zinc-500 rounded-md cursor-pointer">
                            <Upload className="w-3.5 h-3.5" />
                            Upload
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleIngredientFileUpload('prop', prop.id, f);
                                e.target.value = '';
                              }}
                            />
                          </label>

                          <button
                            type="button"
                            onClick={() => updatePropCard(prop.id, { locked: !prop.locked })}
                            className={`ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                              prop.locked
                                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                                : 'bg-[#0B0D10] border-[#262B36] text-zinc-300 hover:border-amber-500'
                            }`}
                          >
                            {prop.locked ? (
                              <>
                                <Lock className="w-3.5 h-3.5" />
                                Locked
                              </>
                            ) : (
                              <>
                                <Unlock className="w-3.5 h-3.5" />
                                Lock
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TIER 4: FLOW SCENE COMPOSER */}
        {activeTier === 'composer' && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-zinc-100">
                  Tier 4 — Flow Scene Composer (Multimodal Frame Generator)
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Drag panels to reorder. Bind locked Cast, Location, and Prop ingredients to pass
                  their reference sketches into multimodal frame rendering.
                </p>
              </div>
              <button
                type="button"
                onClick={addPanel}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Storyboard Panel
              </button>
            </div>

            {project.storyboardPanels.length === 0 ? (
              <div className="bg-[#14171D] border border-dashed border-[#262B36] rounded-xl p-12 text-center space-y-3">
                <Clapperboard className="w-8 h-8 text-zinc-600 mx-auto" />
                <div className="text-sm font-medium text-zinc-200">
                  No storyboard panels in timeline yet
                </div>
                <p className="text-xs text-zinc-400 max-w-md mx-auto">
                  Lock a Creative Territory in Step 3 to seed scenes automatically, or add your
                  first storyboard panel manually.
                </p>
                <button
                  type="button"
                  onClick={addPanel}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add First Panel
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6">
                {project.storyboardPanels.map((panel, index) => {
                  const busy = Boolean(generatingIds[panel.id]);
                  const isFocused = focusedPanel?.id === panel.id;

                  return (
                    <div
                      key={panel.id}
                      draggable
                      onDragStart={() => setDraggedPanelId(panel.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handlePanelDrop(panel.id)}
                      onClick={() => setFocusedPanelId(panel.id)}
                      className={`bg-[#14171D] border rounded-xl overflow-hidden flex flex-col transition-colors ${
                        isFocused
                          ? 'border-amber-500/70'
                          : 'border-[#262B36] hover:border-zinc-600'
                      }`}
                    >
                      {/* Panel Header Strip */}
                      <div className="px-4 py-2.5 bg-[#101318] border-b border-[#262B36] flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <GripVertical className="w-4 h-4 text-zinc-600 cursor-grab shrink-0" />
                          <input
                            type="text"
                            value={panel.shotNumber}
                            onChange={(e) =>
                              updatePanel(panel.id, { shotNumber: e.target.value })
                            }
                            aria-label="Shot number"
                            className="w-12 bg-[#0B0D10] border border-[#262B36] rounded px-1.5 py-0.5 text-xs font-mono font-semibold text-amber-400 text-center focus:outline-none focus:border-amber-500"
                          />
                          <input
                            type="text"
                            value={panel.sceneLabel}
                            onChange={(e) =>
                              updatePanel(panel.id, { sceneLabel: e.target.value })
                            }
                            aria-label="Scene label"
                            className="bg-transparent text-xs font-semibold text-zinc-100 focus:outline-none border-b border-transparent focus:border-amber-500 min-w-0 truncate"
                            placeholder="Scene Title"
                          />
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              movePanel(index, index - 1);
                            }}
                            title="Move earlier"
                            className="p-1 text-zinc-400 hover:text-zinc-100 disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={index === project.storyboardPanels.length - 1}
                            onClick={(e) => {
                              e.stopPropagation();
                              movePanel(index, index + 1);
                            }}
                            title="Move later"
                            className="p-1 text-zinc-400 hover:text-zinc-100 disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removePanel(panel.id);
                            }}
                            title="Delete panel"
                            className="p-1 text-zinc-500 hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Rendered Storyboard Canvas */}
                      <div className="aspect-video bg-[#0B0D10] border-b border-[#262B36] relative flex items-center justify-center overflow-hidden">
                        {panel.imageUrl ? (
                          <img
                            src={panel.imageUrl}
                            alt={`Shot ${panel.shotNumber} storyboard`}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="text-center space-y-2 p-6 text-zinc-500">
                            <Clapperboard className="w-7 h-7 mx-auto text-zinc-600" />
                            <div className="text-xs">
                              Select active ingredients below & click Render Storyboard Frame
                            </div>
                          </div>
                        )}

                        {busy && (
                          <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex flex-col items-center justify-center gap-2 text-amber-300">
                            <Loader2 className="w-6 h-6 animate-spin" />
                            <span className="text-xs font-medium">
                              Composing multimodal storyboard sketch...
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Active Ingredients Toggles & Cinematography Controls */}
                      <div className="p-4 space-y-3.5">
                        {/* Active Ingredients Selector */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400">
                            <span>Active Ingredients (Passed as Reference Sketches)</span>
                            <span className="font-mono tabular-nums text-zinc-500">
                              {panel.castIds.length +
                                (panel.locationId ? 1 : 0) +
                                panel.propIds.length}{' '}
                              bound
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {lockedCast.map((c) => {
                              const active = panel.castIds.includes(c.id);
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => toggleCastOnPanel(panel.id, c.id)}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors cursor-pointer ${
                                    active
                                      ? 'bg-amber-500/20 border-amber-500 text-amber-200'
                                      : 'bg-[#0B0D10] border-[#262B36] text-zinc-400 hover:text-zinc-200'
                                  }`}
                                >
                                  <User className="w-3 h-3" />
                                  {c.name}
                                </button>
                              );
                            })}

                            {lockedLocations.map((l) => {
                              const active = panel.locationId === l.id;
                              return (
                                <button
                                  key={l.id}
                                  type="button"
                                  onClick={() => toggleLocationOnPanel(panel.id, l.id)}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors cursor-pointer ${
                                    active
                                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-200'
                                      : 'bg-[#0B0D10] border-[#262B36] text-zinc-400 hover:text-zinc-200'
                                  }`}
                                >
                                  <MapPin className="w-3 h-3" />
                                  {l.name}
                                </button>
                              );
                            })}

                            {lockedProps.map((pr) => {
                              const active = panel.propIds.includes(pr.id);
                              return (
                                <button
                                  key={pr.id}
                                  type="button"
                                  onClick={() => togglePropOnPanel(panel.id, pr.id)}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors cursor-pointer ${
                                    active
                                      ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                                      : 'bg-[#0B0D10] border-[#262B36] text-zinc-400 hover:text-zinc-200'
                                  }`}
                                >
                                  <Package className="w-3 h-3" />
                                  {pr.name}
                                </button>
                              );
                            })}

                            {lockedCast.length === 0 &&
                              lockedLocations.length === 0 &&
                              lockedProps.length === 0 && (
                                <span className="text-xs text-zinc-500">
                                  Lock ingredients in Tiers 1–3 to attach them here.
                                </span>
                              )}
                          </div>
                        </div>

                        {/* Shot Specs Row */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <select
                            aria-label="Shot Size"
                            value={panel.shotSize}
                            onChange={(e) =>
                              updatePanel(panel.id, {
                                shotSize: e.target.value as ShotSize,
                              })
                            }
                            className="bg-[#0B0D10] border border-[#262B36] rounded-md px-2 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-amber-500"
                          >
                            {SHOT_SIZES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>

                          <select
                            aria-label="Camera Angle"
                            value={panel.cameraAngle}
                            onChange={(e) =>
                              updatePanel(panel.id, {
                                cameraAngle: e.target.value as CameraAngle,
                              })
                            }
                            className="bg-[#0B0D10] border border-[#262B36] rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                          >
                            {CAMERA_ANGLES.map((a) => (
                              <option key={a} value={a}>
                                {a}
                              </option>
                            ))}
                          </select>

                          <select
                            aria-label="Camera Movement"
                            value={panel.cameraMovement}
                            onChange={(e) =>
                              updatePanel(panel.id, {
                                cameraMovement: e.target.value as CameraMovement,
                              })
                            }
                            className="bg-[#0B0D10] border border-[#262B36] rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                          >
                            {CAMERA_MOVEMENTS.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>

                          <select
                            aria-label="Aspect Ratio"
                            value={panel.aspectRatio}
                            onChange={(e) =>
                              updatePanel(panel.id, {
                                aspectRatio: e.target.value as AspectRatioOption,
                              })
                            }
                            className="bg-[#0B0D10] border border-[#262B36] rounded-md px-2 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-amber-500"
                          >
                            {ASPECT_RATIOS.map((ar) => (
                              <option key={ar} value={ar}>
                                {ar}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Action / Blocking Prompt */}
                        <div className="space-y-1">
                          <label className="block text-[11px] font-medium text-zinc-400">
                            Action & Blocking Prompt
                          </label>
                          <textarea
                            rows={2}
                            value={panel.actionPrompt}
                            onChange={(e) =>
                              updatePanel(panel.id, { actionPrompt: e.target.value })
                            }
                            placeholder="Describe character blocking, focal plane, and action inside the frame..."
                            className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                          />
                        </div>

                        {/* Dialogue/Audio & Edit/Inpaint Note */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                              Dialogue / Audio Cue
                            </label>
                            <input
                              type="text"
                              value={panel.dialogueAudio}
                              onChange={(e) =>
                                updatePanel(panel.id, { dialogueAudio: e.target.value })
                              }
                              placeholder="VO / SFX / Ambient note"
                              className="w-full bg-[#0B0D10] border border-[#262B36] rounded-md px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                              Edit Prompt / Inpaint Note
                            </label>
                            <input
                              type="text"
                              value={panel.inpaintNote}
                              onChange={(e) =>
                                updatePanel(panel.id, { inpaintNote: e.target.value })
                              }
                              placeholder="e.g., Shift camera tighter on left forearm"
                              className="w-full bg-[#0B0D10] border border-[#262B36] rounded-md px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                            />
                          </div>
                        </div>

                        {/* Render Action Buttons */}
                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#262B36]">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => renderStoryboardFrame(panel, false)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            {panel.imageUrl ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5" />
                                Regenerate Frame
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3.5 h-3.5" />
                                Render Storyboard Frame
                              </>
                            )}
                          </button>

                          {panel.imageUrl && panel.inpaintNote.trim() && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => renderStoryboardFrame(panel, true)}
                              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-300 bg-amber-500/10 border border-amber-500/40 hover:bg-amber-500/20 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Wand2 className="w-3.5 h-3.5" />
                              Apply Inpaint Note
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Persistent Right Ingredient Drawer */}
      {drawerOpen && (
        <aside className="hidden xl:flex w-[300px] shrink-0 bg-[#0E1116] border-l border-[#262B36] flex-col">
          <div className="px-4 py-3.5 border-b border-[#262B36] bg-[#101318]">
            <div className="text-xs font-semibold text-zinc-100">
              Locked Ingredient Drawer
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              {activeTier === 'composer' && focusedPanel
                ? `Click to toggle on Shot ${focusedPanel.shotNumber}`
                : 'Approved People, Locations & Props'}
            </div>
          </div>

          <div className="p-4 space-y-5 overflow-y-auto flex-1">
            {/* Locked Cast */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-zinc-400">
                <span>Cast ({lockedCast.length})</span>
                <button
                  type="button"
                  onClick={() => setActiveTier('cast')}
                  className="text-[11px] text-amber-400 hover:underline cursor-pointer"
                >
                  Edit
                </button>
              </div>
              {lockedCast.length === 0 ? (
                <div className="text-xs text-zinc-600">No locked cast</div>
              ) : (
                <div className="space-y-2">
                  {lockedCast.map((c) => {
                    const bound =
                      activeTier === 'composer' &&
                      focusedPanel?.castIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          if (activeTier === 'composer' && focusedPanel) {
                            toggleCastOnPanel(focusedPanel.id, c.id);
                          } else {
                            setActiveTier('cast');
                          }
                        }}
                        className={`w-full flex items-center gap-2.5 p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                          bound
                            ? 'bg-amber-500/10 border-amber-500/50'
                            : 'bg-[#14171D] border-[#262B36] hover:border-zinc-500'
                        }`}
                      >
                        <div className="w-10 h-10 rounded bg-[#0B0D10] overflow-hidden shrink-0 flex items-center justify-center border border-[#262B36]">
                          {c.imageUrl ? (
                            <img
                              src={c.imageUrl}
                              alt={c.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <User className="w-4 h-4 text-zinc-600" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-zinc-200 truncate">
                            {c.name}
                          </div>
                          <div className="text-[11px] text-zinc-500 truncate">{c.role}</div>
                        </div>
                        {bound && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Locked Locations */}
            <div className="space-y-2 pt-3 border-t border-[#262B36]">
              <div className="flex items-center justify-between text-xs font-medium text-zinc-400">
                <span>Locations ({lockedLocations.length})</span>
                <button
                  type="button"
                  onClick={() => setActiveTier('location')}
                  className="text-[11px] text-amber-400 hover:underline cursor-pointer"
                >
                  Edit
                </button>
              </div>
              {lockedLocations.length === 0 ? (
                <div className="text-xs text-zinc-600">No locked locations</div>
              ) : (
                <div className="space-y-2">
                  {lockedLocations.map((l) => {
                    const bound =
                      activeTier === 'composer' &&
                      focusedPanel?.locationId === l.id;
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => {
                          if (activeTier === 'composer' && focusedPanel) {
                            toggleLocationOnPanel(focusedPanel.id, l.id);
                          } else {
                            setActiveTier('location');
                          }
                        }}
                        className={`w-full flex items-center gap-2.5 p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                          bound
                            ? 'bg-emerald-500/10 border-emerald-500/50'
                            : 'bg-[#14171D] border-[#262B36] hover:border-zinc-500'
                        }`}
                      >
                        <div className="w-12 h-9 rounded bg-[#0B0D10] overflow-hidden shrink-0 flex items-center justify-center border border-[#262B36]">
                          {l.imageUrl ? (
                            <img
                              src={l.imageUrl}
                              alt={l.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <MapPin className="w-4 h-4 text-zinc-600" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-zinc-200 truncate">
                            {l.name}
                          </div>
                          <div className="text-[11px] text-zinc-500 truncate">
                            {l.interiorExterior} · {l.timeOfDay}
                          </div>
                        </div>
                        {bound && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Locked Props */}
            <div className="space-y-2 pt-3 border-t border-[#262B36]">
              <div className="flex items-center justify-between text-xs font-medium text-zinc-400">
                <span>Hero Props ({lockedProps.length})</span>
                <button
                  type="button"
                  onClick={() => setActiveTier('prop')}
                  className="text-[11px] text-amber-400 hover:underline cursor-pointer"
                >
                  Edit
                </button>
              </div>
              {lockedProps.length === 0 ? (
                <div className="text-xs text-zinc-600">No locked props</div>
              ) : (
                <div className="space-y-2">
                  {lockedProps.map((pr) => {
                    const bound =
                      activeTier === 'composer' &&
                      focusedPanel?.propIds.includes(pr.id);
                    return (
                      <button
                        key={pr.id}
                        type="button"
                        onClick={() => {
                          if (activeTier === 'composer' && focusedPanel) {
                            togglePropOnPanel(focusedPanel.id, pr.id);
                          } else {
                            setActiveTier('prop');
                          }
                        }}
                        className={`w-full flex items-center gap-2.5 p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                          bound
                            ? 'bg-sky-500/10 border-sky-400/50'
                            : 'bg-[#14171D] border-[#262B36] hover:border-zinc-500'
                        }`}
                      >
                        <div className="w-10 h-10 rounded bg-[#0B0D10] overflow-hidden shrink-0 flex items-center justify-center border border-[#262B36]">
                          {pr.imageUrl ? (
                            <img
                              src={pr.imageUrl}
                              alt={pr.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Package className="w-4 h-4 text-zinc-600" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-zinc-200 truncate">
                            {pr.name}
                          </div>
                          <div className="text-[11px] text-zinc-500 truncate">
                            {pr.scale}
                          </div>
                        </div>
                        {bound && <Check className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
};
