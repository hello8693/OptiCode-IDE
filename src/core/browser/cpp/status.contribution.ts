import { Autowired, Injectable } from '@opensumi/di';
import { Domain, CommandContribution, CommandRegistry, ClientAppContribution } from '@opensumi/ide-core-browser';
import { IStatusBarService, StatusBarAlignment, StatusBarEntryAccessor } from '@opensumi/ide-core-browser/lib/services/status-bar-service';
import { PreferenceService } from '@opensumi/ide-core-browser';

import { IStorageService } from '../../common';
import { CPP_PREFERENCE_IDS, STD_KEY, OPT_KEY, STD_OPTIONS, STD_DEFAULT, OPT_OPTIONS } from './constants';

export const TOGGLE_STD = 'singlefile.cpp.toggleStd';
export const TOGGLE_OPT = 'singlefile.cpp.toggleOpt';

@Domain(CommandContribution, ClientAppContribution)
@Injectable()
export class CppStatusContribution implements CommandContribution, ClientAppContribution {
  @Autowired(IStatusBarService)
  private readonly statusBarService: IStatusBarService;

  @Autowired(IStorageService)
  private readonly storage: IStorageService;

  @Autowired(PreferenceService)
  private readonly preferenceService: PreferenceService;

  private stdAccessor: StatusBarEntryAccessor | undefined;
  private optAccessor: StatusBarEntryAccessor | undefined;

  registerCommands(registry: CommandRegistry) {
    registry.registerCommand({ id: TOGGLE_STD, label: '切换 C++ 标准' }, {
      execute: async () => {
        const next = this.nextValue(STD_OPTIONS, await this.getStd());
        await this.setStd(next);
      },
    });

    registry.registerCommand({ id: TOGGLE_OPT, label: '切换编译模板' }, {
      execute: async () => {
        const next = this.nextValue(OPT_OPTIONS, await this.getOpt());
        await this.setOpt(next);
      },
    });
  }

  async onStart() {
    // Lazy-init status entries to avoid lifecycle races
    this.ensureAccessors();
    await this.refresh();

    // Sync when settings change
    this.preferenceService.onSpecificPreferenceChange(CPP_PREFERENCE_IDS.std, async change => {
      if (change?.newValue) {
        await this.setStd(change.newValue as string, false);
      }
    });
    this.preferenceService.onSpecificPreferenceChange(CPP_PREFERENCE_IDS.profile, async change => {
      if (change?.newValue) {
        await this.setOpt(change.newValue as string, false);
      }
    });
  }

  private ensureAccessors() {
    if (!this.stdAccessor) {
      this.stdAccessor = this.statusBarService.addElement('singlefile-std', {
        alignment: StatusBarAlignment.LEFT,
        text: '',
        tooltip: '切换 C++ 标准 (单题模式)',
        priority: 1000,
        command: TOGGLE_STD,
      });
    }
    if (!this.optAccessor) {
      this.optAccessor = this.statusBarService.addElement('singlefile-opt', {
        alignment: StatusBarAlignment.LEFT,
        text: '',
        tooltip: '切换编译模板 (单题模式)',
        priority: 999,
        command: TOGGLE_OPT,
      });
    }
  }

  private async refresh() {
    this.ensureAccessors();
    this.stdAccessor?.update({ text: await this.getStd(), alignment: StatusBarAlignment.LEFT });
    this.optAccessor?.update({ text: await this.getOpt(), alignment: StatusBarAlignment.LEFT });
  }

  private async getStd(): Promise<string> {
    const normalizeStd = (val: string | undefined): string => {
      if (STD_OPTIONS.includes(val || '')) return val as string;
      return STD_DEFAULT;
    };
    const pref = normalizeStd(this.preferenceService.getValid(CPP_PREFERENCE_IDS.std, STD_DEFAULT));
    if (pref) return pref;
    const saved = normalizeStd(await this.storage.getItem<string>(STD_KEY, STD_DEFAULT));
    return saved;
  }

  private async setStd(value: string, updatePref = true) {
    await this.storage.setItem(STD_KEY, value);
    if (updatePref) {
      await this.preferenceService.update(CPP_PREFERENCE_IDS.std, value);
    }
    this.stdAccessor?.update({ text: value, alignment: StatusBarAlignment.LEFT });
  }

  private async getOpt(): Promise<string> {
    const pref = this.preferenceService.getValid(CPP_PREFERENCE_IDS.profile, OPT_OPTIONS[0]);
    if (pref && OPT_OPTIONS.includes(pref)) return pref;
    const saved = await this.storage.getItem<string>(OPT_KEY, OPT_OPTIONS[0]);
    if (OPT_OPTIONS.includes(saved)) return saved;
    return OPT_OPTIONS[0];
  }

  private async setOpt(value: string, updatePref = true) {
    await this.storage.setItem(OPT_KEY, value);
    if (updatePref) {
      await this.preferenceService.update(CPP_PREFERENCE_IDS.profile, value);
    }
    this.optAccessor?.update({ text: value, alignment: StatusBarAlignment.LEFT });
  }

  private nextValue(options: string[], current: string): string {
    const idx = options.indexOf(current);
    const nextIdx = idx >= 0 ? (idx + 1) % options.length : 0;
    return options[nextIdx];
  }
}
