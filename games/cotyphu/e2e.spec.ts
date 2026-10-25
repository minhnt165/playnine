import { test, expect, type Page } from '@playwright/test';

// Cờ Tỷ Phú trong cổng: dựng ván lưu sẵn (playnine-cotyphu-save-v1) rồi đi nước cuối,
// bắt tin nhắn pn:* ở khung trên cùng và kiểm tra pn:end (về nhất: won true; phá sản / bỏ ván: won false).
// Ván lưu: { v: 1, level, acted, game, log }; game là trạng thái engine (28 ô, 4 ghế, bạn là ghế 0, endSeat 0).

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

/** Bỏ hộp Cách chơi lần đầu, chạy tốc độ Nhanh. */
async function fastSettings(page: Page) {
  await page.addInitScript(() => {
    if (!window.localStorage.getItem('playnine-cotyphu-settings-v1')) {
      window.localStorage.setItem('playnine-cotyphu-settings-v1', JSON.stringify({ guideSeen: true, speed: 'fast' }));
    }
  });
}

type Player = { cash: number; pos: number; jail: boolean; tries: number; cards: string[]; out: boolean };
const player = (o: Partial<Player> = {}): Player => ({ cash: 1500, pos: 0, jail: false, tries: 0, cards: [], out: false, ...o });
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Trạng thái engine hợp lệ tối thiểu; `o` đè các trường cần thiết. */
function gameState(o: Record<string, unknown>) {
  return {
    v: 1, rng: 12345, maxRounds: 30, endSeat: 0, round: 5, turn: 0, phase: 'roll', dice: null, doubles: 0, again: false,
    debt: null, card: null, players: [player(), player(), player(), player()],
    own: new Array(28).fill(-1), houses: new Array(28).fill(0), mort: new Array(28).fill(false),
    decks: { c: range(12), f: range(12) }, outOrder: [], offers: [], asked: [], turns: 16, acts: 40, over: false,
    ...o,
  };
}

async function seedSave(page: Page, level: string, game: Record<string, unknown>, acted = true) {
  const save = { v: 1, level, acted, game, log: [] };
  await page.addInitScript((s) => {
    if (window.localStorage.getItem('playnine-cotyphu-save-v1')) return;
    window.localStorage.setItem('playnine-cotyphu-save-v1', JSON.stringify(s));
  }, save);
}

async function waitResume(page: Page, mode: string) {
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === mode), { timeout: 5000 })
    .toBe(true);
}

test('cotyphu finishing the last round first reports a won game', async ({ page }) => {
  await captureMessages(page);
  await fastSettings(page);
  // Vòng 30 (cuối), bạn đang ở pha kết thúc lượt với ¤6.000; Mai và Khoa đã phá sản, Vy chỉ còn ¤100.
  // Kết thúc lượt → Vy đi nốt lượt của mình → hết vòng 30, bạn giàu nhất.
  await seedSave(page, 'hard', gameState({
    round: 30, phase: 'end',
    players: [player({ cash: 6000 }), player({ cash: 0, out: true }), player({ cash: 0, out: true }), player({ cash: 100, pos: 14 })],
    outOrder: [1, 2],
  }));
  await page.goto('#/play/cotyphu');
  await waitResume(page, 'hard');
  await page.frameLocator('iframe').locator('#btn-main').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 15000 })
    .toMatchObject({ gameId: 'cotyphu', mode: 'hard', won: true, assisted: false });
  await expect(page.frameLocator('iframe').locator('#modal-result')).toBeVisible();
});

test('cotyphu going bankrupt reports won false', async ({ page }) => {
  await captureMessages(page);
  await fastSettings(page);
  // Bạn nợ thuế ¤150, chỉ có ¤10 và không có đất: nút chính là Phá sản (có hộp xác nhận).
  await seedSave(page, 'easy', gameState({
    phase: 'debt', players: [player({ cash: 10, pos: 4 }), player(), player(), player()],
    debt: { amt: 150, to: -1, why: 'tax', pos: 4, then: null },
  }));
  await page.goto('#/play/cotyphu');
  await waitResume(page, 'easy');
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-main').click();
  await frame.locator('#btn-bk-yes').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'cotyphu', mode: 'easy', won: false, assisted: false });
});

test('cotyphu abandoning a started game reports won false', async ({ page }) => {
  await captureMessages(page);
  await fastSettings(page);
  await seedSave(page, 'medium', gameState({}));
  await page.goto('#/play/cotyphu');
  await waitResume(page, 'medium');
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'cotyphu', mode: 'medium', won: false, assisted: false });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.resume, { timeout: 5000 })
    .toBe(false);
});

test('cotyphu re-sends start with the new level when switched before the first roll', async ({ page }) => {
  await captureMessages(page);
  await fastSettings(page);
  await page.goto('#/play/cotyphu');
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
