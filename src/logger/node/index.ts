import { Injectable, Provider } from '@opensumi/di';
import { NodeModule } from '@opensumi/ide-core-node';
import { ILogServiceManager, SupportLogNamespace } from '@opensumi/ide-logs';
import { LogServiceManager } from './log-manager'
import { ILogService } from '../common';

@Injectable()
export class LoggerModule extends NodeModule {
  providers: Provider[] = [
    {
      token: ILogServiceManager,
      useClass: LogServiceManager,
      override: true,
    },
    {
      token: ILogService,
      useFactory: (injector) => injector.get(ILogServiceManager).getLogger(SupportLogNamespace.Node),
    },
  ];
}
