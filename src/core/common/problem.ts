import { ISampleCase, Verdict, ISampleResult } from './sample-data';

/* ────────── 题目元信息 ────────── */

/** 题目来源 OJ 信息 */
export interface IProblemSource {
  /** 来源 OJ 名称，如 "Luogu" / "Codeforces" / "AtCoder" */
  oj?: string;
  /** 题号/链接，如 "P1001" 或完整 URL */
  url?: string;
}

/** 题目元数据（持久化到 meta.json） */
export interface IProblemMeta {
  /** 题目 ID，即文件夹名，如 "P1001" */
  id: string;
  /** 显示名称（可与 id 不同），如 "A+B Problem" */
  name: string;
  /** 时间限制，单位毫秒，默认 1000 */
  timeLimitMs: number;
  /** 内存限制，单位 MB，默认 256 */
  memoryLimitMb: number;
  /** 来源信息 */
  source?: IProblemSource;
  /** 题目标签/分类 */
  tags?: string[];
  /** 创建时间 ISO string */
  createdAt: string;
  /** 最后修改时间 ISO string */
  updatedAt: string;
}

/* ────────── 运行时题目模型 ────────── */

/** 单道题的完整运行时数据（内存中使用，不直接持久化） */
export interface IProblem {
  /** 题目元信息 */
  meta: IProblemMeta;
  /** 题目根目录绝对路径，如 /Users/xxx/contest/P1001 */
  rootDir: string;
  /** 源码文件绝对路径，如 /Users/xxx/contest/P1001/P1001.cpp */
  sourcePath: string;
  /** 编译产物目录绝对路径 */
  binDir: string;
  /** 编译产物文件绝对路径（= binDir/<id>） */
  executablePath: string;
  /** 样例数据目录绝对路径 */
  samplesDir: string;
  /** 样例 JSON 文件绝对路径 */
  samplesPath: string;
  /** 题解目录绝对路径 */
  solutionsDir: string;
  /** 当前已加载的样例列表 */
  samples: ISampleCase[];
}

/* ────────── 默认值 ────────── */

export const DEFAULT_TIME_LIMIT = 1000;
export const DEFAULT_MEMORY_LIMIT = 256;

export function createDefaultMeta(id: string): IProblemMeta {
  const now = new Date().toISOString();
  return {
    id,
    name: id,
    timeLimitMs: DEFAULT_TIME_LIMIT,
    memoryLimitMb: DEFAULT_MEMORY_LIMIT,
    createdAt: now,
    updatedAt: now,
  };
}

/* ────────── 服务接口 ────────── */

export const IProblemService = Symbol('IProblemService');

export interface IProblemService {
  /* ── 题目生命周期 ── */

  /**
   * 创建一道新题目：在工作区根目录下创建子文件夹 + 脚手架文件。
   * @returns 创建好的题目模型
   */
  createProblem(id: string, meta?: Partial<IProblemMeta>): Promise<IProblem>;

  /**
   * 从已有的题目文件夹加载题目。
   * 若 meta.json 不存在，根据文件夹名自动生成默认元信息。
   */
  loadProblem(problemDir: string): Promise<IProblem>;

  /**
   * 扫描工作区根目录，列出所有包含 meta.json 或 .cpp 源码的子文件夹。
   */
  listProblems(): Promise<IProblem[]>;

  /**
   * 删除题目文件夹（慎用）。
   */
  deleteProblem(id: string): Promise<void>;

  /**
   * 判断当前工作区是否为 OptiCode 题目结构。
   * 规则：存在 .opticode 或至少一个题目文件夹（meta.json 或 <id>.cpp）。
   */
  isOptiCodeWorkspace(): Promise<boolean>;

  /* ── 元信息 ── */

  /** 读取 meta.json */
  getMeta(id: string): Promise<IProblemMeta>;

  /** 保存 meta.json */
  saveMeta(id: string, meta: IProblemMeta): Promise<void>;

  /** 局部更新 meta.json */
  updateMeta(id: string, patch: Partial<IProblemMeta>): Promise<void>;

  /* ── 样例 ── */

  /** 加载 samples/samples.json */
  loadSamples(id: string): Promise<ISampleCase[]>;

  /** 保存 samples/samples.json */
  saveSamples(id: string, samples: ISampleCase[]): Promise<void>;

  /** 删除某条样例关联的 .in/.out 文件 */
  removeSampleFiles(id: string, sample: ISampleCase): Promise<void>;

  /** 添加一条样例 */
  addSample(id: string, sample: ISampleCase): Promise<void>;

  /** 更新一条样例 */
  updateSample(id: string, sample: ISampleCase): Promise<void>;

  /** 删除一条样例 */
  removeSample(id: string, sampleId: string): Promise<void>;

  /* ── 源码 ── */

  /** 获取源码文件路径 */
  getSourcePath(id: string): string;

  /** 获取编译产物路径 */
  getExecutablePath(id: string): string;

  /* ── 当前上下文 ── */

  /**
   * 根据一个文件路径，自动推断它属于哪道题目。
   * 例如给定 /workspace/P1001/P1001.cpp → 返回 P1001 的 IProblem。
   * 若不在任何题目目录中，返回 undefined。
   */
  resolveFromFile(filePath: string): Promise<IProblem | undefined>;

  /**
   * 当前活动题目（由编辑器当前文件自动推断）。
   * 面板 / 状态栏可以订阅变化。
   */
  readonly activeProblem: IProblem | undefined;

  /**
   * 监听活动题目变化。
   */
  onActiveProblemChange(callback: (problem: IProblem | undefined) => void): { dispose(): void };
}
