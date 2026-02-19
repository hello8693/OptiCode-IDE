import { Autowired, Provider, Injectable } from '@opensumi/di'
import { Domain, Schemes, URI } from '@opensumi/ide-core-common'
import { AppConfig, WorkspaceScope } from '@opensumi/ide-core-browser'
import { IMenuRegistry, MenuId, MenuContribution, IMenuItem } from "@opensumi/ide-core-browser/lib/menu/next";
import { FILE_COMMANDS, ClientAppContribution, formatLocalize, StaticResourceContribution, StaticResourceService, electronEnv } from '@opensumi/ide-core-browser'
import { IViewsRegistry } from '@opensumi/ide-main-layout';
import { RESOURCE_VIEW_ID } from '@opensumi/ide-file-tree-next'
import { IPreferenceSettingsService } from '@opensumi/ide-core-browser/lib/preferences';
import { PreferenceSettingsService } from '@opensumi/ide-preferences/lib/browser/preference-settings.service'
import { VSXExtensionService } from '@opensumi/ide-extension-manager/lib/browser/vsx-extension.service';
import { AbstractExtInstanceManagementService } from '@opensumi/ide-extension/lib/browser/types';
import { VSXExtensionServiceToken } from '@opensumi/ide-extension-manager/lib/common';
import { transaction } from '@opensumi/ide-monaco/lib/common/observable';

@Domain(ClientAppContribution, MenuContribution, StaticResourceContribution)
export class PatchContribution implements MenuContribution, ClientAppContribution, StaticResourceContribution {
  @Autowired(IViewsRegistry)
  private viewsRegistry: IViewsRegistry;

  async onStart() {
    const viewContents = this.viewsRegistry.getViewWelcomeContent(RESOURCE_VIEW_ID);
    const openFolderContent = viewContents.find(item => item.content.includes(`(command:${FILE_COMMANDS.OPEN_FOLDER.id})`))
    if (openFolderContent) {
      Object.assign(openFolderContent, {
        content: formatLocalize('welcome-view.noFolderHelp', `${FILE_COMMANDS.OPEN_FOLDER.id}?{"newWindow":false}`)
      })
    }
  }

  registerMenus(menuRegistry: IMenuRegistry) {
    const openFolderMenu = menuRegistry.getMenuItems(MenuId.MenubarFileMenu).find(item => {
      return 'command' in item && item.command === FILE_COMMANDS.OPEN_FOLDER.id;
    }) as IMenuItem
    if (openFolderMenu) {
      openFolderMenu.extraTailArgs = [{ newWindow: false }]
    }
  }

  registerStaticResolver(service: StaticResourceService): void {
    service.registerStaticResourceProvider({
      scheme: Schemes.monaco,
      resolveStaticResource: (uri) => {
        const path = uri.codeUri.path;

        switch (path) {
          case 'worker': {
            const query = uri.query;
            if (query) {
              const { moduleId } = JSON.parse(query);
              if (moduleId === 'workerMain.js') {
                return URI.file(electronEnv.monacoWorkerPath);
              }
            }
            break;
          }
        }

        return uri;
      },
    });
  }
}

export class PatchPreferenceSettingsService extends PreferenceSettingsService {
  @Autowired(AppConfig)
  appConfig: AppConfig

  constructor() {
    super()
    if (!this.appConfig.workspaceDir) {
      this.tabList = this.tabList.filter(item => item !== WorkspaceScope);
    }
    this._currentScope = this.tabList[0]
  }
}

@Injectable()
export class PatchVSXExtensionService extends VSXExtensionService {
  @Autowired(AbstractExtInstanceManagementService)
  protected readonly _extensionInstanceService: AbstractExtInstanceManagementService;

  private isHiddenExtensionId(extensionId?: string, name?: string, publisher?: string) {
    const extId = extensionId?.toLowerCase() || '';
    const extName = name?.toLowerCase() || '';
    const extPublisher = publisher?.toLowerCase() || '';
    return extId.startsWith('opticode.') || extId.startsWith('vscode.') ||
      extName.startsWith('opticode.') || extName.startsWith('vscode.') ||
      extPublisher === 'opticode' || extPublisher === 'vscode';
  }

  getInstalledExtensions() {
    // 隐藏 opticode 相关插件
    const installedExtensions = this._extensionInstanceService.getExtensionInstances()
      .filter((e) => {
        return !this.isHiddenExtensionId(e.extensionId, e.packageJSON.name, e.packageJSON.publisher);
      })
      .map((e) => {
        const extensionId = e.extensionId;
        const namespace = extensionId && extensionId.includes('.') ? extensionId.split('.')[0] : e.packageJSON.publisher;

        return {
          namespace,
          name: e.packageJSON.name,
          extensionId: e.extensionId,
          version: e.packageJSON.version,
          displayName: e.packageJSON.displayName,
          description: e.packageJSON.description,
          publisher: e.packageJSON.publisher,
          iconUrl: e.packageJSON.icon && e.extensionLocation.toString() + `/${e.packageJSON.icon}`,
          path: e.path,
          realpath: e.realPath,
        };
      });
      
    transaction((tx) => {
       // @ts-ignore
      this.installedExtensionsObservable.set(installedExtensions, tx);
    });
  }

  async search(keyword: string) {
    await super.search(keyword);
    transaction((tx) => {
      this.extensionsObservable.set(
        this.extensions.filter((ext) => !this.isHiddenExtensionId(this.getExtensionId(ext), ext.name, ext.publisher)),
        tx,
      );
    });
  }
}

export const patchProviders: Provider[] = [
  PatchContribution,
  {
    token: IPreferenceSettingsService,
    useClass: PatchPreferenceSettingsService,
    override: true,
  },
  {
    token: VSXExtensionServiceToken,
    useClass: PatchVSXExtensionService,
    override: true,
  }
]
