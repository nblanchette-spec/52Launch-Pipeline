import fs from 'fs/promises';
import path from 'path';
import { PipelineProject, ProjectSummary } from '../src/types/pipeline';

const DATA_ROOT = path.resolve(process.cwd(), 'data');

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || `proj-${Date.now()}`;
}

export function getProjectDir(projectId: string): string {
  return path.join(DATA_ROOT, sanitizeId(projectId));
}

export function getProjectAssetsDir(projectId: string): string {
  return path.join(getProjectDir(projectId), 'assets');
}

export async function saveDataUrlAsset(
  projectId: string,
  dataUrl: string,
  prefix = 'asset'
): Promise<{ url: string; filename: string }> {
  const assetsDir = getProjectAssetsDir(projectId);
  await ensureDir(assetsDir);

  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid file upload format.');
  }
  const mime = match[1].toLowerCase();
  const base64Data = match[2];
  let ext = 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
  else if (mime.includes('webp')) ext = 'webp';
  else if (mime.includes('gif')) ext = 'gif';
  else if (mime.includes('mp4')) ext = 'mp4';
  else if (mime.includes('quicktime') || mime.includes('mov')) ext = 'mov';
  else if (mime.includes('webm')) ext = 'webm';
  else if (mime.includes('mpeg') || mime.includes('mp3')) ext = 'mp3';
  else if (mime.includes('wav')) ext = 'wav';
  else if (mime.includes('pdf')) ext = 'pdf';

  const filename = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const filePath = path.join(assetsDir, filename);
  await fs.writeFile(filePath, Buffer.from(base64Data, 'base64'));

  return {
    filename,
    url: `/api/projects/${sanitizeId(projectId)}/assets/${filename}`,
  };
}

export async function saveBinaryAssetFromUrl(
  projectId: string,
  remoteUrl: string,
  prefix = 'video',
  ext = 'mp4'
): Promise<{ url: string; filename: string }> {
  const assetsDir = getProjectAssetsDir(projectId);
  await ensureDir(assetsDir);

  const response = await fetch(remoteUrl);
  if (!response.ok) {
    throw new Error(`Could not download generated media (${response.status}).`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const filename = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const filePath = path.join(assetsDir, filename);
  await fs.writeFile(filePath, Buffer.from(arrayBuffer));

  return {
    filename,
    url: `/api/projects/${sanitizeId(projectId)}/assets/${filename}`,
  };
}

export async function saveBufferAsset(
  projectId: string,
  buffer: Buffer,
  prefix = 'vo',
  ext = 'wav'
): Promise<{ url: string; filename: string }> {
  const assetsDir = getProjectAssetsDir(projectId);
  await ensureDir(assetsDir);

  const filename = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const filePath = path.join(assetsDir, filename);
  await fs.writeFile(filePath, buffer);

  return {
    filename,
    url: `/api/projects/${sanitizeId(projectId)}/assets/${filename}`,
  };
}

export async function readAssetAsInlineData(
  projectId: string,
  assetUrlOrDataUrl: string
): Promise<{ data: string; mimeType: string } | null> {
  if (!assetUrlOrDataUrl) return null;

  if (assetUrlOrDataUrl.startsWith('data:')) {
    const match = assetUrlOrDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    return { mimeType: match[1], data: match[2] };
  }

  // Handle /api/projects/:id/assets/:filename
  const apiPrefix = `/api/projects/${sanitizeId(projectId)}/assets/`;
  let filePath: string | null = null;
  if (assetUrlOrDataUrl.startsWith(apiPrefix)) {
    const filename = path.basename(assetUrlOrDataUrl);
    filePath = path.join(getProjectAssetsDir(projectId), filename);
  } else if (assetUrlOrDataUrl.startsWith('/src/assets/')) {
    filePath = path.resolve(process.cwd(), assetUrlOrDataUrl.slice(1));
  }

  if (!filePath) return null;

  try {
    const buffer = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeType =
      ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.webp'
          ? 'image/webp'
          : ext === '.mp4'
            ? 'video/mp4'
            : ext === '.mov'
              ? 'video/quicktime'
              : ext === '.webm'
                ? 'video/webm'
                : ext === '.mp3'
                  ? 'audio/mpeg'
                  : ext === '.wav'
                    ? 'audio/wav'
                    : ext === '.pdf'
                      ? 'application/pdf'
                      : 'image/png';
    return {
      data: buffer.toString('base64'),
      mimeType,
    };
  } catch {
    return null;
  }
}

export async function seedInitialProjectIfEmpty(): Promise<void> {
  await ensureDir(DATA_ROOT);
  const entries = await fs.readdir(DATA_ROOT, { withFileTypes: true });
  const hasProjectFolders = entries.some((e) => e.isDirectory());
  if (hasProjectFolders) return;

  const sampleId = 'kinetix-core-patch';
  const now = new Date().toISOString();

  // Copy sample asset from src/assets/images if available so sample project has a real product photo
  let samplePhotoUrl = '';
  try {
    const srcImagesDir = path.resolve(process.cwd(), 'src', 'assets', 'images');
    const files = await fs.readdir(srcImagesDir);
    const propFile = files.find((f) => f.includes('sample_prop_patch'));
    if (propFile) {
      await ensureDir(getProjectAssetsDir(sampleId));
      const destFile = 'product-hero-patch.jpg';
      await fs.copyFile(
        path.join(srcImagesDir, propFile),
        path.join(getProjectAssetsDir(sampleId), destFile)
      );
      samplePhotoUrl = `/api/projects/${sampleId}/assets/${destFile}`;
    }
  } catch {
    // Optional sample image copy
  }

  const starterProject: PipelineProject = {
    id: sampleId,
    createdAt: now,
    updatedAt: now,
    client: 'Kinetix Bio Inc.',
    product: {
      name: 'Kinetix Core Patch',
      description:
        'A 1.2mm ultra-thin wearable sweat-sensing biometric patch that sticks to the forearm and measures real-time electrolyte loss and lactate threshold during endurance training.',
      provableClaims: [
        'Measures sweat sodium concentration and fluid loss continuously in real time',
        '1.2mm low-profile medical-grade adhesive housing',
        'Alerts athletes via companion watch/phone 15–20 minutes before dehydration fatigue sets in',
      ],
      photos: samplePhotoUrl
        ? [
            {
              id: 'photo-seed-1',
              url: samplePhotoUrl,
              caption: 'Kinetix Core Patch faceted anodized aluminum ring & polymer core',
            },
          ]
        : [],
    },
    intake: {
      audience:
        'Competitive marathoners, triathletes, and serious endurance runners aged 24–42 who already train with GPS watches.',
      tone: 'Visceral, athletic, disciplined, documentary realism — zero hype or neon gym clichés.',
      clientMarketingIdeas:
        'Open on a solo runner hitting a dawn track before anyone else is awake. Show the moment they normally bonk at mile 20, except this time they get an early hydration warning and surge past it.',
      videosWanted: '1x 30s Launch Hero Spot (16:9), 2x 15s Paid Social Cutdowns (9:16)',
      shootLocationDatesBudgetNotes:
        'Civic stadium running track in Los Angeles. Target shoot window: early December dawn call (5:45 AM – 10:30 AM). Budget tier: lean 1-day exterior location crew.',
    },
    brandBible: {
      positioning:
        'Kinetix Core Patch gives endurance athletes a twenty-minute biological warning before dehydration breaks their race.',
      audience:
        'Data-driven marathoners and triathletes (24–42) who track splits, heart rate, and fueling precision.',
      toneOfVoice: {
        adjectives: ['Disciplined', 'Visceral', 'Precise', 'Grounded'],
        guidance:
          'Speak in calm, direct athletic truths. Avoid breathless tech buzzwords, exclamation marks, or unproven medical promises.',
      },
      visualStyle: {
        palette: 'Asphalt black (#0F172A), brutalist concrete slate (#334155), dawn mist white (#F8FAFC), and amber telemetry highlights (#F59E0B).',
        typography: 'Primary Display: Neue Haas Grotesk Bold; Body & Subheads: Inter Medium; Telemetry Readouts: JetBrains Mono Regular.',
        lighting: 'Low-angle natural dawn sunlight cutting across concrete bleachers with crisp negative fill.',
        lensAndFraming: '35mm and 85mm anamorphic primes for track action; 100mm macro for skin-patch detail.',
        grade: 'Rich monochrome-leaning contrast with natural warm skin tones.',
      },
      brandLogoUrl: null,
      brandLogoCaption: '',
      characters: [
        {
          id: 'char-1',
          name: 'Maya (Lead Runner)',
          fixedDescriptor:
            'Maya, athletic woman in her late 20s with dark hair tied in a high bun, wearing a matte black technical running singlet, dark split shorts, and a GPS watch on her right wrist',
        },
      ],
      productRules:
        'Circular 32mm ultra-thin disc worn on the outer left forearm, brushed faceted outer ring with matte center and a single subtle amber indicator dot. Never show holographic floating screens or glowing sci-fi overlays.',
      bannedList: [
        'Neon gym lighting',
        'Holographic HUD graphics floating in mid-air',
        'Smiling stock-photo poses',
        'Unproven medical cure claims',
      ],
      claimsAllowed: [
        'Measures sweat sodium concentration and fluid loss continuously in real time',
        '1.2mm low-profile medical-grade adhesive housing',
        'Alerts athletes via companion watch/phone 15–20 minutes before dehydration fatigue sets in',
      ],
      claimsToFlag: [
        'Client idea mentions "surge past mile 20" — ensure voiceover frames this as hydration readiness rather than guaranteeing faster marathon times.',
      ],
      hasGenerated: true,
      manuallyEdited: false,
    },
    creativeBrief: {
      objective:
        'Introduce Kinetix Core Patch to serious endurance athletes and drive pre-order reservations for Batch 01.',
      keyMessage:
        'Dehydration starts twenty minutes before you feel thirsty — Kinetix lets you hear the warning in time.',
      concepts: [
        {
          id: 'concept-1',
          title: 'Twenty Minutes Early',
          logline:
            'A lone marathoner runs dawn intervals on a brutalist track as real-time sweat telemetry prevents the invisible wall before it hits.',
          whyItWorks:
            'Grounds the client’s dawn track idea in an authentic sensory experience athletes immediately recognize.',
          risks: 'Requires tight dawn light window (6:00–7:30 AM) for wide stadium shots.',
        },
        {
          id: 'concept-2',
          title: 'The Salt Line',
          logline:
            'Tight macro textures of salt on skin, shoe rubber on asphalt, and the 1.2mm patch reading every drop.',
          whyItWorks: 'Turns invisible sweat chemistry into tactile cinema.',
          risks: 'Needs careful macro moisture control on set.',
        },
      ],
      recommendedConcept: {
        title: 'Twenty Minutes Early',
        reason:
          'Balances emotional human grit with clear, provable product utility across both 30s hero and 15s social cutdowns.',
      },
      deliverables: ['1x 30s Launch Hero Spot (16:9)', '2x 15s Paid Social Cutdowns (9:16)'],
      voDirection: {
        pace: 'Measured and steady at opening, tightening cleanly into the final surge (~2.5 words/sec).',
        emotionalArc: 'Quiet internal focus -> subtle tension -> calm athletic mastery.',
        speaker: 'Maya or seasoned endurance coach voice (warm, gravelly, unhurried).',
      },
      claimsCheck:
        'All lines stick strictly to real-time sweat sodium/fluid measurement, 1.2mm profile, and 15–20 minute early hydration alert.',
      hasGenerated: true,
      manuallyEdited: false,
    },
    shots: [
      {
        id: 'S01',
        deliverable: '30s Hero',
        durationSec: 5,
        scene: 'Wide dawn silhouette of Maya walking onto Lane 1 of an empty concrete stadium track.',
        route: 'ai_video',
        model: 'seedance',
        productInFrame: false,
        framePrompt:
          'Wide establishing 35mm anamorphic shot at early dawn of a brutalist concrete stadium running track in light mist. Maya, athletic woman in her late 20s with dark hair tied in a high bun, wearing a matte black technical running singlet, dark split shorts, and a GPS watch on her right wrist, walks calmly into Lane 1 away from camera. Long diagonal dawn shadows, moody natural contrast.',
        shootDirection: '',
        voLine: "You don't hit the wall when your legs give out.",
        continuityNotes: 'Dawn mist holds through S01–S02.',
        chainFrom: 'none',
        frameImageUrl: null,
        frameCheck: null,
        productFrameApproved: false,
        videoPrompt: '',
        negativePrompt: '',
        videoUrl: null,
        videoSeed: null,
        status: 'Draft',
      },
      {
        id: 'S02',
        deliverable: '30s Hero + 15s Cutdown',
        durationSec: 4,
        scene: 'Close-up on Maya’s left forearm as she presses the Kinetix Core Patch flush onto her skin.',
        route: 'live',
        model: 'none',
        productInFrame: true,
        framePrompt:
          '100mm macro close-up on the outer left forearm of Maya, athletic woman in her late 20s with dark hair tied in a high bun, wearing a matte black technical running singlet, dark split shorts, and a GPS watch on her right wrist. Her right fingertips gently press [PRODUCT PLACEHOLDER: composite real product here] onto her forearm skin on an early dawn stadium track. Soft natural rim light, shallow depth of field.',
        shootDirection:
          'Camera on shoulder rig or tripod with 100mm macro prime at T2.8. Place Maya facing low dawn sun for warm forearm rim light and bounce card below for soft fill. Talent presses hero patch unit cleanly once without covering the faceted aluminum ring.',
        voLine: 'It starts twenty minutes earlier, in drops you never even noticed.',
        continuityNotes: 'Patch sits on upper outer left forearm.',
        chainFrom: 'none',
        frameImageUrl: null,
        frameCheck: null,
        productFrameApproved: false,
        videoPrompt: '',
        negativePrompt: '',
        videoUrl: null,
        videoSeed: null,
        status: 'Draft',
      },
      {
        id: 'S03',
        deliverable: '30s Hero + 15s Cutdown',
        durationSec: 6,
        scene: 'Low tracking shot beside Maya sprinting at tempo speed past concrete stadium bleachers.',
        route: 'hybrid',
        model: 'flux3',
        productInFrame: true,
        framePrompt:
          'Low-angle 35mm tracking medium shot of Maya, athletic woman in her late 20s with dark hair tied in a high bun, wearing a matte black technical running singlet, dark split shorts, and a GPS watch on her right wrist, sprinting down a concrete stadium track with [PRODUCT PLACEHOLDER: composite real product here] visible on her left forearm. Diagonal bleacher shadows strobe softly across frame.',
        shootDirection:
          'Mount camera on silent electric cart tracking parallel in Lane 3 at 14 mph. 35mm lens at T2.8, 1/96 shutter for crisp stride. Keep left forearm clearly readable toward lens.',
        voLine: 'Kinetix reads your sweat sodium and fluid loss in real time.',
        continuityNotes: 'Match stride cadence and sunlight angle from S02.',
        chainFrom: 'none',
        frameImageUrl: null,
        frameCheck: null,
        productFrameApproved: false,
        videoPrompt: '',
        negativePrompt: '',
        videoUrl: null,
        videoSeed: null,
        status: 'Draft',
      },
      {
        id: 'S04',
        deliverable: '30s Hero',
        durationSec: 5,
        scene: 'Maya glances down at a subtle alert on her watch, takes a calm breath, and accelerates into full sunrise.',
        route: 'ai_video',
        model: 'seedance',
        productInFrame: false,
        framePrompt:
          'Medium close-up 85mm profile shot of Maya, athletic woman in her late 20s with dark hair tied in a high bun, wearing a matte black technical running singlet, dark split shorts, and a GPS watch on her right wrist, glancing briefly at her watch mid-stride before looking forward into golden sunrise light on the stadium track. Warm backlight, shallow depth of field.',
        shootDirection: '',
        voLine: 'Know twenty minutes early. Finish strong.',
        continuityNotes: 'Warm sunrise flare closes the spot.',
        chainFrom: 'none',
        frameImageUrl: null,
        frameCheck: null,
        productFrameApproved: false,
        videoPrompt: '',
        negativePrompt: '',
        videoUrl: null,
        videoSeed: null,
        status: 'Draft',
      },
    ],
    shotListHasGenerated: true,
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
      bibleApproved: true,
      briefApproved: true,
      shotListApproved: false,
      storyboardApproved: false,
      videoPromptsApproved: false,
      voApproved: false,
      shootPlanApproved: false,
    },
    generationLog: [
      {
        id: 'log-seed-1',
        timestamp: now,
        step: 'Starter Project',
        model: 'Studio Template',
        prompt: 'Initialized Kinetix Core Patch production pipeline',
        seed: null,
        status: 'success',
      },
    ],
  };

  await saveProject(starterProject);
}

export async function listProjects(): Promise<ProjectSummary[]> {
  await seedInitialProjectIfEmpty();
  const entries = await fs.readdir(DATA_ROOT, { withFileTypes: true });
  const summaries: ProjectSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const jsonPath = path.join(DATA_ROOT, entry.name, 'project.json');
    try {
      const raw = await fs.readFile(jsonPath, 'utf-8');
      const proj = JSON.parse(raw) as PipelineProject;
      summaries.push({
        id: proj.id,
        client: proj.client,
        productName: proj.product?.name || 'Untitled Product',
        updatedAt: proj.updatedAt,
        shotCount: Array.isArray(proj.shots) ? proj.shots.length : 0,
        approvals: proj.approvals,
      });
    } catch {
      // Skip invalid folder
    }
  }

  return summaries.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getProject(projectId: string): Promise<PipelineProject | null> {
  const jsonPath = path.join(getProjectDir(projectId), 'project.json');
  try {
    const raw = await fs.readFile(jsonPath, 'utf-8');
    return JSON.parse(raw) as PipelineProject;
  } catch {
    return null;
  }
}

export async function saveProject(project: PipelineProject): Promise<PipelineProject> {
  const id = sanitizeId(project.id);
  const dir = getProjectDir(id);
  await ensureDir(dir);
  await ensureDir(getProjectAssetsDir(id));

  const updated: PipelineProject = {
    ...project,
    id,
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(
    path.join(dir, 'project.json'),
    JSON.stringify(updated, null, 2),
    'utf-8'
  );
  return updated;
}

export async function deleteProject(projectId: string): Promise<void> {
  const dir = getProjectDir(projectId);
  await fs.rm(dir, { recursive: true, force: true });
}

export async function exportProjectBackupBundle(projectId: string): Promise<{
  format: '52launch-project-backup';
  version: number;
  exportedAt: string;
  project: PipelineProject;
  embeddedAssets: Record<string, string>;
}> {
  const project = await getProject(projectId);
  if (!project) {
    throw new Error('Project not found.');
  }

  const assetsDir = getProjectAssetsDir(projectId);
  const embeddedAssets: Record<string, string> = {};
  try {
    const files = await fs.readdir(assetsDir);
    for (const file of files) {
      const buf = await fs.readFile(path.join(assetsDir, file));
      const ext = path.extname(file).toLowerCase();
      const mime =
        ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.webp'
            ? 'image/webp'
            : ext === '.mp4'
              ? 'video/mp4'
              : ext === '.mp3'
                ? 'audio/mpeg'
                : ext === '.wav'
                  ? 'audio/wav'
                  : ext === '.pdf'
                    ? 'application/pdf'
                    : 'image/png';
      embeddedAssets[file] = `data:${mime};base64,${buf.toString('base64')}`;
    }
  } catch {
    // No assets folder yet
  }

  return {
    format: '52launch-project-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    project,
    embeddedAssets,
  };
}

export async function importProjectBackupBundle(bundle: {
  project?: PipelineProject;
  embeddedAssets?: Record<string, string>;
}): Promise<PipelineProject> {
  const incoming = bundle.project ?? (bundle as unknown as PipelineProject);
  if (!incoming || !incoming.client || !incoming.product?.name) {
    throw new Error('This backup file does not contain a valid 52Launch project.');
  }

  const targetId = sanitizeId(incoming.id || `${incoming.product.name}-${Date.now()}`);
  const assetsDir = getProjectAssetsDir(targetId);
  await ensureDir(assetsDir);

  if (bundle.embeddedAssets && typeof bundle.embeddedAssets === 'object') {
    for (const [filename, dataUrl] of Object.entries(bundle.embeddedAssets)) {
      const match = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const safeName = path.basename(filename);
        await fs.writeFile(path.join(assetsDir, safeName), Buffer.from(match[2], 'base64'));
      }
    }
  }

  // Rewrite any asset URLs to match the imported project's ID
  const rewriteUrl = (url: string | null | undefined): string | null => {
    if (!url) return null;
    const parts = url.split('/assets/');
    if (parts.length === 2) {
      return `/api/projects/${targetId}/assets/${path.basename(parts[1])}`;
    }
    return url;
  };

  const normalized: PipelineProject = {
    ...incoming,
    id: targetId,
    product: {
      ...incoming.product,
      photos: (incoming.product.photos || []).map((p) => ({
        ...p,
        url: rewriteUrl(p.url) || p.url,
      })),
    },
    shots: (incoming.shots || []).map((s) => ({
      ...s,
      frameImageUrl: rewriteUrl(s.frameImageUrl),
      videoUrl: rewriteUrl(s.videoUrl),
      upscaledVideoUrl: rewriteUrl(s.upscaledVideoUrl),
    })),
    externalUpscales: (incoming.externalUpscales || []).map((item) => ({
      ...item,
      sourceUrl: rewriteUrl(item.sourceUrl) || item.sourceUrl,
      upscaledVideoUrl: rewriteUrl(item.upscaledVideoUrl) || item.upscaledVideoUrl,
    })),
    voScript: (incoming.voScript || []).map((v) => ({
      ...v,
      audioUrl: rewriteUrl(v.audioUrl),
    })),
    brandGuideDocuments: Array.isArray(incoming.brandGuideDocuments)
      ? incoming.brandGuideDocuments.map((doc) => ({
          ...doc,
          url: rewriteUrl(doc.url) || doc.url,
        }))
      : incoming.brandGuideDocuments,
    brandBible: incoming.brandBible
      ? {
          ...incoming.brandBible,
          brandLogoUrl: rewriteUrl(incoming.brandBible.brandLogoUrl),
        }
      : incoming.brandBible,
    updatedAt: new Date().toISOString(),
  };

  return saveProject(normalized);
}
