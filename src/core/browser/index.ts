import { BrowserModule, createElectronMainApi, IElectronNativeDialogService } from '@opensumi/ide-core-browser';
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
import { IStorageService, IAppMenuService, IThemeService, ISampleDataService, IProblemService, IJudgeService, IProblemAssetService } from '../common';
import { HeaderContribution, ELECTRON_HEADER } from './header/header.contribution'
import { WelcomeContribution } from './welcome/welcome.contribution'
import { CppStatusContribution } from './cpp/status.contribution'
import { CompileRunContribution } from './compile-run/contribution'
import { ProblemListContribution } from './problem-list/contribution'
import { SampleDataService } from './sample-data.service'
import { ProblemService } from './services/problem.service'
import { ProblemAssetService } from './services/problem-asset.service'
import { CppPreferenceContribution } from './cpp/preference.contribution'
import { JudgeService } from './services/judge.service'
import { ClangdConfigService } from './services/clangd-config.service'

export { ELECTRON_HEADER }

@Injectable()
export class CoreBrowserModule extends BrowserModule {
  providers = [
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
    WelcomeContribution,
    HeaderContribution,
    ProjectSwitcherContribution,
    LocalMenuContribution,
    LocalThemeContribution,
    CppPreferenceContribution,
    CppStatusContribution,
    CompileRunContribution,
    ProblemListContribution,
    ClangdConfigService,
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
    ...patchProviders,
  ];
}
