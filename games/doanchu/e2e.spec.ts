import { test, expect, type Page } from '@playwright/test';

// Đoán Chữ trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).
// Ván lưu dựng sẵn dùng đề tự do seed 12345 = đáp án 'blame' (khóa trong test.js, test "khóa đề").

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

/** Bỏ hộp Cách chơi lần đầu và (tùy chọn) đặt ván tự do dở với các lượt đã đoán. */
async function seed(page: Page, guesses: string[] | null) {
  await page.addInitScript((g) => {
    if (window.localStorage.getItem('playnine-doanchu-settings-v1')) return;
    window.localStorage.setItem('playnine-doanchu-settings-v1', JSON.stringify({ guideSeen: true }));
    if (g) {
      const game = { v: 1, mode: 'free', seed: 12345, answer: 'blame', guesses: g, hard: false };
      window.localStorage.setItem('playnine-doanchu-save-v1', JSON.stringify({ v: 1, game, typed: '' }));
    }
  }, guesses);
}

/** Gõ một từ bằng bàn phím ảo rồi bấm Đoán. */
async function enter(page: Page, word: string) {
  const frame = page.frameLocator('iframe');
  for (const ch of word) await frame.locator(`.key[data-key="${ch}"]`).click();
  await frame.locator('.key[data-key="enter"]').click();
}

test('doanchu reports a won run when the word is guessed', async ({ page }) => {
  await captureMessages(page);
  await seed(page, ['raise']);
  await page.goto('#/play/doanchu');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'free'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('.row').first().locator('.tile.a, .tile.p, .tile.c')).toHaveCount(5);
  await enter(page, 'blame');
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'doanchu', mode: 'free', won: true, assisted: false });
  await expect(frame.locator('#modal-end')).toBeVisible({ timeout: 8000 });
  await expect(frame.locator('#end-word')).toHaveText('BLAME');
});

test('doanchu reports a lost run after six wrong guesses', async ({ page }) => {
  await captureMessages(page);
  await seed(page, ['raise', 'mount', 'pizza', 'light', 'dutch']);
  await page.goto('#/play/doanchu');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'free'), { timeout: 5000 })
    .toBe(true);
  await enter(page, 'house');
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'doanchu', mode: 'free', won: false });
});

test('doanchu reports a lost run when a started daily word is abandoned', async ({ page }) => {
  await captureMessages(page);
  await seed(page, null);
  await page.goto('#/play/doanchu');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'daily'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  // 'books' đoán được nhưng không bao giờ là đáp án (đã lọc số nhiều) nên ván chắc chắn còn dở
  await enter(page, 'books');
  // Bàn phím được tô sau khi lật xong hàng (lúc đang lật, nút đổi mode chưa nhận)
  await expect(frame.locator('.key[data-key="b"]')).toHaveClass(/(^| )(a|p|c)( |$)/, { timeout: 5000 });
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
  await frame.locator('#modes [data-mode="free"]').click();
  await frame.locator('#btn-confirm').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'doanchu', mode: 'daily', won: false });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('free');
});
