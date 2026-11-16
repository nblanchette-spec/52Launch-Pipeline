import React, { useState } from 'react';
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Upload,
  Package,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { PipelineProject, PipelineShot } from '../../types/pipeline';
import { readAndOptimizeLocalImage } from '../../utils/imageUtils';

interface Step6FrameCheckProps {
  project: PipelineProject;
  onUpdateProject: (updated: PipelineProject) => Promise<void>;
  onRunFrameCheck: (shotId: string) => Promise<void>;
  onApproveStoryboard: () => Promise<void>;
  onGoToVideoStep: () => void;
}

export const Step6FrameCheck: React.FC<Step6FrameCheckProps> = ({
  project,
  onUpdateProject,
  onRunFrameCheck,
  onApproveStoryboard,
  onGoToVideoStep,
}) => {
  const [checkingShotId, setCheckingShotId] = useState<string | null>(null);
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [uploadingShotId, setUploadingShotId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const aiHybridShots = project.shots.filter((s) => s.route !== 'live');
  const uploadedAiCount = aiHybridShots.filter((s) => Boolean(s.frameImageUrl)).length;
  const productShots = project.shots.filter((s) => s.productInFrame);
  const checkedProductShots = productShots.filter((s) => s.productFrameApproved);

  const handleCheckSingle = async (shotId: string) => {
    setErrorMsg(null);
    setCheckingShotId(shotId);
    try {
      await onRunFrameCheck(shotId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Frame Check failed.');
    } finally {
      setCheckingShotId(null);
    }
  };

  const handleCheckAllUploaded = async () => {
    const candidates = project.shots.filter((s) => Boolean(s.frameImageUrl));
    if (candidates.length === 0) {
      setErrorMsg('Upload at least one frame before running Frame Check.');
      return;
    }
    setErrorMsg(null);
    setIsCheckingAll(true);
    try {
      for (const shot of candidates) {
        setCheckingShotId(shot.id);
        await onRunFrameCheck(shot.id);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Batch Frame Check stopped.');
    } finally {
      setCheckingShotId(null);
      setIsCheckingAll(false);
    }
  };

  const handleReplaceFrame = async (shotId: string, file: File) => {
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
      if (!resp.ok) throw new Error(data.error || 'Could not upload replacement frame.');

      const nextShots: PipelineShot[] = project.shots.map((s) =>
        s.id === shotId
          ? {
              ...s,
              frameImageUrl: data.url,
              status: 'Frame Uploaded',
              frameCheck: null,
              productFrameApproved: false,
            }
          : s
      );
      await onUpdateProject({
        ...project,
        shots: nextShots,
        approvals: {
          ...project.approvals,
          storyboardApproved: false,
          videoPromptsApproved: false,
          voApproved: false,
          shootPlanApproved: false,
        },
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploadingShotId(null);
    }
  };

  const toggleProductApproval = (shot: PipelineShot) => {
    const nextVal = !shot.productFrameApproved;
    const nextShots = project.shots.map((s) =>
      s.id === shot.id ? { ...s, productFrameApproved: nextVal } : s
    );
    void onUpdateProject({
      ...project,
      shots: nextShots,
      approvals: {
        ...project.approvals,
        storyboardApproved: nextVal ? project.approvals.storyboardApproved : false,
        videoPromptsApproved: nextVal ? project.approvals.videoPromptsApproved : false,
        voApproved: nextVal ? project.approvals.voApproved : false,
        shootPlanApproved: nextVal ? project.approvals.shootPlanApproved : false,
      },
    });
  };

  const applyImprovedPrompt = (shotId: string, improved: string) => {
    const nextShots = project.shots.map((s) =>
      s.id === shotId ? { ...s, framePrompt: improved } : s
    );
    void onUpdateProject({
      ...project,
      shots: nextShots,
    });
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((p) => (p === id ? null : p)), 1800);
    } catch {
      // Ignore
    }
  };

  return (
    <div className="max-w-[1320px] mx-auto px-6 py-7 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-[#262B36]">
        <div>
          <div className="text-xs font-medium text-amber-400">
            Step 6 · Optional AI Frame Suggestions
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 mt-1">
            AI Frame Review & Suggestions (Optional)
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Need a second set of eyes? Gemini can review uploaded frames against your Brand
            Bible and product photos and suggest prompt tweaks — or skip straight to Video
            anytime.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={isCheckingAll || Boolean(checkingShotId)}
            onClick={() => void handleCheckAllUploaded()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-zinc-100 bg-[#14171D] border border-[#262B36] hover:border-amber-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isCheckingAll ? (
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
            ) : (
              <Sparkles className="w-4 h-4 text-amber-400" />
            )}
            {isCheckingAll ? `Reviewing ${checkingShotId}...` : 'Get AI suggestions for all'}
          </button>

          {project.approvals.storyboardApproved ? (
            <button
              type="button"
              onClick={onGoToVideoStep}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Continue to Video Step
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void onApproveStoryboard()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" />
              Bypass & continue to Video
            </button>
          )}
        </div>
      </div>

      {/* Advisory Info Strip */}
      <div className="p-3.5 rounded-xl border border-[#262B36] bg-[#14171D] text-xs text-zinc-300 flex flex-wrap items-center justify-between gap-3">
        <span>
          Suggestions here never block your workflow — continue to Video Prompts & Rendering
          whenever you are happy with your frames.
        </span>
        <div className="text-zinc-400 font-mono tabular-nums flex items-center gap-4">
          <span>
            AI/hybrid frames uploaded: <strong className="text-zinc-200">{uploadedAiCount}/{aiHybridShots.length}</strong>
          </span>
          {productShots.length > 0 && (
            <span>
              Product frames marked ready: <strong className="text-zinc-200">{checkedProductShots.length}/{productShots.length}</strong>
            </span>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/40 text-xs text-rose-300">
          {errorMsg}
        </div>
      )}

      {/* Shot QC Cards */}
      <div className="space-y-5">
        {project.shots.map((shot) => {
          const isChecking = checkingShotId === shot.id;
          const isUploading = uploadingShotId === shot.id;
          const fc = shot.frameCheck;

          return (
            <div
              key={shot.id}
              className="bg-[#14171D] border border-[#262B36] rounded-xl overflow-hidden"
            >
              <div className="px-5 py-3 bg-[#101318] border-b border-[#262B36] flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono font-bold text-amber-400 text-sm">
                    {shot.id}
                  </span>
                  <span className="text-zinc-300 font-medium">
                    {shot.route === 'live'
                      ? 'Live shoot'
                      : shot.route === 'hybrid'
                        ? 'Hybrid'
                        : 'AI video'}
                  </span>
                  {shot.productInFrame && (
                    <span className="inline-flex items-center gap-1 text-amber-300 font-semibold">
                      <Package className="w-3.5 h-3.5" />
                      Product in frame
                    </span>
                  )}
                  {fc && (
                    <span
                      className={`inline-flex items-center gap-1 font-medium ${
                        fc.passed ? 'text-emerald-400' : 'text-amber-300'
                      }`}
                    >
                      {fc.passed ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Looks solid
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          Has AI suggestions
                        </>
                      )}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {shot.productInFrame && (
                    <button
                      type="button"
                      disabled={!shot.frameImageUrl}
                      onClick={() => toggleProductApproval(shot)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer disabled:opacity-40 ${
                        shot.productFrameApproved
                          ? 'bg-emerald-500 text-zinc-950 border-emerald-400'
                          : 'bg-[#0B0D10] text-zinc-300 border-[#262B36] hover:border-amber-500'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {shot.productFrameApproved
                        ? 'Product checked'
                        : 'Mark product checked'}
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={!shot.frameImageUrl || isChecking || isCheckingAll}
                    onClick={() => void handleCheckSingle(shot.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-100 bg-[#0B0D10] border border-[#262B36] hover:border-amber-500 disabled:opacity-40 rounded-lg transition-colors cursor-pointer"
                  >
                    {isChecking ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    )}
                    {isChecking ? 'Reviewing...' : 'Get AI suggestions'}
                  </button>
                </div>
              </div>

              <div className="p-5 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
                {/* Left: Uploaded Frame + Real Product Reference */}
                <div className="space-y-3">
                  <label className="block aspect-video bg-[#0B0D10] border border-dashed border-[#262B36] hover:border-amber-500 rounded-lg overflow-hidden relative flex items-center justify-center cursor-pointer">
                    {shot.frameImageUrl ? (
                      <>
                        <img
                          src={shot.frameImageUrl}
                          alt={`Shot ${shot.id} uploaded frame`}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/55 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center text-xs font-medium text-white">
                          Click to upload replacement frame
                        </div>
                      </>
                    ) : (
                      <div className="text-center p-4 text-zinc-500 space-y-1">
                        {isUploading ? (
                          <Loader2 className="w-5 h-5 animate-spin text-amber-400 mx-auto" />
                        ) : (
                          <Upload className="w-5 h-5 mx-auto" />
                        )}
                        <div className="text-xs text-zinc-300">
                          {shot.route === 'live'
                            ? 'No reference frame uploaded (optional for live)'
                            : 'Click to upload frame for QC'}
                        </div>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleReplaceFrame(shot.id, f);
                        e.target.value = '';
                      }}
                    />
                  </label>

                  {shot.productInFrame && project.product.photos.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-zinc-400">
                        Comparing against real product photos:
                      </div>
                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        {project.product.photos.map((photo) => (
                          <img
                            key={photo.id}
                            src={photo.url}
                            alt={photo.caption || 'Real product'}
                            referrerPolicy="no-referrer"
                            className="w-16 h-16 rounded border border-[#262B36] bg-[#0B0D10] object-contain shrink-0"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Scores, Problems, Product Differences, Improved Prompt */}
                <div className="space-y-4">
                  <div className="text-xs text-zinc-300">
                    <span className="text-zinc-500 font-medium">Shot description: </span>
                    {shot.scene}
                  </div>

                  {!fc ? (
                    <div className="p-4 rounded-lg bg-[#0B0D10] border border-[#262B36] text-xs text-zinc-400">
                      {shot.frameImageUrl
                        ? 'Optional: click "Get AI suggestions" for notes on character match, style, composition, and product details — or skip straight to Video.'
                        : shot.route === 'live'
                          ? 'Live shoot shot — crew reference frame is optional.'
                          : 'Upload a frame from Google Flow if you want optional AI suggestions.'}
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      {/* 0-5 Advisory Reference Scores */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                        {[
                          { label: 'Character match', score: fc.scores.characterMatch, min: 3 },
                          { label: 'Style match', score: fc.scores.styleMatch, min: 3 },
                          { label: 'Composition', score: fc.scores.compositionMatch, min: 3 },
                          { label: 'Clean (artifacts)', score: fc.scores.artifacts, min: 3 },
                          ...(shot.productInFrame
                            ? [
                                {
                                  label: 'Product fidelity',
                                  score: fc.scores.productFidelity ?? 0,
                                  min: 4,
                                },
                              ]
                            : []),
                        ].map((item) => {
                          const ok = item.score >= item.min;
                          return (
                            <div
                              key={item.label}
                              className="p-2.5 rounded-lg border border-[#262B36] bg-[#0B0D10]"
                            >
                              <div className="text-[11px] text-zinc-400">{item.label}</div>
                              <div
                                className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${
                                  ok ? 'text-emerald-400' : 'text-amber-300'
                                }`}
                              >
                                {item.score}/5
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Advisory Notes */}
                      {fc.problems.length > 0 && (
                        <div className="p-3.5 rounded-lg bg-[#0B0D10] border border-[#262B36] space-y-1.5">
                          <div className="text-xs font-semibold text-zinc-200">
                            AI suggestions & notes
                          </div>
                          <ul className="list-disc pl-4 space-y-1 text-xs text-zinc-300">
                            {fc.problems.map((prob, i) => (
                              <li key={i}>{prob}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Product Differences */}
                      {shot.productInFrame && fc.productDifferences.length > 0 && (
                        <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-1.5">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Product comparison vs. real photos
                          </div>
                          <ul className="list-disc pl-4 space-y-1 text-xs text-amber-100/90">
                            {fc.productDifferences.map((diff, i) => (
                              <li key={i}>{diff}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Optional Improved Frame Prompt */}
                      {fc.improvedFramePrompt && (
                        <div className="p-3.5 rounded-lg bg-[#0B0D10] border border-[#262B36] space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-amber-300">
                              Improved frame prompt (paste back into Google Flow)
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  void handleCopy(shot.id, fc.improvedFramePrompt)
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-zinc-200 bg-[#14171D] border border-[#262B36] hover:border-zinc-500 rounded cursor-pointer"
                              >
                                {copiedId === shot.id ? (
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
                              <button
                                type="button"
                                onClick={() =>
                                  applyImprovedPrompt(shot.id, fc.improvedFramePrompt)
                                }
                                className="px-2.5 py-1 text-[11px] font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded cursor-pointer"
                              >
                                Save to shot prompt
                              </button>
                            </div>
                          </div>
                          <p className="text-xs text-zinc-300 leading-relaxed">
                            {fc.improvedFramePrompt}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
