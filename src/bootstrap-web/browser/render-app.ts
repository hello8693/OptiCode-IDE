import {Injector} from '@opensumi/di';
import {IClientAppOpts} from '@opensumi/ide-core-browser';
import {ClientApp} from '@opensumi/ide-core-browser/lib/bootstrap/app';
import {ToolbarActionBasedLayout} from '@opensumi/ide-core-browser/lib/components';
import {CoreCommandContribution} from "@/bootstrap-web/browser/core-commands";

export async function renderApp(opts: IClientAppOpts) {
  const injector = new Injector();
  injector.addProviders(CoreCommandContribution);

  const hostname = window.location.hostname;
  const query = new URLSearchParams(window.location.search);
  const hash = window.location.hash ? decodeURIComponent(window.location.hash.slice(1)) : '';
  const devFlag = typeof process !== 'undefined' ? process.env.DEVELOPMENT : undefined;
  const isDev = devFlag === true || devFlag === 'true';
  // 线上的静态服务和 IDE 后端是一个 Server
  const serverPort = isDev ? 8000 : window.location.port;
  const staticServerPort = isDev ? 8080 : window.location.port;
  const webviewEndpointPort = isDev ? 8899 : window.location.port;
  opts.appName= 'OptiCode IDE';
  const queryWorkspaceDir = query.get('workspaceDir') || hash || '';
  const workspaceDir = typeof process !== 'undefined' ? process.env.WORKSPACE_DIR : undefined;
  const extensionDir = typeof process !== 'undefined' ? process.env.EXTENSION_DIR : undefined;
  const wsPath = typeof process !== 'undefined' ? process.env.WS_PATH : undefined;
  const extensionWorkerHost = typeof process !== 'undefined' ? process.env.EXTENSION_WORKER_HOST : undefined;
  const staticServerPath = typeof process !== 'undefined' ? process.env.STATIC_SERVER_PATH : undefined;
  const webviewHost = typeof process !== 'undefined' ? process.env.WEBVIEW_HOST : undefined;

  opts.workspaceDir = queryWorkspaceDir || opts.workspaceDir || (workspaceDir as string | undefined);
  opts.extensionDir = opts.extensionDir || (extensionDir as string | undefined);

  opts.wsPath = (wsPath as string | undefined) || (window.location.protocol == 'https:' ? `wss://${hostname}:${serverPort}` : `ws://${hostname}:${serverPort}`);
  console.log(opts.wsPath)
  opts.extWorkerHost = opts.extWorkerHost || (extensionWorkerHost as string | undefined) || `http://${hostname}:${staticServerPort}/ext-host/worker-host.js`;
  opts.staticServicePath = (staticServerPath as string | undefined) || `http://${hostname}:${serverPort}`;
  const anotherHostName = (webviewHost as string | undefined) || hostname;
  opts.webviewEndpoint = `http://${anotherHostName}:${webviewEndpointPort}/webview`;
  opts.layoutComponent = opts.layoutComponent || ToolbarActionBasedLayout;
  opts.injector = injector
  opts.isElectronRenderer = false
  const app = new ClientApp(opts);

  app.fireOnReload = () => {
    window.location.reload();
  };

  app.start(document.getElementById('main')!, 'web');
}
