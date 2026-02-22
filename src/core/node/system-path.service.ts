import { Injectable } from '@opensumi/di';
import os from 'os';
import path from 'path';

import {
  ISystemPathService,
  ScratchpadBuildPaths,
  ScratchpadFilePaths,
  SCRATCHPAD_BUILD_SUBDIR,
  SCRATCHPAD_EXT,
  SCRATCHPAD_SUBDIR,
  SCRATCHPAD_TMP_SUBDIR,
} from '../common';

@Injectable()
export class SystemPathService implements ISystemPathService {
  async getPlatform(): Promise<string> {
    return process.platform;
  }

  async getScratchpadFilePath(id: string, workspaceRoot?: string): Promise<ScratchpadFilePaths> {
    const baseDir = workspaceRoot
      ? path.join(workspaceRoot, SCRATCHPAD_SUBDIR)
      : path.join(os.tmpdir(), SCRATCHPAD_TMP_SUBDIR);
    const filePath = path.join(baseDir, `${id}${SCRATCHPAD_EXT}`);
    return {
      filePath,
      dirPath: path.dirname(filePath),
    };
  }

  async getScratchpadBuildPaths(id: string): Promise<ScratchpadBuildPaths> {
    const workDir = path.join(os.tmpdir(), SCRATCHPAD_BUILD_SUBDIR, id);
    const sourcePath = path.join(workDir, 'main.cpp');
    const execName = process.platform === 'win32' ? 'main.exe' : 'main';
    const execPath = path.join(workDir, execName);
    return { workDir, sourcePath, execPath };
  }
}
