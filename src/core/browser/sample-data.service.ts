/**
 * 浏览器端样例数据服务实现
 *
 * 数据持久化路径：<workspace>/.opticode/samples/<fileName>.json
 * 文件名映射：a.cpp → a_cpp.json（点号替换为下划线）
 */
import { Autowired, Injectable } from '@opensumi/di';
import { URI } from '@opensumi/ide-core-browser';
import { IFileServiceClient } from '@opensumi/ide-file-service';
import { IWorkspaceService } from '@opensumi/ide-workspace/lib/common';

import { ISampleDataService, ISampleGroup, ISampleCase } from '../common/sample-data';

@Injectable()
export class SampleDataService implements ISampleDataService {
  @Autowired(IFileServiceClient)
  private readonly fileService: IFileServiceClient;

  @Autowired(IWorkspaceService)
  private readonly workspaceService: IWorkspaceService;

  /* ── helpers ── */
  private async rootPath(): Promise<string | undefined> {
    const roots = await this.workspaceService.roots;
    if (!roots.length) return undefined;
    return new URI(roots[0].uri).codeUri.fsPath;
  }

  private jsonFileName(fileRelPath: string): string {
    return fileRelPath.replace(/[\/\\]/g, '_').replace(/\./g, '_') + '.json';
  }

  private async jsonUri(fileRelPath: string): Promise<string | undefined> {
    const root = await this.rootPath();
    if (!root) return undefined;
    return new URI(`file://${root}/.opticode/samples/${this.jsonFileName(fileRelPath)}`).toString();
  }

  /* ── public API ── */
  async load(fileRelPath: string): Promise<ISampleGroup> {
    const empty: ISampleGroup = { filePath: fileRelPath, cases: [] };
    const uri = await this.jsonUri(fileRelPath);
    if (!uri) return empty;
    try {
      const stat = await this.fileService.getFileStat(uri);
      if (!stat) return empty;
      const { content } = await this.fileService.readFile(uri);
      const data = JSON.parse(content.toString());
      return { filePath: fileRelPath, cases: Array.isArray(data.cases) ? data.cases : [] };
    } catch {
      return empty;
    }
  }

  async save(group: ISampleGroup): Promise<void> {
    const uri = await this.jsonUri(group.filePath);
    if (!uri) return;
    // 确保目录存在
    const dirUri = uri.substring(0, uri.lastIndexOf('/'));
    try {
      const dirStat = await this.fileService.getFileStat(dirUri);
      if (!dirStat) {
        await this.fileService.createFolder(dirUri);
      }
    } catch {
      await this.fileService.createFolder(dirUri);
    }
    const content = JSON.stringify({ filePath: group.filePath, cases: group.cases }, null, 2);
    const stat = await this.fileService.getFileStat(uri);
    if (stat) {
      await this.fileService.setContent(stat, content);
    } else {
      await this.fileService.createFile(uri, { content });
    }
  }

  async addCase(fileRelPath: string, c: ISampleCase): Promise<void> {
    const group = await this.load(fileRelPath);
    group.cases.push(c);
    await this.save(group);
  }

  async updateCase(fileRelPath: string, c: ISampleCase): Promise<void> {
    const group = await this.load(fileRelPath);
    const idx = group.cases.findIndex(x => x.id === c.id);
    if (idx >= 0) group.cases[idx] = c;
    await this.save(group);
  }

  async removeCase(fileRelPath: string, caseId: string): Promise<void> {
    const group = await this.load(fileRelPath);
    group.cases = group.cases.filter(x => x.id !== caseId);
    await this.save(group);
  }
}
