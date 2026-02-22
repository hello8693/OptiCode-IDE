import { Injectable, Autowired } from '@opensumi/di';
import { ClientAppContribution, CommandContribution, CommandRegistry, Domain, FILE_COMMANDS, IWindowService } from '@opensumi/ide-core-browser';
import { IWindowDialogService } from '@opensumi/ide-overlay';
import { IDisposable } from '@opensumi/ide-core-common';

@Injectable()
@Domain(CommandContribution, ClientAppContribution)
export class CoreCommandContribution implements CommandContribution, ClientAppContribution {
  @Autowired(IWindowDialogService)
  private window: IWindowDialogService;

  @Autowired(IWindowService)
  private windowService: IWindowService;

  @Autowired(CommandRegistry)
  private commandRegistry: CommandRegistry;

  private openFolderHandler?: IDisposable;

  registerCommands(commands: CommandRegistry) {
    this.registerOpenFolderHandler(commands);
  }

  onStart() {
    this.registerOpenFolderHandler(this.commandRegistry);
  }

  private registerOpenFolderHandler(commands: CommandRegistry) {
    if (this.openFolderHandler) {
      this.openFolderHandler.dispose();
    }
    this.openFolderHandler = commands.registerHandler(FILE_COMMANDS.OPEN_FOLDER.id, {
      execute: async (options?: { newWindow?: boolean }) => {
        const newWorkspace = await this.window.showOpenDialog({
          canSelectFolders: true,
          canSelectMany: false,
        });
        if (newWorkspace && newWorkspace.length > 0) {
          this.windowService.openWorkspace(newWorkspace[0], { newWindow: options?.newWindow ?? false });
        }
      },
    });
  }
}
