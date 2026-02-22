import { SlotLocation } from '@opensumi/ide-core-browser/lib/react-providers/slot';
import { defaultConfig } from '@opensumi/ide-main-layout/lib/browser/default-config';
import { DESIGN_MENUBAR_CONTAINER_VIEW_ID } from '@opensumi/ide-design/lib/common/constants';

export const layoutConfig = {
  ...defaultConfig,
  [SlotLocation.top]: {
    modules: [DESIGN_MENUBAR_CONTAINER_VIEW_ID],
  },
  [SlotLocation.left]: {
    modules: [
      '@opensumi/ide-explorer',
      'problem-list-container',
      'scratchpad-container',
      'sample-test-container',
      'compile-run-container',
      '@opensumi/ide-extension-manager',
      '@opensumi/ide-debug',
    ],
  },
  [SlotLocation.main]: {
    modules: ['@opensumi/ide-editor'],
  },
  [SlotLocation.bottom]: {
    modules: [
      '@opensumi/ide-terminal-next',
      '@opensumi/ide-output',
      'debug-console',
      '@opensumi/ide-markers',
      '@opensumi/ide-refactor-preview',
    ],
  },
};
