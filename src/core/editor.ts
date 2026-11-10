import { history } from 'prosemirror-history';
import type { Node } from 'prosemirror-model';
import { EditorState, type Plugin } from 'prosemirror-state';
import { pageCaret } from './piece';
import { keepVanishedVariants } from './recovery';
import { schema } from './schema';

/** The editor core's state: history, the page caret memory and the no-loss guard. */
export function createEditorState(doc: Node, plugins: Plugin[] = []): EditorState {
  return EditorState.create({ doc, schema, plugins: [history(), pageCaret, keepVanishedVariants, ...plugins] });
}
