import { Autowired, Injectable } from '@opensumi/di';
import {
  CommandContribution,
  CommandRegistry,
  Domain,
  IResource,
  ResourceService,
  URI,
  getIcon,
  localize,
} from '@opensumi/ide-core-browser';
import {
  BrowserEditorContribution,
  EditorComponentRegistry,
  EditorComponentRenderMode,
  EditorOpenType,
  WorkbenchEditorService,
} from '@opensumi/ide-editor/lib/browser';
import { IMessageService } from '@opensumi/ide-overlay';

import { IProblemService } from '../../common/problem';
import { ProblemMetaEditor } from './editor';

export const PROBLEM_META_SCHEME = 'problem-meta';
export const SINGLEFILE_OPEN_META_CMD = 'singlefile.cpp.openMeta';

@Domain(CommandContribution, BrowserEditorContribution)
@Injectable()
export class ProblemMetaContribution implements CommandContribution, BrowserEditorContribution {
  @Autowired(WorkbenchEditorService)
  private readonly editorService: WorkbenchEditorService;

  @Autowired(IProblemService)
  private readonly problemService: IProblemService;

  @Autowired(IMessageService)
  private readonly messageService: IMessageService;

  registerEditorComponent(registry: EditorComponentRegistry) {
    registry.registerEditorComponent({
      uid: 'problem-meta-editor',
      scheme: PROBLEM_META_SCHEME,
      component: ProblemMetaEditor,
      renderMode: EditorComponentRenderMode.ONE_PER_WORKBENCH,
    });

    registry.registerEditorComponentResolver(PROBLEM_META_SCHEME, (resource, results) => {
      results.push({ type: EditorOpenType.component, componentId: 'problem-meta-editor' });
    });
  }

  registerResource(service: ResourceService) {
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
}
