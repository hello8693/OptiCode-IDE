import '@opensumi/ide-i18n/lib/browser';
import {ExpressFileServerModule} from '@opensumi/ide-express-file-server/lib/browser';
import '@opensumi/ide-core-browser/lib/style/index.less';
import '@opensumi/ide-core-browser/lib/style/icon.less';

import {renderApp} from './render-app';
import {CommonBrowserModules} from '@/bootstrap-web/browser/common-modules';
import {layoutConfig} from './layout-config';
import './main.less';
import './styles.less';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { WebLoader } from '@/core/browser/loader/WebLoader';

const workspaceDir = typeof process !== 'undefined' ? process.env.WORKSPACE_DIR : undefined;
const extensionDir = typeof process !== 'undefined' ? process.env.EXTENSION_DIR : undefined;
const storageDirName = (typeof process !== 'undefined' ? process.env.STORAGE_DIR_NAME : undefined) || '.sumi';
const preferenceDirName = (typeof process !== 'undefined' ? process.env.PREFERENCE_DIR_NAME : undefined) || '.sumi';
const extensionStorageDirName =
  (typeof process !== 'undefined' ? process.env.EXTENSION_STORAGE_DIR_NAME : undefined) || '.sumi';
const wsPath = typeof process !== 'undefined' ? process.env.WS_PATH : undefined;
const staticServicePath = typeof process !== 'undefined' ? process.env.STATIC_SERVER_PATH : undefined;
const extWorkerHost = typeof process !== 'undefined' ? process.env.EXTENSION_WORKER_HOST : undefined;
const webviewEndpoint = typeof process !== 'undefined' ? process.env.WEBVIEW_HOST : undefined;

const loaderElement = document.getElementById('loader');
if (loaderElement) {
  const root = createRoot(loaderElement);
  root.render(React.createElement(WebLoader));
  (window as any).__opticodeUnmountLoader = () => {
    try {
      root.unmount();
    } catch {
      // Ignore
    }
    (window as any).__opticodeUnmountLoader = null;
  };
}

renderApp({
  modules: [
    ...CommonBrowserModules,
    ExpressFileServerModule,
  ],
  layoutConfig,
  useCdnIcon: false,
  useExperimentalShadowDom: false,
  workspaceDir,
  extensionDir,
  storageDirName,
  preferenceDirName,
  extensionStorageDirName,
  wsPath,
  staticServicePath,
  extWorkerHost,
  webviewEndpoint,
  defaultPreferences: {
    'settings.userBeforeWorkspace': true,
    'general.theme': 'opensumi-dark',
    'general.icon': 'vscode-icons',
    'menubar.compactMode': false,
  },
});
