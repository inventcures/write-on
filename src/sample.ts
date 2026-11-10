import type { Node } from 'prosemirror-model';
import { EditorState, TextSelection, type Command } from 'prosemirror-state';
import { createEditorState } from './core/editor';
import { toggleGhost } from './core/ghost';
import { addVariant, createGroup, flipTo, targetForSelection, textVariant } from './core/groups';
import { docFromMarkdown } from './core/piece';

const BODY = `# Write it three ways

Every sentence starts as a sketch. The trick is not to throw the first try away, but to keep it close while you try another. Hover an underlined word and press the arrow keys to hear the options.

A draft is an argument with yourself. You win it by reading each version in place, in the sentence it has to live in, and keeping the one that sounds like you. Some lines are not wrong, just not yet, so you ghost them and read around them.

Press Ctrl+Shift+R to bring the tools in or out, Ctrl+Shift+A to give a word, sentence or paragraph an alternative, and Ctrl+/ to ghost. Anything you can't use here goes to Overflow with Ctrl+Shift+X.`;

const OVERFLOW = 'Most first drafts are a conversation you have not finished having.';

/** The first piece a new visitor sees: our own text, showing every feature. */
export function samplePiece(): Node {
  let state = createEditorState(docFromMarkdown(BODY, OVERFLOW));
  const run = (cmd: Command) => {
    cmd(state, (tr) => (state = state.apply(tr)));
  };
  const select = (text: string) => {
    let at = -1;
    state.doc.descendants((node, pos) => {
      if (at >= 0 || !node.isTextblock) return at < 0;
      const i = node.textContent.indexOf(text);
      if (i >= 0) at = pos + 1 + i;
      return false;
    });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, at, at + text.length)));
    return at;
  };
  const group = (text: string, ...others: string[]) => {
    select(text);
    let id = '';
    createGroup(targetForSelection(state)!, textVariant(others[0]))(state, (tr) => {
      id = tr.getMeta('altCreated') as string;
      state = state.apply(tr);
    });
    for (const o of others.slice(1)) run(addVariant(id, textVariant(o)));
    run(flipTo(id, 0));
  };

  group('Write it three ways', 'Say it, then say it again', 'Alternatives, not versions');
  group('sketch', 'outline', 'rough guess');
  group('A draft is an argument with yourself.', 'Writing is thinking out loud, slowly.');
  group(
    "Press Ctrl+Shift+R to bring the tools in or out, Ctrl+Shift+A to give a word, sentence or paragraph an alternative, and Ctrl+/ to ghost. Anything you can't use here goes to Overflow with Ctrl+Shift+X.",
    'Tools: Ctrl+Shift+R. Alternatives: Ctrl+Shift+A. Ghost: Ctrl+/. Overflow: Ctrl+Shift+X.',
  );
  select('Some lines are not wrong, just not yet, so you ghost them and read around them.');
  run(toggleGhost);
  return (state as EditorState).doc;
}
