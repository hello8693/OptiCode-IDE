import { NodeModule } from '@opensumi/ide-core-node';
import { Injectable, Provider } from '@opensumi/di';
import { CompetitiveCompanionContribution } from './competitive-companion';
import { CompetitiveCompanionServer } from './competitive-companion/competitive-companion.server';
import { CompetitiveCompanionService } from './competitive-companion/competitive-companion.service';
import { CompetitiveCompanionBridgeService } from './competitive-companion/competitive-companion.bridge';
import { SystemPathService } from './system-path.service';
import {
  ICompetitiveCompanionBridge,
  CompetitiveCompanionBridgePath,
  ISystemPathService,
  SystemPathServicePath,
} from '../common';

@Injectable()
export class CoreNodeModule extends NodeModule {
  providers: Provider[] = [
    CompetitiveCompanionContribution,
    CompetitiveCompanionServer,
    CompetitiveCompanionService,
    {
      token: ICompetitiveCompanionBridge,
      useClass: CompetitiveCompanionBridgeService,
    },
    {
      token: ISystemPathService,
      useClass: SystemPathService,
    },
  ];

  backServices = [
    {
      servicePath: SystemPathServicePath,
      token: ISystemPathService,
    },
    {
      servicePath: CompetitiveCompanionBridgePath,
      token: ICompetitiveCompanionBridge,
    },
  ];
}
