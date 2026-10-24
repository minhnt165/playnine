import { test, expect, type Page } from '@playwright/test';

// Tính 24 trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).

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

// Bỏ hộp Cách chơi lần đầu để bấm được vào bàn
async function skipGuide(page: Page) {
  await page.addInitScript(() => {
    if (!window.localStorage.getItem('playnine-tinh24-settings-v1')) {
      window.localStorage.setItem('playnine-tinh24-settings-v1', JSON.stringify({ guideSeen: true }));
    }
  });
}

test('tinh24 reports a won run when the last puzzle of the set reaches 24', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  // Ván lưu: bộ khó, đã giải 4 đề, đề cuối 3 3 8 8 đã làm 8 ÷ 3 = 8/3 (ô 0) rồi 3 − 8/3 = 1/3 (ô 0).
  // Còn ô 0 = 1/3 và ô 3 = 8: chạm ô 3, ÷, ô 0 → 8 ÷ 1/3 = 24.
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-tinh24-save-v1')) return;
    const game = {
      v: 1,
      mode: 'hard',
      rng: 12345,
      deck: [[4, 4, 10, 10], [1, 5, 5, 5], [1, 3, 4, 6], [3, 3, 7, 7], [3, 3, 8, 8]],
      done: 4,
      skips: 0,
      hints: 0,
      moves: 14,
      steps: [[2, '/', 0], [1, '-', 0]],
    };
    window.localStorage.setItem('playnine-tinh24-save-v1', JSON.stringify({ v: 1, game, elapsed: 20000 }));
  });
  await page.goto('#/play/tinh24');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'hard'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('.tile.empty')).toHaveCount(2);
  await frame.locator('.tile[data-i="3"]').click();
  await frame.locator('.op[data-op="/"]').click();
  await frame.locator('.tile[data-i="0"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'tinh24', mode: 'hard', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(20000);
  await expect(frame.locator('#modal-win')).toBeVisible();
});

test('tinh24 reports a lost run when a started set is abandoned', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/tinh24');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'easy'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  // Một phép cộng giữa hai số gốc luôn hợp lệ và chưa thể xong đề (còn ba số)
  await frame.locator('.tile[data-i="0"]').click();
  await frame.locator('.op[data-op="+"]').click();
  await frame.locator('.tile[data-i="1"]').click();
  await expect(frame.locator('.tile.empty')).toHaveCount(1);
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'tinh24', mode: 'easy', won: false });
});

test('tinh24 switches level before the first move without ending a run', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/tinh24');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'easy'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('.levels button[data-value="hard"]').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('hard');
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
