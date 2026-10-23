import { test, expect, type Page } from '@playwright/test';

// Kim Tự Tháp trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).

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

/** Ván lưu dựng sẵn: tháp chỉ còn các lá ở `pyramid` (ô 0 là đỉnh), các lá khác đã bỏ theo cặp. */
async function seedSave(page: Page, cards: { pyramid: Record<number, string>; stock: string[]; waste: string[] }) {
  await page.addInitScript((c) => {
    if (window.localStorage.getItem('playnine-kimtuthap-save-v1')) return;
    const pyramid: (string | null)[] = new Array(28).fill(null);
    Object.keys(c.pyramid).forEach((k) => { pyramid[Number(k)] = c.pyramid[Number(k)]; });
    const game = { v: 1, seed: 1, pyramid, stock: c.stock, waste: c.waste, recycles: 0, moves: 40, undoLeft: 3, assisted: false, history: [] };
    window.localStorage.setItem('playnine-kimtuthap-save-v1', JSON.stringify({ v: 1, game, elapsed: 20000 }));
  }, cards);
}

test('kimtuthap reports a won run when the pyramid is cleared', async ({ page }) => {
  await captureMessages(page);
  // Chỉ còn Q cơ trên đỉnh, A bích trên chồng bỏ: ghép hai lá là dọn sạch tháp
  await seedSave(page, { pyramid: { 0: 'QH' }, stock: [], waste: ['AS'] });
  await page.goto('#/play/kimtuthap');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('.pnc[data-pos="0"]').click();
  await frame.locator('.pnc[data-pos="waste"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'kimtuthap', mode: 'classic', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(20000);
  await expect(frame.locator('#modal-win')).toBeVisible();
});

test('kimtuthap reports a lost run when no moves are left', async ({ page }) => {
  await captureMessages(page);
  // A bích đè lên Q cơ (không bao giờ ghép được), chồng rút chỉ còn K bích, chồng bỏ trống: bỏ K là hết nước
  await seedSave(page, { pyramid: { 0: 'QH', 1: 'AS' }, stock: ['KS'], waste: [] });
  await page.goto('#/play/kimtuthap');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('.pnc[data-pos="stock"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'kimtuthap', mode: 'classic', won: false });
  await expect(frame.locator('#modal-lose')).toBeVisible();
});

test('kimtuthap reports a lost run when a started deal is abandoned', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/kimtuthap');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  // Ván chưa đi nước nào: chia ván mới không gửi gì
  await frame.locator('#btn-new').click();
  await expect.poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').length, { timeout: 5000 }).toBe(2);
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
  // Rút một lá rồi bỏ ván: tính thua
  await frame.locator('#btn-draw').click();
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'kimtuthap', mode: 'classic', won: false, assisted: false });
});
