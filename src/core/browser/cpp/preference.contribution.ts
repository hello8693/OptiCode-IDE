import { Autowired, Injectable } from '@opensumi/di';
import {
  Domain,
  PreferenceContribution,
  PreferenceSchema,
  ClientAppContribution,
  IClientApp,
  getIcon,
} from '@opensumi/ide-core-browser';
import { PreferenceService, IPreferenceSettingsService } from '@opensumi/ide-core-browser';
import { SettingContribution, ISettingRegistry } from '@opensumi/ide-preferences/lib/common';

import { STD_OPTIONS, STD_DEFAULT, STD_KEY, OPT_KEY, OPT_OPTIONS, CPP_PREFERENCE_IDS } from './constants';
import { CppTemplateSettingsSection } from './template-settings-section';
import { CompetitiveCompanionSettingsSection } from '../competitive-companion/settings-section';
import { IStorageService } from '../../common';
export const CPP_SETTING_SECTION_ID = 'oi.cpp';

const cppPreferenceSchema: PreferenceSchema = {
  properties: {
    [CPP_PREFERENCE_IDS.std]: {
      type: 'string',
      enum: STD_OPTIONS,
      default: STD_DEFAULT,
      description: '默认 C++ 标准（单题模式 & 自测面板）',
    },
    [CPP_PREFERENCE_IDS.profile]: {
      type: 'string',
      enum: OPT_OPTIONS,
      default: OPT_OPTIONS[0],
      description: '默认编译模板（O2 / Debug / Sanitize）',
    },
    [CPP_PREFERENCE_IDS.flags]: {
      type: 'array',
      items: {
        type: 'string',
      },
      default: ['-O2', '-Wall'],
      description: '默认编译参数列表（多选）。示例：-O2, -Wall, -Wextra',
    },
    [CPP_PREFERENCE_IDS.compilerPath]: {
      type: 'string',
      default: '',
      description: '自定义 g++ 路径（留空自动探测，macOS 会优先扫描 Homebrew）',
    },
  },
};

@Domain(PreferenceContribution, SettingContribution, ClientAppContribution)
@Injectable()
export class CppPreferenceContribution implements PreferenceContribution, SettingContribution, ClientAppContribution {
  schema = cppPreferenceSchema;

  @Autowired(IPreferenceSettingsService)
  private readonly preferenceSettings: IPreferenceSettingsService;

  @Autowired(PreferenceService)
  private readonly preferenceService: PreferenceService;

  @Autowired(IStorageService)
  private readonly storage: IStorageService;

  registerSetting(registry: ISettingRegistry) {
    registry.registerSettingGroup({
      id: CPP_SETTING_SECTION_ID,
      title: 'OptiCode',
      iconClass: getIcon('gear'),
    });
    registry.registerSettingSection(CPP_SETTING_SECTION_ID, {
      title: 'OptiCode 编译器',
      preferences: [
        { id: CPP_PREFERENCE_IDS.std, localized: '默认 C++ 标准' },
        { id: CPP_PREFERENCE_IDS.profile, localized: '编译模板（O2/Debug/Sanitize）' },
        { id: CPP_PREFERENCE_IDS.flags, localized: '默认编译参数' },
        { id: CPP_PREFERENCE_IDS.compilerPath, localized: '自定义 g++ 路径' },
      ],
    });

    registry.registerSettingSection(CPP_SETTING_SECTION_ID, {
      title: '源码模板',
      component: CppTemplateSettingsSection,
    });

    registry.registerSettingSection(CPP_SETTING_SECTION_ID, {
      title: 'Competitive Companion',
      component: CompetitiveCompanionSettingsSection,
    });
  }

  async onDidStart(app: IClientApp) {
    const normalizeStd = (val: string | undefined): string => {
      if (STD_OPTIONS.includes(val || '')) return val as string;
      return STD_DEFAULT;
    };

    // 当用户修改设置时，同步到存储，保持旧逻辑兼容
    this.preferenceService.onSpecificPreferenceChange(CPP_PREFERENCE_IDS.std, async change => {
      if (change?.newValue) {
        const std = normalizeStd(change.newValue as string);
        this.storage.setItem(STD_KEY, std);
        if (std !== change.newValue) {
          await this.preferenceService.update(CPP_PREFERENCE_IDS.std, std);
        }
      }
    });

    this.preferenceService.onSpecificPreferenceChange(CPP_PREFERENCE_IDS.flags, change => {
      if (Array.isArray(change?.newValue)) {
        this.storage.setItem('singlefile.cpp.flags', change.newValue as string[]);
      }
    });

    this.preferenceService.onSpecificPreferenceChange(CPP_PREFERENCE_IDS.profile, change => {
      if (typeof change?.newValue === 'string') {
        this.storage.setItem(OPT_KEY, change.newValue as string);
      }
    });

    this.preferenceService.onSpecificPreferenceChange(CPP_PREFERENCE_IDS.compilerPath, change => {
      if (typeof change?.newValue === 'string') {
        this.storage.setItem('singlefile.cpp.customCompiler', change.newValue as string);
      }
    });

    // 初始化一次：将当前 Preference 写入存储，供旧面板和状态栏读取
    const currentPrefStd = this.preferenceService.getValid(CPP_PREFERENCE_IDS.std, STD_DEFAULT);
    const std = normalizeStd(currentPrefStd);
    if (std !== currentPrefStd) {
      await this.preferenceService.update(CPP_PREFERENCE_IDS.std, std);
    }
    this.storage.setItem(STD_KEY, std);

    const flags = this.preferenceService.getValid(CPP_PREFERENCE_IDS.flags, ['-O2', '-Wall']);
    if (Array.isArray(flags)) {
      this.storage.setItem('singlefile.cpp.flags', flags as string[]);
    }

    const profile = this.preferenceService.getValid(CPP_PREFERENCE_IDS.profile, OPT_OPTIONS[0]);
    this.storage.setItem(OPT_KEY, profile);

    const compilerPath = this.preferenceService.getValid(CPP_PREFERENCE_IDS.compilerPath, '') || '';
    this.storage.setItem('singlefile.cpp.customCompiler', compilerPath);
  }

  openSettingsTab() {
    this.preferenceSettings.scrollToPreference(CPP_PREFERENCE_IDS.std);
  }
}
