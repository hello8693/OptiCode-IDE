import { Autowired, Injectable } from '@opensumi/di';
import { ClientAppContribution, Domain, Emitter, Event, URI } from '@opensumi/ide-core-browser';
import { FileChange, FileChangeType } from '@opensumi/ide-core-common';
import { IFileServiceClient, IFileServiceWatcher } from '@opensumi/ide-file-service';
import { IWorkspaceService } from '@opensumi/ide-workspace/lib/common';

import { IProblem, IProblemService } from '../../common/problem';
import { IProblemAssetService, ProblemAssets } from '../../common/problem-assets';
import { IStorageService } from '../../common/types';

export interface ProblemWorkspaceSnapshot {
  problems: IProblem[];
  assets: Record<string, ProblemAssets>;
  workspaceSupported: boolean;
  lastScanAt: number | null;
  scanDurationMs: number;
}

const DEFAULT_SNAPSHOT: ProblemWorkspaceSnapshot = {
  problems: [],
  assets: {},
  workspaceSupported: true,
  lastScanAt: null,
  scanDurationMs: 0,
};

const EXCLUDES = ['**/node_modules/**', '**/.git/**', '**/bin/**'];
const SNAPSHOT_STORAGE_KEY = 'problemWorkspace.snapshot';

@Injectable()
@Domain(ClientAppContribution)
export class ProblemWorkspaceStateService implements ClientAppContribution {
  @Autowired(IWorkspaceService)
  private readonly workspaceService: IWorkspaceService;

  @Autowired(IFileServiceClient)
  private readonly fileService: IFileServiceClient;

  @Autowired(IProblemService)
  private readonly problemService: IProblemService;

  @Autowired(IProblemAssetService)
  private readonly assetService: IProblemAssetService;

  @Autowired(IStorageService)
  private readonly storage: IStorageService;

  private snapshot: ProblemWorkspaceSnapshot = { ...DEFAULT_SNAPSHOT };
  private readonly onDidChangeEmitter = new Emitter<ProblemWorkspaceSnapshot>();
  readonly onDidChange: Event<ProblemWorkspaceSnapshot> = this.onDidChangeEmitter.event;

  private initialized = false;
  private currentWorkspaceRoot: string | undefined;
  private watcher: IFileServiceWatcher | undefined;
  private watcherDisposable: { dispose(): void } | undefined;
  private refreshTimer: number | undefined;
  private fallbackTimer: number | undefined;
  private saveTimer: number | undefined;
  private refreshInFlight = false;
  private refreshQueued = false;

  async onStart(): Promise<void> {
    void this.ensureInitialized();
    void this.init(false);
    this.workspaceService.onWorkspaceChanged(() => {
      this.initialized = false;
      void this.ensureInitialized();
      void this.init(false);
    });
    this.fallbackTimer = window.setInterval(() => {
      void this.refresh();
    }, 60000);
  }

  getSnapshot(): ProblemWorkspaceSnapshot {
    return this.snapshot;
  }

  async refresh(): Promise<void> {
    if (this.refreshInFlight) {
      this.refreshQueued = true;
      return;
    }
    this.refreshInFlight = true;
    const start = Date.now();
    try {
      const roots = await this.workspaceService.roots;
      if (!roots.length) {
        this.currentWorkspaceRoot = undefined;
        if (!this.isDefaultSnapshot()) {
          this.updateSnapshot({ ...DEFAULT_SNAPSHOT });
        }
        return;
      }
      this.currentWorkspaceRoot = new URI(roots[0].uri).codeUri.fsPath;
      const problems = await this.problemService.listProblems();
      const assets = await this.assetService.listAssetsForProblems(problems);
      let workspaceSupported = true;
      if (problems.length === 0) {
        workspaceSupported = await this.problemService.isOptiCodeWorkspace();
      }
      const lastScanAt = Date.now();
      const scanDurationMs = lastScanAt - start;
      this.updateSnapshot({
        problems,
        assets,
        workspaceSupported,
        lastScanAt,
        scanDurationMs,
      });
    } catch {
      // keep previous snapshot on errors
    } finally {
      this.refreshInFlight = false;
      if (this.refreshQueued) {
        this.refreshQueued = false;
        void this.refresh();
      }
    }
  }

  async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const cached = await this.readCachedSnapshot();
    if (cached) {
      this.updateSnapshot(cached, false);
    }
    this.scheduleRefresh(1500);
  }

  private async init(refreshNow = false): Promise<void> {
    await this.disposeWatcher();
    const roots = await this.workspaceService.roots;
    if (!roots.length) {
      this.currentWorkspaceRoot = undefined;
      this.updateSnapshot({ ...DEFAULT_SNAPSHOT });
      return;
    }
    this.currentWorkspaceRoot = new URI(roots[0].uri).codeUri.fsPath;
    if (refreshNow) {
      await this.refresh();
    }
    await this.startWatching(new URI(roots[0].uri));
  }

  private async startWatching(root: URI): Promise<void> {
    this.watcher = await this.fileService.watchFileChanges(root, EXCLUDES);
    this.watcherDisposable = this.watcher.onFilesChanged((changes) => {
      if (this.shouldRefreshFromChanges(changes)) {
        this.scheduleRefresh();
      }
    });
  }

  private async disposeWatcher(): Promise<void> {
    if (this.refreshTimer) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    if (this.watcherDisposable) {
      this.watcherDisposable.dispose();
      this.watcherDisposable = undefined;
    }
    if (this.watcher) {
      await this.watcher.dispose();
      this.watcher = undefined;
    }
  }

  private scheduleRefresh(delay = 350): void {
    if (this.refreshTimer) {
      window.clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = undefined;
      void this.refresh();
    }, delay);
  }

  private shouldRefreshFromChanges(changes: FileChange[]): boolean {
    return changes.some((change) => this.isRelevantChange(change));
  }

  private isRelevantChange(change: FileChange): boolean {
    if (change.type === FileChangeType.ADDED || change.type === FileChangeType.DELETED) {
      return true;
    }
    if (change.type !== FileChangeType.UPDATED) {
      return false;
    }
    const normalized = this.normalizePath(change.uri);
    return normalized.endsWith('/meta.json') || normalized.endsWith('/samples.json');
  }

  private normalizePath(raw: string): string {
    if (!raw) return '';
    const fsPath = raw.startsWith('file://') ? new URI(raw).codeUri.fsPath : raw;
    return fsPath.replace(/\\/g, '/').toLowerCase();
  }

  private updateSnapshot(next: ProblemWorkspaceSnapshot, persist = true): void {
    this.snapshot = next;
    this.onDidChangeEmitter.fire(next);
    if (persist) {
      this.saveSnapshot();
    }
  }

  private isDefaultSnapshot(): boolean {
    return (
      this.snapshot.lastScanAt === null &&
      this.snapshot.workspaceSupported === DEFAULT_SNAPSHOT.workspaceSupported &&
      this.snapshot.problems.length === 0 &&
      Object.keys(this.snapshot.assets).length === 0
    );
  }

  private normalizeSnapshot(raw: Partial<ProblemWorkspaceSnapshot> | undefined): ProblemWorkspaceSnapshot | null {
    if (!raw || typeof raw !== 'object') return null;
    return {
      problems: Array.isArray(raw.problems) ? raw.problems : [],
      assets: raw.assets && typeof raw.assets === 'object' ? raw.assets : {},
      workspaceSupported: typeof raw.workspaceSupported === 'boolean' ? raw.workspaceSupported : DEFAULT_SNAPSHOT.workspaceSupported,
      lastScanAt: typeof raw.lastScanAt === 'number' || raw.lastScanAt === null ? raw.lastScanAt : null,
      scanDurationMs: typeof raw.scanDurationMs === 'number' ? raw.scanDurationMs : 0,
    };
  }

  private async readCachedSnapshot(): Promise<ProblemWorkspaceSnapshot | null> {
    const stored: any = await Promise.resolve(this.storage.getItem(SNAPSHOT_STORAGE_KEY, undefined));
    if (!stored) return null;
    const roots = await this.workspaceService.roots;
    if (!roots.length) return null;
    const root = new URI(roots[0].uri).codeUri.fsPath;
    const workspaceRoot = stored.workspaceRoot || stored.workspace;
    if (workspaceRoot && workspaceRoot !== root) {
      return null;
    }
    const snapshot = this.normalizeSnapshot(stored.snapshot ?? stored);
    return snapshot;
  }

  private saveSnapshot() {
    if (!this.currentWorkspaceRoot) return;
    if (this.saveTimer) {
      window.clearTimeout(this.saveTimer);
    }
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = undefined;
      this.storage.setItem(SNAPSHOT_STORAGE_KEY, {
        workspaceRoot: this.currentWorkspaceRoot,
        snapshot: this.snapshot,
      });
    }, 300);
  }
}
