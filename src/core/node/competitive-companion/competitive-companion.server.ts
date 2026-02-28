import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { exec } from 'node:child_process';
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
    this.logger.error(
      `[CompetitiveCompanion] Failed to bind ports: ${ports.join(', ') || 'none'}.`,
    );
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>(resolve => this.server?.close(() => resolve()));
    this.server = undefined;
    this.port = undefined;
  }

  private async tryListen(port: number): Promise<boolean> {
    const first = await this.tryListenOnce(port);
    if (first.ok) return true;

    if (first.err?.code === 'EADDRINUSE') {
      this.logger.warn(`[CompetitiveCompanion] Port ${port} is in use, attempting to reclaim...`);
      const reclaimed = await this.tryForceTakePort(port);
      if (reclaimed) {
        const retry = await this.tryListenOnce(port);
        return retry.ok;
      }
    }

    return false;
  }

  private async tryListenOnce(port: number): Promise<{ ok: boolean; err?: NodeJS.ErrnoException }> {
    return new Promise(resolve => {
      const server = http.createServer((req, res) => this.handleRequest(req, res));
      server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code !== 'EADDRINUSE') {
          this.logger.error(`[CompetitiveCompanion] Server error: ${err.message}`);
        }
        resolve({ ok: false, err });
      });
      server.listen(port, '127.0.0.1', () => {
        this.server = server;
        resolve({ ok: true });
      });
    });
  }

  private async tryForceTakePort(port: number): Promise<boolean> {
    const pids = await this.findPidsListening(port);
    if (!pids.length) return false;

    let attempted = false;
    for (const pid of pids) {
      if (!Number.isFinite(pid) || pid <= 0 || pid === process.pid) continue;
      attempted = true;
      try {
        process.kill(pid, 'SIGKILL');
        this.logger.warn(`[CompetitiveCompanion] Killed process ${pid} occupying port ${port}.`);
      } catch (err: any) {
        this.logger.warn(
          `[CompetitiveCompanion] Failed to kill process ${pid} on port ${port}: ${err?.message || err}`,
        );
      }
    }

    if (!attempted) return false;
    await new Promise(resolve => setTimeout(resolve, 200));
    return true;
  }

  private async findPidsListening(port: number): Promise<number[]> {
    const platform = process.platform;
    if (platform === 'win32') {
      const output = await this.execCmd(`netstat -ano -p tcp | findstr :${port}`);
      const pids = new Set<number>();
      output
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .forEach(line => {
          const parts = line.split(/\s+/);
          const pid = Number(parts[parts.length - 1]);
          if (Number.isFinite(pid)) pids.add(pid);
        });
      return Array.from(pids);
    }

    const output = await this.execCmd(`lsof -n -P -iTCP:${port} -sTCP:LISTEN`);
    const lines = output.split(/\r?\n/).filter(Boolean);
    if (lines.length <= 1) return [];
    const pids = new Set<number>();
    for (const line of lines.slice(1)) {
      const parts = line.trim().split(/\s+/);
      const pid = Number(parts[1]);
      if (Number.isFinite(pid)) pids.add(pid);
    }
    return Array.from(pids);
  }

  private async execCmd(command: string): Promise<string> {
    return new Promise(resolve => {
      exec(command, { windowsHide: true }, (err, stdout) => {
        if (err) {
          resolve('');
          return;
        }
        resolve(stdout || '');
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

  private async readBody(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<string | undefined> {
    return new Promise(resolve => {
      let size = 0;
      let body = '';
      req.on('data', chunk => {
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
          .map(p => Number(p))
          .filter(p => Number.isFinite(p) && p > 0 && p <= 65535)
          .map(p => Math.trunc(p)),
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
