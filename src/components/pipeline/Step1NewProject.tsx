import React, { useEffect, useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  Upload,
  Loader2,
  ArrowRight,
  Image as ImageIcon,
  FolderSync,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  CheckSquare,
  Square,
  RefreshCw,
  LogOut,
  FileText,
  Folder,
  FolderPlus,
  HardDrive,
  Check,
} from 'lucide-react';
import { PipelineProject, ProductPhoto } from '../../types/pipeline';
import { readAndOptimizeLocalImage } from '../../utils/imageUtils';
import {
  getGoogleDriveAccessToken,
  getGoogleDriveUser,
  initDriveAuth,
  signInWithGoogleDrive,
  logoutGoogleDrive,
  syncProjectToDriveServer,
  listGoogleDriveFolderFiles,
  parseGoogleDriveFolder,
  createDriveFolderOnDrive,
  DriveFileItem,
  ImportedDriveAsset,
} from '../../utils/googleDriveSync';
import { DriveAssetPickerModal } from './DriveAssetPickerModal';

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
    googleDriveFolderUrls?: string[];
    googleDriveDestinationFolderId?: string;
    googleDriveDestinationFolderUrl?: string;
    googleDriveDestinationFolderName?: string;
    lockedDriveReferences?: Array<{
      fileId: string;
      name: string;
      mimeType: string;
      webViewLink?: string;
      folderUrl?: string;
      selected: boolean;
    }>;
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
    isNewMode
      ? ['']
      : existingProject?.product.provableClaims.length
        ? existingProject.product.provableClaims
        : ['']
  );

  const initialFolderUrls = isNewMode
    ? ['']
    : existingProject?.googleDriveFolderUrls?.length
      ? existingProject.googleDriveFolderUrls
      : existingProject?.googleDriveFolderUrl
        ? [existingProject.googleDriveFolderUrl]
        : [''];

  const [googleDriveFolderUrls, setGoogleDriveFolderUrls] =
    useState<string[]>(initialFolderUrls);

  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [driveUserEmail, setDriveUserEmail] = useState<string | null>(null);
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);
  const [isListingFiles, setIsListingFiles] = useState(false);
  const [isSyncingDrive, setIsSyncingDrive] = useState(false);
  const [isParsingDrive, setIsParsingDrive] = useState(false);
  const [driveSyncStatus, setDriveSyncStatus] = useState<
    'idle' | 'syncing' | 'synced' | 'error'
  >(existingProject?.googleDriveSyncStatus || 'idle');
  const [backupFolderUrl, setBackupFolderUrl] = useState<string | undefined>(
    isNewMode ? undefined : existingProject?.googleDriveBackupFolderUrl
  );
  const [driveStatusNote, setDriveStatusNote] = useState<string | null>(null);
  const [driveErrorMsg, setDriveErrorMsg] = useState<string | null>(null);

  const [destinationFolderId, setDestinationFolderId] = useState<string | undefined>(
    isNewMode
      ? undefined
      : existingProject?.googleDriveDestinationFolderId || existingProject?.googleDriveBackupFolderId
  );
  const [destinationFolderUrl, setDestinationFolderUrl] = useState<string | undefined>(
    isNewMode
      ? undefined
      : existingProject?.googleDriveDestinationFolderUrl || existingProject?.googleDriveBackupFolderUrl
  );
  const [destinationFolderName, setDestinationFolderName] = useState<string | undefined>(
    isNewMode
      ? undefined
      : existingProject?.googleDriveDestinationFolderName ||
        (existingProject?.client && existingProject?.product.name
          ? `52Launch Studio — ${existingProject.client} (${existingProject.product.name})`
          : undefined)
  );

  const [destinationPickerOpen, setDestinationPickerOpen] = useState(false);
  const [sourceFolderPickerOpen, setSourceFolderPickerOpen] = useState(false);
  const [isCreatingDedicatedFolder, setIsCreatingDedicatedFolder] = useState(false);

  const isFakeLegacyFileId = (id: string) =>
    /^file-[123](-|$)/.test(id) || /^fallback-/.test(id);

  const [liveFilesLoaded, setLiveFilesLoaded] = useState(false);

  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>(() => {
    if (isNewMode || !existingProject?.lockedDriveReferences?.length) return [];
    return existingProject.lockedDriveReferences
      .filter((r) => r.fileId && !isFakeLegacyFileId(r.fileId))
      .map((r) => ({
        id: r.fileId,
        name: r.name,
        mimeType: r.mimeType,
        webViewLink: r.webViewLink,
        folderUrl: r.folderUrl,
      }));
  });

  const [lockedFileIds, setLockedFileIds] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    if (!isNewMode && existingProject?.lockedDriveReferences) {
      existingProject.lockedDriveReferences.forEach((ref) => {
        if (ref.selected && ref.fileId && !isFakeLegacyFileId(ref.fileId)) {
          map[ref.fileId] = true;
        }
      });
    }
    return map;
  });

  // Staged vs existing photos
  const [stagedPhotos, setStagedPhotos] = useState<
    Array<{ id: string; dataUrl: string; caption: string }>
  >([]);
  const [existingPhotos, setExistingPhotos] = useState<ProductPhoto[]>(
    isNewMode ? [] : existingProject?.product.photos || []
  );

  const displayedPhotos = isNewMode ? stagedPhotos : existingPhotos;

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
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync Firebase Auth listener & existing token on mount
  useEffect(() => {
    getGoogleDriveAccessToken().then((token) => {
      if (token) setDriveToken(token);
      const user = getGoogleDriveUser();
      if (user?.email) setDriveUserEmail(user.email);
    });

    const unsub = initDriveAuth(
      (user, token) => {
        setDriveToken(token);
        setDriveUserEmail(user.email || null);
      },
      () => {
        setDriveToken(null);
        setDriveUserEmail(null);
      }
    );
    return () => unsub();
  }, []);

  // Keep local backup and destination url synced when project updates
  useEffect(() => {
    if (!isNewMode && existingProject) {
      if (existingProject.googleDriveDestinationFolderUrl) {
        setDestinationFolderUrl(existingProject.googleDriveDestinationFolderUrl);
      }
      if (existingProject.googleDriveDestinationFolderId) {
        setDestinationFolderId(existingProject.googleDriveDestinationFolderId);
      }
      if (existingProject.googleDriveDestinationFolderName) {
        setDestinationFolderName(existingProject.googleDriveDestinationFolderName);
      }
      if (existingProject.googleDriveBackupFolderUrl) {
        setBackupFolderUrl(existingProject.googleDriveBackupFolderUrl);
      }
      if (existingProject.googleDriveSyncStatus) {
        setDriveSyncStatus(existingProject.googleDriveSyncStatus);
      }
    }
  }, [
    isNewMode,
    existingProject?.googleDriveDestinationFolderUrl,
    existingProject?.googleDriveDestinationFolderId,
    existingProject?.googleDriveDestinationFolderName,
    existingProject?.googleDriveBackupFolderUrl,
    existingProject?.googleDriveSyncStatus,
  ]);

  const loadFolderFiles = async (urls: string[], token: string): Promise<DriveFileItem[]> => {
    const validUrls = urls.map((u) => u.trim()).filter(Boolean);
    if (validUrls.length === 0) {
      setDriveFiles([]);
      setLiveFilesLoaded(false);
      return [];
    }

    setDriveErrorMsg(null);
    setIsListingFiles(true);
    try {
      const files = await listGoogleDriveFolderFiles(validUrls, token);
      setDriveFiles(files);
      setLiveFilesLoaded(true);
      if (files.length === 0) {
        setDriveErrorMsg(
          'Connected folder(s) returned 0 files. Verify the folder link and ensure your signed-in Google account can view its contents.'
        );
      }
      return files;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Could not list Google Drive folder files.';
      setDriveErrorMsg(msg);
      if (
        msg.toLowerCase().includes('expired') ||
        msg.toLowerCase().includes('permission')
      ) {
        setDriveToken(null);
      }
      return [];
    } finally {
      setIsListingFiles(false);
    }
  };

  // Auto-list files when folder URLs or token change
  useEffect(() => {
    const validUrls = googleDriveFolderUrls.map((u) => u.trim()).filter(Boolean);
    if (driveToken && validUrls.length > 0) {
      void loadFolderFiles(validUrls, driveToken);
    }
  }, [driveToken, googleDriveFolderUrls.join('|')]);

  // Persist googleDriveFolderUrls only when they genuinely differ from saved project
  useEffect(() => {
    if (isNewMode || !existingProject) return;
    const validUrls = googleDriveFolderUrls.map((u) => u.trim()).filter(Boolean);
    const savedUrls = existingProject.googleDriveFolderUrls || [];
    if (JSON.stringify(validUrls) !== JSON.stringify(savedUrls)) {
      void onUpdateProject({
        ...existingProject,
        googleDriveFolderUrls: validUrls,
        googleDriveFolderUrl: validUrls[0] || undefined,
      });
    }
  }, [googleDriveFolderUrls, isNewMode, existingProject?.id]);

  const handleConnectDrive = async (forceConsent = false) => {
    setErrorMsg(null);
    setDriveErrorMsg(null);
    setIsConnectingDrive(true);
    try {
      const res = await signInWithGoogleDrive(forceConsent);
      setDriveToken(res.accessToken);
      setDriveUserEmail(res.user.email || null);
      const validUrls = googleDriveFolderUrls.map((u) => u.trim()).filter(Boolean);
      if (validUrls.length > 0) {
        await loadFolderFiles(validUrls, res.accessToken);
      }
    } catch (err) {
      setDriveErrorMsg(
        err instanceof Error ? err.message : 'Could not sign in with Google.'
      );
    } finally {
      setIsConnectingDrive(false);
    }
  };

  const handleDisconnectDrive = async () => {
    await logoutGoogleDrive();
    setDriveToken(null);
    setDriveUserEmail(null);
    setDriveStatusNote(null);
    setLiveFilesLoaded(false);
  };

  const handleAutoParseDrive = async () => {
    const validUrls = googleDriveFolderUrls.map((u) => u.trim()).filter(Boolean);
    if (validUrls.length === 0) {
      setDriveErrorMsg('Enter at least one Google Drive folder URL first.');
      return;
    }

    setErrorMsg(null);
    setDriveErrorMsg(null);
    setDriveStatusNote(null);
    setIsParsingDrive(true);

    try {
      let token = driveToken;
      let currentFiles = driveFiles;

      if (!token) {
        const authRes = await signInWithGoogleDrive(true);
        token = authRes.accessToken;
        setDriveToken(token);
        setDriveUserEmail(authRes.user.email || null);
        currentFiles = await loadFolderFiles(validUrls, token);
      } else if (!liveFilesLoaded || currentFiles.length === 0) {
        currentFiles = await loadFolderFiles(validUrls, token);
      }

      if (currentFiles.length === 0) {
        setDriveErrorMsg(
          'No files were found in the linked Google Drive folder(s). Verify the folder URL(s) and check that you have access.'
        );
        return;
      }

      const explicitlyLocked = currentFiles.filter((f) => lockedFileIds[f.id]);
      const filesToAnalyze =
        explicitlyLocked.length > 0 ? explicitlyLocked : currentFiles;

      const result = await parseGoogleDriveFolder(
        existingProject?.id || 'new',
        validUrls,
        filesToAnalyze,
        token
      );

      const { parsed } = result;
      if (parsed.client) setClient(parsed.client);
      if (parsed.productName) setProductName(parsed.productName);
      if (parsed.productDescription) setProductDescription(parsed.productDescription);
      if (Array.isArray(parsed.provableClaims) && parsed.provableClaims.length > 0) {
        setClaims(parsed.provableClaims);
      }
      if (parsed.audience) setAudience(parsed.audience);
      if (parsed.tone) setTone(parsed.tone);
      if (parsed.clientMarketingIdeas)
        setClientMarketingIdeas(parsed.clientMarketingIdeas);
      if (parsed.videosWanted) setVideosWanted(parsed.videosWanted);
      if (parsed.shootLocationDatesBudgetNotes)
        setShootNotes(parsed.shootLocationDatesBudgetNotes);

      // Import extracted Drive product photos into gallery
      if (
        (isNewMode || !existingProject) &&
        Array.isArray(result.importedPhotoDataUrls) &&
        result.importedPhotoDataUrls.length > 0
      ) {
        setStagedPhotos((prev) => {
          const existingCaptions = new Set(prev.map((p) => p.caption));
          const additions = result
            .importedPhotoDataUrls!.filter((img) => !existingCaptions.has(img.caption))
            .map((img, idx) => ({
              id: `drive-staged-${Date.now()}-${idx}`,
              dataUrl: img.dataUrl,
              caption: img.caption,
            }));
          return [...prev, ...additions];
        });
      } else if (
        existingProject &&
        Array.isArray(result.importedPhotos) &&
        result.importedPhotos.length > 0
      ) {
        setExistingPhotos((prev) => [...prev, ...result.importedPhotos!]);
      }

      // Mark analyzed files as locked if none were manually locked yet
      if (explicitlyLocked.length === 0) {
        const nextMap: Record<string, boolean> = {};
        filesToAnalyze.forEach((f) => {
          nextMap[f.id] = true;
        });
        setLockedFileIds(nextMap);
      }

      const importedCount =
        (result.importedPhotos?.length || 0) +
        (result.importedPhotoDataUrls?.length || 0);
      setDriveStatusNote(
        `Analyzed ${result.analyzedFiles.length} real Drive file(s)${
          importedCount > 0 ? ` and imported ${importedCount} product image(s)` : ''
        }.${result.warnings?.length ? ` Note: ${result.warnings.join(' ')}` : ''}`
      );

      if (existingProject) {
        const updatedPhotos =
          result.importedPhotos && result.importedPhotos.length > 0
            ? [...existingProject.product.photos, ...result.importedPhotos]
            : existingProject.product.photos;

        await onUpdateProject({
          ...existingProject,
          client: parsed.client || existingProject.client,
          product: {
            ...existingProject.product,
            name: parsed.productName || existingProject.product.name,
            description:
              parsed.productDescription || existingProject.product.description,
            provableClaims:
              parsed.provableClaims?.length
                ? parsed.provableClaims
                : existingProject.product.provableClaims,
            photos: updatedPhotos,
          },
          intake: {
            audience: parsed.audience || existingProject.intake.audience,
            tone: parsed.tone || existingProject.intake.tone,
            clientMarketingIdeas:
              parsed.clientMarketingIdeas || existingProject.intake.clientMarketingIdeas,
            videosWanted: parsed.videosWanted || existingProject.intake.videosWanted,
            shootLocationDatesBudgetNotes:
              parsed.shootLocationDatesBudgetNotes ||
              existingProject.intake.shootLocationDatesBudgetNotes,
          },
          googleDriveFolderUrls: validUrls,
          googleDriveFolderUrl: validUrls[0],
          lockedDriveReferences: currentFiles.map((f) => ({
            fileId: f.id,
            name: f.name,
            mimeType: f.mimeType,
            webViewLink: f.webViewLink,
            folderUrl: f.folderUrl,
            selected:
              explicitlyLocked.length > 0 ? Boolean(lockedFileIds[f.id]) : true,
          })),
        });
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Could not analyze Google Drive files.';
      setDriveErrorMsg(msg);
      if (
        msg.toLowerCase().includes('sign in') ||
        msg.toLowerCase().includes('expired') ||
        msg.toLowerCase().includes('permission')
      ) {
        setDriveToken(null);
      }
    } finally {
      setIsParsingDrive(false);
    }
  };

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
              caption: files[i].name,
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
            caption: files[i].name,
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

  const handleDriveProductPhotosImported = async (assets: ImportedDriveAsset[]) => {
    setErrorMsg(null);
    if (isNewMode || !existingProject) {
      const additions = assets
        .filter((a) => Boolean(a.dataUrl))
        .map((a, idx) => ({
          id: `drive-photo-${Date.now()}-${idx}`,
          dataUrl: a.dataUrl!,
          caption: a.name,
        }));
      if (additions.length > 0) {
        setStagedPhotos((prev) => [...prev, ...additions]);
      }
    } else {
      const additions: ProductPhoto[] = assets
        .filter((a) => Boolean(a.url))
        .map((a, idx) => ({
          id: `photo-drive-${Date.now()}-${idx}`,
          url: a.url!,
          caption: a.name,
        }));
      if (additions.length > 0) {
        const nextPhotos = [...existingPhotos, ...additions];
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
  };

  const handleSelectDestinationFolder = (folder: { id: string; name: string; url: string }) => {
    setDestinationFolderId(folder.id);
    setDestinationFolderName(folder.name);
    setDestinationFolderUrl(folder.url);
    setBackupFolderUrl(folder.url);
    setDriveStatusNote(`Save destination set to "${folder.name}".`);
    if (!isNewMode && existingProject) {
      void onUpdateProject({
        ...existingProject,
        googleDriveDestinationFolderId: folder.id,
        googleDriveDestinationFolderName: folder.name,
        googleDriveDestinationFolderUrl: folder.url,
        googleDriveBackupFolderId: folder.id,
        googleDriveBackupFolderUrl: folder.url,
      });
    }
  };

  const handleCreateDedicatedDriveFolder = async () => {
    let token = driveToken;
    if (!token) {
      try {
        const res = await signInWithGoogleDrive(false);
        token = res.accessToken;
        setDriveToken(token);
        setDriveUserEmail(res.user.email || null);
      } catch (err) {
        setDriveErrorMsg('Sign in with Google to create your Drive folder.');
        return;
      }
    }

    setIsCreatingDedicatedFolder(true);
    setDriveErrorMsg(null);
    try {
      const folderName = `52Launch Studio — ${client.trim() || 'Client'} (${productName.trim() || 'Product'})`;
      const created = await createDriveFolderOnDrive({
        accessToken: token,
        name: folderName,
      });
      const url = created.webViewLink || `https://drive.google.com/drive/folders/${created.id}`;
      setDestinationFolderId(created.id);
      setDestinationFolderName(created.name);
      setDestinationFolderUrl(url);
      setBackupFolderUrl(url);
      setDriveStatusNote(`Created and linked dedicated folder "${created.name}" on Google Drive!`);
      if (!isNewMode && existingProject) {
        await onUpdateProject({
          ...existingProject,
          googleDriveDestinationFolderId: created.id,
          googleDriveDestinationFolderName: created.name,
          googleDriveDestinationFolderUrl: url,
          googleDriveBackupFolderId: created.id,
          googleDriveBackupFolderUrl: url,
        });
      }
    } catch (err) {
      setDriveErrorMsg(err instanceof Error ? err.message : 'Could not create Google Drive folder.');
    } finally {
      setIsCreatingDedicatedFolder(false);
    }
  };

  const triggerDriveAutoSave = async (projectId: string) => {
    const validUrls = googleDriveFolderUrls.map((u) => u.trim()).filter(Boolean);
    setDriveErrorMsg(null);
    let token = driveToken;
    if (!token) {
      try {
        const authRes = await signInWithGoogleDrive();
        token = authRes.accessToken;
        setDriveToken(token);
        setDriveUserEmail(authRes.user.email || null);
      } catch (err) {
        setDriveErrorMsg(
          err instanceof Error ? err.message : 'Sign in with Google to save to Drive.'
        );
        return;
      }
    }

    setIsSyncingDrive(true);
    setDriveSyncStatus('syncing');
    try {
      const syncRes = await syncProjectToDriveServer(
        projectId,
        validUrls,
        token,
        destinationFolderId,
        destinationFolderUrl
      );
      setDriveSyncStatus('synced');
      if (syncRes.backupFolderUrl) {
        setBackupFolderUrl(syncRes.backupFolderUrl);
      }
      if (syncRes.uploadedFiles?.length) {
        setDriveStatusNote(
          `Saved ${syncRes.uploadedFiles.length} file(s) to Google Drive (${syncRes.uploadedFiles.join(', ')}).`
        );
      }
    } catch (err) {
      setDriveSyncStatus('error');
      setDriveErrorMsg(
        err instanceof Error ? err.message : 'Could not sync backup to Google Drive.'
      );
    } finally {
      setIsSyncingDrive(false);
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
    const validUrls = googleDriveFolderUrls.map((u) => u.trim()).filter(Boolean);
    const lockedReferences = driveFiles.map((f) => ({
      fileId: f.id,
      name: f.name,
      mimeType: f.mimeType,
      webViewLink: f.webViewLink,
      folderUrl: f.folderUrl,
      selected: Boolean(lockedFileIds[f.id]),
    }));

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
          googleDriveFolderUrls: validUrls,
          googleDriveDestinationFolderId: destinationFolderId,
          googleDriveDestinationFolderUrl: destinationFolderUrl,
          googleDriveDestinationFolderName: destinationFolderName,
          lockedDriveReferences: lockedReferences,
        });
      } else {
        const updated: PipelineProject = {
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
          googleDriveFolderUrls: validUrls,
          googleDriveFolderUrl: validUrls[0] || undefined,
          googleDriveDestinationFolderId: destinationFolderId || existingProject.googleDriveDestinationFolderId,
          googleDriveDestinationFolderUrl: destinationFolderUrl || existingProject.googleDriveDestinationFolderUrl,
          googleDriveDestinationFolderName: destinationFolderName || existingProject.googleDriveDestinationFolderName,
          lockedDriveReferences: lockedReferences,
          googleDriveSyncStatus: driveSyncStatus,
          approvals: {
            ...existingProject.approvals,
            intakeCompleted: true,
          },
        };

        await onUpdateProject(updated);
        onProceedToBible();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save project.');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedLockedCount = driveFiles.filter((f) => lockedFileIds[f.id]).length;

  return (
    <div className="max-w-[1120px] mx-auto px-6 py-7 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2E2E6] pb-5">
        <div>
          <div className="text-xs font-medium text-[#C6202F]">
            Step 1 · Project &amp; Client Intake &amp; Google Drive Sync
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111114] mt-1">
            {isNewMode
              ? 'Start a New Client Product Project'
              : `${existingProject?.client} — ${existingProject?.product.name}`}
          </h1>
          <p className="text-sm text-[#5A5A66] mt-1">
            Link multiple Google Drive folders, lock key style guides &amp; product assets, and extract real intake details.
          </p>
        </div>

        {/* Google Drive Status Badge */}
        <div className="flex items-center gap-2.5">
          {backupFolderUrl && (
            <a
              href={backupFolderUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-300 text-xs text-emerald-800 hover:bg-emerald-100 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Drive Auto-Save
            </a>
          )}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-[#E2E2E6] text-xs">
            <FolderSync
              className={`w-4 h-4 ${
                driveSyncStatus === 'synced'
                  ? 'text-emerald-700'
                  : driveSyncStatus === 'syncing'
                    ? 'text-[#C6202F] animate-spin'
                    : driveSyncStatus === 'error'
                      ? 'text-[#C6202F]'
                      : 'text-[#5A5A66]'
              }`}
            />
            <span className="text-[#3A3A44]">
              {driveSyncStatus === 'synced'
                ? 'Drive Auto-Save: Synced'
                : driveSyncStatus === 'syncing'
                  ? 'Syncing to Drive...'
                  : driveSyncStatus === 'error'
                    ? 'Drive Sync Error'
                    : googleDriveFolderUrls.some((u) => u.trim())
                      ? 'Drive Linked'
                      : 'Drive Unlinked'}
            </span>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-300 text-xs text-[#891A23]">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Google Drive Save Destination Section - Full User Control */}
        <section className="bg-white border-2 border-[#111114]/10 rounded-xl p-6 space-y-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#FDF4F5] border border-[#C6202F]/20 flex items-center justify-center shrink-0 mt-0.5">
                <HardDrive className="w-5 h-5 text-[#C6202F]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-[#111114]">
                    Save Destination on Google Drive
                  </h2>
                  <span className="px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase bg-[#C6202F]/10 text-[#C6202F] rounded">
                    Primary Output
                  </span>
                </div>
                <p className="text-xs text-[#5A5A66] mt-0.5 max-w-2xl">
                  Control exactly where all generated project deliverables, PDFs, storyboard frames, and backups are stored. No random folders or scattered files.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!driveToken ? (
                <button
                  type="button"
                  disabled={isConnectingDrive}
                  onClick={() => void handleConnectDrive()}
                  className="inline-flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-[#1F1F1F] bg-white border border-[#D5D5DC] hover:bg-[#F2F2F5] disabled:opacity-50 rounded-lg cursor-pointer transition-colors shadow-sm"
                >
                  {isConnectingDrive ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#4A4A55]" />
                  ) : (
                    <svg
                      version="1.1"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      className="w-4 h-4 shrink-0"
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                    </svg>
                  )}
                  <span>{isConnectingDrive ? 'Signing in...' : 'Sign in with Google Drive'}</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-300 rounded-lg">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    {driveUserEmail ? `Connected (${driveUserEmail})` : 'Drive Connected'}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleDisconnectDrive()}
                    title="Disconnect Google Drive"
                    className="p-1.5 text-[#5A5A66] hover:text-[#C6202F] bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Destination Folder Banner */}
          <div className="p-4 rounded-xl bg-[#FBFBFC] border border-[#E2E2E6] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#C6202F]/10 flex items-center justify-center text-[#C6202F]">
                  <Folder className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-[#5A5A66] uppercase tracking-wider">
                    Current Save Target Folder
                  </div>
                  <div className="text-sm font-bold text-[#111114] flex items-center gap-2">
                    <span>
                      {destinationFolderName ||
                        (destinationFolderUrl
                          ? 'Linked Drive Target Folder'
                          : `52Launch Studio — ${client.trim() || 'Client'} (${productName.trim() || 'Product'}) [Default]`)}
                    </span>
                    {destinationFolderUrl && (
                      <a
                        href={destinationFolderUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#C6202F] hover:underline"
                        title="Open folder directly on Google Drive"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open on Drive
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDestinationPickerOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#111114] bg-white border border-[#D5D5DC] hover:border-[#C6202F] hover:text-[#C6202F] rounded-lg cursor-pointer transition-colors shadow-sm"
                >
                  <Folder className="w-3.5 h-3.5 text-[#C6202F]" />
                  Browse Company Drive
                </button>
                <button
                  type="button"
                  disabled={isCreatingDedicatedFolder}
                  onClick={() => void handleCreateDedicatedDriveFolder()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#C6202F] bg-[#FDF4F5] border border-[#C6202F]/30 hover:bg-[#FCE8EB] disabled:opacity-40 rounded-lg cursor-pointer transition-colors"
                >
                  {isCreatingDedicatedFolder ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FolderPlus className="w-3.5 h-3.5" />
                  )}
                  Create Dedicated Project Folder
                </button>
              </div>
            </div>

            {/* Deliverables Checklist */}
            <div className="pt-3 border-t border-[#EAEAEF]">
              <div className="text-[11px] font-semibold text-[#3A3A44] uppercase tracking-wider mb-2">
                Deliverables Automatically Saved &amp; Synced Here:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-[#E2E2E6] text-xs text-[#3A3A44]">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="font-mono text-[11px] font-semibold text-[#111114]">project.json</span>
                  <span className="text-[10px] text-[#6E6E7A]">(Live pipeline state)</span>
                </div>
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-[#E2E2E6] text-xs text-[#3A3A44]">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="font-mono text-[11px] font-semibold text-[#111114]">shotlist.pdf</span>
                  <span className="text-[10px] text-[#6E6E7A]">(Shots &amp; visuals)</span>
                </div>
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-[#E2E2E6] text-xs text-[#3A3A44]">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="font-mono text-[11px] font-semibold text-[#111114]">call-sheet.pdf</span>
                  <span className="text-[10px] text-[#6E6E7A]">(Schedule &amp; lunch)</span>
                </div>
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-[#E2E2E6] text-xs text-[#3A3A44]">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="font-mono text-[11px] font-semibold text-[#111114]">master-book.pdf</span>
                  <span className="text-[10px] text-[#6E6E7A]">(Deck / slideshow)</span>
                </div>
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-[#E2E2E6] text-xs text-[#3A3A44]">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="font-mono text-[11px] font-semibold text-[#111114]">storyboard-frames/</span>
                  <span className="text-[10px] text-[#6E6E7A]">(Visual frames)</span>
                </div>
                {existingProject && (
                  <button
                    type="button"
                    disabled={isSyncingDrive}
                    onClick={() => void triggerDriveAutoSave(existingProject.id)}
                    className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#C6202F] text-white text-xs font-semibold hover:bg-[#AD1A27] disabled:opacity-50 cursor-pointer shadow-sm"
                  >
                    {isSyncingDrive ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <FolderSync className="w-3 h-3" />
                    )}
                    Sync All Files Now
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Google Drive Asset Sources & Key File Locking Section */}
        <section className="bg-white border border-[#E2E2E6] rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#111114] flex items-center gap-2">
                <FolderSync className="w-5 h-5 text-[#C6202F]" />
                Google Drive Intake Sources &amp; Key File Locking
              </h2>
              <p className="text-xs text-[#5A5A66] mt-0.5">
                Browse company Drive folders or paste links to pull client briefs, product decks, and scripts into intake.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSourceFolderPickerOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#111114] bg-[#F6F6F7] hover:bg-[#EAEAEF] border border-[#D5D5DC] rounded-lg cursor-pointer transition-colors shadow-sm"
              >
                <Folder className="w-3.5 h-3.5 text-[#C6202F]" />
                Browse Company Drive to Add Folders
              </button>

              {googleDriveFolderUrls.some((u) => u.trim()) && (
                <button
                  type="button"
                  disabled={isParsingDrive || isSyncingDrive}
                  onClick={() => void handleAutoParseDrive()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#C6202F] hover:bg-[#AD1A27] disabled:opacity-40 rounded-lg cursor-pointer transition-colors shadow"
                >
                  {isParsingDrive ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  {isParsingDrive
                    ? 'Reading & Analyzing Files...'
                    : selectedLockedCount > 0
                      ? `Auto-Fill from ${selectedLockedCount} Locked File${selectedLockedCount > 1 ? 's' : ''}`
                      : 'Auto-Fill Intake from Drive'}
                </button>
              )}
            </div>
          </div>

          {driveErrorMsg && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-xs text-[#891A23]">
              {driveErrorMsg}
            </div>
          )}

          {driveStatusNote && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-300 text-xs text-emerald-900">
              {driveStatusNote}
            </div>
          )}

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-[#3A3A44]">
                Google Drive Source Folder URLs
              </label>
              <div className="flex items-center gap-3">
                {driveToken && googleDriveFolderUrls.some((u) => u.trim()) && (
                  <button
                    type="button"
                    disabled={isListingFiles}
                    onClick={() => void loadFolderFiles(googleDriveFolderUrls, driveToken)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#3A3A44] hover:text-[#891A23] cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isListingFiles ? 'animate-spin' : ''}`}
                    />
                    Refresh Files
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setGoogleDriveFolderUrls((prev) => [...prev, ''])}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#C6202F] hover:text-[#891A23] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add folder URL
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {googleDriveFolderUrls.map((url, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => {
                      const val = e.target.value;
                      setGoogleDriveFolderUrls((prev) =>
                        prev.map((item, i) => (i === idx ? val : item))
                      );
                    }}
                    placeholder={`https://drive.google.com/drive/folders/folder-${idx + 1}...`}
                    className="flex-1 bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg px-3.5 py-2 text-sm text-[#111114] placeholder:text-[#8A8A96] focus:outline-none focus:border-[#C6202F] font-mono text-xs"
                  />
                  {googleDriveFolderUrls.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setGoogleDriveFolderUrls((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="p-2 text-[#6E6E7A] hover:text-[#C6202F] cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {isListingFiles && (
            <div className="flex items-center gap-2 pt-3 border-t border-[#E2E2E6] text-xs text-[#5A5A66]">
              <Loader2 className="w-4 h-4 animate-spin text-[#C6202F]" />
              Reading files from linked Google Drive folder(s)...
            </div>
          )}

          {!isListingFiles && driveFiles.length > 0 && (
            <div className="space-y-2 pt-3 border-t border-[#E2E2E6]">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-[#3A3A44]">
                  Select Specific Files to Lock as Key References ({driveFiles.length} found):
                </div>
                <div className="flex gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => {
                      const all: Record<string, boolean> = {};
                      driveFiles.forEach((f) => (all[f.id] = true));
                      setLockedFileIds(all);
                    }}
                    className="text-[#C6202F] hover:underline cursor-pointer"
                  >
                    Lock All
                  </button>
                  <span className="text-[#8A8A96]">|</span>
                  <button
                    type="button"
                    onClick={() => setLockedFileIds({})}
                    className="text-[#5A5A66] hover:underline cursor-pointer"
                  >
                    Unlock All
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                {driveFiles.map((file) => {
                  const isLocked = Boolean(lockedFileIds[file.id]);
                  return (
                    <div
                      key={file.id}
                      onClick={() =>
                        setLockedFileIds((prev) => ({
                          ...prev,
                          [file.id]: !prev[file.id],
                        }))
                      }
                      className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 text-xs cursor-pointer transition-colors ${
                        isLocked
                          ? 'bg-[#FDF4F5] border-[#C6202F]/55 text-[#891A23]'
                          : 'bg-[#F6F6F7] border-[#E2E2E6] text-[#3A3A44] hover:border-[#891A23]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isLocked ? (
                          <CheckSquare className="w-4 h-4 text-[#C6202F] shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-[#8A8A96] shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="truncate font-medium flex items-center gap-1">
                            <FileText className="w-3 h-3 text-[#6E6E7A] shrink-0" />
                            <span className="truncate">{file.name}</span>
                          </div>
                          {file.folderPath && (
                            <div className="text-[10px] text-[#6E6E7A] truncate">
                              {file.folderPath}
                            </div>
                          )}
                        </div>
                      </div>
                      {file.webViewLink && (
                        <a
                          href={file.webViewLink}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[#C6202F] hover:text-[#891A23] shrink-0"
                          title="Open in Google Drive"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Client & Product Core */}
        <section className="bg-white border border-[#E2E2E6] rounded-xl p-6 space-y-5">
          <h2 className="text-base font-semibold text-[#111114]">Client & Product</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#3A3A44] mb-1.5">
                Client name
              </label>
              <input
                type="text"
                required
                value={client}
                onChange={(e) => setClient(e.target.value)}
                placeholder="e.g., Kinetix Bio Inc."
                className="w-full bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg px-3.5 py-2 text-sm text-[#111114] placeholder:text-[#8A8A96] focus:outline-none focus:border-[#C6202F]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#3A3A44] mb-1.5">
                Product name
              </label>
              <input
                type="text"
                required
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="e.g., Kinetix Core Patch"
                className="w-full bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg px-3.5 py-2 text-sm text-[#111114] placeholder:text-[#8A8A96] focus:outline-none focus:border-[#C6202F]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#3A3A44] mb-1.5">
              Product description
            </label>
            <textarea
              rows={3}
              value={productDescription}
              onChange={(e) => setProductDescription(e.target.value)}
              placeholder="Explain what the product is, how it physically works, and what makes it genuinely different..."
              className="w-full bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg px-3.5 py-2.5 text-sm text-[#111114] placeholder:text-[#8A8A96] focus:outline-none focus:border-[#C6202F]"
            />
          </div>

          {/* Provable Claims */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-[#3A3A44]">
                Claims we can back up (used as strict truth guardrails across scripts)
              </label>
              <button
                type="button"
                onClick={() => setClaims((prev) => [...prev, ''])}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#C6202F] hover:text-[#891A23] cursor-pointer"
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
                    className="flex-1 bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg px-3.5 py-2 text-sm text-[#111114] placeholder:text-[#8A8A96] focus:outline-none focus:border-[#C6202F]"
                  />
                  {claims.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setClaims((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="p-2 text-[#6E6E7A] hover:text-[#C6202F] cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Product Photos */}
        <section className="bg-white border border-[#E2E2E6] rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#111114]">Product Photos</h2>
              <p className="text-xs text-[#5A5A66] mt-0.5">
                Upload local product photos or pick them directly from your Google Drive folders or links.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPhotoPickerOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#891A23] bg-[#FDF4F5] border border-[#EABAC0] hover:bg-[#FCE8EA] rounded-lg cursor-pointer transition-colors"
              >
                <FolderSync className="w-4 h-4" />
                Pick from Google Drive
              </button>
              <button
                type="button"
                disabled={isUploadingPhoto}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#24242B] bg-[#F6F6F7] border border-[#E2E2E6] hover:border-[#891A23] rounded-lg cursor-pointer"
              >
                {isUploadingPhoto ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#C6202F]" />
                ) : (
                  <Upload className="w-4 h-4 text-[#C6202F]" />
                )}
                {isUploadingPhoto ? 'Uploading...' : 'Upload photos'}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => void handlePhotoSelect(e)}
            />
          </div>

          {displayedPhotos.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {displayedPhotos.map((p, idx) => (
                <div
                  key={p.id || idx}
                  className="bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg overflow-hidden flex flex-col aspect-square relative group"
                >
                  <img
                    src={(p as ProductPhoto).url || (p as { dataUrl: string }).dataUrl}
                    alt={p.caption || `Product ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  {p.caption && (
                    <div className="absolute bottom-0 inset-x-0 bg-black/75 px-2 py-1 text-[10px] text-white truncate">
                      {p.caption}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (isNewMode || !existingProject) {
                        setStagedPhotos((prev) => prev.filter((_, i) => i !== idx));
                      } else {
                        const next = existingPhotos.filter((_, i) => i !== idx);
                        setExistingPhotos(next);
                        void onUpdateProject({
                          ...existingProject,
                          product: { ...existingProject.product, photos: next },
                        });
                      }
                    }}
                    className="absolute top-2 right-2 p-1.5 bg-black/80 text-white/85 hover:text-[#FCA5A5] rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-[#E2E2E6] hover:border-[#C6202F]/70 bg-[#F6F6F7] rounded-xl p-8 text-center cursor-pointer transition-colors"
            >
              <ImageIcon className="w-8 h-8 text-[#8A8A96] mx-auto mb-2" />
              <div className="text-xs font-medium text-[#3A3A44]">
                Click to upload product photos or drag and drop
              </div>
              <div className="text-[11px] text-[#6E6E7A] mt-1">
                PNG, JPG or WEBP up to 10MB each
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPhotoPickerOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#891A23] bg-[#FDF4F5] border border-[#EABAC0] hover:bg-[#FCE8EA] rounded-lg cursor-pointer"
                >
                  <FolderSync className="w-3.5 h-3.5" />
                  Browse Product Photos in Google Drive
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Campaign Intake & Creative Direction */}
        <section className="bg-white border border-[#E2E2E6] rounded-xl p-6 space-y-5">
          <h2 className="text-base font-semibold text-[#111114]">Campaign Intake</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#3A3A44] mb-1.5">
                Target audience
              </label>
              <input
                type="text"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g., Endurance athletes & marathon runners"
                className="w-full bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg px-3.5 py-2 text-sm text-[#111114] placeholder:text-[#8A8A96] focus:outline-none focus:border-[#C6202F]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#3A3A44] mb-1.5">
                Brand tone / vibe
              </label>
              <input
                type="text"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                placeholder="e.g., High-tech, gritty, scientific yet visceral"
                className="w-full bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg px-3.5 py-2 text-sm text-[#111114] placeholder:text-[#8A8A96] focus:outline-none focus:border-[#C6202F]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#3A3A44] mb-1.5">
              Client marketing ideas &amp; requirements
            </label>
            <textarea
              rows={2}
              value={clientMarketingIdeas}
              onChange={(e) => setClientMarketingIdeas(e.target.value)}
              placeholder="Any specific hooks, visual metaphors, or key angles requested by the client..."
              className="w-full bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg px-3.5 py-2.5 text-sm text-[#111114] placeholder:text-[#8A8A96] focus:outline-none focus:border-[#C6202F]"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#3A3A44] mb-1.5">
                Videos wanted (deliverables)
              </label>
              <input
                type="text"
                value={videosWanted}
                onChange={(e) => setVideosWanted(e.target.value)}
                placeholder="e.g., 30s TVC + 15s social cutdowns"
                className="w-full bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg px-3.5 py-2 text-sm text-[#111114] placeholder:text-[#8A8A96] focus:outline-none focus:border-[#C6202F]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#3A3A44] mb-1.5">
                Shoot location / dates / budget notes
              </label>
              <input
                type="text"
                value={shootNotes}
                onChange={(e) => setShootNotes(e.target.value)}
                placeholder="e.g., Studio shoot in LA, target budget $15k"
                className="w-full bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg px-3.5 py-2 text-sm text-[#111114] placeholder:text-[#8A8A96] focus:outline-none focus:border-[#C6202F]"
              />
            </div>
          </div>
        </section>

        {/* Submit Bar */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold text-white bg-[#C6202F] hover:bg-[#AD1A27] disabled:opacity-40 brand-corner-sm cursor-pointer transition-colors shadow-lg shadow-[#C6202F]/20"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowRight className="w-4 h-4" />
            )}
            {isSaving
              ? 'Saving Project...'
              : isNewMode
                ? 'Create project & continue to Brand Bible'
                : 'Save intake & continue'}
          </button>
        </div>
      </form>

      <DriveAssetPickerModal
        isOpen={photoPickerOpen}
        projectId={existingProject?.id || 'new'}
        initialFolderUrls={googleDriveFolderUrls}
        mediaFilter="image"
        multiple={true}
        prefix="product"
        title="Pick Product Photos from Google Drive"
        subtitle="Select one or more product images from your linked Drive folders or paste any Drive file/folder URL."
        onClose={() => setPhotoPickerOpen(false)}
        onImported={handleDriveProductPhotosImported}
        onFoldersChange={(urls) => {
          setGoogleDriveFolderUrls(urls.length > 0 ? urls : ['']);
        }}
      />

      {/* Select Destination Folder Modal */}
      <DriveAssetPickerModal
        isOpen={destinationPickerOpen}
        projectId={existingProject?.id || 'new'}
        pickerMode="select_destination_folder"
        title="Select Google Drive Save Destination"
        subtitle="Browse My Drive, Shared Drives, or Shared with Me to select the folder where project files and generated PDFs will be stored."
        onClose={() => setDestinationPickerOpen(false)}
        onSelectFolder={handleSelectDestinationFolder}
      />

      {/* Select Source Folder Modal */}
      <DriveAssetPickerModal
        isOpen={sourceFolderPickerOpen}
        projectId={existingProject?.id || 'new'}
        pickerMode="select_source_folder"
        title="Browse Company Google Drive for Source Folder"
        subtitle="Browse your company Drive and select a folder to add as an intake reference source."
        onClose={() => setSourceFolderPickerOpen(false)}
        onSelectFolder={(folder: { id: string; name: string; url: string }) => {
          setGoogleDriveFolderUrls((prev) =>
            Array.from(new Set([...prev.filter(Boolean), folder.url]))
          );
          setDriveStatusNote(`Added source folder "${folder.name}".`);
        }}
      />
    </div>
  );
};
