import { Injectable } from '@opensumi/di';
import { Emitter, Event } from '@opensumi/ide-core-browser';

import {
  CompetitiveCompanionImportEvent,
  ICompetitiveCompanionImportClient,
} from '../../common/competitive-companion';

@Injectable()
export class CompetitiveCompanionImportClient implements ICompetitiveCompanionImportClient {
  private readonly onDidImportEmitter = new Emitter<CompetitiveCompanionImportEvent>();
  readonly onDidImportEvent: Event<CompetitiveCompanionImportEvent> = this.onDidImportEmitter.event;

  onDidImport(event: CompetitiveCompanionImportEvent): void {
    this.onDidImportEmitter.fire(event);
  }
}
