import React from 'react';
import { useInjectable, CommandService } from '@opensumi/ide-core-browser';
import { OPEN_COMPETITIVE_COMPANION_SETTINGS_CMD } from './settings.contribution';
import '../styles/cpp-settings.less';

export const CompetitiveCompanionSettingsSection: React.FC = () => {
  const commandService = useInjectable<CommandService>(CommandService);

  return (
    <div style={{ padding: '8px 0 16px' }}>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
        Competitive Companion 用于从浏览器插件导入题目样例。
      </div>
      <button
        className="cpp-template-settings-btn"
        onClick={() => commandService.executeCommand(OPEN_COMPETITIVE_COMPANION_SETTINGS_CMD)}
      >
        打开 Competitive Companion 设置
      </button>
    </div>
  );
};
