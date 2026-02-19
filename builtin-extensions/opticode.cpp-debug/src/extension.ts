/*
 * OptiCode C/C++ Debug Adapter Factory
 * - macOS: lldb-dap
 * - others: gdb --interpreter=dap
 */
import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
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

function findInCandidates(candidates: Array<string | undefined>): string | undefined {
  for (const candidate of candidates) {
    if (candidate && isExecutable(candidate)) return candidate;
  }
  return undefined;
}

function resolveFromPath(cmd: string): string | undefined {
  const envPath = process.env.PATH || '';
  const parts = envPath.split(path.delimiter).filter(Boolean);
  const isWin = process.platform === 'win32';
  const exts = isWin
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM')
        .split(';')
        .map((ext) => ext.toLowerCase())
    : [''];

  for (const dir of parts) {
    for (const ext of exts) {
      const candidate = path.join(dir, isWin ? cmd + ext : cmd);
      if (isExecutable(candidate)) return candidate;
    }
  }
  return undefined;
}

function findLldbDap(): string | undefined {
  if (process.platform !== 'darwin') return undefined;
  const env = process.env.OPTICODE_LLDB_DAP_PATH
    || process.env.LLDB_DAP_PATH
    || process.env.OPTICODE_LLDB_VSCODE_PATH
    || process.env.LLDB_VSCODE_PATH;
  if (env && isExecutable(env)) return env;

  const toolRoots = getToolsRoots();
  const toolCandidates = toolRoots.flatMap((root) => ([
    path.join(root, 'llvm', 'bin', 'lldb-dap'),
    path.join(root, 'lldb', 'bin', 'lldb-dap'),
    path.join(root, 'lldb-dap'),
  ]));
  const toolHit = findInCandidates(toolCandidates);
  if (toolHit) return toolHit;

  try {
    const out = cp.execFileSync('xcrun', ['--find', 'lldb-dap'], { encoding: 'utf8' }).trim();
    if (out && isExecutable(out)) return out;
  } catch {
    // ignore
  }

  const candidates = [
    '/Library/Developer/CommandLineTools/usr/bin/lldb-dap',
    '/Applications/Xcode-beta.app/Contents/Developer/usr/bin/lldb-dap',
    '/Applications/Xcode.app/Contents/SharedFrameworks/LLDB.framework/Versions/A/Resources/lldb-dap',
    '/Applications/Xcode.app/Contents/Developer/usr/bin/lldb-dap',
    '/usr/bin/lldb-dap',
  ];
  for (const c of candidates) {
    if (isExecutable(c)) return c;
  }

  const onPath = resolveFromPath('lldb-dap');
  if (onPath) return onPath;
  return resolveFromPath('lldb-vscode');
}

function findGdb(): string | undefined {
  const isWin = process.platform === 'win32';
  const toolRoots = getToolsRoots();

  if (isWin) {
    const bundledCandidates: string[] = [];
    for (const root of toolRoots) {
      bundledCandidates.push(path.join(root, 'mingw64', 'bin', 'gdb.exe'));
      bundledCandidates.push(path.join(root, 'mingw-w64', 'bin', 'gdb.exe'));
      bundledCandidates.push(path.join(root, 'msys64', 'mingw64', 'bin', 'gdb.exe'));
      bundledCandidates.push(path.join(root, 'msys2', 'mingw64', 'bin', 'gdb.exe'));
      bundledCandidates.push(path.join(root, 'gdb', 'bin', 'gdb.exe'));
      bundledCandidates.push(path.join(root, 'llvm', 'bin', 'gdb.exe'));
    }
    const bundledHit = findInCandidates(bundledCandidates);
    if (bundledHit) return bundledHit;

    const env = process.env.OPTICODE_GDB_PATH || process.env.GDB_PATH;
    if (env && isExecutable(env)) return env;

    const candidates: string[] = [];
    const mingwHome = process.env.MINGW64_HOME;
    if (mingwHome) candidates.push(path.join(mingwHome, 'bin', 'gdb.exe'));
    candidates.push('C\\msys64\\mingw64\\bin\\gdb.exe');
    candidates.push('C\\msys64\\clang64\\bin\\gdb.exe');
    candidates.push('C\\mingw64\\bin\\gdb.exe');
    candidates.push('C\\mingw\\bin\\gdb.exe');
    const candidateHit = findInCandidates(candidates);
    if (candidateHit) return candidateHit;

    return resolveFromPath('gdb.exe');
  }

  const env = process.env.OPTICODE_GDB_PATH || process.env.GDB_PATH;
  if (env && isExecutable(env)) return env;

  const candidates: string[] = [];
  if (process.platform === 'darwin') {
    candidates.push('/opt/homebrew/bin/gdb');
    candidates.push('/usr/local/bin/gdb');
    candidates.push('/usr/bin/gdb');
  } else {
    candidates.push('/usr/bin/gdb');
    candidates.push('/usr/local/bin/gdb');
    candidates.push('/snap/bin/gdb');
  }
  const candidateHit = findInCandidates(candidates);
  if (candidateHit) return candidateHit;

  return resolveFromPath('gdb');
}

class CppDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
  createDebugAdapterDescriptor(session: vscode.DebugSession): vscode.DebugAdapterDescriptor | undefined {
    const isDarwin = process.platform === 'darwin';
    const command = isDarwin ? findLldbDap() : findGdb();
    if (!command) {
      const resourcesToolsRoot = getResourcesToolsRoot();
      const toolsRoot = resourcesToolsRoot || '<安装目录>/resources/tools';
      const help = isDarwin
        ? '未找到 lldb-dap，请先安装 Xcode Command Line Tools，或通过 Homebrew 安装 llvm，并确保 lldb-dap 在 PATH 中'
        : (process.platform === 'win32'
          ? `未找到 gdb，请将 gdb 放到 ${toolsRoot}/mingw64/bin/gdb.exe，或安装 mingw-w64 并确保 gdb 在 PATH 中`
          : '未找到 gdb，请安装 gdb (建议 14+ 以支持 DAP)，并确保 gdb 在 PATH 中');
      void vscode.window.showErrorMessage(help);
      return undefined;
    }

    const args = isDarwin ? [] : ['--interpreter=dap'];
    const options = {
      cwd: session.workspaceFolder ? session.workspaceFolder.uri.fsPath : undefined,
    };
    return new vscode.DebugAdapterExecutable(command, args, options);
  }
}

export function activate(context: vscode.ExtensionContext) {
  const factory = new CppDebugAdapterFactory();
  context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('cppdbg', factory));
}

export function deactivate() {}
