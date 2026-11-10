import MarkdownIt, { type Token } from 'markdown-it';
import { MarkdownSerializer } from 'prosemirror-markdown';
import { Fragment, type Mark, type Node } from 'prosemirror-model';
import { schema } from './schema';

// Phase 0 pieces are headings and paragraphs with bold, italic and links.
// Everything else markdown-it knows is switched off, so it stays plain text.
const md = new MarkdownIt('commonmark', { html: false }).disable([
  'list',
  'blockquote',
  'code',
  'fence',
  'hr',
  'html_block',
  'html_inline',
  'image',
  'backticks',
  'entity',
  'autolink',
]);

function inlineNodes(tokens: Token[]): Node[] {
  const out: Node[] = [];
  let active: readonly Mark[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case 'text':
        if (t.content) out.push(schema.text(t.content, active));
        break;
      case 'softbreak':
      case 'hardbreak':
        out.push(schema.text(' ', active));
        break;
      case 'em_open':
        active = schema.marks.em.create().addToSet(active);
        break;
      case 'strong_open':
        active = schema.marks.strong.create().addToSet(active);
        break;
      case 'link_open':
        active = schema.marks.link.create({ href: t.attrGet('href') ?? '' }).addToSet(active);
        break;
      case 'em_close':
        active = schema.marks.em.removeFromSet(active);
        break;
      case 'strong_close':
        active = schema.marks.strong.removeFromSet(active);
        break;
      case 'link_close':
        active = schema.marks.link.removeFromSet(active);
        break;
      default:
        if (t.content) out.push(schema.text(t.content, active));
    }
  }
  return mergeText(out);
}

function mergeText(nodes: Node[]): Node[] {
  return Fragment.fromArray(nodes.filter((n) => n.text !== '')).content as Node[];
}

/** Parse a Markdown body into the page's block nodes. */
export function parseBlocks(markdown: string): Node[] {
  const tokens = md.parse(markdown, {});
  const blocks: Node[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'heading_open') {
      const level = Number(t.tag.slice(1));
      blocks.push(schema.nodes.heading.create({ level }, inlineNodes(tokens[i + 1].children ?? [])));
      i += 2;
    } else if (t.type === 'paragraph_open') {
      blocks.push(schema.nodes.paragraph.create(null, inlineNodes(tokens[i + 1].children ?? [])));
      i += 2;
    }
  }
  return blocks;
}

const serializer = new MarkdownSerializer(
  {
    heading(state, node) {
      state.write('#'.repeat(node.attrs.level) + ' ');
      state.renderInline(node);
      state.closeBlock(node);
    },
    paragraph(state, node) {
      state.renderInline(node);
      state.closeBlock(node);
    },
    text(state, node) {
      state.text(node.text ?? '');
    },
  },
  {
    em: { open: '*', close: '*', mixable: true, expelEnclosingWhitespace: true },
    strong: { open: '**', close: '**', mixable: true, expelEnclosingWhitespace: true },
    link: {
      open: '[',
      close: (_state, mark) => `](${String(mark.attrs.href).replace(/[()"]/g, '\\$&')})`,
    },
    // Groups and ghosts live in the piece file's metadata, not in the Markdown.
    alt: { open: '', close: '' },
    ghost: { open: '', close: '' },
  },
);

/** Serialise block nodes as Markdown, one blank line between blocks. */
export function serializeBlocks(blocks: readonly Node[]): string {
  if (blocks.length === 0) return '';
  // An unchecked container: the serializer only walks its children.
  const container = schema.nodes.doc.create(null, Fragment.fromArray(blocks as Node[]));
  return serializer.serialize(container).trim();
}
