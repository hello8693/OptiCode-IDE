import { Autowired } from '@opensumi/di';
import { Domain } from '@opensumi/ide-core-common';
import {
  ElectronMainApiRegistry,
  ElectronMainContribution,
} from '@opensumi/ide-core-electron-main/lib/bootstrap/types';

import { IAppWindowService } from '../../common';
import { AppWindowService } from './app-window.service';

@Domain(ElectronMainContribution)
export class AppWindowContribution implements ElectronMainContribution {
  @Autowired(AppWindowService)
  private readonly appWindowService: AppWindowService;

  registerMainApi(registry: ElectronMainApiRegistry): void {
    registry.registerMainApi(IAppWindowService, this.appWindowService);
  }
}
