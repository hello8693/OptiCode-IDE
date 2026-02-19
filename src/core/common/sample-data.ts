/**
 * 样例数据抽象接口层
 *
 * 所有样例数据（手动输入 / OJ 浏览器插件推送 / .in/.out 导入）都通过此接口接入，
 * 便于后续扩展。
 */

/* ────────── 单条样例 ────────── */
export interface ISampleCase {
  /** 唯一 id, UUID 字符串 */
  id: string;
  /** 显示标签，如 "样例 1" */
  label: string;
  /** 输入文件相对路径（可选，指向 samples/*.in） */
  inputPath?: string;
  /** 输出文件相对路径（可选，指向 samples/*.out） */
  expectedPath?: string;
  /** 标准输入 */
  input: string;
  /** 期望输出 */
  expected: string;
}

export function isLargeSample(sample: ISampleCase): boolean {
  return !!(sample.inputPath || sample.expectedPath);
}

function extractLastNumber(text: string): string | undefined {
  const match = /(\d+)(?!.*\d)/.exec(text);
  return match ? match[1] : undefined;
}

function fileStem(path?: string): string {
  if (!path) return '';
  const normalized = path.replace(/\\/g, '/');
  const name = normalized.split('/').pop() || '';
  return name.replace(/\.(in|out)$/i, '');
}

export function sampleDisplayLabel(sample: ISampleCase): string {
  if (!isLargeSample(sample)) {
    return sample.label || '样例';
  }
  const numFromLabel = extractLastNumber(sample.label || '');
  const numFromInput = extractLastNumber(fileStem(sample.inputPath));
  const numFromExpected = extractLastNumber(fileStem(sample.expectedPath));
  const num = numFromLabel || numFromInput || numFromExpected;
  return num ? `大样例${num}` : '大样例';
}

export function sampleFileName(path?: string): string {
  if (!path) return '';
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').pop() || normalized;
}

/* ────────── 一道题绑定的全部样例 ────────── */
export interface ISampleGroup {
  /** 关联的源文件相对路径（相对工作区根），如 "a.cpp" */
  filePath: string;
  /** 该文件的全部样例 */
  cases: ISampleCase[];
}

/* ────────── 单条运行结果 ────────── */
export type Verdict = 'AC' | 'WA' | 'TLE' | 'RE' | 'CE' | 'MLE' | 'PENDING' | 'RUNNING';

export interface ISampleResult {
  /** 对应的 caseId */
  caseId: string;
  verdict: Verdict;
  /** 实际输出 */
  stdout: string;
  /** 标准错误 */
  stderr: string;
  /** 运行时间 ms */
  timeMs: number;
  /** 退出码 */
  exitCode: number;
}

/* ────────── 样例数据服务抽象 ────────── */
export const ISampleDataService = Symbol('ISampleDataService');

export interface ISampleDataService {
  /** 获取某源文件绑定的全部样例 */
  load(fileRelPath: string): Promise<ISampleGroup>;
  /** 保存某源文件的全部样例（自动写入 .opticode/samples/xxx.json） */
  save(group: ISampleGroup): Promise<void>;
  /** 添加一条样例 */
  addCase(fileRelPath: string, c: ISampleCase): Promise<void>;
  /** 更新一条样例 */
  updateCase(fileRelPath: string, c: ISampleCase): Promise<void>;
  /** 删除一条样例 */
  removeCase(fileRelPath: string, caseId: string): Promise<void>;
}
