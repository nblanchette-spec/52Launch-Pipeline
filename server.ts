import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { createPipelineRouter } from './server/pipelineRoutes';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the environment.');
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

function normalizeAspectRatioForModel(ratio: string): '16:9' | '9:16' | '3:4' | '4:3' | '1:1' {
  if (ratio === '4:5') return '3:4';
  if (ratio === '16:9' || ratio === '9:16' || ratio === '3:4' || ratio === '4:3' || ratio === '1:1') {
    return ratio;
  }
  return '16:9';
}

function extractImageDataUrl(response: unknown): string | null {
  const res = response as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { data?: string; mimeType?: string };
          text?: string;
        }>;
      };
    }>;
  };
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      const mime = part.inlineData.mimeType ?? 'image/png';
      return `data:${mime};base64,${part.inlineData.data}`;
    }
  }
  return null;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '150mb' }));
  app.use('/api', createPipelineRouter());

  // Step 1 -> Step 2: Generate Creative Brief from Onboarding Notes
  app.post('/api/ai/brief', async (req, res) => {
    try {
      const { brandName, projectTitle, industry, onboarding } = req.body;
      const ai = getGeminiClient();

      const prompt = `You are an elite Executive Creative Director at 52Launch, a startup brand film agency.
Synthesize the raw kickoff discovery notes for "${brandName}" (Project: "${projectTitle}", Industry: "${industry}") into a sharp, production-ready Executive Creative Brief.

Kickoff Discovery Notes:
1. 52Launch Creative Philosophy Alignment: ${onboarding?.philosophyNotes || 'Not specified'}
2. 3-Phase Expectations & Timeline: ${onboarding?.phaseExpectationsNotes || 'Not specified'}
3. Startup Problem / Solution & Founder Story: ${onboarding?.founderProblemSolutionNotes || 'Not specified'}
4. Visual & Pacing Calibration: ${onboarding?.visualPacingNotes || 'Not specified'}

Produce a complete, specific brief with 5 curated hex color swatches that match the startup's aesthetic, realistic aspect ratio deliverables (choose from "16:9", "9:16", "4:5", "1:1"), and clear mandatories.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              objectiveAndKpis: { type: Type.STRING },
              targetAudiencePersona: { type: Type.STRING },
              coreHookMessage: { type: Type.STRING },
              toneAndPacing: { type: Type.STRING },
              visualStyleNotes: { type: Type.STRING },
              colorPalette: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    hex: { type: Type.STRING },
                  },
                  required: ['name', 'hex'],
                },
              },
              deliverablesAspectRatios: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              mandatories: { type: Type.STRING },
            },
            required: [
              'objectiveAndKpis',
              'targetAudiencePersona',
              'coreHookMessage',
              'toneAndPacing',
              'visualStyleNotes',
              'colorPalette',
              'deliverablesAspectRatios',
              'mandatories',
            ],
          },
        },
      });

      const text = (response.text ?? '{}').trim();
      const parsed = JSON.parse(text);
      res.json(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate Creative Brief';
      console.error('Brief generation error:', err);
      res.status(500).json({ error: message });
    }
  });

  // Step 3: Brainstorm 3 Creative Territories
  app.post('/api/ai/territories', async (req, res) => {
    try {
      const { brandName, projectTitle, industry, brief } = req.body;
      const ai = getGeminiClient();

      const prompt = `You are an award-winning Commercial Film Director at 52Launch.
Based on the Executive Creative Brief for "${brandName}" (Project: "${projectTitle}", Industry: "${industry}"), pitch 3 distinct, bold Creative Territories (e.g., Territory A: High-Energy Disruptor, Territory B: Authentic Founder Docu-Style, Territory C: Sleek Macro Product Hero — tailored specifically to this startup).

Executive Creative Brief:
- Objective & KPIs: ${brief?.objectiveAndKpis}
- Target Audience: ${brief?.targetAudiencePersona}
- Core Hook: ${brief?.coreHookMessage}
- Tone & Pacing: ${brief?.toneAndPacing}
- Visual Style: ${brief?.visualStyleNotes}
- Mandatories: ${brief?.mandatories}

For each territory, include a crisp 3-Act Narrative Arc, visual treatment, sound design direction, and 4 seedScenes that can immediately populate a storyboard studio (using shot sizes from ECU, CU, MCU, MS, WS, EWS and angles from Eye Level, Low Angle, High Angle, Dutch Tilt, Overhead / Top-Down, Over-the-Shoulder).`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                title: { type: Type.STRING },
                loglineHook: { type: Type.STRING },
                narrativeArc: {
                  type: Type.OBJECT,
                  properties: {
                    act1: { type: Type.STRING },
                    act2: { type: Type.STRING },
                    act3: { type: Type.STRING },
                  },
                  required: ['act1', 'act2', 'act3'],
                },
                visualTreatment: { type: Type.STRING },
                soundDesignDirection: { type: Type.STRING },
                seedScenes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      sceneNumber: { type: Type.STRING },
                      title: { type: Type.STRING },
                      actionSummary: { type: Type.STRING },
                      suggestedShotSize: { type: Type.STRING },
                      suggestedAngle: { type: Type.STRING },
                      dialogueOrAudio: { type: Type.STRING },
                    },
                    required: [
                      'sceneNumber',
                      'title',
                      'actionSummary',
                      'suggestedShotSize',
                      'suggestedAngle',
                      'dialogueOrAudio',
                    ],
                  },
                },
              },
              required: [
                'label',
                'title',
                'loglineHook',
                'narrativeArc',
                'visualTreatment',
                'soundDesignDirection',
                'seedScenes',
              ],
            },
          },
        },
      });

      const text = (response.text ?? '[]').trim();
      const parsed = JSON.parse(text);
      res.json({ territories: parsed });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to brainstorm territories';
      console.error('Territories generation error:', err);
      res.status(500).json({ error: message });
    }
  });

  // Step 4 (Tiers 1-3): Generate Ingredient Reference Sketch
  app.post('/api/ai/ingredient', async (req, res) => {
    try {
      const { tier, payload, brandName } = req.body;
      const ai = getGeminiClient();

      let prompt = '';
      let aspectRatio: '3:4' | '16:9' | '1:1' = '1:1';

      if (tier === 'cast') {
        aspectRatio = '3:4';
        prompt = `Create a clean black-and-white graphite pencil and fine ink film storyboard character reference sheet for a commercial film for "${brandName}".
Subject: ${payload.name} (${payload.role}).
Age & Appearance: ${payload.ageAppearance}.
Wardrobe: ${payload.wardrobe}.
Vibe & Expression: ${payload.vibe}.
Style: Authentic cinema production character sheet showing a front full-body/three-quarter study and subtle expression detail on clean white paper. Crisp graphite shading, expressive ink linework, zero photographic color, high visual clarity so it can serve as a visual consistency reference.`;
      } else if (tier === 'location') {
        aspectRatio = '16:9';
        prompt = `Create a clean black-and-white graphite pencil and fine ink film storyboard establishing wide concept sketch of an EMPTY location set (no people in frame) for "${brandName}".
Location Name: ${payload.name} (${payload.interiorExterior}, ${payload.timeOfDay}).
Architectural & Lighting Details: ${payload.architecturalLightingDetails}.
Style: Cinema pre-production architectural location concept art on clean white paper, strong perspective lines, dramatic monochrome ink wash and graphite shadows showing light direction and spatial depth.`;
      } else if (tier === 'prop') {
        aspectRatio = '1:1';
        prompt = `Create a clean black-and-white graphite pencil and technical ink film storyboard hero prop study for "${brandName}".
Prop / Product Name: ${payload.name}.
Material & Finish: ${payload.materialFinish}.
Scale: ${payload.scale}.
Brand & Design Details: ${payload.brandDetails}.
Style: Isolated industrial-design storyboard sketch on clean white paper showing exact silhouette, surface shading, and tactile details with crisp monochrome ink linework.`;
      } else {
        return res.status(400).json({ error: 'Invalid ingredient tier specified.' });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: prompt }],
        },
        config: {
          imageConfig: {
            aspectRatio,
          },
        },
      });

      const imageDataUrl = extractImageDataUrl(response);
      if (!imageDataUrl) {
        return res.status(502).json({ error: 'Model did not return an image part.' });
      }
      res.json({ imageDataUrl });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate ingredient sketch';
      console.error('Ingredient generation error:', err);
      res.status(500).json({ error: message });
    }
  });

  // Step 4 (Tier 4): Multimodal Storyboard Frame Composer
  app.post('/api/ai/storyboard-frame', async (req, res) => {
    try {
      const {
        castRefs,
        locationRef,
        propRefs,
        shotSize,
        cameraAngle,
        cameraMovement,
        aspectRatio,
        actionPrompt,
        inpaintNote,
        previousFrameData,
      } = req.body;

      const ai = getGeminiClient();
      const parts: Array<{ inlineData?: { data: string; mimeType: string }; text?: string }> = [];
      const refDescriptions: string[] = [];

      if (Array.isArray(castRefs)) {
        castRefs.forEach((c: { name: string; wardrobe: string; data?: string; mimeType?: string }, idx: number) => {
          if (c.data && c.mimeType) {
            parts.push({ inlineData: { data: c.data, mimeType: c.mimeType } });
            refDescriptions.push(`Cast Reference #${idx + 1}: ${c.name} (${c.wardrobe})`);
          }
        });
      }

      if (locationRef?.data && locationRef?.mimeType) {
        parts.push({ inlineData: { data: locationRef.data, mimeType: locationRef.mimeType } });
        refDescriptions.push(
          `Location Reference: ${locationRef.name} (${locationRef.interiorExterior}, ${locationRef.timeOfDay})`
        );
      }

      if (Array.isArray(propRefs)) {
        propRefs.forEach((p: { name: string; materialFinish: string; data?: string; mimeType?: string }, idx: number) => {
          if (p.data && p.mimeType) {
            parts.push({ inlineData: { data: p.data, mimeType: p.mimeType } });
            refDescriptions.push(`Hero Prop Reference #${idx + 1}: ${p.name} (${p.materialFinish})`);
          }
        });
      }

      if (previousFrameData?.data && previousFrameData?.mimeType && inpaintNote) {
        parts.push({ inlineData: { data: previousFrameData.data, mimeType: previousFrameData.mimeType } });
        refDescriptions.push('Previous Storyboard Frame (apply edit/inpaint refinements to this composition)');
      }

      const targetRatio = normalizeAspectRatioForModel(aspectRatio || '16:9');

      const promptText = `Using the exact character likeness/wardrobe, exact location architecture, and exact prop design from the attached reference sketches, generate a cohesive black-and-white graphite and ink film storyboard sketch frame. Maintain strict visual consistency with the provided ingredient references. Aspect ratio: ${aspectRatio || '16:9'}.

Attached References:
${refDescriptions.length > 0 ? refDescriptions.map((d) => `- ${d}`).join('\n') : '- None (generate directly from scene description)'}

Cinematography Specifications:
- Shot Size: ${shotSize}
- Camera Angle: ${cameraAngle}
- Camera Movement Cue: ${cameraMovement}
- Action & Blocking: ${actionPrompt}
${inpaintNote ? `- Director Refinement / Inpaint Note: ${inpaintNote}` : ''}

Render purely as a clean, borderless cinema storyboard sketch frame in black-and-white graphite pencil and fine ink wash. Do not add text captions or margins around the artwork.`;

      parts.push({ text: promptText });

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: targetRatio,
          },
        },
      });

      const imageDataUrl = extractImageDataUrl(response);
      if (!imageDataUrl) {
        return res.status(502).json({ error: 'Model did not return a storyboard frame image.' });
      }
      res.json({ imageDataUrl });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to render storyboard frame';
      console.error('Storyboard frame error:', err);
      res.status(500).json({ error: message });
    }
  });

  // Step 5: AI Suggest Production Requirements
  app.post('/api/ai/requirements', async (req, res) => {
    try {
      const { brandName, projectTitle, shots, brief } = req.body;
      const ai = getGeminiClient();

      const prompt = `You are a Line Producer & 1st AD at 52Launch.
Review this commercial film project "${projectTitle}" for "${brandName}" and its Master Shot List, then generate a practical, itemized production requirements checklist organized strictly into these 5 categories:
- "Camera & Lenses"
- "Lighting & Grip"
- "Audio"
- "Art/Props/Wardrobe"
- "Talent & Releases"

Visual Style: ${brief?.visualStyleNotes || 'Cinematic commercial'}
Master Shot List:
${JSON.stringify(shots, null, 2)}

Provide 14-18 specific, shoot-ready line items with realistic quantities and helpful prep notes.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                category: { type: Type.STRING },
                item: { type: Type.STRING },
                quantity: { type: Type.STRING },
                notes: { type: Type.STRING },
              },
              required: ['category', 'item', 'quantity', 'notes'],
            },
          },
        },
      });

      const text = (response.text ?? '[]').trim();
      const parsed = JSON.parse(text);
      res.json({ requirements: parsed });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to suggest production requirements';
      console.error('Requirements error:', err);
      res.status(500).json({ error: message });
    }
  });

  // Step 5: Smart Shoot Day Scheduler
  app.post('/api/ai/schedule', async (req, res) => {
    try {
      const { brandName, projectTitle, shootDate, shots } = req.body;
      const ai = getGeminiClient();

      const prompt = `You are a veteran 1st Assistant Director creating a minute-by-minute Commercial Call Sheet Shoot Schedule for "${brandName} — ${projectTitle}" on ${shootDate || 'Shoot Day 1'}.

Master Shot List to Schedule:
${JSON.stringify(shots, null, 2)}

Rules:
1. Group shots logically by Location FIRST (to minimize Company Moves) and by Lighting Setup SECOND.
2. Start with a realistic Call Time block (e.g., 07:00 - 07:45 Crew Call & Gear Load-In / Safety Meeting).
3. Include dedicated Setup / Lighting blocks, Shoot Blocks (listing exact shotNumbers covered), any Company Move blocks between different locations, a 45-minute Meal Break around midday, and a Wrap block at the end.
4. Keep startTime and endTime in clean 24h or 12h consistent format (e.g. "07:00 AM", "07:45 AM").
5. blockType must be strictly one of: "Call Time", "Setup", "Shoot Block", "Company Move", "Meal Break", "Wrap".`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                startTime: { type: Type.STRING },
                endTime: { type: Type.STRING },
                blockType: { type: Type.STRING },
                title: { type: Type.STRING },
                location: { type: Type.STRING },
                shotNumbers: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                lightingSetup: { type: Type.STRING },
                notes: { type: Type.STRING },
              },
              required: [
                'startTime',
                'endTime',
                'blockType',
                'title',
                'location',
                'shotNumbers',
                'lightingSetup',
                'notes',
              ],
            },
          },
        },
      });

      const text = (response.text ?? '[]').trim();
      const parsed = JSON.parse(text);
      res.json({ schedule: parsed });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate shoot schedule';
      console.error('Schedule error:', err);
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`52Launch Director OS running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});
