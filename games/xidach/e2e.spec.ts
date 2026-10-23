import { test, expect, type Page, type FrameLocator } from '@playwright/test';

// Xì Dách trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).
// Một phiên 10 ván là một ván của cổng: hết phiên với hơn 1000 chip là thắng.

type Msg = { type: string; gameId?: string; mode?: string; won?: boolean; assisted?: boolean; resume?: boolean };

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

/**
 * Phiên lưu dở: đã chơi 9 ván (hộp bài dựng lại từ hạt giống shoeRng), đang chờ cược ván 10, cược ván trước 10.
 * Sinh bằng engine: newSession({ seed: 'e2e' }), 9 ván cược 10 rồi dừng ngay; chỉ sửa số chip.
 * Ván 10 cược 10 nên kết quả chênh tối đa 15 chip: 1500 chip chắc chắn thắng, 500 chip chắc chắn thua.
 */
function seedLastHand(page: Page, chips: number) {
  return page.addInitScript((c) => {
    const key = 'playnine-xidach-save-v1';
    if (window.localStorage.getItem(key)) return;
    const game = {
      v: 1, shoeRng: 2083974793, rng: 470292268, pos: 46, shuffles: 0, chips: c, round: 9, phase: 'bet', lastBet: 10,
      dealer: ['QH', '10S'],
      hands: [{ c: ['5D', '7H'], bet: 10, dbl: false, sp: false, done: true, res: 'lose', net: -10 }],
      active: 0,
      log: [[10, 'win'], [-10, 'lose'], [10, 'win'], [-10, 'lose'], [-10, 'lose'], [-10, 'lose'], [10, 'win'], [15, 'bj'], [-10, 'lose']],
    };
    window.localStorage.setItem(key, JSON.stringify({ v: 1, game, stake: 0, elapsed: 60000 }));
  }, chips);
}

/** Chơi ván cuối: cược lại 10, gặp lượt chơi thì Dừng, tới khi cổng nhận pn:end. */
async function playLastHand(page: Page, frame: FrameLocator) {
  await expect(frame.locator('#btn-rebet')).toBeEnabled();
  await frame.locator('#btn-rebet').click();
  await expect
    .poll(
      async () => {
        const stand = frame.locator('#btn-stand');
        if ((await stand.isVisible()) && (await stand.isEnabled())) await stand.click();
        return (await messages(page)).find((m) => m.type === 'pn:end');
      },
      { timeout: 20000 },
    )
    .toBeTruthy();
  return (await messages(page)).find((m) => m.type === 'pn:end');
}

test('xidach reports a won session when the 10th hand ends with more than 1000 chips', async ({ page }) => {
  await captureMessages(page);
  await seedLastHand(page, 1500);
  await page.goto('#/play/xidach');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#hand')).toHaveText('10/10');
  const end = await playLastHand(page, frame);
  expect(end).toMatchObject({ gameId: 'xidach', mode: 'classic', won: true, assisted: false });
  await expect(frame.locator('#modal-end')).toBeVisible({ timeout: 10000 });
});

test('xidach reports a lost session when the 10th hand ends at or below 1000 chips', async ({ page }) => {
  await captureMessages(page);
  await seedLastHand(page, 500);
  await page.goto('#/play/xidach');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true), { timeout: 5000 })
    .toBe(true);
  const end = await playLastHand(page, page.frameLocator('iframe'));
  expect(end).toMatchObject({ gameId: 'xidach', mode: 'classic', won: false });
});

test('xidach reports a lost run when a dealt session is abandoned, and nothing before the first deal', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/xidach');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  // Chưa chia ván nào: phiên mới không hỏi, không gửi pn:end
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeHidden();
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
  // Chia một ván rồi bỏ phiên: won false
  await frame.locator('[data-chip="10"]').click();
  await frame.locator('#btn-deal').click();
  // Đợi chia xong (tới lượt chơi, hoặc ván đã tính tiền vì có Xì Dách)
  await expect
    .poll(async () => (await frame.locator('#btn-stand').isEnabled()) || (await frame.locator('#btn-rebet').isEnabled()), { timeout: 10000 })
    .toBe(true);
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'xidach', mode: 'classic', won: false, assisted: false });
});
