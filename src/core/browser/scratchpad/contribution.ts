import { Autowired, Injectable } from '@opensumi/di';
import {
  CommandContribution,
  CommandRegistry,
  ComponentContribution,
  ComponentRegistry,
  Domain,
  IResource,
  ResourceService,
  URI,
  localize,
} from '@opensumi/ide-core-browser';
import {
  BrowserEditorContribution,
  EditorComponentRegistry,
  EditorComponentRenderMode,
  EditorOpenType,
  IEditorDocumentModelContentRegistry,
  WorkbenchEditorService,
} from '@opensumi/ide-editor/lib/browser';

import { SCRATCHPAD_SCHEME } from '../../common/scratchpad';
import { ScratchpadService } from './scratchpad.service';
import { ScratchpadPanel, SCRATCHPAD_CONTAINER, SCRATCHPAD_PANEL } from './view';
import { ScratchpadEditor } from './editor';
import { ScratchpadDocumentProvider } from './document-provider';

export const SCRATCHPAD_NEW_CMD = 'scratchpad.new';
export const SCRATCHPAD_OPEN_CMD = 'scratchpad.open';

@Domain(CommandContribution, ComponentContribution, BrowserEditorContribution)
@Injectable()
export class ScratchpadContribution
  implements CommandContribution, ComponentContribution, BrowserEditorContribution
{
  @Autowired(ScratchpadService)
  private readonly scratchService: ScratchpadService;

  @Autowired(WorkbenchEditorService)
  private readonly editorService: WorkbenchEditorService;

  @Autowired(ScratchpadDocumentProvider)
  private readonly docProvider: ScratchpadDocumentProvider;

  registerComponent(registry: ComponentRegistry) {
    registry.register(SCRATCHPAD_CONTAINER, [], {
      containerId: SCRATCHPAD_CONTAINER,
      iconClass: 'oi-scratchpad-icon',
      title: '草稿纸',
      component: ScratchpadPanel,
      priority: 9,
    });
  }

  registerResource(resourceService: ResourceService): void {
    resourceService.registerResourceProvider({
      scheme: SCRATCHPAD_SCHEME,
      provideResource: async (uri: URI): Promise<IResource> => {
        const id = this.scratchService.getIdFromUri(uri);
        const entry = id ? await this.scratchService.get(id) : undefined;
        return {
          uri,
          name: entry?.name || localize('scratchpad.title', '草稿纸'),
          icon: 'oi-scratchpad-icon',
          supportsRevive: true,
        };
      },
    });
  }

  registerEditorComponent(registry: EditorComponentRegistry) {
    registry.registerEditorComponent({
      uid: 'scratchpad-editor',
      scheme: SCRATCHPAD_SCHEME,
      component: ScratchpadEditor,
      renderMode: EditorComponentRenderMode.ONE_PER_RESOURCE,
    });

    registry.registerEditorComponentResolver(SCRATCHPAD_SCHEME, (resource, results) => {
      results.push({ type: EditorOpenType.component, componentId: 'scratchpad-editor' });
    });
  }

  registerEditorDocumentModelContentProvider(registry: IEditorDocumentModelContentRegistry) {
    registry.registerEditorDocumentModelContentProvider(this.docProvider);
  }

  registerCommands(registry: CommandRegistry) {
    registry.registerCommand(
      { id: SCRATCHPAD_NEW_CMD, label: '新建草稿纸' },
      {
        execute: async () => {
          const entry = await this.scratchService.create();
          await this.editorService.open(new URI(`${SCRATCHPAD_SCHEME}://${entry.id}`), { preview: false });
        },
      },
    );
    registry.registerCommand(
      { id: SCRATCHPAD_OPEN_CMD, label: '打开草稿' },
      {
        execute: async (id?: string) => {
          if (!id) return;
          await this.scratchService.ensure(id);
          await this.editorService.open(new URI(`${SCRATCHPAD_SCHEME}://${id}`), { preview: false });
        },
      },
    );
  }
}
