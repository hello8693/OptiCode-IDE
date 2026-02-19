/**
 * 「自测」侧栏面板 —— 样例测试
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CommandService, URI, useInjectable } from '@opensumi/ide-core-browser';
import { WorkbenchEditorService } from '@opensumi/ide-editor/lib/browser';
import {
  TaskIcon as TestIcon,
  CodeIcon,
  AddIcon,
  EditIcon,
  InfoCircleIcon,
  ToolsIcon,
  PlayIcon,
  DeleteIcon,
  ErrorCircleIcon as WarningCircleIcon,
  TimeIcon,
  DataIcon
} from 'tdesign-icons-react';

import { IJudgeService } from '../../common/judge';
import { IProblemService, IProblem } from '../../common/problem';
import { ISampleCase, ISampleResult, Verdict, isLargeSample, sampleDisplayLabel, sampleFileName } from '../../common/sample-data';
import { SINGLEFILE_COMPILE_CMD } from '../compile-run/contribution';

import '../styles/oi-panel.less';

export const SAMPLE_TEST_PANEL = 'sample-test-panel';
export const SAMPLE_TEST_CONTAINER = 'sample-test-container';

/* ────────── helpers ────────── */
let _uuid = 0;
function uuid(): string {
  return `sc-${Date.now()}-${++_uuid}`;
}

export const SampleTestPanel: React.FC = () => {
  const commandService = useInjectable<CommandService>(CommandService);
  const editorService = useInjectable<WorkbenchEditorService>(WorkbenchEditorService);
  const problemService = useInjectable<IProblemService>(IProblemService);
  const judgeService = useInjectable<IJudgeService>(IJudgeService);

  const [activeProblem, setActiveProblem] = useState<IProblem | undefined>(
    problemService.activeProblem,
  );
  const [cases, setCases] = useState<ISampleCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Record<string, ISampleResult>>({});

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLoadedId = useRef<string>('');

  /* ── 加载样例 ── */
  const loadCases = useCallback(async (problem: IProblem | undefined) => {
    if (!problem) {
      setCases([]);
      lastLoadedId.current = '';
      return;
    }
    if (problem.meta.id === lastLoadedId.current) return;
    lastLoadedId.current = problem.meta.id;
    setLoading(true);
    try {
      const samples = await problemService.loadSamples(problem.meta.id);
      setCases(samples);
    } catch {
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, [problemService]);

  /* ── 订阅 activeProblem 变化 ── */
  useEffect(() => {
    const disposable = problemService.onActiveProblemChange(p => {
      setActiveProblem(p);
      loadCases(p);
    });
    const current = problemService.activeProblem;
    setActiveProblem(current);
    loadCases(current);
    return () => disposable.dispose();
  }, [problemService, loadCases]);

  /* ── 防抖自动保存 ── */
  const scheduleSave = useCallback((problemId: string, nextCases: ISampleCase[]) => {
    if (!problemId) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }
    saveTimer.current = globalThis.setTimeout(() => {
      void problemService.saveSamples(problemId, nextCases);
    }, 600);
  }, [problemService]);

  useEffect(() => () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
  }, []);

  /* ── CRUD ── */
  const addCase = () => {
    if (!activeProblem) return;
    const newCase: ISampleCase = {
      id: uuid(),
      label: `样例 ${cases.length + 1}`,
      input: '',
      expected: '',
    };
    const next = [...cases, newCase];
    setCases(next);
    scheduleSave(activeProblem.meta.id, next);
  };

  const removeCase = async (id: string) => {
    if (!activeProblem) return;
    const target = cases.find(c => c.id === id);
    if (target?.inputPath || target?.expectedPath) {
      try {
        await problemService.removeSampleFiles(activeProblem.meta.id, target);
      } catch {
        // ignore
      }
    }
    const next = cases.filter(c => c.id !== id);
    setCases(next);
    scheduleSave(activeProblem.meta.id, next);
  };

  const updateField = (id: string, field: 'input' | 'expected', value: string) => {
    if (!activeProblem) return;
    const next = cases.map(c => (c.id === id ? { ...c, [field]: value } : c));
    setCases(next);
    scheduleSave(activeProblem.meta.id, next);
  };

  const openSampleFile = (relPath?: string) => {
    if (!activeProblem || !relPath) return;
    const normalized = relPath.replace(/\\/g, '/');
    const absPath = normalized.startsWith('/')
      ? normalized
      : `${activeProblem.rootDir}/${normalized.replace(/^\.\//, '')}`;
    editorService.open(URI.file(absPath), { preview: false });
  };

  /* ── 运行 ── */
  const runCase = useCallback(async (sample: ISampleCase): Promise<ISampleResult> => {
    if (!activeProblem) {
      return {
        caseId: sample.id,
        verdict: 'RE',
        stdout: '',
        stderr: '无活动题目',
        timeMs: 0,
        exitCode: -1,
      };
    }
    return judgeService.runSample(activeProblem, sample);
  }, [activeProblem, judgeService]);

  const runAll = useCallback(async () => {
    if (!activeProblem || cases.length === 0) return;

    setRunning(true);
    setResults(prev => {
      const next: Record<string, ISampleResult> = { ...prev };
      cases.forEach(c => {
        next[c.id] = {
          caseId: c.id,
          verdict: 'PENDING',
          stdout: '',
          stderr: '',
          timeMs: 0,
          exitCode: 0,
        } as ISampleResult;
      });
      return next;
    });

    try {
      const compiled = await commandService.executeCommand(SINGLEFILE_COMPILE_CMD);
      if (!compiled) {
        setResults(prev => {
          const next: Record<string, ISampleResult> = { ...prev };
          cases.forEach(c => {
            next[c.id] = {
              caseId: c.id,
              verdict: 'CE',
              stdout: '',
              stderr: '编译失败，未运行样例',
              timeMs: 0,
              exitCode: -1,
            } as ISampleResult;
          });
          return next;
        });
        return;
      }

      for (const c of cases) {
        setResults(prev => ({
          ...prev,
          [c.id]: { ...prev[c.id], verdict: 'RUNNING' as Verdict },
        }));

        const res = await runCase(c);
        setResults(prev => ({ ...prev, [c.id]: res }));
      }
    } finally {
      setRunning(false);
    }
  }, [activeProblem, cases, commandService, runCase]);

  const runSingle = useCallback(async (c: ISampleCase) => {
    if (!activeProblem) return;
    setRunning(true);
    setResults(prev => ({
      ...prev,
      [c.id]: {
        caseId: c.id,
        verdict: 'PENDING',  
        stdout: '',
        stderr: '',
        timeMs: 0,
        exitCode: 0,
      },
    }));

    try {
      // 编译
      const compiled = await commandService.executeCommand(SINGLEFILE_COMPILE_CMD);
      if (!compiled) {
        setResults(prev => ({
          ...prev,
          [c.id]: {
            caseId: c.id,
            verdict: 'CE',
            stdout: '',
            stderr: '编译失败，未运行样例',
            timeMs: 0,
            exitCode: -1,
          },
        }));
        return;
      }

      // 运行
      setResults(prev => ({
        ...prev,
        [c.id]: { ...prev[c.id], verdict: 'RUNNING' },
      }));

      const res = await runCase(c);
      setResults(prev => ({ ...prev, [c.id]: res }));
    } finally {
      setRunning(false);
    }
  }, [activeProblem, commandService, runCase]);

  /* ── 无活动题目 ── */
  if (!activeProblem) {
    return (
      <div className="oi-panel">
        <div className="oi-panel__header">
          <span className="oi-panel__title">样例自测</span>
        </div>
        <div className="oi-empty">
          <TestIcon size={32} style={{ opacity: 0.2, marginBottom: 12 }} />
          <span>请先打开一道题目的 .cpp 文件</span>
          <span style={{ fontSize: 10, opacity: 0.6 }}>
            题目目录结构：P1001/P1001.cpp
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="oi-panel">
      <div className="oi-panel__header">
        <span className="oi-panel__title">样例自测</span>
      </div>

      <div className="oi-panel__body-scroll">
        {/* ── 当前题目信息 ── */}
        <div className="oi-info">
          <CodeIcon size={14} style={{ marginRight: 6, opacity: 0.6 }} />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
            {activeProblem.meta.id}
          </span>
          <span style={{ fontSize: 10, opacity: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}><TimeIcon size={12} />{activeProblem.meta.timeLimitMs}ms</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}><DataIcon size={12} />{activeProblem.meta.memoryLimitMb}MB</span>
          </span>
        </div>

        <div className="oi-panel__actions" style={{ marginTop: 12 }}>
          <button className="oi-btn oi-btn__primary" onClick={addCase}>
            <AddIcon size={14} style={{ marginRight: 4 }} />
            添加样例
          </button>
        </div>

        <div className="oi-divider" />

        {/* ── 样例列表 ── */}
        {loading && <div className="oi-info">正在加载...</div>}

        {!loading && cases.length === 0 && (
          <div className="oi-empty" style={{ padding: '24px 0' }}>
            <EditIcon size={24} style={{ opacity: 0.1, marginBottom: 8 }} />
            <span>暂无样例数据</span>
          </div>
        )}

        {cases.map((c, idx) => {
          const res = results[c.id];
          const large = isLargeSample(c);
          const title = sampleDisplayLabel(c) || `样例 ${idx + 1}`;
          return (
            <div key={c.id} className="oi-case">
              <div className="oi-case__head">
                <InfoCircleIcon size={14} style={{ marginRight: 6, opacity: 0.5 }} />
                <span style={{ fontWeight: 500 }}>{title}</span>
                <div className="oi-case__head-actions" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button
                    className="oi-btn oi-btn__ghost oi-btn__tiny"
                    onClick={() => runSingle(c)}
                    disabled={running}
                    title="运行该样例"
                  >
                    <PlayIcon size={14} />
                  </button>
                  <button
                    className="oi-btn oi-btn__ghost oi-btn__tiny oi-btn__danger"
                    onClick={() => removeCase(c.id)}
                    title="删除样例"
                  >
                    <DeleteIcon size={14} />
                  </button>
                </div>
              </div>
              <div className="oi-case__body">
                <div className="oi-case__col">
                  <div className="oi-case__col-label">输入 (Standard Input)</div>
                  {large ? (
                    <div className="oi-sample-file">
                      <button
                        className="oi-btn oi-btn__ghost oi-btn__small"
                        onClick={() => openSampleFile(c.inputPath)}
                        disabled={!c.inputPath}
                        title={c.inputPath ? `打开 ${sampleFileName(c.inputPath)}` : '缺少输入文件'}
                      >
                        打开 {sampleFileName(c.inputPath) || '输入文件'}
                      </button>
                      <div className="oi-sample-file__hint">大样例请在文件中编辑</div>
                    </div>
                  ) : (
                    <textarea
                      className="oi-textarea"
                      value={c.input}
                      onChange={e => updateField(c.id, 'input', e.target.value)}
                      placeholder="在此输入或粘贴测试数据"
                      spellCheck={false}
                    />
                  )}
                </div>
                <div className="oi-case__col">
                  <div className="oi-case__col-label">期望输出 (Expected Output)</div>
                  {large ? (
                    <div className="oi-sample-file">
                      <button
                        className="oi-btn oi-btn__ghost oi-btn__small"
                        onClick={() => openSampleFile(c.expectedPath)}
                        disabled={!c.expectedPath}
                        title={c.expectedPath ? `打开 ${sampleFileName(c.expectedPath)}` : '缺少输出文件'}
                      >
                        打开 {sampleFileName(c.expectedPath) || '输出文件'}
                      </button>
                      <div className="oi-sample-file__hint">大样例请在文件中编辑</div>
                    </div>
                  ) : (
                    <textarea
                      className="oi-textarea"
                      value={c.expected}
                      onChange={e => updateField(c.id, 'expected', e.target.value)}
                      placeholder="在此输入期望结果（用于对比）"
                      spellCheck={false}
                    />
                  )}
                </div>
                <div className="oi-case__col">
                  <div className="oi-case__col-label">程序输出 (Program Output)</div>
                  <textarea
                    className="oi-textarea"
                    readOnly
                    value={res?.stdout || ''}
                    spellCheck={false}
                    placeholder="运行后显示程序输出"
                  />
                  {res?.stderr && (
                    <div className="oi-info" style={{ marginTop: 6 }}>
                      <WarningCircleIcon size={12} />
                      <span style={{ whiteSpace: 'pre-wrap' }}>{res.stderr}</span>
                    </div>
                  )}
                  {res && (
                    <div className={`oi-verdict oi-verdict--${res.verdict}`}>
                      {res.verdict} · {res.timeMs}ms · exit {res.exitCode}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {cases.length > 0 && (
          <div className="oi-panel__actions" style={{ marginTop: 16, marginBottom: 24 }}>
            <button
              className="oi-btn oi-btn__ghost"
              onClick={() => commandService.executeCommand(SINGLEFILE_COMPILE_CMD)}
              disabled={running}
              title="重新编译当前题目"
            >
              <ToolsIcon size={14} style={{ marginRight: 6 }} />
              重新编译
            </button>
            <button className="oi-btn oi-btn__large" onClick={runAll} disabled={running}>
              <PlayIcon size={14} style={{ marginRight: 6 }} />
              {running ? '运行中...' : '运行所有样例'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
