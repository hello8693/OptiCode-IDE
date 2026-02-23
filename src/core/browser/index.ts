import { BrowserModule, createElectronMainApi, IElectronNativeDialogService, electronEnv } from '@opensumi/ide-core-browser';
import { Injectable } from '@opensumi/di';
import { ElectronBasicContribution } from '@opensumi/ide-electron-basic/lib/browser'
import { ElectronNativeDialogService } from '@opensumi/ide-electron-basic/lib/browser/dialog'
import { ElectronHeaderService } from '@opensumi/ide-electron-basic/lib/browser/header/header.service'
import { ElectronPreferenceContribution } from '@opensumi/ide-electron-basic/lib/browser/electron-preference.contribution'
import { IElectronHeaderService } from '@opensumi/ide-electron-basic/lib/common/header'

import { ProjectSwitcherContribution } from './project.contribution';
import { LocalMenuContribution } from './menu.contribution';
import { LocalThemeContribution } from './theme.contribution';
import { patchProviders } from './patch'
import { IStorageService, IAppMenuService, IAppWindowService, IThemeService, ISampleDataService, IProblemService, IJudgeService, IProblemAssetService, SystemPathServicePath, CompetitiveCompanionBridgePath, ICompetitiveCompanionImportClient } from '../common';
import { HeaderContribution, ELECTRON_HEADER } from './header/header.contribution'
import { WelcomeContribution } from './welcome/welcome.contribution'
import { CppStatusContribution } from './cpp/status.contribution'
import { CompileRunContribution } from './compile-run/contribution'
import { ProblemListContribution } from './problem-list/contribution'
import { ProblemCommandContribution } from './problem-list/commands.contribution'
import { SampleTestContribution } from './sample-test/contribution'
import { SampleDataService } from './sample-data.service'
import { ProblemService } from './services/problem.service'
import { ProblemAssetService } from './services/problem-asset.service'
import { CppPreferenceContribution } from './cpp/preference.contribution'
import { JudgeService } from './services/judge.service'
import { ClangdConfigService } from './services/clangd-config.service'
import { CompetitiveCompanionWorkspaceTracker } from './competitive-companion/workspace-tracker.contribution'
import { CompetitiveCompanionSettingsContribution } from './competitive-companion/settings.contribution'
import { CompetitiveCompanionAutoOpenContribution } from './competitive-companion/auto-open.contribution'
import { CompetitiveCompanionImportClient } from './competitive-companion/import-client.service'
import { ProblemWorkspaceStateService } from './services/problem-workspace-state.service'
import { ScratchpadContribution } from './scratchpad/contribution'
import { ScratchpadAutoSaveContribution } from './scratchpad/autosave.contribution'
import { ScratchpadService } from './scratchpad/scratchpad.service'
import { ScratchpadDocumentProvider } from './scratchpad/document-provider'
import { WebStorageService } from './services/web-storage.service';
import { WebAppMenuService, WebAppWindowService, WebThemeService } from './services/web-noop.service';
import { ProblemMetaContribution } from './problem-meta/contribution'

export { ELECTRON_HEADER }

const isElectronRuntime =
  electronEnv.isElectronRenderer === true && typeof (globalThis as any).ElectronIpcRenderer !== 'undefined';

@Injectable()
export class CoreBrowserModule extends BrowserModule {
  providers = [
    ...(isElectronRuntime ? [
      {
        token: IElectronNativeDialogService,
        useClass: ElectronNativeDialogService,
      },
      {
        token: IElectronHeaderService,
        useClass: ElectronHeaderService,
      },
      ElectronBasicContribution,
      ElectronPreferenceContribution,
      HeaderContribution,
      ProjectSwitcherContribution,
      LocalMenuContribution,
      LocalThemeContribution,
      {
        token: IStorageService,
        useValue: createElectronMainApi(IStorageService),
      },
      {
        token: IThemeService,
        useValue: createElectronMainApi(IThemeService),
      },
      {
        token: IAppMenuService,
        useValue: createElectronMainApi(IAppMenuService),
      },
      {
        token: IAppWindowService,
        useValue: createElectronMainApi(IAppWindowService),
      },
    ] : [
      {
        token: IStorageService,
        useClass: WebStorageService,
      },
      {
        token: IThemeService,
        useClass: WebThemeService,
      },
      {
        token: IAppMenuService,
        useClass: WebAppMenuService,
      },
      {
        token: IAppWindowService,
        useClass: WebAppWindowService,
      },
    ]),
    WelcomeContribution,
    CppPreferenceContribution,
    CppStatusContribution,
    CompileRunContribution,
    ProblemListContribution,
    ProblemCommandContribution,
    SampleTestContribution,
    ProblemMetaContribution,
    ScratchpadContribution,
    ScratchpadAutoSaveContribution,
    ScratchpadService,
    ScratchpadDocumentProvider,
    ClangdConfigService,
    CompetitiveCompanionWorkspaceTracker,
    CompetitiveCompanionSettingsContribution,
    CompetitiveCompanionAutoOpenContribution,
    ProblemWorkspaceStateService,
    {
      token: ICompetitiveCompanionImportClient,
      useClass: CompetitiveCompanionImportClient,
    },
    {
      token: IJudgeService,
      useClass: JudgeService,
    },
    {
      token: ISampleDataService,
      useClass: SampleDataService,
    },
    {
      token: IProblemService,
      useClass: ProblemService,
    },
    {
      token: IProblemAssetService,
      useClass: ProblemAssetService,
    },
    ...patchProviders,
  ];

  backServices = [
    {
      servicePath: SystemPathServicePath,
    },
    {
      servicePath: CompetitiveCompanionBridgePath,
      clientToken: ICompetitiveCompanionImportClient,
    },
  ];
}
