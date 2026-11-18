import { DriveFileItem } from './googleDriveSync';

declare global {
  interface Window {
    gapi?: {
      load: (api: string, callback: () => void) => void;
    };
  }
}

interface GooglePickerDocsView {
  setIncludeFolders: (include: boolean) => GooglePickerDocsView;
  setSelectFolderEnabled: (enabled: boolean) => GooglePickerDocsView;
  setEnableDrives: (enabled: boolean) => GooglePickerDocsView;
  setMimeTypes: (mimeTypes: string) => GooglePickerDocsView;
  setMode: (mode: string) => GooglePickerDocsView;
}

interface GooglePickerBuilder {
  setTitle: (title: string) => GooglePickerBuilder;
  addView: (view: unknown) => GooglePickerBuilder;
  setOAuthToken: (token: string) => GooglePickerBuilder;
  setOrigin: (origin: string) => GooglePickerBuilder;
  enableFeature: (feature: string) => GooglePickerBuilder;
  setCallback: (cb: (data: Record<string, unknown>) => void) => GooglePickerBuilder;
  build: () => { setVisible: (visible: boolean) => void };
}

let pickerApiPromise: Promise<void> | null = null;

function loadGooglePickerApi(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Picker can only open in a browser.'));
  }
  if (window.google?.picker) {
    return Promise.resolve();
  }
  if (pickerApiPromise) return pickerApiPromise;

  pickerApiPromise = new Promise<void>((resolve, reject) => {
    const onScriptReady = () => {
      if (!window.gapi) {
        pickerApiPromise = null;
        reject(new Error('Google API script loaded without gapi global.'));
        return;
      }
      window.gapi.load('picker', () => {
        if (window.google?.picker) {
          resolve();
        } else {
          pickerApiPromise = null;
          reject(new Error('Google Picker library failed to initialize.'));
        }
      });
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://apis.google.com/js/api.js"]'
    );
    if (existingScript) {
      if (window.gapi) {
        onScriptReady();
      } else {
        existingScript.addEventListener('load', onScriptReady, { once: true });
        existingScript.addEventListener(
          'error',
          () => {
            pickerApiPromise = null;
            reject(new Error('Could not load Google Picker API script.'));
          },
          { once: true }
        );
      }
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.onload = onScriptReady;
    script.onerror = () => {
      pickerApiPromise = null;
      reject(new Error('Could not load https://apis.google.com/js/api.js.'));
    };
    document.head.appendChild(script);
  });

  return pickerApiPromise;
}

function getPickerOrigin(): string {
  const ancestors = window.location.ancestorOrigins;
  return ancestors && ancestors.length > 0
    ? ancestors[ancestors.length - 1]
    : window.location.origin;
}

export interface OpenGooglePickerOptions {
  accessToken: string;
  mode: 'files' | 'folders';
  mediaFilter?: 'image' | 'video' | 'audio' | 'image_video' | 'pdf_and_docs' | 'all';
  multiSelect?: boolean;
  title?: string;
}

export async function openGooglePicker(
  options: OpenGooglePickerOptions
): Promise<DriveFileItem[] | null> {
  if (!options.accessToken) {
    throw new Error('Sign in with Google Drive before opening Google Picker.');
  }

  await loadGooglePickerApi();

  const pickerNs = window.google?.picker;
  if (!pickerNs) {
    throw new Error('Google Picker is unavailable right now.');
  }

  return new Promise<DriveFileItem[] | null>((resolve) => {
    let settled = false;

    const myDriveView =
      options.mode === 'folders'
        ? new pickerNs.DocsView(pickerNs.ViewId.FOLDERS)
            .setIncludeFolders(true)
            .setSelectFolderEnabled(true)
        : new pickerNs.DocsView(pickerNs.ViewId.DOCS)
            .setIncludeFolders(true)
            .setSelectFolderEnabled(false);

    if (options.mode === 'files') {
      if (options.mediaFilter === 'image') {
        myDriveView.setMimeTypes(
          'image/png,image/jpeg,image/webp,image/gif,application/vnd.google-apps.drawing'
        );
      } else if (options.mediaFilter === 'video') {
        myDriveView.setMimeTypes('video/mp4,video/quicktime,video/webm');
      } else if (options.mediaFilter === 'audio') {
        myDriveView.setMimeTypes('audio/mpeg,audio/wav,audio/mp4,audio/ogg,audio/aac');
      } else if (options.mediaFilter === 'image_video') {
        myDriveView.setMimeTypes(
          'image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm'
        );
      } else if (options.mediaFilter === 'pdf_and_docs') {
        myDriveView.setMimeTypes(
          'application/pdf,application/vnd.google-apps.document,application/vnd.google-apps.presentation,application/vnd.google-apps.spreadsheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/png,image/jpeg,image/webp'
        );
      }
    }

    myDriveView.setEnableDrives(true);

    const sharedDrivesView =
      options.mode === 'folders'
        ? new pickerNs.DocsView(pickerNs.ViewId.FOLDERS)
            .setIncludeFolders(true)
            .setSelectFolderEnabled(true)
            .setEnableDrives(true)
        : new pickerNs.DocsView(pickerNs.ViewId.DOCS)
            .setIncludeFolders(true)
            .setSelectFolderEnabled(false)
            .setEnableDrives(true);

    const builder = new pickerNs.PickerBuilder()
      .addView(myDriveView)
      .addView(sharedDrivesView)
      .setOAuthToken(options.accessToken)
      .setOrigin(getPickerOrigin())
      .enableFeature(pickerNs.Feature.SUPPORT_DRIVES)
      .setCallback((data: Record<string, unknown>) => {
        if (settled) return;
        const action = data[pickerNs.Response.ACTION];
        if (action === pickerNs.Action.PICKED) {
          settled = true;
          const docs = (data[pickerNs.Response.DOCUMENTS] as Array<Record<string, unknown>>) || [];
          const items: DriveFileItem[] = docs
            .map((doc) => ({
              id: String(doc[pickerNs.Document.ID] || ''),
              name: String(doc[pickerNs.Document.NAME] || 'Drive Item'),
              mimeType: String(
                doc[pickerNs.Document.MIME_TYPE] ||
                  (options.mode === 'folders'
                    ? 'application/vnd.google-apps.folder'
                    : 'application/octet-stream')
              ),
              webViewLink: doc[pickerNs.Document.URL]
                ? String(doc[pickerNs.Document.URL])
                : undefined,
              iconLink: doc[pickerNs.Document.ICON_URL]
                ? String(doc[pickerNs.Document.ICON_URL])
                : undefined,
              size: doc[pickerNs.Document.SIZE_BYTES]
                ? String(doc[pickerNs.Document.SIZE_BYTES])
                : undefined,
            }))
            .filter((item) => Boolean(item.id));
          resolve(items);
        } else if (action === pickerNs.Action.CANCEL) {
          settled = true;
          resolve(null);
        }
      });

    if (options.title) {
      builder.setTitle(options.title);
    }

    if (options.multiSelect && options.mode === 'files') {
      builder.enableFeature(pickerNs.Feature.MULTISELECT_ENABLED);
    }

    const picker = builder.build();
    picker.setVisible(true);
  });
}
