export type WorkflowStepId =
  | 'dashboard'
  | 'step-1'
  | 'step-2'
  | 'step-3'
  | 'step-4'
  | 'step-5'
  | 'step-6';

export type MacroPhase = 'phase-1' | 'phase-2' | 'phase-3';

export type AspectRatioOption = '16:9' | '9:16' | '4:5' | '1:1';

export type MoodBoardTag = 'Lighting' | 'Framing' | 'Wardrobe' | 'Color' | 'Location';

export type ShotSize = 'ECU' | 'CU' | 'MCU' | 'MS' | 'WS' | 'EWS';

export type CameraAngle =
  | 'Eye Level'
  | 'Low Angle'
  | 'High Angle'
  | 'Dutch Tilt'
  | 'Overhead / Top-Down'
  | 'Over-the-Shoulder';

export type CameraMovement =
  | 'Static / Locked-Off'
  | 'Slow Push-In'
  | 'Tracking / Dolly'
  | 'Handheld / Kinetic'
  | 'Whip Pan'
  | 'Steadicam Orbit'
  | 'Macro Slider';

export type RequirementCategory =
  | 'Camera & Lenses'
  | 'Lighting & Grip'
  | 'Audio'
  | 'Art/Props/Wardrobe'
  | 'Talent & Releases';

export interface OnboardingData {
  philosophyNotes: string;
  phaseExpectationsNotes: string;
  founderProblemSolutionNotes: string;
  visualPacingNotes: string;
  kickoffCompleted: boolean;
}

export interface PaletteSwatch {
  id: string;
  name: string;
  hex: string;
}

export interface CreativeBrief {
  objectiveAndKpis: string;
  targetAudiencePersona: string;
  coreHookMessage: string;
  toneAndPacing: string;
  visualStyleNotes: string;
  colorPalette: PaletteSwatch[];
  deliverablesAspectRatios: AspectRatioOption[];
  mandatories: string;
}

export interface MoodBoardTile {
  id: string;
  imageUrl: string;
  tag: MoodBoardTag;
  directorNote: string;
}

export interface SeedScene {
  sceneNumber: string;
  title: string;
  actionSummary: string;
  suggestedShotSize: ShotSize;
  suggestedAngle: CameraAngle;
  dialogueOrAudio: string;
}

export interface CreativeTerritory {
  id: string;
  label: string;
  title: string;
  loglineHook: string;
  narrativeArc: {
    act1: string;
    act2: string;
    act3: string;
  };
  visualTreatment: string;
  soundDesignDirection: string;
  seedScenes: SeedScene[];
}

export interface CastIngredient {
  id: string;
  name: string;
  role: string;
  ageAppearance: string;
  wardrobe: string;
  vibe: string;
  imageUrl?: string;
  locked: boolean;
}

export interface LocationIngredient {
  id: string;
  name: string;
  interiorExterior: 'INT' | 'EXT' | 'INT/EXT';
  timeOfDay: string;
  architecturalLightingDetails: string;
  imageUrl?: string;
  locked: boolean;
}

export interface PropIngredient {
  id: string;
  name: string;
  materialFinish: string;
  scale: string;
  brandDetails: string;
  imageUrl?: string;
  locked: boolean;
}

export interface StoryboardPanel {
  id: string;
  panelOrder: number;
  shotNumber: string;
  sceneLabel: string;
  castIds: string[];
  locationId: string | null;
  propIds: string[];
  shotSize: ShotSize;
  cameraAngle: CameraAngle;
  cameraMovement: CameraMovement;
  aspectRatio: AspectRatioOption;
  actionPrompt: string;
  inpaintNote: string;
  dialogueAudio: string;
  estDurationMins: number;
  imageUrl?: string;
}

export interface ExtraShotItem {
  id: string;
  shotNumber: string;
  sceneLabel: string;
  shotSize: ShotSize;
  cameraAngle: CameraAngle;
  cameraMovement: CameraMovement;
  locationName: string;
  castNames: string;
  propNames: string;
  dialogueAudio: string;
  estDurationMins: number;
  isBroll: boolean;
}

export interface ProductionRequirementItem {
  id: string;
  category: RequirementCategory;
  item: string;
  quantity: string;
  notes: string;
  checked: boolean;
}

export interface ScheduleBlock {
  id: string;
  startTime: string;
  endTime: string;
  blockType: 'Call Time' | 'Setup' | 'Shoot Block' | 'Company Move' | 'Meal Break' | 'Wrap';
  title: string;
  location: string;
  shotNumbers: string[];
  lightingSetup: string;
  notes: string;
}

export interface Phase2Handoff {
  status: 'Pending Pre-Pro Lock' | 'Crew Booked' | 'In Principal Photography' | 'Wrapped';
  shootDate: string;
  dpName: string;
  producerName: string;
  handoffNotes: string;
}

export interface Phase3ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
}

export interface Phase3Delivery {
  status: 'Awaiting Footage' | 'Assembly Cut' | 'Color & Sound Mix' | 'Masters Delivered';
  editorName: string;
  deliveryTargetDate: string;
  checklist: Phase3ChecklistItem[];
}

export interface BrandProject {
  id: string;
  brandName: string;
  projectTitle: string;
  industry: string;
  directorName: string;
  shootDate: string;
  activePhase: MacroPhase;
  updatedAt: string;
  onboarding: OnboardingData;
  brief: CreativeBrief;
  moodBoard: MoodBoardTile[];
  territories: CreativeTerritory[];
  lockedTerritoryId: string | null;
  castLocker: CastIngredient[];
  locationLocker: LocationIngredient[];
  propLocker: PropIngredient[];
  storyboardPanels: StoryboardPanel[];
  extraShots: ExtraShotItem[];
  requirements: ProductionRequirementItem[];
  schedule: ScheduleBlock[];
  phase2: Phase2Handoff;
  phase3: Phase3Delivery;
}
