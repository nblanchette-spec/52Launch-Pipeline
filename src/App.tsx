import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  ExtractedStyleGuide,
  PipelineProject,
  PipelineStepNumber,
  ProjectSummary,
} from './types/pipeline';
import { PipelineHeader } from './components/pipeline/PipelineHeader';
import { WelcomeHome } from './components/pipeline/WelcomeHome';
import { ReadyToLaunchView } from './components/pipeline/ReadyToLaunchView';
import { Step1NewProject } from './components/pipeline/Step1NewProject';
import { Step2BrandBible } from './components/pipeline/Step2BrandBible';
import { Step3CreativeBrief } from './components/pipeline/Step3CreativeBrief';
import { Step4ShotBoard } from './components/pipeline/Step4ShotBoard';
import { Step5StoryboardFrames } from './components/pipeline/Step5StoryboardFrames';
import { Step6FrameCheck } from './components/pipeline/Step6FrameCheck';
import { Step7VideoStudio } from './components/pipeline/Step7VideoStudio';
import { Step8VoStudio } from './components/pipeline/Step8VoStudio';
import { Step9ShootPlan } from './components/pipeline/Step9ShootPlan';
import { PrintableStoryboardView } from './components/pipeline/PrintableStoryboardView';
import { MasterPdfExportModal } from './components/pipeline/MasterPdfExportModal';
import {
  getGoogleDriveAccessToken,
  isSandboxDriveToken,
  syncProjectToDriveServer,
} from './utils/googleDriveSync';

// Preserve Classic Studio components so existing features remain accessible
import { BrandProject, MacroPhase, WorkflowStepId } from './types/studio';
import {
  exportWorkspaceJson,
  loadProjectsFromStorage,
  parseImportedWorkspaceJson,
  saveProjectsToStorage,
} from './utils/storage';
import { HeaderBar } from './components/HeaderBar';
import { WorkflowSidebar } from './components/WorkflowSidebar';
import { DashboardView } from './components/DashboardView';
import { Step1Onboarding } from './components/Step1Onboarding';
import { Step2BriefMoodBoard } from './components/Step2BriefMoodBoard';
import { Step3Ideation } from './components/Step3Ideation';
import { Step4StoryboardStudio } from './components/Step4StoryboardStudio';
import { Step5ProductionPrep } from './components/Step5ProductionPrep';
import { Step6ProductionBook } from './components/Step6ProductionBook';
import { NewProjectModal } from './components/NewProjectModal';
import { ExternalPhaseModal } from './components/ExternalPhaseModal';

export default function App() {
  const [workspaceMode, setWorkspaceMode] = useState<'pipeline' | 'classic'>('pipeline');

  // --- New Production Pipeline State (Server /data storage) ---
  const [projectSummaries, setProjectSummaries] = useState<ProjectSummary[]>([]);
  const [activeProject, setActiveProject] = useState<PipelineProject | null>(null);
  const [activeStep, setActiveStep] = useState<PipelineStepNumber>(1);
  const [showWelcome, setShowWelcome] = useState(true);
  const [showLaunchScreen, setShowLaunchScreen] = useState(false);
  const [launchPlayAnimation, setLaunchPlayAnimation] = useState(true);
  const [isNewProjectMode, setIsNewProjectMode] = useState(false);
  const [isPrintableOpen, setIsPrintableOpen] = useState(false);
  const [isMasterExportOpen, setIsMasterExportOpen] = useState(false);
  const [isLoadingPipeline, setIsLoadingPipeline] = useState(true);
  const [pipelineNotice, setPipelineNotice] = useState<string | null>(null);

  const driveSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showPipelineNotice = (msg: string) => {
    setPipelineNotice(msg);
    setTimeout(() => {
      setPipelineNotice((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  const scheduleDriveAutoSave = (proj: PipelineProject) => {
    const urls =
      proj.googleDriveFolderUrls && proj.googleDriveFolderUrls.length > 0
        ? proj.googleDriveFolderUrls
        : proj.googleDriveFolderUrl
          ? [proj.googleDriveFolderUrl]
          : [];

    if (urls.length === 0 && !proj.googleDriveBackupFolderId) return;

    if (driveSyncTimerRef.current) {
      clearTimeout(driveSyncTimerRef.current);
    }

    driveSyncTimerRef.current = setTimeout(() => {
      void (async () => {
        const token = await getGoogleDriveAccessToken();
        if (!token || isSandboxDriveToken(token)) return;
        try {
          const res = await syncProjectToDriveServer(
            proj.id,
            urls,
            token,
            proj.googleDriveDestinationFolderId,
            proj.googleDriveDestinationFolderUrl
          );
          setActiveProject((curr) =>
            curr && curr.id === proj.id
              ? {
                  ...curr,
                  googleDriveSyncStatus: 'synced',
                  googleDriveSyncedAt: res.syncedAt,
                  googleDriveBackupFolderId:
                    res.backupFolderId || curr.googleDriveBackupFolderId,
                  googleDriveBackupFolderUrl:
                    res.backupFolderUrl || curr.googleDriveBackupFolderUrl,
                  googleDriveDestinationFolderId:
                    curr.googleDriveDestinationFolderId || res.backupFolderId,
                  googleDriveDestinationFolderUrl:
                    curr.googleDriveDestinationFolderUrl || res.backupFolderUrl,
                }
              : curr
          );
        } catch {
          setActiveProject((curr) =>
            curr && curr.id === proj.id
              ? { ...curr, googleDriveSyncStatus: 'error' }
              : curr
          );
        }
      })();
    }, 1800);
  };

  const isStepUnlockedForProject = (
    proj: PipelineProject,
    step: PipelineStepNumber
  ): boolean => {
    if (step === 1) return true;
    const a = proj.approvals;
    switch (step) {
      case 2:
        return a.intakeCompleted;
      case 3:
        return a.bibleApproved;
      case 4:
        return a.briefApproved;
      case 5:
      case 6:
      case 7:
        return a.shotListApproved;
      case 8:
        return a.videoPromptsApproved;
      case 9:
        return a.voApproved;
      default:
        return false;
    }
  };

  const getFurthestUnlockedStep = (proj: PipelineProject): PipelineStepNumber => {
    if (proj.approvals.voApproved) return 9;
    if (proj.approvals.videoPromptsApproved) return 8;
    if (proj.approvals.storyboardApproved) return 7;
    if (proj.approvals.shotListApproved) return 5;
    if (proj.approvals.briefApproved) return 4;
    if (proj.approvals.bibleApproved) return 3;
    if (proj.approvals.intakeCompleted) return 2;
    return 1;
  };

  const fetchProjectSummariesOnly = async (): Promise<ProjectSummary[]> => {
    const resp = await fetch('/api/projects');
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Could not load projects.');
    const list: ProjectSummary[] = data.projects || [];
    setProjectSummaries(list);
    return list;
  };

  const refreshProjectList = async (selectId?: string) => {
    const list = await fetchProjectSummariesOnly();

    const targetId = selectId || activeProject?.id || list[0]?.id;
    if (targetId) {
      await loadSingleProject(targetId);
    } else {
      setIsNewProjectMode(true);
      setActiveStep(1);
    }
  };

  const loadSingleProject = async (
    id: string,
    requestedStep?: PipelineStepNumber
  ) => {
    const resp = await fetch(`/api/projects/${id}`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Could not load project.');
    const proj: PipelineProject = data.project;
    setActiveProject(proj);
    setShowWelcome(false);
    setIsNewProjectMode(false);
    setIsPrintableOpen(false);

    if (requestedStep && isStepUnlockedForProject(proj, requestedStep)) {
      setShowLaunchScreen(false);
      setActiveStep(requestedStep);
    } else if (proj.approvals.shootPlanApproved) {
      setActiveStep(9);
      setLaunchPlayAnimation(false);
      setShowLaunchScreen(true);
    } else {
      setShowLaunchScreen(false);
      setActiveStep(getFurthestUnlockedStep(proj));
    }
  };

  const handleOpenWelcome = () => {
    setShowWelcome(true);
    setShowLaunchScreen(false);
    setIsNewProjectMode(false);
    setIsPrintableOpen(false);
    void fetchProjectSummariesOnly().catch(() => undefined);
  };

  const handleDeleteProject = async (projectId: string) => {
    const resp = await fetch(`/api/projects/${projectId}`, {
      method: 'DELETE',
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      showPipelineNotice(data.error || 'Could not delete project.');
      return;
    }
    if (activeProject?.id === projectId) {
      setActiveProject(null);
    }
    await fetchProjectSummariesOnly();
    showPipelineNotice('Project removed from studio.');
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await fetchProjectSummariesOnly();
      } catch (err) {
        if (mounted) {
          showPipelineNotice(
            err instanceof Error ? err.message : 'Could not load saved projects.'
          );
        }
      } finally {
        if (mounted) setIsLoadingPipeline(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleCreatePipelineProject = async (payload: {
    client: string;
    product: { name: string; description: string; provableClaims: string[] };
    intake: {
      audience: string;
      tone: string;
      clientMarketingIdeas: string;
      videosWanted: string;
      shootLocationDatesBudgetNotes: string;
    };
    initialPhotoDataUrls: Array<{ dataUrl: string; caption: string }>;
    extractedStyleGuide?: ExtractedStyleGuide | null;
    stagedGuidePdfs?: Array<{ name: string; dataUrl: string; graphicCount?: number }>;
    initialLogoDataUrl?: string | null;
    googleDriveFolderUrls?: string[];
    googleDriveDestinationFolderId?: string;
    googleDriveDestinationFolderUrl?: string;
    googleDriveDestinationFolderName?: string;
    lockedDriveReferences?: Array<{
      fileId: string;
      name: string;
      mimeType: string;
      webViewLink?: string;
      selected: boolean;
    }>;
  }) => {
    const resp = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Could not create project.');
    const created: PipelineProject = data.project;
    setActiveProject(created);
    setShowWelcome(false);
    setIsNewProjectMode(false);
    setActiveStep(2);
    await refreshProjectList(created.id);
    scheduleDriveAutoSave(created);
    showPipelineNotice(`Saved "${created.product.name}" to the studio.`);
  };

  const handleUpdatePipelineProject = async (updated: PipelineProject) => {
    // Check if an approved step just got un-approved by an edit
    if (
      activeProject &&
      ((activeProject.approvals.bibleApproved && !updated.approvals.bibleApproved) ||
        (activeProject.approvals.briefApproved && !updated.approvals.briefApproved) ||
        (activeProject.approvals.shotListApproved && !updated.approvals.shotListApproved) ||
        (activeProject.approvals.storyboardApproved && !updated.approvals.storyboardApproved) ||
        (activeProject.approvals.videoPromptsApproved && !updated.approvals.videoPromptsApproved) ||
        (activeProject.approvals.voApproved && !updated.approvals.voApproved))
    ) {
      showPipelineNotice(
        'Edited an approved step — downstream approvals were reset so nothing stays out of sync.'
      );
    }

    setActiveProject(updated);
    const resp = await fetch(`/api/projects/${updated.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: updated }),
    });
    const data = await resp.json();
    if (resp.ok && data.project) {
      setActiveProject(data.project);
      scheduleDriveAutoSave(data.project);
      setProjectSummaries((prev) =>
        prev.map((s) =>
          s.id === data.project.id
            ? {
                ...s,
                client: data.project.client,
                productName: data.project.product.name,
                updatedAt: data.project.updatedAt,
                shotCount: data.project.shots.length,
                approvals: data.project.approvals,
              }
            : s
        )
      );
    }
  };

  const handleGenerateBible = async () => {
    if (!activeProject) return;
    const resp = await fetch('/api/pipeline/brand-bible', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: activeProject.id }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Could not generate Brand Bible.');
    setActiveProject(data.project);
    scheduleDriveAutoSave(data.project);
    showPipelineNotice('Brand Bible generated. Review and click Approve bible when ready.');
  };

  const handleGenerateBrief = async () => {
    if (!activeProject) return;
    const resp = await fetch('/api/pipeline/creative-brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: activeProject.id }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Could not generate Creative Brief.');
    setActiveProject(data.project);
    scheduleDriveAutoSave(data.project);
    showPipelineNotice('Creative Brief generated. Review and click Approve brief when ready.');
  };

  const handleGenerateShotList = async () => {
    if (!activeProject) return;
    const resp = await fetch('/api/pipeline/shot-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: activeProject.id }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Could not generate Shot List.');
    setActiveProject(data.project);
    scheduleDriveAutoSave(data.project);
    showPipelineNotice('Shot list built with AI, hybrid, and live shots.');
  };

  const handleRunFrameCheck = async (shotId: string) => {
    if (!activeProject) return;
    const resp = await fetch('/api/pipeline/frame-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: activeProject.id, shotId }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Frame Check failed.');
    setActiveProject(data.project);
    scheduleDriveAutoSave(data.project);
  };

  const handleGenerateVideoPrompts = async (shotId?: string) => {
    if (!activeProject) return;
    const resp = await fetch('/api/pipeline/video-prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: activeProject.id, shotId }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Could not generate video prompts.');
    setActiveProject(data.project);
    scheduleDriveAutoSave(data.project);
    showPipelineNotice(
      shotId
        ? `Updated video prompt for ${shotId}.`
        : 'Video prompts and negative prompts generated for all AI/hybrid shots.'
    );
  };

  const handleGenerateSingleVideo = async (
    shotId: string,
    chainedLastFrameDataUrl?: string
  ) => {
    if (!activeProject) return;
    const resp = await fetch('/api/pipeline/generate-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: activeProject.id,
        shotId,
        chainedLastFrameDataUrl,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Video generation failed.');
    setActiveProject(data.project);
    scheduleDriveAutoSave(data.project);
    showPipelineNotice(`Video ready for ${shotId}.`);
  };

  const handleGenerateVoScript = async () => {
    if (!activeProject) return;
    const resp = await fetch('/api/pipeline/vo-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: activeProject.id }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Could not generate VO script.');
    setActiveProject(data.project);
    scheduleDriveAutoSave(data.project);
    showPipelineNotice('VO script drafted and timed to your shots.');
  };

  const handleGenerateShootPlan = async () => {
    if (!activeProject) return;
    const resp = await fetch('/api/pipeline/shoot-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: activeProject.id }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Could not generate Shoot Plan.');
    setActiveProject(data.project);
    scheduleDriveAutoSave(data.project);
    showPipelineNotice('Live & Hybrid Shoot Plan built.');
  };

  const handleDownloadBackup = () => {
    if (!activeProject) return;
    window.location.href = `/api/projects/${activeProject.id}/backup`;
    showPipelineNotice('Downloading project backup...');
  };

  const handleImportBackup = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const resp = await fetch('/api/projects/import-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Could not import project backup.');
      await refreshProjectList(data.project.id);
      showPipelineNotice(`Imported "${data.project.product.name}".`);
    } catch (err) {
      showPipelineNotice(
        err instanceof Error ? err.message : 'That file is not a valid project backup.'
      );
    }
  };

  // --- Preserved Classic Storyboard Studio State ---
  const initialClassic = loadProjectsFromStorage();
  const [classicProjects, setClassicProjects] = useState<BrandProject[]>(
    initialClassic.projects
  );
  const [classicActiveId, setClassicActiveId] = useState<string>(
    initialClassic.activeProjectId
  );
  const [classicStep, setClassicStep] = useState<WorkflowStepId>('step-4');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [newClassicOpen, setNewClassicOpen] = useState(false);
  const [phaseModal, setPhaseModal] = useState<{
    projectId: string;
    mode: 'phase-2' | 'phase-3';
  } | null>(null);

  const classicActiveProject =
    classicProjects.find((p) => p.id === classicActiveId) ?? classicProjects[0];

  useEffect(() => {
    saveProjectsToStorage(classicProjects, classicActiveProject.id);
  }, [classicProjects, classicActiveProject.id]);

  if (workspaceMode === 'classic') {
    const modalProject = phaseModal
      ? classicProjects.find((p) => p.id === phaseModal.projectId) ?? classicActiveProject
      : classicActiveProject;

    return (
      <div className="min-h-screen bg-[#F6F6F7] text-[#111114] flex flex-col">
        <div className="no-print bg-white border-b border-[#E2E2E6] px-5 py-2 flex items-center justify-between text-xs">
          <span className="text-[#5A5A66]">
            Viewing Classic 6-Step Storyboard Studio
          </span>
          <button
            type="button"
            onClick={() => setWorkspaceMode('pipeline')}
            className="px-3.5 py-1 font-semibold text-white bg-[#C6202F] hover:bg-[#AD1A27] brand-corner-sm cursor-pointer transition-colors"
          >
            Return to Production Pipeline
          </button>
        </div>

        <HeaderBar
          projects={classicProjects}
          activeProject={classicActiveProject}
          activeStep={classicStep}
          onSelectProject={(id) => setClassicActiveId(id)}
          onSelectStep={(step) => setClassicStep(step)}
          onOpenNewProject={() => setNewClassicOpen(true)}
          onExportBackup={() => exportWorkspaceJson(classicProjects)}
          onImportBackup={async (file) => {
            const text = await file.text();
            const imported = parseImportedWorkspaceJson(text);
            setClassicProjects((prev) => [...imported, ...prev]);
          }}
          onOpenPhaseModal={(mode) =>
            setPhaseModal({ projectId: classicActiveProject.id, mode })
          }
          onSetActivePhase={(phase: MacroPhase) =>
            setClassicProjects((prev) =>
              prev.map((p) =>
                p.id === classicActiveProject.id ? { ...p, activePhase: phase } : p
              )
            )
          }
        />

        <div className="flex flex-1 min-h-0">
          {classicStep !== 'dashboard' && (
            <WorkflowSidebar
              project={classicActiveProject}
              activeStep={classicStep}
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
              onSelectStep={(step) => setClassicStep(step)}
            />
          )}

          <main className="flex-1 min-w-0 overflow-y-auto print-only-full">
            {classicStep === 'dashboard' && (
              <DashboardView
                projects={classicProjects}
                activeProjectId={classicActiveProject.id}
                onSelectProjectAndStep={(pid, step) => {
                  setClassicActiveId(pid);
                  setClassicStep(step);
                }}
                onOpenNewProject={() => setNewClassicOpen(true)}
                onDeleteProject={(pid) =>
                  setClassicProjects((prev) => prev.filter((p) => p.id !== pid))
                }
                onOpenPhaseModal={(pid, mode) => setPhaseModal({ projectId: pid, mode })}
              />
            )}
            {classicStep === 'step-1' && (
              <Step1Onboarding
                project={classicActiveProject}
                onUpdateProject={(u) =>
                  setClassicProjects((prev) =>
                    prev.map((p) => (p.id === u.id ? u : p))
                  )
                }
                onNavigateStep={(s) => setClassicStep(s)}
              />
            )}
            {classicStep === 'step-2' && (
              <Step2BriefMoodBoard
                project={classicActiveProject}
                onUpdateProject={(u) =>
                  setClassicProjects((prev) =>
                    prev.map((p) => (p.id === u.id ? u : p))
                  )
                }
                onNavigateStep={(s) => setClassicStep(s)}
              />
            )}
            {classicStep === 'step-3' && (
              <Step3Ideation
                project={classicActiveProject}
                onUpdateProject={(u) =>
                  setClassicProjects((prev) =>
                    prev.map((p) => (p.id === u.id ? u : p))
                  )
                }
                onNavigateStep={(s) => setClassicStep(s)}
              />
            )}
            {classicStep === 'step-4' && (
              <Step4StoryboardStudio
                project={classicActiveProject}
                onUpdateProject={(u) =>
                  setClassicProjects((prev) =>
                    prev.map((p) => (p.id === u.id ? u : p))
                  )
                }
                onNavigateStep={(s) => setClassicStep(s)}
              />
            )}
            {classicStep === 'step-5' && (
              <Step5ProductionPrep
                project={classicActiveProject}
                onUpdateProject={(u) =>
                  setClassicProjects((prev) =>
                    prev.map((p) => (p.id === u.id ? u : p))
                  )
                }
                onNavigateStep={(s) => setClassicStep(s)}
              />
            )}
            {classicStep === 'step-6' && (
              <Step6ProductionBook project={classicActiveProject} />
            )}
          </main>
        </div>

        <NewProjectModal
          isOpen={newClassicOpen}
          onClose={() => setNewClassicOpen(false)}
          onCreate={(p) => {
            setClassicProjects((prev) => [p, ...prev]);
            setClassicActiveId(p.id);
            setClassicStep('step-1');
          }}
        />
        <ExternalPhaseModal
          mode={phaseModal?.mode ?? null}
          project={modalProject}
          onClose={() => setPhaseModal(null)}
          onUpdateProject={(u) =>
            setClassicProjects((prev) => prev.map((p) => (p.id === u.id ? u : p)))
          }
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F6F7] text-[#111114] flex flex-col">
      <PipelineHeader
        projects={projectSummaries}
        activeProject={activeProject}
        activeStep={activeStep}
        isWelcomeOpen={showWelcome}
        isLaunchScreenOpen={showLaunchScreen}
        isNewProjectMode={isNewProjectMode}
        isPrintableOpen={isPrintableOpen}
        onOpenWelcome={handleOpenWelcome}
        onOpenReadyToLaunch={() => {
          setShowWelcome(false);
          setIsNewProjectMode(false);
          setIsPrintableOpen(false);
          setLaunchPlayAnimation(true);
          setShowLaunchScreen(true);
        }}
        onSelectProject={(id) => {
          void loadSingleProject(id);
        }}
        onStartNewProject={() => {
          setShowWelcome(false);
          setShowLaunchScreen(false);
          setIsNewProjectMode(true);
          setIsPrintableOpen(false);
          setActiveStep(1);
        }}
        onSelectStep={(step) => {
          setShowWelcome(false);
          setShowLaunchScreen(false);
          setIsPrintableOpen(false);
          setActiveStep(step);
        }}
        onTogglePrintable={() => {
          setShowLaunchScreen(false);
          setIsPrintableOpen((v) => !v);
        }}
        onOpenMasterExport={() => setIsMasterExportOpen(true)}
        onDownloadBackup={handleDownloadBackup}
        onImportBackup={(f) => void handleImportBackup(f)}
        onSwitchToClassicStudio={() => setWorkspaceMode('classic')}
      />

      {pipelineNotice && (
        <div className="no-print fixed bottom-5 right-5 z-50 bg-[#111114] border border-[#C6202F] text-xs text-white px-4 py-2.5 brand-corner-sm shadow-xl">
          {pipelineNotice}
        </div>
      )}

      <main className="flex-1 min-w-0 overflow-y-auto print-only-full">
        {isLoadingPipeline ? (
          <div className="flex items-center justify-center py-24 gap-2.5 text-sm text-[#5A5A66]">
            <Loader2 className="w-5 h-5 animate-spin text-[#C6202F]" />
            Loading studio projects...
          </div>
        ) : showWelcome ? (
          <WelcomeHome
            projects={projectSummaries}
            onOpenProject={(id, step) => {
              void loadSingleProject(id, step);
            }}
            onStartNewProject={() => {
              setShowWelcome(false);
              setShowLaunchScreen(false);
              setIsNewProjectMode(true);
              setIsPrintableOpen(false);
              setActiveStep(1);
            }}
            onImportBackup={(f) => void handleImportBackup(f)}
            onDeleteProject={handleDeleteProject}
          />
        ) : isPrintableOpen && activeProject ? (
          <PrintableStoryboardView
            project={activeProject}
            onBack={() => setIsPrintableOpen(false)}
          />
        ) : showLaunchScreen && activeProject ? (
          <ReadyToLaunchView
            project={activeProject}
            playAnimationOnMount={launchPlayAnimation}
            onOpenMasterExport={() => setIsMasterExportOpen(true)}
            onOpenPrintableStoryboard={() => {
              setShowLaunchScreen(false);
              setIsPrintableOpen(true);
            }}
            onDownloadBackup={handleDownloadBackup}
            onBackToShootPlan={() => {
              setShowLaunchScreen(false);
              setActiveStep(9);
            }}
            onOpenWelcome={handleOpenWelcome}
          />
        ) : isNewProjectMode || activeStep === 1 || !activeProject ? (
          <Step1NewProject
            key={isNewProjectMode ? 'new-project' : activeProject?.id || 'empty'}
            existingProject={activeProject}
            isNewMode={isNewProjectMode || !activeProject}
            onCreateProject={handleCreatePipelineProject}
            onUpdateProject={handleUpdatePipelineProject}
            onProceedToBible={() => setActiveStep(2)}
          />
        ) : activeStep === 2 ? (
          <Step2BrandBible
            project={activeProject}
            onUpdateProject={handleUpdatePipelineProject}
            onGenerateBible={handleGenerateBible}
            onApproveBible={async () => {
              await handleUpdatePipelineProject({
                ...activeProject,
                approvals: { ...activeProject.approvals, bibleApproved: true },
              });
              setActiveStep(3);
            }}
            onGoToBrief={() => setActiveStep(3)}
          />
        ) : activeStep === 3 ? (
          <Step3CreativeBrief
            project={activeProject}
            onUpdateProject={handleUpdatePipelineProject}
            onGenerateBrief={handleGenerateBrief}
            onApproveBrief={async () => {
              await handleUpdatePipelineProject({
                ...activeProject,
                approvals: { ...activeProject.approvals, briefApproved: true },
              });
              setActiveStep(4);
            }}
            onGoToShotBoard={() => setActiveStep(4)}
          />
        ) : activeStep === 4 ? (
          <Step4ShotBoard
            project={activeProject}
            onUpdateProject={handleUpdatePipelineProject}
            onGenerateShotList={handleGenerateShotList}
            onApproveShotList={async () => {
              await handleUpdatePipelineProject({
                ...activeProject,
                approvals: { ...activeProject.approvals, shotListApproved: true },
              });
              setActiveStep(5);
              showPipelineNotice(
                'Shot list approved. Upload your Google Flow storyboard frames next.'
              );
            }}
            onOpenPrintable={() => setIsPrintableOpen(true)}
          />
        ) : activeStep === 5 ? (
          <Step5StoryboardFrames
            project={activeProject}
            onUpdateProject={handleUpdatePipelineProject}
            onGoToFrameSuggestions={() => setActiveStep(6)}
            onApproveAndGoToVideo={async () => {
              await handleUpdatePipelineProject({
                ...activeProject,
                approvals: { ...activeProject.approvals, storyboardApproved: true },
              });
              setActiveStep(7);
              showPipelineNotice(
                'Frames approved! Video prompts and rendering are ready.'
              );
            }}
          />
        ) : activeStep === 6 ? (
          <Step6FrameCheck
            project={activeProject}
            onUpdateProject={handleUpdatePipelineProject}
            onRunFrameCheck={handleRunFrameCheck}
            onApproveStoryboard={async () => {
              await handleUpdatePipelineProject({
                ...activeProject,
                approvals: { ...activeProject.approvals, storyboardApproved: true },
              });
              setActiveStep(7);
              showPipelineNotice(
                'Moved to Video prompts and rendering.'
              );
            }}
            onGoToVideoStep={() => setActiveStep(7)}
          />
        ) : activeStep === 7 ? (
          <Step7VideoStudio
            project={activeProject}
            onUpdateProject={handleUpdatePipelineProject}
            onProjectUpdated={(updated) => {
              setActiveProject(updated);
              scheduleDriveAutoSave(updated);
            }}
            onGenerateVideoPrompts={handleGenerateVideoPrompts}
            onGenerateSingleVideo={handleGenerateSingleVideo}
            onApproveVideoStep={async () => {
              await handleUpdatePipelineProject({
                ...activeProject,
                approvals: { ...activeProject.approvals, videoPromptsApproved: true },
              });
              setActiveStep(8);
              showPipelineNotice(
                'Video step approved! Moved to VO Script & Gemini Voice Studio.'
              );
            }}
          />
        ) : activeStep === 8 ? (
          <Step8VoStudio
            project={activeProject}
            onUpdateProject={handleUpdatePipelineProject}
            onProjectUpdated={(updated) => {
              setActiveProject(updated);
              scheduleDriveAutoSave(updated);
            }}
            onGenerateVoScript={handleGenerateVoScript}
            onApproveVo={async () => {
              await handleUpdatePipelineProject({
                ...activeProject,
                approvals: { ...activeProject.approvals, voApproved: true },
              });
              setActiveStep(9);
              showPipelineNotice(
                'Voiceover approved! Moved to Live & Hybrid Shoot Plan.'
              );
            }}
          />
        ) : (
          <Step9ShootPlan
            project={activeProject}
            onUpdateProject={handleUpdatePipelineProject}
            onGenerateShootPlan={handleGenerateShootPlan}
            onOpenMasterExport={() => setIsMasterExportOpen(true)}
            onOpenReadyToLaunch={() => {
              setLaunchPlayAnimation(true);
              setShowLaunchScreen(true);
            }}
            onApproveShootPlan={async () => {
              await handleUpdatePipelineProject({
                ...activeProject,
                approvals: { ...activeProject.approvals, shootPlanApproved: true },
              });
              setLaunchPlayAnimation(true);
              setShowLaunchScreen(true);
              showPipelineNotice(
                'Shoot Plan approved! Preparing Ready to Launch handoff.'
              );
            }}
          />
        )}
      </main>

      <MasterPdfExportModal
        isOpen={isMasterExportOpen}
        project={activeProject}
        onClose={() => setIsMasterExportOpen(false)}
      />
    </div>
  );
}
