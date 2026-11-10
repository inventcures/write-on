import { Schema, type MarkSpec, type NodeSpec } from 'prosemirror-model';

/** The three sizes of text an alternative group can work on. */
export type Grain = 'word' | 'sentence' | 'paragraph';

/**
 * A variant is stored as the ProseMirror JSON of its inline content, so
 * formatting (and ghosts) inside a variant survive a flip.
 */
export type VariantContent = Record<string, unknown>[];

/** What an alternative group remembers: every variant and which one shows. */
export interface GroupAttrs {
  id: string;
  grain: Grain;
  variants: VariantContent[];
  active: number;
}

const blockAlt = { alt: { default: null as GroupAttrs | null } };

const nodes: Record<string, NodeSpec> = {
  // The page's blocks, then exactly one Overflow node at the end.
  doc: { content: 'block+ overflow', attrs: { id: { default: '' } } },
  paragraph: {
    group: 'block',
    content: 'inline*',
    attrs: blockAlt,
    parseDOM: [{ tag: 'p' }],
    toDOM: () => ['p', 0],
  },
  heading: {
    group: 'block',
    content: 'inline*',
    attrs: { level: { default: 1 }, ...blockAlt },
    defining: true,
    parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } })),
    toDOM: (node) => [`h${node.attrs.level}`, 0],
  },
  overflow: {
    content: 'paragraph+',
    isolating: true,
    selectable: false,
    toDOM: () => ['aside', { class: 'overflow' }, 0],
  },
  text: { group: 'inline' },
};

const marks: Record<string, MarkSpec> = {
  // A word or sentence alternative group. Non-inclusive, so typing right after
  // a group doesn't extend it; excludes itself, so groups never nest.
  alt: {
    attrs: { id: {}, grain: {}, variants: {}, active: {} },
    inclusive: false,
    excludes: 'alt',
    toDOM: (mark) => ['span', { class: `alt alt-${mark.attrs.grain}`, 'data-alt': mark.attrs.id }, 0],
  },
  ghost: {
    inclusive: false,
    toDOM: () => ['span', { class: 'ghost' }, 0],
    parseDOM: [{ tag: 'span.ghost' }],
  },
  em: {
    parseDOM: [{ tag: 'em' }, { tag: 'i' }],
    toDOM: () => ['em', 0],
  },
  strong: {
    parseDOM: [{ tag: 'strong' }, { tag: 'b' }],
    toDOM: () => ['strong', 0],
  },
  link: {
    attrs: { href: {} },
    inclusive: false,
    parseDOM: [{ tag: 'a[href]', getAttrs: (dom) => ({ href: (dom as HTMLElement).getAttribute('href') }) }],
    toDOM: (mark) => ['a', { href: mark.attrs.href, rel: 'noopener noreferrer', target: '_blank' }, 0],
  },
};

export const schema = new Schema({ nodes, marks });
