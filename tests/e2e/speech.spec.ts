import { expect, test, type Page } from '@playwright/test';

// A fake microphone, and a stand-in for the browser's speech engine that says what the test tells it to.
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['microphone'] });

const pieceFile = (page: Page) => page.evaluate(() => (window as unknown as { writeOn: { toPieceFile(): string } }).writeOn.toPieceFile());
const say = (page: Page, text: string, final = true) => page.evaluate(([t, f]) => (window as unknown as { say(t: string, f: boolean): void }).say(t as string, f as boolean), [text, final]);

/** Put the caret before `word` (or select it), straight through the editor. */
const caretAt = (page: Page, word: string, select = false) =>
  page.evaluate(
    ([w, sel]) => {
      type V = { state: any; dispatch(tr: unknown): void; focus(): void };
      const view = (window as unknown as { writeOn: { view: V } }).writeOn.view;
      let at = -1;
      view.state.doc.descendants((n: any, pos: number) => {
        if (at === -1 && n.isText && n.text.includes(w)) at = pos + n.text.indexOf(w);
      });
      const Sel = view.state.selection.constructor;
      view.dispatch(view.state.tr.setSelection(Sel.create(view.state.doc, at, sel ? at + (w as string).length : at)));
      view.focus();
    },
    [word, select] as const,
  );

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    class FakeRecognition {
      lang = '';
      continuous = false;
      interimResults = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        (window as unknown as { say: unknown }).say = (text: string, isFinal: boolean) => {
          const r = Object.assign([{ transcript: text }], { isFinal });
          this.onresult?.({ resultIndex: 0, results: [r] });
        };
      }
      stop() {
        setTimeout(() => this.onend?.(), 0);
      }
      abort() {
        this.stop();
      }
    }
    Object.assign(window, { SpeechRecognition: FakeRecognition, webkitSpeechRecognition: FakeRecognition });
  });
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('write-on:welcomed', '1');
  });
  await page.reload();
  await page.keyboard.press('Control+Shift+R');
});

test('dictated words go in at the caret as the writer\'s own, and the recording is kept with the piece', async ({ page }) => {
  // Caret just before "Hover".
  await caretAt(page, 'Hover');
  await page.getByRole('button', { name: /Speak/ }).click();
  const pill = page.getByRole('status').filter({ hasText: 'Listening' });
  await expect(pill).toBeVisible();
  await say(page, 'and then', false);
  await expect(page.locator('.listening-what')).toHaveText('and then');
  await say(page, 'and then comma quietly full stop it worked');
  await page.waitForTimeout(1300); // let the fake microphone record a little
  await page.keyboard.press('Control+Shift+M');
  await expect(page.locator('.listening')).toBeHidden();
  await expect(page.getByText(/Kept the recording \(\d:\d\d\) in this browser/)).toBeVisible();
  const file = await pieceFile(page);
  expect(file).toContain('try another. And then, quietly. It worked Hover an underlined word');
  expect(file).not.toContain('machine');

  await page.getByRole('button', { name: /^Your writing/ }).click();
  const yw = page.getByRole('dialog', { name: 'Your writing' });
  await yw.getByRole('button', { name: 'Recordings (1)' }).click();
  await expect(yw.locator('.yw-rec audio')).toHaveCount(1);
  await expect(yw.locator('.yw-rec-heard')).toHaveText('“and then comma quietly full stop it worked”');
  await expect(yw.getByRole('link', { name: 'Download' })).toHaveAttribute('download', /^recording-.*\.webm$/);
  await yw.locator('.yw-rec').getByRole('button', { name: 'Delete' }).click();
  await expect(yw.getByRole('button', { name: /Recordings/ })).toHaveCount(0);
});

test('with the alternatives panel open, what is said becomes one new alternative, and the original is kept', async ({ page }) => {
  await caretAt(page, 'close', true);
  await page.keyboard.press('Control+Shift+A');
  const panel = page.getByRole('region', { name: 'Alternatives' });
  await expect(panel).toBeVisible();
  const before = await pieceFile(page);
  await page.keyboard.press('Control+Shift+M');
  await expect(page.locator('.listening-what')).toContainText('Say another way');
  await say(page, 'attempt.');
  await page.keyboard.press('Control+Shift+M');
  await expect(page.locator('.listening')).toBeHidden();
  await expect(panel.locator('textarea')).toHaveCount(3);
  await expect(panel.locator('textarea').nth(1)).toHaveValue('attempt');
  // As with a typed alternative, the spoken one shows in place, and the original is kept beside it.
  const after = await pieceFile(page);
  expect(after).toContain('keep it attempt while');
  expect(after).toMatch(/"text":"close"\}\],\[\{"type":"text","text":"attempt"/);
  expect(before).not.toContain('attempt');
});
