import { Autowired, Injectable } from '@opensumi/di';
import { Domain, OnEvent, WithEventBus } from '@opensumi/ide-core-common';
import { ClientAppContribution, URI } from '@opensumi/ide-core-browser';
import { IEditorDocumentModelService } from '@opensumi/ide-editor/lib/browser';
import { EditorDocumentModelContentChangedEvent } from '@opensumi/ide-editor/lib/browser/doc-model/types';

import { SCRATCHPAD_SCHEME } from '../../common/scratchpad';
import { ScratchpadService } from './scratchpad.service';

@Domain(ClientAppContribution)
@Injectable()
export class ScratchpadAutoSaveContribution extends WithEventBus implements ClientAppContribution {
  @Autowired(ScratchpadService)
  private readonly scratchService: ScratchpadService;

  @Autowired(IEditorDocumentModelService)
  private readonly docService: IEditorDocumentModelService;

  private debounceTimers = new Map<string, number>();

  @OnEvent(EditorDocumentModelContentChangedEvent)
  onContentChanged(e: EditorDocumentModelContentChangedEvent) {
    const uri: URI = e.payload.uri;
    let id: string | undefined;
    if (uri.scheme === SCRATCHPAD_SCHEME) {
      id = this.scratchService.getIdFromUri(uri);
    } else if (uri.scheme === 'file') {
      id = this.scratchService.getIdFromBackingUri(uri);
    }
    if (!id) return;

    if (this.debounceTimers.has(id)) {
      window.clearTimeout(this.debounceTimers.get(id));
    }
    const handle = window.setTimeout(() => {
      this.debounceTimers.delete(id);
      const ref = this.docService.getModelReference(uri, 'scratchpad-autosave');
      const content = ref?.instance.getText() ?? '';
      void this.scratchService.updateContent(id, content);
      if (uri.scheme === 'file' && ref?.instance?.save) {
        void ref.instance.save(true);
      }
    }, 300);
    this.debounceTimers.set(id, handle);
  }
}
