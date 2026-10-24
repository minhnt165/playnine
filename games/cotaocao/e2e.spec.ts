import { test, expect, type Page } from '@playwright/test';

// Cờ Tào Cáo trong cổng: dựng ván lưu sẵn (playnine-cotaocao-save-v1) gần hết ván rồi đi nước cuối,
// bắt tin nhắn pn:* ở khung trên cùng và kiểm tra pn:end (thắng: won true; thua / bỏ ván: won false).
// Ván lưu: pts = [quân của bạn, quân của máy], mỗi bên 26 ô theo góc nhìn của chính bên đó
// (1..24 điểm, 25 thanh giữa, 0 đã gỡ); bạn = 0 (trắng), máy = 1 (đen).

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

/** Bỏ hộp Cách chơi lần đầu để bấm được bàn. */
async function skipGuide(page: Page) {
  await page.addInitScript(() => {
    if (!window.localStorage.getItem('playnine-cotaocao-settings-v1')) {
      window.localStorage.setItem('playnine-cotaocao-settings-v1', JSON.stringify({ guideSeen: true }));
    }
  });
}

/** Mảng 26 ô từ { điểm: số quân }; số quân còn thiếu cho đủ 15 coi như đã gỡ (ô 0). */
function side(map: Record<number, number>) {
  const a = new Array(26).fill(0);
  let n = 0;
  for (const k of Object.keys(map)) {
    a[Number(k)] = map[Number(k)];
    n += map[Number(k)];
  }
  a[0] += 15 - n;
  return a;
}

async function seedSave(page: Page, level: string, game: Record<string, unknown>, humanTurns = 6) {
  const save = { v: 1, level, seed: 12345, humanTurns, game: Object.assign({ v: 1, opening: [3, 1], turns: 12 }, game) };
  await page.addInitScript((s) => {
    if (window.localStorage.getItem('playnine-cotaocao-save-v1')) return;
    window.localStorage.setItem('playnine-cotaocao-save-v1', JSON.stringify(s));
  }, save);
}

async function waitResume(page: Page, mode: string) {
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === mode), { timeout: 5000 })
    .toBe(true);
}

test('cotaocao bearing off the last checker reports a won game', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  // Bạn còn đúng một quân ở điểm 1, đã gieo 6-5; máy còn đủ 15 quân ở điểm 6 của nó (gammon).
  // Chỉ một quân đi được nên game chọn sẵn quân đó: chạm khay gỡ quân là thắng.
  await seedSave(page, 'hard', { pts: [side({ 1: 1 }), side({ 6: 15 })], turn: 0, dice: [6, 5], steps: [] });
  await page.goto('#/play/cotaocao');
  await waitResume(page, 'hard');
  await page.frameLocator('iframe').locator('[data-spot="0"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'cotaocao', mode: 'hard', won: true, assisted: false });
  await expect(page.frameLocator('iframe').locator('#modal-result')).toBeVisible();
});

test('cotaocao losing to the computer reports won false', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  // Bạn đã đi xong lượt 2-1 (6/4, 6/5); máy chỉ còn một quân ở điểm 1 của nó: lần gieo nào cũng gỡ được và thắng.
  await seedSave(page, 'medium', { pts: [side({ 6: 15 }), side({ 1: 1 })], turn: 0, dice: [2, 1], steps: [[6, 4, 2], [6, 5, 1]] });
  await page.goto('#/play/cotaocao');
  await waitResume(page, 'medium');
  await page.frameLocator('iframe').locator('#btn-done').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 10000 })
    .toMatchObject({ gameId: 'cotaocao', mode: 'medium', won: false, assisted: false });
});

test('cotaocao abandoning a started game reports won false', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  // Thế mở ván, bạn đã xong một lượt (humanTurns 1), tới lượt bạn với 4-2
  const start = { 24: 2, 13: 5, 8: 3, 6: 5 };
  await seedSave(page, 'easy', { pts: [side(start), side(start)], turn: 0, dice: [4, 2], steps: [], turns: 2 }, 1);
  await page.goto('#/play/cotaocao');
  await waitResume(page, 'easy');
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'cotaocao', mode: 'easy', won: false, assisted: false });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.resume, { timeout: 5000 })
    .toBe(false);
});

test('cotaocao re-sends start with the new level when switched before the first move', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/cotaocao');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'medium'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('[data-open="modal-settings"]').click();
  await frame.locator('[data-setting="level"] [data-value="hard"]').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('hard');
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
