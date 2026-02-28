import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Injectable, Autowired } from '@opensumi/di';
import { ILogService } from '@/logger/common';
import { CompetitiveCompanionPayload } from '@/core/common/competitive-companion';
import {
  createDefaultMeta,
  DEFAULT_MEMORY_LIMIT,
  DEFAULT_TIME_LIMIT,
  IProblemMeta,
} from '@/core/common/problem';
import { CPP_TEMPLATE_STORAGE_KEY, DEFAULT_CPP_TEMPLATE } from '@/core/common/templates';
import { ISampleCase } from '@/core/common/sample-data';

const CPP_TEMPLATE = DEFAULT_CPP_TEMPLATE;

const BIN_GITIGNORE = '*\n!.gitignore\n';

export interface ICompetitiveCompanionImportResult {
  id: string;
  rootDir: string;
  created: boolean;
}

@Injectable()
export class CompetitiveCompanionService {
  @Autowired(ILogService)
  private readonly logger: ILogService;

  async importProblem(
    payload: CompetitiveCompanionPayload,
    workspaceDir: string,
  ): Promise<ICompetitiveCompanionImportResult> {
    const baseId = this.deriveBaseId(payload);
    const id = await this.ensureUniqueId(workspaceDir, baseId);
    const paths = this.buildPaths(workspaceDir, id);

    await this.ensureDir(paths.rootDir);
    await this.ensureDir(paths.binDir);
    await this.ensureDir(paths.samplesDir);
    await this.ensureDir(paths.solutionsDir);

    const meta = await this.buildMeta(payload, id, paths.metaPath);
    await this.writeJson(paths.metaPath, meta);

    if (!(await this.fileExists(paths.sourcePath))) {
      const template = await this.readCppTemplate();
      await fs.writeFile(paths.sourcePath, template, 'utf8');
    }

    if (!(await this.fileExists(paths.binGitignorePath))) {
      await fs.writeFile(paths.binGitignorePath, BIN_GITIGNORE, 'utf8');
    }

    const samples = this.buildSamples(payload);
    await this.writeJson(paths.samplesPath, { samples });

    this.logger.info(`[CompetitiveCompanion] Imported problem: ${id} (${paths.rootDir})`);

    return { id, rootDir: paths.rootDir, created: true };
  }

  private deriveBaseId(payload: CompetitiveCompanionPayload): string {
    const urlId = this.tryDeriveIdFromUrl(payload.url);
    const name = this.extractLabelFromName(payload.name);
    const group = this.extractLabelFromName(payload.group);
    const base = urlId || name || group || `problem-${Date.now()}`;
    return this.sanitizeId(base);
  }

  private tryDeriveIdFromUrl(url?: string): string | undefined {
    if (!url) return undefined;
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (!parts.length) return undefined;

      // Codeforces: /contest/1234/problem/A or /problemset/problem/1234/A
      if (host.includes('codeforces.com')) {
        const contestIdx = parts.indexOf('contest');
        if (contestIdx >= 0 && parts[contestIdx + 2] === 'problem') {
          const contestId = parts[contestIdx + 1];
          const letter = parts[contestIdx + 3];
          if (contestId && letter) return `CF${contestId}${letter}`;
        }
        const problemsetIdx = parts.indexOf('problemset');
        if (problemsetIdx >= 0 && parts[problemsetIdx + 1] === 'problem') {
          const contestId = parts[problemsetIdx + 2];
          const letter = parts[problemsetIdx + 3];
          if (contestId && letter) return `CF${contestId}${letter}`;
        }
      }

      // AtCoder: /contests/abc001/tasks/abc001_1
      if (host.includes('atcoder.jp')) {
        const taskIdx = parts.lastIndexOf('tasks');
        if (taskIdx >= 0 && parts[taskIdx + 1]) return parts[taskIdx + 1];
      }

      // Luogu: /problem/P1001
      if (host.includes('luogu.com.cn')) {
        const idx = parts.lastIndexOf('problem');
        if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
      }

      return parts[parts.length - 1];
    } catch {
      return undefined;
    }
  }

  private extractLabelFromName(raw?: string): string | undefined {
    if (!raw) return undefined;
    let text = raw.trim();
    if (!text) return undefined;
    // Remove leading index like "#1.", "1.", "01 -"
    text = text.replace(/^#?\s*\d+\s*[\.\-:、]+\s*/i, '');
    const labelMatch = text.match(/^([A-Z]\d*|\d+)\b/);
    if (labelMatch?.[1]) return labelMatch[1];
    return text;
  }

  private sanitizeId(raw: string): string {
    const ascii = raw.normalize('NFKD').replace(/[^\x00-\x7F]/g, '');
    const sanitized = ascii
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    return sanitized || `problem-${Date.now()}`;
  }

  private async ensureUniqueId(root: string, baseId: string): Promise<string> {
    let id = baseId;
    let counter = 1;
    while (await this.fileExists(path.join(root, id))) {
      id = `${baseId}-${counter}`;
      counter += 1;
    }
    return id;
  }

  private async buildMeta(
    payload: CompetitiveCompanionPayload,
    id: string,
    metaPath: string,
  ): Promise<IProblemMeta> {
    const existing = await this.readJson<IProblemMeta>(metaPath);
    const now = new Date().toISOString();
    const base = existing ?? createDefaultMeta(id);

    const timeLimitMs = this.normalizeLimit(payload.timeLimit, DEFAULT_TIME_LIMIT);
    const memoryLimitMb = this.normalizeLimit(payload.memoryLimit, DEFAULT_MEMORY_LIMIT);
    const sourceOj = this.tryDeriveOjFromUrl(payload.url);

    return {
      ...base,
      id,
      name: payload.name || base.name || id,
      timeLimitMs,
      memoryLimitMb,
      source: {
        oj: sourceOj,
        url: payload.url,
      },
      tags: payload.group ? [payload.group] : base.tags,
      createdAt: base.createdAt || now,
      updatedAt: now,
    };
  }

  private normalizeLimit(value: number | undefined, fallback: number): number {
    if (!value || Number.isNaN(value) || value <= 0) {
      return fallback;
    }
    return Math.round(value);
  }

  private tryDeriveOjFromUrl(url?: string): string | undefined {
    if (!url) return undefined;
    try {
      return new URL(url).hostname;
    } catch {
      return undefined;
    }
  }

  private buildSamples(payload: CompetitiveCompanionPayload): ISampleCase[] {
    const tests = payload.tests || [];
    return tests.map((test, index) => ({
      id: randomUUID(),
      label: `样例 ${index + 1}`,
      input: test.input ?? '',
      expected: test.output ?? '',
    }));
  }

  private buildPaths(root: string, id: string) {
    const rootDir = path.join(root, id);
    const binDir = path.join(rootDir, 'bin');
    const samplesDir = path.join(rootDir, 'samples');
    const solutionsDir = path.join(rootDir, 'solutions');
    return {
      rootDir,
      sourcePath: path.join(rootDir, `${id}.cpp`),
      binDir,
      samplesDir,
      samplesPath: path.join(samplesDir, 'samples.json'),
      solutionsDir,
      metaPath: path.join(rootDir, 'meta.json'),
      binGitignorePath: path.join(binDir, '.gitignore'),
    };
  }

  private async readCppTemplate(): Promise<string> {
    const storagePath = process.env.IDE_STORAGE_PATH;
    if (!storagePath) return CPP_TEMPLATE;
    try {
      const content = await fs.readFile(storagePath, 'utf8');
      const data = JSON.parse(content) as Record<string, unknown>;
      const template = data?.[CPP_TEMPLATE_STORAGE_KEY];
      if (typeof template === 'string' && template.trim().length > 0) {
        return template;
      }
      return CPP_TEMPLATE;
    } catch {
      return CPP_TEMPLATE;
    }
  }

  private async ensureDir(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async readJson<T>(filePath: string): Promise<T | undefined> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content) as T;
    } catch {
      return undefined;
    }
  }

  private async writeJson(filePath: string, data: unknown): Promise<void> {
    const content = JSON.stringify(data, null, 2);
    await fs.writeFile(filePath, content, 'utf8');
  }
}
