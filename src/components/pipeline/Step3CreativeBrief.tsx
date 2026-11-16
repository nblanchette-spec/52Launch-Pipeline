import React, { useState } from 'react';
import { Sparkles, Loader2, CheckCircle2, ArrowRight, Plus, Trash2 } from 'lucide-react';
import { CreativeBriefPipeline, PipelineProject } from '../../types/pipeline';

interface Step3CreativeBriefProps {
  project: PipelineProject;
  onUpdateProject: (updated: PipelineProject) => Promise<void>;
  onGenerateBrief: () => Promise<void>;
  onApproveBrief: () => Promise<void>;
  onGoToShotBoard: () => void;
}

export const Step3CreativeBrief: React.FC<Step3CreativeBriefProps> = ({
  project,
  onUpdateProject,
  onGenerateBrief,
  onApproveBrief,
  onGoToShotBoard,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const brief = project.creativeBrief;

  const updateBrief = (patch: Partial<CreativeBriefPipeline>) => {
    const nextProject: PipelineProject = {
      ...project,
      creativeBrief: {
        ...brief,
        ...patch,
        manuallyEdited: true,
      },
      approvals: {
        ...project.approvals,
        briefApproved: false,
        shotListApproved: false,
        storyboardApproved: false,
        videoPromptsApproved: false,
        voApproved: false,
        shootPlanApproved: false,
      },
    };
    void onUpdateProject(nextProject);
  };

  const triggerGenerate = async (force = false) => {
    if (brief.hasGenerated && brief.manuallyEdited && !force) {
      setConfirmOverwrite(true);
      return;
    }
    setConfirmOverwrite(false);
    setErrorMsg(null);
    setIsGenerating(true);
    try {
      await onGenerateBrief();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not generate Creative Brief.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-[1180px] mx-auto px-6 py-7 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-[#262B36]">
        <div>
          <div className="text-xs font-medium text-amber-400">
            Step 3 · Creative Brief
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 mt-1">
            Creative Objective, Concepts & Voiceover Direction
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Grounded in the approved Brand Bible and client ideas. Review or edit concepts,
            then approve to unlock the Shot List.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={isGenerating}
            onClick={() => void triggerGenerate(false)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-zinc-100 bg-[#14171D] border border-[#262B36] hover:border-amber-500 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
            ) : (
              <Sparkles className="w-4 h-4 text-amber-400" />
            )}
            {isGenerating
              ? 'Generating Brief...'
              : brief.hasGenerated
                ? 'Re-run Creative Brief'
                : 'Generate Creative Brief'}
          </button>

          {project.approvals.briefApproved ? (
            <button
              type="button"
              onClick={onGoToShotBoard}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Brief Approved · Open Shot List
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              disabled={!brief.objective.trim()}
              onClick={() => void onApproveBrief()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Approve brief
            </button>
          )}
        </div>
      </div>

      {confirmOverwrite && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-amber-200">
            You have made manual edits to this Creative Brief. Re-running Gemini will replace
            your current text. Continue?
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setConfirmOverwrite(false)}
              className="px-3 py-1.5 text-xs font-medium text-zinc-200 bg-[#14171D] border border-[#262B36] rounded-lg cursor-pointer"
            >
              Keep my edits
            </button>
            <button
              type="button"
              onClick={() => void triggerGenerate(true)}
              className="px-3 py-1.5 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg cursor-pointer"
            >
              Replace & re-run
            </button>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/40 text-xs text-rose-300">
          {errorMsg}
        </div>
      )}

      {!brief.hasGenerated && !brief.objective ? (
        <div className="bg-[#14171D] border border-dashed border-[#262B36] rounded-xl p-12 text-center space-y-3">
          <Sparkles className="w-8 h-8 text-amber-400 mx-auto" />
          <div className="text-base font-semibold text-zinc-100">
            Ready to write the Creative Brief
          </div>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            Click &ldquo;Generate Creative Brief&rdquo; to craft tailored concepts building on
            your client’s ideas and allowed claims.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Objective & Key Message */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-[#14171D] border border-[#262B36] rounded-xl p-5 space-y-2">
              <label className="block text-xs font-semibold text-zinc-300">
                Objective (one sentence)
              </label>
              <textarea
                rows={3}
                value={brief.objective}
                onChange={(e) => updateBrief({ objective: e.target.value })}
                className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="bg-[#14171D] border border-[#262B36] rounded-xl p-5 space-y-2">
              <label className="block text-xs font-semibold text-zinc-300">
                Key Message (one sentence)
              </label>
              <textarea
                rows={3}
                value={brief.keyMessage}
                onChange={(e) => updateBrief({ keyMessage: e.target.value })}
                className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Concepts */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-100">
                Creative Concepts (building on client’s marketing ideas)
              </h2>
              <button
                type="button"
                onClick={() =>
                  updateBrief({
                    concepts: [
                      ...brief.concepts,
                      {
                        id: `concept-${Date.now()}`,
                        title: 'New Concept',
                        logline: '',
                        whyItWorks: '',
                        risks: '',
                      },
                    ],
                  })
                }
                className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 hover:text-amber-300 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add concept
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {brief.concepts.map((concept) => {
                const isRecommended =
                  brief.recommendedConcept.title.toLowerCase() ===
                  concept.title.toLowerCase();
                return (
                  <div
                    key={concept.id}
                    className={`bg-[#14171D] border rounded-xl p-5 space-y-3 flex flex-col justify-between ${
                      isRecommended ? 'border-amber-500/60' : 'border-[#262B36]'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <input
                          type="text"
                          value={concept.title}
                          onChange={(e) =>
                            updateBrief({
                              concepts: brief.concepts.map((c) =>
                                c.id === concept.id ? { ...c, title: e.target.value } : c
                              ),
                            })
                          }
                          className="bg-transparent text-base font-semibold text-zinc-100 focus:outline-none border-b border-transparent focus:border-amber-500 w-full"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateBrief({
                              concepts: brief.concepts.filter((c) => c.id !== concept.id),
                            })
                          }
                          className="p-1 text-zinc-500 hover:text-rose-400 cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div>
                        <label className="block text-[11px] text-zinc-400 mb-1">
                          Logline
                        </label>
                        <textarea
                          rows={3}
                          value={concept.logline}
                          onChange={(e) =>
                            updateBrief({
                              concepts: brief.concepts.map((c) =>
                                c.id === concept.id ? { ...c, logline: e.target.value } : c
                              ),
                            })
                          }
                          className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] text-zinc-400 mb-1">
                          Why it works
                        </label>
                        <textarea
                          rows={2}
                          value={concept.whyItWorks}
                          onChange={(e) =>
                            updateBrief({
                              concepts: brief.concepts.map((c) =>
                                c.id === concept.id
                                  ? { ...c, whyItWorks: e.target.value }
                                  : c
                              ),
                            })
                          }
                          className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] text-zinc-400 mb-1">
                          Risks
                        </label>
                        <textarea
                          rows={2}
                          value={concept.risks}
                          onChange={(e) =>
                            updateBrief({
                              concepts: brief.concepts.map((c) =>
                                c.id === concept.id ? { ...c, risks: e.target.value } : c
                              ),
                            })
                          }
                          className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        updateBrief({
                          recommendedConcept: {
                            ...brief.recommendedConcept,
                            title: concept.title,
                          },
                        })
                      }
                      className={`w-full py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                        isRecommended
                          ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                          : 'bg-[#0B0D10] border-[#262B36] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {isRecommended ? 'Recommended Concept' : 'Set as Recommended'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recommended Concept, Deliverables, VO Direction, Claims Check */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-[#14171D] border border-[#262B36] rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-zinc-100">
                Recommended Concept & Reason
              </h2>
              <input
                type="text"
                value={brief.recommendedConcept.title}
                onChange={(e) =>
                  updateBrief({
                    recommendedConcept: {
                      ...brief.recommendedConcept,
                      title: e.target.value,
                    },
                  })
                }
                placeholder="Recommended concept title"
                className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-sm font-medium text-amber-300 focus:outline-none focus:border-amber-500"
              />
              <textarea
                rows={3}
                value={brief.recommendedConcept.reason}
                onChange={(e) =>
                  updateBrief({
                    recommendedConcept: {
                      ...brief.recommendedConcept,
                      reason: e.target.value,
                    },
                  })
                }
                placeholder="Why this direction wins..."
                className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="bg-[#14171D] border border-[#262B36] rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-zinc-100">
                Deliverables & Claims Check
              </h2>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Deliverables (one per line)
                </label>
                <textarea
                  rows={2}
                  value={brief.deliverables.join('\n')}
                  onChange={(e) =>
                    updateBrief({
                      deliverables: e.target.value
                        .split('\n')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Claims check</label>
                <textarea
                  rows={2}
                  value={brief.claimsCheck}
                  onChange={(e) => updateBrief({ claimsCheck: e.target.value })}
                  className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-xs text-emerald-200 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          <div className="bg-[#14171D] border border-[#262B36] rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-zinc-100">Voiceover Direction</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Who is speaking</label>
                <input
                  type="text"
                  value={brief.voDirection.speaker}
                  onChange={(e) =>
                    updateBrief({
                      voDirection: { ...brief.voDirection, speaker: e.target.value },
                    })
                  }
                  className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Pace</label>
                <input
                  type="text"
                  value={brief.voDirection.pace}
                  onChange={(e) =>
                    updateBrief({
                      voDirection: { ...brief.voDirection, pace: e.target.value },
                    })
                  }
                  className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Emotional arc</label>
                <input
                  type="text"
                  value={brief.voDirection.emotionalArc}
                  onChange={(e) =>
                    updateBrief({
                      voDirection: { ...brief.voDirection, emotionalArc: e.target.value },
                    })
                  }
                  className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
