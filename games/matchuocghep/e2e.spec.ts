import { test, expect, type Page } from '@playwright/test';

// Mạt Chược Ghép trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).

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

// Bàn Nhỏ seed 2026 (engine.deal('mini', 2026)): mặt quân theo vị trí và thứ tự gỡ lúc sinh đề.
// Ván lưu dựng sẵn: đã gỡ `pairs` cặp đầu theo thứ tự đó (ván lưu phải khớp bộ quân của seed, engine kiểm tra khi mở).
const FACES = [19, 0, 11, 32, 0, 18, 1, 27, 7, 19, 5, 7, 22, 31, 23, 27, 2, 34, 21, 21, 11, 22, 19, 23, 2, 36, 1, 32, 22, 22, 5, 31, 32, 32, 19, 18];
const ORDER = [[18, 19], [12, 21], [3, 33], [4, 1], [22, 34], [20, 2], [29, 28], [5, 35], [32, 27], [6, 26], [23, 14], [9, 0], [25, 17], [30, 10], [13, 31], [11, 8], [16, 24], [7, 15]];

async function seedSave(page: Page, pairs: number, elapsed: number) {
  await page.addInitScript(
    ({ faces, order, pairs, elapsed }) => {
      if (window.localStorage.getItem('playnine-matchuocghep-save-v1')) return;
      const history = order.slice(0, pairs);
      const gone = faces.map(() => 0);
      history.forEach(([a, b]) => {
        gone[a] = 1;
        gone[b] = 1;
      });
      const game = { v: 1, mode: 'mini', seed: 2026, date: null, faces, gone, history, moves: pairs, hints: 0, shuffles: 0 };
      window.localStorage.setItem('playnine-matchuocghep-settings-v1', JSON.stringify({ guideSeen: true, mode: 'mini' }));
      window.localStorage.setItem('playnine-matchuocghep-save-v1', JSON.stringify({ v: 1, game, elapsed }));
    },
    { faces: FACES, order: ORDER, pairs, elapsed },
  );
}

test('matchuocghep reports a won run when the last pair clears the board', async ({ page }) => {
  await captureMessages(page);
  await seedSave(page, 17, 20000);
  await page.goto('#/play/matchuocghep');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'mini'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('.tile:not([hidden])')).toHaveCount(2);
  await frame.locator('.tile[data-i="7"]').click();
  await frame.locator('.tile[data-i="15"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'matchuocghep', mode: 'mini', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(20000);
  await expect(frame.locator('#modal-win')).toBeVisible();
});

test('matchuocghep reports a lost run when a started game is abandoned', async ({ page }) => {
  await captureMessages(page);
  await seedSave(page, 1, 3000);
  await page.goto('#/play/matchuocghep');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'mini'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('.tile:not([hidden])')).toHaveCount(34);
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'matchuocghep', mode: 'mini', won: false });
});

test('matchuocghep switches board before the first pair without ending a run', async ({ page }) => {
  await captureMessages(page);
  await page.addInitScript(() => {
    if (!window.localStorage.getItem('playnine-matchuocghep-settings-v1')) {
      window.localStorage.setItem('playnine-matchuocghep-settings-v1', JSON.stringify({ guideSeen: true, mode: 'mini' }));
    }
  });
  await page.goto('#/play/matchuocghep');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'mini'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('.modes button[data-value="tower"]').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('tower');
  await expect(frame.locator('.tile')).toHaveCount(84);
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
