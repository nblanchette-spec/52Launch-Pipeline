import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  Loader2,
  Play,
  Pause,
  Square,
  Volume2,
  Download,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Globe,
  Sliders,
  Mic2,
  Wand2,
  VolumeX,
} from 'lucide-react';
import {
  PipelineProject,
  VoScriptLine,
  VoStudioSettings,
} from '../../types/pipeline';
import {
  ALL_GEMINI_VOICE_PRESETS,
  CORE_GEMINI_VOICES,
  DEFAULT_VO_SETTINGS,
  EMOTIONAL_TONES,
  SUPPORTED_LANGUAGES,
} from '../../utils/voPresets';
import {
  base64ToAudioBuffer,
  concatenateAudioBuffers,
  exportMasterOrStems,
  getAudioContext,
  processAudioWithDSP,
  urlToAudioBuffer,
} from '../../utils/voAudioEngine';

interface Step8VoStudioProps {
  project: PipelineProject;
  onUpdateProject: (updated: PipelineProject) => Promise<void>;
  onProjectUpdated: (updated: PipelineProject) => void;
  onGenerateVoScript: () => Promise<void>;
  onApproveVo: () => Promise<void>;
}

const TIMELINE_SEGMENT_COLORS = [
  '#f59e0b',
  '#10b981',
  '#38bdf8',
  '#a78bfa',
  '#fb7185',
  '#34d399',
];

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function pitchRatioToSemitones(ratio: number): number {
  return Math.round(12 * Math.log2(Math.max(0.5, ratio)) * 2) / 2;
}

function semitonesToPitchRatio(semitones: number): number {
  return Number(Math.pow(2, semitones / 12).toFixed(3));
}

export const Step8VoStudio: React.FC<Step8VoStudioProps> = ({
  project,
  onUpdateProject,
  onProjectUpdated,
  onGenerateVoScript,
  onApproveVo,
}) => {
  const voSettings: VoStudioSettings = useMemo(
    () => ({
      ...DEFAULT_VO_SETTINGS,
      ...(project.voSettings || {}),
    }),
    [project.voSettings]
  );

  const [isWritingScript, setIsWritingScript] = useState(false);
  const [confirmOverwriteOpen, setConfirmOverwriteOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  // Voice audition & generation state
  const [auditioningVoiceId, setAuditioningVoiceId] = useState<string | null>(null);
  const [generatingLineId, setGeneratingLineId] = useState<string | null>(null);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);

  // Translation popover state
  const [translateOpen, setTranslateOpen] = useState(false);
  const [translateTargetLang, setTranslateTargetLang] = useState('es-MX');
  const [isTranslating, setIsTranslating] = useState(false);

  // Export modal state
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMode, setExportMode] = useState<'master' | 'stems'>('master');
  const [exportFormat, setExportFormat] = useState<'wav' | 'mp3'>('wav');
  const [exportBitrate, setExportBitrate] = useState<128 | 192 | 320>(320);
  const [exportNormalize, setExportNormalize] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Audio playback & waveform state
  const rawBufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  const [processedBuffers, setProcessedBuffers] = useState<
    Array<{
      line: VoScriptLine;
      buffer: AudioBuffer;
      startSec: number;
      endSec: number;
      pauseAfter: number;
    }>
  >([]);
  const [isDecodingAudio, setIsDecodingAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [volume, setVolume] = useState(0.95);
  const [isMuted, setIsMuted] = useState(false);
  const [activePlayingLineId, setActivePlayingLineId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playbackSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const masterPlayBufferRef = useRef<AudioBuffer | null>(null);
  const playStartCtxTimeRef = useRef<number>(0);
  const playOffsetRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  const totalShotSeconds = useMemo(
    () => project.shots.reduce((sum, s) => sum + (Number(s.durationSec) || 0), 0),
    [project.shots]
  );

  const readyAudioLines = useMemo(
    () => project.voScript.filter((v) => Boolean(v.audioUrl)),
    [project.voScript]
  );

  const selectedVoiceMeta = useMemo(
    () =>
      ALL_GEMINI_VOICE_PRESETS.find((v) => v.id === voSettings.voiceName) ||
      CORE_GEMINI_VOICES[0],
    [voSettings.voiceName]
  );

  const stopPlayback = useCallback(() => {
    if (playbackSourceRef.current) {
      try {
        playbackSourceRef.current.stop();
        playbackSourceRef.current.disconnect();
      } catch {
        // Ignore already stopped
      }
      playbackSourceRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsPlaying(false);
    setActivePlayingLineId(null);
  }, []);

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  // Rebuild processed DSP audio timeline whenever lines or DSP settings change
  useEffect(() => {
    let cancelled = false;

    const rebuildTimeline = async () => {
      const linesWithAudio = project.voScript.filter((v) => Boolean(v.audioUrl));
      if (linesWithAudio.length === 0) {
        masterPlayBufferRef.current = null;
        setProcessedBuffers([]);
        setTotalDuration(0);
        setCurrentTime(0);
        return;
      }

      setIsDecodingAudio(true);
      try {
        const ctx = getAudioContext();
        const segments: Array<{
          line: VoScriptLine;
          buffer: AudioBuffer;
          startSec: number;
          endSec: number;
          pauseAfter: number;
        }> = [];
        let cursor = 0;

        for (let i = 0; i < linesWithAudio.length; i++) {
          const line = linesWithAudio[i];
          if (!line.audioUrl) continue;

          let rawBuf = rawBufferCacheRef.current.get(line.audioUrl);
          if (!rawBuf) {
            rawBuf = await urlToAudioBuffer(line.audioUrl, ctx);
            rawBufferCacheRef.current.set(line.audioUrl, rawBuf);
          }

          const lineTone =
            EMOTIONAL_TONES.find(
              (t) => t.id === (line.emotionalTone || voSettings.emotionalTone)
            ) || EMOTIONAL_TONES[0];

          const effectiveSpeed = voSettings.singleVoiceMode
            ? voSettings.speed
            : (line.speed ?? voSettings.speed);
          const effectivePitch = voSettings.singleVoiceMode
            ? voSettings.pitch
            : (line.pitch ?? voSettings.pitch);

          const processed = voSettings.enhanceWithDSP
            ? await processAudioWithDSP(rawBuf, {
                speed: effectiveSpeed,
                pitch: effectivePitch,
                bassBoostDb: lineTone.dspProfile.bassBoostDb,
                trebleBoostDb: lineTone.dspProfile.trebleBoostDb,
                midPresenceDb: lineTone.dspProfile.midPresenceDb,
                reverbWet: lineTone.dspProfile.reverbWet,
                compression: true,
              })
            : await processAudioWithDSP(rawBuf, {
                speed: effectiveSpeed,
                pitch: effectivePitch,
              });

          const gap = line.pauseAfter ?? voSettings.pauseAfter;
          segments.push({
            line,
            buffer: processed,
            startSec: cursor,
            endSec: cursor + processed.duration,
            pauseAfter: gap,
          });
          cursor += processed.duration + (i < linesWithAudio.length - 1 ? gap : 0);
        }

        if (cancelled) return;

        const gapMap: Record<number, number> = {};
        segments.forEach((seg, idx) => {
          gapMap[idx] = seg.pauseAfter;
        });

        const master = concatenateAudioBuffers(
          ctx,
          segments.map((s) => s.buffer),
          voSettings.pauseAfter,
          gapMap
        );

        masterPlayBufferRef.current = master;
        setProcessedBuffers(segments);
        setTotalDuration(master ? master.duration : 0);
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(
            err instanceof Error ? err.message : 'Could not decode saved VO audio.'
          );
        }
      } finally {
        if (!cancelled) setIsDecodingAudio(false);
      }
    };

    void rebuildTimeline();
    return () => {
      cancelled = true;
    };
  }, [
    project.voScript,
    voSettings.enhanceWithDSP,
    voSettings.speed,
    voSettings.pitch,
    voSettings.pauseAfter,
    voSettings.emotionalTone,
    voSettings.singleVoiceMode,
  ]);

  // Draw waveform canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx2d.clearRect(0, 0, width, height);
    ctx2d.fillStyle = '#0B0D10';
    ctx2d.fillRect(0, 0, width, height);

    const master = masterPlayBufferRef.current;
    if (!master || totalDuration <= 0) {
      ctx2d.strokeStyle = '#262B36';
      ctx2d.beginPath();
      ctx2d.moveTo(0, height / 2);
      ctx2d.lineTo(width, height / 2);
      ctx2d.stroke();
      return;
    }

    const channelData = master.getChannelData(0);
    const barCount = 120;
    const step = Math.max(1, Math.floor(channelData.length / barCount));
    const barWidth = width / barCount;
    const progressRatio = Math.min(1, Math.max(0, currentTime / totalDuration));

    for (let i = 0; i < barCount; i++) {
      let peak = 0;
      const startIdx = i * step;
      for (let j = 0; j < step && startIdx + j < channelData.length; j += 4) {
        const val = Math.abs(channelData[startIdx + j]);
        if (val > peak) peak = val;
      }
      const barH = Math.max(4, peak * (height * 0.84));
      const x = i * barWidth;
      const y = (height - barH) / 2;
      const isPlayed = i / barCount <= progressRatio;
      ctx2d.fillStyle = isPlayed ? '#f59e0b' : '#334155';
      ctx2d.fillRect(x + 1, y, Math.max(2, barWidth - 2), barH);
    }

    // Playhead needle
    const needleX = progressRatio * width;
    ctx2d.fillStyle = '#fef3c7';
    ctx2d.fillRect(needleX, 0, 2, height);
  }, [processedBuffers, currentTime, totalDuration]);

  // Live gain adjustment
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const startPlaybackFrom = (offsetSec: number) => {
    const master = masterPlayBufferRef.current;
    if (!master) return;

    stopPlayback();
    const audioCtx = getAudioContext();
    const safeOffset = Math.max(0, Math.min(offsetSec, master.duration - 0.05));

    const source = audioCtx.createBufferSource();
    source.buffer = master;
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = isMuted ? 0 : volume;

    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    playbackSourceRef.current = source;
    gainNodeRef.current = gainNode;
    playStartCtxTimeRef.current = audioCtx.currentTime;
    playOffsetRef.current = safeOffset;
    setIsPlaying(true);

    source.onended = () => {
      if (playbackSourceRef.current === source) {
        playbackSourceRef.current = null;
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        setIsPlaying(false);
        setActivePlayingLineId(null);
        setCurrentTime(0);
        playOffsetRef.current = 0;
      }
    };

    source.start(0, safeOffset);

    const tick = () => {
      if (!playbackSourceRef.current) return;
      const elapsed = audioCtx.currentTime - playStartCtxTimeRef.current;
      const pos = Math.min(master.duration, playOffsetRef.current + elapsed);
      setCurrentTime(pos);

      const seg = processedBuffers.find((s) => pos >= s.startSec && pos <= s.endSec);
      setActivePlayingLineId(seg ? seg.line.id : null);

      if (pos < master.duration) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const handleTogglePlay = () => {
    if (isPlaying) {
      playOffsetRef.current = currentTime;
      stopPlayback();
    } else {
      startPlaybackFrom(currentTime >= totalDuration - 0.05 ? 0 : currentTime);
    }
  };

  const handlePlaySingleLine = async (line: VoScriptLine) => {
    if (!line.audioUrl) return;
    const seg = processedBuffers.find((s) => s.line.id === line.id);
    if (seg) {
      startPlaybackFrom(seg.startSec);
      return;
    }
    try {
      stopPlayback();
      const ctx = getAudioContext();
      const buf = await urlToAudioBuffer(line.audioUrl, ctx);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.value = isMuted ? 0 : volume;
      src.connect(gain);
      gain.connect(ctx.destination);
      playbackSourceRef.current = src;
      setIsPlaying(true);
      setActivePlayingLineId(line.id);
      src.onended = () => {
        setIsPlaying(false);
        setActivePlayingLineId(null);
      };
      src.start(0);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not play line audio.');
    }
  };

  const updateVoSettings = (patch: Partial<VoStudioSettings>) => {
    const nextSettings: VoStudioSettings = { ...voSettings, ...patch };
    void onUpdateProject({
      ...project,
      voSettings: nextSettings,
    });
  };

  const handleApplySettingsToAllLines = () => {
    const nextLines = project.voScript.map((v) => ({
      ...v,
      voiceName: voSettings.voiceName,
      emotionalTone: voSettings.emotionalTone,
      emotionIntensity: voSettings.emotionIntensity,
      speed: voSettings.speed,
      pitch: voSettings.pitch,
      language: voSettings.language,
      pauseAfter: voSettings.pauseAfter,
    }));
    void onUpdateProject({
      ...project,
      voScript: nextLines,
      voManuallyEdited: true,
    });
    setStatusNote(
      `Applied ${voSettings.voiceName} (${voSettings.emotionalTone}) settings across all ${nextLines.length} lines.`
    );
  };

  const updateVoLine = (lineId: string, patch: Partial<VoScriptLine>) => {
    const nextLines = project.voScript.map((v) =>
      v.id === lineId ? { ...v, ...patch } : v
    );
    void onUpdateProject({
      ...project,
      voScript: nextLines,
      voManuallyEdited: true,
      approvals: {
        ...project.approvals,
        voApproved: false,
        shootPlanApproved: false,
      },
    });
  };

  const handleAddLine = () => {
    const fallbackShot = project.shots[0];
    const durationSec = Number(fallbackShot?.durationSec) || 4;
    const newLine: VoScriptLine = {
      id: `vo-${Date.now()}`,
      shotId: fallbackShot?.id || `S${String(project.voScript.length + 1).padStart(2, '0')}`,
      speaker: project.creativeBrief.voDirection.speaker || 'Narrator',
      direction: 'warm, clear commercial delivery',
      line: '',
      audioTags: 'clear studio delivery',
      emotionalTone: voSettings.emotionalTone,
      emotionIntensity: voSettings.emotionIntensity,
      voiceName: voSettings.voiceName,
      speed: voSettings.speed,
      pitch: voSettings.pitch,
      language: voSettings.language,
      pauseAfter: voSettings.pauseAfter,
      audioUrl: null,
      durationSec,
      targetWords: Math.max(3, Math.round(durationSec * 2.5)),
    };
    void onUpdateProject({
      ...project,
      voScript: [...project.voScript, newLine],
      voHasGenerated: true,
      voManuallyEdited: true,
      approvals: {
        ...project.approvals,
        voApproved: false,
        shootPlanApproved: false,
      },
    });
  };

  const handleRemoveLine = (lineId: string) => {
    void onUpdateProject({
      ...project,
      voScript: project.voScript.filter((v) => v.id !== lineId),
      voManuallyEdited: true,
      approvals: {
        ...project.approvals,
        voApproved: false,
        shootPlanApproved: false,
      },
    });
  };

  const handleWriteScriptClick = async (confirmed = false) => {
    if (project.voManuallyEdited && !confirmed) {
      setConfirmOverwriteOpen(true);
      return;
    }
    setConfirmOverwriteOpen(false);
    setErrorMsg(null);
    setIsWritingScript(true);
    try {
      await onGenerateVoScript();
      setStatusNote('VO script written from your approved shots and brand voice.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not write VO script.');
    } finally {
      setIsWritingScript(false);
    }
  };

  const handleAuditionVoice = async (voiceId: string, sampleText?: string) => {
    setErrorMsg(null);
    setAuditioningVoiceId(voiceId);
    try {
      const preset = ALL_GEMINI_VOICE_PRESETS.find((v) => v.id === voiceId);
      const resp = await fetch('/api/pipeline/vo-audition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text:
            sampleText ||
            preset?.sampleSentence ||
            'Designed for quiet precision when every second counts.',
          voiceName: voiceId,
          emotionalTone: voSettings.emotionalTone,
          emotionIntensity: voSettings.emotionIntensity,
          ttsModel: voSettings.ttsModel,
          language: voSettings.language,
          stylePrompt: voSettings.customStylePrompt,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Voice audition failed.');

      stopPlayback();
      const ctx = getAudioContext();
      const buf = await base64ToAudioBuffer(data.audioBase64, ctx);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.value = isMuted ? 0 : volume;
      src.connect(gain);
      gain.connect(ctx.destination);
      playbackSourceRef.current = src;
      setIsPlaying(true);
      src.onended = () => setIsPlaying(false);
      src.start(0);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not audition voice.');
    } finally {
      setAuditioningVoiceId(null);
    }
  };

  const synthesizeLine = async (line: VoScriptLine): Promise<PipelineProject | null> => {
    if (!line.line.trim()) return null;
    setGeneratingLineId(line.id);
    const activeVoice = voSettings.singleVoiceMode
      ? voSettings.voiceName
      : line.voiceName || voSettings.voiceName;
    const activeTone = line.emotionalTone || voSettings.emotionalTone;
    const activeSpeed = voSettings.singleVoiceMode
      ? voSettings.speed
      : line.speed ?? voSettings.speed;
    const activePitch = voSettings.singleVoiceMode
      ? voSettings.pitch
      : line.pitch ?? voSettings.pitch;

    const resp = await fetch('/api/pipeline/vo-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: project.id,
        lineId: line.id,
        line: line.line,
        direction: line.direction,
        speaker: line.speaker,
        audioTags: line.audioTags,
        emotionalTone: activeTone,
        emotionIntensity: line.emotionIntensity ?? voSettings.emotionIntensity,
        voiceName: activeVoice,
        speed: activeSpeed,
        pitch: activePitch,
        language: voSettings.language,
        pauseAfter: line.pauseAfter ?? voSettings.pauseAfter,
        ttsModel: voSettings.ttsModel,
        stylePrompt: voSettings.customStylePrompt,
        skipPitchText: voSettings.enhanceWithDSP,
        skipSpeedText: voSettings.enhanceWithDSP,
        voSettings,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || `Could not synthesize ${line.shotId}.`);

    // Pre-cache audio buffer from returned base64 for snappy playback
    if (data.audioBase64 && data.audioUrl) {
      try {
        const ctx = getAudioContext();
        const buf = await base64ToAudioBuffer(data.audioBase64, ctx);
        rawBufferCacheRef.current.set(data.audioUrl, buf);
      } catch {
        // Fallback to URL fetch if decode deferred
      }
    }
    onProjectUpdated(data.project);
    return data.project as PipelineProject;
  };

  const handleGenerateSingleLine = async (line: VoScriptLine) => {
    setErrorMsg(null);
    setStatusNote(null);
    try {
      await synthesizeLine(line);
      setStatusNote(`Voiceover audio ready for ${line.shotId}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Voice generation failed.');
    } finally {
      setGeneratingLineId(null);
    }
  };

  const handleGenerateAllAudio = async () => {
    const speakable = project.voScript.filter((v) => v.line.trim().length > 0);
    if (speakable.length === 0) return;

    setErrorMsg(null);
    setStatusNote(null);
    setIsGeneratingAll(true);
    try {
      for (const line of speakable) {
        await synthesizeLine(line);
      }
      setStatusNote(
        `Rendered ${speakable.length} voiceover clip${speakable.length === 1 ? '' : 's'} with Gemini TTS.`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Batch voiceover generation stopped early.'
      );
    } finally {
      setGeneratingLineId(null);
      setIsGeneratingAll(false);
    }
  };

  const handleTranslateScript = async () => {
    setErrorMsg(null);
    setIsTranslating(true);
    try {
      const langMeta = SUPPORTED_LANGUAGES.find((l) => l.code === translateTargetLang);
      const resp = await fetch('/api/pipeline/vo-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          targetLanguage: translateTargetLang,
          targetLanguageName: langMeta?.name || translateTargetLang,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Could not translate script.');
      onProjectUpdated(data.project);
      setTranslateOpen(false);
      setStatusNote(
        `Translated VO script into ${langMeta?.name || translateTargetLang}. Regenerate audio clips to hear the new language.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Translation failed.');
    } finally {
      setIsTranslating(false);
    }
  };

  const handleRunExport = async () => {
    if (processedBuffers.length === 0) return;
    setIsExporting(true);
    setErrorMsg(null);
    try {
      await exportMasterOrStems({
        projectName: `${project.client}-${project.product.name}`,
        items: processedBuffers.map((seg) => ({
          shotId: seg.line.shotId,
          speaker: seg.line.speaker,
          line: seg.line.line,
          buffer: seg.buffer,
          pauseAfter: seg.pauseAfter,
        })),
        format: exportFormat,
        bitrate: exportBitrate,
        normalize: exportNormalize,
        mode: exportMode,
      });
      setExportOpen(false);
      setStatusNote(
        exportMode === 'master'
          ? `Downloaded master ${exportFormat.toUpperCase()} voiceover track.`
          : `Downloaded individual stems (.zip) in ${exportFormat.toUpperCase()}.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  const pitchSemitones = pitchRatioToSemitones(voSettings.pitch);

  return (
    <div className="max-w-[1320px] mx-auto px-6 py-7 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-[#262B36]">
        <div>
          <div className="text-xs font-medium text-amber-400">
            Step 8 · VO Script &amp; Gemini Voice Studio
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 mt-1">
            Voiceover Script &amp; Audio Production
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Timed at ~2.5 words per second to fit your shots. Cast from 30 Gemini voices,
            dial in emotional tone &amp; pacing, audition live, and export master WAV/MP3 or stems.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={isWritingScript || project.shots.length === 0}
            onClick={() => void handleWriteScriptClick(false)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-100 bg-[#14171D] border border-[#262B36] hover:border-amber-500 disabled:opacity-40 rounded-lg transition-colors cursor-pointer"
          >
            {isWritingScript ? (
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
            ) : (
              <Sparkles className="w-4 h-4 text-amber-400" />
            )}
            {isWritingScript
              ? 'Writing VO Script...'
              : project.voScript.length > 0
                ? 'Refresh VO script'
                : 'Write VO script (Gemini)'}
          </button>

          <div className="relative">
            <button
              type="button"
              disabled={project.voScript.length === 0}
              onClick={() => setTranslateOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-200 bg-[#14171D] border border-[#262B36] hover:border-zinc-500 disabled:opacity-40 rounded-lg transition-colors cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 text-sky-400" />
              Translate
            </button>
            {translateOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-[#14171D] border border-[#262B36] rounded-xl p-4 shadow-2xl z-30 space-y-3">
                <div className="text-xs font-semibold text-zinc-100">
                  Translate Script for International Spot
                </div>
                <select
                  value={translateTargetLang}
                  onChange={(e) => setTranslateTargetLang(e.target.value)}
                  className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-2.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.flag} {lang.name}
                    </option>
                  ))}
                </select>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setTranslateOpen(false)}
                    className="px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isTranslating}
                    onClick={() => void handleTranslateScript()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg cursor-pointer"
                  >
                    {isTranslating && <Loader2 className="w-3 h-3 animate-spin" />}
                    Translate Lines
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={
              isGeneratingAll ||
              Boolean(generatingLineId) ||
              project.voScript.every((v) => !v.line.trim())
            }
            onClick={() => void handleGenerateAllAudio()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 rounded-lg transition-colors cursor-pointer"
          >
            {isGeneratingAll ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Mic2 className="w-3.5 h-3.5" />
            )}
            {isGeneratingAll
              ? 'Generating VO...'
              : `Generate all VO audio (${project.voScript.filter((v) => v.line.trim()).length})`}
          </button>

          <button
            type="button"
            disabled={processedBuffers.length === 0}
            onClick={() => setExportOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-200 bg-[#14171D] border border-[#262B36] hover:border-zinc-500 disabled:opacity-40 rounded-lg transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export WAV / MP3
          </button>

          {project.approvals.voApproved ? (
            <span className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-zinc-950 bg-emerald-400 rounded-lg whitespace-nowrap">
              <CheckCircle2 className="w-4 h-4" />
              VO Approved
            </span>
          ) : (
            <button
              type="button"
              disabled={project.voScript.length === 0}
              onClick={() => void onApproveVo()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-zinc-100 bg-[#14171D] border border-emerald-500/50 hover:bg-emerald-500/15 disabled:opacity-40 rounded-lg transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Approve VO &amp; go to Shoot Plan
            </button>
          )}
        </div>
      </div>

      {/* Overwrite manual edit confirmation */}
      {confirmOverwriteOpen && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-amber-100">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong>You have manual edits in the VO script.</strong> Refreshing from
              Gemini will replace your current lines. Continue?
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setConfirmOverwriteOpen(false)}
              className="px-3 py-1.5 text-xs font-medium text-zinc-200 bg-[#14171D] border border-[#262B36] rounded-lg cursor-pointer"
            >
              Keep my edits
            </button>
            <button
              type="button"
              onClick={() => void handleWriteScriptClick(true)}
              className="px-3.5 py-1.5 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg cursor-pointer"
            >
              Replace with fresh Gemini script
            </button>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/40 text-xs text-rose-300">
          {errorMsg}
        </div>
      )}

      {statusNote && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200">
          {statusNote}
        </div>
      )}

      {/* Main Split Studio Layout: Left Voice & Delivery Casting, Right Waveform + Script Lines */}
      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-6 items-start">
        {/* LEFT PANEL: Gemini Voice Casting & Delivery Studio */}
        <aside className="bg-[#14171D] border border-[#262B36] rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-zinc-100">
                Voice Casting &amp; Delivery
              </h2>
            </div>
            <span className="text-[11px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
              Gemini 3.8 TTS
            </span>
          </div>

          {/* Core Featured Voices Quick Picker + 30 Voice Dropdown */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <label className="font-medium text-zinc-300">
                Cast Voice (30 Gemini Studio Voices)
              </label>
              <button
                type="button"
                disabled={auditioningVoiceId !== null}
                onClick={() =>
                  void handleAuditionVoice(
                    voSettings.voiceName,
                    selectedVoiceMeta.sampleSentence
                  )
                }
                className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 font-medium cursor-pointer disabled:opacity-40"
              >
                {auditioningVoiceId === voSettings.voiceName ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
                Audition {voSettings.voiceName}
              </button>
            </div>

            <select
              value={voSettings.voiceName}
              onChange={(e) => updateVoSettings({ voiceName: e.target.value })}
              className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
            >
              {ALL_GEMINI_VOICE_PRESETS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.displayName} ({v.gender}) — {v.timbre}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-2 pt-1">
              {CORE_GEMINI_VOICES.map((voice) => {
                const selected = voSettings.voiceName === voice.id;
                return (
                  <button
                    key={voice.id}
                    type="button"
                    onClick={() => updateVoSettings({ voiceName: voice.id })}
                    className={`text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
                      selected
                        ? 'bg-amber-500/15 border-amber-500 text-zinc-100'
                        : 'bg-[#0B0D10] border-[#262B36] hover:border-zinc-500 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">{voice.displayName}</span>
                      <span className="text-[10px] text-zinc-400">{voice.gender}</span>
                    </div>
                    <div className="text-[10px] text-zinc-400 mt-0.5 truncate">
                      {voice.timbre}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              <strong className="text-zinc-200">{selectedVoiceMeta.displayName}:</strong>{' '}
              {selectedVoiceMeta.description} Best for {selectedVoiceMeta.bestFor}.
            </p>
          </div>

          {/* 10 Emotional Tone Presets */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-300 block">
              Emotional Performance Tone
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {EMOTIONAL_TONES.map((tone) => {
                const active = voSettings.emotionalTone === tone.id;
                return (
                  <button
                    key={tone.id}
                    type="button"
                    onClick={() => updateVoSettings({ emotionalTone: tone.id })}
                    className={`px-2.5 py-2 rounded-lg border text-left text-[11px] transition-colors cursor-pointer ${
                      active
                        ? 'bg-amber-500/15 border-amber-500 text-amber-200 font-semibold'
                        : 'bg-[#0B0D10] border-[#262B36] hover:border-zinc-500 text-zinc-300'
                    }`}
                  >
                    {tone.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sliders: Emotion Intensity, Speed, Pitch, Gap */}
          <div className="space-y-3.5 pt-1 border-t border-[#262B36]">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-300">Emotion Intensity</span>
                <span className="font-mono text-amber-300 tabular-nums">
                  {Math.round(voSettings.emotionIntensity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1.0}
                step={0.05}
                value={voSettings.emotionIntensity}
                onChange={(e) =>
                  updateVoSettings({ emotionIntensity: Number(e.target.value) })
                }
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-300">Speaking Speed</span>
                <span className="font-mono text-amber-300 tabular-nums">
                  {voSettings.speed.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min={0.65}
                max={1.45}
                step={0.05}
                value={voSettings.speed}
                onChange={(e) => updateVoSettings({ speed: Number(e.target.value) })}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-300">Vocal Pitch</span>
                <span className="font-mono text-amber-300 tabular-nums">
                  {pitchSemitones > 0 ? `+${pitchSemitones}` : pitchSemitones} st
                </span>
              </div>
              <input
                type="range"
                min={-5}
                max={5}
                step={0.5}
                value={pitchSemitones}
                onChange={(e) =>
                  updateVoSettings({
                    pitch: semitonesToPitchRatio(Number(e.target.value)),
                  })
                }
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-300">Gap Between Shots</span>
                <span className="font-mono text-amber-300 tabular-nums">
                  {voSettings.pauseAfter.toFixed(2)}s
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={2.0}
                step={0.05}
                value={voSettings.pauseAfter}
                onChange={(e) =>
                  updateVoSettings({ pauseAfter: Number(e.target.value) })
                }
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Language, Model, DSP Toggle, Director Prompt */}
          <div className="space-y-3 pt-2 border-t border-[#262B36]">
            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">
                Voice Accent / Language
              </label>
              <select
                value={voSettings.language}
                onChange={(e) => updateVoSettings({ language: e.target.value })}
                className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">
                Gemini Voice Engine
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    updateVoSettings({ ttsModel: 'gemini-3.8-flash-tts' })
                  }
                  className={`px-2.5 py-2 rounded-lg border text-xs font-medium cursor-pointer ${
                    voSettings.ttsModel === 'gemini-3.8-flash-tts'
                      ? 'bg-amber-500/15 border-amber-500 text-amber-200'
                      : 'bg-[#0B0D10] border-[#262B36] text-zinc-400'
                  }`}
                >
                  Flash 3.8 Studio
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateVoSettings({ ttsModel: 'gemini-3.8-flash-lite-tts' })
                  }
                  className={`px-2.5 py-2 rounded-lg border text-xs font-medium cursor-pointer ${
                    voSettings.ttsModel === 'gemini-3.8-flash-lite-tts'
                      ? 'bg-amber-500/15 border-amber-500 text-amber-200'
                      : 'bg-[#0B0D10] border-[#262B36] text-zinc-400'
                  }`}
                >
                  Flash 3.8 Lite
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">
                Director Acting Note (Optional)
              </label>
              <textarea
                rows={2}
                value={voSettings.customStylePrompt || ''}
                onChange={(e) =>
                  updateVoSettings({ customStylePrompt: e.target.value })
                }
                placeholder="e.g. Close-mic documentary warmth, subtle smile on the product name..."
                className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
              />
            </div>

            <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer py-1">
              <span>Studio DSP Polish (EQ &amp; Compression)</span>
              <input
                type="checkbox"
                checked={voSettings.enhanceWithDSP}
                onChange={(e) =>
                  updateVoSettings({ enhanceWithDSP: e.target.checked })
                }
                className="accent-amber-500 w-4 h-4 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer py-1">
              <span>Single Cast Voice Across All Lines</span>
              <input
                type="checkbox"
                checked={voSettings.singleVoiceMode}
                onChange={(e) =>
                  updateVoSettings({ singleVoiceMode: e.target.checked })
                }
                className="accent-amber-500 w-4 h-4 cursor-pointer"
              />
            </label>

            {project.voScript.length > 0 && (
              <button
                type="button"
                onClick={handleApplySettingsToAllLines}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-200 bg-[#0B0D10] border border-[#262B36] hover:border-amber-500 rounded-lg transition-colors cursor-pointer"
              >
                <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                Apply voice &amp; tone to all lines
              </button>
            )}
          </div>
        </aside>

        {/* RIGHT COLUMN: Master Waveform Timeline + Timed Shot VO Cards */}
        <div className="space-y-5 min-w-0">
          {/* Interactive Waveform Timeline Player */}
          <div className="bg-[#14171D] border border-[#262B36] rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-zinc-100">
                  Master Voiceover Timeline
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {readyAudioLines.length} of {project.voScript.length} lines rendered · VO
                  runtime{' '}
                  <span className="font-mono text-zinc-200 tabular-nums">
                    {totalDuration.toFixed(1)}s
                  </span>{' '}
                  vs Shot Board{' '}
                  <span className="font-mono text-zinc-200 tabular-nums">
                    {totalShotSeconds}s
                  </span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!masterPlayBufferRef.current || isDecodingAudio}
                  onClick={handleTogglePlay}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 rounded-lg cursor-pointer"
                >
                  {isDecodingAudio ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="w-3.5 h-3.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  {isPlaying ? 'Pause' : 'Play Master VO'}
                </button>

                <button
                  type="button"
                  disabled={!isPlaying && currentTime === 0}
                  onClick={() => {
                    stopPlayback();
                    setCurrentTime(0);
                    playOffsetRef.current = 0;
                  }}
                  className="p-2 text-zinc-300 bg-[#0B0D10] border border-[#262B36] hover:border-zinc-500 disabled:opacity-40 rounded-lg cursor-pointer"
                  aria-label="Stop playback"
                >
                  <Square className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsMuted((m) => !m)}
                  className="p-2 text-zinc-300 bg-[#0B0D10] border border-[#262B36] hover:border-zinc-500 rounded-lg cursor-pointer"
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? (
                    <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                </button>

                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    setIsMuted(false);
                    setVolume(Number(e.target.value));
                  }}
                  className="w-20 accent-amber-500 cursor-pointer"
                  aria-label="Master volume"
                />

                <span className="font-mono text-xs text-zinc-300 tabular-nums pl-1">
                  {currentTime.toFixed(1)}s / {totalDuration.toFixed(1)}s
                </span>
              </div>
            </div>

            {/* Canvas Waveform (Click to seek) */}
            <div className="space-y-2">
              <canvas
                ref={canvasRef}
                width={900}
                height={76}
                onClick={(e) => {
                  if (!masterPlayBufferRef.current || totalDuration <= 0) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = Math.max(
                    0,
                    Math.min(1, (e.clientX - rect.left) / rect.width)
                  );
                  startPlaybackFrom(ratio * totalDuration);
                }}
                className="w-full h-[76px] rounded-lg border border-[#262B36] cursor-pointer block"
              />

              {/* Per-Shot Segment Strip */}
              {processedBuffers.length > 0 && totalDuration > 0 && (
                <div className="flex w-full h-6 rounded-md overflow-hidden border border-[#262B36] bg-[#0B0D10]">
                  {processedBuffers.map((seg, idx) => {
                    const widthPct = Math.max(
                      4,
                      ((seg.endSec - seg.startSec) / totalDuration) * 100
                    );
                    const color =
                      TIMELINE_SEGMENT_COLORS[idx % TIMELINE_SEGMENT_COLORS.length];
                    const isSegActive = activePlayingLineId === seg.line.id;
                    return (
                      <button
                        key={seg.line.id}
                        type="button"
                        style={{ width: `${widthPct}%`, borderBottomColor: color }}
                        onClick={() => startPlaybackFrom(seg.startSec)}
                        title={`${seg.line.shotId}: ${seg.line.line}`}
                        className={`px-1.5 text-[10px] font-mono truncate border-b-2 border-r border-[#262B36] text-left cursor-pointer transition-colors ${
                          isSegActive
                            ? 'bg-amber-500/25 text-amber-100 font-bold'
                            : 'bg-[#14171D] text-zinc-300 hover:bg-[#1D222B]'
                        }`}
                      >
                        {seg.line.shotId}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Empty State */}
          {project.voScript.length === 0 ? (
            <div className="bg-[#14171D] border border-dashed border-[#262B36] rounded-xl p-10 text-center space-y-3">
              <Mic2 className="w-8 h-8 text-amber-400 mx-auto" />
              <h3 className="text-base font-semibold text-zinc-100">
                No Voiceover Script Written Yet
              </h3>
              <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                Click <strong className="text-zinc-200">Write VO script (Gemini)</strong>{' '}
                above to draft timed lines matched to your shots (~2.5 words/sec) and Brand
                Bible claims rules, or add a custom line manually.
              </p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={isWritingScript}
                  onClick={() => void handleWriteScriptClick(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Write VO script (Gemini)
                </button>
                <button
                  type="button"
                  onClick={handleAddLine}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-200 bg-[#0B0D10] border border-[#262B36] hover:border-zinc-500 rounded-lg cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add line manually
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {project.voScript.map((line, index) => {
                const linkedShot = project.shots.find((s) => s.id === line.shotId);
                const shotSec = Number(linkedShot?.durationSec ?? line.durationSec ?? 4);
                const targetWords = Math.max(3, Math.round(shotSec * 2.5));
                const actualWords = countWords(line.line);
                const isOverBudget = actualWords > targetWords + 2;
                const isGeneratingThis = generatingLineId === line.id;
                const isPlayingThis = activePlayingLineId === line.id;

                return (
                  <div
                    key={line.id}
                    className={`bg-[#14171D] border rounded-xl overflow-hidden transition-colors ${
                      isPlayingThis ? 'border-amber-500' : 'border-[#262B36]'
                    }`}
                  >
                    <div className="px-4 py-2.5 bg-[#101318] border-b border-[#262B36] flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="text-zinc-500 font-mono">
                          #{String(index + 1).padStart(2, '0')}
                        </span>
                        <select
                          aria-label="Linked shot"
                          value={line.shotId}
                          onChange={(e) => {
                            const nextShot = project.shots.find(
                              (s) => s.id === e.target.value
                            );
                            const nextSec = Number(nextShot?.durationSec) || 4;
                            updateVoLine(line.id, {
                              shotId: e.target.value,
                              durationSec: nextSec,
                              targetWords: Math.max(3, Math.round(nextSec * 2.5)),
                            });
                          }}
                          className="bg-[#0B0D10] border border-[#262B36] rounded px-2 py-1 font-mono font-bold text-amber-400 text-xs focus:outline-none focus:border-amber-500"
                        >
                          {project.shots.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.id} ({s.durationSec}s)
                            </option>
                          ))}
                          {!project.shots.some((s) => s.id === line.shotId) && (
                            <option value={line.shotId}>{line.shotId}</option>
                          )}
                        </select>

                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[11px] tabular-nums ${
                            isOverBudget
                              ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                              : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                          }`}
                        >
                          {actualWords} / ~{targetWords} words ({shotSec}s)
                        </span>

                        {line.audioUrl && (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[11px] font-medium">
                            Audio ready
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {line.audioUrl && (
                          <button
                            type="button"
                            onClick={() => void handlePlaySingleLine(line)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-zinc-100 bg-[#0B0D10] border border-[#262B36] hover:border-amber-500 rounded-lg cursor-pointer"
                          >
                            <Play className="w-3 h-3 text-amber-400" />
                            Play
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={isGeneratingThis || isGeneratingAll || !line.line.trim()}
                          onClick={() => void handleGenerateSingleLine(line)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 rounded-lg cursor-pointer"
                        >
                          {isGeneratingThis ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Mic2 className="w-3.5 h-3.5" />
                          )}
                          {isGeneratingThis
                            ? 'Rendering...'
                            : line.audioUrl
                              ? 'Regenerate audio'
                              : 'Generate audio'}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemoveLine(line.id)}
                          className="p-1.5 text-zinc-500 hover:text-rose-400 rounded-lg cursor-pointer"
                          aria-label="Delete VO line"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="p-4 space-y-3">
                      {linkedShot && (
                        <div className="text-[11px] text-zinc-400">
                          <span className="text-zinc-500 font-medium">Shot action: </span>
                          {linkedShot.scene}
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="text-[11px] text-zinc-400 block mb-1">
                            Speaker
                          </label>
                          <input
                            type="text"
                            value={line.speaker}
                            onChange={(e) =>
                              updateVoLine(line.id, { speaker: e.target.value })
                            }
                            className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] text-zinc-400 block mb-1">
                            Delivery Direction (Plain English)
                          </label>
                          <input
                            type="text"
                            value={line.direction}
                            onChange={(e) =>
                              updateVoLine(line.id, { direction: e.target.value })
                            }
                            placeholder="e.g. warm, unhurried, quiet confidence"
                            className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] text-zinc-400 block mb-1">
                            Line Emotion Tone
                          </label>
                          <select
                            value={line.emotionalTone || voSettings.emotionalTone}
                            onChange={(e) =>
                              updateVoLine(line.id, { emotionalTone: e.target.value })
                            }
                            className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                          >
                            {EMOTIONAL_TONES.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] text-zinc-400">
                            Spoken Voiceover Line
                          </label>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                updateVoLine(line.id, {
                                  line: `${line.line.trimEnd()}... `,
                                })
                              }
                              className="px-2 py-0.5 text-[10px] text-zinc-300 bg-[#0B0D10] border border-[#262B36] hover:border-zinc-500 rounded cursor-pointer"
                            >
                              + Breath pause (...)
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateVoLine(line.id, {
                                  line: `${line.line.trimEnd()} — `,
                                })
                              }
                              className="px-2 py-0.5 text-[10px] text-zinc-300 bg-[#0B0D10] border border-[#262B36] hover:border-zinc-500 rounded cursor-pointer"
                            >
                              + Emphasis beat (—)
                            </button>
                          </div>
                        </div>
                        <textarea
                          rows={2}
                          value={line.line}
                          onChange={(e) =>
                            updateVoLine(line.id, { line: e.target.value })
                          }
                          placeholder="Write spoken line timed to ~2.5 words/sec..."
                          className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 leading-relaxed"
                        />
                      </div>

                      {!voSettings.singleVoiceMode && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <div>
                            <label className="text-[11px] text-zinc-400 block mb-1">
                              Line Cast Voice
                            </label>
                            <select
                              value={line.voiceName || voSettings.voiceName}
                              onChange={(e) =>
                                updateVoLine(line.id, { voiceName: e.target.value })
                              }
                              className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                            >
                              {ALL_GEMINI_VOICE_PRESETS.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.displayName} ({v.gender})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[11px] text-zinc-400 block mb-1">
                              Pause After Shot (seconds)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={3}
                              step={0.05}
                              value={line.pauseAfter ?? voSettings.pauseAfter}
                              onChange={(e) =>
                                updateVoLine(line.id, {
                                  pauseAfter: Number(e.target.value) || 0,
                                })
                              }
                              className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-amber-500"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={handleAddLine}
                className="w-full py-2.5 border border-dashed border-[#262B36] hover:border-amber-500/60 rounded-xl text-xs font-medium text-zinc-300 hover:text-amber-300 inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add VO line
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Export Audio Modal */}
      {exportOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#14171D] border border-[#262B36] rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-100">
                Export Voiceover Audio
              </h3>
              <button
                type="button"
                onClick={() => setExportOpen(false)}
                className="text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="text-zinc-300 font-medium block mb-1.5">
                  Deliverable Package
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setExportMode('master')}
                    className={`p-3 rounded-lg border text-left cursor-pointer ${
                      exportMode === 'master'
                        ? 'bg-amber-500/15 border-amber-500 text-amber-200'
                        : 'bg-[#0B0D10] border-[#262B36] text-zinc-300'
                    }`}
                  >
                    <div className="font-semibold">Single Master Track</div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      Combined with timed pauses
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportMode('stems')}
                    className={`p-3 rounded-lg border text-left cursor-pointer ${
                      exportMode === 'stems'
                        ? 'bg-amber-500/15 border-amber-500 text-amber-200'
                        : 'bg-[#0B0D10] border-[#262B36] text-zinc-300'
                    }`}
                  >
                    <div className="font-semibold">Individual Stems (.ZIP)</div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      One file per shot + tracklist
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-zinc-300 font-medium block mb-1.5">
                  Audio Format
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setExportFormat('wav')}
                    className={`py-2 px-3 rounded-lg border font-medium cursor-pointer ${
                      exportFormat === 'wav'
                        ? 'bg-amber-500/15 border-amber-500 text-amber-200'
                        : 'bg-[#0B0D10] border-[#262B36] text-zinc-300'
                    }`}
                  >
                    WAV (Uncompressed)
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportFormat('mp3')}
                    className={`py-2 px-3 rounded-lg border font-medium cursor-pointer ${
                      exportFormat === 'mp3'
                        ? 'bg-amber-500/15 border-amber-500 text-amber-200'
                        : 'bg-[#0B0D10] border-[#262B36] text-zinc-300'
                    }`}
                  >
                    MP3 (Compressed)
                  </button>
                </div>
              </div>

              {exportFormat === 'mp3' && (
                <div>
                  <label className="text-zinc-300 font-medium block mb-1.5">
                    MP3 Bitrate
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {([128, 192, 320] as const).map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => setExportBitrate(rate)}
                        className={`py-1.5 rounded-lg border font-mono cursor-pointer ${
                          exportBitrate === rate
                            ? 'bg-amber-500/15 border-amber-500 text-amber-200'
                            : 'bg-[#0B0D10] border-[#262B36] text-zinc-300'
                        }`}
                      >
                        {rate} kbps
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label className="flex items-center justify-between text-zinc-300 cursor-pointer pt-1">
                <span>Broadcast Peak Normalization (-1 dB)</span>
                <input
                  type="checkbox"
                  checked={exportNormalize}
                  onChange={(e) => setExportNormalize(e.target.checked)}
                  className="accent-amber-500 w-4 h-4 cursor-pointer"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#262B36]">
              <button
                type="button"
                onClick={() => setExportOpen(false)}
                className="px-3.5 py-2 text-xs text-zinc-300 hover:text-zinc-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isExporting}
                onClick={() => void handleRunExport()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 rounded-lg cursor-pointer"
              >
                {isExporting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                Download {exportMode === 'stems' ? 'ZIP' : exportFormat.toUpperCase()}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
