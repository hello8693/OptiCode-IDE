import { Autowired } from '@opensumi/di';
import { Domain } from '@opensumi/ide-core-common/lib/di-helper';
import { ServerAppContribution } from '@opensumi/ide-core-node';
import { CompetitiveCompanionServer } from './competitive-companion.server';

@Domain(ServerAppContribution)
export class CompetitiveCompanionContribution implements ServerAppContribution {
  @Autowired(CompetitiveCompanionServer)
  private readonly server: CompetitiveCompanionServer;

  onStart(): void {
    this.server.start();
  }

  onStop(): void {
    this.server.stop();
  }
}
