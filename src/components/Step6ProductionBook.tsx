import React from 'react';
import { Printer, CheckSquare, Square, Clapperboard } from 'lucide-react';
import { BrandProject, RequirementCategory } from '../types/studio';

interface Step6ProductionBookProps {
  project: BrandProject;
}

const REQ_CATEGORIES: RequirementCategory[] = [
  'Camera & Lenses',
  'Lighting & Grip',
  'Audio',
  'Art/Props/Wardrobe',
  'Talent & Releases',
];

export const Step6ProductionBook: React.FC<Step6ProductionBookProps> = ({ project }) => {
  const lockedTerritory = project.territories.find(
    (t) => t.id === project.lockedTerritoryId
  );

  // Group storyboard frames in rows of 3 for 3-up print sheets
  const frameChunks: Array<typeof project.storyboardPanels> = [];
  for (let i = 0; i < project.storyboardPanels.length; i += 3) {
    frameChunks.push(project.storyboardPanels.slice(i, i + 3));
  }

  return (
    <div className="max-w-[1120px] mx-auto px-6 py-7 space-y-6 print-only-full">
      {/* Screen-only Export Toolbar */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#262B36]">
        <div>
          <div className="text-xs font-medium text-amber-400">
            Step 06 · Print-Ready Production Book PDF Export
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 mt-1">
            52Launch Production Book Preview
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Formatted in clean light-mode paper layout with page-break safety for direct browser
            Print-to-PDF export.
          </p>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Printer className="w-4 h-4" />
          Export / Print Production PDF
        </button>
      </div>

      {/* LIGHT-MODE PAPER DOCUMENT SHEETS */}
      <div className="space-y-8 print:space-y-0">
        {/* 1. 52Launch Cover Page */}
        <section className="print-page bg-white text-slate-900 border border-slate-200 rounded-xl p-10 min-h-[680px] flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-200 pb-5">
            <div className="text-sm font-bold tracking-tight text-slate-900">
              52LAUNCH CREATIVE PRODUCTION STUDIO
            </div>
            <div className="text-xs font-mono text-slate-500">
              PHASE 1 PRE-PRODUCTION BOOK
            </div>
          </div>

          <div className="py-12 space-y-6">
            <div className="text-xs font-semibold text-amber-600 uppercase tracking-wider">
              {project.brandName} · {project.industry}
            </div>
            <h2 className="text-4xl font-bold tracking-tight text-slate-900 leading-tight max-w-2xl">
              {project.projectTitle}
            </h2>
            {lockedTerritory && (
              <p className="text-base text-slate-600 max-w-2xl leading-relaxed">
                <span className="font-semibold text-slate-900">
                  Locked Concept ({lockedTerritory.title}):
                </span>{' '}
                {lockedTerritory.loglineHook}
              </p>
            )}

            {/* Color Swatch Bar */}
            <div className="flex flex-wrap items-center gap-4 pt-4">
              {project.brief.colorPalette.map((sw) => (
                <div key={sw.id} className="flex items-center gap-2">
                  <span
                    className="w-6 h-6 rounded border border-slate-300"
                    style={{ backgroundColor: sw.hex }}
                  />
                  <div className="text-xs">
                    <div className="font-medium text-slate-800">{sw.name}</div>
                    <div className="font-mono text-[10px] text-slate-500">{sw.hex}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 border-t border-slate-200 pt-6 text-xs">
            <div>
              <div className="text-slate-400">Client Brand</div>
              <div className="font-semibold text-slate-900 mt-1">{project.brandName}</div>
            </div>
            <div>
              <div className="text-slate-400">Creative Director</div>
              <div className="font-semibold text-slate-900 mt-1">
                {project.directorName}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Principal Shoot Date</div>
              <div className="font-mono font-semibold text-slate-900 mt-1">
                {project.shootDate || 'TBD'}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Deliverable Specs</div>
              <div className="font-mono font-semibold text-slate-900 mt-1">
                {project.brief.deliverablesAspectRatios.join(' · ') || '16:9'}
              </div>
            </div>
          </div>
        </section>

        {/* 2. Executive Creative Brief & Palette */}
        <section className="print-page bg-white text-slate-900 border border-slate-200 rounded-xl p-8 space-y-6 shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <h3 className="text-lg font-bold text-slate-900">
              01. Executive Creative Brief & Visual Direction
            </h3>
            <span className="text-xs font-mono text-slate-500">{project.brandName}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs leading-relaxed">
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
              <div className="font-semibold text-slate-900 mb-1">Objective & KPIs</div>
              <p className="text-slate-700">
                {project.brief.objectiveAndKpis || 'Not yet specified.'}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
              <div className="font-semibold text-slate-900 mb-1">Target Audience Persona</div>
              <p className="text-slate-700">
                {project.brief.targetAudiencePersona || 'Not yet specified.'}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
              <div className="font-semibold text-slate-900 mb-1">Core Hook / Message</div>
              <p className="text-slate-700">
                {project.brief.coreHookMessage || 'Not yet specified.'}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
              <div className="font-semibold text-slate-900 mb-1">Tone & Pacing</div>
              <p className="text-slate-700">
                {project.brief.toneAndPacing || 'Not yet specified.'}
              </p>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs leading-relaxed">
            <div className="font-semibold text-slate-900 mb-1">
              Visual Style & Mandatories
            </div>
            <p className="text-slate-700 mb-2">{project.brief.visualStyleNotes}</p>
            <p className="text-slate-600">
              <span className="font-semibold text-slate-800">Mandatories:</span>{' '}
              {project.brief.mandatories || 'None'}
            </p>
          </div>

          {/* Locked Ingredients Snapshot */}
          <div className="space-y-3 pt-2">
            <div className="text-xs font-semibold text-slate-900">
              Approved Visual Ingredients (Cast · Locations · Hero Props)
            </div>
            <div className="grid grid-cols-3 gap-4">
              {project.castLocker
                .filter((c) => c.locked)
                .map((c) => (
                  <div
                    key={c.id}
                    className="print-avoid-break border border-slate-200 rounded-lg p-2.5 flex items-center gap-2.5"
                  >
                    {c.imageUrl && (
                      <img
                        src={c.imageUrl}
                        alt={c.name}
                        referrerPolicy="no-referrer"
                        className="w-12 h-14 object-cover rounded border border-slate-200 shrink-0"
                      />
                    )}
                    <div className="min-w-0 text-[11px]">
                      <div className="font-semibold text-slate-900 truncate">{c.name}</div>
                      <div className="text-slate-500 truncate">{c.role}</div>
                    </div>
                  </div>
                ))}

              {project.locationLocker
                .filter((l) => l.locked)
                .map((l) => (
                  <div
                    key={l.id}
                    className="print-avoid-break border border-slate-200 rounded-lg p-2.5 flex items-center gap-2.5"
                  >
                    {l.imageUrl && (
                      <img
                        src={l.imageUrl}
                        alt={l.name}
                        referrerPolicy="no-referrer"
                        className="w-14 h-12 object-cover rounded border border-slate-200 shrink-0"
                      />
                    )}
                    <div className="min-w-0 text-[11px]">
                      <div className="font-semibold text-slate-900 truncate">{l.name}</div>
                      <div className="text-slate-500 truncate">
                        {l.interiorExterior} · {l.timeOfDay}
                      </div>
                    </div>
                  </div>
                ))}

              {project.propLocker
                .filter((pr) => pr.locked)
                .map((pr) => (
                  <div
                    key={pr.id}
                    className="print-avoid-break border border-slate-200 rounded-lg p-2.5 flex items-center gap-2.5"
                  >
                    {pr.imageUrl && (
                      <img
                        src={pr.imageUrl}
                        alt={pr.name}
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 object-cover rounded border border-slate-200 shrink-0"
                      />
                    )}
                    <div className="min-w-0 text-[11px]">
                      <div className="font-semibold text-slate-900 truncate">{pr.name}</div>
                      <div className="text-slate-500 truncate">{pr.scale}</div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </section>

        {/* 3. Visual Storyboard Sheet (3-up Cinema Frames) */}
        <section className="print-page bg-white text-slate-900 border border-slate-200 rounded-xl p-8 space-y-6 shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <h3 className="text-lg font-bold text-slate-900">
              02. Visual Storyboard Sheet
            </h3>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {project.storyboardPanels.length} Panels
            </span>
          </div>

          {frameChunks.length === 0 ? (
            <div className="text-xs text-slate-500 py-8 text-center">
              No storyboard frames added yet.
            </div>
          ) : (
            <div className="space-y-6">
              {frameChunks.map((row, rowIdx) => (
                <div key={rowIdx} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {row.map((panel) => (
                    <div
                      key={panel.id}
                      className="print-avoid-break border border-slate-300 rounded-lg overflow-hidden flex flex-col bg-white"
                    >
                      <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-[11px]">
                        <span className="font-mono font-bold text-slate-900">
                          SHOT {panel.shotNumber}
                        </span>
                        <span className="font-mono text-slate-600">
                          {panel.shotSize} · {panel.aspectRatio}
                        </span>
                      </div>
                      <div className="aspect-video bg-slate-100 border-b border-slate-200 flex items-center justify-center overflow-hidden">
                        {panel.imageUrl ? (
                          <img
                            src={panel.imageUrl}
                            alt={`Shot ${panel.shotNumber}`}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Clapperboard className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                      <div className="p-3 space-y-1.5 text-[11px] leading-snug">
                        <div className="font-semibold text-slate-900">{panel.sceneLabel}</div>
                        <div className="text-slate-500">
                          {panel.cameraAngle} · {panel.cameraMovement}
                        </div>
                        <p className="text-slate-700">{panel.actionPrompt}</p>
                        {panel.dialogueAudio && (
                          <p className="text-slate-600 italic border-t border-slate-100 pt-1">
                            Audio: {panel.dialogueAudio}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 4. Master Shot List Table */}
        <section className="print-page bg-white text-slate-900 border border-slate-200 rounded-xl p-8 space-y-5 shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <h3 className="text-lg font-bold text-slate-900">03. Master Shot List</h3>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {project.storyboardPanels.length + project.extraShots.length} Total Shots
            </span>
          </div>

          <table className="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 text-slate-700">
                <th className="py-2 px-2">Shot</th>
                <th className="py-2 px-2">Scene</th>
                <th className="py-2 px-2">Size / Angle</th>
                <th className="py-2 px-2">Movement</th>
                <th className="py-2 px-2">Location</th>
                <th className="py-2 px-2">Cast & Props</th>
                <th className="py-2 px-2">Audio</th>
                <th className="py-2 px-2 text-right">Mins</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {project.storyboardPanels.map((p) => {
                const loc =
                  project.locationLocker.find((l) => l.id === p.locationId)?.name || '—';
                const cast =
                  project.castLocker
                    .filter((c) => p.castIds.includes(c.id))
                    .map((c) => c.name)
                    .join(', ') || '—';
                const props =
                  project.propLocker
                    .filter((pr) => p.propIds.includes(pr.id))
                    .map((pr) => pr.name)
                    .join(', ') || '—';
                return (
                  <tr key={p.id}>
                    <td className="py-2 px-2 font-mono font-bold text-slate-900">
                      {p.shotNumber}
                    </td>
                    <td className="py-2 px-2 font-medium text-slate-900">{p.sceneLabel}</td>
                    <td className="py-2 px-2 font-mono text-slate-700">
                      {p.shotSize} / {p.cameraAngle}
                    </td>
                    <td className="py-2 px-2 text-slate-700">{p.cameraMovement}</td>
                    <td className="py-2 px-2 text-slate-700">{loc}</td>
                    <td className="py-2 px-2 text-slate-700">
                      {cast} · {props}
                    </td>
                    <td className="py-2 px-2 text-slate-600">{p.dialogueAudio}</td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums">
                      {p.estDurationMins}
                    </td>
                  </tr>
                );
              })}

              {project.extraShots.map((s) => (
                <tr key={s.id} className="bg-slate-50">
                  <td className="py-2 px-2 font-mono font-bold text-slate-900">
                    {s.shotNumber}
                  </td>
                  <td className="py-2 px-2 font-medium text-slate-900">{s.sceneLabel}</td>
                  <td className="py-2 px-2 font-mono text-slate-700">
                    {s.shotSize} / {s.cameraAngle}
                  </td>
                  <td className="py-2 px-2 text-slate-700">{s.cameraMovement}</td>
                  <td className="py-2 px-2 text-slate-700">{s.locationName}</td>
                  <td className="py-2 px-2 text-slate-700">
                    {s.castNames} · {s.propNames}
                  </td>
                  <td className="py-2 px-2 text-slate-600">{s.dialogueAudio}</td>
                  <td className="py-2 px-2 text-right font-mono tabular-nums">
                    {s.estDurationMins}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* 5. Production Gear, Prop & Talent Checklist */}
        <section className="print-page bg-white text-slate-900 border border-slate-200 rounded-xl p-8 space-y-5 shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <h3 className="text-lg font-bold text-slate-900">
              04. Production Gear, Prop & Talent Checklist
            </h3>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {project.requirements.filter((r) => r.checked).length}/
              {project.requirements.length} Confirmed
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {REQ_CATEGORIES.map((cat) => {
              const items = project.requirements.filter((r) => r.category === cat);
              return (
                <div
                  key={cat}
                  className="print-avoid-break border border-slate-200 rounded-lg p-4 space-y-2"
                >
                  <div className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-1.5">
                    {cat}
                  </div>
                  {items.length === 0 ? (
                    <div className="text-[11px] text-slate-400">No items listed.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {items.map((item) => (
                        <div key={item.id} className="flex items-start gap-2 text-[11px]">
                          {item.checked ? (
                            <CheckSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <span className="font-medium text-slate-900">
                              {item.item} ({item.quantity})
                            </span>
                            {item.notes && (
                              <div className="text-slate-500">{item.notes}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* 6. Minute-by-Minute Shoot Day Schedule */}
        <section className="print-page bg-white text-slate-900 border border-slate-200 rounded-xl p-8 space-y-5 shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <h3 className="text-lg font-bold text-slate-900">
              05. Minute-by-Minute Shoot Day Schedule
            </h3>
            <span className="text-xs font-mono text-slate-500">
              Shoot Date: {project.shootDate || 'TBD'}
            </span>
          </div>

          {project.schedule.length === 0 ? (
            <div className="text-xs text-slate-500 py-8 text-center">
              Run Auto-Schedule in Step 5 to populate the Shoot Day Call Sheet.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-700">
                  <th className="py-2 px-2.5 w-36">Time</th>
                  <th className="py-2 px-2.5 w-28">Type</th>
                  <th className="py-2 px-2.5">Block & Shots</th>
                  <th className="py-2 px-2.5">Location</th>
                  <th className="py-2 px-2.5">Lighting Setup</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {project.schedule.map((block) => (
                  <tr key={block.id}>
                    <td className="py-2.5 px-2.5 font-mono font-semibold text-slate-900 tabular-nums">
                      {block.startTime} – {block.endTime}
                    </td>
                    <td className="py-2.5 px-2.5 font-medium text-slate-700">
                      {block.blockType}
                    </td>
                    <td className="py-2.5 px-2.5">
                      <div className="font-semibold text-slate-900">{block.title}</div>
                      {block.shotNumbers.length > 0 && (
                        <div className="font-mono text-amber-700">
                          Shots: {block.shotNumbers.join(', ')}
                        </div>
                      )}
                      {block.notes && <div className="text-slate-500">{block.notes}</div>}
                    </td>
                    <td className="py-2.5 px-2.5 text-slate-700">{block.location}</td>
                    <td className="py-2.5 px-2.5 text-slate-600">{block.lightingSetup}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
};
