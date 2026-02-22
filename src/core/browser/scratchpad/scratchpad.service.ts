import { Autowired, Injectable } from '@opensumi/di';
import { Emitter, Event, URI } from '@opensumi/ide-core-browser';
import { IFileServiceClient } from '@opensumi/ide-file-service';
import { IWorkspaceService } from '@opensumi/ide-workspace/lib/common';

import { IStorageService, ISystemPathService, SystemPathServicePath } from '../../common';
import {
  SCRATCHPAD_STORAGE_KEY,
  SCRATCHPAD_SUBDIR,
  SCRATCHPAD_TMP_SUBDIR,
  SCRATCHPAD_EXT,
  ScratchpadEntry,
  ScratchpadLanguage,
  ScratchpadStore,
} from '../../common/scratchpad';
import { CPP_TEMPLATE_STORAGE_KEY, DEFAULT_CPP_TEMPLATE } from '../../common/templates';
import { ClangdConfigService } from '../services/clangd-config.service';

const DEFAULT_LANGUAGE: ScratchpadLanguage = 'cpp';

@Injectable()
export class ScratchpadService {
  @Autowired(IFileServiceClient)
  private readonly fileService: IFileServiceClient;

  @Autowired(IWorkspaceService)
  private readonly workspaceService: IWorkspaceService;

  @Autowired(IStorageService)
  private readonly storage: IStorageService;

  @Autowired(SystemPathServicePath)
  private readonly systemPathService: ISystemPathService;

  @Autowired(ClangdConfigService)
  private readonly clangdConfig: ClangdConfigService;

  private clangdRefreshTimer: ReturnType<typeof setTimeout> | undefined;
  private lastClangdRefreshAt = 0;

  private cache?: ScratchpadStore;
  private readonly onDidChangeEmitter = new Emitter<void>();
  readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

  async list(): Promise<ScratchpadEntry[]> {
    const store = await this.loadStore();
    return store.order.map((id) => store.items[id]).filter(Boolean);
  }

  async get(id: string): Promise<ScratchpadEntry | undefined> {
    const store = await this.loadStore();
    return store.items[id];
  }

  async ensure(id: string): Promise<ScratchpadEntry> {
    const existing = await this.get(id);
    if (existing) return existing;
    const now = Date.now();
    const template = await this.getTemplateContent();
    const entry: ScratchpadEntry = {
      id,
      name: this.formatTimestamp(now),
      language: DEFAULT_LANGUAGE,
      content: template,
      createdAt: now,
      updatedAt: now,
    };
    const store = await this.loadStore();
    store.items[id] = entry;
    store.order.unshift(id);
    await this.saveStore(store);
    return entry;
  }

  async create(language: ScratchpadLanguage = DEFAULT_LANGUAGE): Promise<ScratchpadEntry> {
    const now = Date.now();
    const id = this.generateId();
    const template = await this.getTemplateContent();
    const entry: ScratchpadEntry = {
      id,
      name: this.formatTimestamp(now),
      language,
      content: template,
      createdAt: now,
      updatedAt: now,
    };
    const store = await this.loadStore();
    store.items[id] = entry;
    store.order.unshift(id);
    await this.saveStore(store);
    return entry;
  }

  async rename(id: string, name: string): Promise<void> {
    const store = await this.loadStore();
    const entry = store.items[id];
    if (!entry) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    entry.name = trimmed;
    entry.updatedAt = Date.now();
    this.bumpOrder(store, id);
    await this.saveStore(store);
  }

  async updateContent(id: string, content: string): Promise<void> {
    const store = await this.loadStore();
    const entry = store.items[id];
    if (!entry) return;
    if (entry.content === content) return;
    entry.content = content;
    entry.updatedAt = Date.now();
    this.bumpOrder(store, id);
    await this.saveStore(store);
  }

  async updateRunInfo(id: string, exitCode?: number): Promise<void> {
    const store = await this.loadStore();
    const entry = store.items[id];
    if (!entry) return;
    entry.lastRunAt = Date.now();
    entry.lastRunExitCode = exitCode;
    entry.updatedAt = Date.now();
    this.bumpOrder(store, id);
    await this.saveStore(store);
  }

  async remove(id: string): Promise<void> {
    const store = await this.loadStore();
    if (!store.items[id]) return;
    delete store.items[id];
    store.order = store.order.filter((key) => key !== id);
    await this.saveStore(store);
  }

  async clear(): Promise<void> {
    const store: ScratchpadStore = { items: {}, order: [] };
    await this.saveStore(store);
  }

  getIdFromUri(uri: URI): string | undefined {
    const authority = uri.authority;
    if (authority) return authority;
    const path = (uri.path || '').replace(/^\/+/, '');
    return path || undefined;
  }

  getIdFromBackingUri(uri: URI): string | undefined {
    if (uri.scheme !== 'file') return undefined;
    const fsPath = uri.codeUri.fsPath.replace(/\\/g, '/');
    const workspaceMarker = `/${SCRATCHPAD_SUBDIR.replace(/\\/g, '/')}/`;
    const tmpMarker = `/${SCRATCHPAD_TMP_SUBDIR.replace(/\\/g, '/')}/`;
    let segment: string | undefined;
    if (fsPath.includes(workspaceMarker)) {
      segment = fsPath.split(workspaceMarker).pop();
    } else if (fsPath.includes(tmpMarker)) {
      segment = fsPath.split(tmpMarker).pop();
    }
    if (!segment) return undefined;
    const name = segment.split('/').pop() || '';
    if (!name.endsWith(SCRATCHPAD_EXT)) return undefined;
    return name.slice(0, -SCRATCHPAD_EXT.length) || undefined;
  }

  async getBackingUri(id: string): Promise<URI> {
    const entry = await this.ensure(id);
    const root = await this.getWorkspaceRoot();
    const { filePath, dirPath } = await this.systemPathService.getScratchpadFilePath(id, root);
    const dirUri = URI.file(dirPath).toString();
    await this.ensureDir(dirUri);

    const fileUri = URI.file(filePath);
    let existed = false;
    try {
      const stat = await this.fileService.getFileStat(fileUri.toString());
      if (stat) {
        existed = true;
        if (root) {
          this.scheduleClangdRefresh(filePath);
        }
        return fileUri;
      }
    } catch {
      // ignore
    }

    let content = entry.content;
    if (!content) {
      content = await this.getTemplateContent();
      await this.updateContent(id, content);
    }
    await this.fileService.createFile(fileUri.toString(), { content, overwrite: true });
    if (root) {
      this.scheduleClangdRefresh(filePath);
    }
    return fileUri;
  }

  private generateId(): string {
    const maybe = globalThis.crypto && 'randomUUID' in globalThis.crypto
      ? (globalThis.crypto as Crypto).randomUUID()
      : '';
    return maybe || `scratch-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private formatTimestamp(ts: number): string {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  private bumpOrder(store: ScratchpadStore, id: string) {
    store.order = [id, ...store.order.filter((key) => key !== id)];
  }

  private async getTemplateContent(): Promise<string> {
    const current = await Promise.resolve(
      this.storage.getItem<string>(CPP_TEMPLATE_STORAGE_KEY, DEFAULT_CPP_TEMPLATE),
    );
    return current || DEFAULT_CPP_TEMPLATE;
  }

  private async getWorkspaceRoot(): Promise<string | undefined> {
    const roots = await this.workspaceService.roots;
    if (!roots.length) return undefined;
    return new URI(roots[0].uri).codeUri.fsPath;
  }

  private async ensureDir(dirUri: string) {
    try {
      const stat = await this.fileService.getFileStat(dirUri);
      if (!stat) {
        await this.fileService.createFolder(dirUri);
      }
    } catch {
      try { await this.fileService.createFolder(dirUri); } catch { /* ignore */ }
    }
  }

  private scheduleClangdRefresh(filePath?: string) {
    const now = Date.now();
    if (now - this.lastClangdRefreshAt < 5000) return;
    this.lastClangdRefreshAt = now;
    if (this.clangdRefreshTimer) {
      clearTimeout(this.clangdRefreshTimer);
    }
    this.clangdRefreshTimer = setTimeout(() => {
      this.clangdRefreshTimer = undefined;
      if (filePath) {
        void this.clangdConfig.ensureCompileCommandsForFiles([filePath]);
      } else {
        void this.clangdConfig.regenerateCompileCommands();
      }
    }, 1200);
  }

  private async loadStore(): Promise<ScratchpadStore> {
    if (this.cache) return this.cache;
    const raw = await Promise.resolve(
      this.storage.getItem<ScratchpadStore>(SCRATCHPAD_STORAGE_KEY, undefined as any),
    );
    const store = this.normalizeStore(raw);
    this.cache = store;
    return store;
  }

  private normalizeStore(raw: any): ScratchpadStore {
    if (!raw || typeof raw !== 'object') {
      return { items: {}, order: [] };
    }
    const items = raw.items && typeof raw.items === 'object' ? raw.items as Record<string, ScratchpadEntry> : {};
    const order = Array.isArray(raw.order) ? raw.order as string[] : [];
    const validOrder = order.filter((id) => !!items[id]);
    const missing = Object.keys(items).filter((id) => !validOrder.includes(id));
    const mergedOrder = [...validOrder, ...missing];
    return { items, order: mergedOrder };
  }

  private async saveStore(store: ScratchpadStore): Promise<void> {
    this.cache = store;
    await Promise.resolve(this.storage.setItem(SCRATCHPAD_STORAGE_KEY, store));
    this.onDidChangeEmitter.fire();
  }
}
