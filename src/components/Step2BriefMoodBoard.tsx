import React, { useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  Upload,
  Link as LinkIcon,
  ArrowRight,
  Image as ImageIcon,
} from 'lucide-react';
import {
  AspectRatioOption,
  BrandProject,
  CreativeBrief,
  MoodBoardTag,
  MoodBoardTile,
} from '../types/studio';
import { readAndOptimizeLocalImage } from '../utils/imageUtils';

interface Step2BriefMoodBoardProps {
  project: BrandProject;
  onUpdateProject: (updated: BrandProject) => void;
  onNavigateStep: (step: 'step-3') => void;
}

const ASPECT_OPTIONS: AspectRatioOption[] = ['16:9', '9:16', '4:5', '1:1'];
const MOOD_TAGS: MoodBoardTag[] = ['Lighting', 'Framing', 'Wardrobe', 'Color', 'Location'];

export const Step2BriefMoodBoard: React.FC<Step2BriefMoodBoardProps> = ({
  project,
  onUpdateProject,
  onNavigateStep,
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [newTileTag, setNewTileTag] = useState<MoodBoardTag>('Lighting');
  const [tagFilter, setTagFilter] = useState<MoodBoardTag | 'All'>('All');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateBrief = (patch: Partial<CreativeBrief>) => {
    onUpdateProject({
      ...project,
      brief: { ...project.brief, ...patch },
      updatedAt: new Date().toISOString(),
    });
  };

  const toggleAspectRatio = (ratio: AspectRatioOption) => {
    const exists = project.brief.deliverablesAspectRatios.includes(ratio);
    const next = exists
      ? project.brief.deliverablesAspectRatios.filter((r) => r !== ratio)
      : [...project.brief.deliverablesAspectRatios, ratio];
    updateBrief({ deliverablesAspectRatios: next });
  };

  const addSwatch = () => {
    updateBrief({
      colorPalette: [
        ...project.brief.colorPalette,
        { id: `sw-${Date.now()}`, name: 'New Accent', hex: '#F59E0B' },
      ],
    });
  };

  const updateSwatch = (id: string, field: 'name' | 'hex', value: string) => {
    updateBrief({
      colorPalette: project.brief.colorPalette.map((sw) =>
        sw.id === id ? { ...sw, [field]: value } : sw
      ),
    });
  };

  const removeSwatch = (id: string) => {
    updateBrief({
      colorPalette: project.brief.colorPalette.filter((sw) => sw.id !== id),
    });
  };

  const handleLocalFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      const addedTiles: MoodBoardTile[] = [];
      for (let i = 0; i < files.length; i++) {
        const dataUrl = await readAndOptimizeLocalImage(files[i]);
        addedTiles.push({
          id: `mb-${Date.now()}-${i}`,
          imageUrl: dataUrl,
          tag: newTileTag,
          directorNote: '',
        });
      }
      onUpdateProject({
        ...project,
        moodBoard: [...addedTiles, ...project.moodBoard],
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not load image file.');
    } finally {
      e.target.value = '';
    }
  };

  const handleAddUrlTile = () => {
    if (!urlInput.trim()) return;
    const newTile: MoodBoardTile = {
      id: `mb-${Date.now()}`,
      imageUrl: urlInput.trim(),
      tag: newTileTag,
      directorNote: '',
    };
    onUpdateProject({
      ...project,
      moodBoard: [newTile, ...project.moodBoard],
      updatedAt: new Date().toISOString(),
    });
    setUrlInput('');
  };

  const updateTile = (id: string, patch: Partial<MoodBoardTile>) => {
    onUpdateProject({
      ...project,
      moodBoard: project.moodBoard.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      updatedAt: new Date().toISOString(),
    });
  };

  const removeTile = (id: string) => {
    onUpdateProject({
      ...project,
      moodBoard: project.moodBoard.filter((t) => t.id !== id),
      updatedAt: new Date().toISOString(),
    });
  };

  const visibleTiles =
    tagFilter === 'All'
      ? project.moodBoard
      : project.moodBoard.filter((t) => t.tag === tagFilter);

  return (
    <div className="max-w-[1360px] mx-auto px-6 py-7 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-[#262B36]">
        <div>
          <div className="text-xs font-medium text-amber-400">
            Step 02 · Executive Creative Brief & Mood Board
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 mt-1">
            Creative Brief, Palette & Visual References
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Refine strategic messaging, lock deliverables and color swatches, and curate reference
            frames before brainstorming concepts.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigateStep('step-3')}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Proceed to Ideation
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Structured Creative Brief Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-100">
            Structured Creative Brief
          </h2>
          <span className="text-xs text-zinc-500">All fields editable inline</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-[#14171D] border border-[#262B36] rounded-xl p-5 space-y-2">
            <label className="block text-xs font-medium text-zinc-300">
              Objective & KPIs
            </label>
            <textarea
              rows={3}
              value={project.brief.objectiveAndKpis}
              onChange={(e) => updateBrief({ objectiveAndKpis: e.target.value })}
              placeholder="Primary campaign goal, conversion targets, investor/launch milestones..."
              className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="bg-[#14171D] border border-[#262B36] rounded-xl p-5 space-y-2">
            <label className="block text-xs font-medium text-zinc-300">
              Target Audience Persona
            </label>
            <textarea
              rows={3}
              value={project.brief.targetAudiencePersona}
              onChange={(e) => updateBrief({ targetAudiencePersona: e.target.value })}
              placeholder="Demographics, mindset, frustrations, and buying triggers..."
              className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="bg-[#14171D] border border-[#262B36] rounded-xl p-5 space-y-2">
            <label className="block text-xs font-medium text-zinc-300">
              Core Hook / Message
            </label>
            <textarea
              rows={3}
              value={project.brief.coreHookMessage}
              onChange={(e) => updateBrief({ coreHookMessage: e.target.value })}
              placeholder="The unforgettable central thesis of the launch film..."
              className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="bg-[#14171D] border border-[#262B36] rounded-xl p-5 space-y-2">
            <label className="block text-xs font-medium text-zinc-300">
              Tone & Pacing
            </label>
            <textarea
              rows={3}
              value={project.brief.toneAndPacing}
              onChange={(e) => updateBrief({ toneAndPacing: e.target.value })}
              placeholder="Editorial rhythm, emotional arc, sound & voice cadence..."
              className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Visual Style & Interactive Hex Palette */}
          <div className="bg-[#14171D] border border-[#262B36] rounded-xl p-5 space-y-4">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-zinc-300">
                Visual Style Notes
              </label>
              <textarea
                rows={2}
                value={project.brief.visualStyleNotes}
                onChange={(e) => updateBrief({ visualStyleNotes: e.target.value })}
                placeholder="Lens choices, natural vs stylized lighting, texture..."
                className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="space-y-2.5 pt-1 border-t border-[#262B36]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-300">
                  Color Palette Swatches
                </span>
                <button
                  type="button"
                  onClick={addSwatch}
                  className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 hover:text-amber-300 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Swatch
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {project.brief.colorPalette.map((sw) => (
                  <div
                    key={sw.id}
                    className="flex items-center gap-2 bg-[#0B0D10] border border-[#262B36] rounded-lg px-2.5 py-1.5"
                  >
                    <input
                      type="color"
                      aria-label={`Pick color for ${sw.name}`}
                      value={sw.hex}
                      onChange={(e) => updateSwatch(sw.id, 'hex', e.target.value)}
                      className="w-7 h-7 rounded bg-transparent border-0 cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      value={sw.name}
                      onChange={(e) => updateSwatch(sw.id, 'name', e.target.value)}
                      className="flex-1 min-w-0 bg-transparent text-xs text-zinc-200 focus:outline-none"
                    />
                    <span className="text-[11px] font-mono text-zinc-500 uppercase">
                      {sw.hex}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeSwatch(sw.id)}
                      className="p-1 text-zinc-500 hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Deliverables / Aspect Ratios & Mandatories */}
          <div className="bg-[#14171D] border border-[#262B36] rounded-xl p-5 space-y-4">
            <div className="space-y-2">
              <span className="block text-xs font-medium text-zinc-300">
                Deliverables & Aspect Ratios
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {ASPECT_OPTIONS.map((ratio) => {
                  const active = project.brief.deliverablesAspectRatios.includes(ratio);
                  return (
                    <button
                      key={ratio}
                      type="button"
                      onClick={() => toggleAspectRatio(ratio)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                          : 'bg-[#0B0D10] border-[#262B36] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {ratio}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 pt-1 border-t border-[#262B36]">
              <label className="block text-xs font-medium text-zinc-300">
                Mandatories & Brand Guardrails
              </label>
              <textarea
                rows={3}
                value={project.brief.mandatories}
                onChange={(e) => updateBrief({ mandatories: e.target.value })}
                placeholder="Logo lockups, legal disclaimers, hero product angles, required CTAs..."
                className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Mood Board Canvas */}
      <section className="space-y-4 pt-2 border-t border-[#262B36]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Mood Board Canvas</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Upload local visual references or paste image URLs and tag them by department.
            </p>
          </div>

          {/* Add Reference Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Default tag for new mood board tiles"
              value={newTileTag}
              onChange={(e) => setNewTileTag(e.target.value as MoodBoardTag)}
              className="bg-[#14171D] border border-[#262B36] rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
            >
              {MOOD_TAGS.map((tag) => (
                <option key={tag} value={tag}>
                  Tag: {tag}
                </option>
              ))}
            </select>

            <div className="flex items-center bg-[#14171D] border border-[#262B36] rounded-lg overflow-hidden">
              <input
                type="url"
                placeholder="Paste image URL..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddUrlTile()}
                className="bg-transparent px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none w-48 sm:w-60"
              />
              <button
                type="button"
                onClick={handleAddUrlTile}
                className="px-3 py-1.5 text-xs font-medium text-zinc-200 bg-[#1B2029] hover:bg-zinc-800 border-l border-[#262B36] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <LinkIcon className="w-3.5 h-3.5 inline mr-1" />
                Add URL
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleLocalFileUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Image
            </button>
          </div>
        </div>

        {uploadError && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/40 text-xs text-rose-300">
            {uploadError}
          </div>
        )}

        {/* Filter Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {(['All', ...MOOD_TAGS] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTagFilter(t)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                tagFilter === t
                  ? 'bg-[#1F2530] text-amber-300 border border-amber-500/40'
                  : 'bg-[#14171D] text-zinc-400 border border-[#262B36] hover:text-zinc-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {visibleTiles.length === 0 ? (
          <div className="bg-[#14171D] border border-dashed border-[#262B36] rounded-xl p-10 flex flex-col items-center justify-center text-center space-y-3">
            <ImageIcon className="w-7 h-7 text-zinc-600" />
            <div className="text-sm font-medium text-zinc-300">
              No visual references in this view yet
            </div>
            <p className="text-xs text-zinc-500 max-w-md">
              Upload local location scouting photos, lighting frames, or wardrobe references to
              anchor visual direction for Step 4.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {visibleTiles.map((tile) => (
              <div
                key={tile.id}
                className="bg-[#14171D] border border-[#262B36] rounded-xl overflow-hidden flex flex-col"
              >
                <div className="aspect-video bg-[#0B0D10] relative overflow-hidden">
                  <img
                    src={tile.imageUrl}
                    alt={`${tile.tag} reference`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-4 space-y-2.5 flex-1 flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-2">
                    <select
                      value={tile.tag}
                      onChange={(e) =>
                        updateTile(tile.id, { tag: e.target.value as MoodBoardTag })
                      }
                      className="bg-[#0B0D10] border border-[#262B36] rounded-md px-2.5 py-1 text-xs font-medium text-amber-300 focus:outline-none focus:border-amber-500"
                    >
                      {MOOD_TAGS.map((tag) => (
                        <option key={tag} value={tag}>
                          {tag}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeTile(tile.id)}
                      className="p-1 text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <textarea
                    rows={2}
                    placeholder="Add director note (lens, lighting ratio, texture)..."
                    value={tile.directorNote}
                    onChange={(e) => updateTile(tile.id, { directorNote: e.target.value })}
                    className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
