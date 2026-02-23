import { Autowired, Injectable } from '@opensumi/di';
import { CommandContribution, CommandRegistry, Domain, URI } from '@opensumi/ide-core-browser';
import { IQuickInputService } from '@opensumi/ide-core-browser/lib/quick-open';
import { WorkbenchEditorService } from '@opensumi/ide-editor/lib/browser';
import { IMessageService } from '@opensumi/ide-overlay';
import { IWorkspaceService } from '@opensumi/ide-workspace/lib/common';

import { IProblemService } from '../../common/problem';

export const SINGLEFILE_CREATE_CMD = 'singlefile.cpp.createProblem';

@Domain(CommandContribution)
@Injectable()
export class ProblemCommandContribution implements CommandContribution {
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

  registerCommands(registry: CommandRegistry) {
    registry.registerCommand(
      { id: SINGLEFILE_CREATE_CMD, label: '新建题目' },
      { execute: () => this.createProblem() },
    );
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
}
