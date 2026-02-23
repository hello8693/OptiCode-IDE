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

import { CompetitiveCompanionSettingsEditor } from './settings.editor';

export const OPEN_COMPETITIVE_COMPANION_SETTINGS_CMD = 'competitiveCompanion.openSettings';
export const COMPETITIVE_COMPANION_SETTINGS_SCHEME = 'competitive-companion-settings';
export const COMPETITIVE_COMPANION_SETTINGS_URI = `${COMPETITIVE_COMPANION_SETTINGS_SCHEME}://panel`;

@Domain(CommandContribution, BrowserEditorContribution)
@Injectable()
export class CompetitiveCompanionSettingsContribution
  implements CommandContribution, BrowserEditorContribution
{
  @Autowired(WorkbenchEditorService)
  private readonly editorService: WorkbenchEditorService;

  registerEditorComponent(registry: EditorComponentRegistry) {
    registry.registerEditorComponent({
      uid: 'competitive-companion-settings',
      scheme: COMPETITIVE_COMPANION_SETTINGS_SCHEME,
      component: CompetitiveCompanionSettingsEditor,
      renderMode: EditorComponentRenderMode.ONE_PER_WORKBENCH,
    });

    registry.registerEditorComponentResolver(COMPETITIVE_COMPANION_SETTINGS_SCHEME, (resource, results) => {
      results.push({ type: EditorOpenType.component, componentId: 'competitive-companion-settings' });
    });
  }

  registerResource(service: ResourceService) {
    service.registerResourceProvider({
      scheme: COMPETITIVE_COMPANION_SETTINGS_SCHEME,
      provideResource: async (uri: URI): Promise<IResource> => ({
        uri,
        name: localize('competitive.companion.settings.title', 'Competitive Companion 设置'),
        icon: getIcon('setting'),
      }),
    });
  }

  registerCommands(registry: CommandRegistry) {
    registry.registerCommand(
      { id: OPEN_COMPETITIVE_COMPANION_SETTINGS_CMD, label: 'Competitive Companion 设置' },
      { execute: () => this.openCompetitiveCompanionSettings() },
    );
  }

  private async openCompetitiveCompanionSettings(): Promise<void> {
    await this.editorService.open(new URI(COMPETITIVE_COMPANION_SETTINGS_URI), { preview: false });
  }
}
