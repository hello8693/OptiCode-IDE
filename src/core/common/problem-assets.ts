import { IProblem } from './problem';

export interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface ProblemAssets {
  source: FileItem[];
  samples: FileItem[];
  solutions: FileItem[];
  others: FileItem[];
}

export const IProblemAssetService = Symbol('IProblemAssetService');

export interface IProblemAssetService {
  listAssets(problem: IProblem): Promise<ProblemAssets>;
  listAssetsForProblems(problems: IProblem[]): Promise<Record<string, ProblemAssets>>;
  createSolution(problem: IProblem): Promise<string>;
  createSample(problem: IProblem): Promise<{ inPath: string; outPath: string }>;
}
