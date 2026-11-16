import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  PipelineProject,
  PipelineStepNumber,
  ProjectSummary,
} from './types/pipeline';
import { PipelineHeader } from './components/pipeline/PipelineHeader';
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
  const [isNewProjectMode, setIsNewProjectMode] = useState(false);
  const [isPrintableOpen, setIsPrintableOpen] = useState(false);
  const [isLoadingPipeline, setIsLoadingPipeline] = useState(true);
  const [pipelineNotice, setPipelineNotice] = useState<string | null>(null);

  const showPipelineNotice = (msg: string) => {
    setPipelineNotice(msg);
    setTimeout(() => {
      setPipelineNotice((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  const refreshProjectList = async (selectId?: string) => {
    const resp = await fetch('/api/projects');
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Could not load projects.');
    const list: ProjectSummary[] = data.projects || [];
    setProjectSummaries(list);

    const targetId = selectId || activeProject?.id || list[0]?.id;
    if (targetId) {
      await loadSingleProject(targetId);
    } else {
      setIsNewProjectMode(true);
      setActiveStep(1);
    }
  };

  const loadSingleProject = async (id: string) => {
    const resp = await fetch(`/api/projects/${id}`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Could not load project.');
    const proj: PipelineProject = data.project;
    setActiveProject(proj);
    setIsNewProjectMode(false);
    setIsPrintableOpen(false);

    // Jump to the furthest unlocked active step cleanly
    if (proj.approvals.voApproved) {
      setActiveStep(9);
    } else if (proj.approvals.videoPromptsApproved) {
      setActiveStep(8);
    } else if (proj.approvals.storyboardApproved) {
      setActiveStep(7);
    } else if (proj.approvals.shotListApproved) {
      setActiveStep(5);
    } else if (proj.approvals.briefApproved) {
      setActiveStep(4);
    } else if (proj.approvals.bibleApproved) {
      setActiveStep(3);
    } else if (proj.approvals.intakeCompleted) {
      setActiveStep(2);
    } else {
      setActiveStep(1);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await refreshProjectList();
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
    setIsNewProjectMode(false);
    setActiveStep(2);
    await refreshProjectList(created.id);
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
      <div className="min-h-screen bg-[#0B0D10] text-zinc-100 flex flex-col">
        <div className="no-print bg-[#14171D] border-b border-[#262B36] px-5 py-2 flex items-center justify-between text-xs">
          <span className="text-zinc-400">
            Viewing Classic 6-Step Storyboard Studio
          </span>
          <button
            type="button"
            onClick={() => setWorkspaceMode('pipeline')}
            className="px-3 py-1 font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-md cursor-pointer"
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
    <div className="min-h-screen bg-[#0B0D10] text-zinc-100 flex flex-col">
      <PipelineHeader
        projects={projectSummaries}
        activeProject={activeProject}
        activeStep={activeStep}
        isNewProjectMode={isNewProjectMode}
        isPrintableOpen={isPrintableOpen}
        onSelectProject={(id) => {
          void loadSingleProject(id);
        }}
        onStartNewProject={() => {
          setIsNewProjectMode(true);
          setIsPrintableOpen(false);
          setActiveStep(1);
        }}
        onSelectStep={(step) => {
          setIsPrintableOpen(false);
          setActiveStep(step);
        }}
        onTogglePrintable={() => setIsPrintableOpen((v) => !v)}
        onDownloadBackup={handleDownloadBackup}
        onImportBackup={(f) => void handleImportBackup(f)}
        onSwitchToClassicStudio={() => setWorkspaceMode('classic')}
      />

      {pipelineNotice && (
        <div className="no-print fixed bottom-5 right-5 z-50 bg-[#14171D] border border-amber-500/60 text-xs text-zinc-100 px-4 py-2.5 rounded-lg shadow-xl">
          {pipelineNotice}
        </div>
      )}

      <main className="flex-1 min-w-0 overflow-y-auto print-only-full">
        {isLoadingPipeline ? (
          <div className="flex items-center justify-center py-24 gap-2 text-sm text-zinc-400">
            <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
            Loading studio projects...
          </div>
        ) : isPrintableOpen && activeProject ? (
          <PrintableStoryboardView
            project={activeProject}
            onBack={() => setIsPrintableOpen(false)}
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
            onProjectUpdated={(updated) => setActiveProject(updated)}
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
            onProjectUpdated={(updated) => setActiveProject(updated)}
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
            onApproveShootPlan={async () => {
              await handleUpdatePipelineProject({
                ...activeProject,
                approvals: { ...activeProject.approvals, shootPlanApproved: true },
              });
              showPipelineNotice(
                'Shoot Plan approved! Production pipeline complete.'
              );
            }}
          />
        )}
      </main>
    </div>
  );
}
