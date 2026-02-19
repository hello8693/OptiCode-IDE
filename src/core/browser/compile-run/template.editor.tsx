import React, { useEffect, useState } from 'react';
import { ReactEditorComponent } from '@opensumi/ide-editor/lib/browser';
import { useInjectable } from '@opensumi/ide-core-browser';
import { IStorageService } from '../../common/types';
import { CPP_TEMPLATE_STORAGE_KEY, DEFAULT_CPP_TEMPLATE } from '../../common/templates';
import '../styles/template-editor.less';

export const CppTemplateEditor: ReactEditorComponent = () => {
  const storage = useInjectable<IStorageService>(IStorageService);
  const [value, setValue] = useState<string>(DEFAULT_CPP_TEMPLATE);
  const [savedAt, setSavedAt] = useState<string>('');

  useEffect(() => {
    const current = storage.getItem<string>(CPP_TEMPLATE_STORAGE_KEY, DEFAULT_CPP_TEMPLATE);
    setValue(current || DEFAULT_CPP_TEMPLATE);
  }, [storage]);

  const save = () => {
    const trimmed = value.length ? value : DEFAULT_CPP_TEMPLATE;
    storage.setItem(CPP_TEMPLATE_STORAGE_KEY, trimmed);
    setSavedAt(new Date().toLocaleTimeString());
  };

  const reset = () => {
    setValue(DEFAULT_CPP_TEMPLATE);
    storage.setItem(CPP_TEMPLATE_STORAGE_KEY, DEFAULT_CPP_TEMPLATE);
    setSavedAt(new Date().toLocaleTimeString());
  };

  return (
    <div className="cpp-template">
      <div className="cpp-template__header">
        <div>
          <div className="cpp-template__title">默认源码模板</div>
          <div className="cpp-template__desc">新建题目与 Competitive Companion 导入会使用此模板。</div>
        </div>
        <div className="cpp-template__actions">
          <button className="cpp-template__btn" onClick={reset}>恢复默认</button>
          <button className="cpp-template__btn cpp-template__btn--primary" onClick={save}>保存</button>
        </div>
      </div>
      <textarea
        className="cpp-template__editor"
        spellCheck={false}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {savedAt && <div className="cpp-template__saved">已保存：{savedAt}</div>}
    </div>
  );
};
