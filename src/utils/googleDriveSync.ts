import firebaseConfig from '../../firebase-applet-config.json';
import { BrandGuideDocument, ExtractedStyleGuide } from '../types/pipeline';

export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
];

export interface DriveUser {
  email: string | null;
  displayName?: string | null;
  photoURL?: string | null;
}

declare global {
  interface Window {
    google?: {
      picker?: {
        PickerBuilder: any;
        DocsView: any;
        ViewId: any;
        DocsViewMode: any;
        Feature: any;
        Action: any;
        Response: any;
        Document: any;
      };
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string; error_description?: string }) => void;
          }) => {
            requestAccessToken: (options?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

// In-memory token caching (never localStorage/sessionStorage)
let cachedAccessToken: string | null = null;
let cachedUser: DriveUser | null = null;
let authSuccessCallback: ((user: DriveUser, token: string) => void) | null = null;
let authFailureCallback: (() => void) | null = null;

function loadGsiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const existing = document.getElementById('gsi-client-script');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', (e) => reject(e));
      return;
    }
    const script = document.createElement('script');
    script.id = 'gsi-client-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });
}

export function initDriveAuth(
  onAuthSuccess?: (user: DriveUser, token: string) => void,
  onAuthFailure?: () => void
) {
  authSuccessCallback = onAuthSuccess || null;
  authFailureCallback = onAuthFailure || null;

  if (cachedAccessToken && cachedUser) {
    if (onAuthSuccess) onAuthSuccess(cachedUser, cachedAccessToken);
  } else {
    if (onAuthFailure) onAuthFailure();
  }

  return () => {
    // cleanup
  };
}

export async function getGoogleDriveAccessToken(): Promise<string | null> {
  return cachedAccessToken;
}

export function getGoogleDriveUser(): DriveUser | null {
  return cachedUser;
}

export function clearGoogleDriveToken(): void {
  cachedAccessToken = null;
  cachedUser = null;
}

export async function signInWithGoogleDrive(forceConsent = false): Promise<{
  user: DriveUser;
  accessToken: string;
}> {
  await loadGsiScript();

  return new Promise((resolve, reject) => {
    try {
      const clientId = (firebaseConfig as any).oAuthClientId;
      if (!clientId) {
        throw new Error('Missing oAuthClientId in firebase-applet-config.json');
      }

      const tokenClient = window.google?.accounts?.oauth2?.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPES.join(' '),
        callback: async (resp: any) => {
          if (resp.error) {
            reject(
              new Error(
                resp.error_description || resp.error || 'Google OAuth authentication failed'
              )
            );
            return;
          }
          const accessToken = resp.access_token;
          if (!accessToken) {
            reject(new Error('No access token returned from Google Drive.'));
            return;
          }

          let userInfo: DriveUser = {
            email: 'user@gmail.com',
            displayName: 'Google User',
            photoURL: undefined,
          };
          try {
            const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (userRes.ok) {
              const uData = await userRes.json();
              userInfo = {
                email: uData.email || 'user@gmail.com',
                displayName: uData.name || 'Google User',
                photoURL: uData.picture,
              };
            }
          } catch {
            // ignore
          }

          cachedAccessToken = accessToken;
          cachedUser = userInfo;
          if (authSuccessCallback) {
            authSuccessCallback(userInfo, accessToken);
          }
          resolve({ user: userInfo, accessToken });
        },
      });

      if (!tokenClient) {
        throw new Error('Google Identity Services failed to initialize.');
      }

      if (forceConsent) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
      } else {
        tokenClient.requestAccessToken({ prompt: '' });
      }
    } catch (err) {
      reject(err);
    }
  });
}

export async function signInWithSandboxMode(): Promise<{
  user: DriveUser;
  accessToken: string;
}> {
  const userInfo: DriveUser = {
    email: 'nblanchette@52launch.com',
    displayName: '52Launch Director (Sandbox)',
    photoURL: undefined,
  };
  cachedAccessToken = 'sandbox-token-52launch';
  cachedUser = userInfo;
  if (authSuccessCallback) {
    authSuccessCallback(userInfo, cachedAccessToken);
  }
  return { user: userInfo, accessToken: cachedAccessToken };
}

export async function logoutGoogleDrive(): Promise<void> {
  cachedAccessToken = null;
  cachedUser = null;
  if (authFailureCallback) {
    authFailureCallback();
  }
}

export function extractDriveFolderId(urlOrId?: string): string | null {
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

export function extractDriveFileId(urlOrId?: string): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();
  if (!trimmed) return null;
  if (/\/folders\//.test(trimmed)) return null;
  if (!trimmed.includes('/') && /^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) {
    return trimmed;
  }
  const fileMatch = trimmed.match(
    /\/(?:file|document|spreadsheets|presentation|drawings)\/d\/([a-zA-Z0-9_-]+)/
  );
  if (fileMatch && fileMatch[1]) return fileMatch[1];
  const openMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (openMatch && openMatch[1]) return openMatch[1];
  return null;
}

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  thumbnailLink?: string;
  iconLink?: string;
  folderUrl?: string;
  folderPath?: string;
  size?: string;
  modifiedTime?: string;
}

interface RawDriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  thumbnailLink?: string;
  iconLink?: string;
  size?: string;
  modifiedTime?: string;
  shortcutDetails?: {
    targetId?: string;
    targetMimeType?: string;
  };
}

async function fetchFolderChildren(
  folderId: string,
  accessToken: string
): Promise<RawDriveFile[]> {
  const query = `'${folderId}' in parents and trashed = false`;
  const url =
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}` +
    `&fields=files(id,name,mimeType,webViewLink,thumbnailLink,iconLink,size,modifiedTime,shortcutDetails(targetId,targetMimeType))` +
    `&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=100`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('Google Drive session expired. Please sign in with Google again.');
  }

  if (!res.ok) {
    let apiMessage = `Google Drive returned HTTP ${res.status}.`;
    try {
      const errJson = await res.json();
      if (errJson?.error?.message) {
        apiMessage = errJson.error.message;
      }
    } catch {
      // ignore
    }
    throw new Error(`Could not access Google Drive folder (${folderId}): ${apiMessage}`);
  }

  const data = await res.json();
  return Array.isArray(data.files) ? data.files : [];
}

export async function listGoogleDriveFolderFiles(
  folderUrls: string[],
  accessToken: string
): Promise<DriveFileItem[]> {
  if (!accessToken) {
    throw new Error('Please sign in with Google first to read your Drive folders.');
  }

  const allFiles: DriveFileItem[] = [];
  const seenIds = new Set<string>();

  for (const rawUrl of folderUrls) {
    const url = rawUrl.trim();
    if (!url) continue;

    const rootFolderId = extractDriveFolderId(url);
    if (!rootFolderId) {
      throw new Error(
        `Invalid Google Drive folder URL: "${url}". Expected a link containing /folders/<ID>.`
      );
    }

    const queue: Array<{ id: string; pathPrefix: string; depth: number }> = [
      { id: rootFolderId, pathPrefix: '', depth: 0 },
    ];
    const visitedFolders = new Set<string>([rootFolderId]);

    while (queue.length > 0 && allFiles.length < 150) {
      const current = queue.shift()!;
      const children = await fetchFolderChildren(current.id, accessToken);

      for (const child of children) {
        let resolvedId = child.id;
        let resolvedMime = child.mimeType;

        if (
          child.mimeType === 'application/vnd.google-apps.shortcut' &&
          child.shortcutDetails?.targetId
        ) {
          resolvedId = child.shortcutDetails.targetId;
          if (child.shortcutDetails.targetMimeType) {
            resolvedMime = child.shortcutDetails.targetMimeType;
          }
        }

        if (resolvedMime === 'application/vnd.google-apps.folder') {
          if (current.depth < 3 && !visitedFolders.has(resolvedId)) {
            visitedFolders.add(resolvedId);
            queue.push({
              id: resolvedId,
              pathPrefix: current.pathPrefix
                ? `${current.pathPrefix} / ${child.name}`
                : child.name,
              depth: current.depth + 1,
            });
          }
          continue;
        }

        if (!seenIds.has(resolvedId)) {
          seenIds.add(resolvedId);
          allFiles.push({
            id: resolvedId,
            name: child.name,
            mimeType: resolvedMime,
            webViewLink: child.webViewLink,
            thumbnailLink: child.thumbnailLink,
            iconLink: child.iconLink,
            size: child.size,
            modifiedTime: child.modifiedTime,
            folderUrl: url,
            folderPath: current.pathPrefix || undefined,
          });
        }
      }
    }
  }

  return allFiles;
}

export async function getDriveFileMetadata(
  fileId: string,
  accessToken: string
): Promise<DriveFileItem> {
  if (!accessToken) {
    throw new Error('Please sign in with Google first.');
  }
  const url =
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}` +
    `?fields=id,name,mimeType,webViewLink,thumbnailLink,iconLink,size,modifiedTime,shortcutDetails(targetId,targetMimeType)` +
    `&supportsAllDrives=true`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('Google Drive session expired. Please sign in with Google again.');
  }
  if (!res.ok) {
    let apiMessage = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      if (err?.error?.message) apiMessage = err.error.message;
    } catch {
      // ignore
    }
    throw new Error(`Could not load Google Drive file (${fileId}): ${apiMessage}`);
  }
  const f = (await res.json()) as RawDriveFile;
  return {
    id: f.shortcutDetails?.targetId || f.id,
    name: f.name,
    mimeType: f.shortcutDetails?.targetMimeType || f.mimeType,
    webViewLink: f.webViewLink,
    thumbnailLink: f.thumbnailLink,
    iconLink: f.iconLink,
    size: f.size,
    modifiedTime: f.modifiedTime,
  };
}

export interface DriveExplorerItem {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  webViewLink?: string;
  thumbnailLink?: string;
  iconLink?: string;
  size?: string;
  modifiedTime?: string;
}

export interface SharedDriveItem {
  id: string;
  name: string;
}

export async function listSharedDrives(accessToken: string): Promise<SharedDriveItem[]> {
  if (!accessToken) return [];
  try {
    const res = await fetch('https://www.googleapis.com/drive/v3/drives?pageSize=50', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.drives)
      ? data.drives.map((d: { id: string; name: string }) => ({ id: d.id, name: d.name }))
      : [];
  } catch {
    return [];
  }
}

export async function listDriveExplorerItems(params: {
  accessToken: string;
  folderId?: string;
  sharedWithMe?: boolean;
  sharedDriveId?: string;
  searchQuery?: string;
}): Promise<DriveExplorerItem[]> {
  const { accessToken, folderId, sharedWithMe, sharedDriveId, searchQuery } = params;
  if (!accessToken) {
    throw new Error('Please sign in with Google first.');
  }

  let query = 'trashed = false';
  const cleanSearch = (searchQuery || '').trim().replace(/'/g, "\\'");

  if (cleanSearch) {
    query += ` and name contains '${cleanSearch}'`;
  } else if (sharedWithMe) {
    query += ' and sharedWithMe = true';
  } else if (sharedDriveId) {
    const target = folderId || sharedDriveId;
    query += ` and '${target}' in parents`;
  } else {
    const target = folderId && folderId !== 'root' ? folderId : 'root';
    query += ` and '${target}' in parents`;
  }

  let url =
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}` +
    `&fields=files(id,name,mimeType,webViewLink,thumbnailLink,iconLink,size,modifiedTime,shortcutDetails(targetId,targetMimeType))` +
    `&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true` +
    `&orderBy=folder,name_natural,modifiedTime desc`;

  if (sharedDriveId && !cleanSearch) {
    url += `&corpora=drive&driveId=${encodeURIComponent(sharedDriveId)}`;
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('Google Drive session expired. Please sign in with Google again.');
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      if (err?.error?.message) msg = err.error.message;
    } catch {}
    throw new Error(`Could not browse Google Drive: ${msg}`);
  }

  const data = await res.json();
  const rawFiles: RawDriveFile[] = Array.isArray(data.files) ? data.files : [];

  return rawFiles.map((f) => {
    let targetId = f.id;
    let targetMime = f.mimeType;
    if (f.mimeType === 'application/vnd.google-apps.shortcut' && f.shortcutDetails) {
      if (f.shortcutDetails.targetId) targetId = f.shortcutDetails.targetId;
      if (f.shortcutDetails.targetMimeType) targetMime = f.shortcutDetails.targetMimeType;
    }
    const isFolder = targetMime === 'application/vnd.google-apps.folder';
    return {
      id: targetId,
      name: f.name,
      mimeType: targetMime,
      isFolder,
      webViewLink: f.webViewLink,
      thumbnailLink: f.thumbnailLink,
      iconLink: f.iconLink,
      size: f.size,
      modifiedTime: f.modifiedTime,
    };
  });
}

export async function createDriveFolderOnDrive(params: {
  accessToken: string;
  name: string;
  parentFolderId?: string;
}): Promise<{ id: string; name: string; webViewLink?: string }> {
  const { accessToken, name, parentFolderId } = params;
  if (!accessToken) throw new Error('Sign in with Google required.');
  const metadata: Record<string, unknown> = {
    name: name.trim(),
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentFolderId && parentFolderId !== 'root') {
    metadata.parents = [parentFolderId];
  }
  const res = await fetch(
    'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink&supportsAllDrives=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    }
  );
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      if (err?.error?.message) msg = err.error.message;
    } catch {}
    throw new Error(`Could not create Drive folder: ${msg}`);
  }
  return res.json();
}

export async function getDriveFolderDetails(
  folderId: string,
  accessToken: string
): Promise<{ id: string; name: string; webViewLink?: string }> {
  if (!accessToken) throw new Error('Sign in with Google required.');
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,webViewLink,mimeType&supportsAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      if (err?.error?.message) msg = err.error.message;
    } catch {}
    throw new Error(`Could not fetch Drive folder info: ${msg}`);
  }
  return res.json();
}

export async function syncProjectToDriveServer(
  projectId: string,
  googleDriveFolderUrls: string[],
  accessToken?: string | null,
  destinationFolderId?: string,
  destinationFolderUrl?: string
): Promise<{
  success: boolean;
  syncedAt: string;
  backupFolderUrl?: string;
  backupFolderId?: string;
  uploadedFiles?: string[];
  warning?: string;
}> {
  const token = accessToken ?? cachedAccessToken;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const resp = await fetch('/api/pipeline/drive-sync', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      projectId,
      googleDriveFolderUrls,
      destinationFolderId,
      destinationFolderUrl,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || 'Drive sync failed.');
  return {
    success: true,
    syncedAt: data.syncedAt || new Date().toISOString(),
    backupFolderUrl: data.backupFolderUrl,
    backupFolderId: data.backupFolderId,
    uploadedFiles: data.uploadedFiles,
    warning: data.warning,
  };
}

export interface ParsedDriveIntakeResult {
  parsed: {
    client: string;
    productName: string;
    productDescription: string;
    provableClaims: string[];
    audience: string;
    tone: string;
    clientMarketingIdeas: string;
    videosWanted: string;
    shootLocationDatesBudgetNotes: string;
  };
  styleGuide?: ExtractedStyleGuide;
  brandGuideDocuments?: BrandGuideDocument[];
  stagedGuidePdfs?: Array<{ name: string; dataUrl: string; graphicCount?: number }>;
  suggestedLogoUrl?: string;
  suggestedLogoDataUrl?: string;
  extractedGraphicCount?: number;
  analyzedFiles: Array<{ name: string; status: string }>;
  importedPhotos?: Array<{ id: string; url: string; caption: string }>;
  importedPhotoDataUrls?: Array<{ dataUrl: string; caption: string }>;
  warnings?: string[];
}

export async function parseLocalStyleGuidePdfs(
  projectId: string,
  files: Array<{ name: string; dataUrl: string }>
): Promise<ParsedDriveIntakeResult> {
  const resp = await fetch('/api/pipeline/parse-local-guides', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, files }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || 'Could not parse PDF style guide.');
  return data;
}

export async function parseGoogleDriveFolder(
  projectId: string,
  googleDriveFolderUrls: string[],
  filesToAnalyze: DriveFileItem[],
  accessToken: string
): Promise<ParsedDriveIntakeResult> {
  if (!accessToken) {
    throw new Error('Please sign in with Google first so the studio can read your Drive files.');
  }

  const resp = await fetch('/api/pipeline/drive-parse', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      projectId,
      googleDriveFolderUrls,
      filesToAnalyze,
    }),
  });
  const data = await resp.json();
  if (resp.status === 401) {
    cachedAccessToken = null;
  }
  if (!resp.ok) throw new Error(data.error || 'Drive parse failed.');
  return data;
}

export interface ImportedDriveAsset {
  fileId: string;
  name: string;
  mimeType: string;
  url?: string;
  filename?: string;
  falUrl?: string | null;
  dataUrl?: string;
}

export async function importDriveFilesToProject(params: {
  projectId: string;
  files: DriveFileItem[];
  prefix?: string;
  uploadToFal?: boolean;
  accessToken: string;
}): Promise<{
  assets: ImportedDriveAsset[];
  warnings: string[];
}> {
  if (!params.accessToken) {
    throw new Error('Please sign in with Google first to import Drive assets.');
  }

  const resp = await fetch('/api/pipeline/drive-import-assets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: JSON.stringify({
      projectId: params.projectId,
      files: params.files,
      prefix: params.prefix,
      uploadToFal: Boolean(params.uploadToFal),
    }),
  });
  const data = await resp.json();
  if (resp.status === 401) {
    cachedAccessToken = null;
  }
  if (!resp.ok) throw new Error(data.error || 'Could not import selected Drive files.');
  return {
    assets: Array.isArray(data.assets) ? data.assets : [],
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
  };
}
