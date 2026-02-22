import { NodeModule, ConstructorOf } from '@opensumi/ide-core-node';
import { ServerCommonModule } from '@opensumi/ide-core-node';
import { FileServiceModule } from '@opensumi/ide-file-service/lib/node';
import { OpenerModule } from '@opensumi/ide-remote-opener/lib/node';
import { ProcessModule } from '@opensumi/ide-process/lib/node';
import { FileSearchModule } from '@opensumi/ide-file-search/lib/node';
import { SearchModule } from '@opensumi/ide-search/lib/node';
import { LogServiceModule } from '@opensumi/ide-logs/lib/node';
import { ExtensionModule } from '@opensumi/ide-extension/lib/node';
import { OpenVsxExtensionManagerModule } from '@opensumi/ide-extension-manager/lib/node';
import { FileSchemeNodeModule } from '@opensumi/ide-file-scheme/lib/node';
import { AddonsModule } from '@opensumi/ide-addons/lib/node';
import {CoreNodeModule} from "@/core/node";
import {LoggerModule} from "@/logger/node";

export const CommonNodeModules: ConstructorOf<NodeModule>[] = [
  ServerCommonModule,
  LogServiceModule,
  FileServiceModule,
  ProcessModule,
  FileSearchModule,
  SearchModule,
  ...(getTerminalModule()),
  ExtensionModule,
  OpenVsxExtensionManagerModule,
  FileSchemeNodeModule,
  AddonsModule,
  CoreNodeModule,
  LoggerModule,
  OpenerModule,
];

function getTerminalModule(): ConstructorOf<NodeModule>[] {
  try {
    // Lazy require to avoid hard crash when node-pty binary is missing/mismatched.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const terminal = require('@opensumi/ide-terminal-next/lib/node') as typeof import('@opensumi/ide-terminal-next/lib/node');
    return terminal?.TerminalNodePtyModule ? [terminal.TerminalNodePtyModule] : [];
  } catch (error: any) {
    // Terminal is optional for web; keep server booting without node-pty.
    const message = error?.message || error;
    console.warn('[web] Terminal module disabled:', message);
    return [];
  }
}
