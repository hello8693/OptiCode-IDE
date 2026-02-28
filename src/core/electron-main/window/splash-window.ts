import { app, BrowserWindow, ipcMain, IpcMainEvent } from 'electron';
import { Autowired, Injectable } from '@opensumi/di';
import path from 'node:path';
import { WindowsManager } from './windows-manager';

@Injectable()
export class SplashWindow {
  @Autowired(WindowsManager)
  windowsManager: WindowsManager;

  private browserWindow: BrowserWindow | null = null;
  private closeTimer: NodeJS.Timeout | null = null;
  private ipcBound = false;
  private readonly holdSplash = process.env.OPTICODE_SPLASH_HOLD === '1';
  private holdOverride = false;

  show(options?: { hold?: boolean }) {
    if (typeof options?.hold === 'boolean') {
      this.holdOverride = options.hold;
    } else {
      this.holdOverride = false;
    }
    if (this.shouldHoldSplash() && this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    if (this.browserWindow && !this.browserWindow.isDestroyed()) {
      if (
        typeof (this.browserWindow as any).isReadyToShow === 'function' &&
        (this.browserWindow as any).isReadyToShow()
      ) {
        this.browserWindow.show();
      }
      return;
    }
    this.browserWindow = this.createWindow();
  }

  close() {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    const win = this.browserWindow;
    if (!win || win.isDestroyed()) {
      this.browserWindow = null;
      return;
    }
    try {
      win.close();
    } catch {
      // ignore
    } finally {
      this.browserWindow = null;
      this.holdOverride = false;
    }
  }

  private createWindow() {
    this.bindIpcOnce();
    const isDevServer = Boolean(__SPLASH_WINDOW_DEV_SERVER_URL__);
    const win = new BrowserWindow({
      width: 700,
      height: 420,
      resizable: false,
      movable: true,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      frame: false,
      transparent: false,
      alwaysOnTop: true,
      backgroundColor: '#0b0c10',
      show: false,
      webPreferences: {
        nodeIntegration: isDevServer,
        contextIsolation: !isDevServer,
        webSecurity: true,
      },
    });
    win.setMenuBarVisibility(false);

    const version = app.getVersion();
    const build = (__PRODUCT__?.commit || __PRODUCT__?.date || 'dev').toString().trim() || 'dev';

    if (__SPLASH_WINDOW_DEV_SERVER_URL__) {
      const url = `${__SPLASH_WINDOW_DEV_SERVER_URL__}/index.html?version=${encodeURIComponent(version)}&build=${encodeURIComponent(build)}`;
      win.loadURL(url);
    } else {
      win.loadFile(path.join(__dirname, `../renderer/${__SPLASH_WINDOW_NAME__}/index.html`), {
        query: { version, build },
      });
    }

    const fallbackHtml = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <style>
          html, body { margin:0; width:100%; height:100%; background:#0b0c10; color:#eef2f7; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Helvetica Neue",Arial,sans-serif; }
          .wrap { height:100%; display:flex; align-items:center; padding-left:48px; }
          .bar { width:6px; height:120px; border-radius:6px; background: linear-gradient(180deg,#ff5f6d,#ffc371,#5c7cff); margin-right:16px; }
          .title { font-size:32px; font-weight:700; line-height:1.1; }
          .meta { margin-top:6px; font-size:13px; opacity:0.7; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <div class="bar"></div>
          <div>
            <div class="title">OptiCode IDE</div>
            <div class="meta">v${version}</div>
            <div class="meta">build ${build}</div>
          </div>
        </div>
      </body>
      </html>
    `.trim();

    win.webContents.on('did-fail-load', () => {
      win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fallbackHtml)}`);
    });

    win.webContents.on('before-input-event', (event, input) => {
      if (!this.shouldHoldSplash()) return;
      if (input.type !== 'keyDown') return;
      const key = (input.key || '').toLowerCase();
      if (key === 'escape' || key === 'esc' || key === 'q') {
        event.preventDefault();
        this.close();
      }
    });

    win.once('ready-to-show', () => {
      if (!win.isDestroyed()) {
        win.show();
      }
    });

    if (!this.shouldHoldSplash()) {
      this.closeTimer = setTimeout(() => {
        this.revealCodeWindow();
        this.close();
      }, 20000);
    }

    win.on('closed', () => {
      if (this.closeTimer) {
        clearTimeout(this.closeTimer);
        this.closeTimer = null;
      }
      this.browserWindow = null;
      this.holdOverride = false;
    });

    return win;
  }

  private bindIpcOnce() {
    if (this.ipcBound) return;
    this.ipcBound = true;
    ipcMain.on('opticode:splash-ready', this.handleSplashReady);
  }

  private handleSplashReady = (event: IpcMainEvent, payload?: { windowId?: number }) => {
    if (this.shouldHoldSplash()) return;
    this.revealCodeWindow(event, payload);
    this.close();
  };

  private shouldHoldSplash(): boolean {
    return this.holdSplash || this.holdOverride;
  }

  private revealCodeWindow(event?: IpcMainEvent, payload?: { windowId?: number }) {
    const targetFromPayload = payload?.windowId
      ? BrowserWindow.fromId(payload.windowId)
      : undefined;
    const targetFromSender = event ? BrowserWindow.fromWebContents(event.sender) : undefined;
    const target =
      targetFromPayload || targetFromSender || this.windowsManager.getFirstBrowserWindow();
    if (!target || target.isDestroyed()) return false;
    if (target.isMinimized()) {
      target.restore();
    }
    if (!target.isVisible()) {
      target.show();
    }
    if (target.isResizable() && !target.isMaximized()) {
      target.maximize();
    }
    target.focus();
    return true;
  }
}
