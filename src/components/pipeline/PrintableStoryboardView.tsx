import React from 'react';
import { Printer, ArrowLeft, Image as ImageIcon, Package } from 'lucide-react';
import { PipelineProject, ShotRoute } from '../../types/pipeline';

interface PrintableStoryboardViewProps {
  project: PipelineProject;
  onBack: () => void;
}

function getRouteBadgeLabel(route: ShotRoute): string {
  if (route === 'live') return 'LIVE SHOOT';
  if (route === 'hybrid') return 'HYBRID';
  return 'AI';
}

function getRouteBadgeStyle(route: ShotRoute): string {
  if (route === 'live') {
    return 'bg-emerald-100 text-emerald-900 border-emerald-300';
  }
  if (route === 'hybrid') {
    return 'bg-amber-100 text-amber-900 border-amber-300';
  }
  return 'bg-slate-200 text-slate-900 border-slate-300';
}

export const PrintableStoryboardView: React.FC<PrintableStoryboardViewProps> = ({
  project,
  onBack,
}) => {
  const totalSec = project.shots.reduce(
    (sum, s) => sum + (Number(s.durationSec) || 0),
    0
  );

  return (
    <div className="max-w-[1060px] mx-auto px-6 py-7 space-y-6 print-only-full">
      {/* Screen Toolbar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[#262B36]">
        <div>
          <div className="text-xs font-medium text-amber-400">
            Printable Storyboard
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 mt-1">
            {project.client} — {project.product.name}
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            All shots in order with route badges, shoot direction, VO lines, and product flags
            ready for Print-to-PDF.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-200 bg-[#14171D] border border-[#262B36] hover:border-zinc-500 rounded-lg transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Shot Board
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
        {/* Storyboard Document Header */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-slate-900 pb-4">
          <div>
            <div className="text-xs font-bold tracking-wider text-slate-500 uppercase">
              52Launch Production Storyboard
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mt-1">
              {project.client} — {project.product.name}
            </h2>
            {project.creativeBrief.recommendedConcept.title && (
              <div className="text-xs text-slate-600 mt-1">
                Concept: {project.creativeBrief.recommendedConcept.title}
              </div>
            )}
          </div>
          <div className="text-right text-xs font-mono text-slate-700 tabular-nums">
            <div>{project.shots.length} Shots</div>
            <div>{totalSec}s Total Runtime</div>
          </div>
        </div>

        {/* Ordered Shot Rows */}
        <div className="space-y-6">
          {project.shots.map((shot) => (
            <div
              key={shot.id}
              className="print-avoid-break border border-slate-300 rounded-lg overflow-hidden bg-white"
            >
              {/* Shot Top Meta Strip */}
              <div className="px-4 py-2 bg-slate-100 border-b border-slate-300 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono font-bold text-slate-900 text-sm">
                    {shot.id}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded border text-[11px] font-bold tracking-wide ${getRouteBadgeStyle(
                      shot.route
                    )}`}
                  >
                    {getRouteBadgeLabel(shot.route)}
                  </span>
                  {shot.route !== 'live' && (
                    <span className="text-slate-600 font-medium">
                      Model:{' '}
                      {shot.model === 'flux3'
                        ? 'Flux 3'
                        : shot.model === 'kling'
                          ? 'Kling 4.0'
                          : shot.model === 'wan'
                            ? 'Wan 3.0 Prime'
                            : shot.model === 'luma'
                              ? 'Luma Ray 3.2'
                              : 'Seedance'}
                    </span>
                  )}
                  <span className="text-slate-500">· {shot.deliverable}</span>
                </div>

                <div className="flex items-center gap-3">
                  {shot.productInFrame && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 border border-amber-400 text-amber-900 text-[11px] font-bold">
                      <Package className="w-3 h-3" />
                      PRODUCT IN FRAME
                    </span>
                  )}
                  <span className="font-mono font-semibold text-slate-800 tabular-nums">
                    {shot.durationSec}s
                  </span>
                </div>
              </div>

              {/* Large Frame + Details */}
              <div className="grid grid-cols-1 md:grid-cols-[360px_1fr]">
                <div className="aspect-video bg-slate-50 border-b md:border-b-0 md:border-r border-slate-300 flex items-center justify-center overflow-hidden">
                  {shot.frameImageUrl ? (
                    <img
                      src={shot.frameImageUrl}
                      alt={`Shot ${shot.id} storyboard frame`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center text-slate-400 p-4 space-y-1">
                      <ImageIcon className="w-6 h-6 mx-auto" />
                      <div className="text-xs">Frame pending upload</div>
                    </div>
                  )}
                </div>

                <div className="p-4 space-y-2.5 text-xs leading-relaxed">
                  <div>
                    <div className="font-bold text-slate-900">Scene</div>
                    <p className="text-slate-800 mt-0.5">
                      {shot.scene || 'No scene description entered.'}
                    </p>
                  </div>

                  {(shot.route === 'live' || shot.route === 'hybrid') && (
                    <div>
                      <div className="font-bold text-emerald-900">Shoot Direction</div>
                      <p className="text-slate-700 mt-0.5">
                        {shot.shootDirection || 'No shoot direction entered yet.'}
                      </p>
                    </div>
                  )}

                  {shot.voLine && (
                    <div className="pt-1 border-t border-slate-200">
                      <span className="font-bold text-slate-900">VO Line: </span>
                      <span className="italic text-slate-800">&ldquo;{shot.voLine}&rdquo;</span>
                    </div>
                  )}

                  {shot.continuityNotes && (
                    <div className="text-[11px] text-slate-500">
                      <span className="font-semibold text-slate-700">Continuity:</span>{' '}
                      {shot.continuityNotes}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
