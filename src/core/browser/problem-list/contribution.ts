import { Injectable } from '@opensumi/di';
import { ComponentContribution, ComponentRegistry, Domain, getIcon } from '@opensumi/ide-core-browser';

import { PROBLEM_LIST_CONTAINER, PROBLEM_LIST_PANEL, ProblemListPanel } from './view';

@Injectable()
@Domain(ComponentContribution)
export class ProblemListContribution implements ComponentContribution {
  registerComponent(registry: ComponentRegistry) {
    registry.register(PROBLEM_LIST_CONTAINER, [], {
      containerId: PROBLEM_LIST_CONTAINER,
      iconClass: getIcon('unorderedlist'),
      title: '题目列表',
      component: ProblemListPanel,
      priority: 12,
    });
  }
}
