import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { PipelineProject } from '../src/types/pipeline';
import { readAssetAsInlineData } from './projectStore';

export interface DriveFileDescriptor {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  folderUrl?: string;
  folderPath?: string;
  size?: string;
}

export interface ExtractedDriveContent {
  textSummaries: string[];
  inlineParts: Array<{
    fileName: string;
    mimeType: string;
    data: string; // base64
  }>;
  imageFiles: Array<{
    fileId: string;
    fileName: string;
    mimeType: string;
    data: string; // base64
  }>;
  analyzedFiles: Array<{ name: string; status: string }>;
  warnings: string[];
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function xmlToPlainText(xml: string): string {
  const withBreaks = xml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<\/a:p>/g, '\n')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<\/w:tc>/g, ' | ');
  const stripped = withBreaks.replace(/<[^>]+>/g, '');
  return decodeXmlEntities(stripped)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const parts: string[] = [];
  const docFile = zip.file('word/document.xml');
  if (docFile) {
    parts.push(xmlToPlainText(await docFile.async('string')));
  }
  const extraPaths = Object.keys(zip.files).filter(
    (name) => /^word\/(header|footer)\d*\.xml$/.test(name)
  );
  for (const p of extraPaths) {
    const f = zip.file(p);
    if (f) {
      const txt = xmlToPlainText(await f.async('string'));
      if (txt) parts.push(txt);
    }
  }
  return parts.join('\n\n').trim();
}

async function extractPptxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const slidePaths = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/\d+/)?.[0] || 0);
      const nb = Number(b.match(/\d+/)?.[0] || 0);
      return na - nb;
    });
  const slides: string[] = [];
  for (const p of slidePaths) {
    const f = zip.file(p);
    if (f) {
      const txt = xmlToPlainText(await f.async('string'));
      if (txt) slides.push(`[Slide]\n${txt}`);
    }
  }
  return slides.join('\n\n').trim();
}

async function extractXlsxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const sharedStrings: string[] = [];
  const ssFile = zip.file('xl/sharedStrings.xml');
  if (ssFile) {
    const ssXml = await ssFile.async('string');
    const siMatches = ssXml.match(/<si[\s\S]*?<\/si>/g) || [];
    for (const si of siMatches) {
      sharedStrings.push(xmlToPlainText(si));
    }
  }

  const sheetPaths = Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort();

  const out: string[] = [];
  for (const sp of sheetPaths) {
    const sf = zip.file(sp);
    if (!sf) continue;
    const xml = await sf.async('string');
    const rows: string[] = [];
    const rowMatches = xml.match(/<row[\s\S]*?<\/row>/g) || [];
    for (const rowXml of rowMatches) {
      const cells: string[] = [];
      const cellMatches = rowXml.match(/<c\b[\s\S]*?<\/c>/g) || [];
      for (const cellXml of cellMatches) {
        const isShared = /\bt="s"/.test(cellXml);
        const valMatch = cellXml.match(/<v>([\s\S]*?)<\/v>/);
        const inlineMatch = cellXml.match(/<is>([\s\S]*?)<\/is>/);
        if (inlineMatch) {
          cells.push(xmlToPlainText(inlineMatch[1]));
        } else if (valMatch) {
          const raw = valMatch[1];
          if (isShared && sharedStrings[Number(raw)] !== undefined) {
            cells.push(sharedStrings[Number(raw)]);
          } else {
            cells.push(decodeXmlEntities(raw));
          }
        }
      }
      const line = cells.filter(Boolean).join(' | ');
      if (line) rows.push(line);
    }
    if (rows.length > 0) {
      out.push(`[${sp.split('/').pop()}]\n${rows.join('\n')}`);
    }
  }
  return out.join('\n\n').trim();
}

export class DriveAuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

async function parseGoogleApiError(res: Response): Promise<{ message: string; reason?: string }> {
  let message = `HTTP ${res.status}`;
  let reason: string | undefined;
  try {
    const text = await res.text();
    const parsed = JSON.parse(text);
    if (parsed?.error?.message) {
      message = String(parsed.error.message);
    } else if (text) {
      message = text.slice(0, 200);
    }
    if (Array.isArray(parsed?.error?.errors) && parsed.error.errors[0]?.reason) {
      reason = String(parsed.error.errors[0].reason);
    }
  } catch {
    // ignore parse failures
  }
  return { message, reason };
}

async function driveFetch(url: string, accessToken: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (res.status === 401) {
    throw new DriveAuthError('Google Drive session expired. Please sign in with Google again.', 401);
  }
  if (res.status === 403) {
    const cloned = res.clone();
    const { message, reason } = await parseGoogleApiError(cloned);
    if (
      reason === 'insufficientPermissions' ||
      message.toLowerCase().includes('insufficient authentication scopes') ||
      message.toLowerCase().includes('insufficient permission')
    ) {
      throw new DriveAuthError(
        'Google Drive read permission was not granted. Click "Sign in with Google" and make sure all Google Drive access checkboxes are checked.',
        403
      );
    }
  }
  return res;
}

export async function downloadAndExtractDriveFiles(
  files: DriveFileDescriptor[],
  accessToken: string
): Promise<ExtractedDriveContent> {
  const result: ExtractedDriveContent = {
    textSummaries: [],
    inlineParts: [],
    imageFiles: [],
    analyzedFiles: [],
    warnings: [],
  };

  const MAX_TEXT_CHARS = 45000;
  const MAX_BINARY_BYTES = 14 * 1024 * 1024; // 14MB per file

  for (const file of files) {
    if (!file?.id || file.mimeType === 'application/vnd.google-apps.folder') {
      continue;
    }

    let fileId = file.id;
    let mime = (file.mimeType || '').toLowerCase();
    const lowerName = (file.name || '').toLowerCase();
    const fileLabel = file.folderPath ? `${file.folderPath} / ${file.name}` : file.name;

    try {
      // 0. Resolve Google Drive shortcuts if needed
      if (mime === 'application/vnd.google-apps.shortcut') {
        const metaRes = await driveFetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=shortcutDetails(targetId,targetMimeType)&supportsAllDrives=true`,
          accessToken
        );
        if (metaRes.ok) {
          const metaJson = await metaRes.json();
          if (metaJson?.shortcutDetails?.targetId) {
            fileId = metaJson.shortcutDetails.targetId;
          }
          if (metaJson?.shortcutDetails?.targetMimeType) {
            mime = String(metaJson.shortcutDetails.targetMimeType).toLowerCase();
          }
        }
        if (mime === 'application/vnd.google-apps.folder') {
          continue;
        }
      }

      // 1. Google Docs
      if (mime === 'application/vnd.google-apps.document') {
        const res = await driveFetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`,
          accessToken
        );
        let text = '';
        if (res.ok) {
          text = (await res.text()).slice(0, MAX_TEXT_CHARS).trim();
        } else {
          const errInfo = await parseGoogleApiError(res);
          // Fallback to PDF export if text export failed or was restricted
          const pdfRes = await driveFetch(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=application/pdf`,
            accessToken
          );
          if (!pdfRes.ok) {
            throw new Error(errInfo.message);
          }
          const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
          if (pdfBuf.length <= MAX_BINARY_BYTES) {
            result.inlineParts.push({
              fileName: `${fileLabel}.pdf`,
              mimeType: 'application/pdf',
              data: pdfBuf.toString('base64'),
            });
            result.textSummaries.push(`=== ATTACHED GOOGLE DOC (AS PDF): ${fileLabel} ===`);
            result.analyzedFiles.push({ name: file.name, status: 'Analyzed Google Doc PDF' });
            continue;
          }
        }

        if (text) {
          result.textSummaries.push(`=== FILE: ${fileLabel} (Google Doc) ===\n${text}`);
          result.analyzedFiles.push({ name: file.name, status: 'Extracted Google Doc text' });
        } else {
          // Visual/image-only Google Doc -> export as PDF so Gemini can read embedded images
          const pdfRes = await driveFetch(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=application/pdf`,
            accessToken
          );
          if (pdfRes.ok) {
            const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
            if (pdfBuf.length > 0 && pdfBuf.length <= MAX_BINARY_BYTES) {
              result.inlineParts.push({
                fileName: `${fileLabel}.pdf`,
                mimeType: 'application/pdf',
                data: pdfBuf.toString('base64'),
              });
              result.textSummaries.push(`=== ATTACHED GOOGLE DOC (VISUAL PDF): ${fileLabel} ===`);
              result.analyzedFiles.push({ name: file.name, status: 'Analyzed visual Google Doc' });
              continue;
            }
          }
          result.textSummaries.push(`=== FILE: ${fileLabel} (Empty Google Doc) ===`);
          result.analyzedFiles.push({ name: file.name, status: 'Empty Google Doc' });
        }
        continue;
      }

      // 2. Google Sheets
      if (mime === 'application/vnd.google-apps.spreadsheet') {
        const res = await driveFetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/csv`,
          accessToken
        );
        if (!res.ok) {
          const errInfo = await parseGoogleApiError(res);
          throw new Error(errInfo.message);
        }
        const csv = (await res.text()).slice(0, MAX_TEXT_CHARS).trim();
        if (csv) {
          result.textSummaries.push(`=== FILE: ${fileLabel} (Google Sheet CSV) ===\n${csv}`);
          result.analyzedFiles.push({ name: file.name, status: 'Extracted Google Sheet data' });
        } else {
          result.textSummaries.push(`=== FILE: ${fileLabel} (Empty Google Sheet) ===`);
          result.analyzedFiles.push({ name: file.name, status: 'Empty Google Sheet' });
        }
        continue;
      }

      // 3. Google Slides (extract both text and PDF visual slides if small enough)
      if (mime === 'application/vnd.google-apps.presentation') {
        const res = await driveFetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`,
          accessToken
        );
        let text = '';
        if (res.ok) {
          text = (await res.text()).slice(0, MAX_TEXT_CHARS).trim();
        }
        if (text) {
          result.textSummaries.push(`=== FILE: ${fileLabel} (Google Slides) ===\n${text}`);
        }
        // Also attach PDF export for visual style guides / decks
        const pdfRes = await driveFetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=application/pdf`,
          accessToken
        );
        if (pdfRes.ok) {
          const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
          if (pdfBuf.length > 0 && pdfBuf.length <= MAX_BINARY_BYTES) {
            result.inlineParts.push({
              fileName: `${fileLabel}.pdf`,
              mimeType: 'application/pdf',
              data: pdfBuf.toString('base64'),
            });
            if (!text) {
              result.textSummaries.push(`=== ATTACHED GOOGLE SLIDES (PDF): ${fileLabel} ===`);
            }
            result.analyzedFiles.push({ name: file.name, status: 'Analyzed Google Slides (text + visual)' });
            continue;
          }
        }
        if (!res.ok && !text) {
          const errInfo = await parseGoogleApiError(res);
          throw new Error(errInfo.message);
        }
        result.analyzedFiles.push({ name: file.name, status: 'Extracted Google Slides text' });
        continue;
      }

      // 4. Google Drawings -> export PNG
      if (mime === 'application/vnd.google-apps.drawing') {
        const res = await driveFetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=image/png`,
          accessToken
        );
        if (!res.ok) {
          const errInfo = await parseGoogleApiError(res);
          throw new Error(errInfo.message);
        }
        const buf = Buffer.from(await res.arrayBuffer());
        const base64 = buf.toString('base64');
        result.inlineParts.push({ fileName: fileLabel, mimeType: 'image/png', data: base64 });
        result.imageFiles.push({ fileId, fileName: `${file.name}.png`, mimeType: 'image/png', data: base64 });
        result.textSummaries.push(`=== ATTACHED GOOGLE DRAWING: ${fileLabel} ===`);
        result.analyzedFiles.push({ name: file.name, status: 'Exported Google Drawing PNG' });
        continue;
      }

      // 5. Other non-exportable Google Workspace native types (Forms, Sites, etc.)
      if (mime.startsWith('application/vnd.google-apps.')) {
        result.textSummaries.push(`=== GOOGLE WORKSPACE FILE: ${fileLabel} (${file.mimeType}) ===`);
        result.analyzedFiles.push({ name: file.name, status: `Cataloged (${file.mimeType})` });
        continue;
      }

      // Skip huge video/audio binaries
      const knownSize = file.size ? Number(file.size) : 0;
      if (mime.startsWith('video/') || mime.startsWith('audio/')) {
        result.textSummaries.push(
          `=== MEDIA ASSET: ${fileLabel} (${file.mimeType}${knownSize ? `, ${(knownSize / (1024 * 1024)).toFixed(1)} MB` : ''}) ===`
        );
        result.analyzedFiles.push({ name: file.name, status: 'Cataloged media asset metadata' });
        continue;
      }

      if (knownSize > MAX_BINARY_BYTES) {
        result.warnings.push(`Skipped downloading "${file.name}" because it exceeds 14 MB.`);
        result.textSummaries.push(
          `=== FILE: ${fileLabel} (${file.mimeType}, ${(knownSize / (1024 * 1024)).toFixed(1)} MB — too large to inline) ===`
        );
        result.analyzedFiles.push({ name: file.name, status: 'Cataloged metadata (>14MB)' });
        continue;
      }

      // 6. Download binary / text file via alt=media
      const res = await driveFetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true&acknowledgeAbuse=true`,
        accessToken
      );
      if (!res.ok) {
        const errInfo = await parseGoogleApiError(res);
        throw new Error(errInfo.message);
      }
      const arrayBuf = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);

      if (buffer.length > MAX_BINARY_BYTES) {
        result.warnings.push(`"${file.name}" exceeded 14 MB limit and was only cataloged by name.`);
        result.textSummaries.push(`=== FILE: ${fileLabel} (${file.mimeType}, >14MB) ===`);
        result.analyzedFiles.push({ name: file.name, status: 'Cataloged metadata (>14MB)' });
        continue;
      }

      // PDF -> pass directly to Gemini as inlineData
      if (mime === 'application/pdf' || lowerName.endsWith('.pdf')) {
        result.inlineParts.push({
          fileName: fileLabel,
          mimeType: 'application/pdf',
          data: buffer.toString('base64'),
        });
        result.textSummaries.push(`=== ATTACHED PDF DOCUMENT: ${fileLabel} ===`);
        result.analyzedFiles.push({ name: file.name, status: 'Analyzed PDF document' });
        continue;
      }

      // Images -> pass to Gemini visually AND save for product gallery import
      if (
        mime === 'image/png' ||
        mime === 'image/jpeg' ||
        mime === 'image/jpg' ||
        mime === 'image/webp' ||
        /\.(png|jpe?g|webp)$/i.test(lowerName)
      ) {
        const cleanMime =
          mime === 'image/png' || lowerName.endsWith('.png')
            ? 'image/png'
            : mime === 'image/webp' || lowerName.endsWith('.webp')
              ? 'image/webp'
              : 'image/jpeg';
        const base64 = buffer.toString('base64');
        result.inlineParts.push({
          fileName: fileLabel,
          mimeType: cleanMime,
          data: base64,
        });
        result.imageFiles.push({
          fileId,
          fileName: file.name,
          mimeType: cleanMime,
          data: base64,
        });
        result.textSummaries.push(`=== ATTACHED IMAGE ASSET: ${fileLabel} ===`);
        result.analyzedFiles.push({ name: file.name, status: 'Analyzed image & ready to import' });
        continue;
      }

      // SVG -> read as UTF-8 text
      if (mime === 'image/svg+xml' || lowerName.endsWith('.svg')) {
        const svgText = buffer.toString('utf-8').slice(0, MAX_TEXT_CHARS);
        result.textSummaries.push(`=== VECTOR ASSET (SVG): ${fileLabel} ===\n${svgText}`);
        result.analyzedFiles.push({ name: file.name, status: 'Read SVG vector asset' });
        continue;
      }

      // DOCX
      if (
        mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        lowerName.endsWith('.docx')
      ) {
        const text = (await extractDocxText(buffer)).slice(0, MAX_TEXT_CHARS);
        if (text) {
          result.textSummaries.push(`=== FILE: ${fileLabel} (DOCX) ===\n${text}`);
          result.analyzedFiles.push({ name: file.name, status: 'Extracted DOCX text' });
        } else {
          result.textSummaries.push(`=== FILE: ${fileLabel} (DOCX — no plain text found) ===`);
          result.analyzedFiles.push({ name: file.name, status: 'No readable text found in DOCX' });
        }
        continue;
      }

      // PPTX
      if (
        mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        lowerName.endsWith('.pptx')
      ) {
        const text = (await extractPptxText(buffer)).slice(0, MAX_TEXT_CHARS);
        if (text) {
          result.textSummaries.push(`=== FILE: ${fileLabel} (PPTX) ===\n${text}`);
          result.analyzedFiles.push({ name: file.name, status: 'Extracted PPTX slide text' });
        } else {
          result.textSummaries.push(`=== FILE: ${fileLabel} (PPTX) ===`);
          result.analyzedFiles.push({ name: file.name, status: 'Cataloged PPTX' });
        }
        continue;
      }

      // XLSX
      if (
        mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        lowerName.endsWith('.xlsx')
      ) {
        const text = (await extractXlsxText(buffer)).slice(0, MAX_TEXT_CHARS);
        if (text) {
          result.textSummaries.push(`=== FILE: ${fileLabel} (XLSX) ===\n${text}`);
          result.analyzedFiles.push({ name: file.name, status: 'Extracted XLSX spreadsheet text' });
        } else {
          result.textSummaries.push(`=== FILE: ${fileLabel} (XLSX) ===`);
          result.analyzedFiles.push({ name: file.name, status: 'Cataloged XLSX' });
        }
        continue;
      }

      // Plain text / Markdown / CSV / JSON / RTF
      if (
        mime.startsWith('text/') ||
        mime === 'application/json' ||
        /\.(txt|md|csv|json|rtf)$/i.test(lowerName)
      ) {
        const text = buffer.toString('utf-8').slice(0, MAX_TEXT_CHARS).trim();
        if (text) {
          result.textSummaries.push(`=== FILE: ${fileLabel} ===\n${text}`);
          result.analyzedFiles.push({ name: file.name, status: 'Read text file' });
        }
        continue;
      }

      result.textSummaries.push(`=== OTHER FILE: ${fileLabel} (${file.mimeType}) ===`);
      result.analyzedFiles.push({ name: file.name, status: `Cataloged (${file.mimeType})` });
    } catch (err) {
      if (err instanceof DriveAuthError) throw err;
      const msg = err instanceof Error ? err.message : 'Download failed';
      result.warnings.push(`Could not read "${file.name}": ${msg}`);
      result.analyzedFiles.push({ name: file.name, status: `Error: ${msg}` });
    }
  }

  return result;
}

export function extractFolderIdFromUrl(urlOrId?: string): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();
  if (!trimmed) return null;
  if (!trimmed.includes('/') && /^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) return match[1];
  const queryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (queryMatch && queryMatch[1]) return queryMatch[1];
  return null;
}

export function generateShotListPdfBuffer(project: PipelineProject): Buffer {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const margin = 42;
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - margin * 2;
  let y = 48;

  const ensureSpace = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - 48) {
      doc.addPage();
      y = 48;
    }
  };

  const addWrappedText = (text: string, fontSize = 10, isBold = false, color: [number, number, number] = [30, 30, 35]) => {
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(text || '', maxWidth) as string[];
    const lineHeight = fontSize * 1.35;
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, margin, y);
      y += lineHeight;
    }
  };

  // Title Header
  addWrappedText('52LAUNCH PRODUCTION STUDIO — SHOT LIST & PRODUCTION PACKET', 14, true, [20, 20, 25]);
  addWrappedText(`Client: ${project.client}   |   Product: ${project.product.name}`, 11, true, [180, 100, 10]);
  addWrappedText(`Updated: ${new Date(project.updatedAt || Date.now()).toLocaleString()}`, 8.5, false, [110, 110, 120]);
  y += 10;

  if (project.product.description) {
    addWrappedText('Product Summary', 11, true);
    addWrappedText(project.product.description, 9.5, false);
    y += 6;
  }

  if (project.creativeBrief?.hasGenerated) {
    addWrappedText('Creative Brief', 11, true);
    addWrappedText(`Objective: ${project.creativeBrief.objective}`, 9.5, false);
    addWrappedText(`Key Message: ${project.creativeBrief.keyMessage}`, 9.5, false);
    y += 8;
  }

  addWrappedText(`Master Shot List (${project.shots.length} Shots)`, 12, true);
  y += 4;

  if (project.shots.length === 0) {
    addWrappedText('No shots generated yet. Approve Brand Bible and Creative Brief to populate shots.', 9.5, false, [100, 100, 110]);
  } else {
    for (const shot of project.shots) {
      ensureSpace(72);
      doc.setDrawColor(215, 218, 224);
      doc.line(margin, y, pageWidth - margin, y);
      y += 12;
      addWrappedText(
        `${shot.id} · ${shot.durationSec}s · ${shot.route.toUpperCase()} (${shot.model}) · ${shot.deliverable} · Status: ${shot.status}`,
        10,
        true,
        [20, 20, 25]
      );
      addWrappedText(`Scene: ${shot.scene}`, 9.5, false);
      if (shot.voLine) addWrappedText(`VO: "${shot.voLine}"`, 9, false, [70, 70, 85]);
      if (shot.shootDirection) addWrappedText(`Crew Direction: ${shot.shootDirection}`, 9, false, [70, 70, 85]);
      if (shot.framePrompt) addWrappedText(`Frame Prompt: ${shot.framePrompt}`, 8.5, false, [100, 100, 110]);
      y += 6;
    }
  }

  if (project.shootPlan?.hasGenerated && project.shootPlan.shootDays.length > 0) {
    y += 8;
    addWrappedText('Shoot Days & Call Sheet Summary', 12, true);
    for (const day of project.shootPlan.shootDays) {
      ensureSpace(48);
      addWrappedText(
        `${day.dayLabel} — ${day.location} (Call: ${day.callTime} | Wrap: ${day.wrapTime})`,
        10,
        true
      );
      for (const setup of day.setups) {
        addWrappedText(
          `  • ${setup.setupName} [${setup.shotIds.join(', ')}] (${setup.estimatedMinutes}m) — ${setup.lightingNotes}`,
          9,
          false
        );
      }
      y += 4;
    }
  }

  return Buffer.from(doc.output('arraybuffer'));
}

async function createDriveFolder(
  accessToken: string,
  name: string,
  parentId?: string
): Promise<{ id: string; webViewLink?: string }> {
  const metadata: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) {
    metadata.parents = [parentId];
  }
  const res = await driveFetch(
    'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink&supportsAllDrives=true',
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Could not create Drive folder (${res.status}): ${text}`);
  }
  return res.json();
}

async function findDriveItemByName(
  accessToken: string,
  name: string,
  parentId?: string,
  mimeType?: string
): Promise<{ id: string; webViewLink?: string } | null> {
  const escapedName = name.replace(/'/g, "\\'");
  let q = `name = '${escapedName}' and trashed = false`;
  if (parentId) q += ` and '${parentId}' in parents`;
  if (mimeType) q += ` and mimeType = '${mimeType}'`;

  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    accessToken
  );
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data.files) && data.files.length > 0 ? data.files[0] : null;
}

async function ensureBackupFolder(
  project: PipelineProject,
  accessToken: string,
  preferredFolderUrl?: string
): Promise<{ folderId: string; folderUrl: string }> {
  // 0. Prioritize explicitly selected destination folder if set by user
  if (project.googleDriveDestinationFolderId) {
    try {
      const check = await driveFetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(project.googleDriveDestinationFolderId)}?fields=id,trashed,webViewLink&supportsAllDrives=true`,
        accessToken
      );
      if (check.ok) {
        const data = await check.json();
        if (!data.trashed) {
          return {
            folderId: data.id,
            folderUrl: data.webViewLink || `https://drive.google.com/drive/folders/${data.id}`,
          };
        }
      }
    } catch {
      // Fall through if permission denied or deleted
    }
  }

  // 1. Reuse already-provisioned backup folder if it still exists
  if (project.googleDriveBackupFolderId) {
    const check = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(project.googleDriveBackupFolderId)}?fields=id,trashed,webViewLink&supportsAllDrives=true`,
      accessToken
    );
    if (check.ok) {
      const data = await check.json();
      if (!data.trashed) {
        return {
          folderId: data.id,
          folderUrl: data.webViewLink || `https://drive.google.com/drive/folders/${data.id}`,
        };
      }
    }
  }

  // 2. Try creating/reusing an auto-save subfolder inside the user's linked Drive folder
  const linkedFolderId = extractFolderIdFromUrl(
    preferredFolderUrl || project.googleDriveFolderUrls?.[0] || project.googleDriveFolderUrl
  );
  if (linkedFolderId) {
    try {
      const existingSub = await findDriveItemByName(
        accessToken,
        '52Launch Auto-Save',
        linkedFolderId,
        'application/vnd.google-apps.folder'
      );
      if (existingSub) {
        return {
          folderId: existingSub.id,
          folderUrl: existingSub.webViewLink || `https://drive.google.com/drive/folders/${existingSub.id}`,
        };
      }
      const createdSub = await createDriveFolder(accessToken, '52Launch Auto-Save', linkedFolderId);
      return {
        folderId: createdSub.id,
        folderUrl: createdSub.webViewLink || `https://drive.google.com/drive/folders/${createdSub.id}`,
      };
    } catch {
      // Under drive.file scope, writing inside an externally-created folder can return 403/404.
      // Fall through cleanly to creating/reusing an app-owned project folder in the user's Drive.
    }
  }

  // 3. Create/reuse dedicated app-owned folder in My Drive (always permitted under drive.file)
  const folderName = `52Launch Studio — ${project.client} (${project.product.name})`;
  const existingRoot = await findDriveItemByName(
    accessToken,
    folderName,
    undefined,
    'application/vnd.google-apps.folder'
  );
  if (existingRoot) {
    return {
      folderId: existingRoot.id,
      folderUrl: existingRoot.webViewLink || `https://drive.google.com/drive/folders/${existingRoot.id}`,
    };
  }
  const createdRoot = await createDriveFolder(accessToken, folderName);
  return {
    folderId: createdRoot.id,
    folderUrl: createdRoot.webViewLink || `https://drive.google.com/drive/folders/${createdRoot.id}`,
  };
}

async function upsertDriveFile(
  accessToken: string,
  folderId: string,
  filename: string,
  mimeType: string,
  content: Buffer
): Promise<string> {
  const existing = await findDriveItemByName(accessToken, filename, folderId);
  const boundary = `52launch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const metadata: Record<string, unknown> = existing
    ? { name: filename }
    : { name: filename, parents: [folderId] };

  const metaPart = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`
  );
  const mediaHeader = Buffer.from(
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
  );
  const ending = Buffer.from(`\r\n--${boundary}--`);
  const body = Buffer.concat([metaPart, mediaHeader, content, ending]);

  const uploadUrl = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existing.id)}?uploadType=multipart&fields=id,name,webViewLink&supportsAllDrives=true`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink&supportsAllDrives=true`;

  const res = await driveFetch(uploadUrl, accessToken, {
    method: existing ? 'PATCH' : 'POST',
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Upload failed for ${filename} (${res.status}): ${errText}`);
  }

  return filename;
}

export async function syncProjectAssetsToDrive(
  project: PipelineProject,
  accessToken: string,
  preferredFolderUrl?: string
): Promise<{
  backupFolderId: string;
  backupFolderUrl: string;
  uploadedFiles: string[];
}> {
  const { folderId, folderUrl } = await ensureBackupFolder(
    project,
    accessToken,
    preferredFolderUrl
  );

  const slug =
    `${project.product?.name || project.client || 'project'}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'project';

  const uploadedFiles: string[] = [];

  // 1. Project JSON backup
  const jsonBuffer = Buffer.from(JSON.stringify(project, null, 2), 'utf-8');
  uploadedFiles.push(
    await upsertDriveFile(accessToken, folderId, `${slug}-project.json`, 'application/json', jsonBuffer)
  );

  // 2. Shot List & Production PDF
  const pdfBuffer = generateShotListPdfBuffer(project);
  uploadedFiles.push(
    await upsertDriveFile(accessToken, folderId, `${slug}-shotlist.pdf`, 'application/pdf', pdfBuffer)
  );

  // 3. Storyboard frame images
  for (const shot of project.shots || []) {
    if (!shot.frameImageUrl) continue;
    const inline = await readAssetAsInlineData(project.id, shot.frameImageUrl);
    if (!inline) continue;
    const ext = inline.mimeType.includes('jpeg')
      ? 'jpg'
      : inline.mimeType.includes('webp')
        ? 'webp'
        : 'png';
    const frameBuf = Buffer.from(inline.data, 'base64');
    uploadedFiles.push(
      await upsertDriveFile(
        accessToken,
        folderId,
        `${shot.id}-storyboard-frame.${ext}`,
        inline.mimeType,
        frameBuf
      )
    );
  }

  return {
    backupFolderId: folderId,
    backupFolderUrl: folderUrl,
    uploadedFiles,
  };
}

export async function downloadDriveBinaryAsset(
  file: DriveFileDescriptor,
  accessToken: string
): Promise<{
  fileId: string;
  fileName: string;
  mimeType: string;
  ext: string;
  buffer: Buffer;
}> {
  let fileId = file.id;
  let mime = (file.mimeType || '').toLowerCase();
  let fileName = file.name || `drive-asset-${file.id}`;
  const MAX_ASSET_BYTES = 95 * 1024 * 1024; // 95 MB

  // Resolve Google Drive shortcut if needed
  if (mime === 'application/vnd.google-apps.shortcut') {
    const metaRes = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=name,mimeType,shortcutDetails(targetId,targetMimeType)&supportsAllDrives=true`,
      accessToken
    );
    if (metaRes.ok) {
      const metaJson = await metaRes.json();
      if (metaJson?.shortcutDetails?.targetId) {
        fileId = metaJson.shortcutDetails.targetId;
      }
      if (metaJson?.shortcutDetails?.targetMimeType) {
        mime = String(metaJson.shortcutDetails.targetMimeType).toLowerCase();
      }
    }
  }

  if (mime === 'application/vnd.google-apps.folder') {
    throw new Error(`"${fileName}" is a folder, not a downloadable file.`);
  }

  // Export Google Drawing as PNG
  if (mime === 'application/vnd.google-apps.drawing') {
    const res = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=image/png`,
      accessToken
    );
    if (!res.ok) {
      const errInfo = await parseGoogleApiError(res);
      throw new Error(errInfo.message);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return {
      fileId,
      fileName: fileName.endsWith('.png') ? fileName : `${fileName}.png`,
      mimeType: 'image/png',
      ext: 'png',
      buffer,
    };
  }

  if (mime.startsWith('application/vnd.google-apps.')) {
    throw new Error(`"${fileName}" is a Google Workspace document, not an image, video, or audio file.`);
  }

  const knownSize = file.size ? Number(file.size) : 0;
  if (knownSize > MAX_ASSET_BYTES) {
    throw new Error(`"${fileName}" exceeds the 95 MB import limit (${(knownSize / (1024 * 1024)).toFixed(1)} MB).`);
  }

  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true&acknowledgeAbuse=true`,
    accessToken
  );
  if (!res.ok) {
    const errInfo = await parseGoogleApiError(res);
    throw new Error(errInfo.message);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_ASSET_BYTES) {
    throw new Error(`"${fileName}" exceeds the 95 MB import limit.`);
  }

  const lower = fileName.toLowerCase();
  let ext = 'bin';
  let resolvedMime = mime || 'application/octet-stream';

  if (mime.includes('png') || lower.endsWith('.png')) {
    ext = 'png';
    resolvedMime = 'image/png';
  } else if (mime.includes('webp') || lower.endsWith('.webp')) {
    ext = 'webp';
    resolvedMime = 'image/webp';
  } else if (mime.includes('gif') || lower.endsWith('.gif')) {
    ext = 'gif';
    resolvedMime = 'image/gif';
  } else if (mime.includes('jpeg') || mime.includes('jpg') || /\.jpe?g$/i.test(lower)) {
    ext = 'jpg';
    resolvedMime = 'image/jpeg';
  } else if (mime.includes('quicktime') || lower.endsWith('.mov')) {
    ext = 'mov';
    resolvedMime = 'video/quicktime';
  } else if (mime.includes('webm') || lower.endsWith('.webm')) {
    ext = 'webm';
    resolvedMime = 'video/webm';
  } else if (mime.includes('mp4') || lower.endsWith('.mp4')) {
    ext = 'mp4';
    resolvedMime = 'video/mp4';
  } else if (mime.includes('wav') || lower.endsWith('.wav')) {
    ext = 'wav';
    resolvedMime = 'audio/wav';
  } else if (mime.includes('mpeg') || mime.includes('mp3') || lower.endsWith('.mp3')) {
    ext = 'mp3';
    resolvedMime = 'audio/mpeg';
  } else if (mime.includes('mp4') && mime.startsWith('audio/')) {
    ext = 'm4a';
    resolvedMime = 'audio/mp4';
  } else if (lower.endsWith('.m4a')) {
    ext = 'm4a';
    resolvedMime = 'audio/mp4';
  } else if (mime.includes('ogg') || lower.endsWith('.ogg')) {
    ext = 'ogg';
    resolvedMime = 'audio/ogg';
  } else if (mime.includes('aac') || lower.endsWith('.aac')) {
    ext = 'aac';
    resolvedMime = 'audio/aac';
  } else if (mime.includes('pdf') || lower.endsWith('.pdf')) {
    ext = 'pdf';
    resolvedMime = 'application/pdf';
  }

  return {
    fileId,
    fileName,
    mimeType: resolvedMime,
    ext,
    buffer,
  };
}

