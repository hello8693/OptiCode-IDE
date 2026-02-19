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
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, depth + 1, maxDepth, result);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (CPP_EXTENSIONS.has(ext)) result.push(full);
    }
  }
}

function getStdFlag(): string[] {
  let std = cfg<string>('autoGenerateCompileCommands.std', '').trim();
  if (!std) std = vscode.workspace.getConfiguration('oi.cpp').get<string>('std', 'c++20') || 'c++20';
  return std ? [`-std=${std}`] : [];
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
  const dirs = ['/opt/homebrew/bin', '/usr/local/bin'];
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
