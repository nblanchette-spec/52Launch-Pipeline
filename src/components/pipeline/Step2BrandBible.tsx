import React, { useState } from 'react';
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  Plus,
  Trash2,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { BrandBible, PipelineProject } from '../../types/pipeline';

interface Step2BrandBibleProps {
  project: PipelineProject;
  onUpdateProject: (updated: PipelineProject) => Promise<void>;
  onGenerateBible: () => Promise<void>;
  onApproveBible: () => Promise<void>;
  onGoToBrief: () => void;
}

export const Step2BrandBible: React.FC<Step2BrandBibleProps> = ({
  project,
  onUpdateProject,
  onGenerateBible,
  onApproveBible,
  onGoToBrief,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const bible = project.brandBible;

  const updateBible = (patch: Partial<BrandBible>) => {
    const nextProject: PipelineProject = {
      ...project,
      brandBible: {
        ...bible,
        ...patch,
        manuallyEdited: true,
      },
      // Editing an approved step un-approves this step and every step after it
      approvals: {
        ...project.approvals,
        bibleApproved: false,
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
    if (bible.hasGenerated && bible.manuallyEdited && !force) {
      setConfirmOverwrite(true);
      return;
    }
    setConfirmOverwrite(false);
    setErrorMsg(null);
    setIsGenerating(true);
    try {
      await onGenerateBible();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not generate Brand Bible.');
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
            Step 2 · Brand Bible
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 mt-1">
            Brand Strategy, Visual Rules & Claims Guardrails
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Built directly from your intake and real product photos. Review or edit any field,
            then approve to unlock the Creative Brief.
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
              ? 'Generating Brand Bible...'
              : bible.hasGenerated
                ? 'Re-run Brand Bible'
                : 'Generate Brand Bible'}
          </button>

          {project.approvals.bibleApproved ? (
            <button
              type="button"
              onClick={onGoToBrief}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Bible Approved · Open Creative Brief
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              disabled={!bible.positioning.trim()}
              onClick={() => void onApproveBible()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Approve bible
            </button>
          )}
        </div>
      </div>

      {/* Overwrite Confirmation Modal / Inline Prompt */}
      {confirmOverwrite && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-amber-200">
            You have made manual edits to this Brand Bible. Re-running Gemini will replace your
            current text. Do you want to continue?
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

      {!bible.hasGenerated && !bible.positioning ? (
        <div className="bg-[#14171D] border border-dashed border-[#262B36] rounded-xl p-12 text-center space-y-3">
          <Sparkles className="w-8 h-8 text-amber-400 mx-auto" />
          <div className="text-base font-semibold text-zinc-100">
            Ready to build the Brand Bible for {project.product.name}
          </div>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            Click &ldquo;Generate Brand Bible&rdquo; to analyze your intake notes and product
            photos into positioning, visual rules, fixed character descriptors, and claims
            guardrails.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Flagged Claims Alert */}
          {bible.claimsToFlag.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                <AlertTriangle className="w-4 h-4" />
                Claims Flagged for Review (client ideas that may imply unproven claims)
              </div>
              <ul className="space-y-1 text-xs text-amber-100/90 list-disc pl-5">
                {bible.claimsToFlag.map((flag, i) => (
                  <li key={i}>{flag}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Positioning & Audience */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-[#14171D] border border-[#262B36] rounded-xl p-5 space-y-2">
              <label className="block text-xs font-semibold text-zinc-300">
                Positioning (one sentence)
              </label>
              <textarea
                rows={3}
                value={bible.positioning}
                onChange={(e) => updateBible({ positioning: e.target.value })}
                className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="bg-[#14171D] border border-[#262B36] rounded-xl p-5 space-y-2">
              <label className="block text-xs font-semibold text-zinc-300">
                Audience
              </label>
              <textarea
                rows={3}
                value={bible.audience}
                onChange={(e) => updateBible({ audience: e.target.value })}
                className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Tone of Voice & Visual Style */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-[#14171D] border border-[#262B36] rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-zinc-100">Tone of Voice</h2>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Key adjectives (comma-separated)
                </label>
                <input
                  type="text"
                  value={bible.toneOfVoice.adjectives.join(', ')}
                  onChange={(e) =>
                    updateBible({
                      toneOfVoice: {
                        ...bible.toneOfVoice,
                        adjectives: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      },
                    })
                  }
                  className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Guidance</label>
                <textarea
                  rows={3}
                  value={bible.toneOfVoice.guidance}
                  onChange={(e) =>
                    updateBible({
                      toneOfVoice: { ...bible.toneOfVoice, guidance: e.target.value },
                    })
                  }
                  className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="bg-[#14171D] border border-[#262B36] rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-zinc-100">Visual Style</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Palette</label>
                  <input
                    type="text"
                    value={bible.visualStyle.palette}
                    onChange={(e) =>
                      updateBible({
                        visualStyle: { ...bible.visualStyle, palette: e.target.value },
                      })
                    }
                    className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Lighting</label>
                  <input
                    type="text"
                    value={bible.visualStyle.lighting}
                    onChange={(e) =>
                      updateBible({
                        visualStyle: { ...bible.visualStyle, lighting: e.target.value },
                      })
                    }
                    className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    Lens & Framing
                  </label>
                  <input
                    type="text"
                    value={bible.visualStyle.lensAndFraming}
                    onChange={(e) =>
                      updateBible({
                        visualStyle: {
                          ...bible.visualStyle,
                          lensAndFraming: e.target.value,
                        },
                      })
                    }
                    className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Color Grade</label>
                  <input
                    type="text"
                    value={bible.visualStyle.grade}
                    onChange={(e) =>
                      updateBible({
                        visualStyle: { ...bible.visualStyle, grade: e.target.value },
                      })
                    }
                    className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Characters (Fixed Descriptors) */}
          <div className="bg-[#14171D] border border-[#262B36] rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">
                  Characters — Fixed Visual Descriptors
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Each descriptor is pasted word-for-word into every storyboard frame prompt to
                  maintain continuity.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateBible({
                    characters: [
                      ...bible.characters,
                      {
                        id: `char-${Date.now()}`,
                        name: 'New Character',
                        fixedDescriptor: '',
                      },
                    ],
                  })
                }
                className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 hover:text-amber-300 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add character
              </button>
            </div>

            <div className="space-y-2.5">
              {bible.characters.map((char) => (
                <div
                  key={char.id}
                  className="grid grid-cols-1 md:grid-cols-[220px_1fr_auto] gap-3 items-start bg-[#0B0D10] border border-[#262B36] rounded-lg p-3"
                >
                  <input
                    type="text"
                    value={char.name}
                    onChange={(e) =>
                      updateBible({
                        characters: bible.characters.map((c) =>
                          c.id === char.id ? { ...c, name: e.target.value } : c
                        ),
                      })
                    }
                    placeholder="Character name"
                    className="bg-[#14171D] border border-[#262B36] rounded px-2.5 py-1.5 text-xs font-semibold text-zinc-100 focus:outline-none focus:border-amber-500"
                  />
                  <textarea
                    rows={2}
                    value={char.fixedDescriptor}
                    onChange={(e) =>
                      updateBible({
                        characters: bible.characters.map((c) =>
                          c.id === char.id
                            ? { ...c, fixedDescriptor: e.target.value }
                            : c
                        ),
                      })
                    }
                    placeholder="Exact fixed visual descriptor (age, hair, clothing, accessories)..."
                    className="bg-[#14171D] border border-[#262B36] rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      updateBible({
                        characters: bible.characters.filter((c) => c.id !== char.id),
                      })
                    }
                    className="p-1.5 text-zinc-500 hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Product Rules & Banned List */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-[#14171D] border border-[#262B36] rounded-xl p-5 space-y-2">
              <label className="block text-sm font-semibold text-zinc-100">
                Product Rules (from real product photos & intake)
              </label>
              <textarea
                rows={4}
                value={bible.productRules}
                onChange={(e) => updateBible({ productRules: e.target.value })}
                className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3.5 py-2.5 text-xs text-zinc-100 leading-relaxed focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="bg-[#14171D] border border-[#262B36] rounded-xl p-5 space-y-2">
              <label className="block text-sm font-semibold text-zinc-100">
                Banned List (one item per line)
              </label>
              <textarea
                rows={4}
                value={bible.bannedList.join('\n')}
                onChange={(e) =>
                  updateBible({
                    bannedList: e.target.value
                      .split('\n')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3.5 py-2.5 text-xs text-zinc-100 leading-relaxed focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Claims Allowed */}
          <div className="bg-[#14171D] border border-[#262B36] rounded-xl p-5 space-y-2">
            <label className="block text-sm font-semibold text-zinc-100">
              Claims Allowed (one provable claim per line)
            </label>
            <textarea
              rows={3}
              value={bible.claimsAllowed.join('\n')}
              onChange={(e) =>
                updateBible({
                  claimsAllowed: e.target.value
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3.5 py-2.5 text-xs text-emerald-200 leading-relaxed focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>
      )}
    </div>
  );
};
