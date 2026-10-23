import { test, expect, type Page } from '@playwright/test';

// Đô-mi-nô trong cổng: trận kết thúc báo đúng pn:end. Dựng trận lưu sẵn (dạng engine v1) qua localStorage rồi chơi nốt.
// Không có Supabase cổng vẫn trả pn:ready; bắt tin nhắn pn:* ở khung trên cùng.
// Mã quân: vị trí trong bộ [0|0], [0|1] … [0|6], [1|1] … [6|6]; quân trên tay là <button class="htile" data-id="…">.

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

/** Mã quân [a|b] */
const T = (a: number, b: number) => {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return lo * 7 - (lo * (lo - 1)) / 2 + (hi - lo);
};

/** Trận lưu: dây chỉ có [2|3], tay hai bên cho trước, nọc là phần còn lại */
function save(opts: { hands: [number[], number[]]; turn: 0 | 1; scores: [number, number]; level: string }) {
  const line = [{ id: T(2, 3), l: 2, r: 3 }];
  const used = new Set([T(2, 3), ...opts.hands[0], ...opts.hands[1]]);
  const boneyard = Array.from({ length: 28 }, (_, i) => i).filter((i) => !used.has(i));
  const lacks = [Array(7).fill(false), Array(7).fill(false)];
  const game = {
    v: 1, target: 100, seed: 12345, handNo: 4, scores: opts.scores, hands: opts.hands, boneyard, line,
    turn: opts.turn, lead: -1, lacks, phase: 'play', result: null, winner: -1,
  };
  return { v: 1, game, level: opts.level, acts: 20, elapsed: 90000 };
}

/** Ghi trận lưu trước khi trang nạp; chỉ ghi một lần để trận xong không bị dựng lại. */
async function seedSave(page: Page, data: object) {
  await page.addInitScript((data) => {
    if (window.sessionStorage.getItem('pn-seeded')) return;
    window.sessionStorage.setItem('pn-seeded', '1');
    window.localStorage.setItem('playnine-domino-save-v1', JSON.stringify(data));
  }, data);
}

const waitResume = (page: Page, mode: string) =>
  expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === mode), { timeout: 5000 })
    .toBe(true);

test('domino reports a won match when the player plays the last tile', async ({ page }) => {
  await captureMessages(page);
  // Người 95 điểm, còn đúng [3|6] (chỉ khớp đầu 3); máy còn [5|5] + [4|6] = 20 chấm → 115, thắng trận tới 100.
  await seedSave(page, save({ hands: [[T(3, 6)], [T(4, 6), T(5, 5)]], turn: 0, scores: [95, 40], level: 'easy' }));
  await page.goto('#/play/domino');
  await waitResume(page, 'easy');
  const frame = page.frameLocator('iframe');
  await frame.locator(`#hand .htile[data-id="${T(3, 6)}"]`).click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'domino', mode: 'easy', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(90000);
  await expect(frame.locator('#modal-end')).toBeVisible();
});

test('domino reports a lost match when the computer plays its last tile', async ({ page }) => {
  await captureMessages(page);
  // Tới lượt máy (mức Khó), máy còn đúng [3|6] và 95 điểm; người còn 20 chấm → máy thắng trận.
  await seedSave(page, save({ hands: [[T(4, 6), T(5, 5)], [T(3, 6)]], turn: 1, scores: [40, 95], level: 'hard' }));
  await page.goto('#/play/domino');
  await waitResume(page, 'hard');
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 8000 })
    .toMatchObject({ gameId: 'domino', mode: 'hard', won: false, assisted: false });
  await expect(page.frameLocator('iframe').locator('#modal-end')).toBeVisible();
});

test('domino reports an abandoned match only after the player has acted', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/domino');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.gameId === 'domino' && m.mode === 'easy'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  // Chưa làm gì: trận mới không hỏi và không gửi pn:end (kể cả khi máy đã mở ván)
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeHidden();
  // Thao tác đầu tiên của người: đánh một quân đang sáng (chọn đầu nếu khớp cả hai), hoặc bốc nếu không có quân khớp
  const act = frame.locator('#hand .htile.can, #btn-draw:not([disabled])').first();
  await expect(act).toBeVisible({ timeout: 8000 });
  const lit = frame.locator('#hand .htile.can');
  if (await lit.count()) {
    await lit.first().click();
    const ends = frame.locator('#targets .end-target');
    if (await ends.count()) await ends.first().click();
  } else await frame.locator('#btn-draw').click();
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeVisible();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toEqual([expect.objectContaining({ gameId: 'domino', mode: 'easy', won: false })]);
});
