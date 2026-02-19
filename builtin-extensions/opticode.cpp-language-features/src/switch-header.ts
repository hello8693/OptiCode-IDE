import * as vscode from 'vscode';
import { ctx } from './types';

export async function switchSourceHeader(): Promise<void> {
  if (!ctx.client) {
    vscode.window.showWarningMessage('clangd 语言服务器未运行');
    return;
  }
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const uri = editor.document.uri.toString();
  try {
    const result = await ctx.client.sendRequest<string>('textDocument/switchSourceHeader', { uri });
    if (result) {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(result));
      await vscode.window.showTextDocument(doc);
    } else {
      vscode.window.showInformationMessage('未找到对应的头文件/源文件');
    }
  } catch (err: any) {
    vscode.window.showErrorMessage(`切换头/源文件失败: ${err.message || err}`);
  }
}
