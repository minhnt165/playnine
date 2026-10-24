import { test, expect, type Page } from '@playwright/test';

// Tìm Chữ trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).

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
    if (!window.localStorage.getItem('playnine-timchu-settings-v1')) {
      window.localStorage.setItem('playnine-timchu-settings-v1', JSON.stringify({ guideSeen: true }));
    }
  });
}

test('timchu reports a won run when the last word is circled', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  // Ván lưu: đề 8x8 (mode s, seed 1, chủ đề School), đã tìm 5/6 từ, còn SCHOOL (dọc, ô 12 → ô 52).
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-timchu-save-v1')) return;
    const game = {
      v: 1,
      mode: 's',
      seed: 1,
      theme: 'school',
      grid: 'lehexampuwalskdenioecrpncyrthgmchistoryiyeeeowalfnyrldtrptvtieio',
      words: [['exam', 0, 3, 0], ['history', 4, 0, 0], ['letter', 1, 3, 1], ['lunch', 0, 0, 1], ['pencil', 0, 7, 1], ['school', 1, 4, 1]],
      found: [0, 1, 2, 3, 4],
      hinted: [],
      tries: 5,
    };
    window.localStorage.setItem('playnine-timchu-save-v1', JSON.stringify({ v: 1, game, elapsed: 5000 }));
  });
  await page.goto('#/play/timchu');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 's'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('.word.found')).toHaveCount(5);
  // Chạm chữ đầu rồi chữ cuối của SCHOOL
  await frame.locator('.cell[data-i="12"]').click();
  await frame.locator('.cell[data-i="52"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'timchu', mode: 's', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(5000);
  await expect(frame.locator('#modal-win')).toBeVisible();
});

test('timchu reports a lost run when a started puzzle is abandoned', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/timchu');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 's'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  // Một lượt chọn: cả hàng đầu (đoạn thẳng hợp lệ, trúng hay trượt đều tính là đã đi)
  await frame.locator('.cell[data-i="0"]').click();
  await frame.locator('.cell[data-i="7"]').click();
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'timchu', mode: 's', won: false });
});

test('timchu switches size before the first move without ending a run', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/timchu');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 's'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('.sizes button[data-value="l"]').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('l');
  await expect(frame.locator('.cell')).toHaveCount(196);
  await expect(frame.locator('.word')).toHaveCount(15);
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
