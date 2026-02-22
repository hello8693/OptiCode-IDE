import * as vscode from 'vscode';
import * as path from 'node:path';
import { initContext, ctx } from './types';
import { cfg } from './config';
import { startClient, restartClient, stopClient } from './client';
import { installClangd } from './install';
import { switchSourceHeader } from './switch-header';
import { cleanupOldCompileCommands, ensureCompileCommandsForFile, maybeGenerateCompileCommands } from './compile-commands';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  initContext(context);
  ctx.outputChannel.appendLine('[clangd] OptiCode C/C++ 扩展已激活');

  context.subscriptions.push(
    vscode.commands.registerCommand('clangd.restart', () => restartClient()),
    vscode.commands.registerCommand('clangd.switchheadersource', () => switchSourceHeader()),
    vscode.commands.registerCommand('clangd.install', () => installClangd()),
  );

  context.subscriptions.push(ctx.statusBarItem);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('clangd')) handleConfigChange();
    }),
  );

  const watcher = vscode.workspace.createFileSystemWatcher('**/{.clangd,.opticode/compile_commands.json,.opticode/compile_flags.txt,compile_commands.json,compile_flags.txt}');
  watcher.onDidChange(() => handleConfigFileChange());
  watcher.onDidCreate(() => handleConfigFileChange());
  watcher.onDidDelete(() => handleConfigFileChange());
  context.subscriptions.push(watcher);

  // 无工作区时，为打开的文件生成局部 compile_commands.json
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    for (const doc of vscode.workspace.textDocuments) {
      if (shouldGenerateForDoc(doc)) {
        const outputPath = path.join(path.dirname(doc.uri.fsPath), 'compile_commands.json');
        cleanupOldCompileCommands(outputPath);
        await ensureCompileCommandsForFile(doc.uri.fsPath);
      }
    }
    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument(async (doc) => {
        if (shouldGenerateForDoc(doc)) {
          const outputPath = path.join(path.dirname(doc.uri.fsPath), 'compile_commands.json');
          cleanupOldCompileCommands(outputPath);
          await ensureCompileCommandsForFile(doc.uri.fsPath);
        }
      }),
    );
  }

  // 若工作区缺少 compile_commands.json，生成一份 g++ 驱动的简单数据库，避免 fallback 使用苹果 clang 缺少 bits/stdc++.h
  await maybeGenerateCompileCommands();
  await startClient();
}

export async function deactivate(): Promise<void> {
  await stopClient();
}

function handleConfigChange(): void {
  const behavior = cfg<string>('onConfigChanged', 'prompt');
  if (behavior === 'restart') {
    restartClient();
  } else if (behavior === 'prompt') {
    vscode.window.showInformationMessage('clangd 配置已更改，是否重启语言服务器？', '重启', '忽略').then((choice) => {
      if (choice === '重启') restartClient();
    });
  }
}

function handleConfigFileChange(): void {
  // 用户要求默认重启，不再询问
  ctx.outputChannel.appendLine('[clangd] 检测到 C/C++ 配置文件变化，正在自动重启');
  restartClient();
}

function shouldGenerateForDoc(doc: vscode.TextDocument): boolean {
  if (doc.uri.scheme !== 'file') return false;
  if (!doc.languageId) return false;
  const lang = doc.languageId.toLowerCase();
  if (!['c', 'cpp', 'cuda-cpp', 'objective-c', 'objective-cpp'].includes(lang)) return false;
  const fsPath = doc.uri.fsPath.toLowerCase();
  return fsPath.endsWith('.c') || fsPath.endsWith('.cc') || fsPath.endsWith('.cpp')
    || fsPath.endsWith('.cxx') || fsPath.endsWith('.c++')
    || fsPath.endsWith('.m') || fsPath.endsWith('.mm')
    || fsPath.endsWith('.h') || fsPath.endsWith('.hpp') || fsPath.endsWith('.hxx') || fsPath.endsWith('.h++');
}
