import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CommandService, useInjectable, electronEnv } from '@opensumi/ide-core-browser';
import { WorkbenchEditorService } from '@opensumi/ide-editor/lib/browser';
import { IQuickInputService } from '@opensumi/ide-core-browser/lib/quick-open';
import { IMessageService } from '@opensumi/ide-overlay';
import {
  AddIcon,
  DeleteIcon,
  EditIcon,
  SearchIcon,
  TimeIcon,
  FileIcon,
} from 'tdesign-icons-react';

import { ScratchpadService } from './scratchpad.service';
import { SCRATCHPAD_SCHEME, ScratchpadEntry } from '../../common/scratchpad';
import { SCRATCHPAD_NEW_CMD, SCRATCHPAD_OPEN_CMD } from './contribution';
import '../styles/scratchpad.less';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

export const SCRATCHPAD_PANEL = 'scratchpad-panel';
export const SCRATCHPAD_CONTAINER = 'scratchpad-container';

interface ScratchpadItemProps {
  entry: ScratchpadEntry;
  onOpen: (entry: ScratchpadEntry) => void;
  onRename: (entry: ScratchpadEntry) => void;
  onDelete: (entry: ScratchpadEntry) => void;
  formatTime: (ts: number) => string;
}

const ScratchpadItem = React.memo((props: ScratchpadItemProps) => {
  const { entry, onOpen, onRename, onDelete, formatTime } = props;
  return (
    <div className="scratchpad-item" onClick={() => onOpen(entry)}>
      <div className="scratchpad-item__meta">
        <span className="scratchpad-item__name">{entry.name}</span>
        <span className="scratchpad-item__time">
          <TimeIcon size={12} style={{ opacity: 0.5, marginRight: 4 }} />
          {formatTime(entry.updatedAt)}
        </span>
      </div>
      <div className="scratchpad-item__actions" onClick={(e) => e.stopPropagation()}>
        <button className="oi-btn oi-btn__icon" title="重命名" onClick={() => onRename(entry)}>
          <EditIcon size={14} />
        </button>
        <button className="oi-btn oi-btn__icon" title="删除" onClick={() => onDelete(entry)}>
          <DeleteIcon size={14} />
        </button>
      </div>
    </div>
  );
});

export const ScratchpadPanel: React.FC = () => {
  const scratchService = useInjectable<ScratchpadService>(ScratchpadService);
  const commandService = useInjectable<CommandService>(CommandService);
  const editorService = useInjectable<WorkbenchEditorService>(WorkbenchEditorService);
  const quickInput = useInjectable<IQuickInputService>(IQuickInputService);
  const messageService = useInjectable<IMessageService>(IMessageService);

  const isElectron = electronEnv.isElectronRenderer;
  const [items, setItems] = useState<ScratchpadEntry[]>([]);
  const [searchText, setSearchText] = useState('');
  const debouncedSearchText = useDebouncedValue(searchText, isElectron ? 0 : 200);

  const load = useCallback(async () => {
    const list = await scratchService.list();
    setItems(list);
  }, [scratchService]);

  useEffect(() => {
    load();
    const disposable = scratchService.onDidChange(() => {
      void load();
    });
    return () => disposable.dispose();
  }, [load, scratchService]);

  const filtered = useMemo(() => {
    const text = isElectron ? searchText : debouncedSearchText;
    if (!text) return items;
    const q = text.toLowerCase();
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, searchText, debouncedSearchText, isElectron]);

  const openScratch = useCallback(async (entry: ScratchpadEntry) => {
    await commandService.executeCommand(SCRATCHPAD_OPEN_CMD, entry.id);
  }, [commandService]);

  const renameScratch = useCallback(async (entry: ScratchpadEntry) => {
    const nextName = await quickInput.open({
      prompt: '重命名草稿',
      value: entry.name,
      placeHolder: '输入新的草稿名称',
    });
    if (!nextName) return;
    await scratchService.rename(entry.id, nextName);
  }, [quickInput, scratchService]);

  const deleteScratch = useCallback(async (entry: ScratchpadEntry) => {
    const choice = await messageService.warning(
      `确认删除草稿「${entry.name}」？`,
      ['删除', '取消'],
      true,
    );
    if (choice !== '删除') return;
    await scratchService.remove(entry.id);
  }, [messageService, scratchService]);

  const clearAll = useCallback(async () => {
    const choice = await messageService.warning(
      '确认清空所有草稿？此操作不可恢复。',
      ['清空', '取消'],
      true,
    );
    if (choice !== '清空') return;
    await scratchService.clear();
  }, [messageService, scratchService]);

  const openNew = useCallback(async () => {
    await commandService.executeCommand(SCRATCHPAD_NEW_CMD);
  }, [commandService]);

  const formatTime = useCallback((ts: number) => {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, []);

  return (
    <div className="oi-panel scratchpad-panel">
      <div className="oi-panel__header scratchpad-panel__header">
        <span className="oi-panel__title">草稿纸</span>
        <div className="oi-panel__actions">
          <button className="oi-btn oi-btn__icon" title="新建草稿" onClick={openNew}>
            <AddIcon size={16} />
          </button>
          <button className="oi-btn oi-btn__icon" title="清空草稿" onClick={clearAll} disabled={!items.length}>
            <DeleteIcon size={16} />
          </button>
        </div>
      </div>

      <div className="scratchpad-search-box">
        <SearchIcon size={14} style={{ opacity: 0.5 }} />
        <input
          className="scratchpad-search-input"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="搜索草稿..."
          spellCheck={false}
        />
      </div>

      <div className="oi-panel__body-scroll scratchpad-list">
        {filtered.length === 0 && (
          <div className="scratchpad-empty">
            <FileIcon size={28} style={{ opacity: 0.2 }} />
            <span>暂无草稿</span>
            <button className="oi-btn oi-btn__primary" onClick={openNew}>
              新建草稿
            </button>
          </div>
        )}
        {filtered.map((entry) => (
          <ScratchpadItem
            key={entry.id}
            entry={entry}
            onOpen={openScratch}
            onRename={renameScratch}
            onDelete={deleteScratch}
            formatTime={formatTime}
          />
        ))}
      </div>
    </div>
  );
};
