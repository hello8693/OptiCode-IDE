import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node';
import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ctx, CLANGD_DOCUMENT_SELECTOR } from './types';
import { cfg, updateStatus } from './config';
import { resolveClangdPath, installClangd } from './install';
import { setupFileStatus } from './file-status';

export async function startClient(): Promise<void> {
  const clangdPath = await resolveClangdPath();
  if (!clangdPath) {
    updateStatus(ctx.statusBarItem, '$(warning) clangd', 'clangd 未找到，点击安装');
    ctx.statusBarItem.command = 'clangd.install';
    ctx.statusBarItem.show();
    const action = await vscode.window.showWarningMessage('未找到 clangd，C/C++ 语言功能将不可用。是否立即下载？', '下载', '稍后');
    if (action === '下载') {
      await installClangd();
      return startClient();
    }
    return;
  }

  ctx.outputChannel.appendLine(`[clangd] 使用路径: ${clangdPath}`);
  const args = buildClangdArgs();
  ctx.outputChannel.appendLine(`[clangd] args: ${args.join(' ')}`);
  const serverOptions: ServerOptions = { command: clangdPath, args };
  const clientOptions: LanguageClientOptions = {
    documentSelector: CLANGD_DOCUMENT_SELECTOR as any,
    outputChannel: ctx.outputChannel,
    revealOutputChannelOn: 4,
    initializationOptions: {
      clangdFileStatus: true,
      fallbackFlags: buildFallbackFlags(),
    },
    middleware: buildMiddleware(),
  };
  const fallback = (clientOptions.initializationOptions as any)?.fallbackFlags;
  if (Array.isArray(fallback)) {
    ctx.outputChannel.appendLine(`[clangd] fallbackFlags: ${fallback.join(' ')}`);
  }

  const client = new LanguageClient('clangd', 'clangd 语言服务器', serverOptions, clientOptions);
  ctx.client = client;
  updateStatus(ctx.statusBarItem, '$(sync~spin) clangd', '正在启动 clangd…');
  ctx.statusBarItem.command = 'clangd.restart';
  ctx.statusBarItem.show();

  try {
    await client.start();
    updateStatus(ctx.statusBarItem, '$(check) clangd', 'clangd 运行中');
    ctx.outputChannel.appendLine('[clangd] 语言服务器已启动');
    setupFileStatus();
  } catch (err: any) {
    updateStatus(ctx.statusBarItem, '$(error) clangd', `启动失败: ${err.message}`);
    ctx.outputChannel.appendLine(`[clangd] 启动失败: ${err.message}`);
    vscode.window.showErrorMessage(`clangd 启动失败: ${err.message}`);
  }
}

export async function restartClient(): Promise<void> {
  ctx.outputChannel.appendLine('[clangd] 正在重启…');
  updateStatus(ctx.statusBarItem, '$(sync~spin) clangd', '正在重启…');
  if (ctx.client) {
    try { await ctx.client.stop(); } catch { /* ignore */ }
    ctx.client = undefined;
  }
  await startClient();
}

export async function stopClient(): Promise<void> {
  if (ctx.client) {
    try { await ctx.client.stop(); } catch { /* ignore */ }
    ctx.client = undefined;
  }
}

function buildClangdArgs(): string[] {
  const args: string[] = [
    '--background-index',
    '--clang-tidy',
    '--completion-style=detailed',
    '--header-insertion=iwyu',
    '--pch-storage=memory',
    '--function-arg-placeholders',
  ];
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (workspace) {
    const opticodeDir = path.join(workspace.uri.fsPath, '.opticode');
    args.push(`--compile-commands-dir=${opticodeDir}`);
  }
  if (cfg<boolean>('enableInlayHints', true)) args.push('--inlay-hints=true');
  const trace = cfg<string>('trace', '').trim();
  const logLevel = normalizeLogLevel(cfg<string>('logLevel', 'error'));
  if (trace) {
    args.push('--log=verbose');
    args.push(`--trace=${trace}`);
  } else if (logLevel) {
    args.push(`--log=${logLevel}`);
  }
  const userArgs = sanitizeUserArgs(cfg<string[]>('arguments', []));
  args.push(...userArgs);

   // 如果用户未指定 query-driver，则为常见的 g++ 路径添加 query-driver，确保拾取 GCC 头文件（bits/stdc++.h 等）
  if (!args.some(a => a.startsWith('--query-driver'))) {
    const queryDrivers = getQueryDriversForClangd();
    if (queryDrivers.length > 0) {
      args.push(`--query-driver=${queryDrivers.join(',')}`);
    }
  }
  return args;
}

function buildFallbackFlags(): string[] {
  const base = cfg<string[]>('fallbackFlags', ['-std=c++14', '-Wall']);
  const extra = detectGccIncludeFlags();
  return dedupe([...base, ...extra]);
}

function detectGccIncludeFlags(): string[] {
  const flags: string[] = [];
  if (process.platform === 'win32') return flags;

  const compiler = resolveCompilerForIncludes();
  const detected = collectIncludePathsFromCompiler(compiler);
  for (const p of detected) {
    if (!p) continue;
    if (shouldSkipIncludePath(p)) continue;
    flags.push(`-isystem${p}`);
  }

  const tryPath = (cmd: string) => {
    try {
      const out = execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (out && out !== 'include' && out !== 'include/c++/') {
        if (!shouldSkipIncludePath(out)) {
          flags.push(`-isystem${out}`);
        }
      }
    } catch {
      /* ignore */
    }
  };

  tryPath(`${compiler} -print-file-name=include`);
  tryPath(`${compiler} -print-file-name=include/c++/`);
  return flags;
}

function shouldSkipIncludePath(p: string): boolean {
  if (process.platform !== 'darwin') return false;
  const normalized = p.replace(/\\/g, '/');
  // Apple clangd + GCC internal headers -> __float128 not supported on target
  return /\/lib\/gcc\/.+\/include(-fixed)?$/.test(normalized);
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const res: string[] = [];
  for (const a of arr) {
    if (seen.has(a)) continue;
    seen.add(a);
    res.push(a);
  }
  return res;
}

function resolveCompilerForIncludes(): string {
  const candidates = buildQueryDrivers();
  for (const candidate of candidates) {
    const resolved = resolveQueryDriver(candidate);
    if (resolved) return resolved;
  }
  return 'g++';
}

function resolveQueryDriver(candidate: string): string | undefined {
  if (!candidate.includes('*')) {
    return fs.existsSync(candidate) ? candidate : undefined;
  }
  const dir = path.dirname(candidate);
  if (!fs.existsSync(dir)) return undefined;
  const base = path.basename(candidate);
  if (!base.startsWith('g++-')) return undefined;
  try {
    const entries = fs.readdirSync(dir);
    const bins = entries
      .filter(name => /^g\+\+-(\d+)$/.test(name))
      .map(name => ({ name, ver: parseInt(name.split('-')[1], 10) }))
      .sort((a, b) => b.ver - a.ver);
    if (bins.length) return path.join(dir, bins[0].name);
  } catch {
    // ignore
  }
  return undefined;
}

function collectIncludePathsFromCompiler(compiler: string): string[] {
  const result: string[] = [];
  try {
    const res = spawnSync(compiler, ['-E', '-x', 'c++', '-', '-v'], {
      input: '',
      encoding: 'utf-8',
    });
    const stderr = (res.stderr || '').toString();
    const lines = stderr.split(/\r?\n/);
    let inBlock = false;
    for (const line of lines) {
      if (line.includes('#include <...> search starts here:')) {
        inBlock = true;
        continue;
      }
      if (line.includes('End of search list.')) {
        break;
      }
      if (!inBlock) continue;
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('(')) continue;
      if (fs.existsSync(trimmed)) {
        result.push(trimmed);
      }
    }
  } catch {
    // ignore
  }
  return result;
}

function buildQueryDrivers(): string[] {
  const plat = process.platform;
  if (plat === 'win32') {
    return [
      'C:/msys64/mingw64/bin/g++.exe',
      'C:/msys64/clang64/bin/g++.exe',
      'C:/Program Files/mingw-w64*/bin/g++.exe',
    ];
  }
  if (plat === 'darwin') {
    return [
      '/opt/homebrew/bin/g++-*',
      '/opt/homebrew/opt/gcc/bin/g++-*',
      '/usr/local/opt/gcc/bin/g++-*',
      '/usr/local/bin/g++-*',
      '/opt/local/bin/g++-*',
      '/usr/bin/g++',
    ];
  }
  return [
    '/usr/bin/g++',
    '/usr/local/bin/g++',
    '/usr/bin/g++-*',
    '/usr/local/bin/g++-*',
  ];
}

function getQueryDriversForClangd(): string[] {
  const drivers: string[] = [];
  const resolved = resolveCompilerForIncludes();
  if (resolved && resolved !== 'g++') drivers.push(resolved);
  drivers.push(...buildQueryDrivers());
  return dedupe(drivers);
}

function normalizeLogLevel(level: string): string {
  const val = (level || '').toLowerCase().trim();
  if (!val) return '';
  if (val === 'warning' || val === 'warn') return 'info';
  if (['error', 'info', 'verbose'].includes(val)) return val;
  return 'error';
}

function sanitizeUserArgs(args: string[]): string[] {
  const res: string[] = [];
  for (const arg of args || []) {
    if (typeof arg !== 'string') continue;
    if (arg.startsWith('--log=')) {
      const val = arg.slice('--log='.length);
      const normalized = normalizeLogLevel(val);
      if (normalized) {
        res.push(`--log=${normalized}`);
      }
      continue;
    }
    res.push(arg);
  }
  return res;
}

function buildMiddleware() {
  const useServerRanking = cfg<boolean>('serverCompletionRanking', true);
  return {
    provideCompletionItem: useServerRanking ? async (
      document: vscode.TextDocument,
      position: vscode.Position,
      context: vscode.CompletionContext,
      token: vscode.CancellationToken,
      next: (
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.CompletionContext,
        token: vscode.CancellationToken,
      ) => vscode.ProviderResult<vscode.CompletionList | vscode.CompletionItem[]>,
    ) => {
      const result = await next(document, position, context, token);
      if (!result) return result;
      const items = Array.isArray(result) ? result : result.items;
      for (let i = 0; i < items.length; i++) {
        items[i].sortText = String.fromCharCode(i);
      }
      return result;
    } : undefined,

    provideWorkspaceSymbols: async (
      query: string,
      token: vscode.CancellationToken,
      next: (
        query: string,
        token: vscode.CancellationToken,
      ) => vscode.ProviderResult<vscode.SymbolInformation[]>,
    ) => {
      const symbols = await next(query, token);
      if (!symbols) return symbols;
      return symbols.map((s) => {
        if (s.containerName?.startsWith('\u001e')) s.containerName = '';
        return s;
      });
    },
  };
}
