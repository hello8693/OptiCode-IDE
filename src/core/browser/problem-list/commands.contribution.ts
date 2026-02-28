import { Autowired, Injectable } from '@opensumi/di';
import {
  CommandContribution,
  CommandRegistry,
  Domain,
  URI,
  IWindowService,
} from '@opensumi/ide-core-browser';
import { IQuickInputService } from '@opensumi/ide-core-browser/lib/quick-open';
import { IFileServiceClient } from '@opensumi/ide-file-service';
import { WorkbenchEditorService } from '@opensumi/ide-editor/lib/browser';
import { IMessageService } from '@opensumi/ide-overlay';
import { IWorkspaceService } from '@opensumi/ide-workspace/lib/common';
import { IMenuRegistry, MenuContribution } from '@opensumi/ide-core-browser/lib/menu/next';

import { IProblemService } from '../../common/problem';

export const SINGLEFILE_CREATE_CMD = 'singlefile.cpp.createProblem';
export const PROBLEM_LIST_CONTEXT_MENU_ID = 'problem-list/context';
export const PROBLEM_COPY_OPEN_CMD = 'problem.list.copyOpen';

@Domain(CommandContribution, MenuContribution)
@Injectable()
export class ProblemCommandContribution implements CommandContribution, MenuContribution {
  @Autowired(IQuickInputService)
  private readonly quickInput: IQuickInputService;

  @Autowired(IWorkspaceService)
  private readonly workspaceService: IWorkspaceService;

  @Autowired(IMessageService)
  private readonly messageService: IMessageService;

  @Autowired(IProblemService)
  private readonly problemService: IProblemService;

  @Autowired(WorkbenchEditorService)
  private readonly editorService: WorkbenchEditorService;

  @Autowired(IFileServiceClient)
  private readonly fileService: IFileServiceClient;

  @Autowired(IWindowService)
  private readonly windowService: IWindowService;

  registerCommands(registry: CommandRegistry) {
    registry.registerCommand(
      { id: SINGLEFILE_CREATE_CMD, label: '新建题目' },
      { execute: () => this.createProblem() },
    );

    registry.registerCommand(
      { id: PROBLEM_COPY_OPEN_CMD, label: '拷贝源码并打开题目页面' },
      { execute: (problemId?: string) => this.copyAndOpen(problemId) },
    );
  }

  registerMenus(menuRegistry: IMenuRegistry): void {
    menuRegistry.registerMenuItem(PROBLEM_LIST_CONTEXT_MENU_ID, {
      command: PROBLEM_COPY_OPEN_CMD,
      group: 'navigation',
      order: 1,
    });
  }

  private async getRootPath(): Promise<string | undefined> {
    const roots = await this.workspaceService.roots;
    if (!roots.length) return undefined;
    return new URI(roots[0].uri).codeUri.fsPath;
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

  private normalizeProblemUrl(raw?: string): string | undefined {
    if (!raw) return undefined;
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
    return undefined;
  }

  private async copyTextToClipboard(text: string): Promise<boolean> {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // fallback below
    }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.top = '0';
      textarea.style.left = '0';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }

  private async copyAndOpen(problemId?: string): Promise<void> {
    if (!problemId) {
      this.messageService.warning('未选择题目');
      return;
    }
    try {
      const problem = await this.problemService.loadProblem(problemId);
      let copied = false;
      let opened = false;
      try {
        const uri = URI.file(problem.sourcePath).toString();
        const { content } = await this.fileService.readFile(uri);
        copied = await this.copyTextToClipboard(content.toString());
      } catch {
        this.messageService.warning('读取源码失败');
      }

      const url = this.normalizeProblemUrl(problem.meta.source?.url);
      if (url) {
        this.windowService.openNewWindow(url, { external: true });
        opened = true;
      } else {
        this.messageService.warning('未设置题目链接，无法打开题目页面');
      }

      if (copied && opened) {
        this.messageService.info('已复制源码并打开题目页面');
      } else if (copied) {
        this.messageService.info('已复制源码');
      } else if (opened) {
        this.messageService.warning('源码复制失败，已打开题目页面');
      } else {
        this.messageService.warning('源码复制失败');
      }
    } catch (err: any) {
      this.messageService.error(`操作失败: ${err?.message || err}`);
      return;
    }
  }
}
