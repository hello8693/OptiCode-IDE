
import '@/core/common/asar'
import * as net from 'node:net';
import path from 'node:path';
import mri from 'mri'
import { IServerAppOpts, ServerApp, ConstructorOf, NodeModule } from '@opensumi/ide-core-node';
import { createNetServerConnection } from '@opensumi/ide-core-node/lib/connection';
import { ServerCommonModule } from '@opensumi/ide-core-node';
import { FileServiceModule } from '@opensumi/ide-file-service/lib/node';
import { ProcessModule } from '@opensumi/ide-process/lib/node';
import { FileSearchModule } from '@opensumi/ide-file-search/lib/node';
import { SearchModule } from '@opensumi/ide-search/lib/node';
import { TerminalNodePtyModule } from '@opensumi/ide-terminal-next/lib/node';
import { terminalPreferenceSchema } from '@opensumi/ide-terminal-next/lib/common/preference'
import { LogServiceModule } from '@opensumi/ide-logs/lib/node';
import { ExtensionModule } from '@opensumi/ide-extension/lib/node';
import { FileSchemeNodeModule } from '@opensumi/ide-file-scheme/lib/node';
import { AddonsModule } from '@opensumi/ide-addons/lib/node';
import { OpenVsxExtensionManagerModule } from '@opensumi/ide-extension-manager/lib/node';
import { CoreNodeModule } from '@/core/node';
import { LoggerModule } from '@/logger/node'
import { getStartupTiming } from '@/core/common/startup-timing'

const modules: ConstructorOf<NodeModule>[] = [
  ServerCommonModule,
  LogServiceModule,
  FileServiceModule,
  ProcessModule,
  FileSearchModule,
  SearchModule,
  TerminalNodePtyModule,
  ExtensionModule,
  OpenVsxExtensionManagerModule,
  FileSchemeNodeModule,
  AddonsModule,
  CoreNodeModule,
  LoggerModule,
]

startServer();

async function startServer() {
  const timing = getStartupTiming('node', console);
  timing.mark('start.begin');
  const opts: IServerAppOpts = {
    modules,
    webSocketHandler: [],
    marketplace: {
      showBuiltinExtensions: true,
      extensionDir: process.env.IDE_EXTENSIONS_PATH!,
    },
    watcherHost: path.join(__dirname, '../watcher-host/index'),
  };

  const server = net.createServer();
  const serverApp = new ServerApp(opts);
  server.on('error', () => {
    setTimeout(() => {
      process.exit(1);
    });
  });

  const listenPath = mri(process.argv).listenPath;
  const fastStartup =
    process.env.OPTICODE_FAST_STARTUP === '1' ||
    process.env.OPTICODE_FAST_STARTUP === 'true' ||
    process.env.NODE_ENV === 'development';

  if (fastStartup) {
    timing.mark('fast-startup.enabled');
    await (serverApp as any).initializeContribution?.();
    timing.mark('initializeContribution');
    createNetServerConnection(server, serverApp.injector, (serverApp as any).modulesInstances || []);
    timing.mark('net-connection.ready');
    server.listen(listenPath, () => {
      timing.mark('server.listen');
      process.send?.('ready');
      timing.mark('process.ready.sent');
    });
    (async () => {
      try {
        await (serverApp as any).startContribution?.();
        timing.mark('startContribution');
      } catch {
        timing.mark('startContribution.error');
      }
    })();
  } else {
    const startPromise = serverApp.start(server);
    server.listen(listenPath, () => {
      timing.mark('server.listen');
      process.send?.('ready');
      timing.mark('process.ready.sent');
    });
    await startPromise;
    timing.mark('server.start.done');
  }
}
