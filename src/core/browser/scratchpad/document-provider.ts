import { Autowired, Injectable } from '@opensumi/di';
import { Emitter, URI } from '@opensumi/ide-core-browser';
import { IEditorDocumentModelContentProvider } from '@opensumi/ide-editor/lib/browser';

import { SCRATCHPAD_SCHEME } from '../../common/scratchpad';
import { ScratchpadService } from './scratchpad.service';

@Injectable()
export class ScratchpadDocumentProvider implements IEditorDocumentModelContentProvider {
  @Autowired(ScratchpadService)
  private readonly scratchService: ScratchpadService;

  private readonly onDidChangeEmitter = new Emitter<URI>();
  onDidChangeContent = this.onDidChangeEmitter.event;

  async handlesScheme(scheme: string): Promise<boolean> {
    return scheme === SCRATCHPAD_SCHEME;
  }

  async provideEditorDocumentModelContent(uri: URI): Promise<string> {
    const id = this.scratchService.getIdFromUri(uri);
    if (!id) return '';
    const entry = await this.scratchService.ensure(id);
    return entry.content || '';
  }

  async isReadonly(): Promise<boolean> {
    return false;
  }

  async preferLanguageForUri(uri: URI): Promise<string | undefined> {
    const id = this.scratchService.getIdFromUri(uri);
    if (!id) return 'cpp';
    const entry = await this.scratchService.ensure(id);
    return entry.language || 'cpp';
  }
}
