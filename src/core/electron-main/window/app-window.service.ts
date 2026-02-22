import { Autowired, Injectable } from '@opensumi/di';
import {
  ElectronMainApiProvider,
} from '@opensumi/ide-core-electron-main/lib/bootstrap/types';

import { IAppWindowService } from '../../common';
import { WindowsManager } from './windows-manager';

@Injectable()
export class AppWindowService extends ElectronMainApiProvider implements IAppWindowService {
  @Autowired(WindowsManager)
  private readonly windowsManager: WindowsManager;

  openNewWindow(): void {
    this.windowsManager.createCodeWindow();
  }
}
