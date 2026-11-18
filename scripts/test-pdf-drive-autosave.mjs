import assert from 'node:assert/strict';

// Set up minimal browser globals for jsPDF, triggerBlobDownload, and FileReader
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

if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class MockFileReader {
    readAsDataURL(blob) {
      setTimeout(async () => {
        try {
          const buf = await blob.arrayBuffer();
          this.result = `data:application/pdf;base64,${Buffer.from(buf).toString('base64')}`;
          if (this.onload) this.onload({ target: this });
        } catch (err) {
          if (this.onerror) this.onerror(err);
        }
      }, 0);
    }
  };
}

// Import pdfExporter and googleDriveSync after browser globals are established
const { downloadMasterPdf, summarizeDriveStatus } = await import('../src/utils/pdfExporter.ts');
const { setCachedGoogleDriveAccessToken, clearGoogleDriveToken } = await import('../src/utils/googleDriveSync.ts');

// Self-contained synthetic project fixture - completely independent of data/ directory
const SYNTHETIC_PROJECT = {
  id: 'synthetic-project-fresh-checkout',
  createdAt: '2026-11-18T10:00:00.000Z',
  updatedAt: '2026-11-18T10:00:00.000Z',
  client: '52Launch Studio',
  product: {
    name: 'Aero Rig Pro',
    description: 'Modular commercial camera cage and quick-release support system.',
    provableClaims: [
      'Precision machined from aerospace-grade aluminum',
      'Integrated toolless Arca-Swiss and NATO rail mounting',
    ],
    photos: [],
  },
  brandBible: {
    hasGenerated: true,
    manuallyEdited: false,
    positioning: 'Cinematic precision engineering for demanding studio productions.',
    audience: 'Commercial directors, DPs, and studio production teams.',
    toneKeywords: ['Professional', 'Rugged', 'Refined'],
    colorPalette: 'Burgundy (#C6202F), Slate (#111114), Soft Grey (#F6F6F7)',
    fontPairings: 'Montserrat / Inter',
    productRules: 'Rig must be shown fully assembled with locked levers.',
    doNots: 'No consumer plastic or flimsy clamps.',
    bannedList: ['cheap plastic', 'unbranded stickers'],
    brandGraphics: [],
    characters: [
      { id: 'ch-1', name: 'Lead DP', fixedDescriptor: 'Mid-30s cinematographer in dark work shirt' },
    ],
    claimsAllowed: [
      'Aerospace-grade aluminum chassis',
      'Sub-millimeter alignment tolerances',
    ],
    claimsToFlag: [],
    toneOfVoice: {
      adjectives: ['Precise', 'Authoritative', 'Reliable'],
      guidance: 'Direct, factual, and confident without hyperbole.',
    },
    visualStyle: {
      palette: '#C6202F, #111114, #F6F6F7',
      typography: 'Montserrat Display with Inter body typography.',
      lighting: 'Clean commercial studio edge lighting with controlled reflections.',
      lensAndFraming: '35mm anamorphic close-ups focusing on machined chamfers.',
      grade: 'Rich neutral contrast with deep blacks.',
    },
  },
  creativeBrief: {
    hasGenerated: true,
    manuallyEdited: false,
    objective: 'Establish Aero Rig Pro as the indispensable handheld studio rig.',
    keyMessage: 'Uncompromising stability and instant toolless reconfiguration.',
    concepts: [
      {
        id: 'concept-1',
        title: 'Precision Under Pressure',
        angle: 'Fast-paced commercial studio shoot where quick changes save the day.',
        logline: 'When milliseconds count on set, precision engineering delivers.',
        whyItWorks: 'Directly demonstrates speed and reliability.',
        risks: 'Must keep focus on hardware.',
        visualHook: 'Macro close-up on quick-release lever.',
        narrative: 'DP shifts from tripod to handheld in one motion.',
        estimatedCostTier: 'standard',
      },
    ],
    recommendedConcept: {
      title: 'Precision Under Pressure',
      reason: 'Maximizes product feature visibility while keeping commercial pacing brisk.',
    },
    deliverables: ['1x 30s Hero Commercial', '3x 15s Cutdowns', 'Production Stills Deck'],
    voDirection: {
      speaker: 'Professional Narrator',
      pace: 'Brisk and authoritative',
      emotionalArc: 'From high-tempo pressure to confident resolution',
    },
    claimsCheck: 'Verified against chassis engineering specs.',
  },
  intake: {
    audience: 'Commercial Filmmakers & DPs',
    tone: 'Cinematic and technical',
    clientMarketingIdeas: 'Highlight toolless locking mechanisms.',
    videosWanted: '30s broadcast commercial',
    shootLocationDatesBudgetNotes: 'Soundstage tabletop + location exterior.',
  },
  shots: [
    {
      id: 'shot-1',
      title: 'Tabletop Hero Reveal',
      scene: 'Motorized turntable slowly rotates camera rig under soft overhead lightbox.',
      route: 'live',
      durationSec: 4,
      frameDescription: 'Hero three-quarter angle of camera cage.',
      voLine: 'Engineered for the uncompromising director.',
      videoPrompt: 'Slow cinematic tracking shot with soft rim lighting.',
      videoUrl: '',
      frameImageUrl: '',
    },
    {
      id: 'shot-2',
      title: 'Quick Release Mechanism',
      scene: 'Operator hands lock top handle into NATO rail with audible click.',
      route: 'live',
      durationSec: 3,
      frameDescription: 'Tight macro on locking lever.',
      voLine: 'Locked in seconds.',
      videoPrompt: 'Macro depth of field rack focus.',
      videoUrl: '',
      frameImageUrl: '',
    },
  ],
  voScript: [
    {
      id: 'vo-1',
      speaker: 'Narrator',
      line: 'Engineered for the uncompromising director.',
      direction: 'Authoritative and steady',
      audioTags: 'dry studio',
      durationSec: 3.5,
      pacing: 'Steady and authoritative',
    },
    {
      id: 'vo-2',
      speaker: 'Narrator',
      line: 'Locked in seconds.',
      direction: 'Punchy emphasis',
      audioTags: 'dry studio',
      durationSec: 2.0,
      pacing: 'Crisp and punchy',
    },
  ],
  voSettings: {
    voiceId: 'Puck',
    voiceName: 'Puck (Direct & Confident)',
    speed: 1.0,
    emotionalTone: 'Authoritative',
    model: 'gemini-3.8-flash-lite-tts',
  },
  shootPlan: {
    shootDays: [
      {
        dayNumber: 1,
        date: '2026-11-20',
        callTime: '08:00 AM',
        location: 'Studio Stage 4',
        notes: 'Tabletop lighting setup and macro lens tests.',
        blocks: [],
      },
    ],
    crew: [
      { role: 'Director', name: 'Jordan Vance', contact: 'jordan@example.com' },
      { role: 'DP', name: 'Morgan Lee', contact: 'morgan@example.com' },
    ],
    equipment: ['Arri Alexa 35', 'Master Anamorphic 35mm', 'Motorized Turntable'],
  },
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
  const interceptedRequests = [];

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
      const parsedBody = opts?.body ? JSON.parse(opts.body) : {};
      const tokenHeader =
        opts?.headers?.['X-Google-Drive-Token'] ||
        (typeof opts?.headers?.get === 'function' ? opts.headers.get('X-Google-Drive-Token') : undefined);

      interceptedRequests.push({
        url: urlStr,
        headers: opts?.headers,
        tokenHeader,
        body: parsedBody,
      });

      return createResponse();
    }
    // Return 404 for asset images or other requests so PDF writer proceeds cleanly
    return new Response(JSON.stringify({}), { status: 404 });
  };

  try {
    const sections = mode === 'individual' ? ['brandBible', 'creativeBrief'] : ['brandBible'];
    const result = await downloadMasterPdf(SYNTHETIC_PROJECT, sections, mode);
    return {
      result,
      downloads: [...triggeredDownloads],
      interceptedRequests,
    };
  } finally {
    globalThis.fetch = originalFetch;
    clearGoogleDriveToken();
  }
}

async function main() {
  console.log('--- Testing Master PDF Export & Drive Auto-Save Statuses (Fresh Checkout Fixture) ---');

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

    // Verify intercepted request carries valid PDF data URL and X-Google-Drive-Token
    assert.ok(
      successTest.interceptedRequests.length > 0,
      `Upload request must be sent in ${mode} mode`
    );
    for (const req of successTest.interceptedRequests) {
      assert.equal(
        req.tokenHeader,
        'valid-mock-drive-token',
        'Request must carry X-Google-Drive-Token header'
      );
      assert.ok(
        typeof req.body.pdfBase64 === 'string' &&
          req.body.pdfBase64.startsWith('data:application/pdf;base64,'),
        'Request body must carry a valid PDF data URL'
      );
      assert.equal(
        req.body.destinationFolderId,
        'dest-folder-abc',
        'Request body must preserve explicit destinationFolderId'
      );
      assert.equal(
        req.body.destinationFolderUrl,
        'https://drive.google.com/drive/folders/dest-folder-abc',
        'Request body must preserve explicit destinationFolderUrl'
      );
    }
    console.log(`     -> Verified local download triggered: ${successTest.downloads.map((d) => d.filename).join(', ')}`);
    console.log(`     -> Verified intercepted request: valid PDF dataUrl (${successTest.interceptedRequests[0].body.pdfBase64.length} chars) & X-Google-Drive-Token`);
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
    ...SYNTHETIC_PROJECT,
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
