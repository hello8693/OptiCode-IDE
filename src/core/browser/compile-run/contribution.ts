/**
 * 「编译与运行」命令注册与面板
 */
import { Autowired, Injectable } from '@opensumi/di';
import {
  Domain,
  CommandContribution,
  CommandRegistry,
  ClientAppContribution,
  URI,
  getIcon,
  PreferenceService,
  localize,
} from '@opensumi/ide-core-browser';
import { ComponentContribution, ComponentRegistry } from '@opensumi/ide-core-browser/lib/layout';
import {
  BrowserEditorContribution,
  EditorComponentRegistry,
  EditorComponentRenderMode,
  EditorOpenType,
} from '@opensumi/ide-editor/lib/browser';
import { IResource, ResourceService } from '@opensumi/ide-editor';
import { IFileServiceClient } from '@opensumi/ide-file-service';
import { WorkbenchEditorService } from '@opensumi/ide-editor/lib/browser';
import { IWorkspaceService } from '@opensumi/ide-workspace/lib/common';
import { IMessageService } from '@opensumi/ide-overlay';
import { ITerminalApiService, ITerminalController } from '@opensumi/ide-terminal-next';
import { DebugConfiguration, DebugState, IDebugSessionManager } from '@opensumi/ide-debug';
import { DebugConfigurationManager } from '@opensumi/ide-debug/lib/browser/debug-configuration-manager';
import { IEditorDocumentModelService } from '@opensumi/ide-editor/lib/browser';

import { STD_KEY, STD_OPTIONS, STD_DEFAULT, CPP_PREFERENCE_IDS } from '../cpp/constants';
import { CPP_TEMPLATE_STORAGE_KEY, DEFAULT_CPP_TEMPLATE } from '../../common/templates';
import { SCRATCHPAD_SCHEME, ScratchpadEntry } from '../../common/scratchpad';
import { ScratchpadService } from '../scratchpad/scratchpad.service';
import { IStorageService, ISystemPathService, SystemPathServicePath } from '../../common';
import { IProblem, IProblemService } from '../../common/problem';
import { CompileRunPanel } from './view';
import { CppSettingsEditor } from './settings.editor';
import { CppTemplateEditor } from './template.editor';

export const SINGLE_FILE_FLAGS_KEY = 'singlefile.cpp.flags';

export const COMMON_FLAGS = [
  { label: '-O2', value: '-O2', desc: '优化级别 2 (OJ 默认)' },
  { label: '-Wall', value: '-Wall', desc: '开启常规警告' },
  { label: '-Wextra', value: '-Wextra', desc: '开启额外警告' },
  { label: '-Wshadow', value: '-Wshadow', desc: '变量遮蔽警告' },
  { label: '-Wconversion', value: '-Wconversion', desc: '类型转换警告' },
  { label: '-fsanitize=address', value: '-fsanitize=address', desc: '内存错误检测' },
  { label: '-fsanitize=undefined', value: '-fsanitize=undefined', desc: '未定义行为检测' },
  { label: '-DLOCAL', value: '-DLOCAL', desc: '定义 LOCAL 宏' },
];

export const SINGLEFILE_COMPILE_CMD = 'singlefile.cpp.compile';
export const SINGLEFILE_RUN_CMD = 'singlefile.cpp.run';
export const SINGLEFILE_COMPILE_RUN_CMD = 'singlefile.cpp.compileAndRun';
export const SINGLEFILE_DEBUG_CMD = 'singlefile.cpp.debug';
export const SINGLEFILE_OPEN_SETTINGS_CMD = 'singlefile.cpp.openSettings';
export const SINGLEFILE_OPEN_TEMPLATE_CMD = 'singlefile.cpp.openTemplate';
export const COMPILE_RUN_CONTAINER = 'compile-run-container';
export const CPP_SETTINGS_SCHEME = 'cpp-settings';
export const CPP_SETTINGS_URI = `${CPP_SETTINGS_SCHEME}://panel`;
export const CPP_TEMPLATE_SCHEME = 'cpp-template';
export const CPP_TEMPLATE_URI = `${CPP_TEMPLATE_SCHEME}://panel`;

function stdToFlag(std: string): string {
  switch (std) {
    case 'C++14': return '-std=c++14';
    case 'C++17': return '-std=c++17';
    case 'C++23': return '-std=c++23';
    default: return '-std=c++14';
  }
}

interface ScratchpadContext {
  id: string;
  entry: ScratchpadEntry;
  uri: URI;
  content: string;
  workDir: string;
  sourcePath: string;
  execPath: string;
  contentHash: string;
}

@Domain(CommandContribution, ClientAppContribution, ComponentContribution, BrowserEditorContribution)
@Injectable()
export class CompileRunContribution
  implements CommandContribution, ClientAppContribution, ComponentContribution, BrowserEditorContribution
{
  @Autowired(IFileServiceClient)
  private readonly fileService: IFileServiceClient;

  @Autowired(WorkbenchEditorService)
  private readonly editorService: WorkbenchEditorService;

  @Autowired(IWorkspaceService)
  private readonly workspaceService: IWorkspaceService;

  @Autowired(IMessageService)
  private readonly messageService: IMessageService;

  @Autowired(ITerminalApiService)
  private readonly terminalApi: ITerminalApiService;

  @Autowired(ITerminalController)
  private readonly terminalController: ITerminalController;

  @Autowired(IStorageService)
  private readonly storage: IStorageService;

  @Autowired(SystemPathServicePath)
  private readonly systemPathService: ISystemPathService;

  @Autowired(PreferenceService)
  private readonly preferenceService: PreferenceService;

  @Autowired(IProblemService)
  private readonly problemService: IProblemService;

  @Autowired(DebugConfigurationManager)
  private readonly debugConfigurationManager: DebugConfigurationManager;

  @Autowired(IDebugSessionManager)
  private readonly debugSessionManager: IDebugSessionManager;

  @Autowired(IEditorDocumentModelService)
  private readonly docModelService: IEditorDocumentModelService;

  @Autowired(ScratchpadService)
  private readonly scratchService: ScratchpadService;

  private cachedCompiler: string | undefined;
  private scratchBuildCache = new Map<string, { execPath: string; cwd: string; contentHash: string }>();
  private cachedPlatform: string | undefined;

  private async pickBrewGpp(): Promise<string | undefined> {
    const dirs = [
      '/opt/homebrew/bin',
      '/opt/homebrew/opt/gcc/bin',
      '/usr/local/bin',
      '/usr/local/opt/gcc/bin',
      '/opt/local/bin',
    ];
    for (const dir of dirs) {
      try {
        const stat = await this.fileService.getFileStat(new URI(`file://${dir}`).toString(), true);
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
        // ignore
      }
    }
    return undefined;
  }

  private async getCompiler(): Promise<string> {
    if (this.cachedCompiler) return this.cachedCompiler;

    const custom = this.preferenceService.getValid(CPP_PREFERENCE_IDS.compilerPath, '');
    if (custom) {
      this.cachedCompiler = custom;
      return custom;
    }

    const platform = await this.getPlatform();
    if (platform === 'darwin') {
      const brewGpp = await this.pickBrewGpp();
      if (brewGpp) {
        this.cachedCompiler = brewGpp;
        return brewGpp;
      }
    }

    this.cachedCompiler = 'g++';
    return this.cachedCompiler;
  }

  registerComponent(registry: ComponentRegistry) {
    registry.register(COMPILE_RUN_CONTAINER, [], {
      containerId: COMPILE_RUN_CONTAINER,
      iconClass: getIcon('start'),
      title: '编译与运行',
      component: CompileRunPanel,
      priority: 8,
    });
  }

  registerEditorComponent(registry: EditorComponentRegistry) {
    registry.registerEditorComponent({
      uid: 'cpp-settings-editor',
      scheme: CPP_SETTINGS_SCHEME,
      component: CppSettingsEditor,
      renderMode: EditorComponentRenderMode.ONE_PER_WORKBENCH,
    });

    registry.registerEditorComponent({
      uid: 'cpp-template-editor',
      scheme: CPP_TEMPLATE_SCHEME,
      component: CppTemplateEditor,
      renderMode: EditorComponentRenderMode.ONE_PER_WORKBENCH,
    });

    registry.registerEditorComponentResolver(CPP_SETTINGS_SCHEME, (resource, results) => {
      results.push({ type: EditorOpenType.component, componentId: 'cpp-settings-editor' });
    });

    registry.registerEditorComponentResolver(CPP_TEMPLATE_SCHEME, (resource, results) => {
      results.push({ type: EditorOpenType.component, componentId: 'cpp-template-editor' });
    });

  }

  registerResource(service: ResourceService) {
    service.registerResourceProvider({
      scheme: CPP_SETTINGS_SCHEME,
      provideResource: async (uri: URI): Promise<IResource> => ({
        uri,
        name: localize('cpp.settings.title', '编译器详细设置'),
        icon: getIcon('gear'),
      }),
    });

    service.registerResourceProvider({
      scheme: CPP_TEMPLATE_SCHEME,
      provideResource: async (uri: URI): Promise<IResource> => ({
        uri,
        name: localize('cpp.template.title', '默认源码模板'),
        icon: getIcon('edit'),
      }),
    });

  }

  registerCommands(registry: CommandRegistry) {
    registry.registerCommand(
      { id: SINGLEFILE_COMPILE_CMD, label: '编译当前题目' },
      { execute: () => this.compileCurrentFile() },
    );
    registry.registerCommand(
      { id: SINGLEFILE_RUN_CMD, label: '运行已编译程序' },
      { execute: () => this.runCompiledFile() },
    );
    registry.registerCommand(
      { id: SINGLEFILE_COMPILE_RUN_CMD, label: '编译并运行当前题目' },
      { execute: () => this.compileAndRun() },
    );
    registry.registerCommand(
      { id: SINGLEFILE_DEBUG_CMD, label: '调试当前题目' },
      { execute: () => this.debugCurrentFile() },
    );
    registry.registerCommand(
      { id: SINGLEFILE_OPEN_SETTINGS_CMD, label: '打开编译器设置' },
      {
        execute: async () => {
          await this.editorService.open(new URI(CPP_SETTINGS_URI), { preview: false });
        },
      },
    );
    registry.registerCommand(
      { id: SINGLEFILE_OPEN_TEMPLATE_CMD, label: '打开源码模板' },
      { execute: () => this.openCppTemplate() },
    );
  }

  async onStart() {
    if ((this.problemService as any).refreshActiveProblem) {
      void (this.problemService as any).refreshActiveProblem();
    }
    this.editorService.onActiveResourceChange(async () => {
      if ((this.problemService as any).refreshActiveProblem) {
        void (this.problemService as any).refreshActiveProblem();
      }
    });

    this.registerCppDebugSupport();
    void this.getFlags();
    const revealTerminal = (session: any) => {
      if (!session?.configuration) return;
      if (session.configuration.type !== 'cppdbg') return;
      if (session.configuration.console !== 'integratedTerminal') return;
      setTimeout(() => this.terminalController.showTerminalPanel(), 0);
    };
    const sessionStateDisposables = new Map<string, { dispose: () => void }>();

    this.debugSessionManager.onDidStartDebugSession((session: any) => {
      revealTerminal(session);
      if (!session?.id || !session?.onDidChangeState) return;
      const disposable = session.onDidChangeState((state: DebugState) => {
        if (state === DebugState.Stopped) {
          revealTerminal(session);
        }
      });
      if (disposable?.dispose) {
        sessionStateDisposables.set(session.id, disposable);
      }
    });
    this.debugSessionManager.onDidStopDebugSession((session: any) => {
      if (session?.id && sessionStateDisposables.has(session.id)) {
        sessionStateDisposables.get(session.id)?.dispose();
        sessionStateDisposables.delete(session.id);
      }
    });
  }

  private async openCppTemplate(): Promise<void> {
    const root = await this.getRootPath();
    if (!root) {
      this.messageService.warning('请先打开一个文件夹以编辑源码模板');
      return;
    }

    const templateDir = `${root}/.opticode/templates`;
    const templatePath = `${templateDir}/default.cpp`;
    const templateDirUri = new URI(`file://${templateDir}`).toString();
    const templateFileUri = new URI(`file://${templatePath}`).toString();

    try {
      const stat = await this.fileService.getFileStat(templateDirUri);
      if (!stat) {
        await this.fileService.createFolder(templateDirUri);
      }
    } catch {
      await this.fileService.createFolder(templateDirUri);
    }

    try {
      const stat = await this.fileService.getFileStat(templateFileUri);
      if (!stat) {
        const current = await Promise.resolve(
          this.storage.getItem<string>(CPP_TEMPLATE_STORAGE_KEY, DEFAULT_CPP_TEMPLATE),
        );
        const content = current || DEFAULT_CPP_TEMPLATE;
        await this.fileService.createFile(templateFileUri, { content });
      }
    } catch {
      const current = await Promise.resolve(
        this.storage.getItem<string>(CPP_TEMPLATE_STORAGE_KEY, DEFAULT_CPP_TEMPLATE),
      );
      const content = current || DEFAULT_CPP_TEMPLATE;
      await this.fileService.createFile(templateFileUri, { content });
    }

    await this.editorService.open(URI.file(templatePath), { preview: false });
  }

  private async getStd(): Promise<string> {
    const normalizeStd = (val: string | undefined): string => {
      if (STD_OPTIONS.includes(val || '')) return val as string;
      return STD_DEFAULT;
    };
    const pref = this.preferenceService.getValid(CPP_PREFERENCE_IDS.std, STD_DEFAULT);
    const normalized = normalizeStd(pref as string | undefined);
    if (normalized) return normalized;
    const val = await this.storage.getItem<string>(STD_KEY);
    return normalizeStd(val);
  }

  private async getFlags(): Promise<string[]> {
    const pref = this.preferenceService.getValid(CPP_PREFERENCE_IDS.flags, undefined as any);
    if (Array.isArray(pref) && pref.length) return pref as string[];
    const saved = await this.storage.getItem<string[]>(SINGLE_FILE_FLAGS_KEY);
    if (Array.isArray(saved) && saved.length) {
      await this.preferenceService.update(CPP_PREFERENCE_IDS.flags, saved);
      this.storage.removeItem(SINGLE_FILE_FLAGS_KEY);
      return saved;
    }
    return ['-O2', '-Wall'];
  }

  private async getRootPath(): Promise<string | undefined> {
    const roots = await this.workspaceService.roots;
    if (!roots.length) return undefined;
    return new URI(roots[0].uri).codeUri.fsPath;
  }

  private async getRootUri(): Promise<string | undefined> {
    const roots = await this.workspaceService.roots;
    if (!roots.length) return undefined;
    return roots[0].uri;
  }

  private async getScratchpadPaths(id: string): Promise<{ workDir: string; sourcePath: string; execPath: string }> {
    return this.systemPathService.getScratchpadBuildPaths(id);
  }

  private hashScratchContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i += 1) {
      hash = ((hash << 5) - hash) + content.charCodeAt(i);
      hash |= 0;
    }
    return `${content.length}:${hash}`;
  }

  private async getActiveScratchpadContext(): Promise<ScratchpadContext | undefined> {
    const resource = this.editorService.currentResource;
    if (!resource) return undefined;
    const uri = resource.uri;
    if (!uri || uri.scheme !== SCRATCHPAD_SCHEME) return undefined;
    const id = this.scratchService.getIdFromUri(uri);
    if (!id) return undefined;

    const entry = await this.scratchService.ensure(id);
    const { workDir, sourcePath, execPath } = await this.getScratchpadPaths(id);
    const backingUri = await this.scratchService.getBackingUri(id);

    let ref;
    try {
      ref = await this.docModelService.createModelReference(backingUri, 'scratchpad-compile');
      const content = ref.instance.getText();
      return {
        id,
        entry,
        uri,
        content,
        workDir,
        sourcePath,
        execPath,
        contentHash: this.hashScratchContent(content),
      };
    } catch (err: any) {
      this.messageService.error(`读取草稿纸失败：${err?.message || err}`);
      return undefined;
    } finally {
      ref?.dispose();
    }
  }

  private async getPlatform(): Promise<string> {
    if (!this.cachedPlatform) {
      this.cachedPlatform = await this.systemPathService.getPlatform();
    }
    return this.cachedPlatform;
  }

  /** 确保二进制输出目录存在 */
  private async ensureBinDir(binUri: string) {
    try {
      const stat = await this.fileService.getFileStat(binUri);
      if (!stat) {
        await this.fileService.createFolder(binUri);
      }
    } catch {
      try { await this.fileService.createFolder(binUri); } catch { /* ignore */ }
    }
  }

  /** 确保草稿纸临时目录存在 */
  private async ensureScratchDir(dirUri: string) {
    try {
      const stat = await this.fileService.getFileStat(dirUri);
      if (!stat) {
        await this.fileService.createFolder(dirUri);
      }
    } catch {
      try { await this.fileService.createFolder(dirUri); } catch { /* ignore */ }
    }
  }

  /**
   * 在独立终端中执行命令，可选择等待退出并在成功后自动关闭终端。
   */
  private async spawnTerminalCommand(
    name: string,
    executable: string,
    args: string[],
    options?: {
      cwd?: string;
      waitForExit?: boolean;
      removeOnSuccess?: boolean;
      /** 是否在命令结束后暂停终端：true=总是，'onFailure'=仅失败时 */
      pauseOnExit?: boolean | 'onFailure';
    },
  ): Promise<{ exitCode?: number; clientId: string }> {
    this.terminalController.showTerminalPanel();

    const shell =
      (typeof process !== 'undefined' && process.env && process.env.SHELL)
        ? process.env.SHELL
        : '/bin/bash';
    const cmdLine = [executable, ...args]
      .filter(Boolean)
      .map((part) => (part.includes(' ') ? `"${part}"` : part))
      .join(' ');

    const pauseCondition = options?.pauseOnExit === 'onFailure'
      ? '[ $code -ne 0 ]'
      : options?.pauseOnExit
        ? 'true'
        : '';

    const pauseSnippet = pauseCondition
      ? `if ${pauseCondition}; then echo; read -n 1 -s -r -p "按任意键关闭终端..."; echo; fi;`
      : '';

    const wrapped = `(${cmdLine}); code=$?; echo; echo "[退出码 $code]"; ${pauseSnippet} exit $code`;

    let client;
    try {
      client = await this.terminalController.createTerminal({
        config: {
          name,
          executable: shell,
          args: ['-lc', wrapped],
          cwd: options?.cwd,
        },
        closeWhenExited: false,
      });
    } catch (error: any) {
      this.messageService.error(`无法启动终端：${error?.message || error}`);
      return { exitCode: -1, clientId: '' };
    }

    const exitPromise = new Promise<number | undefined>(resolve => {
      const disposables: Array<{ dispose(): void }> = [];

      const resolveOnce = (code: number | undefined) => {
        disposables.forEach(d => d.dispose());
        resolve(code);
      };

      disposables.push(client.onExit(e => resolveOnce(e.code)));
      disposables.push(
        this.terminalApi.onDidCloseTerminal(e => {
          if (e.id === client.id) resolveOnce(e.code);
        }),
      );
    });

    if (options?.waitForExit) {
      const code = await exitPromise;
      if (options?.removeOnSuccess && (code === 0 || code === undefined)) {
        this.terminalApi.removeTerm(client.id);
      }
      return { exitCode: code, clientId: client.id };
    }

    exitPromise.then(code => {
      if (options?.removeOnSuccess && code === 0) {
        this.terminalApi.removeTerm(client.id);
      }
    });

    return { exitCode: undefined, clientId: client.id };
  }

  async compileCurrentFile(): Promise<boolean> {
    const scratch = await this.getActiveScratchpadContext();
    if (scratch) {
      const res = await this.compileScratchpad(scratch);
      return res.ok;
    }

    const problem = (this.problemService as any).activeProblem as IProblem | undefined;
    if (!problem) {
      this.messageService.warning('请先打开一个题目的 .cpp 文件或草稿纸');
      return false;
    }

    return this.compileProblem(problem, await this.getFlags(), `编译 ${problem.meta.id}`);
  }

  async runCompiledFile() {
    const scratch = await this.getActiveScratchpadContext();
    if (scratch) {
      await this.runScratchpad(scratch);
      return;
    }

    const problem = (this.problemService as any).activeProblem as IProblem | undefined;
    if (!problem) {
      this.messageService.warning('请先打开一个题目的 .cpp 文件或草稿纸');
      return;
    }

    await this.spawnTerminalCommand(`运行 ${problem.meta.id}`, problem.executablePath, [], {
      cwd: problem.rootDir,
      waitForExit: false,
      pauseOnExit: true,
    });
  }

  async compileAndRun() {
    const scratch = await this.getActiveScratchpadContext();
    if (scratch) {
      const compileRes = await this.compileScratchpad(scratch);
      if (!compileRes.ok) {
        const exitCodeText = compileRes.exitCode ?? '未知';
        this.messageService.error(`编译失败(退出码 ${exitCodeText})，已停止运行，请查看终端输出。`);
        return;
      }
      await this.runScratchpad(scratch, { skipCompileCheck: true });
      return;
    }

    const problem = (this.problemService as any).activeProblem as IProblem | undefined;
    if (!problem) {
      this.messageService.warning('请先打开一个题目的 .cpp 文件或草稿纸');
      return;
    }

    const stdFlag = stdToFlag(await this.getStd());
    const flags = await this.getFlags();
    const gpp = await this.getCompiler();

    const binUri = new URI(`file://${problem.binDir}`).toString();
    await this.ensureBinDir(binUri);

    const args = [stdFlag, ...flags, '-o', problem.executablePath, problem.sourcePath];
    const compileRes = await this.spawnTerminalCommand(`编译 ${problem.meta.id}`, gpp, args, {
      cwd: problem.rootDir,
      waitForExit: true,
      pauseOnExit: 'onFailure',
      removeOnSuccess: false,
    });

    if (compileRes.exitCode !== 0 && compileRes.exitCode !== undefined) {
      const exitCodeText = compileRes.exitCode ?? '未知';
      this.messageService.error(`编译失败(退出码 ${exitCodeText})，已停止运行，请查看终端输出。`);
      return;
    }

    await this.spawnTerminalCommand(`运行 ${problem.meta.id}`, problem.executablePath, [], {
      cwd: problem.rootDir,
      waitForExit: false,
      pauseOnExit: true,
    });
  }

  private buildDebugFlags(flags: string[]): string[] {
    const optimized = flags.filter((flag) => !/^-(O[0-3]|Os|Ofast)$/.test(flag) && !/^-(g|ggdb|g3)$/.test(flag));
    if (!optimized.includes('-O0')) optimized.push('-O0');
    if (!optimized.includes('-g')) optimized.push('-g');
    if (!optimized.includes('-fno-omit-frame-pointer')) optimized.push('-fno-omit-frame-pointer');
    return optimized;
  }

  private async compileProblem(problem: IProblem, flags: string[], label: string): Promise<boolean> {
    const stdFlag = stdToFlag(await this.getStd());
    const gpp = await this.getCompiler();

    const binUri = new URI(`file://${problem.binDir}`).toString();
    await this.ensureBinDir(binUri);

    const args = [stdFlag, ...flags, '-o', problem.executablePath, problem.sourcePath];
    const res = await this.spawnTerminalCommand(label, gpp, args, {
      cwd: problem.rootDir,
      waitForExit: true,
      pauseOnExit: 'onFailure',
    });

    return res.exitCode === 0 || res.exitCode === undefined;
  }

  private getCppDebuggerConfig(problem: IProblem): DebugConfiguration {
    return {
      name: `调试 ${problem.meta.id}`,
      type: 'cppdbg',
      request: 'launch',
      program: problem.executablePath,
      cwd: problem.rootDir,
      args: [],
      stopOnEntry: false,
      env: {},
      console: 'integratedTerminal',
      openDebug: 'openOnSessionStart',
      internalConsoleOptions: 'openOnSessionStart',
      autoPick: true,
    };
  }

  private registerCppDebugSupport() {
    this.debugConfigurationManager.addSupportBreakpoints('cpp');
    this.debugConfigurationManager.addSupportBreakpoints('c');
    this.debugConfigurationManager.addSupportBreakpoints('objective-c');
    this.debugConfigurationManager.addSupportBreakpoints('objective-cpp');

    this.debugConfigurationManager.registerInternalDebugConfigurationProvider('cppdbg', {
      type: 'cppdbg',
      label: 'C/C++ (OI 调试)',
      popupHint: '无需 launch.json，自动编译并调试当前题目（macOS 使用 lldb-dap，其他平台使用 gdb DAP）',
      provideDebugConfigurations: async () => {
        const problem = this.problemService.activeProblem;
        if (!problem) return [];
        return [this.getCppDebuggerConfig(problem)];
      },
    });
  }

  async debugCurrentFile() {
    const scratch = await this.getActiveScratchpadContext();
    if (scratch) {
      this.messageService.info('草稿纸暂不支持调试');
      return;
    }

    const problem = (this.problemService as any).activeProblem as IProblem | undefined;
    if (!problem) {
      this.messageService.warning('请先打开一个题目的 .cpp 文件或草稿纸');
      return;
    }

    const debuggerContribution = this.debugConfigurationManager.getDebugger('cppdbg');
    if (!debuggerContribution) {
      this.messageService.warning('未检测到 C/C++ 调试器，若启动失败请确认 opticode.cpp-debug 扩展已启用');
    }

    const debugFlags = this.buildDebugFlags(await this.getFlags());
    const ok = await this.compileProblem(problem, debugFlags, `调试编译 ${problem.meta.id}`);
    if (!ok) {
      return;
    }

    const workspaceFolderUri = await this.getRootUri();
    const configuration = this.getCppDebuggerConfig(problem);
    delete configuration.autoPick;
    await this.debugSessionManager.start({
      configuration,
      workspaceFolderUri,
      index: -1,
    });
  }

  private async compileScratchpad(context?: ScratchpadContext): Promise<{ ok: boolean; exitCode?: number }> {
    const ctx = context || await this.getActiveScratchpadContext();
    if (!ctx) {
      this.messageService.warning('请先打开草稿纸');
      return { ok: false };
    }

    const stdFlag = stdToFlag(await this.getStd());
    const flags = await this.getFlags();
    const gpp = await this.getCompiler();

    const dirUri = URI.file(ctx.workDir).toString();
    await this.ensureScratchDir(dirUri);

    const sourceUri = URI.file(ctx.sourcePath).toString();
    await this.fileService.createFile(sourceUri, { content: ctx.content, overwrite: true });

    const args = [stdFlag, ...flags, '-o', ctx.execPath, ctx.sourcePath];
    const res = await this.spawnTerminalCommand(`编译 草稿纸`, gpp, args, {
      cwd: ctx.workDir,
      waitForExit: true,
      pauseOnExit: 'onFailure',
      removeOnSuccess: false,
    });

    const ok = res.exitCode === 0 || res.exitCode === undefined;
    if (ok) {
      this.scratchBuildCache.set(ctx.id, {
        execPath: ctx.execPath,
        cwd: ctx.workDir,
        contentHash: ctx.contentHash,
      });
    }
    return { ok, exitCode: res.exitCode };
  }

  private async runScratchpad(
    context?: ScratchpadContext,
    options?: { skipCompileCheck?: boolean },
  ): Promise<void> {
    const ctx = context || await this.getActiveScratchpadContext();
    if (!ctx) {
      this.messageService.warning('请先打开草稿纸');
      return;
    }

    const cached = this.scratchBuildCache.get(ctx.id);
    const cacheValid = cached && cached.contentHash === ctx.contentHash;
    if (!cacheValid && !options?.skipCompileCheck) {
      const compileRes = await this.compileScratchpad(ctx);
      if (!compileRes.ok) {
        const exitCodeText = compileRes.exitCode ?? '未知';
        this.messageService.error(`编译失败(退出码 ${exitCodeText})，已停止运行，请查看终端输出。`);
        return;
      }
    }

    const execPath = this.scratchBuildCache.get(ctx.id)?.execPath || ctx.execPath;
    const cwd = this.scratchBuildCache.get(ctx.id)?.cwd || ctx.workDir;
    await this.spawnTerminalCommand(`运行 草稿纸`, execPath, [], {
      cwd,
      waitForExit: false,
      pauseOnExit: true,
    });
    await this.scratchService.updateRunInfo(ctx.id);
  }
}
