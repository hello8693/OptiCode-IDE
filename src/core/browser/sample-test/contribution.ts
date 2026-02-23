import { Injectable } from '@opensumi/di';
import { ComponentContribution, ComponentRegistry, Domain, getIcon } from '@opensumi/ide-core-browser';
import {
  BrowserEditorContribution,
  EditorComponentRegistry,
  EditorComponentRenderMode,
  EditorOpenType,
} from '@opensumi/ide-editor/lib/browser';

import { SampleTestPanel, SAMPLE_TEST_CONTAINER } from './view';

const isSamplesJsonPath = (fsPath: string): boolean => {
  if (!fsPath) return false;
  const normalized = fsPath.replace(/\\/g, '/');
  return /\/samples\/samples\.json$/i.test(normalized);
};

@Domain(ComponentContribution, BrowserEditorContribution)
@Injectable()
export class SampleTestContribution implements ComponentContribution, BrowserEditorContribution {
  registerComponent(registry: ComponentRegistry) {
    registry.register(SAMPLE_TEST_CONTAINER, [], {
      containerId: SAMPLE_TEST_CONTAINER,
      iconClass: getIcon('test'),
      title: '自测',
      component: SampleTestPanel,
      priority: 7,
    });
  }

  registerEditorComponent(registry: EditorComponentRegistry) {
    registry.registerEditorComponent({
      uid: 'sample-editor',
      scheme: 'file',
      component: SampleTestPanel,
      renderMode: EditorComponentRenderMode.ONE_PER_WORKBENCH,
    });

    registry.registerEditorComponentResolver('file', (resource, results) => {
      const fsPath = resource?.uri?.codeUri?.fsPath;
      if (!fsPath) return;
      if (isSamplesJsonPath(fsPath)) {
        results.unshift({ type: EditorOpenType.component, componentId: 'sample-editor' });
      }
    });
  }
}
