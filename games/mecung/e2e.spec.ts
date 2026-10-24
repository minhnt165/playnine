import { test, expect, type Page } from '@playwright/test';

// Mê Cung trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).

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
    if (!window.localStorage.getItem('playnine-mecung-settings-v1')) {
      window.localStorage.setItem('playnine-mecung-settings-v1', JSON.stringify({ guideSeen: true }));
    }
  });
}

test('mecung reports a won run when the last step reaches the exit', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  // Ván lưu: mê cung Dễ 10x15 seed 1 (lối vào ô 2, lối ra ô 143, đường đúng 71 bước), đã đi 70 bước theo đường đúng,
  // đang đứng ở ô 144 ngay bên phải lối ra: còn đúng một bước sang trái (hướng W của mê cung).
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-mecung-save-v1')) return;
    const game = { v: 1, mode: 'easy', seed: 1, date: null, pos: 144, seen: '70c70f1cf00208003c40f1cf7ffdf1678d1670', moves: 70, hints: 0 };
    window.localStorage.setItem('playnine-mecung-save-v1', JSON.stringify({ v: 1, game, elapsed: 5000 }));
  });
  await page.goto('#/play/mecung');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'easy'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  const board = frame.locator('#board');
  await expect(board).toHaveAttribute('data-orient', /normal|transposed/);
  // Khung ngang thì mê cung vẽ chuyển vị: hướng W của mê cung là phím lên
  const key = (await board.getAttribute('data-orient')) === 'transposed' ? 'ArrowUp' : 'ArrowLeft';
  await board.focus();
  await page.keyboard.press(key);
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'mecung', mode: 'easy', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(5000);
  await expect(frame.locator('#modal-win')).toBeVisible();
});

test('mecung reports a lost run when a started maze is abandoned', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/mecung');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'easy'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#board').focus();
  // Lối vào ở cạnh trên luôn có ít nhất một lối thông: thử đủ bốn hướng thì chắc chắn đã đi ít nhất một bước
  for (const k of ['ArrowDown', 'ArrowRight', 'ArrowLeft', 'ArrowUp']) await page.keyboard.press(k);
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'mecung', mode: 'easy', won: false });
});

test('mecung switches size before the first move without ending a run', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/mecung');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'easy'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#modes button[data-mode="hard"]').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('hard');
  await expect(frame.locator('#modes button[data-mode="hard"]')).toHaveAttribute('aria-checked', 'true');
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
