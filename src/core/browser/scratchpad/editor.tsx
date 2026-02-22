import React, { useEffect, useState } from 'react';
import { ReactEditorComponent, CodeEditor } from '@opensumi/ide-editor/lib/browser';
import { URI, useInjectable } from '@opensumi/ide-core-browser';
import { TimeIcon, EditIcon } from 'tdesign-icons-react';

import { ScratchpadService } from './scratchpad.service';
import '../styles/scratchpad.less';

export const ScratchpadEditor: ReactEditorComponent = ({ resource }) => {
  const scratchService = useInjectable<ScratchpadService>(ScratchpadService);
  const [name, setName] = useState<string>('草稿纸');
  const [updatedAt, setUpdatedAt] = useState<number | undefined>(undefined);
  const [codeUri, setCodeUri] = useState<URI | undefined>(undefined);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      const id = scratchService.getIdFromUri(resource.uri);
      if (!id) return;
      const entry = await scratchService.ensure(id);
      if (disposed) return;
      setName(entry.name);
      setUpdatedAt(entry.updatedAt);
      const backingUri = await scratchService.getBackingUri(id);
      if (!disposed) setCodeUri(backingUri);
    };
    load();
    const disposable = scratchService.onDidChange(() => void load());
    return () => {
      disposed = true;
      disposable.dispose();
    };
  }, [resource.uri.toString(), scratchService]);

  const formatTime = (ts?: number) => {
    if (!ts) return '';
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <div className="scratchpad-editor">
      <div className="scratchpad-editor__header">
        <div className="scratchpad-editor__title">
          <EditIcon size={14} style={{ opacity: 0.7, marginRight: 6 }} />
          草稿纸
        </div>
        <div className="scratchpad-editor__name">{name}</div>
        <div className="scratchpad-editor__meta">
          <TimeIcon size={12} style={{ opacity: 0.6, marginRight: 4 }} />
          {formatTime(updatedAt)}
        </div>
      </div>
      <div className="scratchpad-editor__body">
        {codeUri && (
          <CodeEditor className="scratchpad-editor__code" uri={codeUri} />
        )}
      </div>
    </div>
  );
};
