import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { IMessageService } from '@opensumi/ide-overlay';
import { ReactEditorComponent } from '@opensumi/ide-editor/lib/browser';
import { useInjectable } from '@opensumi/ide-core-browser';

import { IProblemService } from '../../common/problem';
import { IProblemMeta } from '../../common/problem';
import '../styles/problem-meta.less';
import '../styles/oi-panel.less';

type MetaFormState = {
  name: string;
  timeLimitMs: string;
  memoryLimitMb: string;
  sourceOj: string;
  sourceUrl: string;
  tagsText: string;
};

const parseNumber = (value: string, fallback: number) => {
  const num = parseInt(value.trim(), 10);
  return Number.isFinite(num) ? num : fallback;
};

const parseTags = (value: string): string[] =>
  value
    .split(/[,，\s]+/g)
    .map(t => t.trim())
    .filter(Boolean);

const formFromMeta = (meta: IProblemMeta): MetaFormState => ({
  name: meta.name || meta.id,
  timeLimitMs: String(meta.timeLimitMs || 1000),
  memoryLimitMb: String(meta.memoryLimitMb || 256),
  sourceOj: meta.source?.oj || '',
  sourceUrl: meta.source?.url || '',
  tagsText: meta.tags?.join(', ') || '',
});

export const ProblemMetaEditor: ReactEditorComponent = ({ resource }) => {
  const problemService = useInjectable<IProblemService>(IProblemService);
  const messageService = useInjectable<IMessageService>(IMessageService);

  const problemId = useMemo(() => {
    const codeUri = resource?.uri?.codeUri;
    const authority = codeUri?.authority || '';
    const path = (codeUri?.path || '').replace(/^\/+/, '');
    return authority || path;
  }, [resource]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState<IProblemMeta | null>(null);
  const [form, setForm] = useState<MetaFormState>({
    name: '',
    timeLimitMs: '1000',
    memoryLimitMb: '256',
    sourceOj: '',
    sourceUrl: '',
    tagsText: '',
  });
  const [savedAt, setSavedAt] = useState('');

  const loadMeta = useCallback(async () => {
    if (!problemId) return;
    setLoading(true);
    try {
      const next = await problemService.getMeta(problemId);
      setMeta(next);
      setForm(formFromMeta(next));
    } catch {
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [problemId, problemService]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  const updateField = (key: keyof MetaFormState, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const reset = () => {
    if (!meta) return;
    setForm(formFromMeta(meta));
  };

  const save = async () => {
    if (!meta || !problemId) return;
    setSaving(true);
    try {
      const next: IProblemMeta = {
        ...meta,
        id: meta.id,
        name: form.name.trim() || meta.id,
        timeLimitMs: parseNumber(form.timeLimitMs, meta.timeLimitMs || 1000),
        memoryLimitMb: parseNumber(form.memoryLimitMb, meta.memoryLimitMb || 256),
        source: {
          oj: form.sourceOj.trim() || undefined,
          url: form.sourceUrl.trim() || undefined,
        },
        tags: parseTags(form.tagsText),
      };
      if (!next.tags?.length) delete next.tags;
      await problemService.saveMeta(problemId, next);
      setMeta(next);
      setSavedAt(new Date().toLocaleString());
      messageService.info('题目信息已保存');
    } catch {
      messageService.error('保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  if (!problemId) {
    return (
      <div className="problem-meta">
        <div className="problem-meta__header">
          <div className="problem-meta__title">题目元信息</div>
        </div>
        <div className="problem-meta__empty">未指定题目</div>
      </div>
    );
  }

  if (loading && !meta) {
    return (
      <div className="problem-meta">
        <div className="problem-meta__header">
          <div className="problem-meta__title">题目元信息</div>
        </div>
        <div className="problem-meta__empty">加载中...</div>
      </div>
    );
  }

  return (
    <div className="problem-meta">
      <div className="problem-meta__header">
        <div>
          <div className="problem-meta__title">题目元信息</div>
          <div className="problem-meta__subtitle">编辑题目展示名称、限制与来源信息</div>
        </div>
        <div className="problem-meta__badge">ID: {problemId}</div>
      </div>

      <div className="problem-meta__section">
        <div className="problem-meta__section-title">基础信息</div>
        <div className="problem-meta__grid">
          <div className="problem-meta__field">
            <label>题目名称</label>
            <input
              className="problem-meta__input"
              value={form.name}
              onChange={e => updateField('name', e.target.value)}
              placeholder="显示名称"
            />
          </div>
          <div className="problem-meta__field">
            <label>时间限制 (ms)</label>
            <input
              className="problem-meta__input"
              value={form.timeLimitMs}
              onChange={e => updateField('timeLimitMs', e.target.value)}
              placeholder="1000"
            />
          </div>
          <div className="problem-meta__field">
            <label>内存限制 (MB)</label>
            <input
              className="problem-meta__input"
              value={form.memoryLimitMb}
              onChange={e => updateField('memoryLimitMb', e.target.value)}
              placeholder="256"
            />
          </div>
        </div>
      </div>

      <div className="problem-meta__section">
        <div className="problem-meta__section-title">来源信息</div>
        <div className="problem-meta__grid">
          <div className="problem-meta__field">
            <label>来源 OJ</label>
            <input
              className="problem-meta__input"
              value={form.sourceOj}
              onChange={e => updateField('sourceOj', e.target.value)}
              placeholder="如 Luogu / Codeforces"
            />
          </div>
          <div className="problem-meta__field problem-meta__field--wide">
            <label>题目链接</label>
            <input
              className="problem-meta__input"
              value={form.sourceUrl}
              onChange={e => updateField('sourceUrl', e.target.value)}
              placeholder="https://..."
            />
          </div>
        </div>
      </div>

      <div className="problem-meta__section">
        <div className="problem-meta__section-title">标签</div>
        <div className="problem-meta__field">
          <label>题目标签（用逗号分隔）</label>
          <input
            className="problem-meta__input"
            value={form.tagsText}
            onChange={e => updateField('tagsText', e.target.value)}
            placeholder="dp, graph, greedy"
          />
        </div>
      </div>

      <div className="problem-meta__actions">
        <button className="oi-btn oi-btn__ghost" onClick={reset} disabled={saving}>
          重置
        </button>
        <button className="oi-btn oi-btn__primary" onClick={save} disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </button>
        {savedAt && <span className="problem-meta__saved">已保存：{savedAt}</span>}
      </div>
    </div>
  );
};
