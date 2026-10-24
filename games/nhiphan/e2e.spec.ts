import { test, expect, type Page } from '@playwright/test';

// Nhị Phân trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).

type Msg = { type: string; gameId?: string; mode?: string; won?: boolean; assisted?: boolean; resume?: boolean; timeMs?: number };

async function captureMessages(page: Page) {
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const w = window as unknown as { __pn: unknown[] };
    w.__pn = [];
    window.addEventListener('message', (e) => {
      if (e.data && typeof e.data === 'object' && String(e.data.type).startsWith('pn:')) w.__pn.push(e.data);
    });
  });
}

const messages = (page: Page) => page.evaluate(() => (window as unknown as { __pn: Msg[] }).__pn);

/** Bỏ hộp "Cách chơi" tự mở ở lần đầu. */
async function skipHelp(page: Page) {
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-nhiphan-settings-v1')) return;
    window.localStorage.setItem('playnine-nhiphan-settings-v1', JSON.stringify({ helpSeen: true }));
  });
}

test('nhiphan reports a won run when the last cell is filled', async ({ page }) => {
  await captureMessages(page);
  await skipHelp(page);
  // Ván lưu: đề 6×6 (seed 2026), đã điền đúng mọi ô trừ ô 2 (đáp án 0) → chạm một lần là thắng.
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-nhiphan-save-v1')) return;
    const game = {
      v: 1,
      size: 6,
      seed: 2026,
      puzzle: '.......0......11.....11...1.1.0.....',
      solution: '110010101001001101010110101010010101',
      cells: '11.010101001001101010110101010010101',
      undo: [],
      redo: [],
      moves: 24,
      hints: 0,
    };
    window.localStorage.setItem('playnine-nhiphan-save-v1', JSON.stringify({ v: 1, game, elapsed: 5000 }));
  });
  await page.goto('#/play/nhiphan');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === '6'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('.cell[data-i="2"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'nhiphan', mode: '6', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(5000);
  await expect(frame.locator('#modal-win')).toBeVisible();
  await expect(frame.locator('#win-assisted')).toBeHidden();
});

test('nhiphan reports a lost run when a started puzzle is abandoned', async ({ page }) => {
  await captureMessages(page);
  await skipHelp(page);
  await page.goto('#/play/nhiphan');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === '6'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('.cell:not(.given)').first().click();
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#new-warn')).toBeVisible();
  await frame.locator('.size-opt[data-size="8"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'nhiphan', mode: '6', won: false });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('8');
  await expect(frame.locator('.cell')).toHaveCount(64);
});

test('nhiphan switches size before the first move without ending a run', async ({ page }) => {
  await captureMessages(page);
  await skipHelp(page);
  await page.goto('#/play/nhiphan');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === '6'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#new-warn')).toBeHidden();
  await frame.locator('.size-opt[data-size="10"]').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('10');
  await expect(frame.locator('.cell')).toHaveCount(100);
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
