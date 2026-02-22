import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { cfg } from './config';

const CPP_EXTENSIONS = new Set([
  '.c', '.cc', '.cpp', '.cxx', '.c++',
  '.h', '.hh', '.hpp', '.hxx', '.h++',
  '.m', '.mm',
  '.cu', '.cuh',
]);

export async function maybeGenerateCompileCommands(): Promise<void> {
  if (!cfg<boolean>('autoGenerateCompileCommands', true)) return;
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return;
  for (const f of folders) {
    const opticodeDir = path.join(f.uri.fsPath, '.opticode');
    const cc = path.join(opticodeDir, 'compile_commands.json');
    try {
      await fs.promises.access(cc);
      continue;
    } catch {
      // not exists
    }
    
    try {
      await fs.promises.mkdir(opticodeDir, { recursive: true });
    } catch {
      // ignore
    }

    await generateCompileCommands(f.uri.fsPath, cc);
  }
}

export async function ensureCompileCommandsForFile(filePath: string): Promise<void> {
  if (!filePath) return;
  const dir = path.dirname(filePath);
  const outputPath = path.join(dir, 'compile_commands.json');
  const std = getStdFlag();
  const compiler = await getCompiler();
  const entry = {
    directory: dir,
    file: filePath,
    arguments: [compiler, ...std, '-Wall', '-c', filePath, '-o', '/dev/null'],
  };

  let existing: any[] = [];
  try {
    const raw = await fs.promises.readFile(outputPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) existing = parsed;
  } catch {
    existing = [];
  }

  const filtered = existing.filter((item) => item && item.file !== filePath);
  filtered.push(entry);

  try {
    await fs.promises.writeFile(outputPath, JSON.stringify(filtered, null, 2), 'utf-8');
  } catch {
    // ignore
  }
}

export function cleanupOldCompileCommands(keepPath: string): void {
  if (!keepPath) return;
  const prev = getLastCompileCommandsPath();
  if (!prev || prev === keepPath) {
    setLastCompileCommandsPath(keepPath);
    return;
  }
  try {
    if (fs.existsSync(prev)) {
      fs.unlinkSync(prev);
    }
  } catch {
    // ignore
  }
  setLastCompileCommandsPath(keepPath);
}

let lastCompileCommandsPath = '';
function getLastCompileCommandsPath(): string {
  return lastCompileCommandsPath;
}

function setLastCompileCommandsPath(p: string) {
  lastCompileCommandsPath = p;
}

async function generateCompileCommands(rootDir: string, outputPath: string): Promise<void> {
  const files = await findCppFiles(rootDir);
  if (files.length === 0) return;
  const std = getStdFlag();
  const compiler = await getCompiler();
  const entries = files.map((file) => ({
    directory: rootDir,
    file,
    arguments: [compiler, ...std, '-Wall', '-c', file, '-o', '/dev/null'],
  }));
  await fs.promises.writeFile(outputPath, JSON.stringify(entries, null, 2), 'utf-8');
}

async function findCppFiles(dir: string, maxDepth = 5): Promise<string[]> {
  const result: string[] = [];
  await walk(dir, 0, maxDepth, result);
  return result;
}

async function walk(dir: string, depth: number, maxDepth: number, result: string[]): Promise<void> {
  if (depth > maxDepth) return;
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.opticode') {
        // 仅纳入草稿纸目录，避免扫描其他隐藏内容
        await walk(path.join(full, 'scratchpads'), depth + 1, maxDepth, result);
        continue;
      }
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      await walk(full, depth + 1, maxDepth, result);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (CPP_EXTENSIONS.has(ext)) result.push(full);
    }
  }
}

function getStdFlag(): string[] {
  let std = cfg<string>('autoGenerateCompileCommands.std', '').trim();
  if (!std) std = vscode.workspace.getConfiguration('oi.cpp').get<string>('std', 'C++14') || 'C++14';
  const normalized = normalizeStd(std);
  return normalized ? [`-std=${normalized}`] : [];
}

function normalizeStd(std: string): string {
  const trimmed = std.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('c++') || lower.startsWith('gnu++')) {
    return lower;
  }
  if (trimmed.startsWith('C++')) {
    return `c++${trimmed.slice(3)}`;
  }
  return lower;
}

async function getCompiler(): Promise<string> {
  const configured = vscode.workspace.getConfiguration('oi.cpp').get<string>('compilerPath', '')?.trim();
  if (configured) return configured;
  if (process.platform === 'darwin') {
    const brew = await pickBrewGpp();
    if (brew) return brew;
  }
  return 'g++';
}

async function pickBrewGpp(): Promise<string | undefined> {
  const dirs = [
    '/opt/homebrew/bin',
    '/opt/homebrew/opt/gcc/bin',
    '/usr/local/bin',
    '/usr/local/opt/gcc/bin',
    '/opt/local/bin',
  ];
  for (const dir of dirs) {
    try {
      const entries = await fs.promises.readdir(dir);
      const bins = entries
        .filter(name => /^g\+\+-(\d+)$/.test(name))
        .map(name => ({ name, ver: parseInt(name.split('-')[1], 10) }))
        .sort((a, b) => b.ver - a.ver);
      if (bins.length) return path.join(dir, bins[0].name);
    } catch {
      // ignore
    }
  }
  return undefined;
}
