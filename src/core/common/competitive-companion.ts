export interface CompetitiveCompanionTest {
  input: string;
  output: string;
}

export interface CompetitiveCompanionPayload {
  name: string;
  group?: string;
  url?: string;
  interactive?: boolean;
  memoryLimit?: number;
  timeLimit?: number;
  tests?: CompetitiveCompanionTest[];
  testType?: string;
  language?: string;
  languages?: Record<string, string>;
}

export const DEFAULT_COMPETITIVE_COMPANION_PORTS = [27121, 27122, 27123, 27124, 27125];

export interface CompetitiveCompanionSettings {
  enabled: boolean;
  ports: number[];
}

export const COMPETITIVE_COMPANION_SETTINGS_KEY = 'oi.companion.settings';
export const COMPETITIVE_COMPANION_LAST_WORKSPACE_KEY = 'oi.companion.lastWorkspace';

export const DEFAULT_COMPETITIVE_COMPANION_SETTINGS: CompetitiveCompanionSettings = {
  enabled: true,
  ports: DEFAULT_COMPETITIVE_COMPANION_PORTS,
};
