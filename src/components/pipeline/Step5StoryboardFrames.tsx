import React, { useState } from 'react';
import {
  Upload,
  Copy,
  Check,
  Loader2,
  ArrowRight,
  Package,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { PipelineProject, PipelineShot } from '../../types/pipeline';
import { readAndOptimizeLocalImage } from '../../utils/imageUtils';

interface Step5StoryboardFramesProps {
  project: PipelineProject;
  onUpdateProject: (updated: PipelineProject) => Promise<void>;
  onGoToFrameSuggestions: () => void;
  onApproveAndGoToVideo: () => Promise<void>;
}

export const Step5StoryboardFrames: React.FC<Step5StoryboardFramesProps> = ({
  project,
  onUpdateProject,
  onGoToFrameSuggestions,
  onApproveAndGoToVideo,
}) => {
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const aiHybridShots = project.shots.filter((s) => s.route !== 'live');
  const uploadedAiHybridCount = aiHybridShots.filter((s) =>
    Boolean(s.frameImageUrl)
  ).length;
  const totalUploadedCount = project.shots.filter((s) =>
    Boolean(s.frameImageUrl)
  ).length;

  const updateShot = (shotId: string, patch: Partial<PipelineShot>) => {
    const nextShots = project.shots.map((s) =>
      s.id === shotId ? { ...s, ...patch } : s
    );
    void onUpdateProject({
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
  };

  const handleUploadFrame = async (shotId: string, file: File) => {
    setErrorMsg(null);
    setUploadingId(shotId);
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
      setUploadingId(null);
    }
  };

  const handleCopyPrompt = async (shotId: string, text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(shotId);
      setTimeout(() => setCopiedId((prev) => (prev === shotId ? null : prev)), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-7 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-[#262B36]">
        <div>
          <div className="text-xs font-medium text-amber-400">
            Step 5 · Storyboard Frames (Google Flow & Crew References)
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 mt-1">
            Copy Prompts into Google Flow & Upload Frames
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Copy each frame prompt into Google Flow, then click the image area on the card to
            upload your frame. Live-shoot shots can also hold a reference frame for the crew.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onGoToFrameSuggestions}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-200 bg-[#14171D] border border-[#262B36] hover:border-zinc-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Optional AI frame suggestions
          </button>

          <button
            type="button"
            onClick={() => void onApproveAndGoToVideo()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Approve frames & continue to Video
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Upload Readiness Summary */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400 font-mono tabular-nums">
        <span>
          Total frames uploaded: <span className="text-zinc-100">{totalUploadedCount}/{project.shots.length}</span>
        </span>
        <span aria-hidden="true">·</span>
        <span>
          AI & hybrid frames ready for QC:{' '}
          <span
            className={
              uploadedAiHybridCount === aiHybridShots.length
                ? 'text-emerald-400'
                : 'text-amber-300'
            }
          >
            {uploadedAiHybridCount}/{aiHybridShots.length}
          </span>
        </span>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/40 text-xs text-rose-300">
          {errorMsg}
        </div>
      )}

      {/* Ordered Shot Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {project.shots.map((shot) => {
          const isUploading = uploadingId === shot.id;
          const routeLabel =
            shot.route === 'live'
              ? 'Live shoot'
              : shot.route === 'hybrid'
                ? 'Hybrid'
                : 'AI video';

          return (
            <div
              key={shot.id}
              className="bg-[#14171D] border border-[#262B36] rounded-xl overflow-hidden flex flex-col"
            >
              {/* Card Header */}
              <div className="px-4 py-3 bg-[#101318] border-b border-[#262B36] flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono font-bold text-amber-400">{shot.id}</span>
                  <span className="text-zinc-300 font-medium">{routeLabel}</span>
                  <span className="text-zinc-600">·</span>
                  <span className="font-mono text-zinc-400 tabular-nums">
                    {shot.durationSec}s
                  </span>
                  {shot.productInFrame && (
                    <>
                      <span className="text-zinc-600">·</span>
                      <span className="inline-flex items-center gap-1 text-amber-300 font-medium">
                        <Package className="w-3.5 h-3.5" />
                        Product in frame
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {shot.frameCheck?.passed ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Passed
                    </span>
                  ) : shot.frameCheck && !shot.frameCheck.passed ? (
                    <span className="inline-flex items-center gap-1 text-rose-400 font-medium">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Needs Fix
                    </span>
                  ) : shot.frameImageUrl ? (
                    <span className="text-zinc-300">Uploaded</span>
                  ) : (
                    <span className="text-zinc-500">Waiting for frame</span>
                  )}
                </div>
              </div>

              {/* Click-to-upload Frame Area */}
              <label className="block aspect-video bg-[#0B0D10] border-b border-[#262B36] relative flex items-center justify-center cursor-pointer hover:bg-[#0E1217] transition-colors overflow-hidden">
                {shot.frameImageUrl ? (
                  <>
                    <img
                      src={shot.frameImageUrl}
                      alt={`Shot ${shot.id} frame`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/55 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center text-xs font-semibold text-white">
                      Click to replace frame image
                    </div>
                  </>
                ) : (
                  <div className="text-center p-6 space-y-2 text-zinc-500">
                    {isUploading ? (
                      <Loader2 className="w-6 h-6 animate-spin text-amber-400 mx-auto" />
                    ) : (
                      <Upload className="w-6 h-6 mx-auto text-zinc-400" />
                    )}
                    <div className="text-xs font-semibold text-zinc-200">
                      {isUploading
                        ? 'Saving frame...'
                        : shot.route === 'live'
                          ? 'Click to upload crew reference frame (optional)'
                          : 'Click to upload frame from Google Flow'}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      No file naming needed — click anywhere in this box
                    </div>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUploadFrame(shot.id, f);
                    e.target.value = '';
                  }}
                />
              </label>

              {/* Scene & Copyable Frame Prompt */}
              <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                <div className="text-xs text-zinc-300 leading-relaxed">
                  <span className="text-zinc-500 font-medium">Scene: </span>
                  {shot.scene}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-400">
                      Frame prompt
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCopyPrompt(shot.id, shot.framePrompt)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 rounded-md transition-colors cursor-pointer"
                    >
                      {copiedId === shot.id ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>

                  <textarea
                    rows={3}
                    value={shot.framePrompt}
                    onChange={(e) => updateShot(shot.id, { framePrompt: e.target.value })}
                    className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-500 leading-relaxed"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
