import '@/core/common/asar'
import { extProcessInit } from '@opensumi/ide-extension/lib/hosted/ext.process-base.js';
import { Injector } from '@opensumi/di';
import { LogServiceManager } from '@/logger/node/log-manager';
import { LogServiceManager as LogServiceManagerToken } from '@opensumi/ide-logs/lib/node/log-manager';
import Module from 'node:module';

const injector = new Injector()
injector.addProviders(
  {
    token: LogServiceManagerToken,
    useClass: LogServiceManager
  },
)

// 防御性补丁：部分扩展会访问 vscode.CodeActionKind.Empty
// 在极端情况下 CodeActionKind 可能缺失，导致扩展激活报错。
const originalLoad = Module._load
// @ts-expect-error Node.js internal hook
Module._load = function (request: string, parent: NodeModule | null, isMain: boolean) {
  // @ts-expect-error Node.js internal hook
  const loaded = originalLoad.call(this, request, parent, isMain)
  if (request === 'vscode' && loaded && !loaded.CodeActionKind) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { CodeActionKind } = require('@opensumi/ide-extension/lib/common/vscode/ext-types')
      loaded.CodeActionKind = CodeActionKind
    } catch {
      // ignore
    }
  }
  return loaded
}

extProcessInit({
  injector,
})
