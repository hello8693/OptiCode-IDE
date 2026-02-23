import { Autowired, Injectable } from '@opensumi/di';
import { ClientAppContribution, Domain, URI, electronEnv } from '@opensumi/ide-core-browser';
import { WorkbenchEditorService } from '@opensumi/ide-editor/lib/browser';
import { IWorkspaceService } from '@opensumi/ide-workspace/lib/common';
import { IElectronMainUIService } from '@opensumi/ide-core-common/lib/electron';

import {
  CompetitiveCompanionImportEvent,
  CompetitiveCompanionBridgePath,
  ICompetitiveCompanionBridge,
  ICompetitiveCompanionImportClient,
} from '../../common/competitive-companion';
import { CompetitiveCompanionImportClient } from './import-client.service';

const normalizePath = (input: string, ignoreCase: boolean): string => {
  if (!input) return '';
  const normalized = input.replace(/\\/g, '/').replace(/\/+$/g, '');
  return ignoreCase ? normalized.toLowerCase() : normalized;
};

@Domain(ClientAppContribution)
@Injectable()
export class CompetitiveCompanionAutoOpenContribution implements ClientAppContribution {
  @Autowired(WorkbenchEditorService)
  private readonly editorService: WorkbenchEditorService;

  @Autowired(IWorkspaceService)
  private readonly workspaceService: IWorkspaceService;

  @Autowired(IElectronMainUIService)
  private readonly electronMainUIService: IElectronMainUIService;

  @Autowired(CompetitiveCompanionBridgePath)
  private readonly companionBridge: ICompetitiveCompanionBridge;
  
  @Autowired(ICompetitiveCompanionImportClient)
  private readonly importClient: CompetitiveCompanionImportClient;

  private lastHandledEventId: string | undefined;
  private pendingEvent: CompetitiveCompanionImportEvent | undefined;
  private pendingTimer: number | undefined;

  async onStart(): Promise<void> {
    if (!electronEnv.isElectronRenderer) return;
    this.importClient.onDidImportEvent((event) => {
      this.queueImport(event);
    });
    const pending = await this.companionBridge.getPendingImport();
    if (pending) {
      this.queueImport(pending);
    }
    this.workspaceService.onWorkspaceChanged(async () => {
      const next = await this.companionBridge.getPendingImport();
      if (next) {
        this.queueImport(next);
      }
    });
  }

  private async getWorkspaceRoot(): Promise<string | undefined> {
    const roots = await this.workspaceService.roots;
    if (!roots.length) return undefined;
    return new URI(roots[0].uri).codeUri.fsPath;
  }

  private async handleImport(event: CompetitiveCompanionImportEvent): Promise<void> {
    if (this.lastHandledEventId === event.eventId) return;
    const root = await this.getWorkspaceRoot();
    if (!root) return;

    const isWindows = typeof process !== 'undefined' && process.platform === 'win32';
    const current = normalizePath(root, isWindows);
    const target = normalizePath(event.workspaceDir, isWindows);
    if (!current || !target || current !== target) return;

    try {
      if (electronEnv.currentWindowId !== undefined) {
        await this.electronMainUIService.showBrowserWindow(electronEnv.currentWindowId);
      }
      await this.editorService.open(URI.file(event.sourcePath), { preview: false });
      await this.companionBridge.clearPendingImport(event.eventId);
      this.lastHandledEventId = event.eventId;
    } catch {
      // ignore, event will remain pending for next attempt
    }
  }

  private queueImport(event: CompetitiveCompanionImportEvent): void {
    this.pendingEvent = event;
    if (this.pendingTimer) {
      window.clearTimeout(this.pendingTimer);
    }
    this.pendingTimer = window.setTimeout(() => {
      this.pendingTimer = undefined;
      const pending = this.pendingEvent;
      this.pendingEvent = undefined;
      if (pending) {
        void this.handleImport(pending);
      }
    }, 200);
  }
}
