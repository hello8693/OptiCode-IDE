import { Autowired, Injectable } from '@opensumi/di';
import { URI } from '@opensumi/ide-core-browser';
import { IFileServiceClient } from '@opensumi/ide-file-service';

import { FileItem, IProblemAssetService, ProblemAssets } from '../../common/problem-assets';
import { IProblem } from '../../common/problem';

@Injectable()
export class ProblemAssetService implements IProblemAssetService {
  @Autowired(IFileServiceClient)
  private readonly fileService: IFileServiceClient;

  private toUri(fsPath: string) {
    return URI.file(fsPath).toString();
  }

  private async safeListDir(dirPath: string): Promise<FileItem[]> {
    const uri = this.toUri(dirPath);
    try {
      const stat = await this.fileService.getFileStat(uri, true);
      if (!stat?.children) return [];
      return stat.children.map(child => {
        const name = new URI(child.uri).displayName;
        return {
          name,
          path: new URI(child.uri).codeUri.fsPath,
          isDirectory: !!child.isDirectory,
        } as FileItem;
      });
    } catch {
      return [];
    }
  }

  private async ensureDir(dirPath: string) {
    const uri = this.toUri(dirPath);
    try {
      const stat = await this.fileService.getFileStat(uri);
      if (!stat) await this.fileService.createFolder(uri);
    } catch {
      await this.fileService.createFolder(uri);
    }
  }

  private async ensureFile(filePath: string, content: string) {
    const uri = this.toUri(filePath);
    const stat = await this.fileService.getFileStat(uri);
    if (stat) return;
    await this.fileService.createFile(uri, { content });
  }

  private nextSampleIndex(files: FileItem[]): number {
    const indices = files
      .map(item => item.name.match(/^sample-(\d+)\.in$/))
      .filter(Boolean)
      .map(match => parseInt(match![1], 10));
    return indices.length ? Math.max(...indices) + 1 : 1;
  }

  async listAssets(problem: IProblem): Promise<ProblemAssets> {
    const samples = await this.safeListDir(problem.samplesDir);
    const solutions = await this.safeListDir(problem.solutionsDir);
    const rootChildren = await this.safeListDir(problem.rootDir);
    const reserved = new Set([
      `${problem.meta.id}.cpp`,
      'meta.json',
      'bin',
      'samples',
      'solutions',
    ]);
    const others = rootChildren.filter(
      item => !reserved.has(item.name) && !item.name.startsWith('.'),
    );
    return {
      source: [{ name: `${problem.meta.id}.cpp`, path: problem.sourcePath, isDirectory: false }],
      samples,
      solutions,
      others,
    };
  }

  async listAssetsForProblems(problems: IProblem[]): Promise<Record<string, ProblemAssets>> {
    const entries = await Promise.all(
      problems.map(async problem => [problem.meta.id, await this.listAssets(problem)] as const),
    );
    return Object.fromEntries(entries);
  }

  async createSolution(problem: IProblem): Promise<string> {
    await this.ensureDir(problem.solutionsDir);
    const solutionPath = `${problem.solutionsDir}/README.md`;
    await this.ensureFile(solutionPath, `# ${problem.meta.id} 题解\n\n`);
    return solutionPath;
  }

  async createSample(problem: IProblem): Promise<{ inPath: string; outPath: string }> {
    await this.ensureDir(problem.samplesDir);
    try {
      const samplesUri = this.toUri(problem.samplesPath);
      const stat = await this.fileService.getFileStat(samplesUri);
      if (!stat) {
        const content = JSON.stringify({ samples: [] }, null, 2) + '\n';
        await this.fileService.createFile(samplesUri, { content });
      }
    } catch {
      // ignore
    }
    const current = await this.safeListDir(problem.samplesDir);
    const nextIndex = this.nextSampleIndex(current);
    const inPath = `${problem.samplesDir}/sample-${nextIndex}.in`;
    const outPath = `${problem.samplesDir}/sample-${nextIndex}.out`;
    await this.ensureFile(inPath, '');
    await this.ensureFile(outPath, '');
    return { inPath, outPath };
  }
}
