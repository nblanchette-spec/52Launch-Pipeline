import { BrandProject } from '../types/studio';

const STORAGE_KEY = '52launch_director_os_projects_v1';
const ACTIVE_PROJECT_KEY = '52launch_director_os_active_project_v1';

const FALLBACK_CLASSIC_PROJECT: BrandProject = {
  id: 'proj-classic-default',
  brandName: '52Launch Studio',
  projectTitle: 'Launch Film Template',
  industry: 'Startup Launch',
  directorName: 'Creative Director',
  shootDate: '2026-12-01',
  activePhase: 'phase-1',
  updatedAt: new Date().toISOString(),
  onboarding: {
    philosophyNotes: '',
    phaseExpectationsNotes: '',
    founderProblemSolutionNotes: '',
    visualPacingNotes: '',
    kickoffCompleted: false,
  },
  brief: {
    objectiveAndKpis: '',
    targetAudiencePersona: '',
    coreHookMessage: '',
    toneAndPacing: '',
    visualStyleNotes: '',
    colorPalette: [
      { id: 'sw-1', name: 'Charcoal', hex: '#14171D' },
      { id: 'sw-2', name: 'Amber', hex: '#F59E0B' },
    ],
    deliverablesAspectRatios: ['16:9'],
    mandatories: '',
  },
  moodBoard: [],
  territories: [],
  lockedTerritoryId: null,
  castLocker: [],
  locationLocker: [],
  propLocker: [],
  storyboardPanels: [],
  extraShots: [],
  requirements: [],
  schedule: [],
  phase2: {
    status: 'Pending Pre-Pro Lock',
    shootDate: '2026-12-01',
    dpName: 'TBD',
    producerName: 'TBD',
    handoffNotes: '',
  },
  phase3: {
    status: 'Awaiting Footage',
    editorName: 'TBD',
    deliveryTargetDate: '',
    checklist: [],
  },
};

export interface StudioBackupBundle {
  app: '52Launch Director OS';
  version: number;
  exportedAt: string;
  projects: BrandProject[];
}

export function loadProjectsFromStorage(): {
  projects: BrandProject[];
  activeProjectId: string;
} {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const activeRaw = localStorage.getItem(ACTIVE_PROJECT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as BrandProject[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const validActive =
          activeRaw && parsed.some((p) => p.id === activeRaw) ? activeRaw : parsed[0].id;
        return { projects: parsed, activeProjectId: validActive };
      }
    }
  } catch (err) {
    console.warn('Could not load projects from localStorage:', err);
  }
  return {
    projects: [FALLBACK_CLASSIC_PROJECT],
    activeProjectId: FALLBACK_CLASSIC_PROJECT.id,
  };
}

export function saveProjectsToStorage(
  projects: BrandProject[],
  activeProjectId: string
): { saved: boolean; error?: string } {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    localStorage.setItem(ACTIVE_PROJECT_KEY, activeProjectId);
    return { saved: true };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Browser storage quota reached.';
    return { saved: false, error: message };
  }
}

export function exportWorkspaceJson(projects: BrandProject[], filename?: string): void {
  const bundle: StudioBackupBundle = {
    app: '52Launch Director OS',
    version: 1,
    exportedAt: new Date().toISOString(),
    projects,
  };
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename || `52launch-studio-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function parseImportedWorkspaceJson(rawText: string): BrandProject[] {
  const parsed = JSON.parse(rawText);
  if (parsed && Array.isArray(parsed.projects)) {
    return parsed.projects as BrandProject[];
  }
  if (Array.isArray(parsed)) {
    return parsed as BrandProject[];
  }
  if (parsed && typeof parsed === 'object' && parsed.id && parsed.brandName) {
    return [parsed as BrandProject];
  }
  throw new Error('Invalid backup file.');
}
