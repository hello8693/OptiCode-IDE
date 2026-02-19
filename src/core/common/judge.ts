import { ISampleCase, ISampleResult } from './sample-data';
import { IProblem } from './problem';

export interface JudgeOptions {
  timeLimitMs?: number;
  memoryLimitMb?: number;
}

export const IJudgeService = Symbol('IJudgeService');

export interface IJudgeService {
  /** 运行单个样例，返回判定结果。需要可执行文件已存在。 */
  runSample(problem: IProblem, sample: ISampleCase, options?: JudgeOptions): Promise<ISampleResult>;
  /** 顺序运行多个样例，便于串行限时。 */
  runSamples(problem: IProblem, samples: ISampleCase[], options?: JudgeOptions): Promise<ISampleResult[]>;
}
