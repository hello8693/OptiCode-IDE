export type ScratchpadLanguage = 'cpp';

export interface ScratchpadEntry {
  id: string;
  name: string;
  language: ScratchpadLanguage;
  content: string;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  lastRunExitCode?: number;
}

export interface ScratchpadStore {
  items: Record<string, ScratchpadEntry>;
  order: string[];
}

export const SCRATCHPAD_STORAGE_KEY = 'oi.scratchpads';
export const SCRATCHPAD_SCHEME = 'scratchpad';
export const SCRATCHPAD_SUBDIR = '.opticode/scratchpads';
export const SCRATCHPAD_TMP_SUBDIR = 'opticode-scratchpad/files';
export const SCRATCHPAD_BUILD_SUBDIR = 'opticode-scratchpad';
export const SCRATCHPAD_EXT = '.cpp';
