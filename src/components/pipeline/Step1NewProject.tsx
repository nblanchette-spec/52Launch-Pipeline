import React, { useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  Upload,
  Loader2,
  ArrowRight,
  Image as ImageIcon,
} from 'lucide-react';
import { PipelineProject, ProductPhoto } from '../../types/pipeline';
import { readAndOptimizeLocalImage } from '../../utils/imageUtils';

interface Step1NewProjectProps {
  existingProject: PipelineProject | null;
  isNewMode: boolean;
  onCreateProject: (payload: {
    client: string;
    product: {
      name: string;
      description: string;
      provableClaims: string[];
    };
    intake: {
      audience: string;
      tone: string;
      clientMarketingIdeas: string;
      videosWanted: string;
      shootLocationDatesBudgetNotes: string;
    };
    initialPhotoDataUrls: Array<{ dataUrl: string; caption: string }>;
  }) => Promise<void>;
  onUpdateProject: (updated: PipelineProject) => Promise<void>;
  onProceedToBible: () => void;
}

export const Step1NewProject: React.FC<Step1NewProjectProps> = ({
  existingProject,
  isNewMode,
  onCreateProject,
  onUpdateProject,
  onProceedToBible,
}) => {
  const [client, setClient] = useState(isNewMode ? '' : existingProject?.client || '');
  const [productName, setProductName] = useState(
    isNewMode ? '' : existingProject?.product.name || ''
  );
  const [productDescription, setProductDescription] = useState(
    isNewMode ? '' : existingProject?.product.description || ''
  );
  const [claims, setClaims] = useState<string[]>(
    isNewMode ? [''] : existingProject?.product.provableClaims.length
      ? existingProject.product.provableClaims
      : ['']
  );

  // For new projects, hold staged photos before creation; for existing projects, upload directly
  const [stagedPhotos, setStagedPhotos] = useState<
    Array<{ id: string; dataUrl: string; caption: string }>
  >([]);
  const [existingPhotos, setExistingPhotos] = useState<ProductPhoto[]>(
    isNewMode ? [] : existingProject?.product.photos || []
  );

  const [audience, setAudience] = useState(
    isNewMode ? '' : existingProject?.intake.audience || ''
  );
  const [tone, setTone] = useState(isNewMode ? '' : existingProject?.intake.tone || '');
  const [clientMarketingIdeas, setClientMarketingIdeas] = useState(
    isNewMode ? '' : existingProject?.intake.clientMarketingIdeas || ''
  );
  const [videosWanted, setVideosWanted] = useState(
    isNewMode ? '' : existingProject?.intake.videosWanted || ''
  );
  const [shootNotes, setShootNotes] = useState(
    isNewMode ? '' : existingProject?.intake.shootLocationDatesBudgetNotes || ''
  );

  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setErrorMsg(null);
    setIsUploadingPhoto(true);

    try {
      for (let i = 0; i < files.length; i++) {
        const dataUrl = await readAndOptimizeLocalImage(files[i], 1400);
        if (isNewMode || !existingProject) {
          setStagedPhotos((prev) => [
            ...prev,
            {
              id: `staged-${Date.now()}-${i}`,
              dataUrl,
              caption: '',
            },
          ]);
        } else {
          const resp = await fetch(`/api/projects/${existingProject.id}/assets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataUrl, prefix: 'product' }),
          });
          const data = await resp.json();
          if (!resp.ok) throw new Error(data.error || 'Could not upload photo.');
          const nextPhoto: ProductPhoto = {
            id: `photo-${Date.now()}-${i}`,
            url: data.url,
            caption: '',
          };
          const nextPhotos = [...existingPhotos, nextPhoto];
          setExistingPhotos(nextPhotos);
          await onUpdateProject({
            ...existingProject,
            product: {
              ...existingProject.product,
              photos: nextPhotos,
            },
          });
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not add product photo.');
    } finally {
      setIsUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!client.trim() || !productName.trim()) {
      setErrorMsg('Please enter both a client name and a product name.');
      return;
    }

    const cleanedClaims = claims.map((c) => c.trim()).filter(Boolean);
    setIsSaving(true);
    try {
      if (isNewMode || !existingProject) {
        await onCreateProject({
          client: client.trim(),
          product: {
            name: productName.trim(),
            description: productDescription.trim(),
            provableClaims: cleanedClaims,
          },
          intake: {
            audience: audience.trim(),
            tone: tone.trim(),
            clientMarketingIdeas: clientMarketingIdeas.trim(),
            videosWanted: videosWanted.trim(),
            shootLocationDatesBudgetNotes: shootNotes.trim(),
          },
          initialPhotoDataUrls: stagedPhotos.map((p) => ({
            dataUrl: p.dataUrl,
            caption: p.caption,
          })),
        });
      } else {
        await onUpdateProject({
          ...existingProject,
          client: client.trim(),
          product: {
            name: productName.trim(),
            description: productDescription.trim(),
            provableClaims: cleanedClaims,
            photos: existingPhotos,
          },
          intake: {
            audience: audience.trim(),
            tone: tone.trim(),
            clientMarketingIdeas: clientMarketingIdeas.trim(),
            videosWanted: videosWanted.trim(),
            shootLocationDatesBudgetNotes: shootNotes.trim(),
          },
          approvals: {
            ...existingProject.approvals,
            intakeCompleted: true,
          },
        });
        onProceedToBible();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save project.');
    } finally {
      setIsSaving(false);
    }
  };

  const displayedPhotos = isNewMode ? stagedPhotos : existingPhotos;

  return (
    <div className="max-w-[1120px] mx-auto px-6 py-7 space-y-6">
      <div className="border-b border-[#262B36] pb-5">
        <div className="text-xs font-medium text-amber-400">
          Step 1 · Project & Client Intake
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100 mt-1">
          {isNewMode
            ? 'Start a New Client Product Project'
            : `${existingProject?.client} — ${existingProject?.product.name}`}
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Enter plain-English details about the invention, upload real product photos, and list
          only claims we can genuinely prove.
        </p>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/40 text-xs text-rose-300">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Client & Product Core */}
        <section className="bg-[#14171D] border border-[#262B36] rounded-xl p-6 space-y-5">
          <h2 className="text-base font-semibold text-zinc-100">Client & Product</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Client name
              </label>
              <input
                type="text"
                required
                value={client}
                onChange={(e) => setClient(e.target.value)}
                placeholder="e.g., Kinetix Bio Inc."
                className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Product name
              </label>
              <input
                type="text"
                required
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="e.g., Kinetix Core Patch"
                className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Product description
            </label>
            <textarea
              rows={3}
              value={productDescription}
              onChange={(e) => setProductDescription(e.target.value)}
              placeholder="Explain what the product is, how it physically works, and what makes it genuinely different..."
              className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Provable Claims */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-300">
                Claims we can back up (used as strict truth guardrails across scripts)
              </label>
              <button
                type="button"
                onClick={() => setClaims((prev) => [...prev, ''])}
                className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 hover:text-amber-300 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add claim
              </button>
            </div>

            <div className="space-y-2">
              {claims.map((claim, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={claim}
                    onChange={(e) =>
                      setClaims((prev) =>
                        prev.map((item, i) => (i === idx ? e.target.value : item))
                      )
                    }
                    placeholder="e.g., Tested to measure sweat sodium continuously in real time"
                    className="flex-1 bg-[#0B0D10] border border-[#262B36] rounded-lg px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                  />
                  {claims.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setClaims((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="p-2 text-zinc-500 hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Real Product Photos */}
          <div className="space-y-3 pt-2 border-t border-[#262B36]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-zinc-300">
                  Real product photos
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  Upload photos of the actual hardware or packaging. Gemini uses these for the
                  Brand Bible and Frame Check.
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handlePhotoSelect}
              />
              <button
                type="button"
                disabled={isUploadingPhoto}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-100 bg-[#0B0D10] border border-[#262B36] hover:border-amber-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isUploadingPhoto ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                Upload product photo
              </button>
            </div>

            {displayedPhotos.length === 0 ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-[#0B0D10] border border-dashed border-[#262B36] hover:border-amber-500/60 rounded-xl p-6 flex flex-col items-center justify-center gap-2 text-zinc-500 transition-colors cursor-pointer"
              >
                <ImageIcon className="w-6 h-6" />
                <span className="text-xs">Click to upload one or more real product photos</span>
              </button>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {displayedPhotos.map((photo, idx) => {
                  const src = 'dataUrl' in photo ? photo.dataUrl : photo.url;
                  return (
                    <div
                      key={photo.id}
                      className="bg-[#0B0D10] border border-[#262B36] rounded-lg overflow-hidden"
                    >
                      <div className="aspect-square bg-zinc-950 flex items-center justify-center overflow-hidden">
                        <img
                          src={src}
                          alt={photo.caption || `Product photo ${idx + 1}`}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="p-2.5 flex items-center gap-2 border-t border-[#262B36]">
                        <input
                          type="text"
                          placeholder="Angle or detail note..."
                          value={photo.caption}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (isNewMode) {
                              setStagedPhotos((prev) =>
                                prev.map((p) =>
                                  p.id === photo.id ? { ...p, caption: val } : p
                                )
                              );
                            } else {
                              setExistingPhotos((prev) =>
                                prev.map((p) =>
                                  p.id === photo.id ? { ...p, caption: val } : p
                                )
                              );
                            }
                          }}
                          className="flex-1 min-w-0 bg-transparent text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (isNewMode) {
                              setStagedPhotos((prev) =>
                                prev.filter((p) => p.id !== photo.id)
                              );
                            } else {
                              setExistingPhotos((prev) =>
                                prev.filter((p) => p.id !== photo.id)
                              );
                            }
                          }}
                          className="p-1 text-zinc-500 hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Creative & Production Intake */}
        <section className="bg-[#14171D] border border-[#262B36] rounded-xl p-6 space-y-4">
          <h2 className="text-base font-semibold text-zinc-100">
            Intake Notes & Production Scope
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Target audience
              </label>
              <textarea
                rows={3}
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="Who is buying or backing this product?"
                className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Tone & visual feel
              </label>
              <textarea
                rows={3}
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                placeholder="e.g., Grounded documentary realism, warm tactile craft, bold athletic energy..."
                className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Client’s marketing ideas
            </label>
            <textarea
              rows={3}
              value={clientMarketingIdeas}
              onChange={(e) => setClientMarketingIdeas(e.target.value)}
              placeholder="Any scenes, hooks, or campaign angles the founder already pitched..."
              className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Videos wanted
              </label>
              <input
                type="text"
                value={videosWanted}
                onChange={(e) => setVideosWanted(e.target.value)}
                placeholder="e.g., 1x 30s Hero Film (16:9), 2x 15s Social Cutdowns (9:16)"
                className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Shoot location, dates & budget notes
              </label>
              <input
                type="text"
                value={shootNotes}
                onChange={(e) => setShootNotes(e.target.value)}
                placeholder="e.g., Los Angeles track in early Dec, 1-day lean crew"
                className="w-full bg-[#0B0D10] border border-[#262B36] rounded-lg px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving project...
              </>
            ) : (
              <>
                {isNewMode
                  ? 'Create project & open Brand Bible'
                  : 'Save intake & open Brand Bible'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
