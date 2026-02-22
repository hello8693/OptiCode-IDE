import { Injectable } from '@opensumi/di';

import { IAppMenuService, IAppWindowService, IThemeService, ThemeData } from '../../common/types';

@Injectable()
export class WebThemeService implements IThemeService {
  setTheme(_windowId: number, _themeData: ThemeData): void {
    // no-op for web
  }
}

@Injectable()
export class WebAppMenuService implements IAppMenuService {
  async renderRecentWorkspaces(_workspaces: string[]): Promise<void> {
    // no-op for web
  }
}

@Injectable()
export class WebAppWindowService implements IAppWindowService {
  openNewWindow(): void {
    // no-op for web
  }
}
