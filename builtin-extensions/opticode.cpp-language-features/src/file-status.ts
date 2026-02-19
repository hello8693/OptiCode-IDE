import * as vscode from 'vscode';
import { ctx } from './types';

export function setupFileStatus(): void {
  if (!ctx.client) return;
  ctx.client.onNotification('textDocument/fileStatus', (params: { uri: string; state: string }) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    if (editor.document.uri.toString() === params.uri) {
      const icon = params.state === 'idle' ? '$(check)' : '$(sync~spin)';
      ctx.statusBarItem.text = `${icon} clangd`;
      ctx.statusBarItem.tooltip = `clangd: ${params.state}`;
    }
  });
  vscode.window.onDidChangeActiveTextEditor(() => {
    ctx.statusBarItem.text = 'clangd';
    ctx.statusBarItem.tooltip = 'clangd 语言服务器';
  });
}
