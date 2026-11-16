import React, { useMemo, useState } from 'react';
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Printer,
  Calendar,
  Clapperboard,
  Package,
  Users,
  Camera,
  HelpCircle,
  ShieldAlert,
} from 'lucide-react';
import {
  PipelineProject,
  ShootDayPlan,
  ShootPlan,
} from '../../types/pipeline';

interface Step9ShootPlanProps {
  project: PipelineProject;
  onUpdateProject: (updated: PipelineProject) => Promise<void>;
  onGenerateShootPlan: () => Promise<void>;
  onApproveShootPlan: () => Promise<void>;
}

export const Step9ShootPlan: React.FC<Step9ShootPlanProps> = ({
  project,
  onUpdateProject,
  onGenerateShootPlan,
  onApproveShootPlan,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [confirmOverwriteOpen, setConfirmOverwriteOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const liveHybridShots = useMemo(
    () => project.shots.filter((s) => s.route === 'live' || s.route === 'hybrid'),
    [project.shots]
  );
  const aiOnlyShots = useMemo(
    () => project.shots.filter((s) => s.route === 'ai_video'),
    [project.shots]
  );

  const plan = project.shootPlan;

  const updatePlan = (patch: Partial<ShootPlan>) => {
    void onUpdateProject({
      ...project,
      shootPlan: {
        ...plan,
        ...patch,
        hasGenerated: true,
        manuallyEdited: true,
      },
      approvals: {
        ...project.approvals,
        shootPlanApproved: false,
      },
    });
  };

  const handleGenerateClick = async (confirmed = false) => {
    if (plan.manuallyEdited && !confirmed) {
      setConfirmOverwriteOpen(true);
      return;
    }
    setConfirmOverwriteOpen(false);
    setErrorMsg(null);
    setIsGenerating(true);
    try {
      await onGenerateShootPlan();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Could not build shoot plan.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const updateDay = (dayId: string, patch: Partial<ShootDayPlan>) => {
    updatePlan({
      shootDays: plan.shootDays.map((d) =>
        d.id === dayId ? { ...d, ...patch } : d
      ),
    });
  };

  const handleAddDay = () => {
    const newDay: ShootDayPlan = {
      id: `day-${Date.now()}`,
      dayLabel: `Shoot Day ${plan.shootDays.length + 1}`,
      location: 'Location TBD — confirm with client',
      callTime: 'TBD',
      wrapTime: 'TBD',
      setups: [
        {
          setupName: 'Setup A',
          lightingNotes: '',
          shotIds: liveHybridShots.slice(0, 1).map((s) => s.id),
          estimatedMinutes: 60,
        },
      ],
    };
    updatePlan({ shootDays: [...plan.shootDays, newDay] });
  };

  const handleRemoveDay = (dayId: string) => {
    updatePlan({
      shootDays: plan.shootDays.filter((d) => d.id !== dayId),
    });
  };

  const updateSetup = (
    dayId: string,
    setupIndex: number,
    patch: Partial<ShootDayPlan['setups'][number]>
  ) => {
    updatePlan({
      shootDays: plan.shootDays.map((d) => {
        if (d.id !== dayId) return d;
        return {
          ...d,
          setups: d.setups.map((st, idx) =>
            idx === setupIndex ? { ...st, ...patch } : st
          ),
        };
      }),
    });
  };

  const handleAddSetup = (dayId: string) => {
    updatePlan({
      shootDays: plan.shootDays.map((d) =>
        d.id === dayId
          ? {
              ...d,
              setups: [
                ...d.setups,
                {
                  setupName: `Setup ${String.fromCharCode(65 + d.setups.length)}`,
                  lightingNotes: '',
                  shotIds: [],
                  estimatedMinutes: 45,
                },
              ],
            }
          : d
      ),
    });
  };

  const handleRemoveSetup = (dayId: string, setupIndex: number) => {
    updatePlan({
      shootDays: plan.shootDays.map((d) =>
        d.id === dayId
          ? { ...d, setups: d.setups.filter((_, i) => i !== setupIndex) }
          : d
      ),
    });
  };

  const updateStringList = (
    key: 'equipment' | 'crew' | 'risks' | 'clientQuestions',
    index: number,
    value: string
  ) => {
    const next = [...plan[key]];
    next[index] = value;
    updatePlan({ [key]: next } as Partial<ShootPlan>);
  };

  const addStringListItem = (
    key: 'equipment' | 'crew' | 'risks' | 'clientQuestions',
    placeholder = ''
  ) => {
    updatePlan({ [key]: [...plan[key], placeholder] } as Partial<ShootPlan>);
  };

  const removeStringListItem = (
    key: 'equipment' | 'crew' | 'risks' | 'clientQuestions',
    index: number
  ) => {
    updatePlan({
      [key]: plan[key].filter((_, i) => i !== index),
    } as Partial<ShootPlan>);
  };

  return (
    <>
      {/* Screen Interactive Workspace */}
      <div className="no-print max-w-[1320px] mx-auto px-6 py-7 space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-[#262B36]">
          <div>
            <div className="text-xs font-medium text-amber-400">
              Step 9 · Live &amp; Hybrid Shoot Plan
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100 mt-1">
              Line Producer Call Sheet &amp; Production Schedule
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Covers <strong className="text-zinc-200">{liveHybridShots.length}</strong>{' '}
              Live &amp; Hybrid shot{liveHybridShots.length === 1 ? '' : 's'} grouped by
              location and lighting ({aiOnlyShots.length} AI-only shot
              {aiOnlyShots.length === 1 ? '' : 's'} excluded). Missing dates or budget
              notes appear under Client Questions rather than being guessed.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={isGenerating}
              onClick={() => void handleGenerateClick(false)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 rounded-lg transition-colors cursor-pointer"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {isGenerating
                ? 'Building Shoot Plan...'
                : plan.hasGenerated
                  ? 'Refresh shoot plan'
                  : 'Generate shoot plan'}
            </button>

            {plan.hasGenerated && (
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-200 bg-[#14171D] border border-[#262B36] hover:border-zinc-500 rounded-lg transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Call Sheet / PDF
              </button>
            )}

            {project.approvals.shootPlanApproved ? (
              <span className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-zinc-950 bg-emerald-400 rounded-lg whitespace-nowrap">
                <CheckCircle2 className="w-4 h-4" />
                Shoot Plan Approved
              </span>
            ) : (
              <button
                type="button"
                disabled={!plan.hasGenerated}
                onClick={() => void onApproveShootPlan()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-zinc-100 bg-[#14171D] border border-emerald-500/50 hover:bg-emerald-500/15 disabled:opacity-40 rounded-lg transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Approve shoot plan
              </button>
            )}
          </div>
        </div>

        {/* Manual edit overwrite confirmation */}
        {confirmOverwriteOpen && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 text-xs text-amber-100">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong>You have manual edits in the Shoot Plan.</strong> Regenerating
                will replace your current schedule, crew, and gear lists. Continue?
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
                onClick={() => void handleGenerateClick(true)}
                className="px-3.5 py-1.5 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg cursor-pointer"
              >
                Replace with fresh plan
              </button>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/40 text-xs text-rose-300">
            {errorMsg}
          </div>
        )}

        {/* Included Live & Hybrid Shots Reference Bar */}
        <div className="bg-[#14171D] border border-[#262B36] rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
              <Clapperboard className="w-3.5 h-3.5 text-emerald-400" />
              Live &amp; Hybrid Shots Included on Set ({liveHybridShots.length})
            </span>
            <span className="text-zinc-500">
              Intake notes:{' '}
              {project.intake.shootLocationDatesBudgetNotes || 'Not provided in intake'}
            </span>
          </div>
          {liveHybridShots.length === 0 ? (
            <div className="text-xs text-zinc-400">
              All current shots are routed to AI video only. You can still review or add
              pickup shoot notes below.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {liveHybridShots.map((shot) => (
                <div
                  key={shot.id}
                  className="bg-[#0B0D10] border border-[#262B36] rounded-lg p-3 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-amber-400">{shot.id}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        shot.route === 'live'
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      {shot.route === 'live' ? 'Live Shoot' : 'Hybrid'}
                    </span>
                  </div>
                  <div className="text-zinc-200 line-clamp-2">{shot.scene}</div>
                  {shot.shootDirection && (
                    <div className="text-[11px] text-zinc-400 line-clamp-2">
                      {shot.shootDirection}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Empty State Before First Generation */}
        {!plan.hasGenerated ? (
          <div className="bg-[#14171D] border border-dashed border-[#262B36] rounded-xl p-12 text-center space-y-3">
            <Calendar className="w-8 h-8 text-amber-400 mx-auto" />
            <h2 className="text-base font-semibold text-zinc-100">
              Ready to Build the Live &amp; Hybrid Shoot Plan
            </h2>
            <p className="text-xs text-zinc-400 max-w-lg mx-auto leading-relaxed">
              Gemini will group your live and hybrid shots by location and lighting, specify
              gear, crew, and backup product units, and flag any missing shoot dates or
              budget answers for the client.
            </p>
            <div className="pt-2">
              <button
                type="button"
                disabled={isGenerating}
                onClick={() => void handleGenerateClick(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Generate shoot plan
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Client Questions Banner */}
            <section className="bg-[#14171D] border border-amber-500/40 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4" />
                  Questions for Client (Missing Dates, Budget, or Location Details)
                </h2>
                <button
                  type="button"
                  onClick={() => addStringListItem('clientQuestions', '')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  Add question
                </button>
              </div>
              {plan.clientQuestions.length === 0 ? (
                <p className="text-xs text-zinc-400">
                  No open client questions flagged.
                </p>
              ) : (
                <div className="space-y-2">
                  {plan.clientQuestions.map((q, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={q}
                        onChange={(e) =>
                          updateStringList('clientQuestions', idx, e.target.value)
                        }
                        placeholder="Question for the client before confirming shoot..."
                        className="flex-1 bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                      />
                      <button
                        type="button"
                        onClick={() => removeStringListItem('clientQuestions', idx)}
                        className="p-2 text-zinc-500 hover:text-rose-400 cursor-pointer"
                        aria-label="Remove question"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Shoot Days & Location/Lighting Setups */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-amber-400" />
                  Shoot Days &amp; Location / Lighting Setups
                </h2>
                <button
                  type="button"
                  onClick={handleAddDay}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-100 bg-[#14171D] border border-[#262B36] hover:border-amber-500 rounded-lg cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-400" />
                  Add shoot day
                </button>
              </div>

              {plan.shootDays.length === 0 ? (
                <div className="bg-[#14171D] border border-[#262B36] rounded-xl p-6 text-xs text-zinc-400">
                  No shoot days scheduled. Click <strong>Add shoot day</strong> to create
                  one manually.
                </div>
              ) : (
                <div className="space-y-4">
                  {plan.shootDays.map((day) => (
                    <div
                      key={day.id}
                      className="bg-[#14171D] border border-[#262B36] rounded-xl overflow-hidden"
                    >
                      <div className="px-5 py-3.5 bg-[#101318] border-b border-[#262B36] grid grid-cols-1 md:grid-cols-[180px_1fr_140px_140px_auto] gap-3 items-end">
                        <div>
                          <label className="text-[11px] text-zinc-400 block mb-1">
                            Shoot Day
                          </label>
                          <input
                            type="text"
                            value={day.dayLabel}
                            onChange={(e) =>
                              updateDay(day.id, { dayLabel: e.target.value })
                            }
                            className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-2.5 py-1.5 text-xs font-semibold text-amber-300 focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-zinc-400 block mb-1">
                            Location
                          </label>
                          <input
                            type="text"
                            value={day.location}
                            onChange={(e) =>
                              updateDay(day.id, { location: e.target.value })
                            }
                            className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-zinc-400 block mb-1">
                            Call Time
                          </label>
                          <input
                            type="text"
                            value={day.callTime}
                            onChange={(e) =>
                              updateDay(day.id, { callTime: e.target.value })
                            }
                            className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-zinc-400 block mb-1">
                            Wrap Time
                          </label>
                          <input
                            type="text"
                            value={day.wrapTime}
                            onChange={(e) =>
                              updateDay(day.id, { wrapTime: e.target.value })
                            }
                            className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveDay(day.id)}
                          className="p-2 text-zinc-500 hover:text-rose-400 cursor-pointer"
                          aria-label="Delete shoot day"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="p-5 space-y-3">
                        {day.setups.map((setup, sIdx) => (
                          <div
                            key={sIdx}
                            className="bg-[#0B0D10] border border-[#262B36] rounded-lg p-4 space-y-3"
                          >
                            <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_120px_auto] gap-3 items-end">
                              <div>
                                <label className="text-[11px] text-zinc-400 block mb-1">
                                  Setup Name
                                </label>
                                <input
                                  type="text"
                                  value={setup.setupName}
                                  onChange={(e) =>
                                    updateSetup(day.id, sIdx, {
                                      setupName: e.target.value,
                                    })
                                  }
                                  className="w-full bg-[#14171D] border border-[#262B36] rounded-lg px-2.5 py-1.5 text-xs font-semibold text-zinc-100 focus:outline-none focus:border-amber-500"
                                />
                              </div>

                              <div>
                                <label className="text-[11px] text-zinc-400 block mb-1">
                                  Shots in Setup (comma-separated)
                                </label>
                                <input
                                  type="text"
                                  value={setup.shotIds.join(', ')}
                                  onChange={(e) =>
                                    updateSetup(day.id, sIdx, {
                                      shotIds: e.target.value
                                        .split(',')
                                        .map((x) => x.trim())
                                        .filter(Boolean),
                                    })
                                  }
                                  className="w-full bg-[#14171D] border border-[#262B36] rounded-lg px-2.5 py-1.5 text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-500"
                                />
                              </div>

                              <div>
                                <label className="text-[11px] text-zinc-400 block mb-1">
                                  Est. Minutes
                                </label>
                                <input
                                  type="number"
                                  min={5}
                                  step={5}
                                  value={setup.estimatedMinutes}
                                  onChange={(e) =>
                                    updateSetup(day.id, sIdx, {
                                      estimatedMinutes: Number(e.target.value) || 30,
                                    })
                                  }
                                  className="w-full bg-[#14171D] border border-[#262B36] rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-amber-500"
                                />
                              </div>

                              <button
                                type="button"
                                onClick={() => handleRemoveSetup(day.id, sIdx)}
                                className="p-2 text-zinc-500 hover:text-rose-400 cursor-pointer"
                                aria-label="Delete setup"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div>
                              <label className="text-[11px] text-zinc-400 block mb-1">
                                Lighting &amp; Camera Approach
                              </label>
                              <textarea
                                rows={2}
                                value={setup.lightingNotes}
                                onChange={(e) =>
                                  updateSetup(day.id, sIdx, {
                                    lightingNotes: e.target.value,
                                  })
                                }
                                className="w-full bg-[#14171D] border border-[#262B36] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                              />
                            </div>
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() => handleAddSetup(day.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 bg-[#0B0D10] border border-dashed border-[#262B36] hover:border-amber-500/60 rounded-lg cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add setup to {day.dayLabel}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Props & Product Units Table Card */}
            <section className="bg-[#14171D] border border-[#262B36] rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                  <Package className="w-4 h-4 text-amber-400" />
                  Props &amp; Real Product Units (Including Backups)
                </h2>
                <button
                  type="button"
                  onClick={() =>
                    updatePlan({
                      propsAndUnits: [
                        ...plan.propsAndUnits,
                        { item: '', quantity: '2 hero + 1 spare', suppliedBy: 'Client' },
                      ],
                    })
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-zinc-200 bg-[#0B0D10] border border-[#262B36] hover:border-amber-500 rounded-lg cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  Add prop / unit
                </button>
              </div>

              <div className="space-y-2">
                {plan.propsAndUnits.map((prop, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 md:grid-cols-[1fr_200px_180px_auto] gap-2.5 items-center"
                  >
                    <input
                      type="text"
                      value={prop.item}
                      placeholder="Item name"
                      onChange={(e) => {
                        const next = [...plan.propsAndUnits];
                        next[idx] = { ...next[idx], item: e.target.value };
                        updatePlan({ propsAndUnits: next });
                      }}
                      className="bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                    />
                    <input
                      type="text"
                      value={prop.quantity}
                      placeholder="Quantity (incl. spares)"
                      onChange={(e) => {
                        const next = [...plan.propsAndUnits];
                        next[idx] = { ...next[idx], quantity: e.target.value };
                        updatePlan({ propsAndUnits: next });
                      }}
                      className="bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                    />
                    <input
                      type="text"
                      value={prop.suppliedBy}
                      placeholder="Supplied by"
                      onChange={(e) => {
                        const next = [...plan.propsAndUnits];
                        next[idx] = { ...next[idx], suppliedBy: e.target.value };
                        updatePlan({ propsAndUnits: next });
                      }}
                      className="bg-[#0B0D10] border border-[#262B36] rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updatePlan({
                          propsAndUnits: plan.propsAndUnits.filter((_, i) => i !== idx),
                        })
                      }
                      className="p-2 text-zinc-500 hover:text-rose-400 cursor-pointer"
                      aria-label="Remove prop row"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* Equipment, Crew, Risks Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Equipment */}
              <section className="bg-[#14171D] border border-[#262B36] rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                    <Camera className="w-4 h-4 text-amber-400" />
                    Camera &amp; Grip Gear
                  </h2>
                  <button
                    type="button"
                    onClick={() => addStringListItem('equipment', '')}
                    className="p-1 text-zinc-400 hover:text-amber-300 cursor-pointer"
                    aria-label="Add equipment item"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-2">
                  {plan.equipment.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={item}
                        onChange={(e) =>
                          updateStringList('equipment', idx, e.target.value)
                        }
                        className="flex-1 bg-[#0B0D10] border border-[#262B36] rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                      />
                      <button
                        type="button"
                        onClick={() => removeStringListItem('equipment', idx)}
                        className="p-1.5 text-zinc-500 hover:text-rose-400 cursor-pointer"
                        aria-label="Remove equipment"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              {/* Crew */}
              <section className="bg-[#14171D] border border-[#262B36] rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-400" />
                    Crew Roles
                  </h2>
                  <button
                    type="button"
                    onClick={() => addStringListItem('crew', '')}
                    className="p-1 text-zinc-400 hover:text-amber-300 cursor-pointer"
                    aria-label="Add crew role"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-2">
                  {plan.crew.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={item}
                        onChange={(e) => updateStringList('crew', idx, e.target.value)}
                        className="flex-1 bg-[#0B0D10] border border-[#262B36] rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                      />
                      <button
                        type="button"
                        onClick={() => removeStringListItem('crew', idx)}
                        className="p-1.5 text-zinc-500 hover:text-rose-400 cursor-pointer"
                        aria-label="Remove crew"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              {/* Production Risks */}
              <section className="bg-[#14171D] border border-[#262B36] rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                    Risks &amp; Contingencies
                  </h2>
                  <button
                    type="button"
                    onClick={() => addStringListItem('risks', '')}
                    className="p-1 text-zinc-400 hover:text-amber-300 cursor-pointer"
                    aria-label="Add risk"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-2">
                  {plan.risks.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={item}
                        onChange={(e) => updateStringList('risks', idx, e.target.value)}
                        className="flex-1 bg-[#0B0D10] border border-[#262B36] rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                      />
                      <button
                        type="button"
                        onClick={() => removeStringListItem('risks', idx)}
                        className="p-1.5 text-zinc-500 hover:text-rose-400 cursor-pointer"
                        aria-label="Remove risk"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>

      {/* Print-Only Light-Mode Call Sheet PDF View */}
      <div className="hidden print:block bg-white text-slate-900 p-6 space-y-6">
        <div className="border-b-2 border-slate-900 pb-4 flex items-end justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              52Launch Production Call Sheet &amp; Shoot Plan
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">
              {project.client} — {project.product.name}
            </h1>
          </div>
          <div className="text-right text-xs font-mono text-slate-700">
            <div>{liveHybridShots.length} Live/Hybrid Shots</div>
            <div>{plan.shootDays.length} Shoot Day(s)</div>
          </div>
        </div>

        {plan.shootDays.map((day) => (
          <div
            key={day.id}
            className="print-avoid-break border border-slate-300 rounded-lg p-4 space-y-3"
          >
            <div className="flex flex-wrap justify-between border-b border-slate-200 pb-2 text-xs">
              <div>
                <span className="font-bold text-sm">{day.dayLabel}</span> ·{' '}
                <span>{day.location}</span>
              </div>
              <div className="font-mono">
                Call: {day.callTime} | Wrap: {day.wrapTime}
              </div>
            </div>
            {day.setups.map((st, idx) => (
              <div key={idx} className="text-xs space-y-1 pl-2 border-l-2 border-slate-400">
                <div className="font-bold">
                  {st.setupName} — Shots: {st.shotIds.join(', ')} ({st.estimatedMinutes} min)
                </div>
                <div className="text-slate-700">{st.lightingNotes}</div>
              </div>
            ))}
          </div>
        ))}

        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="print-avoid-break border border-slate-300 rounded-lg p-3">
            <div className="font-bold mb-1.5">Equipment</div>
            <ul className="list-disc pl-4 space-y-0.5">
              {plan.equipment.map((eq, i) => (
                <li key={i}>{eq}</li>
              ))}
            </ul>
          </div>
          <div className="print-avoid-break border border-slate-300 rounded-lg p-3">
            <div className="font-bold mb-1.5">Crew</div>
            <ul className="list-disc pl-4 space-y-0.5">
              {plan.crew.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        </div>

        {plan.propsAndUnits.length > 0 && (
          <div className="print-avoid-break border border-slate-300 rounded-lg p-3 text-xs">
            <div className="font-bold mb-1.5">Props &amp; Product Units</div>
            <ul className="space-y-1">
              {plan.propsAndUnits.map((p, i) => (
                <li key={i}>
                  <strong>{p.item}</strong> — {p.quantity} ({p.suppliedBy})
                </li>
              ))}
            </ul>
          </div>
        )}

        {plan.clientQuestions.length > 0 && (
          <div className="print-avoid-break border border-slate-300 rounded-lg p-3 text-xs">
            <div className="font-bold mb-1.5">Open Client Questions</div>
            <ul className="list-disc pl-4 space-y-0.5">
              {plan.clientQuestions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
};
