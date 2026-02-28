/**
 * 「题目列表」主面板
 * 题目树状结构 + 资产管理入口
 */
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useInjectable, CommandService, URI, electronEnv } from '@opensumi/ide-core-browser';
import { WorkbenchEditorService } from '@opensumi/ide-editor/lib/browser';
import { IWorkspaceService } from '@opensumi/ide-workspace/lib/common';
import {
  AbstractMenuService,
  ICtxMenuRenderer,
  generateMergedCtxMenu,
} from '@opensumi/ide-core-browser/lib/menu/next';
import {
  FolderOpenIcon,
  FileAddIcon,
  RefreshIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CodeIcon,
  FolderIcon,
  FileIcon,
  DeleteIcon,
  BookIcon,
  AddIcon,
  RootListIcon,
  FileMarkdownIcon,
  SettingIcon,
} from 'tdesign-icons-react';
import { IProblemService, IProblem } from '../../common/problem';
import { IProblemAssetService, ProblemAssets, FileItem } from '../../common/problem-assets';
import { PROBLEM_LIST_CONTEXT_MENU_ID, SINGLEFILE_CREATE_CMD } from './commands.contribution';
import { SINGLEFILE_OPEN_META_CMD } from '../problem-meta/contribution';
import {
  ISampleCase,
  isLargeSample,
  sampleDisplayLabel,
  sampleFileName,
} from '../../common/sample-data';

import '../styles/oi-panel.less';
import '../styles/problem-tree.less';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { ProblemWorkspaceStateService } from '../services/problem-workspace-state.service';

export const PROBLEM_LIST_PANEL = 'problem-list-panel';
export const PROBLEM_LIST_CONTAINER = 'problem-list-container';

type TreeSection = 'source' | 'samples' | 'solutions' | 'others';

const SECTION_LABELS: Record<TreeSection, string> = {
  source: '源码',
  samples: '样例',
  solutions: '题解',
  others: '其他',
};

const SECTIONS: TreeSection[] = ['source', 'samples', 'solutions', 'others'];

interface ProblemNodeProps {
  problem: IProblem;
  isExpanded: boolean;
  isActive: boolean;
  onToggle: (id: string) => void;
  onOpenMeta: (id: string) => void;
  onOpenSource: (problem: IProblem) => void;
  onOpenFolder: (problem: IProblem) => void;
  onDelete: (problem: IProblem) => void;
  onSetRef: (id: string, el: HTMLDivElement | null) => void;
  onContextMenu: (e: React.MouseEvent<HTMLDivElement>, problem: IProblem) => void;
}

const ProblemNode = React.memo((props: ProblemNodeProps) => {
  const {
    problem,
    isExpanded,
    isActive,
    onToggle,
    onOpenMeta,
    onOpenSource,
    onOpenFolder,
    onDelete,
    onSetRef,
    onContextMenu,
  } = props;
  return (
    <div
      className={`tree-node ${isActive ? 'is-active' : ''}`}
      style={{ paddingLeft: 0 }}
      onClick={() => onToggle(problem.meta.id)}
      onContextMenu={e => onContextMenu(e, problem)}
      ref={el => onSetRef(problem.meta.id, el)}
    >
      <div className="node-arrow">{isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}</div>
      <div className="node-content">
        <CodeIcon size={14} style={{ color: 'var(--kt-symbolIcon-class-foreground)' }} />
        <span className="node-label" title={problem.meta.name}>
          {problem.meta.id}
          {problem.meta.name !== problem.meta.id && (
            <span className="node-sub-label">{problem.meta.name}</span>
          )}
        </span>
        {problem.meta.source?.oj && <span className="node-tag">{problem.meta.source.oj}</span>}
      </div>
      <div className="node-actions" onClick={e => e.stopPropagation()}>
        <button
          className="oi-btn oi-btn__icon"
          title="编辑题目信息"
          onClick={() => onOpenMeta(problem.meta.id)}
        >
          <SettingIcon size={14} />
        </button>
        <button
          className="oi-btn oi-btn__icon"
          title="打开源码"
          onClick={() => onOpenSource(problem)}
        >
          <CodeIcon size={14} />
        </button>
        <button
          className="oi-btn oi-btn__icon"
          title="在文件夹中显示"
          onClick={() => onOpenFolder(problem)}
        >
          <FolderOpenIcon size={14} />
        </button>
        <button className="oi-btn oi-btn__icon" title="删除" onClick={() => onDelete(problem)}>
          <DeleteIcon size={14} />
        </button>
      </div>
    </div>
  );
});

interface SectionNodeProps {
  problemId: string;
  section: TreeSection;
  isExpanded: boolean;
  count: number | string;
  onToggle: (id: string, section: TreeSection) => void;
  onCreateSample: (problemId: string) => void;
  onCreateSolution: (problemId: string) => void;
}

const SectionNode = React.memo((props: SectionNodeProps) => {
  const { problemId, section, isExpanded, count, onToggle, onCreateSample, onCreateSolution } =
    props;
  const SectionIcon =
    section === 'source'
      ? CodeIcon
      : section === 'samples'
        ? RootListIcon
        : section === 'solutions'
          ? BookIcon
          : FileIcon;
  return (
    <div
      className="tree-node"
      style={{ paddingLeft: 16 }}
      onClick={() => onToggle(problemId, section)}
    >
      <div className="node-arrow">{isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}</div>
      <div className="node-content">
        <SectionIcon size={13} style={{ opacity: 0.8 }} />
        <span className="node-label" style={{ fontSize: 12 }}>
          {SECTION_LABELS[section]}
        </span>
        <span className="node-sub-label">{count}</span>
      </div>
      <div className="node-actions" onClick={e => e.stopPropagation()}>
        {section === 'samples' && (
          <button
            className="oi-btn oi-btn__icon"
            title="新建样例"
            onClick={() => onCreateSample(problemId)}
          >
            <AddIcon size={14} />
          </button>
        )}
        {section === 'solutions' && (
          <button
            className="oi-btn oi-btn__icon"
            title="新建题解"
            onClick={() => onCreateSolution(problemId)}
          >
            <AddIcon size={14} />
          </button>
        )}
      </div>
    </div>
  );
});

interface FileNodeProps {
  id: string;
  name: string;
  icon: React.ReactNode;
  path?: string;
  onOpenFile?: (path: string) => void;
  placeholder?: boolean;
}

const FileNode = React.memo((props: FileNodeProps) => {
  const { id, name, icon, path, onOpenFile, placeholder } = props;
  return (
    <div
      key={id}
      className={`tree-node is-file${placeholder ? ' is-placeholder' : ''}`}
      style={{ paddingLeft: 32 }}
      onClick={() => {
        if (path && onOpenFile) onOpenFile(path);
      }}
    >
      <div className="node-arrow is-hidden" />
      <div className="node-content">
        {icon}
        <span
          className="node-label"
          style={{ fontWeight: 'normal', opacity: placeholder ? 0.7 : 1 }}
        >
          {name}
        </span>
      </div>
    </div>
  );
});

export const ProblemListPanel: React.FC = () => {
  const problemService = useInjectable<IProblemService>(IProblemService);
  const workspaceService = useInjectable<IWorkspaceService>(IWorkspaceService);
  const commandService = useInjectable<CommandService>(CommandService);
  const editorService = useInjectable<WorkbenchEditorService>(WorkbenchEditorService);
  const menuService = useInjectable<AbstractMenuService>(AbstractMenuService);
  const ctxMenuRenderer = useInjectable<ICtxMenuRenderer>(ICtxMenuRenderer);
  const assetService = useInjectable<IProblemAssetService>(IProblemAssetService);
  const workspaceState = useInjectable<ProblemWorkspaceStateService>(ProblemWorkspaceStateService);

  const initialSnapshot = workspaceState.getSnapshot();
  const [problems, setProblems] = useState<IProblem[]>(initialSnapshot.problems);
  const [assets, setAssets] = useState<Record<string, ProblemAssets>>(initialSnapshot.assets);
  const [loading, setLoading] = useState(false);
  const [hasWorkspace, setHasWorkspace] = useState(true);
  const [workspaceSupported, setWorkspaceSupported] = useState(initialSnapshot.workspaceSupported);
  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'recent'>('all');
  const [expandedProblems, setExpandedProblems] = useState<Record<string, boolean>>({});
  const [expandedSections, setExpandedSections] = useState<
    Record<string, Partial<Record<TreeSection, boolean>>>
  >({});
  const [lastScanAt, setLastScanAt] = useState<number | null>(initialSnapshot.lastScanAt);
  const [scanDurationMs, setScanDurationMs] = useState<number>(initialSnapshot.scanDurationMs);
  const [activeProblemId, setActiveProblemId] = useState<string | undefined>(
    problemService.activeProblem?.meta.id,
  );
  const [samplesByProblem, setSamplesByProblem] = useState<Record<string, ISampleCase[]>>({});
  const [samplesLoading, setSamplesLoading] = useState<Record<string, boolean>>({});

  const listBodyRef = useRef<HTMLDivElement | null>(null);
  const problemNodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const samplesLoadingRef = useRef<Record<string, boolean>>({});
  const userCollapsedProblemsRef = useRef<Record<string, boolean>>({});

  const debouncedSearchText = useDebouncedValue(
    searchText,
    electronEnv.isElectronRenderer ? 0 : 200,
  );

  const loadSamplesForProblem = useCallback(
    async (id: string) => {
      if (!id || samplesLoadingRef.current[id]) return;
      samplesLoadingRef.current = { ...samplesLoadingRef.current, [id]: true };
      setSamplesLoading(prev => ({ ...prev, [id]: true }));
      try {
        const samples = await problemService.loadSamples(id);
        setSamplesByProblem(prev => ({ ...prev, [id]: samples }));
      } catch {
        setSamplesByProblem(prev => ({ ...prev, [id]: [] }));
      } finally {
        samplesLoadingRef.current = { ...samplesLoadingRef.current, [id]: false };
        setSamplesLoading(prev => ({ ...prev, [id]: false }));
      }
    },
    [problemService],
  );

  const ensureSamplesLoaded = useCallback(
    (id: string) => {
      if (!id) return;
      if (samplesByProblem[id]) return;
      void loadSamplesForProblem(id);
    },
    [samplesByProblem, loadSamplesForProblem],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await workspaceState.refresh();
    } finally {
      setLoading(false);
    }
  }, [workspaceState]);

  useEffect(() => {
    const snapshot = workspaceState.getSnapshot();
    setProblems(snapshot.problems);
    setAssets(snapshot.assets);
    setWorkspaceSupported(snapshot.workspaceSupported);
    setLastScanAt(snapshot.lastScanAt);
    setScanDurationMs(snapshot.scanDurationMs);
    const disposable = workspaceState.onDidChange(next => {
      setProblems(next.problems);
      setAssets(next.assets);
      setWorkspaceSupported(next.workspaceSupported);
      setLastScanAt(next.lastScanAt);
      setScanDurationMs(next.scanDurationMs);
    });
    return () => disposable.dispose();
  }, [workspaceState]);

  useEffect(() => {
    if (!activeProblemId) return;
    void loadSamplesForProblem(activeProblemId);
  }, [activeProblemId, lastScanAt, loadSamplesForProblem]);

  useEffect(() => {
    void workspaceState.ensureInitialized();
  }, [workspaceState]);

  const sampleNameCollator = useMemo(
    () => new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }),
    [],
  );

  const resolveSampleFsPath = useCallback((problem: IProblem, relPath?: string) => {
    if (!relPath) return undefined;
    if (relPath.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(relPath)) return relPath;
    return `${problem.rootDir}/${relPath.replace(/^\.\//, '')}`;
  }, []);

  const buildSampleItems = useCallback(
    (problem: IProblem, cases: ISampleCase[]) => {
      const items: (FileItem & { sampleId?: string })[] = [];
      for (const c of cases) {
        if (isLargeSample(c)) {
          const inputFsPath = resolveSampleFsPath(problem, c.inputPath);
          if (inputFsPath) {
            items.push({
              name: sampleFileName(c.inputPath) || 'input',
              path: inputFsPath,
              isDirectory: false,
              sampleId: `${c.id}:in`,
            });
          }
          const outputFsPath = resolveSampleFsPath(problem, c.expectedPath);
          if (outputFsPath) {
            items.push({
              name: sampleFileName(c.expectedPath) || 'output',
              path: outputFsPath,
              isDirectory: false,
              sampleId: `${c.id}:out`,
            });
          }
        } else {
          items.push({
            name: sampleDisplayLabel(c),
            path: problem.samplesPath,
            isDirectory: false,
            sampleId: c.id,
          });
        }
      }
      items.sort((a, b) => sampleNameCollator.compare(a.name, b.name));
      return items;
    },
    [resolveSampleFsPath, sampleNameCollator],
  );

  useEffect(() => {
    const checkRoots = async () => {
      const roots = await workspaceService.roots;
      setHasWorkspace(!!roots.length);
    };
    checkRoots();
    const disposable = workspaceService.onWorkspaceChanged(roots => {
      setHasWorkspace(!!roots.length);
    });
    return () => disposable.dispose();
  }, [workspaceService]);

  const openProblemSource = useCallback(
    async (problem: IProblem) => {
      await editorService.open(URI.file(problem.sourcePath), { preview: false });
    },
    [editorService],
  );

  const openProblemFolder = useCallback(
    async (problem: IProblem) => {
      await editorService.open(URI.file(problem.rootDir));
    },
    [editorService],
  );

  const openFile = useCallback(
    async (path: string) => {
      await editorService.open(URI.file(path), { preview: false });
    },
    [editorService],
  );

  const problemContextMenu = useMemo(
    () => menuService.createMenu(PROBLEM_LIST_CONTEXT_MENU_ID),
    [menuService],
  );

  useEffect(() => () => problemContextMenu.dispose(), [problemContextMenu]);

  const createSolution = useCallback(
    async (problem: IProblem) => {
      const solutionPath = await assetService.createSolution(problem);
      await refresh();
      await openFile(solutionPath);
    },
    [assetService, refresh, openFile],
  );

  const createSample = useCallback(
    async (problem: IProblem) => {
      const { inPath } = await assetService.createSample(problem);
      await refresh();
      await openFile(inPath);
    },
    [assetService, refresh, openFile],
  );

  const deleteProblem = useCallback(
    async (problem: IProblem) => {
      const ok = confirm(`确定删除题目 ${problem.meta.id} 吗？该操作会移动到回收站。`);
      if (!ok) return;
      await problemService.deleteProblem(problem.meta.id);
      refresh();
    },
    [problemService, refresh],
  );

  const handleSetProblemRef = useCallback((id: string, el: HTMLDivElement | null) => {
    problemNodeRefs.current[id] = el;
  }, []);

  const handleOpenMeta = useCallback(
    (id: string) => {
      void commandService.executeCommand(SINGLEFILE_OPEN_META_CMD, id);
    },
    [commandService],
  );

  const handleOpenSource = useCallback(
    (problem: IProblem) => {
      void openProblemSource(problem);
    },
    [openProblemSource],
  );

  const handleOpenFolder = useCallback(
    (problem: IProblem) => {
      void openProblemFolder(problem);
    },
    [openProblemFolder],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, problem: IProblem) => {
      e.preventDefault();
      e.stopPropagation();
      const menuNodes = generateMergedCtxMenu({
        menus: problemContextMenu,
        args: [problem.meta.id],
      });
      ctxMenuRenderer.show({
        anchor: { x: e.clientX, y: e.clientY },
        menuNodes,
      });
    },
    [ctxMenuRenderer, problemContextMenu],
  );

  const handleDeleteProblem = useCallback(
    (problem: IProblem) => {
      void deleteProblem(problem);
    },
    [deleteProblem],
  );

  const handleCreateSample = useCallback(
    (problemId: string) => {
      const problem = problems.find(p => p.meta.id === problemId);
      if (!problem) return;
      void createSample(problem);
    },
    [problems, createSample],
  );

  const handleCreateSolution = useCallback(
    (problemId: string) => {
      const problem = problems.find(p => p.meta.id === problemId);
      if (!problem) return;
      void createSolution(problem);
    },
    [problems, createSolution],
  );

  const toggleProblem = useCallback(
    (id: string) => {
      setExpandedProblems(prev => {
        const next = !prev[id];
        if (next) {
          delete userCollapsedProblemsRef.current[id];
          ensureSamplesLoaded(id);
        } else {
          userCollapsedProblemsRef.current[id] = true;
        }
        return { ...prev, [id]: next };
      });
    },
    [ensureSamplesLoaded],
  );

  const toggleSection = useCallback(
    (id: string, section: TreeSection) => {
      setExpandedSections(prev => {
        const next = !prev[id]?.[section];
        if (section === 'samples' && next) ensureSamplesLoaded(id);
        return {
          ...prev,
          [id]: {
            ...prev[id],
            [section]: next,
          },
        };
      });
    },
    [ensureSamplesLoaded],
  );

  const isSectionExpanded = (id: string, section: TreeSection) => {
    return expandedSections[id]?.[section] ?? true;
  };

  const filteredProblems = useMemo(() => {
    const query = (electronEnv.isElectronRenderer ? searchText : debouncedSearchText)
      .trim()
      .toLowerCase();
    let list = [...problems];
    if (activeTab === 'recent') {
      list.sort((a, b) => (b.meta.updatedAt || '').localeCompare(a.meta.updatedAt || ''));
    } else {
      list.sort((a, b) => a.meta.id.localeCompare(b.meta.id));
    }
    if (!query) return list;
    return list.filter(p => {
      const oj = p.meta.source?.oj || '';
      return `${p.meta.id} ${p.meta.name} ${oj}`.toLowerCase().includes(query);
    });
  }, [problems, searchText, debouncedSearchText, activeTab]);

  useEffect(() => {
    const disposable = problemService.onActiveProblemChange(p => {
      const id = p?.meta.id;
      setActiveProblemId(id);
      if (id && !userCollapsedProblemsRef.current[id]) {
        setExpandedProblems(prev => ({ ...prev, [id]: true }));
        ensureSamplesLoaded(id);
      }
    });
    const current = problemService.activeProblem?.meta.id;
    if (current) {
      setActiveProblemId(current);
      if (!userCollapsedProblemsRef.current[current]) {
        setExpandedProblems(prev => ({ ...prev, [current]: true }));
        ensureSamplesLoaded(current);
      }
    }
    return () => disposable.dispose();
  }, [problemService, ensureSamplesLoaded]);

  useEffect(() => {
    if (!activeProblemId) return;
    const node = problemNodeRefs.current[activeProblemId];
    if (node) {
      node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [activeProblemId, filteredProblems.length]);

  if (!hasWorkspace) {
    return (
      <div className="problem-list-container">
        <div className="problem-toolbar">
          <div className="problem-toolbar__header">
            <span className="problem-toolbar__title">题目列表</span>
          </div>
        </div>
        <div className="empty-state">
          <FolderOpenIcon style={{ fontSize: 24 }} />
          <span>请先打开一个文件夹</span>
        </div>
      </div>
    );
  }

  if (!workspaceSupported) {
    return (
      <div className="problem-list-container">
        <div className="problem-toolbar">
          <div className="problem-toolbar__header">
            <span className="problem-toolbar__title">题目列表</span>
          </div>
        </div>
        <div className="empty-state">
          <FolderOpenIcon style={{ fontSize: 24 }} />
          <span>当前文件夹不是 OptiCode 题目结构</span>
          <span style={{ fontSize: 11, opacity: 0.7 }}>题目目录结构：P1001/P1001.cpp</span>
          <button
            className="oi-btn oi-btn__primary"
            style={{ marginTop: 8 }}
            onClick={() => commandService.executeCommand(SINGLEFILE_CREATE_CMD)}
          >
            新建题目
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="problem-list-container">
      {/* 顶部工具栏 */}
      <div className="problem-toolbar">
        <div className="problem-toolbar__header">
          <span className="problem-toolbar__title">题目列表</span>
          <div className="problem-toolbar__actions">
            <button
              className="oi-btn oi-btn__icon"
              title="新建题目"
              onClick={() => commandService.executeCommand(SINGLEFILE_CREATE_CMD)}
              disabled={loading}
            >
              <FileAddIcon size={16} />
            </button>
            <button
              className="oi-btn oi-btn__icon"
              title="刷新"
              onClick={refresh}
              disabled={loading}
            >
              <RefreshIcon size={16} />
            </button>
          </div>
        </div>

        <div className="problem-search-box">
          <input
            className="problem-search-input"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="搜索..."
            spellCheck={false}
          />
        </div>

        <div className="problem-filter-tabs">
          <button
            className={`oi-btn oi-btn__tab ${activeTab === 'all' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            全部
          </button>
          <button
            className={`oi-btn oi-btn__tab ${activeTab === 'recent' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('recent')}
          >
            最近
          </button>
        </div>
      </div>

      {/* 题目列表主体 */}
      <div className="problem-list-body" ref={listBodyRef}>
        {loading && filteredProblems.length === 0 && (
          <div className="empty-state">
            <span>正在扫描...</span>
          </div>
        )}

        {!loading && filteredProblems.length === 0 && (
          <div className="empty-state">
            <span>暂无题目</span>
            <button
              className="oi-btn oi-btn__primary"
              style={{ marginTop: 8 }}
              onClick={() => commandService.executeCommand(SINGLEFILE_CREATE_CMD)}
            >
              新建题目
            </button>
          </div>
        )}

        {filteredProblems.map(p => {
          const isExpanded = expandedProblems[p.meta.id];
          const itemAssets = assets[p.meta.id];
          const isActive = p.meta.id === activeProblemId;

          return (
            <React.Fragment key={p.meta.id}>
              <ProblemNode
                problem={p}
                isExpanded={!!isExpanded}
                isActive={isActive}
                onToggle={toggleProblem}
                onOpenMeta={handleOpenMeta}
                onOpenSource={handleOpenSource}
                onOpenFolder={handleOpenFolder}
                onDelete={handleDeleteProblem}
                onSetRef={handleSetProblemRef}
                onContextMenu={handleContextMenu}
              />

              {isExpanded &&
                SECTIONS.map(section => {
                  const sectionExpanded = isSectionExpanded(p.meta.id, section);
                  const sampleCases =
                    section === 'samples' ? samplesByProblem[p.meta.id] || [] : [];
                  const files =
                    section === 'samples'
                      ? (buildSampleItems(p, sampleCases) as (FileItem & { sampleId?: string })[])
                      : itemAssets?.[section] || [];
                  const count =
                    section === 'samples' && !samplesByProblem[p.meta.id] ? '…' : files.length;

                  return (
                    <React.Fragment key={section}>
                      <SectionNode
                        problemId={p.meta.id}
                        section={section}
                        isExpanded={sectionExpanded}
                        count={count}
                        onToggle={toggleSection}
                        onCreateSample={handleCreateSample}
                        onCreateSolution={handleCreateSolution}
                      />

                      {sectionExpanded && section === 'samples' && samplesLoading[p.meta.id] && (
                        <FileNode
                          id={`${p.meta.id}-samples-loading`}
                          name="加载样例..."
                          icon={<FileIcon style={{ opacity: 0.4 }} />}
                          placeholder
                        />
                      )}

                      {sectionExpanded &&
                        files.map(file => {
                          let FileItemIcon = file.isDirectory ? FolderIcon : FileIcon;
                          if (!file.isDirectory) {
                            if (section === 'source') {
                              FileItemIcon = CodeIcon;
                            } else if (section === 'solutions') {
                              FileItemIcon = FileMarkdownIcon;
                            } else if (section === 'samples') {
                              FileItemIcon = FileIcon;
                            }
                          }

                          return (
                            <FileNode
                              key={(file as any).sampleId || file.path}
                              id={(file as any).sampleId || file.path}
                              name={file.name}
                              path={file.path}
                              icon={<FileItemIcon style={{ opacity: 0.6 }} />}
                              onOpenFile={openFile}
                            />
                          );
                        })}
                    </React.Fragment>
                  );
                })}
            </React.Fragment>
          );
        })}
      </div>

      {/* 底部状态栏 */}
      <div className="problem-statusbar">
        <span className="status-item">Total: {filteredProblems.length}</span>
        {lastScanAt && (
          <span className="status-item" style={{ marginLeft: 'auto', opacity: 0.7 }}>
            {scanDurationMs}ms
          </span>
        )}
      </div>
    </div>
  );
};
