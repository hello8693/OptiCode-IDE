import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Injectable, Autowired } from '@opensumi/di';
import { ILogService } from '@/logger/common';
import {
  DEFAULT_COMPETITIVE_COMPANION_PORTS,
  CompetitiveCompanionPayload,
  COMPETITIVE_COMPANION_SETTINGS_KEY,
  COMPETITIVE_COMPANION_LAST_WORKSPACE_KEY,
  DEFAULT_COMPETITIVE_COMPANION_SETTINGS,
  CompetitiveCompanionSettings,
  CompetitiveCompanionImportEvent,
  ICompetitiveCompanionBridge,
} from '@/core/common/competitive-companion';
import { CompetitiveCompanionService } from './competitive-companion.service';

const MAX_BODY_SIZE = 2 * 1024 * 1024;

@Injectable()
export class CompetitiveCompanionServer {
  @Autowired(ILogService)
  private readonly logger: ILogService;

  @Autowired(CompetitiveCompanionService)
  private readonly companionService: CompetitiveCompanionService;

  @Autowired(ICompetitiveCompanionBridge)
  private readonly companionBridge: ICompetitiveCompanionBridge;

  private server?: http.Server;
  private port?: number;

  async start(): Promise<void> {
    if (this.server) return;
    const settings = await this.readSettings();
    if (!settings.enabled) {
      this.logger.info('[CompetitiveCompanion] Disabled by settings.');
      return;
    }

    const ports = settings.ports.length ? settings.ports : DEFAULT_COMPETITIVE_COMPANION_PORTS;
    for (const port of ports) {
      const ok = await this.tryListen(port);
      if (ok) {
        this.port = port;
        this.logger.info(`[CompetitiveCompanion] Listening on http://127.0.0.1:${port}/`);
        return;
      }
    }
    this.logger.error(`[CompetitiveCompanion] Failed to bind ports: ${ports.join(', ') || 'none'}.`);
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
    this.server = undefined;
    this.port = undefined;
  }

  private async tryListen(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = http.createServer((req, res) => this.handleRequest(req, res));
      server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code !== 'EADDRINUSE') {
          this.logger.error(`[CompetitiveCompanion] Server error: ${err.message}`);
        }
        resolve(false);
      });
      server.listen(port, '127.0.0.1', () => {
        this.server = server;
        resolve(true);
      });
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', message: 'Method not allowed' }));
      return;
    }

    const rawBody = await this.readBody(req, res);
    if (!rawBody) {
      return;
    }

    let payload: CompetitiveCompanionPayload;
    try {
      payload = JSON.parse(rawBody) as CompetitiveCompanionPayload;
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', message: 'Invalid JSON' }));
      return;
    }

    const workspaceDir = await this.getWorkspaceDir();
    if (!workspaceDir) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', message: 'Workspace not available' }));
      return;
    }

    try {
      const result = await this.companionService.importProblem(payload, workspaceDir);
      const sourcePath = path.join(result.rootDir, `${result.id}.cpp`);
      const event: CompetitiveCompanionImportEvent = {
        eventId: randomUUID(),
        problemId: result.id,
        workspaceDir,
        sourcePath,
        createdAt: Date.now(),
      };
      await this.companionBridge.reportImport(event);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', id: result.id, rootDir: result.rootDir }));
    } catch (err: any) {
      this.logger.error(`[CompetitiveCompanion] Import failed: ${err?.message || err}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', message: 'Import failed' }));
    }
  }

  private async readBody(req: http.IncomingMessage, res: http.ServerResponse): Promise<string | undefined> {
    return new Promise((resolve) => {
      let size = 0;
      let body = '';
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_SIZE) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', message: 'Payload too large' }));
          req.socket.destroy();
          resolve(undefined);
          return;
        }
        body += chunk.toString();
      });
      req.on('end', () => resolve(body));
      req.on('error', () => resolve(undefined));
    });
  }

  private async getWorkspaceDir(): Promise<string | undefined> {
    const fromStorage = await this.readLastWorkspaceFromStorage();
    if (fromStorage) return fromStorage;
    return process.env.WORKSPACE_DIR || process.env.IDE_WORKSPACE_DIR;
  }

  private async readSettings(): Promise<CompetitiveCompanionSettings> {
    const storagePath = process.env.IDE_STORAGE_PATH;
    if (!storagePath) return DEFAULT_COMPETITIVE_COMPANION_SETTINGS;
    try {
      const content = await fs.readFile(storagePath, 'utf8');
      const data = JSON.parse(content) as Record<string, unknown>;
      return this.normalizeSettings(data?.[COMPETITIVE_COMPANION_SETTINGS_KEY]);
    } catch {
      return DEFAULT_COMPETITIVE_COMPANION_SETTINGS;
    }
  }

  private normalizeSettings(raw: unknown): CompetitiveCompanionSettings {
    const fallback = DEFAULT_COMPETITIVE_COMPANION_SETTINGS;
    const input = (raw || {}) as Partial<CompetitiveCompanionSettings>;
    const enabled = typeof input.enabled === 'boolean' ? input.enabled : fallback.enabled;
    const ports = Array.isArray(input.ports) ? input.ports : fallback.ports;
    const normalizedPorts = Array.from(
      new Set(
        ports
          .map((p) => Number(p))
          .filter((p) => Number.isFinite(p) && p > 0 && p <= 65535)
          .map((p) => Math.trunc(p)),
      ),
    );
    return {
      enabled,
      ports: normalizedPorts.length ? normalizedPorts : fallback.ports,
    };
  }

  private async readLastWorkspaceFromStorage(): Promise<string | undefined> {
    const storagePath = process.env.IDE_STORAGE_PATH;
    if (!storagePath) return undefined;
    try {
      const content = await fs.readFile(storagePath, 'utf8');
      const data = JSON.parse(content) as Record<string, unknown>;
      const candidate = data?.[COMPETITIVE_COMPANION_LAST_WORKSPACE_KEY];
      if (typeof candidate !== 'string' || !candidate.trim()) return undefined;
      const normalized = candidate.trim();
      try {
        const stat = await fs.stat(normalized);
        if (stat.isDirectory()) return normalized;
      } catch {
        return undefined;
      }
      return normalized;
    } catch {
      return undefined;
    }
  }
}
