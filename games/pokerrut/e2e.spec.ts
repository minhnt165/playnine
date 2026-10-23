import { test, expect, type Page } from '@playwright/test';

// Poker Rút trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).

type Msg = { type: string; gameId?: string; mode?: string; won?: boolean; assisted?: boolean; resume?: boolean; score?: number };

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
 * Ván lưu: đang ở tay thứ 25 (đã xong 24 tay), đã chia và giữ cả 5 lá. Bài phải khớp đúng bộ bài xáo từ handRng
 * (engine kiểm tra), nên dùng cặp handRng / rng / hand tính sẵn bằng engine.js:
 *   handRng 14 -> 8♦ 8♠ J♦ J♣ A♣ (thú), handRng 2 -> 7♠ 3♠ 2♣ 6♦ 8♥ (không ăn).
 * Bấm Rút: giữ cả 5 lá nên bài cuối không đổi, phiên xong ngay.
 */
function seedLastHand(page: Page, game: Record<string, unknown>) {
  return page.addInitScript((g) => {
    if (window.localStorage.getItem('playnine-pokerrut-save-v1')) return;
    window.localStorage.setItem('playnine-pokerrut-save-v1', JSON.stringify({ v: 1, game: g }));
  }, game);
}

const lastHand = { v: 1, bet: 5, hands: 24, phase: 'hold', held: [true, true, true, true, true], last: null, best: null, assisted: false };

test('pokerrut reports a finished session with the final credits, won when above 100', async ({ page }) => {
  await captureMessages(page);
  // 150 xu (đã trừ cược 5), thú cược 5 ăn 10 -> 160
  await seedLastHand(page, { ...lastHand, rng: 3215543261, credits: 150, handRng: 14, hand: ['8D', '8S', 'JD', 'JC', 'AC'] });
  await page.goto('#/play/pokerrut');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#left')).toHaveText('0');
  await frame.locator('#btn-deal').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'pokerrut', mode: 'classic', won: true, score: 160, assisted: false });
  await expect(frame.locator('#modal-end')).toBeVisible();
  await expect(frame.locator('#end-credits')).toHaveText('160');
});

test('pokerrut reports a session that ends at or below 100 credits as not won', async ({ page }) => {
  await captureMessages(page);
  // 40 xu, bài không ăn -> kết thúc với 40
  await seedLastHand(page, { ...lastHand, rng: 3215543249, credits: 40, handRng: 2, hand: ['7S', '3S', '2C', '6D', '8H'] });
  await page.goto('#/play/pokerrut');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true), { timeout: 5000 })
    .toBe(true);
  await page.frameLocator('iframe').locator('#btn-deal').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'pokerrut', mode: 'classic', won: false, score: 40 });
});

test('pokerrut reports a lost session when abandoned after the first deal, and nothing before it', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/pokerrut');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  // Chưa chia: phiên mới không hỏi, không gửi pn:end
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeHidden();
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
  // Chia một tay (cược 5) rồi bỏ phiên: won false kèm số xu hiện có (95)
  await frame.locator('#btn-deal').click();
  await expect(frame.locator('#deal-text')).toHaveText(/Draw|Rút/);
  await expect(frame.locator('#btn-deal')).toBeEnabled();
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'pokerrut', mode: 'classic', won: false, score: 95, assisted: false });
});
