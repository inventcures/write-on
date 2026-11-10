import { expect, test, type Page } from '@playwright/test';

const pieceFile = (page: Page) => page.evaluate(() => (window as unknown as { writeOn: { toPieceFile(): string } }).writeOn.toPieceFile());

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('write-on:welcomed', '1');
  });
  await page.reload();
});

test('opens in read mode, and Ctrl+Shift+R brings the tools in', async ({ page }) => {
  await expect(page.locator('body')).toHaveClass(/read/);
  await expect(page.locator('.count')).toHaveText(/\d+ words \d+ chars/);
  await expect(page.getByRole('button', { name: /^Save/ })).toBeHidden();
  await page.keyboard.press('Control+Shift+R');
  await expect(page.locator('body')).not.toHaveClass(/read/);
  await expect(page.getByRole('button', { name: /^Save/ })).toBeVisible();
});

test('makes a word group in the panel and flips it by hovering', async ({ page }) => {
  await page.keyboard.press('Control+Shift+R');
  await page.getByText('first try away', { exact: false }).click();
  await page.keyboard.press('Control+Shift+A');
  await expect(page.locator('.alt-panel')).toHaveClass(/open/);
  await page.keyboard.type('swiftly');
  await page.keyboard.press('Escape');
  await expect(page.locator('.alt-panel')).not.toHaveClass(/open/);
  const group = page.locator('.alt-word', { hasText: 'swiftly' });
  await expect(group).toBeVisible();
  await group.hover();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.alt-word', { hasText: 'swiftly' })).toHaveCount(0);
  await page.keyboard.press('Control+z');
  // Undo undoes the edit, not the flip.
  expect(await pieceFile(page)).not.toContain('"text":"swiftly"');
});

test('ghosts and revives a selection with Ctrl+/', async ({ page }) => {
  await page.keyboard.press('Control+Shift+R');
  await page.getByText('Every sentence starts').dblclick();
  await page.keyboard.press('Control+/');
  await expect(page.locator('.ghost').first()).toBeVisible();
  const before = await page.locator('.ghost').count();
  await page.keyboard.press('Control+/');
  expect(await page.locator('.ghost').count()).toBeLessThan(before);
});

test('stashes a paragraph in Overflow and uses it again', async ({ page }) => {
  await page.keyboard.press('Control+Shift+R');
  await page.getByText('A draft is', { exact: false }).click();
  await page.keyboard.press('Control+Shift+X');
  await page.keyboard.press('Control+Shift+D');
  const overflow = page.locator('aside.overflow');
  await expect(overflow).toBeVisible();
  await expect(overflow).toContainText('A draft is an argument with yourself.');
  await overflow.getByText('A draft is', { exact: false }).click();
  await page.keyboard.press('Control+Enter');
  await expect(overflow).not.toContainText('A draft is an argument');
  await expect(page.locator('.ProseMirror > p', { hasText: 'A draft is' })).toBeVisible();
});

test('keeps the piece across a reload', async ({ page }) => {
  await page.keyboard.press('Control+Shift+R');
  await page.getByText('Every sentence starts').click();
  await page.keyboard.press('Home');
  await page.keyboard.type('Remember me. ');
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator('.ProseMirror')).toContainText('Remember me.');
});

test('the timeline shows each moment and replays', async ({ page }) => {
  await page.keyboard.press('Control+Shift+R');
  await page.getByText('Every sentence starts').click();
  await page.keyboard.press('Home');
  await page.keyboard.type('Start here. ');
  await page.keyboard.press('Control+Shift+L');
  const timeline = page.getByRole('dialog', { name: 'Timeline' });
  await expect(timeline).toBeVisible();
  await expect(timeline.locator('.tl-caption')).toHaveText('Added ‘Start here.’');
  await expect(timeline.locator('.tl-change ins')).toContainText('Start here.');
  await timeline.getByRole('button', { name: /Go to this passage/ }).click();
  await expect(timeline).toBeHidden();
  await expect(page.locator('.alt-panel')).toHaveClass(/open/);
});

test('rebinds a shortcut in the shortcuts sheet', async ({ page }) => {
  await page.keyboard.press('Control+Shift+R');
  await page.getByRole('button', { name: /Shortcuts and colours/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Shortcuts and colours' });
  const row = sheet.getByRole('row', { name: /Ghost it/ });
  await row.getByRole('button', { name: 'Ctrl+/' }).click();
  await page.keyboard.press('g');
  await expect(sheet).toContainText('needs Ctrl, Alt or');
  await page.keyboard.press('Control+z');
  await expect(sheet).toContainText('belongs to the editor');
  await page.keyboard.press('Control+g');
  await expect(row.getByRole('button', { name: 'Ctrl+G' })).toBeVisible();
  await expect(sheet).toContainText('What the colours mean');
  await page.keyboard.press('Escape');
  await page.getByText('Every sentence starts').dblclick();
  const before = await page.locator('.ghost').count();
  await page.keyboard.press('Control+g');
  await expect(page.locator('.ghost')).toHaveCount(before + 1);
});

test('suggestions arrive in blue under the writer\'s word, behind the access code', async ({ page }) => {
  let asked: { text?: string; grain?: string; code?: string } = {};
  let calls = 0;
  await page.route('**/api/ai', (r) => r.fulfill({ json: { enabled: true } }));
  await page.route('**/api/suggest', async (r) => {
    asked = { ...r.request().postDataJSON(), code: r.request().headers()['x-write-on-code'] };
    if (asked.code !== 'sesame') return r.fulfill({ status: 401, json: { error: 'That access code isn’t right.' } });
    calls++;
    return r.fulfill({ json: { alternatives: calls === 1 ? ['effort', 'attempt', 'go'] : ['stab', 'shot'] } });
  });
  await page.reload();
  await page.keyboard.press('Control+Shift+R');
  await page.getByText('first try away', { exact: false }).click();
  await page.keyboard.press('Control+Shift+G');
  const panel = page.locator('.alt-panel');
  await panel.getByLabel('Access code for suggestions').fill('sesame');
  await panel.getByRole('button', { name: 'ok' }).click();
  await expect(panel.locator('.row.machine')).toHaveCount(3);
  expect(asked.grain).toBe('word');
  // Asking again from the button, with the code remembered and the caret in a row,
  // still leaves the writer's word on the page.
  await panel.locator('.row textarea').last().focus();
  await page.keyboard.press('Control+Shift+G');
  await expect(panel.locator('.row.machine')).toHaveCount(5);
  await expect(panel.locator('.row.on')).not.toHaveClass(/machine/);
  await expect(panel.locator('.row.machine').first()).toHaveAttribute('data-by', 'suggested');
  // The page still shows the writer's own word.
  const file = await pieceFile(page);
  expect(file).toContain('"authors"');
  await page.keyboard.press('Escape');
  const pageText = page.locator('.ProseMirror > :not(aside)');
  await expect(pageText.first()).toBeVisible();
  const shown = (await pageText.allTextContents()).join(' ');
  expect(shown).toContain(String(asked.text));
  expect(shown).not.toMatch(/\b(effort|attempt|stab|shot)\b/);
});

test('a first visit explains itself and the tour waits for each step', async ({ page }) => {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const welcome = page.getByRole('dialog', { name: 'Welcome to Write_On' });
  await expect(welcome).toBeVisible();
  await expect(welcome).toContainText('Alternatives');
  await expect(welcome).toContainText('Ghost');
  await expect(welcome).toContainText('Overflow');
  await expect(welcome.getByRole('link', { name: 'pair programming' })).toHaveAttribute('href', /Pair_programming/);
  await welcome.getByRole('button', { name: /Show me how/ }).click();
  await expect(welcome).toBeHidden();
  await expect(page.locator('body')).not.toHaveClass(/read/);
  const tour = page.locator('.tour');
  await expect(tour).toContainText('1 of 5');
  // Step 1 waits for a flip.
  const sketch = page.locator('.alt-word', { hasText: 'sketch' });
  await sketch.hover();
  await page.keyboard.press('ArrowRight');
  await expect(tour).toContainText('2 of 5');
  // Step 2: the Alternatives button keeps the caret where it was.
  await page.getByText('first try away', { exact: false }).click();
  await page.getByRole('button', { name: /^Alternatives for the word/ }).click();
  await page.keyboard.type('quickly');
  await expect(tour).toContainText('3 of 5');
  await page.keyboard.press('Escape');
  await tour.getByRole('button', { name: 'Skip the tour' }).click();
  await expect(tour).toBeHidden();
  // Seen once: not shown again, but ? brings it back.
  await page.reload();
  await expect(welcome).toBeHidden();
  await page.getByRole('button', { name: /Welcome and tour/ }).click();
  await expect(welcome).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(welcome).toBeHidden();
});
