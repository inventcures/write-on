import { Node } from 'prosemirror-model';
import { serializeBlocks } from './markdown';
import { docFromMarkdown, overflowNode, pageBlocks } from './piece';
import { withoutGhosts } from './ghost';
import { recoverGroups } from './recovery';
import { schema } from './schema';

const OVERFLOW_LINE = '<!-- overflow -->';
const META_RE = /\n*<!-- write_on (\{[\s\S]*\}) -->\s*$/;

interface PieceMeta {
  version: 1;
  /** Hash of the Markdown body and Overflow text this metadata was written with. */
  bodyHash: string;
  doc: Record<string, unknown>;
}

/** FNV-1a, enough to notice that the body was edited elsewhere. */
export function hashBody(body: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) {
    h ^= body.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function bodyMarkdown(doc: Node): string {
  return serializeBlocks(pageBlocks(doc));
}

export function overflowMarkdown(doc: Node): string {
  const items: Node[] = [];
  overflowNode(doc).forEach((p) => items.push(p));
  return serializeBlocks(items.filter((p) => p.textContent.trim() !== ''));
}

/** The piece as one Markdown file: body, then Overflow, then the metadata comment. */
export function toPieceFile(doc: Node): string {
  const body = bodyMarkdown(doc);
  const overflow = overflowMarkdown(doc);
  const meta: PieceMeta = { version: 1, bodyHash: hashBody(`${body}\u0000${overflow}`), doc: doc.toJSON() };
  // "-->" inside a string would end the comment early; escaping ">" keeps the JSON equal.
  const json = JSON.stringify(meta).replace(/-->/g, '--\\u003e');
  let file = body + '\n';
  if (overflow) file += `\n${OVERFLOW_LINE}\n\n${overflow}\n`;
  return `${file}\n<!-- write_on ${json} -->\n`;
}

export interface LoadedPiece {
  doc: Node;
  /** Set when the body had been edited outside Write_On. */
  notice?: string;
}

export function fromPieceFile(text: string): LoadedPiece {
  const normalized = text.replace(/\r\n?/g, '\n');
  const metaMatch = normalized.match(META_RE);
  const withoutMeta = metaMatch ? normalized.slice(0, metaMatch.index) : normalized;
  const split = withoutMeta.split(new RegExp(`^${OVERFLOW_LINE}\\s*$`, 'm'));
  const body = split[0].trim();
  const overflow = split.slice(1).join('\n').trim();

  if (!metaMatch) return { doc: docFromMarkdown(body, overflow) };

  let meta: PieceMeta | undefined;
  try {
    meta = JSON.parse(metaMatch[1]) as PieceMeta;
  } catch {
    meta = undefined;
  }
  if (!meta || meta.version !== 1) {
    return { doc: docFromMarkdown(body, overflow), notice: 'The Write_On data in this file could not be read, so it opened as plain Markdown.' };
  }

  const stored = Node.fromJSON(schema, meta.doc);
  if (hashBody(`${body}\u0000${overflow}`) === meta.bodyHash) return { doc: stored };

  const edited = docFromMarkdown(body, overflow, String(stored.attrs.id || ''));
  const { doc, lost } = recoverGroups(stored, edited);
  const notice =
    'This piece was edited outside Write_On. Its text was kept as edited' +
    (lost > 0 ? `, and the variants of ${lost} alternative group${lost === 1 ? '' : 's'} that no longer fit were moved to Overflow.` : '.');
  return { doc, notice };
}

/** The piece as it reads, for publishing: no ghosts, no Overflow, no metadata. */
export function exportMarkdown(doc: Node): string {
  const clean = bodyMarkdown(withoutGhosts(doc));
  return (
    clean
      .split('\n')
      .map((line) => line.replace(/ {2,}/g, ' ').replace(/ +([.,;:!?])/g, '$1').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  );
}
