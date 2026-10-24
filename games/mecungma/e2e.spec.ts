import { test, expect, type Page } from '@playwright/test';

// Mê Cung Ma trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).

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

// Ván lưu dở (engine v1, seed 5, màn 1): 420 điểm, còn 1 mạng; ma Lửa cách đom đóm 2 ô, hai bên lao vào nhau.
// Bấm Chơi tiếp: 1,5 giây "Sẵn sàng", đom đóm ăn thêm 1 đốm (430) rồi bị bắt, hết ván.
const SAVED_GAME = {"v":1,"seed":5,"rs":2654435772,"level":1,"lives":1,"score":420,"bonus":false,"t":120,"phase":"play","phaseT":0,"dots":"000000000000000000001111111101111111100200100010100010020011111111111111111001001010000010100100111101110111011110000010000000001000000001000000000100000000100000000010000000010000000001000000001000000000100000000100000000010000000010000000001000001111111101111111100100100010100010010021011111011111012000101010000010101000111101110111011110010000001010000001001111111111111111100000000000000000000","dotsEaten":0,"fruit":null,"fruitsShown":0,"modeIdx":0,"modeT":0,"frightT":0,"chain":0,"lifeT":0,"player":{"x":9000,"y":15000,"dir":"left","want":null,"moving":true},"ghosts":[{"x":7000,"y":15000,"dir":"right","state":"active","fright":false,"rev":false,"lc":-1},{"x":9000,"y":9000,"dir":"up","state":"house","fright":false,"rev":false,"lc":-1},{"x":8000,"y":9000,"dir":"up","state":"house","fright":false,"rev":false,"lc":-1},{"x":10000,"y":9000,"dir":"up","state":"house","fright":false,"rev":false,"lc":-1}]};

test('mecungma reports the score in pn:end when the game ends', async ({ page }) => {
  await captureMessages(page);
  await page.addInitScript((game) => {
    if (window.localStorage.getItem('playnine-mecungma-save-v1')) return;
    window.localStorage.setItem('playnine-mecungma-save-v1', JSON.stringify({ v: 1, game, ms: 9000 }));
    window.localStorage.setItem('playnine-mecungma-settings-v1', JSON.stringify({ guideSeen: true }));
  }, SAVED_GAME);
  await page.goto('#/play/mecungma');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#score')).toHaveText('420');
  await frame.locator('#btn-start').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 10000 })
    .toMatchObject({ gameId: 'mecungma', mode: 'classic', won: false, assisted: false, score: 430 });
  await expect(frame.locator('#overlay-over')).toBeVisible({ timeout: 5000 });
  await expect(frame.locator('#over-score')).toHaveText('430');
});

test('mecungma reports an abandoned game with its score', async ({ page }) => {
  await captureMessages(page);
  await page.addInitScript(() => {
    window.localStorage.setItem('playnine-mecungma-settings-v1', JSON.stringify({ guideSeen: true, dpad: false }));
  });
  await page.goto('#/play/mecungma');
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-start').click();
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  // sau 2 giây "Sẵn sàng" đom đóm tự đi sang trái và ăn đốm trên hàng xuất phát
  await expect(frame.locator('#score')).not.toHaveText('0', { timeout: 6000 });
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'mecungma', mode: 'classic', won: false });
  const sent = (await messages(page)).find((m) => m.type === 'pn:end');
  expect(sent && sent.score).toBeGreaterThan(0);
});
