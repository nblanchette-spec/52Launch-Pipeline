import React from 'react';
import { Printer, ArrowLeft, Clock, MapPin, Users, Wrench, Package, HelpCircle, ShieldAlert } from 'lucide-react';
import { PipelineProject, ShootPlan } from '../../types/pipeline';

interface PrintableCallSheetViewProps {
  project: PipelineProject;
  plan: ShootPlan;
  onBack: () => void;
}

export const PrintableCallSheetView: React.FC<PrintableCallSheetViewProps> = ({
  project,
  plan,
  onBack,
}) => {
  const liveHybridShots = project.shots.filter((s) => s.route !== 'ai_video');

  return (
    <div className="max-w-[1060px] mx-auto px-6 py-7 space-y-6 print-only-full">
      {/* Screen Toolbar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[#262B36]">
        <div>
          <div className="text-xs font-medium text-amber-400">
            Printable Call Sheet &amp; Shoot Plan
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 mt-1">
            {project.client} — {project.product.name}
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Line producer call sheet, shoot days, equipment, crew, and props ready for Print-to-PDF.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-200 bg-[#14171D] border border-[#262B36] hover:border-zinc-500 rounded-lg transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Shoot Plan
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Print / Save PDF
          </button>
        </div>
      </div>

      {/* Light-Mode Print Document */}
      <div className="bg-white text-slate-900 border border-slate-200 rounded-xl p-8 space-y-6 shadow-lg print:border-0 print:shadow-none print:p-0">
        {/* Document Header */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-slate-900 pb-4">
          <div>
            <div className="text-xs font-bold tracking-wider text-slate-500 uppercase">
              52Launch Production Call Sheet &amp; Shoot Plan
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mt-1">
              {project.client} — {project.product.name}
            </h2>
            <div className="text-xs text-slate-600 mt-1 line-clamp-1">
              Objective: {project.creativeBrief.objective}
            </div>
          </div>
          <div className="text-right text-xs font-mono text-slate-700 tabular-nums">
            <div>{liveHybridShots.length} Live/Hybrid Shots</div>
            <div>{plan.shootDays.length} Shoot Day(s)</div>
          </div>
        </div>

        {/* Shoot Days & Setups */}
        <div className="space-y-6">
          <h3 className="text-sm font-bold tracking-wider text-slate-700 uppercase border-b border-slate-200 pb-1.5 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-600" />
            Schedule &amp; Shoot Days
          </h3>

          {plan.shootDays.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No shoot days scheduled.</p>
          ) : (
            plan.shootDays.map((day) => (
              <div
                key={day.id}
                className="print-avoid-break border border-slate-300 rounded-lg p-5 space-y-4 bg-white"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 text-xs">
                  <div>
                    <span className="font-bold text-base text-slate-900">{day.dayLabel}</span>
                    <span className="text-slate-500 mx-2">·</span>
                    <span className="text-slate-700 font-medium inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-500" />
                      {day.location}
                    </span>
                  </div>
                  <div className="font-mono bg-slate-100 px-3 py-1 rounded border border-slate-200 text-slate-800">
                    Call: <strong>{day.callTime}</strong> | Wrap: <strong>{day.wrapTime}</strong>
                  </div>
                </div>

                <div className="space-y-3">
                  {day.setups.map((st, idx) => (
                    <div
                      key={idx}
                      className="print-avoid-break text-xs space-y-1.5 pl-3 border-l-2 border-slate-400 py-1"
                    >
                      <div className="font-bold text-slate-900 flex items-center justify-between">
                        <span>
                          {st.setupName} — <span className="font-mono text-slate-700">Shots: {st.shotIds.join(', ')}</span>
                        </span>
                        <span className="font-mono text-slate-500">{st.estimatedMinutes} mins</span>
                      </div>
                      <p className="text-slate-700 leading-relaxed">{st.lightingNotes}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Equipment & Crew */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
          <div className="print-avoid-break border border-slate-300 rounded-lg p-5 space-y-3 bg-white">
            <h3 className="text-xs font-bold tracking-wider text-slate-700 uppercase flex items-center gap-2 border-b border-slate-200 pb-2">
              <Wrench className="w-4 h-4 text-slate-600" />
              Required Equipment ({plan.equipment.length})
            </h3>
            {plan.equipment.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No equipment listed.</p>
            ) : (
              <ul className="list-disc pl-4 space-y-1 text-xs text-slate-800">
                {plan.equipment.map((eq, i) => (
                  <li key={i}>{eq}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="print-avoid-break border border-slate-300 rounded-lg p-5 space-y-3 bg-white">
            <h3 className="text-xs font-bold tracking-wider text-slate-700 uppercase flex items-center gap-2 border-b border-slate-200 pb-2">
              <Users className="w-4 h-4 text-slate-600" />
              Crew &amp; Roles ({plan.crew.length})
            </h3>
            {plan.crew.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No crew listed.</p>
            ) : (
              <ul className="list-disc pl-4 space-y-1 text-xs text-slate-800">
                {plan.crew.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Props & Product Units */}
        {plan.propsAndUnits.length > 0 && (
          <div className="print-avoid-break border border-slate-300 rounded-lg p-5 space-y-3 bg-white">
            <h3 className="text-xs font-bold tracking-wider text-slate-700 uppercase flex items-center gap-2 border-b border-slate-200 pb-2">
              <Package className="w-4 h-4 text-slate-600" />
              Props &amp; Product Units ({plan.propsAndUnits.length})
            </h3>
            <ul className="space-y-2 text-xs text-slate-800">
              {plan.propsAndUnits.map((p, i) => (
                <li key={i} className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <div>
                    <strong>{p.item}</strong> — Qty: {p.quantity}
                  </div>
                  <div className="font-mono text-slate-500 text-[11px]">
                    Supplied by: {p.suppliedBy}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Client Questions & Risks */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          {plan.clientQuestions.length > 0 && (
            <div className="print-avoid-break border border-amber-300 bg-amber-50/40 rounded-lg p-5 space-y-3">
              <h3 className="text-xs font-bold tracking-wider text-amber-900 uppercase flex items-center gap-2 border-b border-amber-200 pb-2">
                <HelpCircle className="w-4 h-4 text-amber-700" />
                Open Client Questions ({plan.clientQuestions.length})
              </h3>
              <ul className="list-disc pl-4 space-y-1 text-xs text-amber-950">
                {plan.clientQuestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}

          {plan.risks.length > 0 && (
            <div className="print-avoid-break border border-rose-300 bg-rose-50/40 rounded-lg p-5 space-y-3">
              <h3 className="text-xs font-bold tracking-wider text-rose-900 uppercase flex items-center gap-2 border-b border-rose-200 pb-2">
                <ShieldAlert className="w-4 h-4 text-rose-700" />
                Production Risks &amp; Mitigations ({plan.risks.length})
              </h3>
              <ul className="list-disc pl-4 space-y-1 text-xs text-rose-950">
                {plan.risks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
