import { Autowired } from '@opensumi/di';
import {
  CommandContribution,
  CommandRegistry,
  Domain,
  MaybePromise,
} from '@opensumi/ide-core-common';
import { ClientAppContribution, electronEnv } from '@opensumi/ide-core-browser';
import {
  AbstractMenubarService,
  IMenuRegistry,
  MenuId,
  MenuContribution,
} from '@opensumi/ide-core-browser/lib/menu/next';
import { localize } from '@opensumi/ide-core-common/lib/localize';
import { IWorkspaceService } from '@opensumi/ide-workspace';
import { IAppMenuService, IAppWindowService } from '../common';
import { IElectronMainUIService } from '@opensumi/ide-core-common/lib/electron';
import { SCRATCHPAD_NEW_CMD } from './scratchpad/contribution';

const OPEN_LOGO_DIR_COMMAND_ID = {
  id: 'opticode-ide.openLogDir',
  label: localize('opticode-ide.openLogDir'),
};

const NEW_WINDOW_CMD = {
  id: 'opticode-ide.newWindow',
  label: localize('common.newWindow'),
};

const DEBUG_SPLASH_CMD = {
  id: 'opticode-ide.debugSplash',
  label: localize('opticode-ide.debugSplash', 'Debug Splash'),
};

@Domain(ClientAppContribution, MenuContribution, CommandContribution)
export class LocalMenuContribution implements MenuContribution, ClientAppContribution {
  @Autowired(IWorkspaceService)
  workspaceService: IWorkspaceService;

  @Autowired(IAppMenuService)
  menuService: IAppMenuService;

  @Autowired(IAppWindowService)
  appWindowService: IAppWindowService;

  @Autowired(AbstractMenubarService)
  private menubarService: AbstractMenubarService;

  @Autowired(IElectronMainUIService)
  private electronMainUIService: IElectronMainUIService;

  initialize(): MaybePromise<void> {
    // this.renderAppMenu();
  }

  onStart(): void {
    // 强制刷新一次 native menubar，避免 macOS 菜单栏遗漏新增菜单项
    setTimeout(() => {
      this.menubarService.rebuildMenuNodes(MenuId.MenubarFileMenu);
    }, 0);
  }

  async renderAppMenu() {
    const workspaces = await this.workspaceService.getMostRecentlyUsedWorkspaces();
    await this.menuService.renderRecentWorkspaces(workspaces);
  }

  registerCommands(registry: CommandRegistry) {
    registry.registerCommand(OPEN_LOGO_DIR_COMMAND_ID, {
      execute: () => {
        if (!electronEnv.isElectronRenderer) return;
        const logRoot = electronEnv.metadata?.environment?.logRoot;
        if (!logRoot) return;
        this.electronMainUIService.revealInFinder(logRoot);
      },
    });

    registry.registerCommand(NEW_WINDOW_CMD, {
      execute: () => {
        if (!electronEnv.isElectronRenderer) return;
        this.appWindowService.openNewWindow();
      },
    });

    registry.registerCommand(DEBUG_SPLASH_CMD, {
      execute: () => {
        if (!electronEnv.isElectronRenderer) return;
        this.appWindowService.openSplashDebug();
      },
    });
  }

  registerMenus(menuRegistry: IMenuRegistry) {
    if (electronEnv.isElectronRenderer) {
      menuRegistry.registerMenuItem(MenuId.MenubarFileMenu, {
        command: NEW_WINDOW_CMD,
        group: '1_new',
      });
    }

    menuRegistry.registerMenuItem(MenuId.MenubarFileMenu, {
      command: {
        id: SCRATCHPAD_NEW_CMD,
        label: localize('scratchpad.new', '新建草稿纸'),
      },
      group: '2_new',
    });

    menuRegistry.registerMenuItem(MenuId.MenubarAppMenu, {
      submenu: MenuId.SettingsIconMenu,
      label: localize('common.preferences'),
      group: '2_preference',
    });

    menuRegistry.registerMenuItem(MenuId.MenubarHelpMenu, {
      command: OPEN_LOGO_DIR_COMMAND_ID,
    });
  }
}
