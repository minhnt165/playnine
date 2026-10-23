import { test, expect, type Page } from '@playwright/test';

// Xếp Bài Nhện trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).
// Ván lưu = hạt giống + các nước đã đi; game chơi lại từ đầu khi mở (nước sai luật thì bỏ ván lưu).

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

/** Ván 1 chất hạt giống 3, đã đi 113 nước theo lời giải của bot: còn đúng một nước (dãy ở cột 6 lên cột 9) là thắng. */
const NEAR_WIN_ACTS = [[2,5,5],[2,4,9],[5,4,0],[6,4,2],[2,3,6],[1,5,2],[0,5,1],[2,2,6],'d',[2,2,5],[4,5,8],[4,4,3],[4,3,8],[0,5,8],[0,4,1],[1,8,4],[5,4,8],[5,3,6],[5,2,0],'d',[0,5,4],[0,3,8],[0,2,6],[0,1,1],[2,2,6],[3,8,4],[3,6,1],[7,6,8],[9,7,1],'d',[3,6,9],[5,3,6],[9,7,3],'d',[0,2,9],[0,1,6],[0,0,2],[1,14,4],[2,3,1],[2,2,8],[2,1,7],[4,9,1],[6,13,2],[7,7,3],[8,16,5],[1,8,0],'d',[2,0,1],[1,8,0],[1,4,0],[3,11,4],[4,9,1],[7,7,9],[9,9,1],[0,11,9],[5,6,0],[9,6,8],[6,13,9],[9,4,2],[6,10,9],[4,8,6],[9,3,4],[4,7,6],[6,2,4],[6,1,4],[9,2,1],[6,0,0],[3,8,4],[3,5,9],[4,5,7],[4,2,5],[4,1,0],[4,0,5],[5,3,0],[5,2,0],[0,12,2],[1,3,2],[5,1,1],[3,4,5],[3,3,2],[5,0,2],[1,2,4],[2,0,1],[7,11,1],[3,2,2],[9,1,3],[3,1,5],[3,0,2],[0,10,3],[0,0,3],[7,6,0],[2,0,7],[7,5,0],[0,0,7],[7,4,0],[3,0,7],[7,2,2],[7,1,2],[0,0,7],[7,0,4],[8,16,0],[2,0,8],[8,15,1],[8,11,2],[4,5,8],[8,4,1],[8,3,2],[8,2,9],[0,0,1],[1,0,2],[2,0,8],[4,0,8],[9,0,8]];
/** Chỉ số (trong bộ 104 lá đã xáo) của lá ở đáy cột 6 phải chạm để thắng. */
const LAST_CARD = 13;

test('xepbainhen reports a won run when the last King-to-Ace run is completed', async ({ page }) => {
  await captureMessages(page);
  await page.addInitScript((acts) => {
    if (window.localStorage.getItem('playnine-xepbainhen-save-v1')) return;
    const game = { v: 1, suits: 1, seed: 3, moves: acts.length, acts };
    window.localStorage.setItem('playnine-xepbainhen-save-v1', JSON.stringify({ v: 1, game, elapsed: 125000, assisted: false }));
  }, NEAR_WIN_ACTS);
  await page.goto('#/play/xepbainhen');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 's1'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#moves')).toHaveText('113');
  // Chạm dải trên của lá (phần còn lại bị các lá phía trên che): lá tự đi lên 8 bích, đủ dãy K→A thứ tám
  await frame.locator(`.pnc[data-i="${LAST_CARD}"]`).click({ position: { x: 8, y: 4 } });
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'xepbainhen', mode: 's1', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(125000);
  await expect(frame.locator('#modal-win')).toBeVisible({ timeout: 10000 });
});

test('xepbainhen reports a lost run when a started game is abandoned', async ({ page }) => {
  await captureMessages(page);
  await page.addInitScript((first) => {
    if (window.localStorage.getItem('playnine-xepbainhen-save-v1')) return;
    const game = { v: 1, suits: 1, seed: 3, moves: 1, acts: [first] };
    window.localStorage.setItem('playnine-xepbainhen-save-v1', JSON.stringify({ v: 1, game, elapsed: 4000 }));
  }, NEAR_WIN_ACTS[0]);
  await page.goto('#/play/xepbainhen');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'xepbainhen', mode: 's1', won: false });
});

test('xepbainhen switches suits before the first move without ending a run', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/xepbainhen');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 's1'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-mode').click();
  await frame.locator('.segmented[data-setting="mode"] [data-value="s4"]').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('s4');
  await expect(frame.locator('#mode-label')).toHaveText(/4/);
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
