import { Autowired, Injectable } from '@opensumi/di';
import { ElectronMainApiProvider } from '@opensumi/ide-core-electron-main/lib/bootstrap/types';

import { IAppWindowService } from '../../common';
import { WindowsManager } from './windows-manager';
import { SplashWindow } from './splash-window';

@Injectable()
export class AppWindowService extends ElectronMainApiProvider implements IAppWindowService {
  @Autowired(WindowsManager)
  private readonly windowsManager: WindowsManager;

  @Autowired(SplashWindow)
  private readonly splashWindow: SplashWindow;

  openNewWindow(): void {
    this.windowsManager.createCodeWindow();
  }

  openSplashDebug(): void {
    this.splashWindow.show({ hold: true });
  }
}
