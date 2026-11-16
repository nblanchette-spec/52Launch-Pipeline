import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Sparkles,
  Loader2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Download,
  Copy,
  Check,
  Volume2,
  VolumeX,
  UploadCloud,
  Dices,
  ArrowUpRight,
  ArrowRight,
  Sliders,
  ChevronDown,
  ChevronUp,
  Info,
  Type as TypeIcon,
  Image as ImageIcon,
  SplitSquareVertical,
  Clock,
  Images,
  Film,
  Plus,
  Trash2,
  Maximize2,
  Smartphone,
  Square,
  RectangleHorizontal,
  RectangleVertical,
  Music,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import { PipelineProject, PipelineShot } from '../../types/pipeline';
import { readAndOptimizeLocalImage } from '../../utils/imageUtils';
import {
  clampStudioDuration,
  estimateStudioCostUsd,
  getStudioAvailableAspectRatios,
  getStudioAvailableResolutions,
  getStudioFamily,
  getStudioModel,
  keyframeFrameIndex,
  resolveStudioResolution,
  STUDIO_MODELS,
  StudioAspectRatio,
  StudioModelId,
  StudioQualityTier,
  StudioReferenceTask,
  StudioResolution,
  StudioTimelineKeyframe,
  StudioWorkflowMode,
} from '../../utils/videoStudioCatalog';
import { TopazUpscaleModal } from './TopazUpscaleModal';

interface VideoStudioModalProps {
  isOpen: boolean;
  project: PipelineProject;
  shot: PipelineShot | null;
  chainedStartFrameDataUrl?: string;
  onClose: () => void;
  onProjectUpdated: (updated: PipelineProject) => void;
}

const WORKFLOW_TABS: Array<{
  id: StudioWorkflowMode;
  label: string;
  icon: React.ElementType;
}> = [
  { id: 'text_to_video', label: 'Text', icon: TypeIcon },
  { id: 'image_to_video', label: 'Image', icon: ImageIcon },
  { id: 'first_last_frame', label: 'Pair', icon: SplitSquareVertical },
  { id: 'keyframes_timeline', label: 'Timeline', icon: Clock },
  { id: 'reference_to_video', label: 'Ref / Multi', icon: Images },
  { id: 'video_edit', label: 'V2V Edit', icon: Film },
  { id: 'video_reframe', label: 'Reframe', icon: Maximize2 },
];

const REFERENCE_TASKS: Array<{ id: StudioReferenceTask; label: string; hint: string }> = [
  { id: 'reference', label: 'Reference', hint: 'Use media as guidance' },
  { id: 'editing', label: 'Edit / Add', hint: 'Modify or add elements to video' },
  { id: 'extension', label: 'Extend', hint: 'Continue a video clip' },
  { id: 'auto', label: 'Auto', hint: 'Let the model decide' },
];

const CAMERA_TAGS = [
  'Dolly In',
  'Dynamic Orbit',
  'Drone Flyover',
  'Pan Right',
  'Crane Up',
  'FPV Dive',
  'Anamorphic 35mm',
  'Hyperlapse',
];

const ASPECT_ICONS: Record<StudioAspectRatio, { label: string; icon: React.ElementType }> = {
  auto: { label: 'Auto', icon: Sparkles },
  '16:9': { label: '16:9', icon: Maximize2 },
  '9:16': { label: '9:16', icon: Smartphone },
  '1:1': { label: '1:1', icon: Square },
  '21:9': { label: '21:9', icon: RectangleHorizontal },
  '2:1': { label: '2:1', icon: RectangleHorizontal },
  '4:3': { label: '4:3', icon: RectangleHorizontal },
  '3:4': { label: '3:4', icon: RectangleVertical },
};

const RESOLUTION_LABELS: Record<StudioResolution, string> = {
  '480p': '480p',
  '540p': '540p',
  '720p': '720p',
  '1080p': '1080p',
  '1440p': '2K',
  '2160p': '4K',
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

function mapShotModelToStudioId(model: PipelineShot['model']): StudioModelId {
  switch (model) {
    case 'flux3':
      return 'flux-3';
    case 'kling':
      return 'kling-4.0';
    case 'wan':
      return 'wan-3.0-prime';
    case 'luma':
      return 'luma-ray-3.2';
    default:
      return 'seedance-2.5';
  }
}

export const VideoStudioModal: React.FC<VideoStudioModalProps> = ({
  isOpen,
  project,
  shot,
  chainedStartFrameDataUrl,
  onClose,
  onProjectUpdated,
}) => {
  const [modelId, setModelId] = useState<StudioModelId>('seedance-2.5');
  const [workflowMode, setWorkflowMode] = useState<StudioWorkflowMode>('image_to_video');
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<StudioAspectRatio>('16:9');
  const [duration, setDuration] = useState(5);
  const [qualityTier, setQualityTier] = useState<StudioQualityTier>('final');
  const [resolution, setResolution] = useState<StudioResolution | undefined>(undefined);
  const [nativeAudio, setNativeAudio] = useState(true);
  const [safetyTolerance, setSafetyTolerance] = useState(2);
  const [enableSafetyChecker, setEnableSafetyChecker] = useState(false);
  const [seed, setSeed] = useState(428914);
  const [startFrameUrl, setStartFrameUrl] = useState<string | null>(null);
  const [endFrameUrl, setEndFrameUrl] = useState<string | null>(null);
  const [keyframes, setKeyframes] = useState<StudioTimelineKeyframe[]>([]);
  const [sourceVideoUrl, setSourceVideoUrl] = useState<string | null>(null);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [referenceElements, setReferenceElements] = useState<string[]>([]);
  const [referenceVideos, setReferenceVideos] = useState<string[]>([]);
  const [referenceAudioUrl, setReferenceAudioUrl] = useState<string | null>(null);
  const [referenceTask, setReferenceTask] = useState<StudioReferenceTask>('reference');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Stage player state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [previewVersion, setPreviewVersion] = useState<'original' | 'upscaled'>('original');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);

  const [falKeyConfigured, setFalKeyConfigured] = useState<boolean | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isDraggingSourceVideo, setIsDraggingSourceVideo] = useState(false);
  const [upscaleModalOpen, setUpscaleModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const promptRef = useRef<HTMLTextAreaElement>(null);
  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);
  const sourceVideoInputRef = useRef<HTMLInputElement>(null);
  const refImagesInputRef = useRef<HTMLInputElement>(null);
  const refElementsInputRef = useRef<HTMLInputElement>(null);
  const refVideosInputRef = useRef<HTMLInputElement>(null);
  const refAudioInputRef = useRef<HTMLInputElement>(null);
  const keyframeInputRef = useRef<HTMLInputElement>(null);
  const keyframeTargetIdRef = useRef<string | null>(null);

  const parentShot =
    shot?.chainFrom && shot.chainFrom !== 'none'
      ? project.shots.find((s) => s.id === shot.chainFrom)
      : undefined;

  // Pre-fill all studio fields from the selected shot on open
  useEffect(() => {
    if (!isOpen || !shot) return;
    const initialModel = mapShotModelToStudioId(shot.model);
    const initialFrame = chainedStartFrameDataUrl || shot.frameImageUrl || null;
    const initialDur = clampStudioDuration(initialModel, shot.durationSec || 5);

    setModelId(initialModel);
    setWorkflowMode(initialFrame ? 'image_to_video' : 'text_to_video');
    setPrompt(shot.videoPrompt || shot.scene || '');
    setAspectRatio('16:9');
    setDuration(initialDur);
    setQualityTier('final');
    setResolution(undefined);
    setNativeAudio(true);
    setSafetyTolerance(2);
    setEnableSafetyChecker(false);
    setSeed(shot.videoSeed ?? Math.floor(Math.random() * 900000 + 100000));
    setStartFrameUrl(initialFrame);
    setEndFrameUrl(null);
    setSourceVideoUrl(null);
    setKeyframes([
      {
        id: 'kf-start',
        timeSeconds: 0,
        imageUrl: initialFrame || '',
        label: 'Opening frame',
      },
      {
        id: 'kf-end',
        timeSeconds: initialDur,
        imageUrl: '',
        label: 'Target ending',
      },
    ]);
    setReferenceImages([]);
    setReferenceElements([]);
    setReferenceVideos([]);
    setReferenceAudioUrl(null);
    setReferenceTask('reference');
    setPreviewVersion(shot.upscaledVideoUrl ? 'upscaled' : 'original');
    setUpscaleModalOpen(false);
    setErrorMsg(null);
    setIsPlaying(false);
    setCurrentTime(0);

    fetch('/api/pipeline/fal-status')
      .then((r) => r.json())
      .then((d) => setFalKeyConfigured(Boolean(d.falKeyConfigured)))
      .catch(() => setFalKeyConfigured(null));
  }, [isOpen, shot?.id, chainedStartFrameDataUrl]);

  if (!isOpen || !shot) return null;

  const model = getStudioModel(modelId);
  const family = getStudioFamily(modelId);
  const availableModes = WORKFLOW_TABS.filter((m) =>
    model.workflowModes.includes(m.id)
  );
  const availableAspectRatios = getStudioAvailableAspectRatios(modelId, workflowMode);
  const availableResolutions = getStudioAvailableResolutions(modelId, workflowMode);
  const effectiveResolution = resolveStudioResolution({
    modelId,
    qualityTier,
    workflowMode,
    resolution,
  });
  const estimatedCost = estimateStudioCostUsd({
    modelId,
    qualityTier,
    workflowMode,
    resolution,
    duration,
    nativeAudio,
  });

  const supportsDraftTier =
    model.family === 'seedance' || model.supportsDraftEnhance;

  const handleModelSelect = (nextId: StudioModelId) => {
    const spec = getStudioModel(nextId);
    const nextDuration = clampStudioDuration(nextId, duration);
    const nextMode = spec.workflowModes.includes(workflowMode)
      ? workflowMode
      : spec.workflowModes[0];
    const nextAspectList = getStudioAvailableAspectRatios(nextId, nextMode);
    const nextAspect = nextAspectList.includes(aspectRatio)
      ? aspectRatio
      : nextAspectList.includes('16:9')
        ? '16:9'
        : nextAspectList[0];
    setModelId(nextId);
    setDuration(nextDuration);
    setWorkflowMode(nextMode);
    setAspectRatio(nextAspect);
    if (nextId !== 'seedance-2.5' && nextId !== 'seedance-2.0' && nextId !== 'flux-3') {
      setQualityTier('final');
    }
    if (
      resolution &&
      !getStudioAvailableResolutions(nextId, nextMode).includes(resolution)
    ) {
      setResolution(undefined);
    }
  };

  const handleModeSelect = (nextMode: StudioWorkflowMode) => {
    setWorkflowMode(nextMode);
    const nextAspectList = getStudioAvailableAspectRatios(modelId, nextMode);
    if (!nextAspectList.includes(aspectRatio)) {
      setAspectRatio(nextAspectList.includes('16:9') ? '16:9' : nextAspectList[0]);
    }
    const nextResList = getStudioAvailableResolutions(modelId, nextMode);
    if (resolution && !nextResList.includes(resolution)) {
      setResolution(undefined);
    }
  };

  const handleInsertPromptTag = (tag: string) => {
    const el = promptRef.current;
    const current = prompt;
    const hasSel = el && el.selectionStart != null && el.selectionEnd != null;
    const start = hasSel ? el.selectionStart : current.length;
    const end = hasSel ? el.selectionEnd : current.length;
    const before = current.slice(0, start);
    const after = current.slice(end);
    const needLead = before.length > 0 && !/\s$/.test(before);
    const needTrail = after.length === 0 || !/^\s/.test(after);
    const insert = `${needLead ? ' ' : ''}${tag}${needTrail ? ' ' : ''}`;
    setPrompt(before + insert + after);
    const caret = (before + insert).length;
    requestAnimationFrame(() => {
      if (promptRef.current) {
        promptRef.current.focus();
        promptRef.current.setSelectionRange(caret, caret);
      }
    });
  };

  const handleAddTag = (tag: string) => {
    const trimmed = prompt.trim();
    if (trimmed.includes(tag)) return;
    setPrompt(trimmed ? `${trimmed}, ${tag}` : tag);
  };

  const handleCopyPrompt = async () => {
    if (!prompt.trim()) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 1800);
    } catch {
      // Ignore
    }
  };

  const handleImageUpload = async (
    target: 'start' | 'end' | 'ref' | 'element' | 'keyframe',
    files: File[],
    keyframeId?: string
  ) => {
    setErrorMsg(null);
    try {
      if (target === 'ref') {
        const urls = await Promise.all(
          files.map((f) => readAndOptimizeLocalImage(f, 1400))
        );
        const maxAllowed =
          model.family === 'flux-3'
            ? STUDIO_MODELS['seedance-2.5'].maxReferenceImages
            : model.maxReferenceImages;
        if (model.family === 'flux-3') {
          handleModelSelect('seedance-2.5');
        }
        setReferenceImages((prev) => [...prev, ...urls].slice(0, Math.max(1, maxAllowed)));
        return;
      }
      if (target === 'element') {
        const urls = await Promise.all(
          files.map((f) => readAndOptimizeLocalImage(f, 1400))
        );
        setReferenceElements((prev) => [...prev, ...urls].slice(0, 6));
        return;
      }
      const file = files[0];
      if (!file) return;
      const dataUrl = await readAndOptimizeLocalImage(file, 1400);
      if (target === 'start') setStartFrameUrl(dataUrl);
      else if (target === 'end') setEndFrameUrl(dataUrl);
      else if (target === 'keyframe' && keyframeId) {
        setKeyframes((prev) =>
          prev.map((k) => (k.id === keyframeId ? { ...k, imageUrl: dataUrl } : k))
        );
      }
    } catch {
      setErrorMsg('Could not read that image file.');
    }
  };

  const uploadMediaViaServer = async (file: File, prefix: string): Promise<string> => {
    const dataUrl = await fileToDataUrl(file);
    const resp = await fetch('/api/pipeline/upload-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: project.id,
        dataUrl,
        prefix,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Could not upload media file.');
    return data.url || data.falUrl;
  };

  const handleVideoUpload = async (
    target: 'source' | 'ref',
    files: File[]
  ) => {
    if (!files.length) return;
    setErrorMsg(null);
    setIsUploadingMedia(true);
    try {
      if (target === 'source') {
        const uploadedUrl = await uploadMediaViaServer(files[0], 'v2v-src');
        setSourceVideoUrl(uploadedUrl);
      } else {
        const uploaded = await Promise.all(
          files.map((f) => uploadMediaViaServer(f, 'ref-vid'))
        );
        const maxAllowed = Math.max(1, model.maxReferenceVideos);
        setReferenceVideos((prev) => [...prev, ...uploaded].slice(0, maxAllowed));
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Could not upload that video file.'
      );
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const handleAudioUpload = async (file: File) => {
    setErrorMsg(null);
    setIsUploadingMedia(true);
    try {
      const uploadedUrl = await uploadMediaViaServer(file, 'ref-audio');
      setReferenceAudioUrl(uploadedUrl);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Could not upload that audio file.'
      );
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const handleGenerate = async () => {
    setErrorMsg(null);
    setIsGenerating(true);
    try {
      const resp = await fetch('/api/pipeline/studio-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          shotId: shot.id,
          modelId,
          workflowMode,
          prompt,
          aspectRatio,
          duration,
          qualityTier: supportsDraftTier ? qualityTier : 'final',
          resolution,
          nativeAudio,
          safetyTolerance,
          enableSafetyChecker,
          seed,
          startFrameUrl,
          endFrameUrl,
          keyframes,
          sourceVideoUrl,
          referenceImages,
          referenceElements,
          referenceVideos,
          referenceAudioUrl,
          referenceTask,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Video generation failed.');
      onProjectUpdated(data.project);
      setPreviewVersion('original');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Video generation failed.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExtendFromCurrent = () => {
    if (!shot.videoUrl) return;
    if (model.workflowModes.includes('reference_to_video')) {
      setReferenceVideos((prev) =>
        prev.includes(shot.videoUrl!)
          ? prev
          : [shot.videoUrl!, ...prev].slice(0, Math.max(1, model.maxReferenceVideos))
      );
      setReferenceTask('extension');
      handleModeSelect('reference_to_video');
    } else if (model.workflowModes.includes('video_edit')) {
      setSourceVideoUrl(shot.videoUrl);
      handleModeSelect('video_edit');
    }
  };

  const handleEnhanceDraft = async () => {
    if (!shot.draftCacheUrl) return;
    setErrorMsg(null);
    setIsEnhancing(true);
    try {
      const resp = await fetch('/api/pipeline/studio-enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          shotId: shot.id,
          draftCacheUrl: shot.draftCacheUrl,
          safetyTolerance,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Draft enhance failed.');
      onProjectUpdated(data.project);
      setPreviewVersion('original');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Draft enhance failed.');
    } finally {
      setIsEnhancing(false);
    }
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  const stepFrame = (dir: -1 | 1) => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    setIsPlaying(false);
    const next = Math.max(0, Math.min(v.duration || 5, v.currentTime + dir / 24));
    v.currentTime = next;
    setCurrentTime(next);
  };

  const busy = isGenerating || isEnhancing || isUploadingMedia;

  const activeStageVideoUrl =
    previewVersion === 'upscaled' && shot.upscaledVideoUrl
      ? shot.upscaledVideoUrl
      : shot.videoUrl;

  const activeStageBadge =
    previewVersion === 'upscaled' && shot.upscaledVideoUrl
      ? shot.upscaledResolution || '4K / Upscaled'
      : shot.videoResolution || null;

  // Build prompt tag chips for Reference-to-Video tray
  const promptChips: string[] = [
    ...referenceImages.map((_, i) => `@Image${i + 1}`),
    ...(model.supportsReferenceElements
      ? referenceElements.map((_, i) => `@Element${i + 1}`)
      : []),
    ...referenceVideos.map((_, i) => `@Video${i + 1}`),
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={`52Video Studio — Shot ${shot.id}`}
    >
      <div className="bg-neutral-950 border border-white/10 rounded-2xl w-full max-w-[1280px] h-[92vh] flex flex-col overflow-hidden shadow-2xl text-neutral-100">
        {/* Top Modal Header */}
        <div className="px-5 py-3 bg-neutral-900/80 border-b border-white/[0.08] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-sm font-bold text-white tracking-tight">
              52Video Studio
            </span>
            <span className="text-neutral-600" aria-hidden="true">
              /
            </span>
            <span className="font-mono font-bold text-amber-400 text-xs">{shot.id}</span>
            <span className="text-xs text-neutral-400 truncate hidden sm:inline">
              {shot.scene}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-white bg-neutral-900 border border-white/10 rounded-lg cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            Close
          </button>
        </div>

        {/* Missing FAL_KEY Info Strip */}
        {falKeyConfigured === false && (
          <div className="px-5 py-2 bg-amber-500/10 border-b border-amber-500/30 flex items-center gap-2 text-xs text-amber-200 shrink-0">
            <Info className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Your shot frame and prompt are pre-loaded. Add{' '}
              <strong className="font-mono">FAL_KEY</strong> in Settings &gt; Secrets to
              run live renders directly inside this studio.
            </span>
          </div>
        )}

        {/* Two-Column Studio Workspace */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
          {/* Left Panel: Studio Controls */}
          <div className="w-full lg:w-[470px] shrink-0 h-full border-b lg:border-b-0 lg:border-r border-white/[0.08] bg-neutral-950 flex flex-col overflow-y-auto p-4 sm:p-5 space-y-5">
            {/* Grouped Model Dropdown (FLUX 3 + Seedance + Kling 4.0 + Wan 3.0 Prime + Luma Ray 3.2) */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold tracking-wider uppercase text-neutral-400 block">
                Model
              </label>
              <div className="relative">
                <select
                  value={modelId}
                  disabled={busy}
                  onChange={(e) => handleModelSelect(e.target.value as StudioModelId)}
                  className="w-full appearance-none bg-neutral-900 border border-white/10 rounded-xl pl-3 pr-9 py-2.5 text-xs font-medium text-white focus:outline-none focus:border-white/30 cursor-pointer"
                >
                  <optgroup label="ByteDance Seedance">
                    <option value="seedance-2.5">Seedance 2.5 (1080p, 30s, 30 refs)</option>
                    <option value="seedance-2.0">Seedance 2.0 Fast (720p, 15s)</option>
                  </optgroup>
                  <optgroup label="Black Forest Labs">
                    <option value="flux-3">FLUX 3 (Native Audio, up to 4K)</option>
                  </optgroup>
                  <optgroup label="Kuaishou Kling">
                    <option value="kling-4.0">
                      Kling 4.0 (3–30s · T2V, I2V, @Element Refs &amp; V2V Edit)
                    </option>
                  </optgroup>
                  <optgroup label="Alibaba Wan">
                    <option value="wan-3.0-prime">
                      Wan 3.0 Prime (T2V, I2V &amp; Multi-Ref + Audio)
                    </option>
                  </optgroup>
                  <optgroup label="Luma AI">
                    <option value="luma-ray-3.2">
                      Luma Ray 3.2 (T2V, I2V, V2V Restyle &amp; Reframe)
                    </option>
                  </optgroup>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <p className="text-[10px] text-neutral-500">{model.tagline}</p>
            </div>

            {/* Version Pills only when a provider family has multiple versions (Seedance) */}
            {family.modelIds.length > 1 && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold tracking-wider uppercase text-neutral-400 block">
                  Seedance Engine Tier
                </label>
                <div
                  className="grid gap-1.5 p-1 bg-neutral-900/80 rounded-xl border border-white/[0.08]"
                  style={{
                    gridTemplateColumns: `repeat(${family.modelIds.length}, minmax(0, 1fr))`,
                  }}
                >
                  {family.modelIds.map((id) => {
                    const m = getStudioModel(id);
                    const active = modelId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={busy}
                        onClick={() => handleModelSelect(id)}
                        className={`p-2 rounded-lg text-left transition-all cursor-pointer ${
                          active
                            ? 'bg-neutral-800 text-white border border-white/15'
                            : 'text-neutral-400 hover:text-white border border-transparent'
                        }`}
                      >
                        <div className="text-xs font-semibold text-white leading-tight">
                          {m.label}
                        </div>
                        <div className="text-[10px] text-neutral-400 mt-0.5 leading-tight">
                          {m.tagline}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Dynamic Workflow Mode Tabs */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold tracking-wider uppercase text-neutral-400 block">
                Workflow Mode
              </label>
              <div
                className="grid gap-1 p-1 bg-neutral-900/80 rounded-xl border border-white/[0.08]"
                style={{
                  gridTemplateColumns: `repeat(${availableModes.length}, minmax(0, 1fr))`,
                }}
              >
                {availableModes.map((tab) => {
                  const Icon = tab.icon;
                  const active = workflowMode === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      disabled={busy}
                      onClick={() => handleModeSelect(tab.id)}
                      title={tab.label}
                      className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg transition-all cursor-pointer ${
                        active
                          ? 'bg-neutral-800 text-white font-medium'
                          : 'text-neutral-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 mb-1 shrink-0" />
                      <span className="text-[10px] leading-tight text-center line-clamp-1">
                        {tab.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Media Dropzones per Workflow Mode */}
            {workflowMode !== 'text_to_video' && (
              <div className="space-y-3">
                {/* Image-to-Video / Pair Mode Start & Optional/Required End Frame */}
                {(workflowMode === 'image_to_video' ||
                  workflowMode === 'first_last_frame') && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-zinc-200">
                          Start Frame{chainedStartFrameDataUrl ? ' (chained)' : ''}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => startInputRef.current?.click()}
                            className="text-[11px] text-amber-400 hover:text-amber-300 cursor-pointer"
                          >
                            Replace
                          </button>
                          {startFrameUrl && (
                            <button
                              type="button"
                              onClick={() => setStartFrameUrl(null)}
                              className="text-zinc-400 hover:text-rose-400 cursor-pointer"
                              aria-label="Clear start frame"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      <input
                        ref={startInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          if (files.length) void handleImageUpload('start', files);
                          e.target.value = '';
                        }}
                      />
                      <div
                        onClick={() => startInputRef.current?.click()}
                        className="rounded-xl border-2 border-dashed border-zinc-700 hover:border-amber-500/70 bg-zinc-950/60 overflow-hidden cursor-pointer aspect-video flex items-center justify-center"
                      >
                        {startFrameUrl ? (
                          <img
                            src={startFrameUrl}
                            alt="Start frame"
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="text-center p-4 text-zinc-400 text-xs">
                            <UploadCloud className="w-5 h-5 mx-auto mb-1 text-amber-400" />
                            Drop opening image or browse
                          </div>
                        )}
                      </div>
                    </div>

                    {(workflowMode === 'first_last_frame' ||
                      model.supportsOptionalEndFrameInI2V) && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-zinc-200">
                            {workflowMode === 'first_last_frame'
                              ? `End Frame (${duration}s)`
                              : 'End Frame (Optional)'}
                          </span>
                          {endFrameUrl && (
                            <button
                              type="button"
                              onClick={() => setEndFrameUrl(null)}
                              className="text-zinc-400 hover:text-rose-400 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <input
                          ref={endInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            if (files.length) void handleImageUpload('end', files);
                            e.target.value = '';
                          }}
                        />
                        <div
                          onClick={() => endInputRef.current?.click()}
                          className="rounded-xl border-2 border-dashed border-zinc-700 hover:border-amber-500/70 bg-zinc-950/60 overflow-hidden cursor-pointer aspect-video flex items-center justify-center"
                        >
                          {endFrameUrl ? (
                            <img
                              src={endFrameUrl}
                              alt="End frame"
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="text-center p-4 text-zinc-400 text-xs">
                              <UploadCloud className="w-5 h-5 mx-auto mb-1 text-amber-400" />
                              {workflowMode === 'first_last_frame'
                                ? 'Drop target ending image or browse'
                                : 'Optional closing keyframe (end_image_url)'}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Timeline Keyframes (Seedance / FLUX 3) */}
                {workflowMode === 'keyframes_timeline' && (
                  <div className="space-y-2.5 p-3 rounded-xl bg-neutral-900/70 border border-white/[0.08]">
                    <input
                      ref={keyframeInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        const targetId = keyframeTargetIdRef.current;
                        if (files.length && targetId) {
                          void handleImageUpload('keyframe', files, targetId);
                        }
                        keyframeTargetIdRef.current = null;
                        e.target.value = '';
                      }}
                    />
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-cyan-400" />
                        Reference Timeline ({keyframes.length}/{model.maxTimelineFrames})
                      </span>
                      <button
                        type="button"
                        disabled={keyframes.length >= model.maxTimelineFrames}
                        onClick={() =>
                          setKeyframes((prev) => [
                            ...prev,
                            {
                              id: `kf-${Date.now()}`,
                              timeSeconds: Math.min(
                                duration,
                                Math.round((duration / 2) * 10) / 10
                              ),
                              imageUrl: '',
                              label: `Frame ${prev.length + 1}`,
                            },
                          ])
                        }
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 text-[11px] disabled:opacity-40 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        Add Frame
                      </button>
                    </div>

                    <div className="space-y-2">
                      {keyframes.map((kf) => (
                        <div
                          key={kf.id}
                          className="flex items-center gap-2 bg-neutral-950 border border-zinc-800 rounded-lg p-2"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              keyframeTargetIdRef.current = kf.id;
                              keyframeInputRef.current?.click();
                            }}
                            className="w-16 h-10 rounded border border-zinc-700 bg-black overflow-hidden shrink-0 flex items-center justify-center text-[10px] text-zinc-400 hover:border-cyan-400 cursor-pointer"
                          >
                            {kf.imageUrl ? (
                              <img
                                src={kf.imageUrl}
                                alt={kf.label || 'Keyframe'}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              'Upload'
                            )}
                          </button>
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-1.5 text-xs">
                              <input
                                type="number"
                                min={0}
                                max={duration}
                                step={0.5}
                                value={kf.timeSeconds}
                                onChange={(e) => {
                                  const t = Math.max(
                                    0,
                                    Math.min(duration, parseFloat(e.target.value) || 0)
                                  );
                                  setKeyframes((prev) =>
                                    prev.map((item) =>
                                      item.id === kf.id ? { ...item, timeSeconds: t } : item
                                    )
                                  );
                                }}
                                className="w-14 bg-neutral-900 border border-zinc-700 rounded px-1.5 py-0.5 text-xs font-mono text-white"
                              />
                              <span className="text-[10px] text-zinc-500">s</span>
                              {model.family === 'flux-3' && (
                                <span className="text-[10px] font-mono text-cyan-400">
                                  f{keyframeFrameIndex(kf.timeSeconds, duration)}
                                </span>
                              )}
                            </div>
                            <input
                              type="text"
                              value={kf.label || ''}
                              placeholder="Scene cue..."
                              onChange={(e) =>
                                setKeyframes((prev) =>
                                  prev.map((item) =>
                                    item.id === kf.id
                                      ? { ...item, label: e.target.value }
                                      : item
                                  )
                                )
                              }
                              className="w-full bg-neutral-900 border border-zinc-800 rounded px-1.5 py-0.5 text-[11px] text-zinc-200"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setKeyframes((prev) => prev.filter((item) => item.id !== kf.id))
                            }
                            className="p-1 text-zinc-500 hover:text-rose-400 cursor-pointer"
                            aria-label="Remove keyframe"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dedicated Drag-and-Drop Source Video Uploader for V2V Edit / Reframe */}
                {(workflowMode === 'video_edit' || workflowMode === 'video_reframe') && (
                  <div className="space-y-3 p-3 rounded-xl bg-neutral-900/60 border border-white/[0.08]">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                          <Film className="w-3.5 h-3.5 text-purple-400" />
                          {workflowMode === 'video_reframe'
                            ? 'Source Video to Reframe'
                            : model.family === 'kling'
                              ? 'Source Video to Edit (3–30s)'
                              : 'Source Video to Restyle'}
                        </span>
                        {sourceVideoUrl && (
                          <button
                            type="button"
                            onClick={() => setSourceVideoUrl(null)}
                            className="text-[11px] text-zinc-400 hover:text-rose-400 cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      <input
                        ref={sourceVideoInputRef}
                        type="file"
                        accept="video/mp4,video/quicktime,video/webm,.mp4,.mov"
                        className="hidden"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          if (files.length) void handleVideoUpload('source', files);
                          e.target.value = '';
                        }}
                      />

                      {sourceVideoUrl ? (
                        <div className="rounded-xl overflow-hidden border border-zinc-700 bg-black space-y-1.5">
                          <video
                            src={sourceVideoUrl}
                            controls
                            playsInline
                            className="w-full max-h-[160px] object-contain"
                          />
                          <div className="px-2.5 pb-2 flex items-center justify-between text-[10px] text-zinc-400">
                            <span className="font-mono truncate">
                              Uploaded for Fal ({workflowMode === 'video_reframe' ? 'reframe' : 'video_url'})
                            </span>
                            <button
                              type="button"
                              onClick={() => sourceVideoInputRef.current?.click()}
                              className="text-purple-400 hover:text-purple-300 font-medium cursor-pointer shrink-0 ml-2"
                            >
                              Replace
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => sourceVideoInputRef.current?.click()}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setIsDraggingSourceVideo(true);
                          }}
                          onDragLeave={() => setIsDraggingSourceVideo(false)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setIsDraggingSourceVideo(false);
                            const files = Array.from(e.dataTransfer.files || []);
                            if (files.length) void handleVideoUpload('source', files);
                          }}
                          className={`py-4 px-3 rounded-xl border-2 border-dashed flex flex-col items-center text-center cursor-pointer transition-colors ${
                            isDraggingSourceVideo
                              ? 'border-purple-400 bg-purple-500/10'
                              : 'border-zinc-700 hover:border-purple-500/70 bg-zinc-950/60'
                          }`}
                        >
                          {isUploadingMedia ? (
                            <>
                              <Loader2 className="w-5 h-5 text-purple-400 animate-spin mb-1" />
                              <span className="text-xs text-zinc-200">
                                Uploading clip to Fal storage...
                              </span>
                            </>
                          ) : (
                            <>
                              <UploadCloud className="w-5 h-5 text-purple-400 mb-1" />
                              <span className="text-xs text-zinc-200 font-medium">
                                Drag &amp; drop .mp4 or .mov here, or browse
                              </span>
                              <span className="text-[10px] text-zinc-500 mt-0.5">
                                {workflowMode === 'video_reframe'
                                  ? 'Outpaints your clip to the target aspect ratio'
                                  : 'Uploads via studio helper and passes video_url'}
                              </span>
                            </>
                          )}
                        </div>
                      )}

                      {(shot.videoUrl || parentShot?.videoUrl) && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <span className="text-[10px] text-zinc-500">Use clip:</span>
                          {shot.videoUrl && sourceVideoUrl !== shot.videoUrl && (
                            <button
                              type="button"
                              onClick={() => setSourceVideoUrl(shot.videoUrl!)}
                              className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-[10px] text-zinc-200 cursor-pointer"
                            >
                              + {shot.id} Generated Clip
                            </button>
                          )}
                          {parentShot?.videoUrl &&
                            sourceVideoUrl !== parentShot.videoUrl && (
                              <button
                                type="button"
                                onClick={() => setSourceVideoUrl(parentShot.videoUrl!)}
                                className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-[10px] text-zinc-200 cursor-pointer"
                              >
                                + {parentShot.id} Chained Clip
                              </button>
                            )}
                        </div>
                      )}
                    </div>

                    {/* Optional Reference Images for Kling 4.0 V2V Edit */}
                    {model.family === 'kling' && workflowMode === 'video_edit' && (
                      <div className="space-y-1.5 pt-2.5 border-t border-zinc-800">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                            <Images className="w-3.5 h-3.5 text-cyan-400" />
                            Reference Images (Optional)
                          </span>
                          <button
                            type="button"
                            onClick={() => refImagesInputRef.current?.click()}
                            className="text-[11px] text-cyan-400 hover:text-cyan-300 cursor-pointer"
                          >
                            + Add images
                          </button>
                        </div>
                        <input
                          ref={refImagesInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            if (files.length) void handleImageUpload('ref', files);
                            e.target.value = '';
                          }}
                        />
                        {referenceImages.length > 0 && (
                          <div className="grid grid-cols-4 gap-1.5">
                            {referenceImages.map((img, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => handleInsertPromptTag(`@Image${idx + 1}`)}
                                className="relative group aspect-square rounded-lg overflow-hidden border border-zinc-700 hover:border-cyan-400 bg-black cursor-pointer"
                              >
                                <img
                                  src={img}
                                  alt={`Ref ${idx + 1}`}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                                <span className="absolute top-0.5 left-0.5 bg-black/80 text-[8px] font-mono text-cyan-300 px-1 rounded">
                                  @Image{idx + 1}
                                </span>
                                <span
                                  role="button"
                                  tabIndex={-1}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setReferenceImages((prev) =>
                                      prev.filter((_, i) => i !== idx)
                                    );
                                  }}
                                  className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/80 text-zinc-300 hover:text-rose-400 opacity-0 group-hover:opacity-100"
                                >
                                  <Trash2 className="w-2.5 h-2.5" />
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Unified Multi-Reference / Video & Ref Tray */}
                {(workflowMode === 'reference_to_video' ||
                  workflowMode === 'video_extend') && (
                  <div className="space-y-3 p-3 rounded-xl bg-neutral-900/60 border border-white/[0.08]">
                    {/* Clickable Prompt Tag Chips (@Image1, @Element1, @Video1) */}
                    {promptChips.length > 0 && (
                      <div className="p-2 rounded-lg bg-neutral-950 border border-white/[0.06] space-y-1">
                        <span className="text-[10px] font-medium text-neutral-400 block">
                          Click a tag to insert into prompt:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {promptChips.map((chip) => (
                            <button
                              key={chip}
                              type="button"
                              onClick={() => handleInsertPromptTag(chip)}
                              className="px-2 py-0.5 rounded bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 font-mono text-[11px] text-cyan-300 cursor-pointer"
                            >
                              + {chip}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Reference Videos */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                          <Film className="w-3.5 h-3.5 text-purple-400" />
                          Reference Videos
                          <span className="text-[10px] text-zinc-500 font-mono">
                            ({referenceVideos.length}/{Math.max(1, model.maxReferenceVideos)})
                          </span>
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isUploadingMedia}
                            onClick={() => refVideosInputRef.current?.click()}
                            className="text-[11px] text-purple-400 hover:text-purple-300 cursor-pointer"
                          >
                            {isUploadingMedia ? 'Uploading...' : '+ Add video'}
                          </button>
                          {referenceVideos.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setReferenceVideos([])}
                              className="text-[11px] text-zinc-400 hover:text-rose-400 cursor-pointer"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>
                      <input
                        ref={refVideosInputRef}
                        type="file"
                        accept="video/mp4,video/quicktime,video/webm,.mp4,.mov"
                        multiple={model.maxReferenceVideos > 1}
                        className="hidden"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          if (files.length) void handleVideoUpload('ref', files);
                          e.target.value = '';
                        }}
                      />
                      {referenceVideos.length > 0 ? (
                        <div className="grid grid-cols-3 gap-1.5">
                          {referenceVideos.map((vidUrl, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleInsertPromptTag(`@Video${idx + 1}`)}
                              title={`Click to insert @Video${idx + 1} into prompt`}
                              className="relative group aspect-video rounded-lg overflow-hidden border border-zinc-700 hover:border-purple-400 bg-black cursor-pointer"
                            >
                              <video
                                src={vidUrl}
                                muted
                                playsInline
                                className="w-full h-full object-cover"
                              />
                              <span className="absolute top-0.5 left-0.5 bg-black/80 text-[8px] font-mono text-purple-300 px-1 rounded">
                                @Video{idx + 1}
                              </span>
                              <span
                                role="button"
                                tabIndex={-1}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setReferenceVideos((prev) =>
                                    prev.filter((_, i) => i !== idx)
                                  );
                                }}
                                className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/80 text-zinc-300 hover:text-rose-400 opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </span>
                            </button>
                          ))}
                          {referenceVideos.length < Math.max(1, model.maxReferenceVideos) && (
                            <button
                              type="button"
                              onClick={() => refVideosInputRef.current?.click()}
                              className="aspect-video rounded-lg border border-dashed border-zinc-700 hover:border-purple-400 bg-zinc-900/50 flex flex-col items-center justify-center text-zinc-400 hover:text-purple-300 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span className="text-[9px] mt-0.5">Add</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <div
                          onClick={() => refVideosInputRef.current?.click()}
                          className="py-3 rounded-lg border-2 border-dashed border-zinc-800 hover:border-purple-500/60 bg-zinc-950/60 flex flex-col items-center cursor-pointer"
                        >
                          <UploadCloud className="w-4 h-4 text-purple-400 mb-1" />
                          <p className="text-xs text-zinc-300">
                            Drop up to {Math.max(1, model.maxReferenceVideos)} video
                            {Math.max(1, model.maxReferenceVideos) > 1 ? 's' : ''} (.mp4/.mov) or{' '}
                            <span className="text-purple-400">browse</span>
                          </p>
                          <p className="text-[10px] text-zinc-500 mt-0.5">
                            Tag @Video1 in prompt or combine with reference images below
                          </p>
                        </div>
                      )}

                      {(shot.videoUrl || parentShot?.videoUrl) && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <span className="text-[10px] text-zinc-500">Quick add:</span>
                          {shot.videoUrl && !referenceVideos.includes(shot.videoUrl) && (
                            <button
                              type="button"
                              onClick={() =>
                                setReferenceVideos((prev) =>
                                  [...prev, shot.videoUrl!].slice(
                                    0,
                                    Math.max(1, model.maxReferenceVideos)
                                  )
                                )
                              }
                              className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-[10px] text-zinc-200 cursor-pointer"
                            >
                              + {shot.id} Clip
                            </button>
                          )}
                          {parentShot?.videoUrl &&
                            !referenceVideos.includes(parentShot.videoUrl) && (
                              <button
                                type="button"
                                onClick={() =>
                                  setReferenceVideos((prev) =>
                                    [...prev, parentShot.videoUrl!].slice(
                                      0,
                                      Math.max(1, model.maxReferenceVideos)
                                    )
                                  )
                                }
                                className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-[10px] text-zinc-200 cursor-pointer"
                              >
                                + {parentShot.id} Chained Clip
                              </button>
                            )}
                        </div>
                      )}
                    </div>

                    {/* Reference Images (@Image1, @Image2...) */}
                    <div className="space-y-1.5 pt-2.5 border-t border-zinc-800">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                          <Images className="w-3.5 h-3.5 text-cyan-400" />
                          Reference Images
                          <span className="text-[10px] text-zinc-500 font-mono">
                            ({referenceImages.length}/
                            {model.family === 'flux-3'
                              ? STUDIO_MODELS['seedance-2.5'].maxReferenceImages
                              : model.maxReferenceImages}
                            )
                          </span>
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => refImagesInputRef.current?.click()}
                            className="text-[11px] text-cyan-400 hover:text-cyan-300 cursor-pointer"
                          >
                            + Add images
                          </button>
                          {referenceImages.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setReferenceImages([])}
                              className="text-[11px] text-zinc-400 hover:text-rose-400 cursor-pointer"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>
                      <input
                        ref={refImagesInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          if (files.length) void handleImageUpload('ref', files);
                          e.target.value = '';
                        }}
                      />

                      {referenceImages.length > 0 ? (
                        <div className="grid grid-cols-4 gap-1.5">
                          {referenceImages.map((img, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleInsertPromptTag(`@Image${idx + 1}`)}
                              title={`Click to insert @Image${idx + 1} into prompt`}
                              className="relative group aspect-square rounded-lg overflow-hidden border border-zinc-700 hover:border-cyan-400 bg-black cursor-pointer"
                            >
                              <img
                                src={img}
                                alt={`Ref ${idx + 1}`}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                              <span className="absolute top-0.5 left-0.5 bg-black/80 text-[8px] font-mono text-cyan-300 px-1 rounded">
                                @Image{idx + 1}
                              </span>
                              <span
                                role="button"
                                tabIndex={-1}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setReferenceImages((prev) =>
                                    prev.filter((_, i) => i !== idx)
                                  );
                                }}
                                className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/80 text-zinc-300 hover:text-rose-400 opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </span>
                            </button>
                          ))}
                          {referenceImages.length <
                            (model.family === 'flux-3'
                              ? STUDIO_MODELS['seedance-2.5'].maxReferenceImages
                              : model.maxReferenceImages) && (
                            <button
                              type="button"
                              onClick={() => refImagesInputRef.current?.click()}
                              className="aspect-square rounded-lg border border-dashed border-zinc-700 hover:border-cyan-400 bg-zinc-900/50 flex flex-col items-center justify-center text-zinc-400 hover:text-cyan-300 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span className="text-[9px] mt-0.5">Add</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <div
                          onClick={() => refImagesInputRef.current?.click()}
                          className="py-3 px-2 rounded-lg border border-dashed border-zinc-700 hover:border-cyan-400 bg-zinc-950/60 flex flex-col items-center text-center cursor-pointer"
                        >
                          <UploadCloud className="w-4 h-4 text-cyan-400 mb-1" />
                          <p className="text-[11px] text-zinc-300">
                            Upload reference images for @Image1 / @Image2 guidance
                          </p>
                          <p className="text-[10px] text-zinc-500 mt-0.5">
                            {model.family === 'flux-3'
                              ? 'Adding images switches to Seedance 2.5 (supports video + images)'
                              : 'Click thumbnails to insert tags into your prompt'}
                          </p>
                        </div>
                      )}

                      {(project.product.photos.length > 0 || startFrameUrl) && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <span className="text-[10px] text-zinc-500">Quick add:</span>
                          {startFrameUrl && !referenceImages.includes(startFrameUrl) && (
                            <button
                              type="button"
                              onClick={() => {
                                if (model.family === 'flux-3') {
                                  handleModelSelect('seedance-2.5');
                                }
                                setReferenceImages((prev) =>
                                  [...prev, startFrameUrl].slice(0, 30)
                                );
                              }}
                              className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-[10px] text-zinc-200 cursor-pointer"
                            >
                              + Shot Frame
                            </button>
                          )}
                          {project.product.photos.map((p, idx) =>
                            !referenceImages.includes(p.url) ? (
                              <button
                                key={p.id || idx}
                                type="button"
                                onClick={() => {
                                  if (model.family === 'flux-3') {
                                    handleModelSelect('seedance-2.5');
                                  }
                                  setReferenceImages((prev) =>
                                    [...prev, p.url].slice(0, 30)
                                  );
                                }}
                                className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-[10px] text-zinc-200 cursor-pointer"
                              >
                                + Product Photo {idx + 1}
                              </button>
                            ) : null
                          )}
                        </div>
                      )}
                    </div>

                    {/* Subject Elements (@Element1, @Element2...) for Kling 4.0 */}
                    {model.supportsReferenceElements && (
                      <div className="space-y-1.5 pt-2.5 border-t border-zinc-800">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-amber-400" />
                            Subject / Character Elements (@Element1)
                          </span>
                          <button
                            type="button"
                            onClick={() => refElementsInputRef.current?.click()}
                            className="text-[11px] text-amber-400 hover:text-amber-300 cursor-pointer"
                          >
                            + Add element
                          </button>
                        </div>
                        <input
                          ref={refElementsInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            if (files.length) void handleImageUpload('element', files);
                            e.target.value = '';
                          }}
                        />
                        {referenceElements.length > 0 ? (
                          <div className="grid grid-cols-4 gap-1.5">
                            {referenceElements.map((img, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => handleInsertPromptTag(`@Element${idx + 1}`)}
                                className="relative group aspect-square rounded-lg overflow-hidden border border-zinc-700 hover:border-amber-400 bg-black cursor-pointer"
                              >
                                <img
                                  src={img}
                                  alt={`Element ${idx + 1}`}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                                <span className="absolute top-0.5 left-0.5 bg-black/80 text-[8px] font-mono text-amber-300 px-1 rounded">
                                  @Element{idx + 1}
                                </span>
                                <span
                                  role="button"
                                  tabIndex={-1}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setReferenceElements((prev) =>
                                      prev.filter((_, i) => i !== idx)
                                    );
                                  }}
                                  className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/80 text-zinc-300 hover:text-rose-400 opacity-0 group-hover:opacity-100"
                                >
                                  <Trash2 className="w-2.5 h-2.5" />
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => refElementsInputRef.current?.click()}
                            className="w-full py-2 px-3 rounded-lg border border-dashed border-zinc-700 hover:border-amber-400 bg-zinc-950/60 text-[11px] text-zinc-400 hover:text-amber-300 cursor-pointer"
                          >
                            + Add product or character identity for @Element1 tagging
                          </button>
                        )}
                      </div>
                    )}

                    {/* Reference Audio Track for Wan 3.0 Prime */}
                    {model.supportsReferenceAudio && (
                      <div className="space-y-1.5 pt-2.5 border-t border-zinc-800">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                            <Music className="w-3.5 h-3.5 text-emerald-400" />
                            Reference Audio Track (Optional)
                          </span>
                          {referenceAudioUrl && (
                            <button
                              type="button"
                              onClick={() => setReferenceAudioUrl(null)}
                              className="text-[11px] text-zinc-400 hover:text-rose-400 cursor-pointer"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        <input
                          ref={refAudioInputRef}
                          type="file"
                          accept="audio/mpeg,audio/wav,audio/mp3,.mp3,.wav,.m4a"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void handleAudioUpload(file);
                            e.target.value = '';
                          }}
                        />
                        {referenceAudioUrl ? (
                          <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-700">
                            <audio src={referenceAudioUrl} controls className="w-full h-8" />
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => refAudioInputRef.current?.click()}
                            className="w-full py-2 px-3 rounded-lg border border-dashed border-zinc-700 hover:border-emerald-400 bg-zinc-950/60 text-[11px] text-zinc-400 hover:text-emerald-300 cursor-pointer"
                          >
                            + Attach voiceover or audio track (.mp3 / .wav)
                          </button>
                        )}
                      </div>
                    )}

                    {/* Seedance 2.5 Task Mode */}
                    {model.supportsTaskMode && (
                      <div className="space-y-1.5 pt-2.5 border-t border-zinc-800">
                        <label className="text-[11px] font-semibold tracking-wider uppercase text-neutral-400 block">
                          Task
                        </label>
                        <div className="grid grid-cols-4 gap-1 p-1 bg-neutral-950 rounded-lg border border-white/[0.08]">
                          {REFERENCE_TASKS.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => setReferenceTask(t.id)}
                              title={t.hint}
                              className={`py-1.5 rounded text-xs cursor-pointer ${
                                referenceTask === t.id
                                  ? 'bg-neutral-800 text-white font-semibold'
                                  : 'text-neutral-400 hover:text-white'
                              }`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Prompt & Motion Direction */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold tracking-wider uppercase text-neutral-400">
                  {workflowMode === 'video_reframe'
                    ? 'Reframe Guidance (Optional)'
                    : 'Prompt & Motion Direction'}
                </label>
                <button
                  type="button"
                  onClick={() => void handleCopyPrompt()}
                  className="inline-flex items-center gap-1 text-[11px] text-amber-300 hover:text-amber-200 cursor-pointer"
                >
                  {copiedPrompt ? (
                    <>
                      <Check className="w-3 h-3" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      Copy prompt
                    </>
                  )}
                </button>
              </div>
              <textarea
                ref={promptRef}
                rows={4}
                value={prompt}
                disabled={busy}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  workflowMode === 'video_reframe'
                    ? 'Optional guidance for outpainted edges...'
                    : 'Describe motion, camera move, timing, or tag @Image1 / @Element1 / @Video1...'
                }
                className="w-full bg-neutral-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-white/30 leading-relaxed"
              />
              <div className="flex flex-wrap gap-1">
                {CAMERA_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    disabled={busy}
                    onClick={() => handleAddTag(tag)}
                    className="px-2 py-0.5 text-[10px] font-medium text-neutral-300 bg-neutral-900 border border-white/10 hover:border-white/30 rounded-md cursor-pointer"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Aspect Ratio & Duration */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold tracking-wider uppercase text-neutral-400 block">
                  Aspect Ratio
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {availableAspectRatios.map((ar) => {
                    const meta = ASPECT_ICONS[ar];
                    const Icon = meta.icon;
                    const active = aspectRatio === ar;
                    return (
                      <button
                        key={ar}
                        type="button"
                        disabled={busy}
                        onClick={() => setAspectRatio(ar)}
                        className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] border cursor-pointer ${
                          active
                            ? 'bg-neutral-800 text-white border-white/25 font-semibold'
                            : 'bg-neutral-900/60 text-neutral-400 border-white/[0.06] hover:text-white'
                        }`}
                      >
                        <Icon className="w-3 h-3" />
                        <span>{meta.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {workflowMode !== 'video_reframe' && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-400">Duration</span>
                    <span className="font-mono text-white tabular-nums">
                      {duration}s
                      {model.durationFormat === 'string_s' && (
                        <span className="text-[10px] text-neutral-500 ml-1">
                          (&quot;{duration}s&quot;)
                        </span>
                      )}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={model.minDuration}
                    max={model.maxDuration}
                    step={1}
                    value={duration}
                    disabled={busy}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="w-full cursor-pointer"
                  />
                  <div className="flex justify-between items-center text-[10px] font-mono text-neutral-500">
                    <span>{model.minDuration}s</span>
                    {model.durations && (
                      <div className="flex gap-1">
                        {model.durations.map((d) => (
                          <button
                            key={d}
                            type="button"
                            disabled={busy}
                            onClick={() => setDuration(d)}
                            className={`px-1.5 py-0.5 rounded border cursor-pointer ${
                              duration === d
                                ? 'border-white/30 bg-neutral-800 text-white'
                                : 'border-white/[0.06] text-neutral-400 hover:text-white'
                            }`}
                          >
                            {d}s
                          </button>
                        ))}
                      </div>
                    )}
                    <span>{model.maxDuration}s</span>
                  </div>
                </div>
              )}
            </div>

            {/* Quality Tier + Resolution Selector + Native Audio */}
            <div className="space-y-3">
              {supportsDraftTier && (
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-neutral-900 rounded-xl border border-white/[0.08]">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setQualityTier('draft')}
                    className={`py-2 rounded-lg text-xs cursor-pointer ${
                      qualityTier === 'draft'
                        ? 'bg-neutral-800 text-white font-semibold'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Draft ({model.draftResolution})
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setQualityTier('final')}
                    className={`py-2 rounded-lg text-xs cursor-pointer ${
                      qualityTier === 'final'
                        ? 'bg-neutral-800 text-white font-semibold'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Full Quality ({effectiveResolution})
                  </button>
                </div>
              )}

              {model.resolutionSelectable &&
                (!supportsDraftTier || qualityTier === 'final') && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold tracking-wider uppercase text-neutral-400 block">
                      Resolution
                    </label>
                    <div
                      className="grid gap-1 p-1 bg-neutral-900 rounded-xl border border-white/[0.08]"
                      style={{
                        gridTemplateColumns: `repeat(${availableResolutions.length}, minmax(0, 1fr))`,
                      }}
                    >
                      {availableResolutions.map((res) => (
                        <button
                          key={res}
                          type="button"
                          disabled={busy}
                          onClick={() => setResolution(res)}
                          className={`py-1.5 rounded-lg text-xs font-mono cursor-pointer ${
                            effectiveResolution === res
                              ? 'bg-neutral-800 text-white font-semibold'
                              : 'text-neutral-400 hover:text-white'
                          }`}
                        >
                          {RESOLUTION_LABELS[res]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

              {(model.family === 'seedance' ||
                model.family === 'flux-3' ||
                model.family === 'kling') && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setNativeAudio((v) => !v)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs border cursor-pointer ${
                    nativeAudio
                      ? 'bg-neutral-900 border-emerald-500/40 text-white'
                      : 'bg-neutral-900/50 border-white/[0.08] text-neutral-400'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {nativeAudio ? (
                      <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <VolumeX className="w-3.5 h-3.5 text-neutral-500" />
                    )}
                    Native Sound Design
                  </span>
                  <span className="font-mono text-[11px]">{nativeAudio ? 'On' : 'Off'}</span>
                </button>
              )}
            </div>

            {/* Advanced Accordion */}
            <div className="pt-2 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="w-full flex items-center justify-between py-1.5 text-xs font-medium text-neutral-400 hover:text-white cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5" />
                  Advanced Parameters
                </span>
                {showAdvanced ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              {showAdvanced && (
                <div className="mt-2 p-3.5 bg-neutral-900/60 border border-white/[0.08] rounded-xl space-y-3 text-xs">
                  {model.supportsSafetyTolerance && (
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-neutral-300">Content Filter Strictness</span>
                        <span className="font-mono text-white">{safetyTolerance}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={4}
                        step={1}
                        value={safetyTolerance}
                        onChange={(e) => setSafetyTolerance(Number(e.target.value))}
                        className="w-full cursor-pointer"
                      />
                    </div>
                  )}

                  {model.family === 'luma' && (
                    <button
                      type="button"
                      onClick={() => setEnableSafetyChecker((v) => !v)}
                      className="w-full flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-neutral-950 border border-white/10 text-xs cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5 text-neutral-300">
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                        Luma Safety Checker (default Off)
                      </span>
                      <span className="font-mono text-[11px] text-white">
                        {enableSafetyChecker ? 'On' : 'Off'}
                      </span>
                    </button>
                  )}

                  {model.supportsSeed && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-300">Generation Seed</span>
                        <button
                          type="button"
                          onClick={() =>
                            setSeed(Math.floor(Math.random() * 900000 + 100000))
                          }
                          className="inline-flex items-center gap-1 text-[11px] text-neutral-400 hover:text-white cursor-pointer"
                        >
                          <Dices className="w-3 h-3" />
                          Randomize
                        </button>
                      </div>
                      <input
                        type="number"
                        value={seed}
                        onChange={(e) =>
                          setSeed(Math.max(0, parseInt(e.target.value, 10) || 0))
                        }
                        className="w-full bg-neutral-950 border border-white/10 rounded-lg px-2.5 py-1 text-xs font-mono text-white"
                      />
                    </div>
                  )}

                  {!model.supportsSafetyTolerance &&
                    !model.supportsSeed &&
                    model.family !== 'luma' && (
                      <p className="text-[11px] text-neutral-400">
                        No extra engine parameters required for {model.label}.
                      </p>
                    )}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Stage Preview + Scrubber + Topaz Upscale + Action Bar */}
          <div className="flex-1 h-full flex flex-col justify-between p-4 sm:p-5 overflow-y-auto gap-4 bg-neutral-950">
            <div className="space-y-3">
              {/* Stage Player with Scrubber & Transport */}
              <div className="bg-neutral-900/70 border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl">
                <div className="aspect-video bg-black relative flex items-center justify-center">
                  {activeStageVideoUrl ? (
                    <video
                      key={activeStageVideoUrl}
                      ref={videoRef}
                      src={activeStageVideoUrl}
                      poster={startFrameUrl || undefined}
                      loop={isLooping}
                      muted={isMuted}
                      playsInline
                      onTimeUpdate={() => {
                        if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
                      }}
                      onLoadedMetadata={() => {
                        if (videoRef.current) setVideoDuration(videoRef.current.duration);
                      }}
                      onEnded={() => setIsPlaying(false)}
                      className="w-full h-full object-contain"
                    />
                  ) : startFrameUrl ? (
                    <img
                      src={startFrameUrl}
                      alt={`Shot ${shot.id} preview`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="text-center text-neutral-500 text-xs space-y-1 p-6">
                      <Play className="w-7 h-7 mx-auto text-neutral-600" />
                      <div>Ready to synthesize shot {shot.id}</div>
                    </div>
                  )}

                  {activeStageVideoUrl && activeStageBadge && (
                    <span
                      className={`absolute top-3 left-3 px-2.5 py-0.5 rounded-md border text-[10px] font-mono font-semibold ${
                        previewVersion === 'upscaled' && shot.upscaledVideoUrl
                          ? 'bg-emerald-500/90 border-emerald-300 text-zinc-950'
                          : 'bg-black/75 border-white/20 text-white'
                      }`}
                    >
                      {activeStageBadge}
                    </span>
                  )}

                  {shot.videoUrl && shot.upscaledVideoUrl && (
                    <div className="absolute top-3 right-3 flex items-center gap-1 p-1 rounded-lg bg-black/80 border border-white/15 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setPreviewVersion('original')}
                        className={`px-2 py-0.5 rounded cursor-pointer ${
                          previewVersion === 'original'
                            ? 'bg-white text-zinc-950 font-semibold'
                            : 'text-zinc-300 hover:text-white'
                        }`}
                      >
                        Original
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewVersion('upscaled')}
                        className={`px-2 py-0.5 rounded cursor-pointer ${
                          previewVersion === 'upscaled'
                            ? 'bg-emerald-400 text-zinc-950 font-semibold'
                            : 'text-zinc-300 hover:text-white'
                        }`}
                      >
                        {shot.upscaledResolution || '4K / Upscaled'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Scrubber + Transport Controls */}
                <div className="p-3 bg-neutral-900/80 border-t border-white/[0.08] space-y-2">
                  <input
                    type="range"
                    min={0}
                    max={videoDuration || duration}
                    step={1 / 24}
                    value={currentTime}
                    disabled={!activeStageVideoUrl}
                    onChange={(e) => {
                      const t = parseFloat(e.target.value);
                      setCurrentTime(t);
                      if (videoRef.current) videoRef.current.currentTime = t;
                    }}
                    className="w-full cursor-pointer disabled:opacity-30"
                  />
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={!activeStageVideoUrl}
                        onClick={togglePlay}
                        className="w-7 h-7 rounded-lg bg-white text-neutral-950 flex items-center justify-center disabled:opacity-30 cursor-pointer"
                      >
                        {isPlaying ? (
                          <Pause className="w-3.5 h-3.5 fill-current" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={!activeStageVideoUrl}
                        onClick={() => stepFrame(-1)}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-white disabled:opacity-30 cursor-pointer"
                        title="Step back 1 frame"
                      >
                        <SkipBack className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={!activeStageVideoUrl}
                        onClick={() => stepFrame(1)}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-white disabled:opacity-30 cursor-pointer"
                        title="Step forward 1 frame"
                      >
                        <SkipForward className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsLooping((v) => !v)}
                        className={`p-1.5 rounded-lg cursor-pointer ${
                          isLooping
                            ? 'text-white bg-white/10'
                            : 'text-neutral-500 hover:text-white'
                        }`}
                        title="Loop playback"
                      >
                        <Repeat className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center bg-neutral-950/60 rounded-md p-0.5 border border-white/[0.08] text-[10px] font-mono">
                        {[0.5, 1, 1.5].map((rate) => (
                          <button
                            key={rate}
                            type="button"
                            onClick={() => {
                              setPlaybackRate(rate);
                              if (videoRef.current) videoRef.current.playbackRate = rate;
                            }}
                            className={`px-1.5 py-0.5 rounded cursor-pointer ${
                              playbackRate === rate
                                ? 'bg-neutral-800 text-white font-semibold'
                                : 'text-neutral-400 hover:text-white'
                            }`}
                          >
                            {rate}x
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsMuted((v) => !v)}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-white cursor-pointer"
                      >
                        {isMuted ? (
                          <VolumeX className="w-3.5 h-3.5" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {errorMsg && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/40 text-xs text-rose-300">
                  {errorMsg}
                </div>
              )}

              {/* Draft Enhance + Universal Topaz Upscaling Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl bg-neutral-900/70 border border-white/[0.08] text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  {shot.draftCacheUrl && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleEnhanceDraft()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-neutral-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-lg cursor-pointer"
                    >
                      {isEnhancing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      {isEnhancing ? 'Enhancing to 1080p...' : 'Enhance Draft to 1080p'}
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setUpscaleModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-zinc-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 rounded-lg cursor-pointer"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    {shot.videoUrl ? 'Upscale with Topaz' : 'Upscale Existing Video'}
                  </button>
                </div>

                {shot.upscaledVideoUrl && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-mono text-[11px] font-semibold">
                      {shot.upscaledResolution || '4K / Upscaled'}
                      {shot.upscaleDetails?.subModel
                        ? ` · ${shot.upscaleDetails.subModel}`
                        : ''}
                    </span>
                    <a
                      href={shot.upscaledVideoUrl}
                      download={`${project.id}-${shot.id}-upscaled.mp4`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 font-medium text-emerald-200 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 rounded-lg"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Upscaled
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Action Bar */}
            <div className="bg-neutral-900/80 border border-white/[0.08] rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex-1 min-w-[220px]">
                <button
                  type="button"
                  disabled={
                    busy || (!prompt.trim() && workflowMode !== 'video_reframe')
                  }
                  onClick={() => void handleGenerate()}
                  className="w-full py-2.5 px-5 rounded-xl font-medium text-xs text-white bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Synthesizing Video...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span className="font-semibold">
                        Generate with {model.label}
                      </span>
                      <span className="ml-1 text-[11px] font-mono opacity-85">
                        · Est. ${estimatedCost.toFixed(2)}
                      </span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!shot.videoUrl || busy}
                  onClick={handleExtendFromCurrent}
                  className="flex items-center gap-1.5 py-2.5 px-3.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-700/80 text-neutral-200 border border-white/[0.08] text-xs font-medium disabled:opacity-30 cursor-pointer"
                  title="Send current clip into V2V / Reference mode"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>Extend / Edit</span>
                </button>

                {activeStageVideoUrl ? (
                  <a
                    href={activeStageVideoUrl}
                    download={`${project.id}-${shot.id}${previewVersion === 'upscaled' && shot.upscaledVideoUrl ? '-upscaled' : ''}.mp4`}
                    className="flex items-center gap-1.5 py-2.5 px-3.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-700/80 text-neutral-200 border border-white/[0.08] text-xs font-medium"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export MP4</span>
                  </a>
                ) : startFrameUrl ? (
                  <a
                    href={startFrameUrl}
                    download={`${project.id}-${shot.id}-start-frame.png`}
                    className="flex items-center gap-1.5 py-2.5 px-3.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-700/80 text-neutral-200 border border-white/[0.08] text-xs font-medium"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Start Frame</span>
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <TopazUpscaleModal
        isOpen={upscaleModalOpen}
        project={project}
        shot={shot}
        onClose={() => setUpscaleModalOpen(false)}
        onProjectUpdated={(updated) => {
          onProjectUpdated(updated);
          setPreviewVersion('upscaled');
        }}
      />
    </div>
  );
};
