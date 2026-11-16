export type PipelineStepNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type ShotRoute = 'ai_video' | 'hybrid' | 'live';
export type VideoModelOption =
  | 'flux3'
  | 'seedance'
  | 'kling'
  | 'wan'
  | 'luma'
  | 'none';
export type ShotStatus =
  | 'Draft'
  | 'Frame Uploaded'
  | 'Needs Fix'
  | 'Frame Passed'
  | 'Video Ready';

export interface ProductPhoto {
  id: string;
  url: string;
  caption: string;
}

export interface ProductInfo {
  name: string;
  description: string;
  provableClaims: string[];
  photos: ProductPhoto[];
}

export interface IntakeInfo {
  audience: string;
  tone: string;
  clientMarketingIdeas: string;
  videosWanted: string;
  shootLocationDatesBudgetNotes: string;
}

export interface BibleCharacter {
  id: string;
  name: string;
  fixedDescriptor: string;
}

export interface BrandBible {
  positioning: string;
  audience: string;
  toneOfVoice: {
    adjectives: string[];
    guidance: string;
  };
  visualStyle: {
    palette: string;
    lighting: string;
    lensAndFraming: string;
    grade: string;
  };
  characters: BibleCharacter[];
  productRules: string;
  bannedList: string[];
  claimsAllowed: string[];
  claimsToFlag: string[];
  hasGenerated: boolean;
  manuallyEdited: boolean;
}

export interface BriefConcept {
  id: string;
  title: string;
  logline: string;
  whyItWorks: string;
  risks: string;
}

export interface CreativeBriefPipeline {
  objective: string;
  keyMessage: string;
  concepts: BriefConcept[];
  recommendedConcept: {
    title: string;
    reason: string;
  };
  deliverables: string[];
  voDirection: {
    pace: string;
    emotionalArc: string;
    speaker: string;
  };
  claimsCheck: string;
  hasGenerated: boolean;
  manuallyEdited: boolean;
}

export interface FrameCheckResult {
  passed: boolean;
  scores: {
    characterMatch: number;
    styleMatch: number;
    compositionMatch: number;
    artifacts: number;
    productFidelity: number | null;
  };
  problems: string[];
  productDifferences: string[];
  improvedFramePrompt: string;
  checkedAt: string;
}

export interface PipelineShot {
  id: string; // S01, S02...
  deliverable: string;
  durationSec: number;
  scene: string;
  route: ShotRoute;
  model: VideoModelOption;
  productInFrame: boolean;
  framePrompt: string;
  shootDirection: string;
  voLine: string;
  continuityNotes: string;
  chainFrom: string; // 'none' or shot id
  frameImageUrl: string | null;
  frameCheck: FrameCheckResult | null;
  productFrameApproved: boolean;
  videoPrompt: string;
  negativePrompt: string;
  videoUrl: string | null;
  videoSeed: number | null;
  videoResolution?: string;
  draftCacheUrl?: string | null;
  upscaledVideoUrl?: string | null;
  upscaledResolution?: string | null;
  upscaleDetails?: UpscaleDetails | null;
  status: ShotStatus;
}

export interface UpscaleDetails {
  mode: 'precision' | 'generative' | 'creative';
  subModel: string;
  scaleFactor: 2 | 4;
  creativity?: number;
  h264Output: boolean;
  upscaledAt: string;
}

export interface ExternalUpscaleItem {
  id: string;
  label: string;
  sourceUrl: string;
  upscaledVideoUrl: string;
  upscaledResolution: string;
  details: UpscaleDetails;
}

export interface VoScriptLine {
  id: string;
  shotId: string;
  speaker: string;
  direction: string;
  line: string;
  audioTags: string;
  emotionalTone?: string;
  emotionIntensity?: number;
  voiceName?: string;
  speed?: number;
  pitch?: number;
  language?: string;
  pauseAfter?: number;
  audioUrl?: string | null;
  durationSec?: number;
  targetWords?: number;
}

export interface VoStudioSettings {
  voiceName: string;
  emotionalTone: string;
  emotionIntensity: number;
  speed: number;
  pitch: number;
  language: string;
  pauseAfter: number;
  ttsModel: 'gemini-3.8-flash-tts' | 'gemini-3.8-flash-lite-tts';
  enhanceWithDSP: boolean;
  singleVoiceMode: boolean;
  customStylePrompt?: string;
}

export interface ShootDayPlan {
  id: string;
  dayLabel: string;
  location: string;
  callTime: string;
  wrapTime: string;
  setups: Array<{
    setupName: string;
    lightingNotes: string;
    shotIds: string[];
    estimatedMinutes: number;
  }>;
}

export interface ShootPlan {
  shootDays: ShootDayPlan[];
  equipment: string[];
  propsAndUnits: Array<{
    item: string;
    quantity: string;
    suppliedBy: string;
  }>;
  crew: string[];
  risks: string[];
  clientQuestions: string[];
  hasGenerated: boolean;
  manuallyEdited?: boolean;
}

export interface ApprovalState {
  intakeCompleted: boolean;
  bibleApproved: boolean;
  briefApproved: boolean;
  shotListApproved: boolean;
  storyboardApproved: boolean;
  videoPromptsApproved: boolean;
  voApproved: boolean;
  shootPlanApproved: boolean;
}

export interface GenerationLogEntry {
  id: string;
  timestamp: string;
  step: string;
  shotId?: string;
  model: string;
  prompt: string;
  seed?: number | null;
  status: 'success' | 'error';
  notes?: string;
}

export interface PipelineProject {
  id: string;
  createdAt: string;
  updatedAt: string;
  client: string;
  product: ProductInfo;
  intake: IntakeInfo;
  brandBible: BrandBible;
  creativeBrief: CreativeBriefPipeline;
  shots: PipelineShot[];
  shotListHasGenerated: boolean;
  shotListManuallyEdited: boolean;
  voScript: VoScriptLine[];
  voHasGenerated?: boolean;
  voManuallyEdited?: boolean;
  voSettings?: VoStudioSettings;
  externalUpscales?: ExternalUpscaleItem[];
  shootPlan: ShootPlan;
  approvals: ApprovalState;
  generationLog: GenerationLogEntry[];
}

export interface ProjectSummary {
  id: string;
  client: string;
  productName: string;
  updatedAt: string;
  shotCount: number;
  approvals: ApprovalState;
}
