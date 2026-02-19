import { NodeModule } from '@opensumi/ide-core-node';
import { Injectable, Provider } from '@opensumi/di';
import { CompetitiveCompanionContribution } from './competitive-companion';
import { CompetitiveCompanionServer } from './competitive-companion/competitive-companion.server';
import { CompetitiveCompanionService } from './competitive-companion/competitive-companion.service';

@Injectable()
export class CoreNodeModule extends NodeModule {
  providers: Provider[] = [
    CompetitiveCompanionContribution,
    CompetitiveCompanionServer,
    CompetitiveCompanionService,
  ];
}
