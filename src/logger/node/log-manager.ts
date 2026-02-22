import * as path from 'path'
import * as os from 'node:os'
import { Injectable } from '@opensumi/di';
import { AbstractLogServiceManager } from '../common'
import * as process from "node:process";

@Injectable()
export class LogServiceManager extends AbstractLogServiceManager {
  getRootLogFolder(): string {
    return process.env.IDE_LOG_ROOT || path.join(os.homedir(), '.sumi', 'logs');
  }

  getLogFolder(): string {
    const rawLogHome = process.env.IDE_LOG_HOME;
    const logHome = rawLogHome && rawLogHome !== 'undefined' ? rawLogHome : this.getRootLogFolder();
    const rawClientId = process.env.CODE_WINDOW_CLIENT_ID;
    const prefix = 'CODE_WINDOW_CLIENT_ID:';
    let windowId = rawClientId && rawClientId.startsWith(prefix) ? rawClientId.slice(prefix.length) : rawClientId;
    if (!windowId || windowId === 'undefined') {
      windowId = 'web';
    }
    return path.join(logHome, `window${windowId}`)
  }
}
