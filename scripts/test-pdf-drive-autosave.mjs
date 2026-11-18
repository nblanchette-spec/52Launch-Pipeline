import assert from 'node:assert/strict';

// Set up minimal browser globals for jsPDF and triggerBlobDownload
const triggeredDownloads = [];

globalThis.document = {
  createElement: (tag) => {
    return {
      tagName: tag,
      href: '',
      download: '',
      click() {
        triggeredDownloads.push({
          filename: this.download,
          href: this.href,
        });
      },
      remove() {},
    };
  },
  body: {
    appendChild: () => {},
  },
};

globalThis.URL.createObjectURL = (blob) => {
  return `blob:mock-url-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
};
globalThis.URL.revokeObjectURL = () => {};

import fs from 'node:fs/promises';
import path from 'node:path';

// Import pdfExporter and googleDriveSync after browser globals are established
const { downloadMasterPdf, summarizeDriveStatus } = await import('../src/utils/pdfExporter.ts');
const { setCachedGoogleDriveAccessToken, clearGoogleDriveToken } = await import('../src/utils/googleDriveSync.ts');

const projectJsonRaw = await fs.readFile(
  path.join(process.cwd(), 'data', 'kinetix-core-patch', 'project.json'),
  'utf-8'
);
const BASE_PROJECT = JSON.parse(projectJsonRaw);

const SAMPLE_PROJECT = {
  ...BASE_PROJECT,
  googleDriveDestinationFolderId: 'dest-folder-abc',
  googleDriveDestinationFolderUrl: 'https://drive.google.com/drive/folders/dest-folder-abc',
};

function createJsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SUCCESS_DATA = {
  success: true,
  backupFolderId: 'dest-folder-abc',
  backupFolderUrl: 'https://drive.google.com/drive/folders/dest-folder-abc',
  filename: 'mock-saved.pdf',
};

const READ_ONLY_DATA = {
  error:
    'You do not have write permission on the selected Google Drive destination folder. Choose a Shared Drive or folder where you have Editor/Contributor access.',
};

const EXPIRED_TOKEN_DATA = {
  error:
    'Google Drive is not connected or your Drive session expired. Please reconnect Google Drive and try again.',
};

async function runScenario({ mode, createResponse, hasToken = true }) {
  triggeredDownloads.length = 0;

  if (hasToken) {
    setCachedGoogleDriveAccessToken('valid-mock-drive-token');
  } else {
    clearGoogleDriveToken();
  }

  // Intercept fetch
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const urlStr = String(url);
    if (urlStr.includes('/api/pipeline/drive-upload-pdf')) {
      return createResponse();
    }
    // Return 404 for asset images or other requests so PDF writer proceeds cleanly
    return new Response(JSON.stringify({}), { status: 404 });
  };

  try {
    const sections = mode === 'individual' ? ['brandBible', 'creativeBrief'] : ['brandBible'];
    const result = await downloadMasterPdf(SAMPLE_PROJECT, sections, mode);
    return { result, downloads: [...triggeredDownloads] };
  } finally {
    globalThis.fetch = originalFetch;
    clearGoogleDriveToken();
  }
}

async function main() {
  console.log('--- Testing Master PDF Export & Drive Auto-Save Statuses ---');

  const modes = ['combined', 'individual', 'slideshow'];

  for (const mode of modes) {
    console.log(`\nMode: [${mode}]`);

    // 1. Mocked Success Response
    console.log(`  1. Testing mocked success response...`);
    const successTest = await runScenario({
      mode,
      createResponse: () => createJsonResponse(SUCCESS_DATA, 200),
    });
    assert.ok(
      successTest.downloads.length > 0,
      `Local download must trigger on success in ${mode} mode`
    );
    assert.equal(
      successTest.result.driveStatus.status,
      'saved',
      `Drive status must be 'saved' on success in ${mode} mode`
    );
    assert.equal(
      successTest.result.driveStatus.message,
      'Saved to Drive',
      `Drive status message must be 'Saved to Drive' on success in ${mode} mode`
    );
    assert.equal(
      successTest.result.driveStatus.folderUrl,
      'https://drive.google.com/drive/folders/dest-folder-abc'
    );
    console.log(`     -> Verified local download triggered: ${successTest.downloads.map((d) => d.filename).join(', ')}`);
    console.log(`     -> Verified Drive status: "${successTest.result.driveStatus.message}"`);

    // 2. Mocked Read-Only Folder Response
    console.log(`  2. Testing mocked read-only folder response...`);
    const readOnlyTest = await runScenario({
      mode,
      createResponse: () => createJsonResponse(READ_ONLY_DATA, 403),
    });
    assert.ok(
      readOnlyTest.downloads.length > 0,
      `Local download must STILL trigger even when Drive folder is read-only in ${mode} mode`
    );
    assert.equal(
      readOnlyTest.result.driveStatus.status,
      'failed',
      `Drive status must be 'failed' when Drive folder is read-only in ${mode} mode`
    );
    assert.ok(
      readOnlyTest.result.driveStatus.message.startsWith('PDF downloaded locally, but couldn’t save to Drive:'),
      `Status message must start with "PDF downloaded locally, but couldn’t save to Drive:" in ${mode} mode`
    );
    assert.match(
      readOnlyTest.result.driveStatus.message,
      /write permission/i,
      `Status message must detail the write permission error in ${mode} mode`
    );
    console.log(`     -> Verified local download still triggered: ${readOnlyTest.downloads.map((d) => d.filename).join(', ')}`);
    console.log(`     -> Verified Drive status: "${readOnlyTest.result.driveStatus.message}"`);

    // 3. Mocked Expired Token Response
    console.log(`  3. Testing mocked expired-token response...`);
    const expiredTokenTest = await runScenario({
      mode,
      createResponse: () => createJsonResponse(EXPIRED_TOKEN_DATA, 401),
    });
    assert.ok(
      expiredTokenTest.downloads.length > 0,
      `Local download must STILL trigger even when Drive token is expired in ${mode} mode`
    );
    assert.equal(
      expiredTokenTest.result.driveStatus.status,
      'failed',
      `Drive status must be 'failed' when Drive token is expired in ${mode} mode`
    );
    assert.ok(
      expiredTokenTest.result.driveStatus.message.startsWith('PDF downloaded locally, but couldn’t save to Drive:'),
      `Status message must start with "PDF downloaded locally, but couldn’t save to Drive:" in ${mode} mode`
    );
    assert.match(
      expiredTokenTest.result.driveStatus.message,
      /reconnect google drive/i,
      `Status message must detail the reconnect error in ${mode} mode`
    );
    console.log(`     -> Verified local download still triggered: ${expiredTokenTest.downloads.map((d) => d.filename).join(', ')}`);
    console.log(`     -> Verified Drive status: "${expiredTokenTest.result.driveStatus.message}"`);
  }

  // 4. Testing Disconnected Session when Project has Destination Folder Configured
  console.log('\nTesting disconnected token with destination configured...');
  const disconnectedTest = await runScenario({
    mode: 'combined',
    createResponse: () => createJsonResponse(SUCCESS_DATA, 200),
    hasToken: false,
  });
  assert.ok(disconnectedTest.downloads.length > 0, 'Local download must still trigger when Drive is disconnected');
  assert.equal(disconnectedTest.result.driveStatus.status, 'failed');
  assert.ok(disconnectedTest.result.driveStatus.message.startsWith('PDF downloaded locally, but couldn’t save to Drive:'));
  assert.match(disconnectedTest.result.driveStatus.message, /reconnect/i);
  console.log(`   -> Verified: "${disconnectedTest.result.driveStatus.message}"`);

  // 5. Testing Unlinked Project with no Drive Destination and no Token
  console.log('\nTesting project without Drive configuration or token...');
  clearGoogleDriveToken();
  const unlinkedProject = {
    ...SAMPLE_PROJECT,
    googleDriveDestinationFolderId: undefined,
    googleDriveDestinationFolderUrl: undefined,
    googleDriveBackupFolderId: undefined,
    googleDriveBackupFolderUrl: undefined,
    googleDriveFolderUrls: [],
  };
  triggeredDownloads.length = 0;
  const unlinkedResult = await downloadMasterPdf(unlinkedProject, ['brandBible'], 'combined');
  assert.ok(triggeredDownloads.length > 0, 'Local download must trigger for unlinked project');
  assert.equal(unlinkedResult.driveStatus.status, 'skipped');
  console.log('   -> Verified: Drive autosave cleanly skipped for unlinked project without error');

  // 6. Test summarizeDriveStatus Helper Directly
  console.log('\nTesting summarizeDriveStatus helper logic...');
  assert.deepEqual(summarizeDriveStatus([]), { status: 'skipped', message: '' });
  assert.deepEqual(
    summarizeDriveStatus([{ attempted: false, success: false }]),
    { status: 'skipped', message: '' }
  );
  assert.deepEqual(
    summarizeDriveStatus([
      { attempted: true, success: true, backupFolderUrl: 'https://drive.google.com/test' },
      { attempted: true, success: true },
    ]),
    { status: 'saved', message: 'Saved to Drive', folderUrl: 'https://drive.google.com/test' }
  );
  const failSummary = summarizeDriveStatus([
    { attempted: true, success: true },
    { attempted: true, success: false, error: 'Destination folder is in Trash.' },
  ]);
  assert.equal(failSummary.status, 'failed');
  assert.equal(
    failSummary.message,
    'PDF downloaded locally, but couldn’t save to Drive: Destination folder is in Trash.'
  );

  console.log('\nALL PDF EXPORT & DRIVE AUTOSAVE TESTS PASSED SUCCESSFULLY!\n');
}

main().catch((err) => {
  console.error('\nTEST SUITE FAILED:', err);
  process.exit(1);
});
