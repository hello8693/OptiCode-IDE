/**
 * 「编译与运行」侧栏面板 —— 题目级编译运行工具
 */
import React, { useCallback, useState, useEffect } from 'react';
import { CommandService, useInjectable, electronEnv } from '@opensumi/ide-core-browser';
import { WorkbenchEditorService } from '@opensumi/ide-editor/lib/browser';
import { IWorkspaceService } from '@opensumi/ide-workspace/lib/common';
import { CheckBox } from '@opensumi/ide-components';
import {
  FolderOpenIcon,
  CodeIcon,
  ToolsIcon,
  PlayIcon,
  PlayCircleIcon,
  BugIcon,
  SettingIcon,
  RefreshIcon,
  SwapIcon,
  TimeIcon,
  SystemStorageIcon,
  TagIcon,
} from 'tdesign-icons-react';
import { IStorageService } from '../../common';
import { IProblemService, IProblem } from '../../common/problem';
import { SCRATCHPAD_SCHEME, ScratchpadEntry } from '../../common/scratchpad';
import { TOGGLE_STD } from '../cpp/status.contribution';
import { STD_KEY, STD_OPTIONS, STD_DEFAULT } from '../cpp/constants';
import {
  SINGLEFILE_CREATE_CMD,
  SINGLEFILE_COMPILE_CMD,
  SINGLEFILE_RUN_CMD,
  SINGLEFILE_COMPILE_RUN_CMD,
  SINGLEFILE_DEBUG_CMD,
  SINGLEFILE_OPEN_SETTINGS_CMD,
  SINGLEFILE_OPEN_TEMPLATE_CMD,
  SINGLE_FILE_FLAGS_KEY,
  COMMON_FLAGS,
} from './contribution';
import { ScratchpadService } from '../scratchpad/scratchpad.service';
import '../styles/oi-panel.less';
import { useVisibilityInterval } from '../hooks/useVisibilityInterval';

export const COMPILE_RUN_PANEL = 'compile-run-panel';

export const CompileRunPanel: React.FC = () => {
  const commandService = useInjectable<CommandService>(CommandService);
  const workspaceService = useInjectable<IWorkspaceService>(IWorkspaceService);
  const storage = useInjectable<IStorageService>(IStorageService);
  const problemService = useInjectable<IProblemService>(IProblemService);
  const editorService = useInjectable<WorkbenchEditorService>(WorkbenchEditorService);
  const scratchService = useInjectable<ScratchpadService>(ScratchpadService);

  const exec = useCallback((cmd: string) => commandService.executeCommand(cmd), [commandService]);
  const isElectron = electronEnv.isElectronRenderer;

  const [activeProblem, setActiveProblem] = useState<IProblem | undefined>(
    problemService.activeProblem,
  );
  const [activeScratch, setActiveScratch] = useState<ScratchpadEntry | undefined>(undefined);

  const [std, setStd] = useState<string>(STD_DEFAULT);
  const [flags, setFlags] = useState<string[]>(['-O2', '-Wall']);

  const [hasWorkspace, setHasWorkspace] = useState<boolean>(true);
  const [workspaceSupported, setWorkspaceSupported] = useState<boolean>(true);

  useEffect(() => {
    const disposable = problemService.onActiveProblemChange(p => {
      setActiveProblem(p);
    });
    setActiveProblem(problemService.activeProblem);
    return () => disposable.dispose();
  }, [problemService]);

  useEffect(() => {
    let disposed = false;
    const refreshScratch = async () => {
      const resource = editorService.currentResource;
      if (!resource || resource.uri.scheme !== SCRATCHPAD_SCHEME) {
        if (!disposed) setActiveScratch(undefined);
        return;
      }
      const id = scratchService.getIdFromUri(resource.uri);
      if (!id) {
        if (!disposed) setActiveScratch(undefined);
        return;
      }
      const entry = await scratchService.ensure(id);
      if (!disposed) setActiveScratch(entry);
    };
    void refreshScratch();
    const disposable = editorService.onActiveResourceChange(() => {
      void refreshScratch();
    });
    const scratchDisposable = scratchService.onDidChange(() => {
      void refreshScratch();
    });
    return () => {
      disposed = true;
      disposable.dispose();
      scratchDisposable.dispose();
    };
  }, [editorService, scratchService]);

  const updateConfigs = useCallback(async () => {
    const s = await storage.getItem<string>(STD_KEY, STD_DEFAULT);
    const f = await storage.getItem<string[]>(SINGLE_FILE_FLAGS_KEY, ['-O2', '-Wall']);
    if (isElectron) {
      setStd(s);
      setFlags(f);
      return;
    }
    setStd(prev => (prev === s ? prev : s));
    setFlags(prev => {
      if (prev.length === f.length && prev.every((v, i) => v === f[i])) return prev;
      return f;
    });
  }, [storage, isElectron]);

  useEffect(() => {
    updateConfigs();
    if (!isElectron) return;
    const timer = setInterval(updateConfigs, 2000);
    return () => clearInterval(timer);
  }, [updateConfigs, isElectron]);

  useVisibilityInterval(updateConfigs, { intervalMs: 2000, immediate: false, enabled: !isElectron });

  useEffect(() => {
    const checkRoots = async () => {
      const roots = await workspaceService.roots;
      setHasWorkspace(!!roots.length);
    };
    checkRoots();
  }, [workspaceService]);

  const updateSupport = useCallback(async () => {
    const roots = await workspaceService.roots;
    if (!roots.length) return;
    if (activeProblem) {
      setWorkspaceSupported(true);
      return;
    }
    const supported = await problemService.isOptiCodeWorkspace();
    if (isElectron) {
      setWorkspaceSupported(supported);
    } else {
      setWorkspaceSupported(prev => (prev === supported ? prev : supported));
    }
  }, [workspaceService, problemService, activeProblem, isElectron]);

  useEffect(() => {
    let disposed = false;
    const guarded = async () => {
      if (disposed) return;
      await updateSupport();
    };
    void guarded();
    if (!isElectron) return () => { disposed = true; };
    const timer = setInterval(guarded, 5000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [updateSupport, isElectron]);

  useVisibilityInterval(updateSupport, { intervalMs: 5000, immediate: false, enabled: !isElectron });

  const toggleFlag = async (f: string) => {
    const newFlags = flags.includes(f) ? flags.filter(x => x !== f) : [...flags, f];
    setFlags(newFlags);
    await storage.setItem(SINGLE_FILE_FLAGS_KEY, newFlags);
  };

  const formatTime = (ts?: number) => {
    if (!ts) return '';
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const isScratchActive = !!activeScratch;
  const canCompileRun = !!activeProblem || isScratchActive;
  const canDebug = !!activeProblem && !isScratchActive;

  if (!hasWorkspace && !isScratchActive) {
    return (
      <div className="oi-panel">
        <div className="oi-panel__header">
          <span className="oi-panel__title">编译与运行</span>
        </div>
        <div className="oi-empty" style={{ padding: '24px 8px' }}>
          <FolderOpenIcon size={28} style={{ opacity: 0.2 }} />
          <span>请先打开一个文件夹以启用编译运行</span>
          <span style={{ fontSize: 11, opacity: 0.8 }}>
            建议路径不要包含空格或中文字符，避免编译参数转义问题。
          </span>
        </div>
      </div>
    );
  }

  if (!workspaceSupported && !isScratchActive) {
    return (
      <div className="oi-panel">
        <div className="oi-panel__header">
          <span className="oi-panel__title">编译与运行</span>
        </div>
        <div className="oi-empty" style={{ padding: '24px 8px' }}>
          <FolderOpenIcon size={28} style={{ opacity: 0.2 }} />
          <span>当前文件夹不是 OptiCode 题目结构</span>
          <span style={{ fontSize: 11, opacity: 0.8 }}>
            题目目录结构：P1001/P1001.cpp
          </span>
          <button
            className="oi-btn oi-btn__primary"
            style={{ marginTop: 8 }}
            onClick={() => exec(SINGLEFILE_CREATE_CMD)}
          >
            新建题目
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="oi-panel">
      <div className="oi-panel__header">
        <span className="oi-panel__title">编译与运行</span>
      </div>

      <div className="oi-panel__section">当前题目</div>
      {isScratchActive ? (
        <div className="oi-problem-card">
          <div className="oi-problem-card__title">
            <CodeIcon size={14} style={{ marginRight: 6, opacity: 0.6 }} />
            <span style={{ fontWeight: 600 }}>草稿纸</span>
            <span style={{ opacity: 0.6, marginLeft: 6, fontSize: 10 }}>
              {activeScratch?.name || '未命名'}
            </span>
            <span className="oi-info__tag" style={{ marginLeft: 'auto' }}>C++</span>
          </div>
          <div className="oi-problem-card__meta">
            {activeScratch?.updatedAt ? (
              <span title="最近编辑">
                <TimeIcon size={12} style={{ marginRight: 2, opacity: 0.7 }} />
                {formatTime(activeScratch.updatedAt)}
              </span>
            ) : (
              <span style={{ opacity: 0.5 }}>临时草稿</span>
            )}
          </div>
        </div>
      ) : activeProblem ? (
        <div className="oi-problem-card">
          <div className="oi-problem-card__title">
            <CodeIcon size={14} style={{ marginRight: 6, opacity: 0.6 }} />
            <span style={{ fontWeight: 600 }}>{activeProblem.meta.id}</span>
            {activeProblem.meta.name !== activeProblem.meta.id && (
              <span style={{ opacity: 0.6, marginLeft: 4, fontSize: 10 }}>
                {activeProblem.meta.name}
              </span>
            )}
            <span className="oi-info__tag" style={{ marginLeft: 'auto' }}>C++</span>
          </div>
          <div className="oi-problem-card__meta">
            <span title="时间限制"><TimeIcon size={12} style={{ marginRight: 2, opacity: 0.7 }} />{activeProblem.meta.timeLimitMs}ms</span>
            <span title="内存限制"><SystemStorageIcon size={12} style={{ marginRight: 2, opacity: 0.7 }} />{activeProblem.meta.memoryLimitMb}MB</span>
            {activeProblem.meta.source?.oj && (
              <span title="来源 OJ"><TagIcon size={12} style={{ marginRight: 2, opacity: 0.7 }} />{activeProblem.meta.source.oj}</span>
            )}
          </div>
        </div>
      ) : (
        <div className="oi-info">
          <span style={{ opacity: 0.5, fontSize: 11 }}>未打开题目文件</span>
        </div>
      )}

      <div className="oi-panel__section">编译与运行</div>
      <div className="oi-panel__actions oi-panel__actions--split">
        <button
          className="oi-btn oi-btn__half"
          title="编译当前题目"
          onClick={() => exec(SINGLEFILE_COMPILE_CMD)}
          disabled={!canCompileRun}
        >
          <ToolsIcon size={14} style={{ marginRight: 4 }} />
          编译
        </button>
        <button
          className="oi-btn oi-btn__half"
          title="运行上一次编译产物"
          onClick={() => exec(SINGLEFILE_RUN_CMD)}
          disabled={!canCompileRun}
        >
          <PlayIcon size={14} style={{ marginRight: 4 }} />
          运行
        </button>
      </div>
      <div className="oi-panel__actions" style={{ marginTop: 8 }}>
        <button
          className="oi-btn oi-btn__large"
          title="一键编译并运行"
          onClick={() => exec(SINGLEFILE_COMPILE_RUN_CMD)}
          disabled={!canCompileRun}
        >
          <PlayCircleIcon size={16} style={{ marginRight: 4 }} />
          编译运行
        </button>
      </div>

      <div className="oi-panel__actions" style={{ marginTop: 8 }}>
        <button
          className="oi-btn oi-btn__large"
          title="编译并启动调试"
          onClick={() => exec(SINGLEFILE_DEBUG_CMD)}
          disabled={!canDebug}
        >
          <BugIcon size={16} style={{ marginRight: 4 }} />
          调试
        </button>
      </div>

      <div className="oi-divider" />

      <div className="oi-panel__section">编译参数</div>

      <div className="oi-panel__row">
        <span style={{ fontSize: '12px', opacity: 0.8 }}>语言标准:</span>
        <button className="oi-btn oi-btn__ghost oi-btn__small" onClick={() => exec(TOGGLE_STD)}>
          {std}
        </button>
      </div>

      <div className="oi-flag-list">
        {COMMON_FLAGS.map(f => (
          <div key={f.value} className="oi-flag-item" title={f.desc} onClick={() => toggleFlag(f.value)}>
            <CheckBox checked={flags.includes(f.value)} onChange={() => {}} />
            <span style={{ marginLeft: 6 }}>{f.label}</span>
          </div>
        ))}
      </div>

      <div className="oi-panel__actions" style={{ marginTop: 10 }}>
        <button
          className="oi-btn oi-btn__ghost oi-btn__large"
          onClick={() => exec(SINGLEFILE_OPEN_SETTINGS_CMD)}
          title="打开编译器详细设置"
        >
          <SettingIcon size={14} style={{ marginRight: 6 }} />
          编译器设置
        </button>
      </div>

      <div className="oi-panel__actions" style={{ marginTop: 6 }}>
        <button
          className="oi-btn oi-btn__ghost oi-btn__large"
          onClick={() => exec(SINGLEFILE_OPEN_TEMPLATE_CMD)}
          title="打开默认源码模板"
        >
          <CodeIcon size={14} style={{ marginRight: 6 }} />
          源码模板
        </button>
      </div>

    </div>
  );
};
