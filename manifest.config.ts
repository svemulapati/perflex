import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Perflex',
  version: '1.0.0',
  description:
    'Real-time JavaScript performance profiling with function-level attribution and AI-powered remediation',
  permissions: ['activeTab', 'sidePanel', 'storage', 'scripting', 'tabs', 'webNavigation'],
  host_permissions: ['<all_urls>'],
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  content_scripts: [
    {
      // Isolated-world bridge: has chrome.* access. It injects the MAIN-world
      // collector (a self-contained IIFE bundle) via a <script> tag and relays
      // its window.postMessage events to the background.
      matches: ['<all_urls>'],
      js: ['src/content/injector.ts'],
      run_at: 'document_start',
      all_frames: false,
    },
  ],
  side_panel: {
    default_path: 'src/panel/index.html',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: {
      '16': 'src/assets/icons/icon-16.png',
      '48': 'src/assets/icons/icon-48.png',
      '128': 'src/assets/icons/icon-128.png',
    },
  },
  commands: {
    'toggle-overlay': {
      suggested_key: { default: 'Ctrl+Shift+X' },
      description: 'Toggle Perflex overlay',
    },
  },
  icons: {
    '16': 'src/assets/icons/icon-16.png',
    '48': 'src/assets/icons/icon-48.png',
    '128': 'src/assets/icons/icon-128.png',
  },
  web_accessible_resources: [
    {
      resources: ['assets/*'],
      matches: ['<all_urls>'],
    },
  ],
});
