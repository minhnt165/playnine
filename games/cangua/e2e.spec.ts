import { test, expect, type Page } from '@playwright/test';

// Cá Ngựa trong cổng: ván kết thúc báo đúng pn:end. Dựng ván lưu sẵn (sắp về đích, PRNG của ván cho số đã biết)
// qua localStorage rồi chơi nốt. Không có Supabase cổng vẫn trả pn:ready; bắt tin nhắn pn:* ở khung trên cùng.

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

const B = [-1, -1, -1, -1];

/** Ghi ván lưu (dạng engine v1) + cài đặt (máy nhanh, tự đi) trước khi trang nạp; chỉ ghi một lần. */
async function seedSave(page: Page, game: object | null) {
  await page.addInitScript(
    ({ game }) => {
      if (window.localStorage.getItem('playnine-cangua-settings-v1')) return;
      window.localStorage.setItem('playnine-cangua-settings-v1', JSON.stringify({ theme: 'auto', speed: 'fast', autoMove: true }));
      if (game) window.localStorage.setItem('playnine-cangua-save-v1', JSON.stringify({ v: 1, game, elapsed: 120000 }));
    },
    { game },
  );
}

const waitStart = (page: Page, resume: boolean) =>
  expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.gameId === 'cangua' && m.mode === 'classic' && m.resume === resume), {
      timeout: 5000,
    })
    .toBe(true);

test('cangua reports a won game when your last token gets home', async ({ page }) => {
  await captureMessages(page);
  // Ba quân xanh đã về đích, quân cuối ở ô 55; PRNG trạng thái 7 cho số 1 → chỉ một nước, tự đi → thắng.
  await seedSave(page, {
    v: 1, rng: 7, turn: 0, phase: 'roll', dice: 3, sixes: 0,
    pos: [[56, 56, 56, 55], [10, -1, -1, -1], B, B], winner: -1, rolls: 200, caps: [0, 0, 0, 0],
  });
  await page.goto('#/play/cangua');
  await waitStart(page, true);
  const frame = page.frameLocator('iframe');
  // Xúc xắc nhún nhảy mời bấm nên không "đứng yên": bấm thẳng
  await frame.locator('#die').click({ force: true });
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 8000 })
    .toMatchObject({ gameId: 'cangua', mode: 'classic', won: true, assisted: false });
  await expect(frame.locator('#modal-end')).toBeVisible();
});

test('cangua reports a lost game when a computer finishes first', async ({ page }) => {
  await captureMessages(page);
  // Tới lượt Đỏ (máy), quân cuối của Đỏ ở ô 55, PRNG cho số 1 → máy tự tung, tự đi và về trước.
  await seedSave(page, {
    v: 1, rng: 7, turn: 1, phase: 'roll', dice: 3, sixes: 0,
    pos: [[20, -1, -1, -1], [56, 56, 56, 55], B, B], winner: -1, rolls: 200, caps: [0, 0, 0, 0],
  });
  await page.goto('#/play/cangua');
  await waitStart(page, true);
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 8000 })
    .toMatchObject({ gameId: 'cangua', mode: 'classic', won: false, assisted: false });
  await expect(page.frameLocator('iframe').locator('#modal-end')).toBeVisible();
});

test('cangua reports an abandoned game only after the first roll', async ({ page }) => {
  await captureMessages(page);
  await seedSave(page, null);
  await page.goto('#/play/cangua');
  await waitStart(page, false);
  const frame = page.frameLocator('iframe');
  // Chưa tung lần nào: ván mới không hỏi và không gửi pn:end
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeHidden();
  // Tung một lần (chờ tới khi ván được lưu), rồi bỏ ván: hỏi xác nhận, gửi won: false
  await frame.locator('#die').click({ force: true });
  const game = page.frames().find((f) => f.url().includes('/cangua/'));
  expect(game).toBeTruthy();
  await expect
    .poll(() => game!.evaluate(() => window.localStorage.getItem('playnine-cangua-save-v1') !== null), { timeout: 5000 })
    .toBe(true);
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toEqual([expect.objectContaining({ gameId: 'cangua', mode: 'classic', won: false })]);
});
