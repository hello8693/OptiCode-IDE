import * as vscode from 'vscode';

/**
 * clangd 支持的文档选择器
 */
export const CLANGD_DOCUMENT_SELECTOR: vscode.DocumentSelector = [
  { language: 'c', scheme: 'file' },
  { language: 'cpp', scheme: 'file' },
  { language: 'cuda-cpp', scheme: 'file' },
  { language: 'objective-c', scheme: 'file' },
  { language: 'objective-cpp', scheme: 'file' },
];

/**
 * clangd 扩展全局状态
 */
export interface ClangdContext {
  client: import('vscode-languageclient/node').LanguageClient | undefined;
  extensionContext: vscode.ExtensionContext;
  outputChannel: vscode.OutputChannel;
  statusBarItem: vscode.StatusBarItem;
}

export let ctx: ClangdContext;

export function initContext(context: vscode.ExtensionContext): ClangdContext {
  const outputChannel = vscode.window.createOutputChannel('clangd');
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  statusBarItem.text = 'clangd';
  statusBarItem.tooltip = 'clangd 语言服务器';
  statusBarItem.command = 'clangd.restart';

  ctx = {
    client: undefined,
    extensionContext: context,
    outputChannel,
    statusBarItem,
  };
  return ctx;
}
