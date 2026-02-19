import '@opensumi/ide-i18n/lib/browser';
import {ExpressFileServerModule} from '@opensumi/ide-express-file-server/lib/browser';
import '@opensumi/ide-core-browser/lib/style/index.less';
import '@opensumi/ide-core-browser/lib/style/icon.less';

import {renderApp} from './render-app';
import {CommonBrowserModules} from '@/bootstrap-web/browser/common-modules';
import {layoutConfig} from './layout-config';
import './main.less';
import './styles.less';


renderApp({
  modules: [
    ...CommonBrowserModules,
    ExpressFileServerModule,
  ],
  layoutConfig,
  useCdnIcon: false,
  useExperimentalShadowDom: false,
  defaultPreferences: {
    'settings.userBeforeWorkspace': true,
    'general.theme': 'opensumi-dark',
    'general.icon': 'vscode-icons',
    'menubar.compactMode': false,
  },
});
