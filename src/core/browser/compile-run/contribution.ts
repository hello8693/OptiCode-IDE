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
import { IQuickInputService } from '@opensumi/ide-core-browser/lib/quick-open';
import { IFileServiceClient } from '@opensumi/ide-file-service';
import { WorkbenchEditorService } from '@opensumi/ide-editor/lib/browser';
import { IWorkspaceService } from '@opensumi/ide-workspace/lib/common';
import { IMessageService } from '@opensumi/ide-overlay';
import { ITerminalApiService, ITerminalController } from '@opensumi/ide-terminal-next';
import { DebugConfiguration, DebugState, IDebugSessionManager } from '@opensumi/ide-debug';
import { DebugConfigurationManager } from '@opensumi/ide-debug/lib/browser/debug-configuration-manager';

import { STD_KEY, STD_OPTIONS, STD_DEFAULT, OPT_KEY, OPT_OPTIONS, CPP_PREFERENCE_IDS } from '../cpp/constants';
import { IStorageService } from '../../common';
import { IProblem, IProblemService } from '../../common/problem';
import { CompileRunPanel, COMPILE_RUN_PANEL } from './view';
import { SampleTestPanel, SAMPLE_TEST_PANEL, SAMPLE_TEST_CONTAINER } from '../sample-test/view';
import { CppSettingsEditor } from './settings.editor';
import { CppTemplateEditor } from './template.editor';
import { ProblemMetaEditor } from '../problem-meta/editor';

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

export const SINGLEFILE_CREATE_CMD = 'singlefile.cpp.createProblem';
export const SINGLEFILE_COMPILE_CMD = 'singlefile.cpp.compile';
export const SINGLEFILE_RUN_CMD = 'singlefile.cpp.run';
export const SINGLEFILE_COMPILE_RUN_CMD = 'singlefile.cpp.compileAndRun';
export const SINGLEFILE_DEBUG_CMD = 'singlefile.cpp.debug';
export const SINGLEFILE_OPEN_SETTINGS_CMD = 'singlefile.cpp.openSettings';
export const SINGLEFILE_OPEN_TEMPLATE_CMD = 'singlefile.cpp.openTemplate';
export const SINGLEFILE_OPEN_META_CMD = 'singlefile.cpp.openMeta';
export const COMPILE_RUN_CONTAINER = 'compile-run-container';
export const CPP_SETTINGS_SCHEME = 'cpp-settings';
export const CPP_SETTINGS_URI = `${CPP_SETTINGS_SCHEME}://panel`;
export const CPP_TEMPLATE_SCHEME = 'cpp-template';
export const CPP_TEMPLATE_URI = `${CPP_TEMPLATE_SCHEME}://panel`;
export const PROBLEM_META_SCHEME = 'problem-meta';

function stdToFlag(std: string): string {
  switch (std) {
    case 'C++14': return '-std=c++14';
    case 'C++17': return '-std=c++17';
    case 'C++23': return '-std=c++23';
    default: return '-std=c++20';
  }
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

  @Autowired(IQuickInputService)
  private readonly quickInput: IQuickInputService;

  @Autowired(PreferenceService)
  private readonly preferenceService: PreferenceService;

  @Autowired(IProblemService)
  private readonly problemService: IProblemService;

  @Autowired(DebugConfigurationManager)
  private readonly debugConfigurationManager: DebugConfigurationManager;

  @Autowired(IDebugSessionManager)
  private readonly debugSessionManager: IDebugSessionManager;

  private cachedCompiler: string | undefined;

  private async pickBrewGpp(): Promise<string | undefined> {
    const dirs = ['/opt/homebrew/bin', '/usr/local/bin'];
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

    if (process.platform === 'darwin') {
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

    registry.register(SAMPLE_TEST_CONTAINER, [], {
      containerId: SAMPLE_TEST_CONTAINER,
      iconClass: getIcon('test'),
      title: '自测',
      component: SampleTestPanel,
      priority: 7,
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

    registry.registerEditorComponent({
      uid: 'sample-editor',
      scheme: 'file',
      component: SampleTestPanel,
      renderMode: EditorComponentRenderMode.ONE_PER_WORKBENCH,
    });

    registry.registerEditorComponent({
      uid: 'problem-meta-editor',
      scheme: PROBLEM_META_SCHEME,
      component: ProblemMetaEditor,
      renderMode: EditorComponentRenderMode.ONE_PER_WORKBENCH,
    });

    registry.registerEditorComponentResolver(CPP_SETTINGS_SCHEME, (resource, results) => {
      results.push({ type: EditorOpenType.component, componentId: 'cpp-settings-editor' });
    });

    registry.registerEditorComponentResolver(CPP_TEMPLATE_SCHEME, (resource, results) => {
      results.push({ type: EditorOpenType.component, componentId: 'cpp-template-editor' });
    });

    registry.registerEditorComponentResolver('file', (resource, results) => {
      const fsPath = resource?.uri?.codeUri?.fsPath;
      if (!fsPath) return;
      if (this.isSamplesJsonPath(fsPath)) {
        results.unshift({ type: EditorOpenType.component, componentId: 'sample-editor' });
      }
    });

    registry.registerEditorComponentResolver(PROBLEM_META_SCHEME, (resource, results) => {
      results.push({ type: EditorOpenType.component, componentId: 'problem-meta-editor' });
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

    service.registerResourceProvider({
      scheme: PROBLEM_META_SCHEME,
      provideResource: async (uri: URI): Promise<IResource> => ({
        uri,
        name: localize('problem.meta.title', '题目元信息'),
        icon: getIcon('setting'),
      }),
    });
  }

  registerCommands(registry: CommandRegistry) {
    registry.registerCommand(
      { id: SINGLEFILE_CREATE_CMD, label: '新建题目' },
      { execute: () => this.createProblem() },
    );
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
    registry.registerCommand(
      { id: SINGLEFILE_OPEN_META_CMD, label: '编辑题目信息' },
      {
        execute: async (id?: string) => {
          const targetId = id || this.problemService.activeProblem?.meta.id;
          if (!targetId) {
            this.messageService.warning('请先打开一道题目');
            return;
          }
          await this.editorService.open(new URI(`${PROBLEM_META_SCHEME}://${targetId}`), { preview: false });
        },
      },
    );
  }

  async onStart() {
    if ((this.problemService as any).refreshActiveProblem) {
      await (this.problemService as any).refreshActiveProblem();
    }
    this.editorService.onActiveResourceChange(async () => {
      if ((this.problemService as any).refreshActiveProblem) {
        await (this.problemService as any).refreshActiveProblem();
      }
    });

    this.registerCppDebugSupport();
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
    await this.editorService.open(new URI(CPP_TEMPLATE_URI), { preview: false });
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
    if (Array.isArray(pref)) return pref as string[];
    const saved = await this.storage.getItem<string[]>(SINGLE_FILE_FLAGS_KEY);
    return saved || ['-O2', '-Wall'];
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

  private isSamplesJsonPath(fsPath: string): boolean {
    if (!fsPath) return false;
    const normalized = fsPath.replace(/\\/g, '/');
    return /\/samples\/samples\.json$/i.test(normalized);
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

    const shell = process.env.SHELL || '/bin/bash';
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

  private async createProblem() {
    const rootPath = await this.getRootPath();
    if (!rootPath) {
      this.messageService.warning('请先打开文件夹');
      return;
    }

    const name = await this.quickInput.open({
      prompt: '请输入题目名（将创建同名文件夹，如 P1001）',
      value: 'P1001',
      placeHolder: '例如: P1001、A、solution',
    });

    if (!name) return;

    const sanitized = name.replace(/\.(cpp|cc|cxx|c)$/i, '').replace(/[\/\\]/g, '');
    if (!sanitized) {
      this.messageService.warning('题目名不合法');
      return;
    }

    try {
      const problem = await this.problemService.createProblem(sanitized);
      await this.editorService.open(new URI(`file://${problem.sourcePath}`));
      this.messageService.info(`题目 ${sanitized} 创建成功`);
    } catch (err: any) {
      this.messageService.error(`创建失败: ${err.message || err}`);
    }
  }

  async compileCurrentFile(): Promise<boolean> {
    const problem = (this.problemService as any).activeProblem as IProblem | undefined;
    if (!problem) {
      this.messageService.warning('请先打开一个题目的 .cpp 文件');
      return false;
    }

    return this.compileProblem(problem, await this.getFlags(), `编译 ${problem.meta.id}`);
  }

  async runCompiledFile() {
    const problem = (this.problemService as any).activeProblem as IProblem | undefined;
    if (!problem) {
      this.messageService.warning('请先打开一个题目的 .cpp 文件');
      return;
    }

    await this.spawnTerminalCommand(`运行 ${problem.meta.id}`, problem.executablePath, [], {
      cwd: problem.rootDir,
      waitForExit: false,
      pauseOnExit: true,
    });
  }

  async compileAndRun() {
    const problem = (this.problemService as any).activeProblem as IProblem | undefined;
    if (!problem) {
      this.messageService.warning('请先打开一个题目的 .cpp 文件');
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
    const problem = (this.problemService as any).activeProblem as IProblem | undefined;
    if (!problem) {
      this.messageService.warning('请先打开一个题目的 .cpp 文件');
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
}
