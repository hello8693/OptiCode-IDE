/**
 * ClangdConfigService — 管理 compile_commands.json / .clangd / .clang-format
 *
 * 功能：
 *  1. 当用户切换 C++ 标准或修改编译参数时，同步更新 compile_commands.json
 *  2. 首次打开工作区时自动生成 compile_commands.json（若不存在）
 *  3. 为工作区生成 .clangd 配置
 *  4. 为工作区生成 .clang-format（可选，竞赛风格）
 */
import { Autowired, Injectable } from '@opensumi/di';
import {
  Domain,
  ClientAppContribution,
  PreferenceService,
  URI,
} from '@opensumi/ide-core-browser';
import { IFileServiceClient } from '@opensumi/ide-file-service';
import { IWorkspaceService } from '@opensumi/ide-workspace/lib/common';

import { CPP_PREFERENCE_IDS, STD_DEFAULT } from '../cpp/constants';
import { ISystemPathService, SystemPathServicePath } from '../../common';

/** compile_commands.json 中的一条记录 */
interface CompileEntry {
  directory: string;
  file: string;
  arguments: string[];
}

const CPP_EXTENSIONS = new Set([
  '.c', '.cc', '.cpp', '.cxx', '.c++',
  '.h', '.hpp', '.hxx', '.h++', '.ino',
]);

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'build', 'bin', '.cache',
  'out', 'dist', '.vscode', '.idea', 'solutions',
]);

@Domain(ClientAppContribution)
@Injectable()
export class ClangdConfigService implements ClientAppContribution {
  @Autowired(IFileServiceClient)
  private readonly fileService: IFileServiceClient;

  @Autowired(IWorkspaceService)
  private readonly workspaceService: IWorkspaceService;

  @Autowired(PreferenceService)
  private readonly preferenceService: PreferenceService;

  @Autowired(SystemPathServicePath)
  private readonly systemPathService: ISystemPathService;

  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private cachedPlatform?: string;

  async onStart() {
    // 首次生成
    await this.maybeGenerateAll();

    // 当 C++ 偏好变更时，重新生成 compile_commands.json
    this.preferenceService.onSpecificPreferenceChange(CPP_PREFERENCE_IDS.std, () => {
      this.debouncedRegenerate();
    });
    this.preferenceService.onSpecificPreferenceChange(CPP_PREFERENCE_IDS.flags, () => {
      this.debouncedRegenerate();
    });
    this.preferenceService.onSpecificPreferenceChange(CPP_PREFERENCE_IDS.compilerPath, () => {
      this.debouncedRegenerate();
    });
  }

  // ─── Public API ─────────────────────────────────────────────────

  /** 强制重新生成 compile_commands.json */
  async regenerateCompileCommands(): Promise<void> {
    const root = await this.rootPath();
    if (!root) return;
    await this.generateCompileCommands(root, true);
  }

  /** 确保指定文件出现在 compile_commands.json 中（用于草稿纸等场景） */
  async ensureCompileCommandsForFiles(files: string[]): Promise<void> {
    const root = await this.rootPath();
    if (!root || !files.length) return;

    const ccPath = `${root}/.opticode/compile_commands.json`;
    const ccUri = this.toUri(ccPath);
    const ccDirUri = this.toUri(`${root}/.opticode`);
    try {
      await this.fileService.getFileStat(ccDirUri);
    } catch {
      try { await this.fileService.createFolder(ccDirUri); } catch { /* ignore */ }
    }

    let existing: CompileEntry[] = [];
    try {
      const resolved = await this.fileService.resolveContent(ccUri);
      const parsed = JSON.parse(resolved.content || '[]');
      if (Array.isArray(parsed)) {
        existing = parsed as CompileEntry[];
      }
    } catch {
      existing = [];
    }

    const std = this.preferenceService.getValid(CPP_PREFERENCE_IDS.std, STD_DEFAULT);
    const stdFlag = this.stdToFlag(std);
    const userFlags: string[] = this.preferenceService.getValid(CPP_PREFERENCE_IDS.flags, ['-O2', '-Wall']);
    const compiler = await this.getCompiler();
    const flags = [stdFlag, ...userFlags.filter(f => !f.startsWith('-std='))];

    const targetSet = new Set(files);
    const kept = existing.filter(entry => !targetSet.has(entry.file));
    const appended: CompileEntry[] = files.map(file => ({
      directory: this.dirname(file),
      file,
      arguments: [compiler, ...flags, '-c', file],
    }));

    const merged = [...kept, ...appended];
    const json = JSON.stringify(merged, null, 2);
    try {
      await this.fileService.createFile(ccUri, { content: json, overwrite: true });
    } catch {
      try {
        await this.fileService.setContent(
          (await this.fileService.getFileStat(ccUri))!,
          json,
        );
      } catch { /* ignore */ }
    }
  }

  /** 生成 .clangd 配置文件 */
  async generateClangdConfig(): Promise<void> {
    const root = await this.rootPath();
    if (!root) return;
    await this.writeClangdConfig(root);
  }

  /** 生成 .clang-format 配置文件 */
  async generateClangFormat(): Promise<void> {
    const root = await this.rootPath();
    if (!root) return;
    await this.writeClangFormat(root);
  }

  // ─── Internal ───────────────────────────────────────────────────

  private debouncedRegenerate() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.regenerateCompileCommands(), 1500);
  }

  /**
   * macOS: 优先选择 Homebrew 安装的 g++-<version>
   */
  private async pickBrewGpp(): Promise<string | undefined> {
    const platform = await this.getPlatform();
    if (platform !== 'darwin') return undefined;

    const dirs = [
      '/opt/homebrew/bin',
      '/opt/homebrew/opt/gcc/bin',
      '/usr/local/bin',
      '/usr/local/opt/gcc/bin',
      '/opt/local/bin',
    ];
    for (const dir of dirs) {
      try {
        const stat = await this.fileService.getFileStat(this.toUri(dir), true);
        if (!stat || !stat.children) continue;

        const bins = stat.children
          .map(c => new URI(c.uri).displayName)
          .filter(name => /^g\+\+-(\d+)$/.test(name))
          .map(name => ({ name, ver: parseInt(name.split('-')[1], 10) }))
          .sort((a, b) => b.ver - a.ver);

        if (bins.length) {
          return `${dir}/${bins[0].name}`;
        }
      } catch {
        // ignore and continue searching
      }
    }

    return undefined;
  }

  private async getCompiler(): Promise<string> {
    const configured = this.preferenceService.getValid(CPP_PREFERENCE_IDS.compilerPath, '') || '';
    if (configured.trim()) return configured.trim();

    const brewGpp = await this.pickBrewGpp();
    if (brewGpp) return brewGpp;

    return 'g++';
  }

  private async getPlatform(): Promise<string> {
    if (!this.cachedPlatform) {
      this.cachedPlatform = await this.systemPathService.getPlatform();
    }
    return this.cachedPlatform;
  }

  private async rootPath(): Promise<string | undefined> {
    const roots = await this.workspaceService.roots;
    if (!roots.length) return undefined;
    return new URI(roots[0].uri).codeUri.fsPath;
  }

  private toUri(fsPath: string): string {
    return new URI(`file://${fsPath}`).toString();
  }

  /**
   * 如果工作区没有 compile_commands.json 或只有自动生成的，则生成/更新之。
   * 同时检查 .clangd 和 .clang-format，缺失则补上。
   */
  private async maybeGenerateAll(): Promise<void> {
    const root = await this.rootPath();
    if (!root) return;

    // compile_commands.json
    await this.generateCompileCommands(root, false);

    // .clangd — 仅在不存在时生成
    const clangdUri = this.toUri(`${root}/.clangd`);
    try {
      await this.fileService.getFileStat(clangdUri);
    } catch {
      await this.writeClangdConfig(root);
    }

    // .clang-format — 仅在不存在时生成
    const formatUri = this.toUri(`${root}/.clang-format`);
    try {
      await this.fileService.getFileStat(formatUri);
    } catch {
      await this.writeClangFormat(root);
    }
  }

  /**
   * 生成 compile_commands.json
   * @param force - true 则无条件覆盖；false 则只在不存在或为自动生成时覆盖
   */
  private async generateCompileCommands(root: string, force: boolean): Promise<void> {
    const ccPath = `${root}/.opticode/compile_commands.json`;
    const ccUri = this.toUri(ccPath);
    const ccDirUri = this.toUri(`${root}/.opticode`);
    try {
      await this.fileService.getFileStat(ccDirUri);
    } catch {
      try { await this.fileService.createFolder(ccDirUri); } catch { /* ignore */ }
    }

    // 不再写入 clangd 不认识的标记字段；直接覆盖/生成，避免 Unknown key 报错。
    // 对于自定义文件，用户可关闭偏好或手动管理。

    // 收集 C/C++ 文件
    const cppFiles = await this.findCppFiles(root);
    if (cppFiles.length === 0) return;

    // 构建 flags
    const std = this.preferenceService.getValid(CPP_PREFERENCE_IDS.std, STD_DEFAULT);
    const stdFlag = this.stdToFlag(std);
    const userFlags: string[] = this.preferenceService.getValid(CPP_PREFERENCE_IDS.flags, ['-O2', '-Wall']);
    const compiler = await this.getCompiler();

    const flags = [stdFlag, ...userFlags.filter(f => !f.startsWith('-std='))];

    const entries: CompileEntry[] = cppFiles.map(filePath => ({
      directory: this.dirname(filePath),
      file: filePath,
      arguments: [compiler, ...flags, '-c', filePath],
    }));

    const json = JSON.stringify(entries, null, 2);
    try {
      await this.fileService.createFile(ccUri, { content: json, overwrite: true });
    } catch {
      // fallback: update existing
      try {
        await this.fileService.setContent(
          (await this.fileService.getFileStat(ccUri))!,
          json,
        );
      } catch { /* ignore */ }
    }
  }

  private async writeClangdConfig(root: string): Promise<void> {
    const std = this.preferenceService.getValid(CPP_PREFERENCE_IDS.std, STD_DEFAULT);
    const stdFlag = this.stdToFlag(std);
    const userFlags: string[] = this.preferenceService.getValid(CPP_PREFERENCE_IDS.flags, ['-O2', '-Wall']);
    const compiler = await this.getCompiler();

    const flagsStr = [stdFlag, ...userFlags.filter(f => !f.startsWith('-std='))]
      .map(f => `    ${f}`)
      .join(',\n');

    const content = `# 由 OptiCode 自动生成，可自行修改
# 参考: https://clangd.llvm.org/config

CompileFlags:
  Add:
${flagsStr}
  Compiler: ${compiler}

Diagnostics:
  ClangTidy:
    Add:
      - bugprone-*
      - performance-*
      - readability-identifier-naming
      - modernize-use-nullptr
    Remove:
      - modernize-use-trailing-return-type
      - readability-magic-numbers
      - bugprone-easily-swappable-parameters

InlayHints:
  Enabled: Yes
  ParameterNames: Yes
  DeducedTypes: Yes
  Designators: Yes
`;

    const uri = this.toUri(`${root}/.clangd`);
    try {
      await this.fileService.createFile(uri, { content, overwrite: false });
    } catch { /* already exists */ }
  }

  private async writeClangFormat(root: string): Promise<void> {
    // 竞赛风格：紧凑但可读
    const content = `# 由 OI IDE 自动生成
# 格式化风格配置 (clang-format)
# 参考: https://clang.llvm.org/docs/ClangFormatStyleOptions.html

BasedOnStyle: Google
IndentWidth: 4
TabWidth: 4
UseTab: Never
ColumnLimit: 120
AccessModifierOffset: -4
AllowShortFunctionsOnASingleLine: Inline
AllowShortIfStatementsOnASingleLine: WithoutElse
AllowShortLoopsOnASingleLine: true
AllowShortBlocksOnASingleLine: Empty
BreakBeforeBraces: Attach
IndentCaseLabels: true
SpaceBeforeParens: ControlStatements
SpacesInParentheses: false
IncludeBlocks: Preserve
SortIncludes: CaseInsensitive
AlignConsecutiveAssignments: false
AlignConsecutiveDeclarations: false
AlignOperands: true
AlignTrailingComments: true
MaxEmptyLinesToKeep: 2
PointerAlignment: Left
ReferenceAlignment: Left
SpaceAfterCStyleCast: false
SpacesBeforeTrailingComments: 2
Standard: c++20
`;

    const uri = this.toUri(`${root}/.clang-format`);
    try {
      await this.fileService.createFile(uri, { content, overwrite: false });
    } catch { /* already exists */ }
  }

  // ─── File utilities ─────────────────────────────────────────────

  private async findCppFiles(root: string): Promise<string[]> {
    const results: string[] = [];
    await this.walkDir(root, results, 0);
    return results;
  }

  private async walkDir(dir: string, results: string[], depth: number): Promise<void> {
    if (depth > 8) return;

    try {
      const stat = await this.fileService.getFileStat(this.toUri(dir), true);
      if (!stat || !stat.children) return;

      for (const child of stat.children) {
        const childUri = new URI(child.uri);
        const name = childUri.displayName;
        const fsPath = childUri.codeUri.fsPath;

        if (child.isDirectory) {
          if (!IGNORE_DIRS.has(name)) {
            await this.walkDir(fsPath, results, depth + 1);
          }
        } else {
          const ext = this.extname(name);
          if (CPP_EXTENSIONS.has(ext)) {
            results.push(fsPath);
          }
        }
      }
    } catch {
      // permission error, etc
    }
  }

  private dirname(p: string): string {
    const idx = p.lastIndexOf('/');
    return idx > 0 ? p.substring(0, idx) : p;
  }

  private extname(name: string): string {
    const idx = name.lastIndexOf('.');
    return idx >= 0 ? name.substring(idx).toLowerCase() : '';
  }

  private stdToFlag(std: string): string {
    switch (std) {
      case 'C++14': return '-std=c++14';
      case 'C++17': return '-std=c++17';
      case 'C++23': return '-std=c++23';
      default: return '-std=c++14';
    }
  }
}
