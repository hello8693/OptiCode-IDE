/**
 * 「题目列表」主面板
 * 题目树状结构 + 资产管理入口
 */
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useInjectable, CommandService, URI } from '@opensumi/ide-core-browser';
import { WorkbenchEditorService } from '@opensumi/ide-editor/lib/browser';
import { IWorkspaceService } from '@opensumi/ide-workspace/lib/common';
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
import { SINGLEFILE_CREATE_CMD, SINGLEFILE_OPEN_META_CMD } from '../compile-run/contribution';
import { ISampleCase, sampleDisplayLabel } from '../../common/sample-data';

import '../styles/oi-panel.less';
import '../styles/problem-tree.less';

export const PROBLEM_LIST_PANEL = 'problem-list-panel';
export const PROBLEM_LIST_CONTAINER = 'problem-list-container';

type TreeSection = 'source' | 'samples' | 'solutions' | 'others';

const SECTION_LABELS: Record<TreeSection, string> = {
  source: '源码',
  samples: '样例',
  solutions: '题解',
  others: '其他',
};

export const ProblemListPanel: React.FC = () => {
  const problemService = useInjectable<IProblemService>(IProblemService);
  const workspaceService = useInjectable<IWorkspaceService>(IWorkspaceService);
  const commandService = useInjectable<CommandService>(CommandService);
  const editorService = useInjectable<WorkbenchEditorService>(WorkbenchEditorService);
  const assetService = useInjectable<IProblemAssetService>(IProblemAssetService);

  const [problems, setProblems] = useState<IProblem[]>([]);
  const [assets, setAssets] = useState<Record<string, ProblemAssets>>({});
  const [loading, setLoading] = useState(false);
  const [hasWorkspace, setHasWorkspace] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'recent'>('all');
  const [expandedProblems, setExpandedProblems] = useState<Record<string, boolean>>({});
  const [expandedSections, setExpandedSections] = useState<Record<string, Partial<Record<TreeSection, boolean>>>>({});
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);
  const [scanDurationMs, setScanDurationMs] = useState<number>(0);
  const [activeProblemId, setActiveProblemId] = useState<string | undefined>(problemService.activeProblem?.meta.id);
  const [samplesByProblem, setSamplesByProblem] = useState<Record<string, ISampleCase[]>>({});
  const [samplesLoading, setSamplesLoading] = useState<Record<string, boolean>>({});

  const listBodyRef = useRef<HTMLDivElement | null>(null);
  const problemNodeRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const refresh = useCallback(async () => {
    const start = Date.now();
    setLoading(true);
    try {
      const list = await problemService.listProblems();
      setProblems(list);
      const nextAssets = await assetService.listAssetsForProblems(list);
      setAssets(nextAssets);
      setLastScanAt(Date.now());
      setScanDurationMs(Date.now() - start);
      const activeId = problemService.activeProblem?.meta.id;
      if (activeId) {
        void loadSamplesForProblem(activeId);
      }
    } catch {
      setProblems([]);
      setAssets({});
    } finally {
      setLoading(false);
    }
  }, [problemService, assetService]);

  const loadSamplesForProblem = useCallback(async (id: string) => {
    if (!id || samplesLoading[id]) return;
    setSamplesLoading(prev => ({ ...prev, [id]: true }));
    try {
      const samples = await problemService.loadSamples(id);
      setSamplesByProblem(prev => ({ ...prev, [id]: samples }));
    } catch {
      setSamplesByProblem(prev => ({ ...prev, [id]: [] }));
    } finally {
      setSamplesLoading(prev => ({ ...prev, [id]: false }));
    }
  }, [problemService, samplesLoading]);

  const ensureSamplesLoaded = useCallback((id: string) => {
    if (!id) return;
    if (samplesByProblem[id]) return;
    void loadSamplesForProblem(id);
  }, [samplesByProblem, loadSamplesForProblem]);

  useEffect(() => {
    const checkRoots = async () => {
      const roots = await workspaceService.roots;
      setHasWorkspace(!!roots.length);
      if (roots.length) refresh();
    };
    checkRoots();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [workspaceService, refresh]);

  const openProblemSource = async (problem: IProblem) => {
    await editorService.open(URI.file(problem.sourcePath), { preview: false });
  };

  const openProblemFolder = async (problem: IProblem) => {
    await editorService.open(URI.file(problem.rootDir));
  };

  const openFile = async (path: string) => {
    await editorService.open(URI.file(path), { preview: false });
  };

  const createSolution = async (problem: IProblem) => {
    const solutionPath = await assetService.createSolution(problem);
    await refresh();
    await openFile(solutionPath);
  };

  const createSample = async (problem: IProblem) => {
    const { inPath } = await assetService.createSample(problem);
    await refresh();
    await openFile(inPath);
  };

  const deleteProblem = async (problem: IProblem) => {
    const ok = confirm(`确定删除题目 ${problem.meta.id} 吗？该操作会移动到回收站。`);
    if (!ok) return;
    await problemService.deleteProblem(problem.meta.id);
    refresh();
  };

  const toggleProblem = (id: string) => {
    setExpandedProblems(prev => {
      const next = !prev[id];
      if (next) ensureSamplesLoaded(id);
      return { ...prev, [id]: next };
    });
  };

  const toggleSection = (id: string, section: TreeSection) => {
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
  };

  const isSectionExpanded = (id: string, section: TreeSection) => {
    return expandedSections[id]?.[section] ?? true;
  };

  const filteredProblems = useMemo(() => {
    const query = searchText.trim().toLowerCase();
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
  }, [problems, searchText, activeTab]);

  useEffect(() => {
    const disposable = problemService.onActiveProblemChange(p => {
      const id = p?.meta.id;
      setActiveProblemId(id);
      if (id) {
        setExpandedProblems(prev => ({ ...prev, [id]: true }));
        ensureSamplesLoaded(id);
      }
    });
    const current = problemService.activeProblem?.meta.id;
    if (current) {
      setActiveProblemId(current);
      setExpandedProblems(prev => ({ ...prev, [current]: true }));
      ensureSamplesLoaded(current);
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
              {/* 题目节点 Level 0 */}
              <div
                className={`tree-node ${isActive ? 'is-active' : ''}`}
                style={{ paddingLeft: 0 }}
                onClick={() => toggleProblem(p.meta.id)}
                ref={el => {
                  problemNodeRefs.current[p.meta.id] = el;
                }}
              >
                <div className="node-arrow">
                  {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                </div>
                <div className="node-content">
                  <CodeIcon size={14} style={{ color: 'var(--kt-symbolIcon-class-foreground)' }} />
                  <span className="node-label" title={p.meta.name}>
                    {p.meta.id}
                    {p.meta.name !== p.meta.id && <span className="node-sub-label">{p.meta.name}</span>}
                  </span>
                  {p.meta.source?.oj && (
                    <span className="node-tag">{p.meta.source.oj}</span>
                  )}
                </div>
                <div className="node-actions" onClick={e => e.stopPropagation()}>
                    <button
                      className="oi-btn oi-btn__icon"
                      title="编辑题目信息"
                      onClick={() => commandService.executeCommand(SINGLEFILE_OPEN_META_CMD, p.meta.id)}
                    >
                      <SettingIcon size={14} />
                    </button>
                    <button className="oi-btn oi-btn__icon" title="打开源码" onClick={() => openProblemSource(p)}>
                      <CodeIcon size={14} />
                    </button>
                    <button className="oi-btn oi-btn__icon" title="在文件夹中显示" onClick={() => openProblemFolder(p)}>
                      <FolderOpenIcon size={14} />
                    </button>
                    <button className="oi-btn oi-btn__icon" title="删除" onClick={() => deleteProblem(p)}>
                      <DeleteIcon size={14} />
                    </button>
                </div>
              </div>

              {/* 展开内容 */}
              {isExpanded && (['source', 'samples', 'solutions', 'others'] as TreeSection[]).map(section => {
                 const sectionExpanded = isSectionExpanded(p.meta.id, section);
                 const sampleCases = section === 'samples' ? (samplesByProblem[p.meta.id] || []) : [];
                 const files = section === 'samples'
                   ? (sampleCases.map(c => ({
                     name: sampleDisplayLabel(c),
                     path: p.samplesPath,
                     isDirectory: false,
                     sampleId: c.id,
                   })) as (FileItem & { sampleId: string })[])
                   : (itemAssets?.[section] || []);
                 // 图标映射
                 const SectionIcon = section === 'source' ? CodeIcon
                                   : section === 'samples' ? RootListIcon
                                   : section === 'solutions' ? BookIcon 
                                   : FileIcon; 
                 
                 return (
                   <React.Fragment key={section}>
                     {/* 分类节点 Level 1 */}
                     <div
                        className="tree-node"
                        style={{ paddingLeft: 16 }}
                        onClick={() => toggleSection(p.meta.id, section)}
                     >
                       <div className="node-arrow">
                         {sectionExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                       </div>
                       <div className="node-content">
                         <SectionIcon size={13} style={{ opacity: 0.8 }} />
                         <span className="node-label" style={{ fontSize: 12 }}>{SECTION_LABELS[section]}</span>
                         <span className="node-sub-label">
                           {section === 'samples' && !samplesByProblem[p.meta.id] ? '…' : files.length}
                         </span>
                       </div>
                       <div className="node-actions" onClick={e => e.stopPropagation()}>
                          {section === 'samples' && (
                            <button className="oi-btn oi-btn__icon" title="新建样例" onClick={() => createSample(p)}>
                              <AddIcon size={14} />
                            </button>
                          )}
                          {section === 'solutions' && (
                            <button className="oi-btn oi-btn__icon" title="新建题解" onClick={() => createSolution(p)}>
                              <AddIcon size={14} />
                            </button>
                          )}
                       </div>
                     </div>

                     {/* 文件列表 Level 2 */}
                     {sectionExpanded && section === 'samples' && samplesLoading[p.meta.id] && (
                       <div className="tree-node is-file" style={{ paddingLeft: 32 }}>
                         <div className="node-arrow is-hidden" />
                         <div className="node-content">
                           <FileIcon style={{ opacity: 0.4 }} />
                           <span className="node-label" style={{ fontWeight: 'normal', opacity: 0.7 }}>加载样例...</span>
                         </div>
                       </div>
                     )}
                     {sectionExpanded && files.map(file => {
                       let FileItemIcon = file.isDirectory ? FolderIcon : FileIcon;
                       
                       // 根据不同分区的不同文件类型自定义图标
                       if (!file.isDirectory) {
                          if (section === 'source') {
                            FileItemIcon = CodeIcon;
                          } else if (section === 'solutions') {
                             FileItemIcon = FileMarkdownIcon; // 可替换为 TextIcon 或其他
                          } else if (section === 'samples') {
                             FileItemIcon = FileIcon;
                          }
                       }

                       return (
                         <div
                           key={(file as any).sampleId || file.path}
                           className="tree-node is-file"
                           style={{ paddingLeft: 32 }}
                           onClick={() => {
                             if (section === 'samples') {
                               openFile(p.samplesPath);
                             } else {
                               openFile(file.path);
                             }
                           }}
                         >
                           {/* 文件没有箭头，占位 */}
                           <div className="node-arrow is-hidden" /> 
                           <div className="node-content">
                             <FileItemIcon style={{ opacity: 0.6 }} />
                             <span className="node-label" style={{ fontWeight: 'normal' }}>{file.name}</span>
                           </div>
                         </div>
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
