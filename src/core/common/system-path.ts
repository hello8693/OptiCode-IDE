export const SystemPathServicePath = 'SystemPathServicePath';
export const ISystemPathService = Symbol('ISystemPathService');

export interface ScratchpadFilePaths {
  filePath: string;
  dirPath: string;
}

export interface ScratchpadBuildPaths {
  workDir: string;
  sourcePath: string;
  execPath: string;
}

export interface ISystemPathService {
  getPlatform(): Promise<string>;
  getScratchpadFilePath(id: string, workspaceRoot?: string): Promise<ScratchpadFilePaths>;
  getScratchpadBuildPaths(id: string): Promise<ScratchpadBuildPaths>;
}
