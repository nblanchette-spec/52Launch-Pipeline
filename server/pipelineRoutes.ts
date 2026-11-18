import { Router } from 'express';
import path from 'path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { fal } from '@fal-ai/client';
import {
  deleteProject,
  exportProjectBackupBundle,
  getProject,
  getProjectAssetsDir,
  importProjectBackupBundle,
  listProjects,
  readAssetAsInlineData,
  saveBinaryAssetFromUrl,
  saveBufferAsset,
  saveDataUrlAsset,
  saveProject,
} from './projectStore';
import {
  BrandGuideDocument,
  ExternalUpscaleItem,
  ExtractedStyleGuide,
  FrameCheckResult,
  PipelineProject,
  PipelineShot,
  ShootPlan,
  ShotClipHistoryItem,
  UpscaleDetails,
  VideoModelOption,
  VoScriptLine,
  VoStudioSettings,
} from '../src/types/pipeline';
import { extractImagesFromPdfBuffer } from './pdfAssetExtractor';
import {
  buildFalVideoRequest,
  buildTopazUpscaleRequest,
  describeFalFailure,
  uploadMediaRefToFal,
} from './falHelpers';
import {
  GeminiTtsModel,
  synthesizeWithGeminiTTS,
  VALID_GEMINI_VOICES,
} from './voxcraftTts';
import {
  downloadAndExtractDriveFiles,
  downloadDriveBinaryAsset,
  DriveAuthError,
  DriveFileDescriptor,
  syncProjectAssetsToDrive,
} from './driveHelpers';
import {
  FLUX3_ENDPOINTS,
  StudioAspectRatio,
  StudioModelId,
  StudioQualityTier,
  StudioReferenceTask,
  StudioResolution,
  StudioTimelineKeyframe,
  StudioWorkflowMode,
  TopazUpscaleMode,
} from '../src/utils/videoStudioCatalog';

const GEMINI_MODEL = 'gemini-3.8-flash';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatGeminiError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : '';
  if (!raw) return fallback;

  // Unwrap SDK JSON error payloads so the UI never displays raw JSON
  let message = raw;
  let code: number | undefined;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error?.message) {
      message = String(parsed.error.message);
      code = typeof parsed.error.code === 'number' ? parsed.error.code : undefined;
    }
  } catch {
    // Not raw JSON; keep raw message
  }

  const lower = message.toLowerCase();
  if (code === 403 || lower.includes('permission_denied') || lower.includes('api_key_invalid')) {
    return 'Gemini could not authenticate. Check your GEMINI_API_KEY in Settings > Secrets.';
  }
  if (code === 429 || lower.includes('resource_exhausted') || lower.includes('quota')) {
    return 'Gemini is temporarily busy or out of quota. Wait a moment and try again.';
  }
  if (code === 404 || lower.includes('not_found')) {
    return 'The AI model could not be reached right now. Please try again in a moment.';
  }
  return message || fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientGeminiError(err: unknown): boolean {
  const status = (err as { status?: number; code?: number })?.status ?? (err as { code?: number })?.code;
  const raw = err instanceof Error ? err.message.toLowerCase() : String(err || '').toLowerCase();
  return (
    status === 429 ||
    status === 503 ||
    raw.includes('429') ||
    raw.includes('503') ||
    raw.includes('resource_exhausted') ||
    raw.includes('quota') ||
    raw.includes('unavailable') ||
    raw.includes('overloaded') ||
    raw.includes('rate limit')
  );
}

async function withGeminiRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (isTransientGeminiError(err) && attempt < 2) {
        const delayMs = 1500 * Math.pow(2, attempt) + Math.floor(Math.random() * 500);
        await sleep(delayMs);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function falSubscribeWithNegativeFallback(
  endpointId: string,
  input: Record<string, unknown>,
  negativePrompt?: string
) {
  try {
    return await fal.subscribe(endpointId, { input, logs: false });
  } catch (err: unknown) {
    if ('negative_prompt' in input && negativePrompt?.trim()) {
      const errObj = err as { status?: number; body?: { detail?: unknown }; message?: string };
      const detailText = JSON.stringify(errObj?.body?.detail || errObj?.message || '').toLowerCase();
      if (
        errObj?.status === 422 ||
        detailText.includes('negative_prompt') ||
        detailText.includes('extra_forbidden')
      ) {
        const fallbackInput = { ...input };
        delete fallbackInput.negative_prompt;
        const basePrompt = String(fallbackInput.prompt || '').trim();
        if (basePrompt) {
          fallbackInput.prompt = `${basePrompt}\nAvoid: ${negativePrompt.trim()}`;
        }
        return await fal.subscribe(endpointId, { input: fallbackInput, logs: false });
      }
    }
    throw err;
  }
}

function appendShotClipHistory(
  shot: PipelineShot,
  newItem: ShotClipHistoryItem
): ShotClipHistoryItem[] {
  const existing = Array.isArray(shot.videoHistory) ? [...shot.videoHistory] : [];
  if (existing.length === 0 && shot.videoUrl) {
    existing.push({
      id: `clip-legacy-${shot.id}`,
      videoUrl: shot.videoUrl,
      createdAt: new Date().toISOString(),
      modelId:
        shot.model === 'flux3'
          ? 'flux-3'
          : shot.model === 'kling'
            ? 'kling-4.0'
            : shot.model === 'wan'
              ? 'wan-3.0-prime'
              : shot.model === 'luma'
                ? 'luma-ray-3.2'
                : shot.model === 'veo'
                  ? 'veo-3.1'
                  : shot.model === 'omni'
                    ? 'gemini-omni-flash'
                    : 'seedance-2.0',
      workflowMode: shot.frameImageUrl ? 'image_to_video' : 'text_to_video',
      prompt: shot.videoPrompt || shot.scene || '',
      negativePrompt: shot.negativePrompt || '',
      aspectRatio: '16:9',
      duration: Number(shot.durationSec) || 5,
      qualityTier: 'draft',
      resolution: shot.videoResolution || '480p',
      nativeAudio: true,
      seed: shot.videoSeed,
      startFrameUrl: shot.frameImageUrl,
      draftCacheUrl: shot.draftCacheUrl || null,
      upscaledVideoUrl: shot.upscaledVideoUrl || null,
      upscaledResolution: shot.upscaledResolution || null,
    });
  }
  return [newItem, ...existing].slice(0, 24);
}

export function createPipelineRouter(): Router {
  const router = Router();

  // List all saved projects
  router.get('/projects', async (_req, res) => {
    try {
      const summaries = await listProjects();
      res.json({ projects: summaries });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Could not list projects.',
      });
    }
  });

  // Get single full project
  router.get('/projects/:id', async (req, res) => {
    try {
      const project = await getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: 'Project not found.' });
      }
      res.json({ project });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Could not load project.',
      });
    }
  });

  // Create new project from New Project Form
  router.post('/projects', async (req, res) => {
    try {
      const {
        client,
        product,
        intake,
        initialPhotoDataUrls,
        googleDriveFolderUrl,
        extractedStyleGuide,
        stagedGuidePdfs,
        initialLogoDataUrl,
      } = req.body;
      if (!client || !product?.name) {
        return res
          .status(400)
          .json({ error: 'Client name and product name are required.' });
      }

      const slug = `${product.name}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 32);
      const id = `${slug || 'project'}-${Date.now().toString(36)}`;
      const now = new Date().toISOString();

      const photos: Array<{ id: string; url: string; caption: string }> = [];
      if (Array.isArray(initialPhotoDataUrls)) {
        for (let i = 0; i < initialPhotoDataUrls.length; i++) {
          const item = initialPhotoDataUrls[i];
          if (item?.dataUrl) {
            const saved = await saveDataUrlAsset(id, item.dataUrl, 'product');
            photos.push({
              id: `photo-${Date.now()}-${i}`,
              url: saved.url,
              caption: item.caption || `${product.name} reference photo ${i + 1}`,
            });
          }
        }
      }

      const brandGuideDocuments: BrandGuideDocument[] = [];
      if (Array.isArray(stagedGuidePdfs)) {
        for (let i = 0; i < stagedGuidePdfs.length; i++) {
          const pdfItem = stagedGuidePdfs[i];
          if (pdfItem?.dataUrl && pdfItem.dataUrl.startsWith('data:application/pdf')) {
            const savedPdf = await saveDataUrlAsset(id, pdfItem.dataUrl, 'guide');
            brandGuideDocuments.push({
              id: `guide-${Date.now()}-${i}`,
              name: pdfItem.name || `Brand Guide ${i + 1}.pdf`,
              url: savedPdf.url,
              mimeType: 'application/pdf',
              extractedAt: now,
              graphicCount: typeof pdfItem.graphicCount === 'number' ? pdfItem.graphicCount : undefined,
            });
          }
        }
      }

      let savedLogoUrl: string | null = null;
      if (typeof initialLogoDataUrl === 'string' && initialLogoDataUrl.startsWith('data:image/')) {
        const savedLogo = await saveDataUrlAsset(id, initialLogoDataUrl, 'logo');
        savedLogoUrl = savedLogo.url;
      }

      const normalizedGuide: ExtractedStyleGuide | null =
        extractedStyleGuide && typeof extractedStyleGuide === 'object'
          ? {
              summary: String(extractedStyleGuide.summary || '').trim(),
              palette: String(extractedStyleGuide.palette || '').trim(),
              paletteHexes: Array.isArray(extractedStyleGuide.paletteHexes)
                ? extractedStyleGuide.paletteHexes.map((h: string) => String(h).trim()).filter(Boolean)
                : [],
              typography: String(extractedStyleGuide.typography || '').trim(),
              lighting: String(extractedStyleGuide.lighting || '').trim(),
              lensAndFraming: String(extractedStyleGuide.lensAndFraming || '').trim(),
              grade: String(extractedStyleGuide.grade || '').trim(),
              visualStyleNotes: String(extractedStyleGuide.visualStyleNotes || '').trim(),
              productVisualRules: String(extractedStyleGuide.productVisualRules || '').trim(),
              brandLogoNotes: String(extractedStyleGuide.brandLogoNotes || '').trim(),
              bannedElements: Array.isArray(extractedStyleGuide.bannedElements)
                ? extractedStyleGuide.bannedElements.map((b: string) => String(b).trim()).filter(Boolean)
                : [],
              sourceFileNames: Array.isArray(extractedStyleGuide.sourceFileNames)
                ? extractedStyleGuide.sourceFileNames.map((n: string) => String(n).trim()).filter(Boolean)
                : [],
            }
          : null;

      const paletteFromGuide = normalizedGuide
        ? [
            normalizedGuide.palette,
            normalizedGuide.paletteHexes.length > 0
              ? `Hexes: ${normalizedGuide.paletteHexes.join(', ')}`
              : '',
          ]
            .filter(Boolean)
            .join(' — ')
        : '';

      const project: PipelineProject = {
        id,
        createdAt: now,
        updatedAt: now,
        client: String(client).trim(),
        product: {
          name: String(product.name).trim(),
          description: String(product.description || '').trim(),
          provableClaims: Array.isArray(product.provableClaims)
            ? product.provableClaims.map((c: string) => String(c).trim()).filter(Boolean)
            : [],
          photos,
        },
        intake: {
          audience: String(intake?.audience || '').trim(),
          tone: String(intake?.tone || '').trim(),
          clientMarketingIdeas: String(intake?.clientMarketingIdeas || '').trim(),
          videosWanted: String(intake?.videosWanted || '').trim(),
          shootLocationDatesBudgetNotes: String(
            intake?.shootLocationDatesBudgetNotes || ''
          ).trim(),
        },
        brandGuideDocuments,
        extractedStyleGuide: normalizedGuide,
        brandBible: {
          positioning: '',
          audience: '',
          toneOfVoice: { adjectives: [], guidance: '' },
          visualStyle: {
            palette: paletteFromGuide,
            typography: normalizedGuide?.typography || '',
            lighting: normalizedGuide?.lighting || '',
            lensAndFraming: normalizedGuide?.lensAndFraming || '',
            grade: normalizedGuide?.grade || '',
          },
          brandLogoUrl: savedLogoUrl,
          brandLogoCaption: normalizedGuide?.brandLogoNotes || '',
          characters: [],
          productRules: normalizedGuide?.productVisualRules || '',
          bannedList: normalizedGuide?.bannedElements || [],
          claimsAllowed: [],
          claimsToFlag: [],
          hasGenerated: false,
          manuallyEdited: false,
        },
        creativeBrief: {
          objective: '',
          keyMessage: '',
          concepts: [],
          recommendedConcept: { title: '', reason: '' },
          deliverables: [],
          voDirection: { pace: '', emotionalArc: '', speaker: '' },
          claimsCheck: '',
          hasGenerated: false,
          manuallyEdited: false,
        },
        shots: [],
        shotListHasGenerated: false,
        shotListManuallyEdited: false,
        voScript: [],
        shootPlan: {
          shootDays: [],
          equipment: [],
          propsAndUnits: [],
          crew: [],
          risks: [],
          clientQuestions: [],
          hasGenerated: false,
        },
        approvals: {
          intakeCompleted: true,
          bibleApproved: false,
          briefApproved: false,
          shotListApproved: false,
          storyboardApproved: false,
          videoPromptsApproved: false,
          voApproved: false,
          shootPlanApproved: false,
        },
        generationLog: [],
        googleDriveFolderUrl: googleDriveFolderUrl ? String(googleDriveFolderUrl).trim() : undefined,
        googleDriveFolderUrls: Array.isArray(req.body.googleDriveFolderUrls)
          ? req.body.googleDriveFolderUrls.map((u: string) => String(u).trim()).filter(Boolean)
          : googleDriveFolderUrl
            ? [String(googleDriveFolderUrl).trim()]
            : [],
        googleDriveDestinationFolderId: req.body.googleDriveDestinationFolderId
          ? String(req.body.googleDriveDestinationFolderId).trim()
          : undefined,
        googleDriveDestinationFolderUrl: req.body.googleDriveDestinationFolderUrl
          ? String(req.body.googleDriveDestinationFolderUrl).trim()
          : undefined,
        googleDriveDestinationFolderName: req.body.googleDriveDestinationFolderName
          ? String(req.body.googleDriveDestinationFolderName).trim()
          : undefined,
        lockedDriveReferences: Array.isArray(req.body.lockedDriveReferences)
          ? req.body.lockedDriveReferences
          : [],
      };

      const savedProject = await saveProject(project);
      res.json({ project: savedProject });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Could not create project.',
      });
    }
  });

  // Update full project state
  router.put('/projects/:id', async (req, res) => {
    try {
      const existing = await getProject(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: 'Project not found.' });
      }
      const incoming = req.body.project as PipelineProject;
      if (!incoming) {
        return res.status(400).json({ error: 'Missing project payload.' });
      }
      const saved = await saveProject({ ...incoming, id: req.params.id });
      res.json({ project: saved });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Could not save project.',
      });
    }
  });

  // Delete project
  router.delete('/projects/:id', async (req, res) => {
    try {
      await deleteProject(req.params.id);
      res.json({ deleted: true });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Could not delete project.',
      });
    }
  });

  // Upload asset image (product photo or storyboard frame)
  router.post('/projects/:id/assets', async (req, res) => {
    try {
      const { dataUrl, prefix } = req.body;
      if (!dataUrl) {
        return res.status(400).json({ error: 'Missing image data.' });
      }
      const saved = await saveDataUrlAsset(
        req.params.id,
        dataUrl,
        prefix === 'frame' ? 'frame' : prefix === 'logo' ? 'logo' : 'product'
      );
      res.json(saved);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Could not upload image.',
      });
    }
  });

  // Serve project asset image
  router.get('/projects/:id/assets/:filename', (req, res) => {
    const safeFilename = path.basename(req.params.filename);
    const fullPath = path.join(getProjectAssetsDir(req.params.id), safeFilename);
    res.sendFile(fullPath, (err) => {
      if (err && !res.headersSent) {
        res.status(404).json({ error: 'Asset not found.' });
      }
    });
  });

  // Download portable project backup
  router.get('/projects/:id/backup', async (req, res) => {
    try {
      const bundle = await exportProjectBackupBundle(req.params.id);
      const safeSlug = bundle.project.id || 'project';
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeSlug}.52launch-backup"`
      );
      res.send(JSON.stringify(bundle, null, 2));
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Could not export backup.',
      });
    }
  });

  // Import project backup
  router.post('/projects/import-backup', async (req, res) => {
    try {
      const imported = await importProjectBackupBundle(req.body);
      res.json({ project: imported });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Could not import project backup.',
      });
    }
  });

  // STEP 2: Generate Brand Bible (Gemini 2.5 Pro with product photos)
  router.post('/pipeline/brand-bible', async (req, res) => {
    try {
      const { projectId } = req.body;
      const project = await getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      const ai = getGeminiClient();
      const parts: Array<{ inlineData?: { data: string; mimeType: string }; text?: string }> =
        [];

      for (const photo of project.product.photos) {
        const inline = await readAssetAsInlineData(project.id, photo.url);
        if (inline) {
          parts.push({ inlineData: inline });
        }
      }

      if (project.brandBible?.brandLogoUrl) {
        const logoInline = await readAssetAsInlineData(project.id, project.brandBible.brandLogoUrl);
        if (logoInline) {
          parts.push({ text: '--- Attached Brand Logo Reference ---' });
          parts.push({ inlineData: logoInline });
        }
      }

      if (Array.isArray(project.brandGuideDocuments)) {
        for (const doc of project.brandGuideDocuments.slice(0, 4)) {
          const docInline = await readAssetAsInlineData(project.id, doc.url);
          if (docInline) {
            parts.push({ text: `--- Attached Client Brand / Style Guide PDF: ${doc.name} ---` });
            parts.push({ inlineData: docInline });
          }
        }
      }

      const guideBlock = project.extractedStyleGuide
        ? `\nEXTRACTED STYLE GUIDE DATA (preserve exact hex codes, fonts, and rules):
- Summary: ${project.extractedStyleGuide.summary || 'N/A'}
- Palette: ${project.extractedStyleGuide.palette || 'N/A'}
- Hex Swatches: ${project.extractedStyleGuide.paletteHexes.join(', ') || 'None extracted'}
- Typography: ${project.extractedStyleGuide.typography || 'N/A'}
- Lighting: ${project.extractedStyleGuide.lighting || 'N/A'}
- Lens & Framing: ${project.extractedStyleGuide.lensAndFraming || 'N/A'}
- Grade: ${project.extractedStyleGuide.grade || 'N/A'}
- Product Visual Rules: ${project.extractedStyleGuide.productVisualRules || 'N/A'}
- Brand Logo Usage Notes: ${project.extractedStyleGuide.brandLogoNotes || 'N/A'}
- Banned Elements: ${project.extractedStyleGuide.bannedElements.join(', ') || 'None'}\n`
        : '';

      const prompt = `You are the brand strategist for 52Launch.
From the client intake, attached brand/style guide PDFs, and real product photos produce a complete Brand Bible:
- positioning: one sharp sentence
- audience: clear description of who this is for
- toneOfVoice: 3-5 adjectives plus clear guidance
- visualStyle: palette (MUST include all brand color #HEX codes if present in guide PDFs or extracted data), typography (primary/display/body fonts and type treatment), lighting, lensAndFraming, grade
- characters: array of key on-screen people (name plus a FIXED short visual descriptor that will be pasted word for word into every prompt)
- productRules: how the product must look, based ONLY on the intake, style guides, and photos, never invented features
- bannedList: specific visual tropes, clichés, or forbidden elements (include any off-brand rules from the style guide)
- claimsAllowed: ONLY claims listed below as provable
- claimsToFlag: any client idea that implies an unproven claim (empty array if none)

If anything is missing from the intake or photos, write "NEEDS INPUT: what is missing" for that field.

CLIENT & PRODUCT INTAKE:
- Client: ${project.client}
- Product Name: ${project.product.name}
- Product Description: ${project.product.description || 'NEEDS INPUT'}
- Provable Claims Listed by Client: ${
        project.product.provableClaims.length > 0
          ? project.product.provableClaims.map((c) => `* ${c}`).join('\n')
          : 'None listed'
      }
- Target Audience: ${project.intake.audience || 'Not specified'}
- Desired Tone: ${project.intake.tone || 'Not specified'}
- Client Marketing Ideas: ${project.intake.clientMarketingIdeas || 'Not specified'}
- Videos Wanted: ${project.intake.videosWanted || 'Not specified'}
- Shoot Location / Dates / Budget Notes: ${
        project.intake.shootLocationDatesBudgetNotes || 'Not specified'
      }
- Attached Product Photos Count: ${project.product.photos.length}
- Attached Style Guide PDFs Count: ${project.brandGuideDocuments?.length || 0}${guideBlock}`;

      parts.push({ text: prompt });

      const response = await withGeminiRetry(() =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: { parts },
          config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              positioning: { type: Type.STRING },
              audience: { type: Type.STRING },
              toneOfVoice: {
                type: Type.OBJECT,
                properties: {
                  adjectives: { type: Type.ARRAY, items: { type: Type.STRING } },
                  guidance: { type: Type.STRING },
                },
                required: ['adjectives', 'guidance'],
              },
              visualStyle: {
                type: Type.OBJECT,
                properties: {
                  palette: { type: Type.STRING },
                  typography: { type: Type.STRING },
                  lighting: { type: Type.STRING },
                  lensAndFraming: { type: Type.STRING },
                  grade: { type: Type.STRING },
                },
                required: ['palette', 'typography', 'lighting', 'lensAndFraming', 'grade'],
              },
              characters: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    fixedDescriptor: { type: Type.STRING },
                  },
                  required: ['name', 'fixedDescriptor'],
                },
              },
              productRules: { type: Type.STRING },
              bannedList: { type: Type.ARRAY, items: { type: Type.STRING } },
              claimsAllowed: { type: Type.ARRAY, items: { type: Type.STRING } },
              claimsToFlag: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: [
              'positioning',
              'audience',
              'toneOfVoice',
              'visualStyle',
              'characters',
              'productRules',
              'bannedList',
              'claimsAllowed',
              'claimsToFlag',
            ],
          },
        },
        })
      );

      const parsed = JSON.parse((response.text ?? '{}').trim());
      const updatedBible = {
        positioning: parsed.positioning || '',
        audience: parsed.audience || '',
        toneOfVoice: {
          adjectives: Array.isArray(parsed.toneOfVoice?.adjectives)
            ? parsed.toneOfVoice.adjectives
            : [],
          guidance: parsed.toneOfVoice?.guidance || '',
        },
        visualStyle: {
          palette: parsed.visualStyle?.palette || '',
          typography: parsed.visualStyle?.typography || '',
          lighting: parsed.visualStyle?.lighting || '',
          lensAndFraming: parsed.visualStyle?.lensAndFraming || '',
          grade: parsed.visualStyle?.grade || '',
        },
        brandLogoUrl: project.brandBible?.brandLogoUrl ?? null,
        brandLogoCaption: project.brandBible?.brandLogoCaption ?? '',
        characters: Array.isArray(parsed.characters)
          ? parsed.characters.map(
              (c: { name: string; fixedDescriptor: string }, idx: number) => ({
                id: `char-${Date.now()}-${idx}`,
                name: c.name,
                fixedDescriptor: c.fixedDescriptor,
              })
            )
          : [],
        productRules: parsed.productRules || '',
        bannedList: Array.isArray(parsed.bannedList) ? parsed.bannedList : [],
        claimsAllowed: Array.isArray(parsed.claimsAllowed) ? parsed.claimsAllowed : [],
        claimsToFlag: Array.isArray(parsed.claimsToFlag) ? parsed.claimsToFlag : [],
        hasGenerated: true,
        manuallyEdited: false,
      };

      const nextProject: PipelineProject = {
        ...project,
        brandBible: updatedBible,
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
        generationLog: [
          {
            id: `log-${Date.now()}`,
            timestamp: new Date().toISOString(),
            step: 'Brand Bible',
            model: GEMINI_MODEL,
            prompt: `Generated Brand Bible for ${project.product.name}`,
            seed: null,
            status: 'success',
          },
          ...project.generationLog,
        ],
      };

      const saved = await saveProject(nextProject);
      res.json({ project: saved });
    } catch (err) {
      res.status(500).json({
        error: formatGeminiError(
          err,
          'Could not generate Brand Bible. Check your connection and try again.'
        ),
      });
    }
  });

  // STEP 3: Generate Creative Brief (Gemini 2.5 Pro)
  router.post('/pipeline/creative-brief', async (req, res) => {
    try {
      const { projectId } = req.body;
      const project = await getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      const ai = getGeminiClient();

      const prompt = `You are the Creative Director at 52Launch.
Write a Creative Brief for "${project.product.name}" (Client: ${project.client}):
- objective (one sentence)
- keyMessage (one sentence)
- concepts: 2-3 concepts (title, logline, whyItWorks, risks) that build directly on the client's own marketing ideas
- recommendedConcept: { title, reason }
- deliverables: matching exactly what the client asked for
- voDirection: { pace, emotionalArc, speaker }
- claimsCheck: verify how the brief respects allowed claims

Be specific to this product. Generic marketing language is a failure. Use NO claim outside "claimsAllowed".

INTAKE:
- Client Marketing Ideas: ${project.intake.clientMarketingIdeas}
- Videos Wanted: ${project.intake.videosWanted}
- Product Description: ${project.product.description}

APPROVED BRAND BIBLE:
- Positioning: ${project.brandBible.positioning}
- Audience: ${project.brandBible.audience}
- Tone: ${project.brandBible.toneOfVoice.adjectives.join(', ')} — ${project.brandBible.toneOfVoice.guidance}
- Visual Style: ${JSON.stringify(project.brandBible.visualStyle)}
- Product Rules: ${project.brandBible.productRules}
- Claims Allowed (STRICT): ${project.brandBible.claimsAllowed.join(' | ') || 'None'}
- Claims Flagged: ${project.brandBible.claimsToFlag.join(' | ') || 'None'}
- Banned List: ${project.brandBible.bannedList.join(', ')}${
        project.extractedStyleGuide
          ? `\n\nSTYLE GUIDE NOTES:\n- Summary: ${project.extractedStyleGuide.summary}\n- Visual Style Notes: ${project.extractedStyleGuide.visualStyleNotes}`
          : ''
      }`;

      const response = await withGeminiRetry(() =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
          config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              objective: { type: Type.STRING },
              keyMessage: { type: Type.STRING },
              concepts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    logline: { type: Type.STRING },
                    whyItWorks: { type: Type.STRING },
                    risks: { type: Type.STRING },
                  },
                  required: ['title', 'logline', 'whyItWorks', 'risks'],
                },
              },
              recommendedConcept: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  reason: { type: Type.STRING },
                },
                required: ['title', 'reason'],
              },
              deliverables: { type: Type.ARRAY, items: { type: Type.STRING } },
              voDirection: {
                type: Type.OBJECT,
                properties: {
                  pace: { type: Type.STRING },
                  emotionalArc: { type: Type.STRING },
                  speaker: { type: Type.STRING },
                },
                required: ['pace', 'emotionalArc', 'speaker'],
              },
              claimsCheck: { type: Type.STRING },
            },
            required: [
              'objective',
              'keyMessage',
              'concepts',
              'recommendedConcept',
              'deliverables',
              'voDirection',
              'claimsCheck',
            ],
          },
        },
        })
      );

      const parsed = JSON.parse((response.text ?? '{}').trim());
      const nextBrief = {
        objective: parsed.objective || '',
        keyMessage: parsed.keyMessage || '',
        concepts: Array.isArray(parsed.concepts)
          ? parsed.concepts.map(
              (
                c: { title: string; logline: string; whyItWorks: string; risks: string },
                idx: number
              ) => ({
                id: `concept-${Date.now()}-${idx}`,
                title: c.title,
                logline: c.logline,
                whyItWorks: c.whyItWorks,
                risks: c.risks,
              })
            )
          : [],
        recommendedConcept: {
          title: parsed.recommendedConcept?.title || '',
          reason: parsed.recommendedConcept?.reason || '',
        },
        deliverables: Array.isArray(parsed.deliverables) ? parsed.deliverables : [],
        voDirection: {
          pace: parsed.voDirection?.pace || '',
          emotionalArc: parsed.voDirection?.emotionalArc || '',
          speaker: parsed.voDirection?.speaker || '',
        },
        claimsCheck: parsed.claimsCheck || '',
        hasGenerated: true,
        manuallyEdited: false,
      };

      const nextProject: PipelineProject = {
        ...project,
        creativeBrief: nextBrief,
        approvals: {
          ...project.approvals,
          briefApproved: false,
          shotListApproved: false,
          storyboardApproved: false,
          videoPromptsApproved: false,
          voApproved: false,
          shootPlanApproved: false,
        },
        generationLog: [
          {
            id: `log-${Date.now()}`,
            timestamp: new Date().toISOString(),
            step: 'Creative Brief',
            model: GEMINI_MODEL,
            prompt: `Generated Creative Brief for ${project.product.name}`,
            seed: null,
            status: 'success',
          },
          ...project.generationLog,
        ],
      };

      const saved = await saveProject(nextProject);
      res.json({ project: saved });
    } catch (err) {
      res.status(500).json({
        error: formatGeminiError(err, 'Could not generate Creative Brief.'),
      });
    }
  });

  // STEP 4: Generate Shot List (Gemini 2.5 Pro)
  router.post('/pipeline/shot-list', async (req, res) => {
    try {
      const { projectId } = req.body;
      const project = await getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      const ai = getGeminiClient();

      const prompt = `You are the Director & Line Producer at 52Launch.
Generate a complete, ordered Shot List covering the whole spot, mixing AI and live shots together.

Each shot must include:
- id: "S01", "S02", ...
- deliverable: which deliverable(s) this shot serves
- durationSec: number in seconds (AI clips max 20, prefer 3-8)
- scene: plain English, ONE action per shot
- route: strictly "ai_video", "live", or "hybrid"
- model: strictly "flux3", "seedance", "veo", "omni", or "none" ("none" for live shots)
- productInFrame: true or false
- framePrompt: a plain-English still image prompt, REQUIRED for EVERY shot including live ones (where it serves as a reference frame for the crew); repeat the brand bible character descriptors WORD FOR WORD whenever a character appears; describe composition, lighting and lens; wherever the real product appears write "[PRODUCT PLACEHOLDER: composite real product here]" instead of describing the product's look
- shootDirection: for "live" and "hybrid" shots, specify camera position and movement, lens, lighting, talent and product handling, props; leave empty string "" for "ai_video" shots
- voLine: spoken VO line or empty string ""
- continuityNotes: continuity notes across cuts
- chainFrom: shot ID this continues from (e.g. "S01"), or "none"

ROUTING & MODEL RULES:
- Product hero shots and close-ups of the real product's features and function default to "live" or "hybrid".
- Environments, mood, B-roll and lifestyle context default to "ai_video".
- Use "flux3", "veo" (Google Veo 3.1), or "omni" (Google Gemini Omni Flash) for shots that benefit from native audio, dialogue/foley realism, or multi-reference continuity; use "seedance" for tight motion-controlled shots.
- Never invent product behavior that is not in the brand bible. Use NO claim outside "claimsAllowed".

BRAND BIBLE CHARACTERS (repeat word for word in frame prompts):
${
  project.brandBible.characters.length > 0
    ? project.brandBible.characters
        .map((c) => `- ${c.name}: "${c.fixedDescriptor}"`)
        .join('\n')
    : '- None defined'
}

BRAND BIBLE VISUAL STYLE & RULES:
- Visual Style: ${JSON.stringify(project.brandBible.visualStyle)}
- Product Rules: ${project.brandBible.productRules}
- Claims Allowed: ${project.brandBible.claimsAllowed.join(' | ')}
- Banned List: ${project.brandBible.bannedList.join(', ')}${
        project.extractedStyleGuide
          ? `\n- Style Guide Hex Palette: ${project.extractedStyleGuide.paletteHexes.join(', ') || 'None'}\n- Style Guide Visual Notes: ${project.extractedStyleGuide.visualStyleNotes || project.extractedStyleGuide.summary}`
          : ''
      }

APPROVED CREATIVE BRIEF:
- Objective: ${project.creativeBrief.objective}
- Key Message: ${project.creativeBrief.keyMessage}
- Recommended Concept: ${project.creativeBrief.recommendedConcept.title} — ${project.creativeBrief.recommendedConcept.reason}
- Deliverables: ${project.creativeBrief.deliverables.join(', ')}
- VO Direction: ${JSON.stringify(project.creativeBrief.voDirection)}`;

      const response = await withGeminiRetry(() =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
          config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                deliverable: { type: Type.STRING },
                durationSec: { type: Type.NUMBER },
                scene: { type: Type.STRING },
                route: { type: Type.STRING },
                model: { type: Type.STRING },
                productInFrame: { type: Type.BOOLEAN },
                framePrompt: { type: Type.STRING },
                shootDirection: { type: Type.STRING },
                voLine: { type: Type.STRING },
                continuityNotes: { type: Type.STRING },
                chainFrom: { type: Type.STRING },
              },
              required: [
                'id',
                'deliverable',
                'durationSec',
                'scene',
                'route',
                'model',
                'productInFrame',
                'framePrompt',
                'shootDirection',
                'voLine',
                'continuityNotes',
                'chainFrom',
              ],
            },
          },
        },
        })
      );

      const parsed = JSON.parse((response.text ?? '[]').trim());
      const shots: PipelineShot[] = (Array.isArray(parsed) ? parsed : []).map(
        (s: Partial<PipelineShot>, idx: number) => {
          const route =
            s.route === 'live' || s.route === 'hybrid' || s.route === 'ai_video'
              ? s.route
              : 'ai_video';
          const model =
            route === 'live'
              ? 'none'
              : s.model === 'flux3' ||
                  s.model === 'seedance' ||
                  s.model === 'veo' ||
                  s.model === 'omni'
                ? s.model
                : 'seedance';
          return {
            id: s.id || `S${String(idx + 1).padStart(2, '0')}`,
            deliverable: s.deliverable || project.creativeBrief.deliverables[0] || 'Hero',
            durationSec: Number(s.durationSec) || 5,
            scene: s.scene || '',
            route,
            model,
            productInFrame: Boolean(s.productInFrame),
            framePrompt: s.framePrompt || '',
            shootDirection: route === 'ai_video' ? '' : s.shootDirection || '',
            voLine: s.voLine || '',
            continuityNotes: s.continuityNotes || '',
            chainFrom: s.chainFrom || 'none',
            frameImageUrl: null,
            frameCheck: null,
            productFrameApproved: false,
            videoPrompt: '',
            negativePrompt: '',
            videoUrl: null,
            videoSeed: null,
            status: 'Draft',
          };
        }
      );

      const nextProject: PipelineProject = {
        ...project,
        shots,
        shotListHasGenerated: true,
        shotListManuallyEdited: false,
        approvals: {
          ...project.approvals,
          shotListApproved: false,
          storyboardApproved: false,
          videoPromptsApproved: false,
          voApproved: false,
          shootPlanApproved: false,
        },
        generationLog: [
          {
            id: `log-${Date.now()}`,
            timestamp: new Date().toISOString(),
            step: 'Shot List',
            model: GEMINI_MODEL,
            prompt: `Generated ${shots.length} ordered AI/hybrid/live shots`,
            seed: null,
            status: 'success',
          },
          ...project.generationLog,
        ],
      };

      const saved = await saveProject(nextProject);
      res.json({ project: saved });
    } catch (err) {
      res.status(500).json({
        error: formatGeminiError(err, 'Could not generate Shot List.'),
      });
    }
  });

  // STEP 6: Gemini Vision Frame Check (0-5 scoring + Product Fidelity)
  router.post('/pipeline/frame-check', async (req, res) => {
    try {
      const { projectId, shotId } = req.body;
      const project = await getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      const shot = project.shots.find((s) => s.id === shotId);
      if (!shot) {
        return res.status(404).json({ error: `Shot ${shotId} not found.` });
      }
      if (!shot.frameImageUrl) {
        return res.status(400).json({
          error: `Upload a frame image for ${shot.id} before running Frame Check.`,
        });
      }

      const frameInline = await readAssetAsInlineData(project.id, shot.frameImageUrl);
      if (!frameInline) {
        return res.status(400).json({
          error: `Could not read the uploaded frame image for ${shot.id}.`,
        });
      }

      const parts: Array<{ inlineData?: { data: string; mimeType: string }; text?: string }> =
        [{ inlineData: frameInline }];

      let productPhotoCount = 0;
      if (shot.productInFrame) {
        for (const photo of project.product.photos) {
          const prodInline = await readAssetAsInlineData(project.id, photo.url);
          if (prodInline) {
            parts.push({ inlineData: prodInline });
            productPhotoCount++;
          }
        }
      }

      const ai = getGeminiClient();
      const prompt = `You are a strict QC reviewer for 52Launch.
The FIRST attached image is the uploaded storyboard frame for shot ${shot.id}.
${
  shot.productInFrame && productPhotoCount > 0
    ? `The remaining ${productPhotoCount} attached image(s) are the REAL product photos for "${project.product.name}".`
    : shot.productInFrame
      ? 'Note: The shot has the product in frame, though no real product photos were uploaded yet.'
      : 'The product does NOT appear in this shot.'
}

Score 0-5 (integers) for:
- characterMatch (0-5): how accurately characters match the Brand Bible character descriptors
- styleMatch (0-5): how well lighting, palette, lens, and grade match the Brand Bible Visual Style
- compositionMatch (0-5): how faithfully the frame depicts the Shot Description
- artifacts (0-5, where 5 = completely clean with zero AI glitches, warped hands, or weird text)
- productFidelity (0-5 ONLY if product is in frame; otherwise return 5): compare shape, proportions, buttons, ports, and logo placement against the real product photos.

Rules:
- Fail if ANY score is below 3 OR if productInFrame is true and productFidelity is below 4.
- List specific problems bluntly.
- If productInFrame is true, list EVERY visual difference in shape, proportions, buttons, ports, or logo placement compared to the real product photos; if you cannot see a difference or cannot tell clearly, state that honestly rather than guessing.
- If it fails, write an improvedFramePrompt that fixes the issues (keeping Brand Bible fixed character descriptors word-for-word, and using "[PRODUCT PLACEHOLDER: composite real product here]" if productInFrame is true). If it passes, return an empty string for improvedFramePrompt.

SHOT DETAILS (${shot.id}):
- Route: ${shot.route}
- Scene Description: ${shot.scene}
- Frame Prompt Used: ${shot.framePrompt}
- Product in Frame: ${shot.productInFrame ? 'YES' : 'NO'}

BRAND BIBLE:
- Visual Style: ${JSON.stringify(project.brandBible.visualStyle)}
- Characters: ${
        project.brandBible.characters.length > 0
          ? project.brandBible.characters
              .map((c) => `${c.name}: "${c.fixedDescriptor}"`)
              .join(' | ')
          : 'None specified'
      }
- Product Rules: ${project.brandBible.productRules}
- Banned List: ${project.brandBible.bannedList.join(', ')}`;

      parts.push({ text: prompt });

      const response = await withGeminiRetry(() =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: { parts },
          config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              characterMatch: { type: Type.INTEGER },
              styleMatch: { type: Type.INTEGER },
              compositionMatch: { type: Type.INTEGER },
              artifacts: { type: Type.INTEGER },
              productFidelity: { type: Type.INTEGER },
              problems: { type: Type.ARRAY, items: { type: Type.STRING } },
              productDifferences: { type: Type.ARRAY, items: { type: Type.STRING } },
              improvedFramePrompt: { type: Type.STRING },
            },
            required: [
              'characterMatch',
              'styleMatch',
              'compositionMatch',
              'artifacts',
              'productFidelity',
              'problems',
              'productDifferences',
              'improvedFramePrompt',
            ],
          },
        },
        })
      );

      const parsed = JSON.parse((response.text ?? '{}').trim());
      const clampScore = (val: unknown) =>
        Math.max(0, Math.min(5, Math.round(Number(val) || 0)));

      const charScore = clampScore(parsed.characterMatch);
      const styleScore = clampScore(parsed.styleMatch);
      const compScore = clampScore(parsed.compositionMatch);
      const artScore = clampScore(parsed.artifacts);
      const prodScore = shot.productInFrame ? clampScore(parsed.productFidelity) : null;

      const passed =
        charScore >= 3 &&
        styleScore >= 3 &&
        compScore >= 3 &&
        artScore >= 3 &&
        (!shot.productInFrame || (prodScore !== null && prodScore >= 4));

      const frameCheck: FrameCheckResult = {
        passed,
        scores: {
          characterMatch: charScore,
          styleMatch: styleScore,
          compositionMatch: compScore,
          artifacts: artScore,
          productFidelity: prodScore,
        },
        problems: Array.isArray(parsed.problems) ? parsed.problems : [],
        productDifferences: Array.isArray(parsed.productDifferences)
          ? parsed.productDifferences
          : [],
        improvedFramePrompt: passed ? '' : parsed.improvedFramePrompt || '',
        checkedAt: new Date().toISOString(),
      };

      const nextShots = project.shots.map((s) =>
        s.id === shotId
          ? {
              ...s,
              frameCheck,
              status: s.status === 'Draft' ? ('Frame Uploaded' as const) : s.status,
            }
          : s
      );

      const nextProject: PipelineProject = {
        ...project,
        shots: nextShots,
        generationLog: [
          {
            id: `log-${Date.now()}`,
            timestamp: new Date().toISOString(),
            step: 'Frame Suggestions',
            shotId: shot.id,
            model: GEMINI_MODEL,
            prompt: `Advisory review on ${shot.id}`,
            seed: null,
            status: 'success',
          },
          ...project.generationLog,
        ],
      };

      const saved = await saveProject(nextProject);
      res.json({ project: saved, frameCheck });
    } catch (err) {
      res.status(500).json({
        error: formatGeminiError(
          err,
          'Frame Check could not complete. Please try again.'
        ),
      });
    }
  });

  // STEP 7A: Generate Video Prompts & Negative Prompts (Fast batched ThinkingLevel.LOW)
  router.post('/pipeline/video-prompts', async (req, res) => {
    try {
      const { projectId, shotId } = req.body;
      const project = await getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      const targetShots = project.shots.filter(
        (s) => s.route !== 'live' && (!shotId || s.id === shotId)
      );
      if (targetShots.length === 0) {
        return res
          .status(400)
          .json({ error: 'No AI or hybrid shots found to write video prompts for.' });
      }

      const ai = getGeminiClient();
      const updatedMap = new Map<
        string,
        { videoPrompt: string; negativePrompt: string }
      >();

      const buildSingleShotParts = async (shot: PipelineShot) => {
        const parts: Array<{
          inlineData?: { data: string; mimeType: string };
          text?: string;
        }> = [];
        if (shot.frameImageUrl) {
          const inline = await readAssetAsInlineData(project.id, shot.frameImageUrl);
          if (inline) parts.push({ inlineData: inline });
        }
        parts.push({
          text: `You are a Commercial Video Prompt Director for 52Launch.
Write the video prompt and negative prompt for shot ${shot.id} using the attached start frame (if present).

MODEL TARGET: ${shot.model === 'flux3' ? 'Flux 3' : shot.model === 'veo' ? 'Google Veo 3.1' : shot.model === 'omni' ? 'Google Gemini Omni Flash' : shot.model}
DURATION: ${shot.durationSec} seconds
SCENE: ${shot.scene}
HAS VOICEOVER LINE: ${shot.voLine ? `YES ("${shot.voLine}")` : 'NO'}
PRODUCT IN FRAME: ${shot.productInFrame ? 'YES' : 'NO'}
BRAND BIBLE BANNED LIST: ${project.brandBible.bannedList.join(', ') || 'None'}

STRICT RULES:
1. Describe MOTION, CAMERA, and TIMING only. Keep it concise — add ONE clean line preserving the start frame's framing, wardrobe, and lighting.
2. ${
            shot.model === 'flux3' || shot.model === 'veo' || shot.model === 'omni'
              ? `${shot.model === 'veo' ? 'Google Veo 3.1' : shot.model === 'omni' ? 'Google Gemini Omni Flash' : 'Flux 3'} generates native audio: describe realistic ambient sound matching the scene${
                  shot.voLine
                    ? ', and explicitly state "no dialogue" because voiceover is recorded separately.'
                    : '.'
                }`
              : 'Keep it concise — one clean camera move and one clear subject action.'
          }
3. One action per shot. Never add characters, props, or claims not already in the shot.
4. For negativePrompt: list common video artifacts (warping, extra limbs, text glitches, logo distortion, flickering, morphing faces) PLUS every item from the Brand Bible banned list.`,
        });
        return parts;
      };

      if (targetShots.length === 1) {
        const shot = targetShots[0];
        const parts = await buildSingleShotParts(shot);
        const response = await withGeminiRetry(() =>
          ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: { parts },
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  videoPrompt: { type: Type.STRING },
                  negativePrompt: { type: Type.STRING },
                },
                required: ['videoPrompt', 'negativePrompt'],
              },
            },
          })
        );
        const parsed = JSON.parse((response.text ?? '{}').trim());
        updatedMap.set(shot.id, {
          videoPrompt: parsed.videoPrompt || '',
          negativePrompt: parsed.negativePrompt || '',
        });
      } else {
        // Batched single-request generation across all AI/hybrid shots for ~5x speedup and fewer quota calls
        const batchParts: Array<{
          inlineData?: { data: string; mimeType: string };
          text?: string;
        }> = [];

        const shotSpecs: string[] = [];
        for (const shot of targetShots) {
          if (shot.frameImageUrl) {
            const inline = await readAssetAsInlineData(project.id, shot.frameImageUrl);
            if (inline) {
              batchParts.push({ text: `Reference start frame for shot ${shot.id}:` });
              batchParts.push({ inlineData: inline });
            }
          }
          shotSpecs.push(
            `- Shot ${shot.id} | Model: ${shot.model === 'flux3' ? 'Flux 3 (native audio; state "no dialogue" if VO present)' : shot.model === 'veo' ? 'Google Veo 3.1 (native audio; state "no dialogue" if VO present)' : shot.model === 'omni' ? 'Google Gemini Omni Flash (native audio; state "no dialogue" if VO present)' : shot.model} | Duration: ${shot.durationSec}s | Product in frame: ${shot.productInFrame ? 'YES' : 'NO'} | VO: ${shot.voLine ? `"${shot.voLine}"` : 'NONE'} | Scene: ${shot.scene}`
          );
        }

        batchParts.push({
          text: `You are a Commercial Video Prompt Director for 52Launch.
Write concise video prompts and negative prompts for ALL ${targetShots.length} shots below in a single JSON array.

BRAND BIBLE BANNED LIST: ${project.brandBible.bannedList.join(', ') || 'None'}

STRICT RULES FOR EVERY SHOT:
1. Describe MOTION, CAMERA, and TIMING only. Add ONE clean sentence preserving the start frame's framing, wardrobe, and lighting.
2. For Flux 3, Google Veo 3.1, and Gemini Omni Flash shots with VO, include realistic ambient SFX and explicitly state "no dialogue". For other models keep it crisp: one camera move + one clear subject action.
3. For negativePrompt: include common video artifacts (warping, extra limbs, text glitches, logo distortion, flickering, morphing faces) PLUS items from the Brand Bible banned list.
4. Return the exact "shotId" for every shot listed.

SHOTS TO WRITE:
${shotSpecs.join('\n')}`,
        });

        const batchResponse = await withGeminiRetry(() =>
          ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: { parts: batchParts },
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    shotId: { type: Type.STRING },
                    videoPrompt: { type: Type.STRING },
                    negativePrompt: { type: Type.STRING },
                  },
                  required: ['shotId', 'videoPrompt', 'negativePrompt'],
                },
              },
            },
          })
        );

        const parsedList = JSON.parse((batchResponse.text ?? '[]').trim());
        if (Array.isArray(parsedList)) {
          for (const item of parsedList) {
            const sid = String(item?.shotId || '').trim();
            if (sid) {
              updatedMap.set(sid, {
                videoPrompt: String(item.videoPrompt || ''),
                negativePrompt: String(item.negativePrompt || ''),
              });
            }
          }
        }

        // Fill any shot missing from batch response individually
        const missingShots = targetShots.filter((s) => !updatedMap.has(s.id));
        for (const shot of missingShots) {
          const parts = await buildSingleShotParts(shot);
          const singleRes = await withGeminiRetry(() =>
            ai.models.generateContent({
              model: GEMINI_MODEL,
              contents: { parts },
              config: {
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    videoPrompt: { type: Type.STRING },
                    negativePrompt: { type: Type.STRING },
                  },
                  required: ['videoPrompt', 'negativePrompt'],
                },
              },
            })
          );
          const p = JSON.parse((singleRes.text ?? '{}').trim());
          updatedMap.set(shot.id, {
            videoPrompt: p.videoPrompt || '',
            negativePrompt: p.negativePrompt || '',
          });
        }
      }

      const nextShots = project.shots.map((s) => {
        const resPrompt = updatedMap.get(s.id);
        return resPrompt
          ? {
              ...s,
              videoPrompt: resPrompt.videoPrompt,
              negativePrompt: resPrompt.negativePrompt,
            }
          : s;
      });

      const nextProject: PipelineProject = {
        ...project,
        shots: nextShots,
        approvals: {
          ...project.approvals,
          videoPromptsApproved: false,
          voApproved: false,
          shootPlanApproved: false,
        },
        generationLog: [
          {
            id: `log-${Date.now()}`,
            timestamp: new Date().toISOString(),
            step: 'Video Prompts',
            shotId: shotId || undefined,
            model: GEMINI_MODEL,
            prompt: `Generated video prompts for ${targetShots.length} AI/hybrid shot(s)`,
            seed: null,
            status: 'success',
          },
          ...project.generationLog,
        ],
      };

      const saved = await saveProject(nextProject);
      res.json({ project: saved });
    } catch (err) {
      res.status(500).json({
        error: formatGeminiError(err, 'Could not generate video prompts.'),
      });
    }
  });

  // Check whether FAL_KEY is configured on server (never sends key to browser)
  router.get('/pipeline/fal-status', (_req, res) => {
    const key = process.env.FAL_KEY;
    res.json({
      falKeyConfigured: Boolean(key && key.trim() && key !== 'MY_FAL_KEY'),
    });
  });

  // Upload external video or audio via project store and optional Fal storage helper
  router.post('/pipeline/upload-media', async (req, res) => {
    try {
      const { projectId, dataUrl, prefix } = req.body as {
        projectId: string;
        dataUrl: string;
        prefix?: string;
      };
      if (!projectId || !dataUrl) {
        return res.status(400).json({ error: 'Missing project ID or file data.' });
      }
      const saved = await saveDataUrlAsset(
        projectId,
        dataUrl,
        prefix || 'media'
      );

      let falUrl: string | null = null;
      const falKey = process.env.FAL_KEY;
      if (falKey && falKey !== 'MY_FAL_KEY') {
        try {
          fal.config({ credentials: falKey });
          falUrl = await uploadMediaRefToFal(projectId, saved.url);
        } catch {
          // Non-fatal: local asset URL is still saved and can upload on demand
        }
      }

      res.json({
        url: saved.url,
        filename: saved.filename,
        falUrl,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Could not upload media file.',
      });
    }
  });

  // STEP 7B (Interactive 52Video Studio Modal): Generate video with full model controls
  router.post('/pipeline/studio-generate', async (req, res) => {
    const {
      projectId,
      shotId,
      modelId,
      workflowMode,
      prompt,
      negativePrompt,
      aspectRatio,
      duration,
      qualityTier,
      resolution,
      nativeAudio,
      safetyTolerance,
      enableSafetyChecker,
      seed,
      startFrameUrl,
      endFrameUrl,
      keyframes,
      sourceVideoUrl,
      referenceImages,
      referenceElements,
      referenceVideos,
      referenceAudioUrl,
      referenceTask,
    } = req.body as {
      projectId: string;
      shotId: string;
      modelId: StudioModelId;
      workflowMode: StudioWorkflowMode;
      prompt: string;
      negativePrompt?: string;
      aspectRatio: StudioAspectRatio;
      duration: number;
      qualityTier: StudioQualityTier;
      resolution?: StudioResolution;
      nativeAudio: boolean;
      safetyTolerance?: number;
      enableSafetyChecker?: boolean;
      seed?: number;
      startFrameUrl?: string | null;
      endFrameUrl?: string | null;
      keyframes?: StudioTimelineKeyframe[];
      sourceVideoUrl?: string | null;
      referenceImages?: string[];
      referenceElements?: string[];
      referenceVideos?: string[];
      referenceAudioUrl?: string | null;
      referenceTask?: StudioReferenceTask;
    };

    const project = await getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }
    const shot = project.shots.find((s) => s.id === shotId);
    if (!shot) {
      return res.status(404).json({ error: `Shot ${shotId} not found.` });
    }
    if (!prompt?.trim() && workflowMode !== 'video_reframe') {
      return res.status(400).json({ error: 'Enter a video prompt before generating.' });
    }

    const falKey = process.env.FAL_KEY;
    if (!falKey || falKey === 'MY_FAL_KEY') {
      return res.status(400).json({
        error:
          'Add FAL_KEY in Settings > Secrets to run live video generation directly here.',
      });
    }

    const effectiveModelId: StudioModelId =
      modelId ||
      (shot.model === 'flux3'
        ? 'flux-3'
        : shot.model === 'veo'
          ? 'veo-3.1'
          : shot.model === 'omni'
            ? 'gemini-omni-flash'
            : 'seedance-2.0');
    const effectiveWorkflow: StudioWorkflowMode = workflowMode || 'image_to_video';
    const effectiveQualityTier: StudioQualityTier = qualityTier || 'draft';
    const effectiveNeg =
      negativePrompt !== undefined ? negativePrompt : shot.negativePrompt || '';

    let chosenEndpoint = String(effectiveModelId);
    try {
      fal.config({ credentials: falKey });

      const built = await buildFalVideoRequest({
        projectId: project.id,
        modelId: effectiveModelId,
        workflowMode: effectiveWorkflow,
        prompt: prompt || '',
        negativePrompt: effectiveNeg,
        aspectRatio: aspectRatio || '16:9',
        duration: Number(duration) || shot.durationSec || 5,
        qualityTier: effectiveQualityTier,
        resolution,
        nativeAudio: nativeAudio !== false,
        safetyTolerance: typeof safetyTolerance === 'number' ? safetyTolerance : 2,
        enableSafetyChecker: enableSafetyChecker ?? false,
        seed: typeof seed === 'number' ? seed : Math.floor(Math.random() * 1000000),
        startFrameUrl: startFrameUrl !== undefined ? startFrameUrl : shot.frameImageUrl,
        endFrameUrl,
        keyframes,
        sourceVideoUrl,
        referenceImages,
        referenceElements,
        referenceVideos,
        referenceAudioUrl,
        referenceTask,
      });

      chosenEndpoint = built.endpointId;
      const result = await falSubscribeWithNegativeFallback(
        built.endpointId,
        built.input,
        effectiveNeg
      );

      const data = result.data as {
        video?: { url?: string };
        seed?: number;
        draft_cache?: { url?: string } | null;
      };
      const remoteVideoUrl = data?.video?.url;
      if (!remoteVideoUrl) {
        throw new Error('fal.ai completed without returning a video file.');
      }

      const savedVideo = await saveBinaryAssetFromUrl(
        project.id,
        remoteVideoUrl,
        `video-${shot.id.toLowerCase()}`,
        'mp4'
      );

      const finalSeed =
        typeof data?.seed === 'number'
          ? data.seed
          : effectiveModelId === 'flux-3' ||
              effectiveModelId === 'kling-4.0' ||
              effectiveModelId === 'luma-ray-3.2'
            ? null
            : typeof seed === 'number'
              ? seed
              : null;
      const draftCacheUrl = data?.draft_cache?.url ?? null;

      const mappedShotModel: VideoModelOption =
        effectiveModelId === 'flux-3'
          ? 'flux3'
          : effectiveModelId === 'kling-4.0'
            ? 'kling'
            : effectiveModelId === 'wan-3.0-prime'
              ? 'wan'
              : effectiveModelId === 'luma-ray-3.2'
                ? 'luma'
                : effectiveModelId === 'veo-3.1' || effectiveModelId === 'veo-3.1-fast'
                  ? 'veo'
                  : effectiveModelId === 'gemini-omni-flash'
                    ? 'omni'
                    : 'seedance';

      const newClipItem: ShotClipHistoryItem = {
        id: `clip-${Date.now()}`,
        videoUrl: savedVideo.url,
        createdAt: new Date().toISOString(),
        modelId: effectiveModelId,
        workflowMode: effectiveWorkflow,
        prompt: prompt || '',
        negativePrompt: effectiveNeg,
        aspectRatio: aspectRatio || '16:9',
        duration: built.clampedDuration,
        qualityTier: effectiveQualityTier,
        resolution: built.resolvedResolution,
        nativeAudio: nativeAudio !== false,
        safetyTolerance: typeof safetyTolerance === 'number' ? safetyTolerance : 2,
        enableSafetyChecker: enableSafetyChecker ?? false,
        seed: finalSeed,
        startFrameUrl: startFrameUrl !== undefined ? startFrameUrl : shot.frameImageUrl,
        endFrameUrl: endFrameUrl ?? null,
        keyframes: Array.isArray(keyframes) ? keyframes : undefined,
        sourceVideoUrl: sourceVideoUrl ?? null,
        referenceImages: Array.isArray(referenceImages) ? referenceImages : undefined,
        referenceElements: Array.isArray(referenceElements) ? referenceElements : undefined,
        referenceVideos: Array.isArray(referenceVideos) ? referenceVideos : undefined,
        referenceAudioUrl: referenceAudioUrl ?? null,
        referenceTask,
        draftCacheUrl,
        upscaledVideoUrl: null,
        upscaledResolution: null,
      };

      const nextProject: PipelineProject = {
        ...project,
        shots: project.shots.map((s) =>
          s.id === shot.id
            ? {
                ...s,
                videoPrompt: prompt?.trim() || s.videoPrompt,
                negativePrompt: effectiveNeg,
                durationSec: built.clampedDuration,
                model: mappedShotModel,
                videoUrl: savedVideo.url,
                videoSeed: finalSeed,
                videoResolution: built.resolvedResolution,
                draftCacheUrl,
                videoHistory: appendShotClipHistory(s, newClipItem),
                status: 'Video Ready',
              }
            : s
        ),
        generationLog: [
          {
            id: `log-${Date.now()}`,
            timestamp: new Date().toISOString(),
            step: 'Video Studio',
            shotId: shot.id,
            model: chosenEndpoint,
            prompt: prompt?.trim() || effectiveWorkflow,
            seed: finalSeed,
            status: 'success',
            notes: `${built.resolvedResolution} (${effectiveWorkflow})`,
          },
          ...project.generationLog,
        ],
      };

      const saved = await saveProject(nextProject);
      res.json({
        project: saved,
        videoUrl: savedVideo.url,
        clipId: newClipItem.id,
        seed: finalSeed,
        resolution: built.resolvedResolution,
        draftCacheUrl,
      });
    } catch (err) {
      const failure = describeFalFailure(err);
      await saveProject({
        ...project,
        generationLog: [
          {
            id: `log-${Date.now()}`,
            timestamp: new Date().toISOString(),
            step: 'Video Studio',
            shotId: shot.id,
            model: chosenEndpoint,
            prompt: prompt?.trim() || workflowMode,
            seed: null,
            status: 'error',
            notes: failure.message,
          },
          ...project.generationLog,
        ],
      });
      res.status(failure.status).json({ error: failure.message });
    }
  });

  // STEP 7C: FLUX 3 Draft Enhance to Full 1080p Quality
  router.post('/pipeline/studio-enhance', async (req, res) => {
    const { projectId, shotId, draftCacheUrl, safetyTolerance } = req.body as {
      projectId: string;
      shotId: string;
      draftCacheUrl: string;
      safetyTolerance?: number;
    };

    const project = await getProject(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    const shot = project.shots.find((s) => s.id === shotId);
    if (!shot) return res.status(404).json({ error: `Shot ${shotId} not found.` });

    const falKey = process.env.FAL_KEY;
    if (!falKey || falKey === 'MY_FAL_KEY') {
      return res.status(400).json({ error: 'Add FAL_KEY in Settings > Secrets first.' });
    }
    if (!draftCacheUrl) {
      return res.status(400).json({ error: 'No FLUX 3 draft cache available for this clip.' });
    }

    try {
      fal.config({ credentials: falKey });
      const result = await fal.subscribe(FLUX3_ENDPOINTS.enhance, {
        input: {
          draft_cache_url: draftCacheUrl,
          safety_tolerance: typeof safetyTolerance === 'number' ? safetyTolerance : 2,
        },
        logs: false,
      });
      const data = result.data as { video?: { url?: string } };
      const remoteUrl = data?.video?.url;
      if (!remoteUrl) throw new Error('fal.ai returned no enhanced video.');

      const savedVideo = await saveBinaryAssetFromUrl(
        project.id,
        remoteUrl,
        `video-${shot.id.toLowerCase()}-1080p`,
        'mp4'
      );

      const nextProject: PipelineProject = {
        ...project,
        shots: project.shots.map((s) =>
          s.id === shot.id
            ? {
                ...s,
                videoUrl: savedVideo.url,
                videoResolution: '1080p',
                draftCacheUrl: null,
                status: 'Video Ready',
              }
            : s
        ),
        generationLog: [
          {
            id: `log-${Date.now()}`,
            timestamp: new Date().toISOString(),
            step: 'Draft Enhance (1080p)',
            shotId: shot.id,
            model: FLUX3_ENDPOINTS.enhance,
            prompt: shot.videoPrompt,
            seed: shot.videoSeed,
            status: 'success',
          },
          ...project.generationLog,
        ],
      };
      const saved = await saveProject(nextProject);
      res.json({ project: saved, videoUrl: savedVideo.url, resolution: '1080p' });
    } catch (err) {
      const failure = describeFalFailure(err);
      res.status(failure.status).json({ error: failure.message });
    }
  });

  // STEP 7D: Universal Topaz Video Upscaling Pipeline (Precision / Generative / Creative)
  router.post('/pipeline/studio-upscale', async (req, res) => {
    const {
      projectId,
      shotId,
      videoUrl,
      label,
      mode = 'precision',
      subModel,
      scaleFactor = 2,
      creativity = 0.5,
    } = req.body as {
      projectId: string;
      shotId?: string | null;
      videoUrl: string;
      label?: string;
      mode?: TopazUpscaleMode;
      subModel?: string;
      scaleFactor?: 2 | 4;
      creativity?: number;
    };

    const project = await getProject(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    const shot = shotId ? project.shots.find((s) => s.id === shotId) : undefined;
    if (shotId && !shot) {
      return res.status(404).json({ error: `Shot ${shotId} not found.` });
    }

    const falKey = process.env.FAL_KEY;
    if (!falKey || falKey === 'MY_FAL_KEY') {
      return res.status(400).json({ error: 'Add FAL_KEY in Settings > Secrets first.' });
    }

    const sourceRef = videoUrl || shot?.videoUrl;
    if (!sourceRef) {
      return res.status(400).json({ error: 'No video source found to upscale.' });
    }

    try {
      fal.config({ credentials: falKey });

      // If an external data URL was passed directly, persist it locally first
      let persistedSourceUrl = sourceRef;
      if (sourceRef.startsWith('data:')) {
        const storedSource = await saveDataUrlAsset(
          project.id,
          sourceRef,
          'upscale-src'
        );
        persistedSourceUrl = storedSource.url;
      }

      const built = await buildTopazUpscaleRequest({
        projectId: project.id,
        videoUrl: persistedSourceUrl,
        mode,
        subModel,
        scaleFactor: scaleFactor === 4 ? 4 : 2,
        creativity,
      });

      const result = await fal.subscribe(built.endpointId, {
        input: built.input,
        logs: false,
      });

      const data = result.data as { video?: { url?: string } };
      const remoteUrl = data?.video?.url;
      if (!remoteUrl) throw new Error('Topaz upscaler returned no video.');

      const badgeLabel = built.scaleFactor === 4 ? '4K / Upscaled' : '2x / Upscaled';
      const fileSlug = shot
        ? `video-${shot.id.toLowerCase()}-topaz-${built.scaleFactor}x`
        : `external-topaz-${built.scaleFactor}x`;

      const savedVideo = await saveBinaryAssetFromUrl(
        project.id,
        remoteUrl,
        fileSlug,
        'mp4'
      );

      const details: UpscaleDetails = {
        mode,
        subModel: built.resolvedSubModel,
        scaleFactor: built.scaleFactor,
        creativity: mode === 'creative' ? Number(creativity ?? 0.5) : undefined,
        h264Output: true,
        upscaledAt: new Date().toISOString(),
      };

      let nextProject: PipelineProject;
      if (shot) {
        nextProject = {
          ...project,
          shots: project.shots.map((s) =>
            s.id === shot.id
              ? {
                  ...s,
                  upscaledVideoUrl: savedVideo.url,
                  upscaledResolution: badgeLabel,
                  upscaleDetails: details,
                  videoHistory: Array.isArray(s.videoHistory)
                    ? s.videoHistory.map((clip) =>
                        clip.videoUrl === sourceRef || clip.videoUrl === persistedSourceUrl
                          ? {
                              ...clip,
                              upscaledVideoUrl: savedVideo.url,
                              upscaledResolution: badgeLabel,
                            }
                          : clip
                      )
                    : s.videoHistory,
                  status: 'Video Ready',
                }
              : s
          ),
          generationLog: [
            {
              id: `log-${Date.now()}`,
              timestamp: new Date().toISOString(),
              step: `Topaz Upscale (${badgeLabel})`,
              shotId: shot.id,
              model: `${built.endpointId} (${built.resolvedSubModel})`,
              prompt: shot.videoPrompt,
              seed: shot.videoSeed,
              status: 'success',
              notes: `${built.scaleFactor}x H.264 Premiere-Ready · Original FPS locked`,
            },
            ...project.generationLog,
          ],
        };
      } else {
        const extItem: ExternalUpscaleItem = {
          id: `ext-up-${Date.now()}`,
          label: label?.trim() || 'Uploaded Clip',
          sourceUrl: persistedSourceUrl,
          upscaledVideoUrl: savedVideo.url,
          upscaledResolution: badgeLabel,
          details,
        };
        nextProject = {
          ...project,
          externalUpscales: [extItem, ...(project.externalUpscales || [])],
          generationLog: [
            {
              id: `log-${Date.now()}`,
              timestamp: new Date().toISOString(),
              step: `Topaz Upscale External (${badgeLabel})`,
              model: `${built.endpointId} (${built.resolvedSubModel})`,
              prompt: extItem.label,
              seed: null,
              status: 'success',
              notes: `${built.scaleFactor}x H.264 Premiere-Ready · Original FPS locked`,
            },
            ...project.generationLog,
          ],
        };
      }

      const saved = await saveProject(nextProject);
      res.json({
        project: saved,
        upscaledVideoUrl: savedVideo.url,
        resolution: badgeLabel,
        details,
      });
    } catch (err) {
      const failure = describeFalFailure(err);
      res.status(failure.status).json({ error: failure.message });
    }
  });

  // STEP 7B (Sequential Batch): Generate AI Video via fal.ai using exact FLUX 3 / Seedance 2.5 endpoints
  router.post('/pipeline/generate-video', async (req, res) => {
    const { projectId, shotId, chainedLastFrameDataUrl } = req.body;
    const project = await getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const shot = project.shots.find((s) => s.id === shotId);
    if (!shot) {
      return res.status(404).json({ error: `Shot ${shotId} not found.` });
    }
    if (shot.route === 'live') {
      return res
        .status(400)
        .json({ error: `Shot ${shot.id} is a Live shoot shot and does not use AI video.` });
    }
    if (!shot.videoPrompt.trim()) {
      return res.status(400).json({
        error: `Write or generate a video prompt for ${shot.id} first.`,
      });
    }

    const falKey = process.env.FAL_KEY;
    if (!falKey || falKey === 'MY_FAL_KEY') {
      return res.status(400).json({
        error:
          'Add FAL_KEY in Settings > Secrets to generate videos directly here, or click "Generate AI video" on a card to preview/copy inside the 52Video Studio popup.',
      });
    }

    const modelId: StudioModelId =
      shot.model === 'flux3'
        ? 'flux-3'
        : shot.model === 'kling'
          ? 'kling-4.0'
          : shot.model === 'wan'
            ? 'wan-3.0-prime'
            : shot.model === 'luma'
              ? 'luma-ray-3.2'
              : shot.model === 'veo'
                ? 'veo-3.1'
                : shot.model === 'omni'
                  ? 'gemini-omni-flash'
                  : 'seedance-2.5';
    let chosenEndpoint: string = modelId;

    try {
      fal.config({ credentials: falKey });

      const built = await buildFalVideoRequest({
        projectId: project.id,
        modelId,
        workflowMode: 'image_to_video',
        prompt: shot.videoPrompt,
        negativePrompt: shot.negativePrompt,
        aspectRatio: '16:9',
        duration: shot.durationSec,
        qualityTier: 'draft',
        nativeAudio: true,
        safetyTolerance: 2,
        seed: shot.videoSeed ?? Math.floor(Math.random() * 1000000),
        startFrameUrl: chainedLastFrameDataUrl || shot.frameImageUrl,
      });

      chosenEndpoint = built.endpointId;
      const result = await falSubscribeWithNegativeFallback(
        built.endpointId,
        built.input,
        shot.negativePrompt
      );

      const data = result.data as {
        video?: { url?: string };
        seed?: number;
      };
      const remoteVideoUrl = data?.video?.url;
      if (!remoteVideoUrl) {
        throw new Error('fal.ai completed without returning a video file.');
      }

      const savedVideo = await saveBinaryAssetFromUrl(
        project.id,
        remoteVideoUrl,
        `video-${shot.id.toLowerCase()}`,
        'mp4'
      );
      const seed = typeof data?.seed === 'number' ? data.seed : null;

      const newClipItem: ShotClipHistoryItem = {
        id: `clip-${Date.now()}`,
        videoUrl: savedVideo.url,
        createdAt: new Date().toISOString(),
        modelId,
        workflowMode: 'image_to_video',
        prompt: shot.videoPrompt,
        negativePrompt: shot.negativePrompt || '',
        aspectRatio: '16:9',
        duration: built.clampedDuration,
        qualityTier: 'draft',
        resolution: built.resolvedResolution,
        nativeAudio: true,
        safetyTolerance: 2,
        seed,
        startFrameUrl: chainedLastFrameDataUrl || shot.frameImageUrl,
      };

      const nextProject: PipelineProject = {
        ...project,
        shots: project.shots.map((s) =>
          s.id === shot.id
            ? {
                ...s,
                videoUrl: savedVideo.url,
                videoSeed: seed,
                videoResolution: built.resolvedResolution,
                videoHistory: appendShotClipHistory(s, newClipItem),
                status: 'Video Ready',
              }
            : s
        ),
        generationLog: [
          {
            id: `log-${Date.now()}`,
            timestamp: new Date().toISOString(),
            step: 'Video Generation',
            shotId: shot.id,
            model: chosenEndpoint,
            prompt: shot.videoPrompt,
            seed,
            status: 'success',
          },
          ...project.generationLog,
        ],
      };

      const saved = await saveProject(nextProject);
      res.json({ project: saved });
    } catch (err) {
      const failure = describeFalFailure(err);
      await saveProject({
        ...project,
        generationLog: [
          {
            id: `log-${Date.now()}`,
            timestamp: new Date().toISOString(),
            step: 'Video Generation',
            shotId: shot.id,
            model: chosenEndpoint,
            prompt: shot.videoPrompt,
            seed: null,
            status: 'error',
            notes: failure.message,
          },
          ...project.generationLog,
        ],
      });
      res.status(failure.status).json({ error: failure.message });
    }
  });

  // STEP 8A: Generate VO Script (Gemini 4 Hydrogen)
  router.post('/pipeline/vo-script', async (req, res) => {
    try {
      const { projectId } = req.body as { projectId: string };
      const project = await getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      const ai = getGeminiClient();
      const shotsContext = project.shots
        .map((s) => {
          const targetWords = Math.max(3, Math.round((Number(s.durationSec) || 4) * 2.5));
          return `- ${s.id} (${s.durationSec}s, ~${targetWords} words max, deliverable: ${s.deliverable}): Scene="${s.scene}" | Draft VO="${s.voLine || 'None'}"`;
        })
        .join('\n');

      const prompt = `You are a Commercial Voiceover Director & Copywriter at 52Launch.
Write a timed, performance-ready Voiceover Script for "${project.product.name}" (Client: ${project.client}).

STRICT RULES:
1. Respect the ~2.5 words per second pacing budget for every shot so the spoken line finishes comfortably inside the shot's duration without rushing.
2. Use natural contractions, conversational cadence, and clean punctuation (commas, em-dashes, ellipses) for natural human breathing.
3. Build a clear emotional arc across the spot rather than making every line sound identical.
4. For every line, provide plain-English vocal direction (e.g. "warm, quietly confident, unhurried") in "direction", and plain-English performance guidance in "audioTags" (do NOT use ElevenLabs bracketed markup).
5. Pick "emotionalTone" strictly from this exact list:
   "Natural & Conversational", "Warm & Friendly", "Authoritative & Serious", "Enthusiastic & High Energy", "Dramatic & Cinematic Movie", "Calm & Whispering / ASMR", "Professional News Anchor", "Empathetic & Compassionate", "Playful & Sarcastic", "Educational & Explanatory".
6. Set "emotionIntensity" between 0.35 and 0.95, and "pauseAfter" (seconds of silence gap after the clip) between 0.2 and 0.8.
7. NEVER make any product claim outside the approved Claims Allowed list below.

BRAND VOICE & CLAIMS:
- Tone Adjectives: ${project.brandBible.toneOfVoice.adjectives.join(', ')}
- Tone Guidance: ${project.brandBible.toneOfVoice.guidance}
- Approved Claims (STRICT): ${project.brandBible.claimsAllowed.join(' | ') || 'None specified'}
- Banned List: ${project.brandBible.bannedList.join(', ') || 'None'}

CREATIVE BRIEF VO DIRECTION:
- Speaker: ${project.creativeBrief.voDirection.speaker || 'Brand Narrator'}
- Pace: ${project.creativeBrief.voDirection.pace || '~2.5 words/sec'}
- Emotional Arc: ${project.creativeBrief.voDirection.emotionalArc || 'Grounded opening to confident finish'}

ORDERED SHOTS:
${shotsContext}`;

      const response = await withGeminiRetry(() =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  shotId: { type: Type.STRING },
                  speaker: { type: Type.STRING },
                  direction: { type: Type.STRING },
                  line: { type: Type.STRING },
                  audioTags: { type: Type.STRING },
                  emotionalTone: { type: Type.STRING },
                  emotionIntensity: { type: Type.NUMBER },
                  pauseAfter: { type: Type.NUMBER },
                },
                required: [
                  'shotId',
                  'speaker',
                  'direction',
                  'line',
                  'audioTags',
                  'emotionalTone',
                  'emotionIntensity',
                  'pauseAfter',
                ],
              },
            },
          },
        })
      );

      const parsed = JSON.parse((response.text ?? '[]').trim());
      const shotDurationMap = new Map(
        project.shots.map((s) => [s.id, Number(s.durationSec) || 4])
      );
      const activeSettings: VoStudioSettings = project.voSettings ?? {
        voiceName: 'Kore',
        emotionalTone: 'Warm & Friendly',
        emotionIntensity: 0.85,
        speed: 1.0,
        pitch: 1.0,
        language: 'en-US',
        pauseAfter: 0.35,
        ttsModel: 'gemini-3.8-flash-lite-tts',
        enhanceWithDSP: true,
        singleVoiceMode: true,
      };

      const voScript: VoScriptLine[] = (Array.isArray(parsed) ? parsed : [])
        .filter((item: Partial<VoScriptLine>) => Boolean(item.line && String(item.line).trim()))
        .map((item: Partial<VoScriptLine>, idx: number) => {
          const shotId = String(item.shotId || project.shots[idx]?.id || `S${String(idx + 1).padStart(2, '0')}`);
          const durationSec = shotDurationMap.get(shotId) ?? 4;
          return {
            id: `vo-${Date.now()}-${idx}`,
            shotId,
            speaker: String(item.speaker || project.creativeBrief.voDirection.speaker || 'Narrator').trim(),
            direction: String(item.direction || '').trim(),
            line: String(item.line || '').trim(),
            audioTags: String(item.audioTags || '').trim(),
            emotionalTone: String(item.emotionalTone || activeSettings.emotionalTone),
            emotionIntensity: Math.max(0.1, Math.min(1.0, Number(item.emotionIntensity) || 0.8)),
            voiceName: activeSettings.voiceName,
            speed: activeSettings.speed,
            pitch: activeSettings.pitch,
            language: activeSettings.language,
            pauseAfter: Math.max(0.1, Math.min(2.0, Number(item.pauseAfter) || 0.35)),
            audioUrl: null,
            durationSec,
            targetWords: Math.max(3, Math.round(durationSec * 2.5)),
          };
        });

      const nextProject: PipelineProject = {
        ...project,
        voScript,
        voHasGenerated: true,
        voManuallyEdited: false,
        voSettings: activeSettings,
        approvals: {
          ...project.approvals,
          voApproved: false,
          shootPlanApproved: false,
        },
        generationLog: [
          {
            id: `log-${Date.now()}`,
            timestamp: new Date().toISOString(),
            step: 'VO Script',
            model: GEMINI_MODEL,
            prompt: `Wrote ${voScript.length} timed VO lines for ${project.product.name}`,
            seed: null,
            status: 'success',
          },
          ...project.generationLog,
        ],
      };

      const saved = await saveProject(nextProject);
      res.json({ project: saved });
    } catch (err) {
      res.status(500).json({
        error: formatGeminiError(err, 'Could not generate VO script.'),
      });
    }
  });

  // STEP 8B: Audition a Gemini Voice (no project mutation)
  router.post('/pipeline/vo-audition', async (req, res) => {
    try {
      const {
        text,
        voiceName,
        emotionalTone,
        emotionIntensity,
        ttsModel,
        language,
        stylePrompt,
      } = req.body as {
        text?: string;
        voiceName?: string;
        emotionalTone?: string;
        emotionIntensity?: number;
        ttsModel?: GeminiTtsModel;
        language?: string;
        stylePrompt?: string;
      };

      const sampleText =
        (text && text.trim()) ||
        'Designed for quiet precision when every second counts.';

      const ai = getGeminiClient();
      const tts = await synthesizeWithGeminiTTS(ai, {
        text: sampleText,
        voice: voiceName,
        model: ttsModel,
        emotionalTone,
        emotionIntensity,
        language,
        stylePrompt,
      });

      res.json({
        audioBase64: tts.audioBase64,
        mimeType: tts.mimeType,
        voice: tts.voice,
        model: tts.model,
        styleDirective: tts.styleDirective,
      });
    } catch (err) {
      res.status(500).json({
        error: formatGeminiError(
          err,
          'Could not audition Gemini voice. Check GEMINI_API_KEY in Settings > Secrets.'
        ),
      });
    }
  });

  // STEP 8C: Synthesize and persist Gemini 3.8 TTS WAV for a VO line
  router.post('/pipeline/vo-generate', async (req, res) => {
    try {
      const {
        projectId,
        lineId,
        line,
        direction,
        speaker,
        audioTags,
        emotionalTone,
        emotionIntensity,
        voiceName,
        speed,
        pitch,
        language,
        pauseAfter,
        ttsModel,
        stylePrompt,
        skipPitchText,
        skipSpeedText,
        voSettings,
      } = req.body as {
        projectId: string;
        lineId: string;
        line?: string;
        direction?: string;
        speaker?: string;
        audioTags?: string;
        emotionalTone?: string;
        emotionIntensity?: number;
        voiceName?: string;
        speed?: number;
        pitch?: number;
        language?: string;
        pauseAfter?: number;
        ttsModel?: GeminiTtsModel;
        stylePrompt?: string;
        skipPitchText?: boolean;
        skipSpeedText?: boolean;
        voSettings?: VoStudioSettings;
      };

      const project = await getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      const targetLine = project.voScript.find((v) => v.id === lineId);
      if (!targetLine) {
        return res.status(404).json({ error: 'VO line not found.' });
      }

      const spokenText = (line ?? targetLine.line).trim();
      if (!spokenText) {
        return res.status(400).json({ error: 'Enter spoken VO text before generating audio.' });
      }

      const activeVoice =
        voiceName ||
        targetLine.voiceName ||
        project.voSettings?.voiceName ||
        'Kore';
      const safeVoice = (VALID_GEMINI_VOICES as readonly string[]).includes(activeVoice)
        ? activeVoice
        : 'Kore';
      const activeTone =
        emotionalTone ||
        targetLine.emotionalTone ||
        project.voSettings?.emotionalTone ||
        'Warm & Friendly';
      const activeIntensity =
        emotionIntensity ??
        targetLine.emotionIntensity ??
        project.voSettings?.emotionIntensity ??
        0.85;
      const activeSpeed = speed ?? targetLine.speed ?? project.voSettings?.speed ?? 1.0;
      const activePitch = pitch ?? targetLine.pitch ?? project.voSettings?.pitch ?? 1.0;
      const activeLanguage =
        language ||
        targetLine.language ||
        project.voSettings?.language ||
        'en-US';
      const activeDirection = (direction ?? targetLine.direction ?? '').trim();
      const activePauseAfter = pauseAfter ?? targetLine.pauseAfter ?? 0.35;

      const ai = getGeminiClient();
      const tts = await synthesizeWithGeminiTTS(ai, {
        text: spokenText,
        voice: safeVoice,
        model: ttsModel ?? project.voSettings?.ttsModel ?? 'gemini-3.8-flash-lite-tts',
        direction: activeDirection,
        emotionalTone: activeTone,
        emotionIntensity: activeIntensity,
        stylePrompt: stylePrompt ?? project.voSettings?.customStylePrompt,
        speed: activeSpeed,
        pitch: activePitch,
        language: activeLanguage,
        skipPitchText,
        skipSpeedText,
      });

      const savedAsset = await saveBufferAsset(
        project.id,
        tts.wavBuffer,
        `vo-${targetLine.shotId.toLowerCase()}`,
        'wav'
      );

      const nextLines = project.voScript.map((v) =>
        v.id === lineId
          ? {
              ...v,
              line: spokenText,
              direction: activeDirection,
              speaker: speaker ?? v.speaker,
              audioTags: audioTags ?? v.audioTags,
              emotionalTone: activeTone,
              emotionIntensity: activeIntensity,
              voiceName: safeVoice,
              speed: activeSpeed,
              pitch: activePitch,
              language: activeLanguage,
              pauseAfter: activePauseAfter,
              audioUrl: savedAsset.url,
            }
          : v
      );

      const nextProject: PipelineProject = {
        ...project,
        voScript: nextLines,
        voSettings: voSettings || project.voSettings,
        generationLog: [
          {
            id: `log-${Date.now()}`,
            timestamp: new Date().toISOString(),
            step: 'VO Audio',
            shotId: targetLine.shotId,
            model: tts.model,
            prompt: `${tts.voice} (${activeTone}): ${spokenText}`,
            seed: null,
            status: 'success',
          },
          ...project.generationLog,
        ],
      };

      const saved = await saveProject(nextProject);
      res.json({
        project: saved,
        audioUrl: savedAsset.url,
        audioBase64: tts.audioBase64,
        mimeType: tts.mimeType,
        model: tts.model,
        styleDirective: tts.styleDirective,
      });
    } catch (err) {
      res.status(500).json({
        error: formatGeminiError(err, 'Could not generate Gemini voiceover audio.'),
      });
    }
  });

  // STEP 8D: Translate VO Script into target language while keeping timing & product name accuracy
  router.post('/pipeline/vo-translate', async (req, res) => {
    try {
      const { projectId, targetLanguage, targetLanguageName } = req.body as {
        projectId: string;
        targetLanguage: string;
        targetLanguageName?: string;
      };
      const project = await getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found.' });
      }
      if (project.voScript.length === 0) {
        return res.status(400).json({ error: 'Write or add VO lines before translating.' });
      }

      const ai = getGeminiClient();
      const langLabel = targetLanguageName || targetLanguage;
      const linesInput = project.voScript.map((v) => ({
        id: v.id,
        shotId: v.shotId,
        durationSec: v.durationSec ?? 4,
        speaker: v.speaker,
        direction: v.direction,
        line: v.line,
      }));

      const prompt = `Translate this commercial voiceover script for "${project.product.name}" naturally into ${langLabel} (${targetLanguage}).
Keep the brand and product name "${project.product.name}" intact unless standard localization applies.
Keep spoken line length tight so each line still reads comfortably inside its shot's durationSec (~2.5 words/sec).
Also translate "direction" and "speaker" naturally into ${langLabel}, and return the exact same "id" for each item.

LINES TO TRANSLATE:
${JSON.stringify(linesInput)}`;

      const response = await withGeminiRetry(() =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  speaker: { type: Type.STRING },
                  direction: { type: Type.STRING },
                  line: { type: Type.STRING },
                },
                required: ['id', 'speaker', 'direction', 'line'],
              },
            },
          },
        })
      );

      const translated = JSON.parse((response.text ?? '[]').trim()) as Array<{
        id: string;
        speaker: string;
        direction: string;
        line: string;
      }>;
      const translatedMap = new Map(translated.map((t) => [t.id, t]));

      const nextLines = project.voScript.map((v) => {
        const hit = translatedMap.get(v.id);
        if (!hit) return { ...v, language: targetLanguage, audioUrl: null };
        return {
          ...v,
          speaker: hit.speaker || v.speaker,
          direction: hit.direction || v.direction,
          line: hit.line || v.line,
          language: targetLanguage,
          audioUrl: null,
        };
      });

      const nextSettings: VoStudioSettings = {
        ...(project.voSettings ?? {
          voiceName: 'Kore',
          emotionalTone: 'Warm & Friendly',
          emotionIntensity: 0.85,
          speed: 1.0,
          pitch: 1.0,
          language: targetLanguage,
          pauseAfter: 0.35,
          ttsModel: 'gemini-3.8-flash-lite-tts',
          enhanceWithDSP: true,
          singleVoiceMode: true,
        }),
        language: targetLanguage,
      };

      const nextProject: PipelineProject = {
        ...project,
        voScript: nextLines,
        voSettings: nextSettings,
        approvals: {
          ...project.approvals,
          voApproved: false,
          shootPlanApproved: false,
        },
        generationLog: [
          {
            id: `log-${Date.now()}`,
            timestamp: new Date().toISOString(),
            step: 'VO Translation',
            model: GEMINI_MODEL,
            prompt: `Translated ${nextLines.length} VO lines into ${langLabel}`,
            seed: null,
            status: 'success',
          },
          ...project.generationLog,
        ],
      };

      const saved = await saveProject(nextProject);
      res.json({ project: saved });
    } catch (err) {
      res.status(500).json({
        error: formatGeminiError(err, 'Could not translate VO script.'),
      });
    }
  });

  // STEP 9: Generate Live & Hybrid Shoot Plan (Gemini 4 Hydrogen)
  router.post('/pipeline/shoot-plan', async (req, res) => {
    try {
      const { projectId } = req.body as { projectId: string };
      const project = await getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      const liveHybridShots = project.shots.filter(
        (s) => s.route === 'live' || s.route === 'hybrid'
      );

      if (liveHybridShots.length === 0) {
        const emptyPlan: ShootPlan = {
          shootDays: [],
          equipment: [],
          propsAndUnits: [],
          crew: [],
          risks: ['No Live or Hybrid shots are currently in the Shot List (all shots are routed to AI video).'],
          clientQuestions: ['Confirm whether any live-action product macro or lifestyle pickup shots should be added before wrap.'],
          hasGenerated: true,
          manuallyEdited: false,
        };
        const saved = await saveProject({
          ...project,
          shootPlan: emptyPlan,
          approvals: { ...project.approvals, shootPlanApproved: false },
        });
        return res.json({ project: saved });
      }

      const ai = getGeminiClient();
      const shotsText = liveHybridShots
        .map(
          (s) =>
            `- ${s.id} [${s.route.toUpperCase()}] (${s.durationSec}s, Deliverable: ${s.deliverable}): Scene="${s.scene}" | Shoot Direction="${s.shootDirection || 'Not specified'}" | Product in frame: ${s.productInFrame ? 'YES' : 'NO'} | Continuity: "${s.continuityNotes || 'None'}"`
        )
        .join('\n');

      const prompt = `You are a seasoned Commercial Line Producer at 52Launch.
Build a practical, production-ready Shoot Plan ONLY for the Live and Hybrid shots listed below.
Do NOT include any AI-only ("ai_video") shots in this Shoot Plan.

CRITICAL LINE PRODUCER RULES:
1. Provide a comprehensive, detailed CHRONOLOGICAL DAY SCHEDULE BREAKDOWN for each shoot day.
   Every shoot day MUST be broken down step-by-step:
   - Crew Call & Load-In (e.g., 07:00 - 08:00 AM)
   - Hot Breakfast & Morning Director/DP Safety Briefing (e.g., 08:00 - 08:30 AM)
   - Morning Shoot Setups (group shots by location and lighting, e.g., 08:30 - 10:30 AM)
   - MANDATORY CREW LUNCH BREAK (e.g., 12:30 PM - 01:30 PM, exactly 60 minutes, hot catering on-set)
   - Afternoon Shoot Setups (continue scheduled shots, e.g., 01:30 PM - 05:30 PM)
   - Pack-Down, DIT Media Dump & Sound Card Check (e.g., 05:30 PM - 06:15 PM)
   - Company Wrap (e.g., 06:30 PM)
2. Group shots efficiently into "shootDays" and within each day into logical "setups" grouped by LOCATION and LIGHTING (so the crew doesn't relight back and forth).
3. For each setup include setupName, timeSlot (e.g. "08:30 - 10:15 AM"), lightingNotes, shotIds (exact IDs from the list below), and realistic estimatedMinutes.
4. For "propsAndUnits", always specify backup real product units (e.g. "2 hero units + 2 spare unopened units") whenever productInFrame is true, plus who supplies each item (Client vs Production).
5. NEVER invent shoot dates, permit confirmations, or budget numbers that were not provided in the intake notes. If dates, locations, talent availability, or budget figures are missing or vague, explicitly put questions for them in "clientQuestions".

PROJECT & INTAKE NOTES:
- Client: ${project.client}
- Product: ${project.product.name}
- Product Rules: ${project.brandBible.productRules}
- Shoot Location / Dates / Budget Notes from Intake: ${project.intake.shootLocationDatesBudgetNotes || 'MISSING — nothing provided by client yet'}
- Deliverables Wanted: ${project.intake.videosWanted}
- Brand Visual Style: ${JSON.stringify(project.brandBible.visualStyle)}

LIVE & HYBRID SHOTS TO SCHEDULE (${liveHybridShots.length} total):
${shotsText}`;

      const response = await withGeminiRetry(() =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
          config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              shootDays: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    dayLabel: { type: Type.STRING },
                    location: { type: Type.STRING },
                    callTime: { type: Type.STRING },
                    breakfastTime: { type: Type.STRING },
                    lunchTime: { type: Type.STRING },
                    wrapTime: { type: Type.STRING },
                    scheduleBreakdown: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          timeSlot: { type: Type.STRING },
                          activity: { type: Type.STRING },
                          category: {
                            type: Type.STRING,
                            description: 'call, setup, meal, move, wrap, or general',
                          },
                          shotIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                          notes: { type: Type.STRING },
                          estimatedMinutes: { type: Type.INTEGER },
                        },
                        required: ['timeSlot', 'activity', 'category', 'notes'],
                      },
                    },
                    setups: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          setupName: { type: Type.STRING },
                          timeSlot: { type: Type.STRING },
                          lightingNotes: { type: Type.STRING },
                          shotIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                          estimatedMinutes: { type: Type.INTEGER },
                        },
                        required: ['setupName', 'lightingNotes', 'shotIds', 'estimatedMinutes'],
                      },
                    },
                  },
                  required: ['dayLabel', 'location', 'callTime', 'wrapTime', 'setups'],
                },
              },
              equipment: { type: Type.ARRAY, items: { type: Type.STRING } },
              propsAndUnits: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    item: { type: Type.STRING },
                    quantity: { type: Type.STRING },
                    suppliedBy: { type: Type.STRING },
                  },
                  required: ['item', 'quantity', 'suppliedBy'],
                },
              },
              crew: { type: Type.ARRAY, items: { type: Type.STRING } },
              risks: { type: Type.ARRAY, items: { type: Type.STRING } },
              clientQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: [
              'shootDays',
              'equipment',
              'propsAndUnits',
              'crew',
              'risks',
              'clientQuestions',
            ],
          },
        },
        })
      );

      const parsed = JSON.parse((response.text ?? '{}').trim());
      const shootPlan: ShootPlan = {
        shootDays: Array.isArray(parsed.shootDays)
          ? parsed.shootDays.map(
              (
                day: {
                  dayLabel?: string;
                  location?: string;
                  callTime?: string;
                  breakfastTime?: string;
                  lunchTime?: string;
                  wrapTime?: string;
                  scheduleBreakdown?: Array<{
                    timeSlot?: string;
                    activity?: string;
                    category?: string;
                    shotIds?: string[];
                    notes?: string;
                    estimatedMinutes?: number;
                  }>;
                  setups?: Array<{
                    setupName?: string;
                    timeSlot?: string;
                    lightingNotes?: string;
                    shotIds?: string[];
                    estimatedMinutes?: number;
                  }>;
                },
                idx: number
              ) => {
                const dayCallTime = day.callTime || '07:00 AM';
                const dayWrapTime = day.wrapTime || '06:30 PM';
                const dayLunchTime = day.lunchTime || '12:30 PM - 01:30 PM';
                const dayBreakfastTime = day.breakfastTime || '07:30 AM';

                const parsedSetups = Array.isArray(day.setups)
                  ? day.setups.map((st) => ({
                      setupName: st.setupName || 'Setup',
                      timeSlot: st.timeSlot || undefined,
                      lightingNotes: st.lightingNotes || '',
                      shotIds: Array.isArray(st.shotIds) ? st.shotIds : [],
                      estimatedMinutes: Number(st.estimatedMinutes) || 45,
                    }))
                  : [];

                // Build default schedule breakdown if model omitted it
                let scheduleBreakdown = Array.isArray(day.scheduleBreakdown) && day.scheduleBreakdown.length > 0
                  ? day.scheduleBreakdown.map((sb, sbIdx) => ({
                      id: `sb-${Date.now()}-${idx}-${sbIdx}`,
                      timeSlot: sb.timeSlot || 'TBD',
                      activity: sb.activity || 'Activity',
                      category: (['call', 'setup', 'meal', 'move', 'wrap', 'general'].includes(sb.category || '')
                        ? sb.category
                        : 'general') as 'call' | 'setup' | 'meal' | 'move' | 'wrap' | 'general',
                      shotIds: Array.isArray(sb.shotIds) ? sb.shotIds : [],
                      notes: sb.notes || '',
                      estimatedMinutes: sb.estimatedMinutes,
                    }))
                  : [];

                if (scheduleBreakdown.length === 0) {
                  scheduleBreakdown = [
                    {
                      id: `sb-${Date.now()}-${idx}-call`,
                      timeSlot: `${dayCallTime} - 07:45 AM`,
                      activity: 'Crew Call & Equipment Load-In',
                      category: 'call',
                      shotIds: [],
                      notes: 'Grip & Electric truck unload, DIT staging, sound check',
                      estimatedMinutes: 45,
                    },
                    {
                      id: `sb-${Date.now()}-${idx}-bfast`,
                      timeSlot: `${dayBreakfastTime} - 08:15 AM`,
                      activity: 'Hot Breakfast & Morning Briefing',
                      category: 'meal',
                      shotIds: [],
                      notes: 'Director & DP walk department heads through day plan',
                      estimatedMinutes: 45,
                    },
                  ];

                  parsedSetups.forEach((st, sIdx) => {
                    scheduleBreakdown.push({
                      id: `sb-${Date.now()}-${idx}-st-${sIdx}`,
                      timeSlot: st.timeSlot || `Morning Setup ${sIdx + 1}`,
                      activity: st.setupName,
                      category: 'setup',
                      shotIds: st.shotIds,
                      notes: st.lightingNotes,
                      estimatedMinutes: st.estimatedMinutes,
                    });
                  });

                  scheduleBreakdown.push({
                    id: `sb-${Date.now()}-${idx}-lunch`,
                    timeSlot: dayLunchTime,
                    activity: 'Mandatory Crew Lunch Break',
                    category: 'meal',
                    shotIds: [],
                    notes: 'Hot catering provided on-set (quiet hour for media offload)',
                    estimatedMinutes: 60,
                  });

                  scheduleBreakdown.push({
                    id: `sb-${Date.now()}-${idx}-wrap`,
                    timeSlot: `${dayWrapTime}`,
                    activity: 'Company Wrap & Final DIT Backup',
                    category: 'wrap',
                    shotIds: [],
                    notes: 'All media verified, equipment locked down, sound logs signed',
                    estimatedMinutes: 30,
                  });
                }

                return {
                  id: `day-${Date.now()}-${idx}`,
                  dayLabel: day.dayLabel || `Shoot Day ${idx + 1}`,
                  location: day.location || 'TBD — confirm with client',
                  callTime: dayCallTime,
                  breakfastTime: dayBreakfastTime,
                  lunchTime: dayLunchTime,
                  wrapTime: dayWrapTime,
                  scheduleBreakdown,
                  setups: parsedSetups,
                };
              }
            )
          : [],
        equipment: Array.isArray(parsed.equipment) ? parsed.equipment : [],
        propsAndUnits: Array.isArray(parsed.propsAndUnits)
          ? parsed.propsAndUnits.map(
              (p: { item?: string; quantity?: string; suppliedBy?: string }) => ({
                item: p.item || '',
                quantity: p.quantity || '1',
                suppliedBy: p.suppliedBy || 'Client',
              })
            )
          : [],
        crew: Array.isArray(parsed.crew) ? parsed.crew : [],
        risks: Array.isArray(parsed.risks) ? parsed.risks : [],
        clientQuestions: Array.isArray(parsed.clientQuestions) ? parsed.clientQuestions : [],
        hasGenerated: true,
        manuallyEdited: false,
      };

      const nextProject: PipelineProject = {
        ...project,
        shootPlan,
        approvals: {
          ...project.approvals,
          shootPlanApproved: false,
        },
        generationLog: [
          {
            id: `log-${Date.now()}`,
            timestamp: new Date().toISOString(),
            step: 'Shoot Plan',
            model: GEMINI_MODEL,
            prompt: `Generated Live & Hybrid Shoot Plan covering ${liveHybridShots.length} shot(s)`,
            seed: null,
            status: 'success',
          },
          ...project.generationLog,
        ],
      };

      const saved = await saveProject(nextProject);
      res.json({ project: saved });
    } catch (err) {
      res.status(500).json({
        error: formatGeminiError(err, 'Could not generate Shoot Plan.'),
      });
    }
  });

  // Google Drive Sync / Auto-Save Route (Uploads JSON, Shotlist PDF, and Storyboard Frames to Drive)
  router.post('/pipeline/drive-sync', async (req, res) => {
    try {
      const {
        projectId,
        googleDriveFolderUrls,
        googleDriveFolderUrl,
        destinationFolderId,
        destinationFolderUrl,
      } = req.body;
      const project = await getProject(projectId);
      if (!project) return res.status(404).json({ error: 'Project not found.' });

      if (destinationFolderId) {
        project.googleDriveDestinationFolderId = String(destinationFolderId).trim();
      }
      if (destinationFolderUrl) {
        project.googleDriveDestinationFolderUrl = String(destinationFolderUrl).trim();
      }

      const urls = Array.isArray(googleDriveFolderUrls)
        ? googleDriveFolderUrls.map((u: string) => String(u).trim()).filter(Boolean)
        : googleDriveFolderUrl
          ? [String(googleDriveFolderUrl).trim()]
          : project.googleDriveFolderUrls || [];

      project.googleDriveFolderUrls = urls;
      if (urls.length > 0) {
        project.googleDriveFolderUrl = urls[0];
      }

      const authHeader = req.headers.authorization;
      const token =
        authHeader && authHeader.startsWith('Bearer ')
          ? authHeader.slice('Bearer '.length).trim()
          : '';

      if (!token) {
        return res.status(401).json({
          error: 'Google Drive sign-in is required to save backups to Drive.',
        });
      }

      const syncResult = await syncProjectAssetsToDrive(
        project,
        token,
        project.googleDriveDestinationFolderUrl || urls[0]
      );

      project.googleDriveBackupFolderId = syncResult.backupFolderId;
      project.googleDriveBackupFolderUrl = syncResult.backupFolderUrl;
      if (!project.googleDriveDestinationFolderId) {
        project.googleDriveDestinationFolderId = syncResult.backupFolderId;
        project.googleDriveDestinationFolderUrl = syncResult.backupFolderUrl;
      }
      project.googleDriveSyncedAt = new Date().toISOString();
      project.googleDriveSyncStatus = 'synced';
      project.googleDriveSyncError = undefined;
      project.updatedAt = new Date().toISOString();

      await saveProject(project);
      res.json({
        success: true,
        syncedAt: project.googleDriveSyncedAt,
        backupFolderId: syncResult.backupFolderId,
        backupFolderUrl: syncResult.backupFolderUrl,
        uploadedFiles: syncResult.uploadedFiles,
      });
    } catch (err) {
      if (err instanceof DriveAuthError) {
        return res.status(401).json({ error: err.message });
      }
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Drive sync failed.',
      });
    }
  });

  // Google Drive Parse & Auto-Fill Route (Downloads real file contents + analyzes with Gemini)
  router.post('/pipeline/drive-parse', async (req, res) => {
    try {
      const { projectId, googleDriveFolderUrls, googleDriveFolderUrl, filesToAnalyze, lockedFiles } =
        req.body;

      const authHeader = req.headers.authorization;
      const token =
        authHeader && authHeader.startsWith('Bearer ')
          ? authHeader.slice('Bearer '.length).trim()
          : '';

      if (!token) {
        return res.status(401).json({
          error: 'Please sign in with Google first so the studio can read your Drive files.',
        });
      }

      const fileList: DriveFileDescriptor[] = Array.isArray(filesToAnalyze)
        ? filesToAnalyze
        : Array.isArray(lockedFiles)
          ? lockedFiles
          : [];

      if (fileList.length === 0) {
        return res.status(400).json({
          error:
            'No files were found or selected in the linked Google Drive folders. Verify the folder URL(s) and permissions.',
        });
      }

      const project =
        projectId && projectId !== 'new' ? await getProject(projectId) : null;
      if (projectId && projectId !== 'new' && !project) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      const urls = Array.isArray(googleDriveFolderUrls)
        ? googleDriveFolderUrls.map((u: string) => String(u).trim()).filter(Boolean)
        : googleDriveFolderUrl
          ? [String(googleDriveFolderUrl).trim()]
          : [];

      // Download and extract real contents from Google Docs, Sheets, Slides, PDFs, DOCX, PPTX, XLSX, TXT, Images
      const extracted = await downloadAndExtractDriveFiles(fileList.slice(0, 25), token);

      if (extracted.textSummaries.length === 0 && extracted.inlineParts.length === 0) {
        const detail =
          extracted.warnings.length > 0
            ? ` Details: ${extracted.warnings.slice(0, 3).join(' | ')}`
            : '';
        return res.status(400).json({
          error: `Could not read content from the selected Google Drive files.${detail}`,
          analyzedFiles: extracted.analyzedFiles,
          warnings: extracted.warnings,
        });
      }

      const ai = getGeminiClient();
      const parts: Array<{ inlineData?: { data: string; mimeType: string }; text?: string }> = [];

      // Attach PDFs and images directly for Gemini multimodal inspection
      for (const inline of extracted.inlineParts.slice(0, 14)) {
        parts.push({ text: `--- Attached File: ${inline.fileName} ---` });
        parts.push({
          inlineData: {
            mimeType: inline.mimeType,
            data: inline.data,
          },
        });
      }

      const prompt = `You are an expert Executive Producer & Brand Design Director at 52Launch Production Studio.
Analyze the ACTUAL contents of the attached Google Drive files, PDF style guides, brand books, and embedded graphics below and extract accurate commercial production intake AND complete visual style-guide details.

STRICT RULES:
- Extract information ONLY from the provided file contents, PDFs, spreadsheets, docs, and extracted graphics/images.
- NEVER invent, guess, or fabricate a fictional product or company.
- If a detail (such as shoot dates or budget) is not present in the linked files, write "Not specified in linked Drive files" rather than making anything up.
- For "provableClaims", extract specific factual product claims or specs explicitly stated in the documents.
- Carefully extract ALL brand/style guide specifications from PDFs or decks: exact #HEX color codes, color palette names, display & body font families/typography rules, photography lighting, lens/framing guidelines, color grading, logo usage rules, product appearance rules, and any explicitly forbidden visual elements.
- If one of the attached image filenames looks like a brand logo/wordmark/badge, put that exact filename in "styleGuide.logoFileName".

EXTRACTED DOCUMENT CONTENTS & ASSET CATALOG:
${extracted.textSummaries.join('\n\n')}

Return a JSON object with:
- "client": string
- "productName": string
- "productDescription": string (accurate 2-4 sentence summary)
- "provableClaims": string[]
- "audience": string
- "tone": string
- "clientMarketingIdeas": string
- "videosWanted": string
- "shootLocationDatesBudgetNotes": string
- "styleGuide": {
    "summary": string (brief 1-2 sentence summary of the brand/style guide rules),
    "palette": string (color palette description),
    "paletteHexes": string[] (exact #RRGGBB hex codes found in the PDFs/guides, e.g. ["#C6202F", "#111114"]),
    "typography": string (display/body fonts and type hierarchy rules),
    "lighting": string (photography/cinematography lighting rules),
    "lensAndFraming": string (composition, lens, aspect ratio or framing guidelines),
    "grade": string (color grading / finish guidance),
    "visualStyleNotes": string (additional layout, graphic motif, or aesthetic rules from the guide),
    "productVisualRules": string (how product/packaging/logo must appear on camera),
    "brandLogoNotes": string (logo clearspace, color variants, placement rules),
    "bannedElements": string[] (do-nots / clichés / forbidden graphics from the guide),
    "logoFileName": string (filename of extracted graphic most likely to be the main brand logo, or "")
  }`;

      parts.push({ text: prompt });

      const response = await withGeminiRetry(() =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: { parts },
          config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              client: { type: Type.STRING },
              productName: { type: Type.STRING },
              productDescription: { type: Type.STRING },
              provableClaims: { type: Type.ARRAY, items: { type: Type.STRING } },
              audience: { type: Type.STRING },
              tone: { type: Type.STRING },
              clientMarketingIdeas: { type: Type.STRING },
              videosWanted: { type: Type.STRING },
              shootLocationDatesBudgetNotes: { type: Type.STRING },
              styleGuide: {
                type: Type.OBJECT,
                properties: {
                  summary: { type: Type.STRING },
                  palette: { type: Type.STRING },
                  paletteHexes: { type: Type.ARRAY, items: { type: Type.STRING } },
                  typography: { type: Type.STRING },
                  lighting: { type: Type.STRING },
                  lensAndFraming: { type: Type.STRING },
                  grade: { type: Type.STRING },
                  visualStyleNotes: { type: Type.STRING },
                  productVisualRules: { type: Type.STRING },
                  brandLogoNotes: { type: Type.STRING },
                  bannedElements: { type: Type.ARRAY, items: { type: Type.STRING } },
                  logoFileName: { type: Type.STRING },
                },
              },
            },
            required: [
              'client',
              'productName',
              'productDescription',
              'provableClaims',
              'audience',
              'tone',
              'clientMarketingIdeas',
              'videosWanted',
              'shootLocationDatesBudgetNotes',
            ],
          },
        },
        })
      );

      const parsedRaw = JSON.parse((response.text ?? '{}').trim());
      const rawGuide = parsedRaw.styleGuide || {};
      const extractedStyleGuide: ExtractedStyleGuide = {
        summary: String(rawGuide.summary || '').trim(),
        palette: String(rawGuide.palette || '').trim(),
        paletteHexes: Array.isArray(rawGuide.paletteHexes)
          ? rawGuide.paletteHexes
              .map((h: string) => String(h).trim())
              .filter((h: string) => /^#?[0-9a-fA-F]{3,8}$/.test(h))
              .map((h: string) => (h.startsWith('#') ? h.toUpperCase() : `#${h.toUpperCase()}`))
          : [],
        typography: String(rawGuide.typography || '').trim(),
        lighting: String(rawGuide.lighting || '').trim(),
        lensAndFraming: String(rawGuide.lensAndFraming || '').trim(),
        grade: String(rawGuide.grade || '').trim(),
        visualStyleNotes: String(rawGuide.visualStyleNotes || '').trim(),
        productVisualRules: String(rawGuide.productVisualRules || '').trim(),
        brandLogoNotes: String(rawGuide.brandLogoNotes || '').trim(),
        bannedElements: Array.isArray(rawGuide.bannedElements)
          ? rawGuide.bannedElements.map((b: string) => String(b).trim()).filter(Boolean)
          : [],
        sourceFileNames: fileList.map((f) => f.name).filter(Boolean),
      };
      const parsed = {
        client: parsedRaw.client || '',
        productName: parsedRaw.productName || '',
        productDescription: parsedRaw.productDescription || '',
        provableClaims: Array.isArray(parsedRaw.provableClaims) ? parsedRaw.provableClaims : [],
        audience: parsedRaw.audience || '',
        tone: parsedRaw.tone || '',
        clientMarketingIdeas: parsedRaw.clientMarketingIdeas || '',
        videosWanted: parsedRaw.videosWanted || '',
        shootLocationDatesBudgetNotes: parsedRaw.shootLocationDatesBudgetNotes || '',
      };

      // Import extracted images & PDF embedded graphics (up to 16)
      const importedPhotos: Array<{ id: string; url: string; caption: string }> = [];
      const importedPhotoDataUrls: Array<{ dataUrl: string; caption: string }> = [];

      for (const img of extracted.imageFiles.slice(0, 16)) {
        if (project) {
          const alreadyImported = project.product.photos.some(
            (p) => p.caption === img.fileName
          );
          if (!alreadyImported) {
            const ext = img.mimeType.includes('png')
              ? 'png'
              : img.mimeType.includes('webp')
                ? 'webp'
                : 'jpg';
            const saved = await saveBufferAsset(
              project.id,
              Buffer.from(img.data, 'base64'),
              'product',
              ext
            );
            const photoEntry = {
              id: `photo-drive-${img.fileId.slice(0, 8)}-${Date.now()}`,
              url: saved.url,
              caption: img.fileName,
            };
            importedPhotos.push(photoEntry);
          }
        } else {
          importedPhotoDataUrls.push({
            dataUrl: `data:${img.mimeType};base64,${img.data}`,
            caption: img.fileName,
          });
        }
      }

      // Detect likely brand logo among extracted graphics
      const logoHintName = String(rawGuide.logoFileName || '').toLowerCase();
      let suggestedLogoUrl: string | undefined;
      let suggestedLogoDataUrl: string | undefined;
      if (project) {
        const allPool = [...project.product.photos, ...importedPhotos];
        const logoCandidate =
          allPool.find((p) => logoHintName && p.caption.toLowerCase().includes(logoHintName)) ||
          allPool.find((p) => /logo|wordmark|brandmark|badge|emblem/i.test(p.caption));
        if (logoCandidate) {
          suggestedLogoUrl = logoCandidate.url;
        }
      } else {
        const logoCandidateData =
          importedPhotoDataUrls.find(
            (p) => logoHintName && p.caption.toLowerCase().includes(logoHintName)
          ) ||
          importedPhotoDataUrls.find((p) =>
            /logo|wordmark|brandmark|badge|emblem/i.test(p.caption)
          );
        if (logoCandidateData) {
          suggestedLogoDataUrl = logoCandidateData.dataUrl;
        }
      }

      // Save or stage the source PDFs (Brand Guides / Decks)
      const newGuideDocs: BrandGuideDocument[] = [];
      const stagedGuidePdfs: Array<{ name: string; dataUrl: string; graphicCount?: number }> = [];
      const nowIso = new Date().toISOString();

      for (const pdf of extracted.pdfBuffers.slice(0, 6)) {
        const buf = Buffer.from(pdf.data, 'base64');
        const gCount = extracted.imageFiles.filter((img) =>
          img.fileName.toLowerCase().startsWith(
            pdf.fileName.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 32).toLowerCase()
          )
        ).length;
        if (project) {
          const existingDoc = (project.brandGuideDocuments || []).some(
            (d) => d.name === pdf.fileName
          );
          if (!existingDoc) {
            const savedPdf = await saveBufferAsset(project.id, buf, 'guide', 'pdf');
            newGuideDocs.push({
              id: `guide-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name: pdf.fileName,
              url: savedPdf.url,
              mimeType: 'application/pdf',
              extractedAt: nowIso,
              graphicCount: gCount,
            });
          }
        } else if (buf.length <= 14 * 1024 * 1024) {
          stagedGuidePdfs.push({
            name: pdf.fileName,
            dataUrl: `data:application/pdf;base64,${pdf.data}`,
            graphicCount: gCount,
          });
        }
      }

      if (project) {
        project.googleDriveFolderUrls = urls;
        if (urls.length > 0) project.googleDriveFolderUrl = urls[0];
        if (importedPhotos.length > 0) {
          project.product.photos = [...project.product.photos, ...importedPhotos];
        }
        if (newGuideDocs.length > 0) {
          project.brandGuideDocuments = [
            ...(project.brandGuideDocuments || []),
            ...newGuideDocs,
          ];
        }
        project.extractedStyleGuide = extractedStyleGuide;

        // Pre-fill empty Brand Bible fields so extracted PDF info carries directly into Step 2
        const paletteText = [
          extractedStyleGuide.palette,
          extractedStyleGuide.paletteHexes.length > 0
            ? `Hexes: ${extractedStyleGuide.paletteHexes.join(', ')}`
            : '',
        ]
          .filter(Boolean)
          .join(' — ');
        if (!project.brandBible.visualStyle.palette && paletteText) {
          project.brandBible.visualStyle.palette = paletteText;
        }
        if (!project.brandBible.visualStyle.typography && extractedStyleGuide.typography) {
          project.brandBible.visualStyle.typography = extractedStyleGuide.typography;
        }
        if (!project.brandBible.visualStyle.lighting && extractedStyleGuide.lighting) {
          project.brandBible.visualStyle.lighting = extractedStyleGuide.lighting;
        }
        if (!project.brandBible.visualStyle.lensAndFraming && extractedStyleGuide.lensAndFraming) {
          project.brandBible.visualStyle.lensAndFraming = extractedStyleGuide.lensAndFraming;
        }
        if (!project.brandBible.visualStyle.grade && extractedStyleGuide.grade) {
          project.brandBible.visualStyle.grade = extractedStyleGuide.grade;
        }
        if (!project.brandBible.productRules && extractedStyleGuide.productVisualRules) {
          project.brandBible.productRules = extractedStyleGuide.productVisualRules;
        }
        if (
          project.brandBible.bannedList.length === 0 &&
          extractedStyleGuide.bannedElements.length > 0
        ) {
          project.brandBible.bannedList = extractedStyleGuide.bannedElements;
        }
        if (!project.brandBible.brandLogoUrl && suggestedLogoUrl) {
          project.brandBible.brandLogoUrl = suggestedLogoUrl;
          project.brandBible.brandLogoCaption =
            extractedStyleGuide.brandLogoNotes || 'Extracted from brand guide';
        }

        project.lockedDriveReferences = fileList.map((f) => ({
          fileId: f.id,
          name: f.name,
          mimeType: f.mimeType,
          webViewLink: f.webViewLink,
          folderUrl: f.folderUrl,
          selected: true,
        }));
        project.googleDriveSyncedAt = nowIso;
        project.updatedAt = nowIso;
        await saveProject(project);
      }

      res.json({
        success: true,
        parsed,
        styleGuide: extractedStyleGuide,
        brandGuideDocuments: project?.brandGuideDocuments || newGuideDocs,
        stagedGuidePdfs,
        suggestedLogoUrl,
        suggestedLogoDataUrl,
        extractedGraphicCount: extracted.imageFiles.length,
        analyzedFiles: extracted.analyzedFiles,
        importedPhotos,
        importedPhotoDataUrls,
        warnings: extracted.warnings,
      });
    } catch (err) {
      if (err instanceof DriveAuthError) {
        return res.status(err.status).json({ error: err.message });
      }
      res.status(500).json({
        error: formatGeminiError(err, 'Could not parse Google Drive files.'),
      });
    }
  });

  // Parse local uploaded PDF style guides / brand books (extracts structured info + embedded graphics)
  router.post('/pipeline/parse-local-guides', async (req, res) => {
    try {
      const { projectId, files } = req.body as {
        projectId?: string;
        files?: Array<{ name: string; dataUrl: string }>;
      };

      const incoming = Array.isArray(files) ? files.slice(0, 6) : [];
      if (incoming.length === 0) {
        return res.status(400).json({ error: 'Upload at least one PDF style or brand guide.' });
      }

      const project =
        projectId && projectId !== 'new' ? await getProject(projectId) : null;
      if (projectId && projectId !== 'new' && !project) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      const ai = getGeminiClient();
      const parts: Array<{ inlineData?: { data: string; mimeType: string }; text?: string }> = [];
      const extractedGraphics: Array<{
        id: string;
        fileName: string;
        mimeType: string;
        ext: 'jpg' | 'png';
        data: string;
        sourcePdf: string;
      }> = [];
      const validPdfs: Array<{ name: string; dataUrl: string; buffer: Buffer; graphicCount: number }> = [];
      const analyzedFiles: Array<{ name: string; status: string }> = [];
      const warnings: string[] = [];

      for (const item of incoming) {
        const rawName = String(item?.name || 'Brand Guide.pdf').trim();
        const dataUrl = String(item?.dataUrl || '');
        const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) {
          warnings.push(`Skipped "${rawName}" (invalid PDF encoding).`);
          continue;
        }
        const pdfBuf = Buffer.from(match[2], 'base64');
        if (pdfBuf.length > 14 * 1024 * 1024) {
          warnings.push(`Skipped "${rawName}" because it exceeds 14 MB.`);
          continue;
        }

        const pdfName = rawName.toLowerCase().endsWith('.pdf') ? rawName : `${rawName}.pdf`;
        parts.push({ text: `--- Uploaded PDF Guide: ${pdfName} ---` });
        parts.push({
          inlineData: {
            mimeType: 'application/pdf',
            data: match[2],
          },
        });

        let gCount = 0;
        try {
          const embedded = extractImagesFromPdfBuffer(pdfBuf, pdfName, 10);
          gCount = embedded.length;
          for (const g of embedded) {
            if (extractedGraphics.length >= 16) break;
            const b64 = g.buffer.toString('base64');
            extractedGraphics.push({
              id: g.id,
              fileName: g.name,
              mimeType: g.mimeType,
              ext: g.ext,
              data: b64,
              sourcePdf: pdfName,
            });
            parts.push({ text: `--- Embedded Graphic from ${pdfName}: ${g.name} ---` });
            parts.push({
              inlineData: {
                mimeType: g.mimeType,
                data: b64,
              },
            });
          }
        } catch {
          // Non-fatal: Gemini still reads the full PDF inline
        }

        validPdfs.push({ name: pdfName, dataUrl, buffer: pdfBuf, graphicCount: gCount });
        analyzedFiles.push({
          name: pdfName,
          status:
            gCount > 0
              ? `Analyzed PDF (${gCount} extracted graphic${gCount === 1 ? '' : 's'})`
              : 'Analyzed PDF document',
        });
      }

      if (validPdfs.length === 0) {
        return res.status(400).json({
          error: warnings[0] || 'None of the uploaded PDFs could be processed.',
          warnings,
        });
      }

      const prompt = `You are an expert Executive Producer & Brand Design Director at 52Launch Production Studio.
Analyze the attached PDF brand guide(s) / style guide(s) and extracted embedded graphics. Extract BOTH commercial intake fields AND complete visual style-guide details.

STRICT RULES:
- Extract information ONLY from the attached PDFs and embedded images.
- NEVER fabricate details not supported by the PDFs. Leave unmentioned intake fields empty string "" or state "Not specified in uploaded PDF".
- Extract ALL exact #RRGGBB hex codes, typography families/weights, lighting, lens/framing, grade, logo rules, product rules, and banned visual elements.
- If one of the embedded graphic filenames looks like the brand logo/wordmark/badge, put that exact filename in "styleGuide.logoFileName".

Return JSON with:
- "client": string
- "productName": string
- "productDescription": string
- "provableClaims": string[]
- "audience": string
- "tone": string
- "clientMarketingIdeas": string
- "videosWanted": string
- "shootLocationDatesBudgetNotes": string
- "styleGuide": {
    "summary": string,
    "palette": string,
    "paletteHexes": string[],
    "typography": string,
    "lighting": string,
    "lensAndFraming": string,
    "grade": string,
    "visualStyleNotes": string,
    "productVisualRules": string,
    "brandLogoNotes": string,
    "bannedElements": string[],
    "logoFileName": string
  }`;

      parts.push({ text: prompt });

      const response = await withGeminiRetry(() =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: { parts },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                client: { type: Type.STRING },
                productName: { type: Type.STRING },
                productDescription: { type: Type.STRING },
                provableClaims: { type: Type.ARRAY, items: { type: Type.STRING } },
                audience: { type: Type.STRING },
                tone: { type: Type.STRING },
                clientMarketingIdeas: { type: Type.STRING },
                videosWanted: { type: Type.STRING },
                shootLocationDatesBudgetNotes: { type: Type.STRING },
                styleGuide: {
                  type: Type.OBJECT,
                  properties: {
                    summary: { type: Type.STRING },
                    palette: { type: Type.STRING },
                    paletteHexes: { type: Type.ARRAY, items: { type: Type.STRING } },
                    typography: { type: Type.STRING },
                    lighting: { type: Type.STRING },
                    lensAndFraming: { type: Type.STRING },
                    grade: { type: Type.STRING },
                    visualStyleNotes: { type: Type.STRING },
                    productVisualRules: { type: Type.STRING },
                    brandLogoNotes: { type: Type.STRING },
                    bannedElements: { type: Type.ARRAY, items: { type: Type.STRING } },
                    logoFileName: { type: Type.STRING },
                  },
                },
              },
              required: [
                'client',
                'productName',
                'productDescription',
                'provableClaims',
                'audience',
                'tone',
                'clientMarketingIdeas',
                'videosWanted',
                'shootLocationDatesBudgetNotes',
              ],
            },
          },
        })
      );

      const parsedRaw = JSON.parse((response.text ?? '{}').trim());
      const rawGuide = parsedRaw.styleGuide || {};
      const extractedStyleGuide: ExtractedStyleGuide = {
        summary: String(rawGuide.summary || '').trim(),
        palette: String(rawGuide.palette || '').trim(),
        paletteHexes: Array.isArray(rawGuide.paletteHexes)
          ? rawGuide.paletteHexes
              .map((h: string) => String(h).trim())
              .filter((h: string) => /^#?[0-9a-fA-F]{3,8}$/.test(h))
              .map((h: string) => (h.startsWith('#') ? h.toUpperCase() : `#${h.toUpperCase()}`))
          : [],
        typography: String(rawGuide.typography || '').trim(),
        lighting: String(rawGuide.lighting || '').trim(),
        lensAndFraming: String(rawGuide.lensAndFraming || '').trim(),
        grade: String(rawGuide.grade || '').trim(),
        visualStyleNotes: String(rawGuide.visualStyleNotes || '').trim(),
        productVisualRules: String(rawGuide.productVisualRules || '').trim(),
        brandLogoNotes: String(rawGuide.brandLogoNotes || '').trim(),
        bannedElements: Array.isArray(rawGuide.bannedElements)
          ? rawGuide.bannedElements.map((b: string) => String(b).trim()).filter(Boolean)
          : [],
        sourceFileNames: validPdfs.map((p) => p.name),
      };

      const parsed = {
        client: parsedRaw.client || '',
        productName: parsedRaw.productName || '',
        productDescription: parsedRaw.productDescription || '',
        provableClaims: Array.isArray(parsedRaw.provableClaims) ? parsedRaw.provableClaims : [],
        audience: parsedRaw.audience || '',
        tone: parsedRaw.tone || '',
        clientMarketingIdeas: parsedRaw.clientMarketingIdeas || '',
        videosWanted: parsedRaw.videosWanted || '',
        shootLocationDatesBudgetNotes: parsedRaw.shootLocationDatesBudgetNotes || '',
      };

      const importedPhotos: Array<{ id: string; url: string; caption: string }> = [];
      const importedPhotoDataUrls: Array<{ dataUrl: string; caption: string }> = [];
      const newGuideDocs: BrandGuideDocument[] = [];
      const stagedGuidePdfs: Array<{ name: string; dataUrl: string; graphicCount?: number }> = [];
      const nowIso = new Date().toISOString();

      for (const g of extractedGraphics) {
        if (project) {
          const already = project.product.photos.some((p) => p.caption === g.fileName);
          if (!already) {
            const savedImg = await saveBufferAsset(
              project.id,
              Buffer.from(g.data, 'base64'),
              'product',
              g.ext
            );
            importedPhotos.push({
              id: `photo-pdf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              url: savedImg.url,
              caption: g.fileName,
            });
          }
        } else {
          importedPhotoDataUrls.push({
            dataUrl: `data:${g.mimeType};base64,${g.data}`,
            caption: g.fileName,
          });
        }
      }

      const logoHintName = String(rawGuide.logoFileName || '').toLowerCase();
      let suggestedLogoUrl: string | undefined;
      let suggestedLogoDataUrl: string | undefined;

      if (project) {
        const allPool = [...project.product.photos, ...importedPhotos];
        const logoHit =
          allPool.find((p) => logoHintName && p.caption.toLowerCase().includes(logoHintName)) ||
          allPool.find((p) => /logo|wordmark|brandmark|badge|emblem/i.test(p.caption));
        if (logoHit) suggestedLogoUrl = logoHit.url;

        for (const p of validPdfs) {
          const savedPdf = await saveBufferAsset(project.id, p.buffer, 'guide', 'pdf');
          newGuideDocs.push({
            id: `guide-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: p.name,
            url: savedPdf.url,
            mimeType: 'application/pdf',
            extractedAt: nowIso,
            graphicCount: p.graphicCount,
          });
        }

        if (importedPhotos.length > 0) {
          project.product.photos = [...project.product.photos, ...importedPhotos];
        }
        if (newGuideDocs.length > 0) {
          project.brandGuideDocuments = [
            ...(project.brandGuideDocuments || []),
            ...newGuideDocs,
          ];
        }
        project.extractedStyleGuide = extractedStyleGuide;

        const paletteText = [
          extractedStyleGuide.palette,
          extractedStyleGuide.paletteHexes.length > 0
            ? `Hexes: ${extractedStyleGuide.paletteHexes.join(', ')}`
            : '',
        ]
          .filter(Boolean)
          .join(' — ');
        if (!project.brandBible.visualStyle.palette && paletteText) {
          project.brandBible.visualStyle.palette = paletteText;
        }
        if (!project.brandBible.visualStyle.typography && extractedStyleGuide.typography) {
          project.brandBible.visualStyle.typography = extractedStyleGuide.typography;
        }
        if (!project.brandBible.visualStyle.lighting && extractedStyleGuide.lighting) {
          project.brandBible.visualStyle.lighting = extractedStyleGuide.lighting;
        }
        if (!project.brandBible.visualStyle.lensAndFraming && extractedStyleGuide.lensAndFraming) {
          project.brandBible.visualStyle.lensAndFraming = extractedStyleGuide.lensAndFraming;
        }
        if (!project.brandBible.visualStyle.grade && extractedStyleGuide.grade) {
          project.brandBible.visualStyle.grade = extractedStyleGuide.grade;
        }
        if (!project.brandBible.productRules && extractedStyleGuide.productVisualRules) {
          project.brandBible.productRules = extractedStyleGuide.productVisualRules;
        }
        if (
          project.brandBible.bannedList.length === 0 &&
          extractedStyleGuide.bannedElements.length > 0
        ) {
          project.brandBible.bannedList = extractedStyleGuide.bannedElements;
        }
        if (!project.brandBible.brandLogoUrl && suggestedLogoUrl) {
          project.brandBible.brandLogoUrl = suggestedLogoUrl;
          project.brandBible.brandLogoCaption =
            extractedStyleGuide.brandLogoNotes || 'Extracted from brand guide PDF';
        }
        project.updatedAt = nowIso;
        await saveProject(project);
      } else {
        const logoHitData =
          importedPhotoDataUrls.find(
            (p) => logoHintName && p.caption.toLowerCase().includes(logoHintName)
          ) ||
          importedPhotoDataUrls.find((p) =>
            /logo|wordmark|brandmark|badge|emblem/i.test(p.caption)
          );
        if (logoHitData) suggestedLogoDataUrl = logoHitData.dataUrl;

        for (const p of validPdfs) {
          stagedGuidePdfs.push({
            name: p.name,
            dataUrl: p.dataUrl,
            graphicCount: p.graphicCount,
          });
        }
      }

      res.json({
        success: true,
        parsed,
        styleGuide: extractedStyleGuide,
        brandGuideDocuments: project?.brandGuideDocuments || newGuideDocs,
        stagedGuidePdfs,
        suggestedLogoUrl,
        suggestedLogoDataUrl,
        extractedGraphicCount: extractedGraphics.length,
        analyzedFiles,
        importedPhotos,
        importedPhotoDataUrls,
        warnings,
      });
    } catch (err) {
      res.status(500).json({
        error: formatGeminiError(err, 'Could not parse uploaded PDF style guide.'),
      });
    }
  });

  // Import specific Google Drive assets (images, videos, audio) into any project step
  router.post('/pipeline/drive-import-assets', async (req, res) => {
    try {
      const { projectId, files, prefix, uploadToFal } = req.body as {
        projectId: string;
        files?: DriveFileDescriptor[];
        prefix?: string;
        uploadToFal?: boolean;
      };

      const authHeader = req.headers.authorization;
      const token =
        authHeader && authHeader.startsWith('Bearer ')
          ? authHeader.slice(7).trim()
          : '';

      if (!token) {
        return res.status(401).json({
          error: 'Please sign in with Google first to import files from Google Drive.',
        });
      }

      const fileList = Array.isArray(files) ? files.slice(0, 15) : [];
      if (fileList.length === 0) {
        return res.status(400).json({ error: 'Select at least one Google Drive file to import.' });
      }

      const isNewUnsaved = !projectId || projectId === 'new';
      if (!isNewUnsaved) {
        const existing = await getProject(projectId);
        if (!existing) {
          return res.status(404).json({ error: 'Project not found.' });
        }
      }

      const assets: Array<{
        fileId: string;
        name: string;
        mimeType: string;
        url?: string;
        filename?: string;
        falUrl?: string | null;
        dataUrl?: string;
      }> = [];
      const warnings: string[] = [];

      const falKey = process.env.FAL_KEY;
      const canUploadFal = Boolean(uploadToFal && falKey && falKey.trim() && falKey !== 'MY_FAL_KEY');
      if (canUploadFal) {
        fal.config({ credentials: falKey });
      }

      for (const file of fileList) {
        try {
          const downloaded = await downloadDriveBinaryAsset(file, token);
          if (isNewUnsaved) {
            if (downloaded.buffer.length > 18 * 1024 * 1024) {
              warnings.push(
                `"${downloaded.fileName}" is too large to stage before project creation (${(
                  downloaded.buffer.length /
                  (1024 * 1024)
                ).toFixed(1)} MB). Save the project first, then import it.`
              );
              continue;
            }
            assets.push({
              fileId: file.id,
              name: downloaded.fileName,
              mimeType: downloaded.mimeType,
              dataUrl: `data:${downloaded.mimeType};base64,${downloaded.buffer.toString('base64')}`,
            });
          } else {
            const saved = await saveBufferAsset(
              projectId,
              downloaded.buffer,
              prefix || 'drive',
              downloaded.ext
            );
            let falUrl: string | null = null;
            if (canUploadFal) {
              try {
                falUrl = await uploadMediaRefToFal(projectId, saved.url);
              } catch {
                // Non-fatal: local project asset URL is still saved
              }
            }
            assets.push({
              fileId: file.id,
              name: downloaded.fileName,
              mimeType: downloaded.mimeType,
              url: saved.url,
              filename: saved.filename,
              falUrl,
            });
          }
        } catch (err) {
          if (err instanceof DriveAuthError) throw err;
          warnings.push(
            err instanceof Error
              ? err.message
              : `Could not import "${file.name || file.id}".`
          );
        }
      }

      if (assets.length === 0) {
        return res.status(400).json({
          error: warnings[0] || 'Could not import any of the selected Google Drive files.',
          warnings,
        });
      }

      res.json({
        success: true,
        assets,
        warnings,
      });
    } catch (err) {
      if (err instanceof DriveAuthError) {
        return res.status(err.status).json({ error: err.message });
      }
      res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Could not import assets from Google Drive.',
      });
    }
  });

  return router;
}
