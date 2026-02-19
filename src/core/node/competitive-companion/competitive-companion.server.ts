import http from 'node:http';
import { Injectable, Autowired } from '@opensumi/di';
import { ILogService } from '@/logger/common';
import { DEFAULT_COMPETITIVE_COMPANION_PORTS, CompetitiveCompanionPayload } from '@/core/common/competitive-companion';
import { CompetitiveCompanionService } from './competitive-companion.service';

const MAX_BODY_SIZE = 2 * 1024 * 1024;

@Injectable()
export class CompetitiveCompanionServer {
  @Autowired(ILogService)
  private readonly logger: ILogService;

  @Autowired(CompetitiveCompanionService)
  private readonly companionService: CompetitiveCompanionService;

  private server?: http.Server;
  private port?: number;

  async start(): Promise<void> {
    if (this.server) return;
    for (const port of DEFAULT_COMPETITIVE_COMPANION_PORTS) {
      const ok = await this.tryListen(port);
      if (ok) {
        this.port = port;
        this.logger.info(`[CompetitiveCompanion] Listening on http://127.0.0.1:${port}/`);
        return;
      }
    }
    this.logger.error('[CompetitiveCompanion] Failed to bind ports 27121-27125.');
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

    const workspaceDir = this.getWorkspaceDir();
    if (!workspaceDir) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', message: 'Workspace not available' }));
      return;
    }

    try {
      const result = await this.companionService.importProblem(payload, workspaceDir);
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

  private getWorkspaceDir(): string | undefined {
    return process.env.WORKSPACE_DIR || process.env.IDE_WORKSPACE_DIR;
  }
}
