import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ReactEditorComponent } from '@opensumi/ide-editor/lib/browser';
import { useInjectable } from '@opensumi/ide-core-browser';

import { IStorageService } from '../../common';
import {
  COMPETITIVE_COMPANION_SETTINGS_KEY,
  DEFAULT_COMPETITIVE_COMPANION_SETTINGS,
  DEFAULT_COMPETITIVE_COMPANION_PORTS,
  CompetitiveCompanionSettings,
} from '../../common/competitive-companion';
import '../styles/cpp-settings.less';

const PORT_SEP = /[,\s]+/g;

const normalizeSettings = (raw?: Partial<CompetitiveCompanionSettings>): CompetitiveCompanionSettings => {
  const enabled = typeof raw?.enabled === 'boolean' ? raw.enabled : DEFAULT_COMPETITIVE_COMPANION_SETTINGS.enabled;
  const ports = Array.isArray(raw?.ports) ? raw?.ports : DEFAULT_COMPETITIVE_COMPANION_SETTINGS.ports;
  const normalizedPorts = Array.from(
    new Set(
      ports
        .map((p) => Number(p))
        .filter((p) => Number.isFinite(p) && p > 0 && p <= 65535)
        .map((p) => Math.trunc(p)),
    ),
  );
  return {
    enabled,
    ports: normalizedPorts.length ? normalizedPorts : DEFAULT_COMPETITIVE_COMPANION_PORTS,
  };
};

const parsePorts = (text: string): number[] => {
  return Array.from(
    new Set(
      text
        .split(PORT_SEP)
        .map((p) => Number(p.trim()))
        .filter((p) => Number.isFinite(p) && p > 0 && p <= 65535)
        .map((p) => Math.trunc(p)),
    ),
  );
};

const formatPorts = (ports: number[]) => ports.join(', ');

export const CompetitiveCompanionSettingsEditor: ReactEditorComponent = () => {
  const storage = useInjectable<IStorageService>(IStorageService);
  const [enabled, setEnabled] = useState<boolean>(DEFAULT_COMPETITIVE_COMPANION_SETTINGS.enabled);
  const [portsText, setPortsText] = useState<string>(formatPorts(DEFAULT_COMPETITIVE_COMPANION_SETTINGS.ports));
  const saveTimerRef = useRef<number | undefined>(undefined);

  const defaultPortsLabel = useMemo(() => formatPorts(DEFAULT_COMPETITIVE_COMPANION_PORTS), []);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const current = await Promise.resolve(
        storage.getItem<CompetitiveCompanionSettings>(
          COMPETITIVE_COMPANION_SETTINGS_KEY,
          DEFAULT_COMPETITIVE_COMPANION_SETTINGS,
        ),
      );
      if (disposed) return;
      const normalized = normalizeSettings(current);
      setEnabled(normalized.enabled);
      setPortsText(formatPorts(normalized.ports));
    })();
    return () => { disposed = true; };
  }, [storage]);

  useEffect(() => {
    const ports = parsePorts(portsText);
    const settings: CompetitiveCompanionSettings = {
      enabled,
      ports: ports.length ? ports : DEFAULT_COMPETITIVE_COMPANION_PORTS,
    };
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      storage.setItem(COMPETITIVE_COMPANION_SETTINGS_KEY, settings);
    }, 300);
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [enabled, portsText, storage]);

  return (
    <div className="cpp-settings">
      <div className="cpp-settings__header">
        <div>
          <div className="cpp-settings__title">Competitive Companion</div>
          <div className="cpp-settings__subtitle">
            接收浏览器插件推送并自动生成题目。设置会自动保存，重启 IDE 后生效。
          </div>
        </div>
        <span className="cpp-settings__badge">自动保存</span>
      </div>

      <div className="cpp-settings__section">
        <div className="cpp-settings__section-title">服务状态</div>
        <label className="cpp-settings__flag">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span className="cpp-settings__flag-label">启用本地监听</span>
          <span className="cpp-settings__flag-desc">
            关闭后不会接收 Competitive Companion 的题目推送。
          </span>
        </label>
      </div>

      <div className="cpp-settings__section">
        <div className="cpp-settings__section-title">监听端口</div>
        <div className="cpp-settings__field">
          <label>逗号或空格分隔</label>
          <input
            className="cpp-settings__input"
            value={portsText}
            onChange={(e) => setPortsText(e.target.value)}
            placeholder={defaultPortsLabel}
            spellCheck={false}
          />
          <div className="cpp-settings__subtitle">
            默认端口：{defaultPortsLabel}（留空将使用默认端口）
          </div>
        </div>
      </div>

      <div className="cpp-settings__section">
        <div className="cpp-settings__section-title">插件地址</div>
        <div className="cpp-settings__field">
          <label>浏览器插件回调地址</label>
          <input
            className="cpp-settings__input"
            value="http://127.0.0.1:27121/"
            readOnly
          />
          <div className="cpp-settings__subtitle">
            实际监听端口会从上方端口列表中自动选择可用项。
          </div>
        </div>
      </div>
    </div>
  );
};
