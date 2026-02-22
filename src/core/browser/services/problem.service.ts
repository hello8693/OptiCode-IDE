/**
 * ProblemService — 题目管理核心服务
 *
 * 负责题目目录的创建 / 加载 / 扫描 / 样例读写 / 元信息持久化，
 * 并维护 "当前活动题目" 的状态，供面板和状态栏订阅。
 *
 * 目录约定：
 *   workspace/<id>/
 *     <id>.cpp                ← 源码
 *     bin/                   ← 编译产物
 *     samples/samples.json   ← 样例
 *     solutions/             ← 题解
 *     meta.json              ← 题目元信息
 */
import { Autowired, Injectable } from '@opensumi/di';
import { Emitter, URI } from '@opensumi/ide-core-browser';
import { IFileServiceClient } from '@opensumi/ide-file-service';
import { WorkbenchEditorService } from '@opensumi/ide-editor/lib/browser';
import { IWorkspaceService } from '@opensumi/ide-workspace/lib/common';

import {
  IProblemService,
  IProblem,
  IProblemMeta,
  createDefaultMeta,
} from '../../common/problem';
import { ISampleCase } from '../../common/sample-data';
import { CPP_TEMPLATE_STORAGE_KEY, DEFAULT_CPP_TEMPLATE } from '../../common/templates';
import { IStorageService } from '../../common/types';

const CPP_TEMPLATE = DEFAULT_CPP_TEMPLATE;

type SampleFileInfo = {
  name: string;
  stem: string;
  ext: 'in' | 'out';
  index?: string;
  prefix?: string;
  absPath: string;
};

type SampleFilePair = {
  in?: SampleFileInfo;
  out?: SampleFileInfo;
};

@Injectable()
export class ProblemService implements IProblemService {
  @Autowired(IFileServiceClient)
  private readonly fileService: IFileServiceClient;

  @Autowired(WorkbenchEditorService)
  private readonly editorService: WorkbenchEditorService;

  @Autowired(IWorkspaceService)
  private readonly workspaceService: IWorkspaceService;

  @Autowired(IStorageService)
  private readonly storage: IStorageService;

  /* ── 活动题目 ── */
  private _activeProblem: IProblem | undefined;
  private readonly _onActiveProblemChange = new Emitter<IProblem | undefined>();

  get activeProblem(): IProblem | undefined {
    return this._activeProblem;
  }

  onActiveProblemChange(callback: (p: IProblem | undefined) => void) {
    return this._onActiveProblemChange.event(callback);
  }

  /** 由 contribution 层驱动调用，在编辑器切换文件时触发 */
  async refreshActiveProblem(): Promise<void> {
    const resource = this.editorService.currentResource;
    if (!resource) {
      this.setActiveProblem(undefined);
      return;
    }
    const scheme = resource.uri.scheme;
    if (scheme === 'problem-meta') {
      const codeUri = resource.uri.codeUri;
      const authority = codeUri.authority || '';
      const path = (codeUri.path || '').replace(/^\/+/, '');
      const id = authority || path;
      if (!id) {
        this.setActiveProblem(undefined);
        return;
      }
      try {
        const problem = await this.loadProblem(id);
        this.setActiveProblem(problem);
      } catch {
        this.setActiveProblem(undefined);
      }
      return;
    }
    if (scheme !== 'file') {
      return;
    }
    const fsPath = resource.uri.codeUri.fsPath;
    const problem = await this.resolveFromFile(fsPath);
    this.setActiveProblem(problem);
  }

  private setActiveProblem(p: IProblem | undefined) {
    const prev = this._activeProblem;
    if (prev?.meta.id === p?.meta.id) return;
    this._activeProblem = p;
    this._onActiveProblemChange.fire(p);
  }

  /* ────────── 工作区路径 ────────── */

  private async rootPath(): Promise<string | undefined> {
    const roots = await this.workspaceService.roots;
    if (!roots.length) return undefined;
    return new URI(roots[0].uri).codeUri.fsPath;
  }

  private problemDir(root: string, id: string): string {
    return `${root}/${id}`;
  }

  /* ────────── 路径工具 ────────── */

  private buildPaths(root: string, id: string) {
    const dir = this.problemDir(root, id);
    return {
      rootDir: dir,
      sourcePath: `${dir}/${id}.cpp`,
      binDir: `${dir}/bin`,
      executablePath: `${dir}/bin/${id}`,
      samplesDir: `${dir}/samples`,
      samplesPath: `${dir}/samples/samples.json`,
      solutionsDir: `${dir}/solutions`,
      metaPath: `${dir}/meta.json`,
    };
  }

  private templateFilePath(root: string): string {
    return `${root}/.opticode/templates/default.cpp`;
  }

  private async readCppTemplate(): Promise<string> {
    const root = await this.rootPath();
    if (root) {
      const templatePath = this.templateFilePath(root);
      const templateUri = this.toUri(templatePath);
      try {
        const stat = await this.fileService.getFileStat(templateUri);
        if (stat) {
          const { content } = await this.fileService.readFile(templateUri);
          const text = content.toString();
          if (text.trim().length > 0) return text;
        }
      } catch {
        // ignore
      }
    }

    const stored = await Promise.resolve(this.storage.getItem<string>(CPP_TEMPLATE_STORAGE_KEY, CPP_TEMPLATE));
    return stored || CPP_TEMPLATE;
  }

  private toUri(fsPath: string): string {
    return new URI(`file://${fsPath}`).toString();
  }

  /* ────────── 创建题目 ────────── */

  async createProblem(id: string, partial?: Partial<IProblemMeta>): Promise<IProblem> {
    const root = await this.rootPath();
    if (!root) throw new Error('请先打开工作区文件夹');

    const paths = this.buildPaths(root, id);
    const meta: IProblemMeta = { ...createDefaultMeta(id), ...partial };

    // 创建文件夹结构
    await this.ensureDir(paths.binDir);
    await this.ensureDir(paths.samplesDir);
    await this.ensureDir(paths.solutionsDir);

    // 写入 meta.json
    await this.writeJson(paths.rootDir + '/meta.json', meta);

    // 写入源码模板（若不存在）
    const srcUri = this.toUri(paths.sourcePath);
    const srcStat = await this.fileService.getFileStat(srcUri);
    if (!srcStat) {
      const template = await this.readCppTemplate();
      await this.fileService.createFile(srcUri, { content: template });
    }

    // 写入空样例
    const samplesUri = this.toUri(paths.samplesPath);
    const sampleStat = await this.fileService.getFileStat(samplesUri);
    if (!sampleStat) {
      await this.writeJson(paths.samplesPath, { samples: [] });
    }

    // 写入 .gitignore 到 bin/
    const giUri = this.toUri(`${paths.binDir}/.gitignore`);
    const giStat = await this.fileService.getFileStat(giUri);
    if (!giStat) {
      await this.fileService.createFile(giUri, { content: '*\n!.gitignore\n' });
    }

    return this.buildModel(root, id, meta, []);
  }

  /* ────────── 加载题目 ────────── */

  async loadProblem(problemDir: string): Promise<IProblem> {
    const root = await this.rootPath();
    if (!root) throw new Error('请先打开工作区文件夹');

    // problemDir 可以是绝对路径，也可以是仅 id
    const id = problemDir.includes('/') ? problemDir.split('/').pop()! : problemDir;
    const dir = problemDir.includes('/') ? problemDir : `${root}/${id}`;

    const meta = await this.readMeta(dir, id);
    return this.buildModel(root, id, meta, []);
  }

  /* ────────── 列出题目 ────────── */

  async listProblems(): Promise<IProblem[]> {
    const root = await this.rootPath();
    if (!root) return [];

    const rootUri = this.toUri(root);
    try {
      const stat = await this.fileService.getFileStat(rootUri, true);
      if (!stat || !stat.children) return [];

      const problems: IProblem[] = [];
      for (const child of stat.children) {
        if (!child.isDirectory) continue;
        // 跳过隐藏文件夹和 node_modules
        const name = new URI(child.uri).displayName;
        if (!name || name.startsWith('.') || name === 'node_modules') continue;

        // 判断是否是题目文件夹：有 meta.json 或 <name>.cpp
        const dirFs = new URI(child.uri).codeUri.fsPath;
        const hasMeta = await this.fileExists(`${dirFs}/meta.json`);
        const hasCpp = await this.fileExists(`${dirFs}/${name}.cpp`);
        if (hasMeta || hasCpp) {
          try {
            const meta = await this.readMeta(dirFs, name);
            problems.push(this.buildModel(root, name, meta, []));
          } catch {
            // skip broken problems
          }
        }
      }
      return problems;
    } catch {
      return [];
    }
  }

  /**
   * 判断当前工作区是否符合 OptiCode 题目结构。
   */
  async isOptiCodeWorkspace(): Promise<boolean> {
    const root = await this.rootPath();
    if (!root) return false;

    // .opticode 目录存在即视为已初始化
    if (await this.fileExists(`${root}/.opticode`)) return true;

    const rootUri = this.toUri(root);
    try {
      const stat = await this.fileService.getFileStat(rootUri, true);
      if (!stat?.children) return false;

      for (const child of stat.children) {
        if (!child.isDirectory) continue;
        const name = new URI(child.uri).displayName;
        if (!name || name.startsWith('.') || name === 'node_modules') continue;
        const dirFs = new URI(child.uri).codeUri.fsPath;
        const hasMeta = await this.fileExists(`${dirFs}/meta.json`);
        const hasCpp = await this.fileExists(`${dirFs}/${name}.cpp`);
        if (hasMeta || hasCpp) return true;
      }
    } catch {
      return false;
    }

    return false;
  }

  /* ────────── 删除题目 ────────── */

  async deleteProblem(id: string): Promise<void> {
    const root = await this.rootPath();
    if (!root) return;
    const dir = this.problemDir(root, id);
    const uri = this.toUri(dir);
    try {
      await this.fileService.delete(uri, { moveToTrash: true });
    } catch {
      // ignore
    }
  }

  /* ────────── 元信息 ── */

  async getMeta(id: string): Promise<IProblemMeta> {
    const root = await this.rootPath();
    if (!root) throw new Error('无工作区');
    const dir = this.problemDir(root, id);
    return this.readMeta(dir, id);
  }

  async saveMeta(id: string, meta: IProblemMeta): Promise<void> {
    const root = await this.rootPath();
    if (!root) return;
    const dir = this.problemDir(root, id);
    meta.updatedAt = new Date().toISOString();
    await this.writeJson(`${dir}/meta.json`, meta);
  }

  async updateMeta(id: string, patch: Partial<IProblemMeta>): Promise<void> {
    const current = await this.getMeta(id);
    await this.saveMeta(id, { ...current, ...patch });
  }

  /* ────────── 样例 ── */

  async loadSamples(id: string): Promise<ISampleCase[]> {
    const root = await this.rootPath();
    if (!root) return [];
    const dir = this.problemDir(root, id);
    return this.readSamples(dir);
  }

  async saveSamples(id: string, samples: ISampleCase[]): Promise<void> {
    const root = await this.rootPath();
    if (!root) return;
    const paths = this.buildPaths(root, id);
    await this.ensureDir(paths.samplesDir);
    await this.persistSampleFiles(paths.rootDir, samples);
    const jsonSamples = samples.map(s => this.toJsonSampleForDir(paths.rootDir, s));
    await this.writeJson(paths.samplesPath, { samples: jsonSamples });
  }

  async addSample(id: string, sample: ISampleCase): Promise<void> {
    const samples = await this.loadSamples(id);
    samples.push(sample);
    await this.saveSamples(id, samples);
  }

  async updateSample(id: string, sample: ISampleCase): Promise<void> {
    const samples = await this.loadSamples(id);
    const idx = samples.findIndex(s => s.id === sample.id);
    if (idx >= 0) samples[idx] = sample;
    await this.saveSamples(id, samples);
  }

  async removeSample(id: string, sampleId: string): Promise<void> {
    const samples = await this.loadSamples(id);
    await this.saveSamples(id, samples.filter(s => s.id !== sampleId));
  }

  async removeSampleFiles(id: string, sample: ISampleCase): Promise<void> {
    const root = await this.rootPath();
    if (!root) return;
    const dir = this.problemDir(root, id);
    const paths = [
      this.resolveSamplePath(dir, sample.inputPath),
      this.resolveSamplePath(dir, sample.expectedPath),
    ].filter(Boolean) as string[];

    for (const fsPath of paths) {
      try {
        await this.fileService.delete(this.toUri(fsPath), { moveToTrash: true });
      } catch {
        // ignore
      }
    }
  }

  /* ────────── 源码 / 编译 路径 ── */

  getSourcePath(id: string): string {
    // 这是快捷方法，不需要 async。
    // 注意：需要 root，但这里直接按约定拼接；
    // 使用前建议通过 activeProblem.sourcePath 获取完整路径。
    return `${id}/${id}.cpp`;
  }

  getExecutablePath(id: string): string {
    return `${id}/bin/${id}`;
  }

  /* ────────── 从文件路径推断题目 ── */

  async resolveFromFile(filePath: string): Promise<IProblem | undefined> {
    const root = await this.rootPath();
    if (!root) return undefined;

    // filePath 应该在 root 下
    if (!filePath.startsWith(root)) return undefined;

    const relative = filePath.slice(root.length).replace(/^\//, '');
    // 取第一级目录名
    const parts = relative.split('/');
    if (parts.length < 1) return undefined;
    const id = parts[0];
    if (!id || id.startsWith('.')) return undefined;

    // 检查这个目录是否是一个题目
    const dir = this.problemDir(root, id);
    const hasMeta = await this.fileExists(`${dir}/meta.json`);
    const hasCpp = await this.fileExists(`${dir}/${id}.cpp`);
    if (!hasMeta && !hasCpp) return undefined;

    try {
      return await this.loadProblem(dir);
    } catch {
      return undefined;
    }
  }

  /* ────────── 内部工具 ────────── */

  private buildModel(
    root: string,
    id: string,
    meta: IProblemMeta,
    samples: ISampleCase[],
  ): IProblem {
    const paths = this.buildPaths(root, id);
    return {
      meta,
      rootDir: paths.rootDir,
      sourcePath: paths.sourcePath,
      binDir: paths.binDir,
      executablePath: paths.executablePath,
      samplesDir: paths.samplesDir,
      samplesPath: paths.samplesPath,
      solutionsDir: paths.solutionsDir,
      samples,
    };
  }

  private async readMeta(dir: string, fallbackId: string): Promise<IProblemMeta> {
    const metaUri = this.toUri(`${dir}/meta.json`);
    try {
      const stat = await this.fileService.getFileStat(metaUri);
      if (stat) {
        const { content } = await this.fileService.readFile(metaUri);
        const parsed = JSON.parse(content.toString());
        return { ...createDefaultMeta(fallbackId), ...parsed };
      }
    } catch {
      // meta.json 不存在或损坏
    }
    return createDefaultMeta(fallbackId);
  }

  private async readSamples(dir: string): Promise<ISampleCase[]> {
    const jsonSamples = await this.readSamplesJson(dir);
    const fileSamples = await this.readSamplesFromFiles(dir);
    return this.mergeSamples(dir, jsonSamples, fileSamples);
  }

  private async readSamplesJson(dir: string): Promise<ISampleCase[]> {
    const samplesUri = this.toUri(`${dir}/samples/samples.json`);
    try {
      const stat = await this.fileService.getFileStat(samplesUri);
      if (stat) {
        const { content } = await this.fileService.readFile(samplesUri);
        const parsed = JSON.parse(content.toString());
        if (Array.isArray(parsed.samples)) {
          return parsed.samples as ISampleCase[];
        }
      }
    } catch {
      // ignore
    }
    return [];
  }

  private normalizeRelPath(path?: string): string {
    if (!path) return '';
    const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
    const lower = normalized.toLowerCase();
    const samplesIdx = lower.lastIndexOf('/samples/');
    if (samplesIdx >= 0) {
      return normalized.slice(samplesIdx + 1).toLowerCase();
    }
    return lower;
  }

  private resolveSamplePath(problemDir: string, relPath?: string): string | undefined {
    if (!relPath) return undefined;
    if (relPath.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(relPath)) return relPath;
    return `${problemDir}/${relPath.replace(/^\.\//, '')}`;
  }

  private sampleKey(inputPath?: string, expectedPath?: string): string {
    const inKey = this.normalizeRelPath(inputPath);
    const outKey = this.normalizeRelPath(expectedPath);
    if (inKey && outKey) return `${inKey}|${outKey}`;
    return inKey || outKey;
  }

  private async readSamplesFromFiles(dir: string): Promise<ISampleCase[]> {
    const samplesDir = `${dir}/samples`;
    const uri = this.toUri(samplesDir);
    let children: any[] = [];
    try {
      const stat = await this.fileService.getFileStat(uri, true);
      children = stat?.children || [];
    } catch {
      return [];
    }

    const files = children
      .filter(c => !c.isDirectory)
      .map(c => new URI(c.uri).displayName)
      .filter(name => /\.(in|out)$/i.test(name || ''))
      .map(name => this.parseSampleFile(name, samplesDir))
      .filter(Boolean) as SampleFileInfo[];

    files.sort((a, b) => a.name.localeCompare(b.name));

    if (!files.length) return [];

    const pairs = this.pairSampleFiles(files);
    const cases: ISampleCase[] = [];
    let fallbackIndex = 1;
    for (const pair of pairs) {
      const stem = pair.in?.stem || pair.out?.stem || '';
      const label = this.labelFromStem(stem, fallbackIndex++);
      const inputPath = pair.in ? `samples/${pair.in.name}` : undefined;
      const expectedPath = pair.out ? `samples/${pair.out.name}` : undefined;
      const input = pair.in ? await this.safeReadText(pair.in.absPath) : '';
      const expected = pair.out ? await this.safeReadText(pair.out.absPath) : '';
      cases.push({
        id: this.fileSampleId(inputPath, expectedPath),
        label,
        inputPath,
        expectedPath,
        input,
        expected,
      });
    }
    return cases;
  }

  private async mergeSamples(
    dir: string,
    jsonSamples: ISampleCase[],
    fileSamples: ISampleCase[],
  ): Promise<ISampleCase[]> {
    const fileMap = new Map<string, ISampleCase>();
    const fileByInput = new Map<string, ISampleCase>();
    const fileByOutput = new Map<string, ISampleCase>();
    for (const s of fileSamples) {
      const key = this.sampleKey(s.inputPath, s.expectedPath);
      if (key) fileMap.set(key, s);
      if (s.inputPath) {
        fileByInput.set(this.normalizeRelPath(s.inputPath), s);
      }
      if (s.expectedPath) {
        fileByOutput.set(this.normalizeRelPath(s.expectedPath), s);
      }
    }

    const merged: ISampleCase[] = [];
    for (const s of jsonSamples) {
      const key = this.sampleKey(s.inputPath, s.expectedPath);
      let fileCase = key ? fileMap.get(key) : undefined;
      if (!fileCase && s.inputPath) {
        fileCase = fileByInput.get(this.normalizeRelPath(s.inputPath));
      }
      if (!fileCase && s.expectedPath) {
        fileCase = fileByOutput.get(this.normalizeRelPath(s.expectedPath));
      }
      if (fileCase) {
        merged.push({
          ...s,
          input: fileCase.input,
          expected: fileCase.expected,
        });
        const fileKey = this.sampleKey(fileCase.inputPath, fileCase.expectedPath);
        if (fileKey) fileMap.delete(fileKey);
      } else if (s.inputPath || s.expectedPath) {
        merged.push(await this.hydrateSampleFromFiles(dir, s));
      } else {
        merged.push({
          ...s,
          input: s.input || '',
          expected: s.expected || '',
        });
      }
    }

    for (const extra of fileMap.values()) {
      merged.push(extra);
    }
    return merged;
  }

  private async hydrateSampleFromFiles(dir: string, sample: ISampleCase): Promise<ISampleCase> {
    const inputPath = this.resolveSamplePath(dir, sample.inputPath);
    const expectedPath = this.resolveSamplePath(dir, sample.expectedPath);
    const input = inputPath ? await this.safeReadText(inputPath) : sample.input || '';
    const expected = expectedPath ? await this.safeReadText(expectedPath) : sample.expected || '';
    return { ...sample, input, expected };
  }

  private async safeReadText(fsPath: string): Promise<string> {
    try {
      const { content } = await this.fileService.readFile(this.toUri(fsPath));
      return content.toString();
    } catch {
      return '';
    }
  }

  private async persistSampleFiles(problemDir: string, samples: ISampleCase[]): Promise<void> {
    for (const s of samples) {
      const inputPath = this.resolveSamplePath(problemDir, s.inputPath);
      const expectedPath = this.resolveSamplePath(problemDir, s.expectedPath);
      if (inputPath) {
        await this.writeText(inputPath, s.input || '');
      }
      if (expectedPath) {
        await this.writeText(expectedPath, s.expected || '');
      }
    }
  }

  private toJsonSampleForDir(problemDir: string, sample: ISampleCase): ISampleCase {
    const normalizePath = (p?: string) => {
      if (!p) return undefined;
      const normalized = p.replace(/\\/g, '/');
      const root = problemDir.replace(/\\/g, '/');
      if (normalized.startsWith(root)) {
        return normalized.slice(root.length).replace(/^\/+/, '');
      }
      return normalized.replace(/^\.\//, '');
    };

    if (sample.inputPath || sample.expectedPath) {
      return {
        id: sample.id,
        label: sample.label,
        inputPath: normalizePath(sample.inputPath),
        expectedPath: normalizePath(sample.expectedPath),
        input: '',
        expected: '',
      };
    }
    return sample;
  }

  private fileSampleId(inputPath?: string, expectedPath?: string): string {
    const key = this.sampleKey(inputPath, expectedPath);
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    }
    return `file-${hash.toString(16)}`;
  }

  private labelFromStem(stem: string, fallbackIndex: number): string {
    const match = /(\d+)(?!.*\d)/.exec(stem);
    if (match) return `样例 ${match[1]}`;
    if (stem) return `样例 ${stem}`;
    return `样例 ${fallbackIndex}`;
  }

  private normalizePrefix(prefix?: string): string {
    return (prefix || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  private parseSampleFile(name: string, samplesDir: string): SampleFileInfo | undefined {
    const match = /^(.*)\.(in|out)$/i.exec(name);
    if (!match) return undefined;
    const stem = match[1];
    const ext = match[2].toLowerCase() as 'in' | 'out';
    const indexMatch = /(\d+)(?!.*\d)/.exec(stem);
    const index = indexMatch ? indexMatch[1] : undefined;
    const prefix = indexMatch
      ? stem.slice(0, indexMatch.index) + stem.slice(indexMatch.index + indexMatch[1].length)
      : stem;
    return {
      name,
      stem,
      ext,
      index,
      prefix,
      absPath: `${samplesDir}/${name}`,
    };
  }

  private pairSampleFiles(files: SampleFileInfo[]): SampleFilePair[] {
    const inFiles = files.filter(f => f.ext === 'in');
    const outFiles = files.filter(f => f.ext === 'out');
    const usedIn = new Set<SampleFileInfo>();
    const usedOut = new Set<SampleFileInfo>();
    const pairs: SampleFilePair[] = [];

    const outByStem = this.groupBy(outFiles, f => f.stem.toLowerCase());
    for (const f of inFiles) {
      const out = this.takeFirstAvailable(outByStem.get(f.stem.toLowerCase()), usedOut);
      if (out) {
        pairs.push({ in: f, out });
        usedIn.add(f);
        usedOut.add(out);
      }
    }

    const outByPrefixIndex = this.groupBy(
      outFiles.filter(f => !usedOut.has(f) && f.index),
      f => `${this.normalizePrefix(f.prefix)}|${f.index}`,
    );
    for (const f of inFiles.filter(v => !usedIn.has(v) && v.index)) {
      const key = `${this.normalizePrefix(f.prefix)}|${f.index}`;
      const out = this.takeFirstAvailable(outByPrefixIndex.get(key), usedOut);
      if (out) {
        pairs.push({ in: f, out });
        usedIn.add(f);
        usedOut.add(out);
      }
    }

    const outByIndex = this.groupBy(
      outFiles.filter(f => !usedOut.has(f) && f.index),
      f => `${f.index}`,
    );
    const inByIndex = this.groupBy(
      inFiles.filter(f => !usedIn.has(f) && f.index),
      f => `${f.index}`,
    );
    for (const [index, ins] of inByIndex) {
      const outs = outByIndex.get(index);
      if (ins && outs && ins.length === 1 && outs.length === 1) {
        const fIn = ins[0];
        const fOut = outs[0];
        if (!usedIn.has(fIn) && !usedOut.has(fOut)) {
          pairs.push({ in: fIn, out: fOut });
          usedIn.add(fIn);
          usedOut.add(fOut);
        }
      }
    }

    for (const f of inFiles) {
      if (!usedIn.has(f)) pairs.push({ in: f });
    }
    for (const f of outFiles) {
      if (!usedOut.has(f)) pairs.push({ out: f });
    }

    return pairs;
  }

  private groupBy<T>(items: T[], getKey: (item: T) => string): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const item of items) {
      const key = getKey(item);
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }

  private takeFirstAvailable<T>(items: T[] | undefined, used: Set<T>): T | undefined {
    if (!items) return undefined;
    for (const item of items) {
      if (!used.has(item)) return item;
    }
    return undefined;
  }

  private async ensureDir(dirPath: string): Promise<void> {
    const uri = this.toUri(dirPath);
    try {
      const stat = await this.fileService.getFileStat(uri);
      if (!stat) {
        await this.fileService.createFolder(uri);
      }
    } catch {
      try {
        await this.fileService.createFolder(uri);
      } catch {
        // already exists
      }
    }
  }

  private async writeJson(fsPath: string, data: any): Promise<void> {
    const uri = this.toUri(fsPath);
    const content = JSON.stringify(data, null, 2) + '\n';
    try {
      const stat = await this.fileService.getFileStat(uri);
      if (stat) {
        await this.fileService.setContent(stat, content);
      } else {
        await this.fileService.createFile(uri, { content });
      }
    } catch {
      await this.fileService.createFile(uri, { content });
    }
  }

  private async writeText(fsPath: string, content: string): Promise<void> {
    const uri = this.toUri(fsPath);
    try {
      const stat = await this.fileService.getFileStat(uri);
      if (stat) {
        await this.fileService.setContent(stat, content);
      } else {
        await this.fileService.createFile(uri, { content });
      }
    } catch {
      await this.fileService.createFile(uri, { content });
    }
  }

  private async fileExists(fsPath: string): Promise<boolean> {
    try {
      const stat = await this.fileService.getFileStat(this.toUri(fsPath));
      return !!stat;
    } catch {
      return false;
    }
  }
}
