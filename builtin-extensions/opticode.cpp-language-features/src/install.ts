import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { ctx } from './types';
import { cfg, updateStatus } from './config';

/** 解析 clangd 路径：用户配置 -> (Windows 内置优先) -> 已下载 -> 常见路径 -> PATH */
export async function resolveClangdPath(): Promise<string | undefined> {
  const userPath = cfg<string>('path', '').trim();
  if (userPath && userPath !== 'clangd' && await fileExists(userPath)) {
    return userPath;
  }

  if (process.platform === 'win32') {
    for (const candidate of getToolsClangdCandidates()) {
      if (await fileExists(candidate)) return candidate;
    }
  }

  const bundled = getBundledClangdPath();
  if (bundled && await fileExists(bundled)) {
    return bundled;
  }

  const downloaded = getDownloadedClangdPath();
  if (downloaded && await fileExists(downloaded)) {
    return downloaded;
  }

  for (const candidate of getClangdCandidates()) {
    if (await fileExists(candidate)) return candidate;
  }

  if (await isExecutableOnPath('clangd')) return 'clangd';
  return undefined;
}

function getDownloadedClangdPath(): string | undefined {
  if (!ctx.extensionContext.globalStorageUri) return undefined;
  const base = ctx.extensionContext.globalStorageUri.fsPath;
  const bin = process.platform === 'win32' ? 'clangd.exe' : 'clangd';
  return path.join(base, 'clangd', 'bin', bin);
}

function getResourcesToolsRoot(): string | undefined {
  const resourcesPath = process.resourcesPath;
  if (!resourcesPath) return undefined;
  return path.join(resourcesPath, 'tools');
}

function getToolsRoots(): string[] {
  if (process.platform !== 'win32') return [];
  const resourcesTools = getResourcesToolsRoot();
  return resourcesTools ? [resourcesTools] : [];
}

function getToolsClangdCandidates(): string[] {
  const bin = process.platform === 'win32' ? 'clangd.exe' : 'clangd';
  const candidates: string[] = [];
  for (const root of getToolsRoots()) {
    candidates.push(path.join(root, 'llvm', 'bin', bin));
    candidates.push(path.join(root, 'clangd', 'bin', bin));
    if (process.platform === 'win32') {
      candidates.push(path.join(root, 'clangd', 'windows-x86_64', 'bin', 'clangd.exe'));
      candidates.push(path.join(root, 'mingw64', 'bin', 'clangd.exe'));
    }
  }

  return candidates;
}

/**
 * 如果扩展内置了 clangd（主要用于 Windows 离线环境），优先返回内置路径。
 * 约定目录：<extension>/clangd/windows-x86_64/bin/clangd.exe
 */
function getBundledClangdPath(): string | undefined {
  if (process.platform !== 'win32') return undefined;
  const base = ctx.extensionContext.extensionPath;
  const candidate = path.join(base, 'clangd', 'windows-x86_64', 'bin', 'clangd.exe');
  return candidate;
}

function getClangdCandidates(): string[] {
  const plat = process.platform;
  const list: string[] = [];
  if (plat === 'darwin') {
    list.push('/opt/homebrew/bin/clangd');
    list.push('/usr/local/bin/clangd');
    list.push('/usr/bin/clangd');
    list.push('/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/clangd');
  } else if (plat === 'linux') {
    list.push('/usr/bin/clangd', '/usr/local/bin/clangd');
    for (let v = 20; v >= 14; v--) list.push(`/usr/bin/clangd-${v}`);
    list.push('/snap/clangd/current/bin/clangd');
  } else if (plat === 'win32') {
    const pf = process.env['ProgramFiles'] || 'C\\Program Files';
    list.push(path.join(pf, 'LLVM', 'bin', 'clangd.exe'));
    list.push('C\\msys64\\mingw64\\bin\\clangd.exe');
    list.push('C\\msys64\\clang64\\bin\\clangd.exe');
  }
  return list;
}

export async function installClangd(): Promise<void> {
  const choice = await vscode.window.showInformationMessage('是否自动从 GitHub 下载最新 clangd？', '下载', '取消');
  if (choice !== '下载') return;
  try {
    const p = await downloadClangd();
    if (p) vscode.window.showInformationMessage(`clangd 已下载到 ${p}`);
  } catch (err: any) {
    vscode.window.showErrorMessage(`下载 clangd 失败: ${err.message || err}`);
  }
}

export async function downloadClangd(): Promise<string | undefined> {
  const plat = process.platform;
  const arch = process.arch;
  let assetPattern: string;
  if (plat === 'darwin') assetPattern = arch === 'arm64' ? 'mac-arm64' : 'mac-x86_64';
  else if (plat === 'linux') assetPattern = arch === 'arm64' ? 'linux-arm64' : 'linux-x86_64';
  else if (plat === 'win32') assetPattern = 'windows-x86_64';
  else throw new Error(`不支持的平台: ${plat}`);

  updateStatus(ctx.statusBarItem, '$(sync~spin) clangd', '正在获取最新版本…');
  const release = await httpsGetJson('https://api.github.com/repos/clangd/clangd/releases/latest');
  const asset = release.assets?.find((a: any) => a.name?.includes(assetPattern) && a.name?.endsWith('.zip'));
  if (!asset) throw new Error(`未找到适配当前平台的 clangd 资源 (${assetPattern})`);

  const downloadUrl: string = asset.browser_download_url;
  const storageDir = path.join(ctx.extensionContext.globalStorageUri!.fsPath, 'clangd');
  await fs.promises.mkdir(storageDir, { recursive: true });
  const zipPath = path.join(storageDir, asset.name);

  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `正在下载 clangd (${release.tag_name})`, cancellable: true }, async (progress, token) => {
    await downloadFile(downloadUrl, zipPath, progress, token);
  });

  updateStatus(ctx.statusBarItem, '$(sync~spin) clangd', '正在解压…');
  const { exec } = await import('child_process');
  await new Promise<void>((resolve, reject) => {
    const cmd = plat === 'win32'
      ? `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${storageDir}' -Force"`
      : `unzip -o "${zipPath}" -d "${storageDir}"`;
    exec(cmd, (err) => err ? reject(err) : resolve());
  });

  await fs.promises.unlink(zipPath).catch(() => {});
  const binName = plat === 'win32' ? 'clangd.exe' : 'clangd';
  const clangdBin = await findFileRecursive(storageDir, binName);
  if (!clangdBin) throw new Error('解压后未找到 clangd 二进制文件');

  if (plat !== 'win32') await fs.promises.chmod(clangdBin, 0o755);
  const targetDir = path.join(storageDir, 'bin');
  await fs.promises.mkdir(targetDir, { recursive: true });
  const target = path.join(targetDir, binName);
  if (clangdBin !== target) {
    await fs.promises.copyFile(clangdBin, target);
    if (plat !== 'win32') await fs.promises.chmod(target, 0o755);
  }
  updateStatus(ctx.statusBarItem, 'clangd ✓', 'clangd 已下载');
  return target;
}

export async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.promises.access(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function isExecutableOnPath(name: string): Promise<boolean> {
  const { exec } = await import('child_process');
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? `where ${name}` : `which ${name}`;
    exec(cmd, (err) => resolve(!err));
  });
}

async function findFileRecursive(dir: string, filename: string): Promise<string | undefined> {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findFileRecursive(full, filename);
      if (found) return found;
    } else if (entry.name === filename) {
      return full;
    }
  }
  return undefined;
}

function httpsGetJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const get = url.startsWith('https') ? https.get : http.get;
    get(url, { headers: { 'User-Agent': 'opticode-cpp-language-features', Accept: 'application/vnd.github.v3+json' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpsGetJson(res.headers.location).then(resolve, reject);
        return;
      }
      let data = '';
      res.on('data', (chunk: Buffer) => data += chunk.toString());
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse error: ${data.slice(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

function downloadFile(url: string, dest: string, progress: vscode.Progress<{ increment?: number; message?: string }>, token: vscode.CancellationToken): Promise<void> {
  return new Promise((resolve, reject) => {
    if (token.isCancellationRequested) {
      reject(new Error('下载已取消'));
      return;
    }
    const get = url.startsWith('https') ? https.get : http.get;
    get(url, { headers: { 'User-Agent': 'opticode-cpp-language-features' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location, dest, progress, token).then(resolve, reject);
        return;
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let downloaded = 0;
      const file = fs.createWriteStream(dest);
      token.onCancellationRequested(() => {
        file.close();
        fs.unlink(dest, () => {});
        reject(new Error('下载已取消'));
      });
      res.on('data', (chunk: Buffer) => {
        downloaded += chunk.length;
        if (total > 0) {
          const pct = Math.round((downloaded / total) * 100);
          progress.report({ increment: (chunk.length / total) * 100, message: `${pct}%  ${(downloaded / 1048576).toFixed(1)}MB` });
        }
      });
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', reject);
    }).on('error', reject);
  });
}
