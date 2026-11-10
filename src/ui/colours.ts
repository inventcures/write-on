/**
 * One colour vocabulary for the whole app. Each colour always means the same
 * thing, so the writer learns it without thinking; each also has a second cue
 * (strike-through, fading, stripes, a mark shape) so it reads without colour.
 */
export const COLOUR_MEANINGS: { token: string; name: string; meaning: string; cue: string }[] = [
  { token: '--kept', name: 'Green', meaning: 'Kept: words you added that stay, the alternative you chose, text you brought back', cue: 'solid highlight' },
  { token: '--rejected', name: 'Red', meaning: 'Rejected: words you cut, alternatives you dropped', cue: 'struck through' },
  { token: '--undecided', name: 'Amber', meaning: 'Undecided: ghosted text, Overflow, alternatives you are holding', cue: 'faded, or striped' },
  { token: '--word', name: 'Violet', meaning: 'An alternative at word grain', cue: 'thin wavy underline' },
  { token: '--sentence', name: 'Rose', meaning: 'An alternative at sentence grain', cue: 'lower wavy underline' },
  { token: '--paragraph', name: 'Copper', meaning: 'An alternative at paragraph grain', cue: 'bar in the margin' },
  { token: '--machine', name: 'Electric blue', meaning: 'Machine-suggested text (from Phase 1), never mistaken for yours', cue: 'robot mark and label' },
];

export function colourKey(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'colour-key';
  const h = document.createElement('h3');
  h.textContent = 'What the colours mean';
  wrap.append(h);
  const list = document.createElement('ul');
  for (const c of COLOUR_MEANINGS) {
    const li = document.createElement('li');
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = `var(${c.token})`;
    const text = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = `${c.name}. `;
    text.append(strong, `${c.meaning} (${c.cue}).`);
    li.append(sw, text);
    list.append(li);
  }
  wrap.append(list);
  return wrap;
}
