import { test, expect, type Page } from '@playwright/test';

// Sao Chiến trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).

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

// Bỏ hộp Cách chơi lần đầu để bấm được vào bàn; thứ tự chạm mặc định (chấm → sao)
async function skipGuide(page: Page) {
  await page.addInitScript(() => {
    if (!window.localStorage.getItem('playnine-saochien-settings-v1')) {
      window.localStorage.setItem('playnine-saochien-settings-v1', JSON.stringify({ guideSeen: true }));
    }
  });
}

test('saochien reports a won run when the last star completes the puzzle', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  // Ván lưu: đề 5x5 (seed 4, một lời giải: sao ở ô 3, 5, 12, 19, 21), đã đặt 4 sao, còn thiếu ô 21.
  //   vùng: 0 0 0 1 1 / 0 2 2 1 3 / 0 4 2 3 3 / 4 4 2 2 3 / 4 4 4 3 3
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-saochien-save-v1')) return;
    const regions = '0001102213042334422344433'.split('').map(Number);
    const stars = [3, 5, 12, 19];
    const marks = regions.map((_, i) => (stars.includes(i) ? 2 : 0));
    const game = { v: 1, mode: '5', seed: 4, date: null, regions, marks, moves: 4, hints: 0, history: stars.map((i) => [[i, 0, 2]]), future: [] };
    window.localStorage.setItem('playnine-saochien-save-v1', JSON.stringify({ v: 1, game, elapsed: 5000 }));
  });
  await page.goto('#/play/saochien');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === '5'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('.cell.star')).toHaveCount(4);
  // Chạm hai lần: trống → chấm → sao
  await frame.locator('.cell[data-i="21"]').click();
  await frame.locator('.cell[data-i="21"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'saochien', mode: '5', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(5000);
  await expect(frame.locator('#modal-win')).toBeVisible();
});

test('saochien reports a lost run when a started puzzle is abandoned', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/saochien');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === '5'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('.cell[data-i="0"]').click();
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'saochien', mode: '5', won: false });
});

test('saochien switches size before the first move without ending a run', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/saochien');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === '5'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#modes button[data-mode="10"]').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('10');
  await expect(frame.locator('.cell')).toHaveCount(100);
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
