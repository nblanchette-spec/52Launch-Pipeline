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
  FolderSync,
  ClipboardPaste,
} from 'lucide-react';
import { PipelineProject, PipelineShot } from '../../types/pipeline';
import { readAndOptimizeLocalImage } from '../../utils/imageUtils';
import { ImportedDriveAsset } from '../../utils/googleDriveSync';
import { DriveAssetPickerModal } from './DriveAssetPickerModal';

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
  const [drivePickerShotId, setDrivePickerShotId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pasteHintShotId, setPasteHintShotId] = useState<string | null>(null);
  const frameInputRefs = React.useRef<Record<string, HTMLInputElement | null>>({});
  const frameBoxRefs = React.useRef<Record<string, HTMLDivElement | null>>({});

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

  const extractClipboardImageFile = (clipboardData: DataTransfer | null): File | null => {
    if (!clipboardData) return null;
    const items = Array.from(clipboardData.items || []);
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) return file;
      }
    }
    const files = Array.from(clipboardData.files || []);
    return files.find((f) => f.type.startsWith('image/')) || null;
  };

  const handlePasteFromClipboardButton = async (shotId: string) => {
    setErrorMsg(null);
    try {
      if (navigator.clipboard && typeof navigator.clipboard.read === 'function') {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imgType = item.types.find((t) => t.startsWith('image/'));
          if (imgType) {
            const blob = await item.getType(imgType);
            const ext = imgType.includes('jpeg') ? 'jpg' : imgType.includes('webp') ? 'webp' : 'png';
            const file = new File([blob], `google-flow-${shotId}.${ext}`, { type: imgType });
            await handleUploadFrame(shotId, file);
            return;
          }
        }
        setPasteHintShotId(shotId);
        frameBoxRefs.current[shotId]?.focus();
        setErrorMsg('No image found on clipboard. Copy an image from Google Flow first, or press Ctrl+V / Cmd+V in the box.');
        return;
      }
    } catch {
      // Fallback: focus the paste target box
    }
    setPasteHintShotId(shotId);
    frameBoxRefs.current[shotId]?.focus();
  };

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-7 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-[#E2E2E6]">
        <div>
          <div className="text-xs font-medium text-[#C6202F]">
            Step 5 · Storyboard Frames (Google Flow & Crew References)
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111114] mt-1">
            Copy Prompts into Google Flow & Upload Frames
          </h1>
          <p className="text-sm text-[#5A5A66] mt-1">
            Copy each frame prompt into Google Flow, then click the image area on the card to
            upload your frame. Live-shoot shots can also hold a reference frame for the crew.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onGoToFrameSuggestions}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#24242B] bg-white border border-[#E2E2E6] hover:border-[#891A23] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Optional AI frame suggestions
          </button>

          <button
            type="button"
            onClick={() => void onApproveAndGoToVideo()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#C6202F] hover:bg-[#AD1A27] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Approve frames & continue to Video
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Upload Readiness Summary */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-[#5A5A66] font-mono tabular-nums">
        <span>
          Total frames uploaded: <span className="text-[#111114]">{totalUploadedCount}/{project.shots.length}</span>
        </span>
        <span aria-hidden="true">·</span>
        <span>
          AI & hybrid frames ready for QC:{' '}
          <span
            className={
              uploadedAiHybridCount === aiHybridShots.length
                ? 'text-emerald-700'
                : 'text-[#891A23]'
            }
          >
            {uploadedAiHybridCount}/{aiHybridShots.length}
          </span>
        </span>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-300 text-xs text-[#891A23]">
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
              className="bg-white border border-[#E2E2E6] rounded-xl overflow-hidden flex flex-col"
            >
              {/* Card Header */}
              <div className="px-4 py-3 bg-[#FBFBFC] border-b border-[#E2E2E6] flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono font-bold text-[#C6202F]">{shot.id}</span>
                  <span className="text-[#3A3A44] font-medium">{routeLabel}</span>
                  <span className="text-[#8A8A96]">·</span>
                  <span className="font-mono text-[#5A5A66] tabular-nums">
                    {shot.durationSec}s
                  </span>
                  {shot.productInFrame && (
                    <>
                      <span className="text-[#8A8A96]">·</span>
                      <span className="inline-flex items-center gap-1 text-[#891A23] font-medium">
                        <Package className="w-3.5 h-3.5" />
                        Product in frame
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {shot.frameCheck?.passed ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Passed
                    </span>
                  ) : shot.frameCheck && !shot.frameCheck.passed ? (
                    <span className="inline-flex items-center gap-1 text-[#C6202F] font-medium">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Needs Fix
                    </span>
                  ) : shot.frameImageUrl ? (
                    <span className="text-[#3A3A44]">Uploaded</span>
                  ) : (
                    <span className="text-[#6E6E7A]">Waiting for frame</span>
                  )}
                </div>
              </div>

              {/* Click / Paste / Drop Frame Area */}
              <input
                ref={(el) => {
                  frameInputRefs.current[shot.id] = el;
                }}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUploadFrame(shot.id, f);
                  e.target.value = '';
                }}
              />
              <div
                ref={(el) => {
                  frameBoxRefs.current[shot.id] = el;
                }}
                tabIndex={0}
                role="button"
                aria-label={`Upload or paste frame for ${shot.id}`}
                onClick={() => frameInputRefs.current[shot.id]?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    frameInputRefs.current[shot.id]?.click();
                  }
                }}
                onPaste={(e) => {
                  const imgFile = extractClipboardImageFile(e.clipboardData);
                  if (imgFile) {
                    e.preventDefault();
                    setPasteHintShotId(null);
                    void handleUploadFrame(shot.id, imgFile);
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const dropped = Array.from(e.dataTransfer.files || []).find((f) =>
                    f.type.startsWith('image/')
                  );
                  if (dropped) void handleUploadFrame(shot.id, dropped);
                }}
                className={`aspect-video bg-[#F6F6F7] border-b relative flex items-center justify-center cursor-pointer transition-colors overflow-hidden focus:outline-none ${
                  pasteHintShotId === shot.id
                    ? 'border-[#C6202F] ring-2 ring-inset ring-[#C6202F]/40'
                    : 'border-[#E2E2E6] hover:bg-[#EAEAEF]'
                }`}
              >
                {shot.frameImageUrl ? (
                  <>
                    <img
                      src={shot.frameImageUrl}
                      alt={`Shot ${shot.id} frame`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/55 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center text-xs font-semibold text-white">
                      Click to replace or paste (Ctrl+V / Cmd+V)
                    </div>
                  </>
                ) : (
                  <div className="text-center p-6 space-y-2 text-[#6E6E7A]">
                    {isUploading ? (
                      <Loader2 className="w-6 h-6 animate-spin text-[#C6202F] mx-auto" />
                    ) : (
                      <Upload className="w-6 h-6 mx-auto text-[#5A5A66]" />
                    )}
                    <div className="text-xs font-semibold text-[#24242B]">
                      {isUploading
                        ? 'Saving frame...'
                        : shot.route === 'live'
                          ? 'Click or paste crew reference frame (optional)'
                          : 'Click, drop, or paste frame from Google Flow'}
                    </div>
                    <div className="text-[11px] text-[#6E6E7A]">
                      Click anywhere to browse, drag an image, or press Ctrl+V / Cmd+V
                    </div>
                  </div>
                )}
              </div>

              {pasteHintShotId === shot.id && (
                <div className="px-4 py-1.5 bg-[#FDF4F5] border-b border-[#EABAC0] text-[11px] text-[#891A23]">
                  Frame box focused — press Ctrl+V (or Cmd+V) to paste your Google Flow image.
                </div>
              )}

              <div className="px-4 py-2 bg-[#FBFBFC] border-b border-[#E2E2E6] flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="text-[#6E6E7A]">Frame source</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => void handlePasteFromClipboardButton(shot.id)}
                    className="inline-flex items-center gap-1 text-[#24242B] hover:text-[#C6202F] font-medium cursor-pointer"
                  >
                    <ClipboardPaste className="w-3.5 h-3.5 text-[#C6202F]" />
                    Paste image
                  </button>
                  <button
                    type="button"
                    onClick={() => setDrivePickerShotId(shot.id)}
                    className="inline-flex items-center gap-1.5 text-[#891A23] hover:text-[#891A23] font-medium cursor-pointer"
                  >
                    <FolderSync className="w-3.5 h-3.5" />
                    Pick frame from Google Drive
                  </button>
                </div>
              </div>

              {/* Scene & Copyable Frame Prompt */}
              <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                <div className="text-xs text-[#3A3A44] leading-relaxed">
                  <span className="text-[#6E6E7A] font-medium">Scene: </span>
                  {shot.scene}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[#5A5A66]">
                      Frame prompt
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCopyPrompt(shot.id, shot.framePrompt)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#891A23] bg-[#FDF4F5] border border-[#EABAC0] hover:bg-[#FCE8EA] rounded-md transition-colors cursor-pointer"
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
                    className="w-full bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg px-3 py-2 text-xs text-[#24242B] focus:outline-none focus:border-[#C6202F] leading-relaxed"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <DriveAssetPickerModal
        isOpen={Boolean(drivePickerShotId)}
        projectId={project.id}
        initialFolderUrls={
          project.googleDriveFolderUrls?.length
            ? project.googleDriveFolderUrls
            : project.googleDriveFolderUrl
              ? [project.googleDriveFolderUrl]
              : []
        }
        mediaFilter="image"
        multiple={false}
        prefix="frame"
        title={
          drivePickerShotId
            ? `Pick Storyboard Frame for ${drivePickerShotId} from Google Drive`
            : 'Pick Storyboard Frame from Google Drive'
        }
        onClose={() => setDrivePickerShotId(null)}
        onImported={(assets: ImportedDriveAsset[]) => {
          const picked = assets[0];
          if (picked?.url && drivePickerShotId) {
            updateShot(drivePickerShotId, {
              frameImageUrl: picked.url,
              status: 'Frame Uploaded',
              frameCheck: null,
              productFrameApproved: false,
            });
          }
        }}
        onFoldersChange={(urls) => {
          void onUpdateProject({
            ...project,
            googleDriveFolderUrls: urls,
            googleDriveFolderUrl: urls[0] || undefined,
          });
        }}
      />
    </div>
  );
};
