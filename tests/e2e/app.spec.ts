import { expect, test, type Page } from '@playwright/test';

const pieceFile = (page: Page) => page.evaluate(() => (window as unknown as { writeOn: { toPieceFile(): string } }).writeOn.toPieceFile());

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
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
  await page.keyboard.press('Control+g');
  await expect(row.getByRole('button', { name: 'Ctrl+G' })).toBeVisible();
  await expect(sheet).toContainText('What the colours mean');
  await page.keyboard.press('Escape');
  await page.getByText('Every sentence starts').dblclick();
  const before = await page.locator('.ghost').count();
  await page.keyboard.press('Control+g');
  await expect(page.locator('.ghost')).toHaveCount(before + 1);
});
