import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useInjectable } from '@opensumi/ide-core-browser';
import { PreferenceService } from '@opensumi/ide-core-browser';
import { ReactEditorComponent } from '@opensumi/ide-editor/lib/browser';

import {
  CPP_PREFERENCE_IDS,
  OPT_OPTIONS,
  STD_DEFAULT,
  STD_OPTIONS,
} from '../cpp/constants';
import { COMMON_FLAGS } from './contribution';
import '../styles/cpp-settings.less';

const SEP = /[\s,]+/g;

const parseExtraFlags = (text: string): string[] => text.split(SEP).filter(Boolean);

export const CppSettingsEditor: ReactEditorComponent = () => {
  const preferenceService = useInjectable<PreferenceService>(PreferenceService);

  const [std, setStd] = useState<string>(STD_DEFAULT);
  const [profile, setProfile] = useState<string>(OPT_OPTIONS[0]);
  const [flags, setFlags] = useState<string[]>([]);
  const [compilerPath, setCompilerPath] = useState<string>('');
  const [extraText, setExtraText] = useState<string>('');

  const commonSet = useMemo(() => new Set(COMMON_FLAGS.map(f => f.value)), []);

  const syncExtrasFromFlags = useCallback((nextFlags: string[]) => {
    const extras = nextFlags.filter(f => !commonSet.has(f));
    setExtraText(extras.join(' '));
  }, [commonSet]);

  useEffect(() => {
    const currentStd = preferenceService.getValid(CPP_PREFERENCE_IDS.std, STD_DEFAULT) as string;
    const currentProfile = preferenceService.getValid(CPP_PREFERENCE_IDS.profile, OPT_OPTIONS[0]) as string;
    const currentFlags = preferenceService.getValid(CPP_PREFERENCE_IDS.flags, ['-O2', '-Wall']) as string[];
    const compiler = (preferenceService.getValid(CPP_PREFERENCE_IDS.compilerPath, '') as string) || '';

    setStd(currentStd);
    setProfile(currentProfile);
    setFlags(currentFlags);
    setCompilerPath(compiler);
    syncExtrasFromFlags(currentFlags);
  }, [preferenceService, syncExtrasFromFlags]);

  const updateFlags = useCallback(async (nextFlags: string[]) => {
    setFlags(nextFlags);
    syncExtrasFromFlags(nextFlags);
    await preferenceService.update(CPP_PREFERENCE_IDS.flags, nextFlags);
  }, [preferenceService, syncExtrasFromFlags]);

  const toggleCommonFlag = async (value: string) => {
    const next = new Set(flags);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    await updateFlags(Array.from(next));
  };

  const handleStdChange = async (val: string) => {
    setStd(val);
    await preferenceService.update(CPP_PREFERENCE_IDS.std, val);
  };

  const handleProfileChange = async (val: string) => {
    setProfile(val);
    await preferenceService.update(CPP_PREFERENCE_IDS.profile, val);
  };

  const handleCompilerChange = async (val: string) => {
    setCompilerPath(val);
    await preferenceService.update(CPP_PREFERENCE_IDS.compilerPath, val);
  };

  const handleExtraBlur = async () => {
    const extras = parseExtraFlags(extraText);
    const selectedCommons = COMMON_FLAGS.filter(f => flags.includes(f.value)).map(f => f.value);
    await updateFlags([...selectedCommons, ...extras]);
  };

  return (
    <div className="cpp-settings">
      <div className="cpp-settings__header">
        <div>
          <div className="cpp-settings__title">编译器详细设置</div>
        </div>
      </div>

      <div className="cpp-settings__section">
        <div className="cpp-settings__section-title">编译器路径</div>
        <div className="cpp-settings__field">
          <label>自定义 g++ 路径</label>
          <input
            className="cpp-settings__input"
            value={compilerPath}
            onChange={e => setCompilerPath(e.target.value)}
            onBlur={e => handleCompilerChange(e.target.value.trim())}
            placeholder="留空自动探测 (macOS 优先 Homebrew)"
            spellCheck={false}
          />
        </div>
      </div>

      <div className="cpp-settings__section">
        <div className="cpp-settings__section-title">语言标准</div>
        <div className="cpp-settings__pill-group">
          {STD_OPTIONS.map(option => (
            <button
              key={option}
              className={`cpp-settings__pill ${std === option ? 'is-active' : ''}`}
              onClick={() => handleStdChange(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="cpp-settings__section">
        <div className="cpp-settings__section-title">编译模板</div>
        <div className="cpp-settings__pill-group">
          {OPT_OPTIONS.map(option => (
            <button
              key={option}
              className={`cpp-settings__pill ${profile === option ? 'is-active' : ''}`}
              onClick={() => handleProfileChange(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="cpp-settings__section">
        <div className="cpp-settings__section-title">常用编译参数</div>
        <div className="cpp-settings__flags">
          {COMMON_FLAGS.map(flag => (
            <label key={flag.value} className="cpp-settings__flag">
              <input
                type="checkbox"
                checked={flags.includes(flag.value)}
                onChange={() => toggleCommonFlag(flag.value)}
              />
              <span className="cpp-settings__flag-label">{flag.label}</span>
              <span className="cpp-settings__flag-desc">{flag.desc}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="cpp-settings__section">
        <div className="cpp-settings__section-title">额外参数</div>
        <div className="cpp-settings__field">
          <label>空格或逗号分隔</label>
          <input
            className="cpp-settings__input"
            value={extraText}
            onChange={e => setExtraText(e.target.value)}
            onBlur={handleExtraBlur}
            placeholder="例：-DLOCAL -fno-omit-frame-pointer"
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
};
