import * as vscode from 'vscode';

export function cfg<T>(key: string, fallback?: T): T {
  return vscode.workspace.getConfiguration('clangd').get<T>(key, fallback as T);
}

export function updateStatus(statusBarItem: vscode.StatusBarItem, text: string, tooltip?: string) {
  statusBarItem.text = text;
  if (tooltip !== undefined) {
    statusBarItem.tooltip = tooltip;
  }
  statusBarItem.show();
}
