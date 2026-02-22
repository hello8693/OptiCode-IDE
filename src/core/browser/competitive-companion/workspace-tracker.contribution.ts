import { Autowired, Injectable } from '@opensumi/di';
import { ClientAppContribution, Domain, URI } from '@opensumi/ide-core-browser';
import { IWorkspaceService } from '@opensumi/ide-workspace/lib/common';

import { IStorageService } from '../../common';
import { COMPETITIVE_COMPANION_LAST_WORKSPACE_KEY } from '../../common/competitive-companion';

@Domain(ClientAppContribution)
@Injectable()
export class CompetitiveCompanionWorkspaceTracker implements ClientAppContribution {
  @Autowired(IWorkspaceService)
  private readonly workspaceService: IWorkspaceService;

  @Autowired(IStorageService)
  private readonly storage: IStorageService;

  async onStart(): Promise<void> {
    const update = async () => {
      const roots = await this.workspaceService.roots;
      if (!roots.length) return;
      const fsPath = new URI(roots[0].uri).codeUri.fsPath;
      if (fsPath) {
        this.storage.setItem(COMPETITIVE_COMPANION_LAST_WORKSPACE_KEY, fsPath);
      }
    };

    await update();
    this.workspaceService.onWorkspaceChanged(() => {
      void update();
    });
    window.addEventListener('focus', () => {
      void update();
    });
  }
}
