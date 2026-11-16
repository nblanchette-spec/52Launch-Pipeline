import { Router } from 'express';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';
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
  ExternalUpscaleItem,
  FrameCheckResult,
  PipelineProject,
  PipelineShot,
  ShootPlan,
  UpscaleDetails,
  VideoModelOption,
  VoScriptLine,
  VoStudioSettings,
} from '../src/types/pipeline';
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

const GEMINI_MODEL = 'gemini-4-hydrogen';

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
      const { client, product, intake, initialPhotoDataUrls } = req.body;
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
        brandBible: {
          positioning: '',
          audience: '',
          toneOfVoice: { adjectives: [], guidance: '' },
          visualStyle: { palette: '', lighting: '', lensAndFraming: '', grade: '' },
          characters: [],
          productRules: '',
          bannedList: [],
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
        prefix === 'frame' ? 'frame' : 'product'
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

      const prompt = `You are the brand strategist for 52Launch.
From the client intake and the attached real product photos produce a complete Brand Bible:
- positioning: one sharp sentence
- audience: clear description of who this is for
- toneOfVoice: 3-5 adjectives plus clear guidance
- visualStyle: palette, lighting, lensAndFraming, grade
- characters: array of key on-screen people (name plus a FIXED short visual descriptor that will be pasted word for word into every prompt)
- productRules: how the product must look, based ONLY on the intake and photos, never invented features
- bannedList: specific visual tropes, clichés, or forbidden elements
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
- Attached Product Photos Count: ${project.product.photos.length}`;

      parts.push({ text: prompt });

      const response = await ai.models.generateContent({
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
                  lighting: { type: Type.STRING },
                  lensAndFraming: { type: Type.STRING },
                  grade: { type: Type.STRING },
                },
                required: ['palette', 'lighting', 'lensAndFraming', 'grade'],
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
      });

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
          lighting: parsed.visualStyle?.lighting || '',
          lensAndFraming: parsed.visualStyle?.lensAndFraming || '',
          grade: parsed.visualStyle?.grade || '',
        },
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
- Banned List: ${project.brandBible.bannedList.join(', ')}`;

      const response = await ai.models.generateContent({
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
      });

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
- model: strictly "flux3", "seedance", or "none" ("none" for live shots)
- productInFrame: true or false
- framePrompt: a plain-English still image prompt, REQUIRED for EVERY shot including live ones (where it serves as a reference frame for the crew); repeat the brand bible character descriptors WORD FOR WORD whenever a character appears; describe composition, lighting and lens; wherever the real product appears write "[PRODUCT PLACEHOLDER: composite real product here]" instead of describing the product's look
- shootDirection: for "live" and "hybrid" shots, specify camera position and movement, lens, lighting, talent and product handling, props; leave empty string "" for "ai_video" shots
- voLine: spoken VO line or empty string ""
- continuityNotes: continuity notes across cuts
- chainFrom: shot ID this continues from (e.g. "S01"), or "none"

ROUTING & MODEL RULES:
- Product hero shots and close-ups of the real product's features and function default to "live" or "hybrid".
- Environments, mood, B-roll and lifestyle context default to "ai_video".
- Use "flux3" for shots that benefit from native audio or longer duration; use "seedance" for tight motion-controlled shots.
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
- Banned List: ${project.brandBible.bannedList.join(', ')}

APPROVED CREATIVE BRIEF:
- Objective: ${project.creativeBrief.objective}
- Key Message: ${project.creativeBrief.keyMessage}
- Recommended Concept: ${project.creativeBrief.recommendedConcept.title} — ${project.creativeBrief.recommendedConcept.reason}
- Deliverables: ${project.creativeBrief.deliverables.join(', ')}
- VO Direction: ${JSON.stringify(project.creativeBrief.voDirection)}`;

      const response = await ai.models.generateContent({
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
      });

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
              : s.model === 'flux3' || s.model === 'seedance'
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

      const response = await ai.models.generateContent({
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
      });

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

  // STEP 7A: Generate Video Prompts & Negative Prompts (Gemini 2.5 Pro)
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

      for (const shot of targetShots) {
        const parts: Array<{
          inlineData?: { data: string; mimeType: string };
          text?: string;
        }> = [];
        if (shot.frameImageUrl) {
          const inline = await readAssetAsInlineData(project.id, shot.frameImageUrl);
          if (inline) parts.push({ inlineData: inline });
        }

        const prompt = `You are a Commercial Video Prompt Director for 52Launch.
Write the video prompt and negative prompt for shot ${shot.id} using the attached approved start frame.

MODEL TARGET: ${shot.model === 'flux3' ? 'Flux 3' : 'Seedance'}
DURATION: ${shot.durationSec} seconds
SCENE: ${shot.scene}
HAS VOICEOVER LINE: ${shot.voLine ? `YES ("${shot.voLine}")` : 'NO'}
PRODUCT IN FRAME: ${shot.productInFrame ? 'YES' : 'NO'}
BRAND BIBLE BANNED LIST: ${project.brandBible.bannedList.join(', ') || 'None'}

STRICT RULES:
1. Describe MOTION, CAMERA, and TIMING only. Do NOT re-describe how things look, except add ONE clean line preserving the start frame's framing, wardrobe, and lighting.
2. ${
          shot.model === 'flux3'
            ? `Flux 3 generates native audio: describe realistic ambient sound matching the scene${
                shot.voLine
                  ? ', and explicitly state "no dialogue" because voiceover is recorded separately.'
                  : '.'
              }`
            : 'Seedance: keep it concise — one clean camera move and one clear subject action.'
        }
3. One action per shot. Never add characters, props, or claims not already in the shot.
4. For negativePrompt: list common video artifacts (warping, extra limbs, text glitches, logo distortion, flickering, morphing faces) PLUS every item from the Brand Bible banned list.`;

        parts.push({ text: prompt });

        const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: { parts },
          config: {
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
        });

        const parsed = JSON.parse((response.text ?? '{}').trim());
        updatedMap.set(shot.id, {
          videoPrompt: parsed.videoPrompt || '',
          negativePrompt: parsed.negativePrompt || '',
        });
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

    let chosenEndpoint = String(modelId || 'seedance-2.5');
    try {
      fal.config({ credentials: falKey });

      const built = await buildFalVideoRequest({
        projectId: project.id,
        modelId: modelId || (shot.model === 'flux3' ? 'flux-3' : 'seedance-2.5'),
        workflowMode: workflowMode || 'image_to_video',
        prompt: prompt || '',
        aspectRatio: aspectRatio || '16:9',
        duration: Number(duration) || shot.durationSec || 5,
        qualityTier: qualityTier || 'draft',
        resolution,
        nativeAudio: nativeAudio !== false,
        safetyTolerance: typeof safetyTolerance === 'number' ? safetyTolerance : 2,
        enableSafetyChecker: enableSafetyChecker ?? false,
        seed: typeof seed === 'number' ? seed : Math.floor(Math.random() * 1000000),
        startFrameUrl: startFrameUrl ?? shot.frameImageUrl,
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
      const result = await fal.subscribe(built.endpointId, {
        input: built.input,
        logs: false,
      });

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
          : modelId === 'flux-3' || modelId === 'kling-4.0' || modelId === 'luma-ray-3.2'
            ? null
            : typeof seed === 'number'
              ? seed
              : null;
      const draftCacheUrl = data?.draft_cache?.url ?? null;

      const mappedShotModel: VideoModelOption =
        modelId === 'flux-3'
          ? 'flux3'
          : modelId === 'kling-4.0'
            ? 'kling'
            : modelId === 'wan-3.0-prime'
              ? 'wan'
              : modelId === 'luma-ray-3.2'
                ? 'luma'
                : 'seedance';

      const nextProject: PipelineProject = {
        ...project,
        shots: project.shots.map((s) =>
          s.id === shot.id
            ? {
                ...s,
                videoPrompt: prompt?.trim() || s.videoPrompt,
                durationSec: built.clampedDuration,
                model: mappedShotModel,
                videoUrl: savedVideo.url,
                videoSeed: finalSeed,
                videoResolution: built.resolvedResolution,
                draftCacheUrl,
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
            prompt: prompt?.trim() || workflowMode,
            seed: finalSeed,
            status: 'success',
            notes: `${built.resolvedResolution} (${workflowMode})`,
          },
          ...project.generationLog,
        ],
      };

      const saved = await saveProject(nextProject);
      res.json({
        project: saved,
        videoUrl: savedVideo.url,
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
              : 'seedance-2.5';
    let chosenEndpoint: string = modelId;

    try {
      fal.config({ credentials: falKey });

      const built = await buildFalVideoRequest({
        projectId: project.id,
        modelId,
        workflowMode: 'image_to_video',
        prompt: shot.videoPrompt,
        aspectRatio: '16:9',
        duration: shot.durationSec,
        qualityTier: 'final',
        nativeAudio: true,
        safetyTolerance: 2,
        seed: shot.videoSeed ?? Math.floor(Math.random() * 1000000),
        startFrameUrl: chainedLastFrameDataUrl || shot.frameImageUrl,
      });

      chosenEndpoint = built.endpointId;
      const result = await fal.subscribe(built.endpointId, {
        input: built.input,
        logs: false,
      });

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

      const nextProject: PipelineProject = {
        ...project,
        shots: project.shots.map((s) =>
          s.id === shot.id
            ? {
                ...s,
                videoUrl: savedVideo.url,
                videoSeed: seed,
                videoResolution: built.resolvedResolution,
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

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
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
      });

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
        ttsModel: 'gemini-3.8-flash-tts',
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
        model: ttsModel ?? project.voSettings?.ttsModel ?? 'gemini-3.8-flash-tts',
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

      const response = await ai.models.generateContent({
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
                speaker: { type: Type.STRING },
                direction: { type: Type.STRING },
                line: { type: Type.STRING },
              },
              required: ['id', 'speaker', 'direction', 'line'],
            },
          },
        },
      });

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
          ttsModel: 'gemini-3.8-flash-tts',
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
1. Group shots efficiently into "shootDays" and within each day into logical "setups" grouped by LOCATION and LIGHTING (so the crew doesn't relight back and forth).
2. For each setup include setupName, lightingNotes, shotIds (exact IDs from the list below), and realistic estimatedMinutes.
3. For "propsAndUnits", always specify backup real product units (e.g. "2 hero units + 2 spare unopened units") whenever productInFrame is true, plus who supplies each item (Client vs Production).
4. NEVER invent shoot dates, permit confirmations, or budget numbers that were not provided in the intake notes. If dates, locations, talent availability, or budget figures are missing or vague, explicitly put questions for them in "clientQuestions".

PROJECT & INTAKE NOTES:
- Client: ${project.client}
- Product: ${project.product.name}
- Product Rules: ${project.brandBible.productRules}
- Shoot Location / Dates / Budget Notes from Intake: ${project.intake.shootLocationDatesBudgetNotes || 'MISSING — nothing provided by client yet'}
- Deliverables Wanted: ${project.intake.videosWanted}
- Brand Visual Style: ${JSON.stringify(project.brandBible.visualStyle)}

LIVE & HYBRID SHOTS TO SCHEDULE (${liveHybridShots.length} total):
${shotsText}`;

      const response = await ai.models.generateContent({
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
                    wrapTime: { type: Type.STRING },
                    setups: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          setupName: { type: Type.STRING },
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
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      const shootPlan: ShootPlan = {
        shootDays: Array.isArray(parsed.shootDays)
          ? parsed.shootDays.map(
              (
                day: {
                  dayLabel?: string;
                  location?: string;
                  callTime?: string;
                  wrapTime?: string;
                  setups?: Array<{
                    setupName?: string;
                    lightingNotes?: string;
                    shotIds?: string[];
                    estimatedMinutes?: number;
                  }>;
                },
                idx: number
              ) => ({
                id: `day-${Date.now()}-${idx}`,
                dayLabel: day.dayLabel || `Shoot Day ${idx + 1}`,
                location: day.location || 'TBD — confirm with client',
                callTime: day.callTime || 'TBD',
                wrapTime: day.wrapTime || 'TBD',
                setups: Array.isArray(day.setups)
                  ? day.setups.map((st) => ({
                      setupName: st.setupName || 'Setup',
                      lightingNotes: st.lightingNotes || '',
                      shotIds: Array.isArray(st.shotIds) ? st.shotIds : [],
                      estimatedMinutes: Number(st.estimatedMinutes) || 45,
                    }))
                  : [],
              })
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

  return router;
}
