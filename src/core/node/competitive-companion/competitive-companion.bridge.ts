import { Injectable } from '@opensumi/di';
import { RPCService } from '@opensumi/ide-connection';

import {
  CompetitiveCompanionImportEvent,
  ICompetitiveCompanionBridge,
  ICompetitiveCompanionImportClient,
} from '@/core/common/competitive-companion';

@Injectable()
export class CompetitiveCompanionBridgeService
  extends RPCService<ICompetitiveCompanionImportClient>
  implements ICompetitiveCompanionBridge
{
  private pendingEvent: CompetitiveCompanionImportEvent | undefined;

  async reportImport(event: CompetitiveCompanionImportEvent): Promise<void> {
    this.pendingEvent = event;
    this.client?.onDidImport(event);
  }

  async getPendingImport(): Promise<CompetitiveCompanionImportEvent | undefined> {
    return this.pendingEvent;
  }

  async clearPendingImport(eventId: string): Promise<void> {
    if (this.pendingEvent?.eventId === eventId) {
      this.pendingEvent = undefined;
    }
  }
}
