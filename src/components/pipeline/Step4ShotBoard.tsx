import React, { useState } from 'react';
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Copy,
  Check,
  Upload,
  Printer,
  Package,
} from 'lucide-react';
import {
  PipelineProject,
  PipelineShot,
  ShotRoute,
  VideoModelOption,
} from '../../types/pipeline';
import { readAndOptimizeLocalImage } from '../../utils/imageUtils';

interface Step4ShotBoardProps {
  project: PipelineProject;
  onUpdateProject: (updated: PipelineProject) => Promise<void>;
  onGenerateShotList: () => Promise<void>;
  onApproveShotList: () => Promise<void>;
  onOpenPrintable: () => void;
}

export const Step4ShotBoard: React.FC<Step4ShotBoardProps> = ({
  project,
  onUpdateProject,
  onGenerateShotList,
  onApproveShotList,
  onOpenPrintable,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [uploadingShotId, setUploadingShotId] = useState<string | null>(null);

  const totalDuration = project.shots.reduce(
    (sum, s) => sum + (Number(s.durationSec) || 0),
    0
  );

  const commitShots = (nextShots: PipelineShot[]) => {
    const nextProject: PipelineProject = {
      ...project,
      shots: nextShots,
      shotListManuallyEdited: true,
      approvals: {
        ...project.approvals,
        shotListApproved: false,
        storyboardApproved: false,
        videoPromptsApproved: false,
        voApproved: false,
        shootPlanApproved: false,
      },
    };
    void onUpdateProject(nextProject);
  };

  const updateShot = (shotId: string, patch: Partial<PipelineShot>) => {
    const nextShots = project.shots.map((s) =>
      s.id === shotId ? { ...s, ...patch } : s
    );
    commitShots(nextShots);
  };

  const handleRouteChange = (shot: PipelineShot, nextRoute: ShotRoute) => {
    const nextModel: VideoModelOption =
      nextRoute === 'live'
        ? 'none'
        : shot.model === 'none'
          ? 'seedance'
          : shot.model;
    updateShot(shot.id, {
      route: nextRoute,
      model: nextModel,
      shootDirection:
        nextRoute === 'ai_video'
          ? ''
          : shot.shootDirection ||
            'Camera position, lens focal length, lighting setup, talent and product handling notes...',
    });
  };

  const addShot = () => {
    const nextNum = project.shots.length + 1;
    const newId = `S${String(nextNum).padStart(2, '0')}`;
    const newShot: PipelineShot = {
      id: newId,
      deliverable: project.creativeBrief.deliverables[0] || 'Hero Spot',
      durationSec: 4,
      scene: '',
      route: 'live',
      model: 'none',
      productInFrame: true,
      framePrompt: '',
      shootDirection: '',
      voLine: '',
      continuityNotes: '',
      chainFrom: 'none',
      frameImageUrl: null,
      frameCheck: null,
      productFrameApproved: false,
      videoPrompt: '',
      negativePrompt: '',
      videoUrl: null,
      videoSeed: null,
      status: 'Draft',
    };
    commitShots([...project.shots, newShot]);
  };

  const moveShot = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= project.shots.length) return;
    const copy = [...project.shots];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    commitShots(copy);
  };

  const deleteShot = (shotId: string) => {
    commitShots(project.shots.filter((s) => s.id !== shotId));
  };

  const handleUploadFrame = async (shotId: string, file: File) => {
    setErrorMsg(null);
    setUploadingShotId(shotId);
    try {
      const dataUrl = await readAndOptimizeLocalImage(file, 1400);
      const resp = await fetch(`/api/projects/${project.id}/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, prefix: 'frame' }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Could not upload frame.');

      updateShot(shotId, {
        frameImageUrl: data.url,
        status: 'Frame Uploaded',
        frameCheck: null,
        productFrameApproved: false,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Frame upload failed.');
    } finally {
      setUploadingShotId(null);
    }
  };

  const handleCopy = async (key: string, text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1800);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const triggerGenerate = async (force = false) => {
    if (project.shotListHasGenerated && project.shotListManuallyEdited && !force) {
      setConfirmOverwrite(true);
      return;
    }
    setConfirmOverwrite(false);
    setErrorMsg(null);
    setIsGenerating(true);
    try {
      await onGenerateShotList();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not generate Shot List.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-[1360px] mx-auto px-6 py-7 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-[#262B36]">
        <div>
          <div className="text-xs font-medium text-amber-400">
            Step 4 · Shot List & Shot Board
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 mt-1">
            Master Shot Board — Live Shoot, Hybrid & AI Together
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Every shot in sequence. Copy frame prompts into Google Flow, upload your frames
            directly onto any card, or insert custom live-action shots.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={isGenerating}
            onClick={() => void triggerGenerate(false)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-100 bg-[#14171D] border border-[#262B36] hover:border-amber-500 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
            ) : (
              <Sparkles className="w-4 h-4 text-amber-400" />
            )}
            {isGenerating
              ? 'Building Shot List...'
              : project.shotListHasGenerated
                ? 'Re-run shot list'
                : 'Generate shot list'}
          </button>

          <button
            type="button"
            onClick={addShot}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-100 bg-[#14171D] border border-[#262B36] hover:border-zinc-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add shot
          </button>

          {project.shots.length > 0 && (
            <button
              type="button"
              onClick={onOpenPrintable}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-100 bg-[#14171D] border border-[#262B36] hover:border-zinc-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Printable storyboard
            </button>
          )}

          {project.approvals.shotListApproved ? (
            <span className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-zinc-950 bg-emerald-400 rounded-lg whitespace-nowrap shrink-0">
              <CheckCircle2 className="w-4 h-4" />
              Shot list approved
            </span>
          ) : (
            <button
              type="button"
              disabled={project.shots.length === 0}
              onClick={() => void onApproveShotList()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Approve shot list
            </button>
          )}
        </div>
      </div>

      {/* Summary Bar */}
      {project.shots.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400 font-mono tabular-nums">
          <span>{project.shots.length} total shots</span>
          <span aria-hidden="true">·</span>
          <span>{totalDuration}s total runtime</span>
          <span aria-hidden="true">·</span>
          <span>
            {project.shots.filter((s) => s.route === 'live').length} live /{' '}
            {project.shots.filter((s) => s.route === 'hybrid').length} hybrid /{' '}
            {project.shots.filter((s) => s.route === 'ai_video').length} AI
          </span>
          <span aria-hidden="true">·</span>
          <span className="text-amber-300">
            {project.shots.filter((s) => s.productInFrame).length} with product in frame
          </span>
        </div>
      )}

      {confirmOverwrite && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-amber-200">
            You have manually edited shots in this Shot Board. Re-running Gemini will replace
            your current shots. Continue?
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setConfirmOverwrite(false)}
              className="px-3 py-1.5 text-xs font-medium text-zinc-200 bg-[#14171D] border border-[#262B36] rounded-lg cursor-pointer"
            >
              Keep my edits
            </button>
            <button
              type="button"
              onClick={() => void triggerGenerate(true)}
              className="px-3 py-1.5 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg cursor-pointer"
            >
              Replace & re-run
            </button>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/40 text-xs text-rose-300">
          {errorMsg}
        </div>
      )}

      {/* Shot Cards */}
      {project.shots.length === 0 ? (
        <div className="bg-[#14171D] border border-dashed border-[#262B36] rounded-xl p-12 text-center space-y-3">
          <Sparkles className="w-8 h-8 text-amber-400 mx-auto" />
          <div className="text-base font-semibold text-zinc-100">
            No shots on the board yet
          </div>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            Click &ldquo;Generate shot list&rdquo; to have Gemini plan an ordered mix of AI,
            hybrid, and live-action shots, or click &ldquo;Add shot&rdquo; to build manually.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {project.shots.map((shot, idx) => {
            const isUploading = uploadingShotId === shot.id;
            const showShootDirection = shot.route === 'live' || shot.route === 'hybrid';
            const earlierShots = project.shots.slice(0, idx);

            return (
              <div
                key={`${shot.id}-${idx}`}
                className="bg-[#14171D] border border-[#262B36] rounded-xl overflow-hidden"
              >
                {/* Shot Card Header */}
                <div className="px-5 py-3 bg-[#101318] border-b border-[#262B36] flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="text"
                      value={shot.id}
                      onChange={(e) => updateShot(shot.id, { id: e.target.value })}
                      aria-label="Shot number"
                      className="w-16 bg-[#0B0D10] border border-[#262B36] rounded px-2 py-1 text-xs font-mono font-bold text-amber-400 text-center focus:outline-none focus:border-amber-500"
                    />

                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-zinc-500">Duration:</span>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={shot.durationSec}
                        onChange={(e) =>
                          updateShot(shot.id, {
                            durationSec: Number(e.target.value) || 1,
                          })
                        }
                        className="w-14 bg-[#0B0D10] border border-[#262B36] rounded px-2 py-1 text-xs font-mono tabular-nums text-zinc-100 text-right focus:outline-none focus:border-amber-500"
                      />
                      <span className="text-zinc-500">sec</span>
                    </div>

                    <span className="text-xs text-zinc-400">
                      Status: <span className="text-zinc-200 font-medium">{shot.status}</span>
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        updateShot(shot.id, { productInFrame: !shot.productInFrame })
                      }
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                        shot.productInFrame
                          ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                          : 'bg-[#0B0D10] border-[#262B36] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Package className="w-3.5 h-3.5" />
                      {shot.productInFrame ? 'Product in frame' : 'No product in frame'}
                    </button>
                  </div>

                  {/* Order & Delete Controls */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveShot(idx, -1)}
                      title="Move shot up"
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-zinc-300 bg-[#0B0D10] border border-[#262B36] hover:border-zinc-500 disabled:opacity-30 rounded cursor-pointer"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                      Up
                    </button>
                    <button
                      type="button"
                      disabled={idx === project.shots.length - 1}
                      onClick={() => moveShot(idx, 1)}
                      title="Move shot down"
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-zinc-300 bg-[#0B0D10] border border-[#262B36] hover:border-zinc-500 disabled:opacity-30 rounded cursor-pointer"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                      Down
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteShot(shot.id)}
                      title="Remove shot"
                      className="p-1.5 text-zinc-500 hover:text-rose-400 rounded cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5 grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
                  {/* Left Column: Click-to-upload Frame Image + Route / Model */}
                  <div className="space-y-3">
                    <label className="block aspect-video bg-[#0B0D10] border border-dashed border-[#262B36] hover:border-amber-500/70 rounded-lg overflow-hidden relative flex items-center justify-center cursor-pointer transition-colors">
                      {shot.frameImageUrl ? (
                        <>
                          <img
                            src={shot.frameImageUrl}
                            alt={`Shot ${shot.id} frame`}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/55 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center text-xs font-medium text-white">
                            Click to replace frame
                          </div>
                        </>
                      ) : (
                        <div className="text-center p-4 space-y-1.5 text-zinc-500">
                          {isUploading ? (
                            <Loader2 className="w-5 h-5 animate-spin text-amber-400 mx-auto" />
                          ) : (
                            <Upload className="w-5 h-5 mx-auto" />
                          )}
                          <div className="text-xs font-medium text-zinc-300">
                            {isUploading
                              ? 'Uploading frame...'
                              : shot.route === 'live'
                                ? 'Upload crew reference frame'
                                : 'Upload Google Flow frame'}
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            Click to choose image
                          </div>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void handleUploadFrame(shot.id, file);
                          e.target.value = '';
                        }}
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] text-zinc-400 mb-1">
                          Route
                        </label>
                        <select
                          value={shot.route}
                          onChange={(e) =>
                            handleRouteChange(shot, e.target.value as ShotRoute)
                          }
                          className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-100 focus:outline-none focus:border-amber-500"
                        >
                          <option value="ai_video">AI video</option>
                          <option value="hybrid">Hybrid</option>
                          <option value="live">Live shoot</option>
                        </select>
                      </div>

                      {shot.route !== 'live' ? (
                        <div>
                          <label className="block text-[11px] text-zinc-400 mb-1">
                            Model
                          </label>
                          <select
                            value={shot.model}
                            onChange={(e) =>
                              updateShot(shot.id, {
                                model: e.target.value as VideoModelOption,
                              })
                            }
                            className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-100 focus:outline-none focus:border-amber-500"
                          >
                            <option value="flux3">Flux 3</option>
                            <option value="seedance">Seedance</option>
                            <option value="kling">Kling 4.0</option>
                            <option value="wan">Wan 3.0 Prime</option>
                            <option value="luma">Luma Ray 3.2</option>
                          </select>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-[11px] text-zinc-400 mb-1">
                            Deliverable
                          </label>
                          <input
                            type="text"
                            value={shot.deliverable}
                            onChange={(e) =>
                              updateShot(shot.id, { deliverable: e.target.value })
                            }
                            className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                          />
                        </div>
                      )}
                    </div>

                    {shot.route !== 'live' && (
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] text-zinc-400 mb-1">
                            Deliverable
                          </label>
                          <input
                            type="text"
                            value={shot.deliverable}
                            onChange={(e) =>
                              updateShot(shot.id, { deliverable: e.target.value })
                            }
                            className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-zinc-400 mb-1">
                            Chain from
                          </label>
                          <select
                            value={shot.chainFrom}
                            onChange={(e) =>
                              updateShot(shot.id, { chainFrom: e.target.value })
                            }
                            className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                          >
                            <option value="none">None</option>
                            {earlierShots.map((es) => (
                              <option key={es.id} value={es.id}>
                                {es.id}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Editable Plain-Text Fields */}
                  <div className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1">
                        What happens
                      </label>
                      <textarea
                        rows={2}
                        value={shot.scene}
                        onChange={(e) => updateShot(shot.id, { scene: e.target.value })}
                        placeholder="Describe the single clear action in plain English..."
                        className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    {showShootDirection && (
                      <div>
                        <label className="block text-xs font-medium text-emerald-300 mb-1">
                          Shoot direction (camera, lens, lighting, talent and product handling)
                        </label>
                        <textarea
                          rows={2}
                          value={shot.shootDirection}
                          onChange={(e) =>
                            updateShot(shot.id, { shootDirection: e.target.value })
                          }
                          placeholder="Camera placement, lens, lighting ratio, talent action, and how the product is held..."
                          className="w-full bg-[#0B0D10] border border-emerald-500/30 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-400"
                        />
                      </div>
                    )}

                    {/* Frame Prompt with Copy Button */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-zinc-300">
                          Frame prompt (paste into Google Flow)
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            void handleCopy(`frame-${shot.id}`, shot.framePrompt)
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-amber-300 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 rounded transition-colors cursor-pointer"
                        >
                          {copiedKey === `frame-${shot.id}` ? (
                            <>
                              <Check className="w-3 h-3" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              Copy
                            </>
                          )}
                        </button>
                      </div>
                      <textarea
                        rows={3}
                        value={shot.framePrompt}
                        onChange={(e) =>
                          updateShot(shot.id, { framePrompt: e.target.value })
                        }
                        placeholder="Still image prompt with fixed character descriptors and [PRODUCT PLACEHOLDER: composite real product here]..."
                        className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 leading-relaxed"
                      />
                    </div>

                    {/* Video Prompt with Copy Button */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-zinc-300">
                          Video prompt
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            void handleCopy(`video-${shot.id}`, shot.videoPrompt)
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-zinc-200 bg-[#0B0D10] border border-[#262B36] hover:border-zinc-500 rounded transition-colors cursor-pointer"
                        >
                          {copiedKey === `video-${shot.id}` ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              Copy
                            </>
                          )}
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        value={shot.videoPrompt}
                        onChange={(e) =>
                          updateShot(shot.id, { videoPrompt: e.target.value })
                        }
                        placeholder="Motion, camera, and timing prompt (auto-generated in Phase 2 or enter notes now)..."
                        className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    {/* VO Line & Continuity */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-zinc-300 mb-1">
                          VO line
                        </label>
                        <input
                          type="text"
                          value={shot.voLine}
                          onChange={(e) =>
                            updateShot(shot.id, { voLine: e.target.value })
                          }
                          placeholder="Spoken voiceover line (or leave empty)..."
                          className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-zinc-300 mb-1">
                          Continuity notes
                        </label>
                        <input
                          type="text"
                          value={shot.continuityNotes}
                          onChange={(e) =>
                            updateShot(shot.id, { continuityNotes: e.target.value })
                          }
                          placeholder="Light direction, wardrobe, eye-line notes..."
                          className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
