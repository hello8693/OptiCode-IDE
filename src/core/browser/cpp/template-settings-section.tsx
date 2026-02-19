import React from 'react';
import { useInjectable, CommandService } from '@opensumi/ide-core-browser';
import { SINGLEFILE_OPEN_TEMPLATE_CMD } from '../compile-run/contribution';
import '../styles/cpp-settings.less';

export const CppTemplateSettingsSection: React.FC = () => {
  const commandService = useInjectable<CommandService>(CommandService);

  return (
    <div style={{ padding: '8px 0 16px' }}>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
        默认源码模板用于新建题目与 Competitive Companion 导入。
      </div>
      <button
        className="cpp-template-settings-btn"
        onClick={() => commandService.executeCommand(SINGLEFILE_OPEN_TEMPLATE_CMD)}
      >
        打开模板编辑器
      </button>
    </div>
  );
};
