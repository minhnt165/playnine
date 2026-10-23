/* Kiểm tra phần thuần của bộ dùng chung: chạy `node kit.test.js`
 * - Lưu trữ: đọc JSON hỏng trả giá trị mặc định, storage ném lỗi cũng không ném ra ngoài
 * - Đồng hồ: cộng dồn qua bắt đầu / tạm dừng / chạy tiếp, đặt lại
 * - Dịch: thiếu khóa rơi về tiếng Anh rồi về chính khóa, số nhiều, chuỗi của game đè chuỗi của kit
 * - Tóm tắt cho cổng: đúng dạng readSummary của cổng
 */
const K = require('./kit.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (e) {
    failed++;
    console.log('  FAIL ' + name + '\n       ' + e.message);
  }
}

function eq(a, b, msg) {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  if (x !== y) throw new Error((msg ? msg + ': ' : '') + x + ' !== ' + y);
}

/** localStorage giả trong bộ nhớ. */
function memStorage(init) {
  const data = Object.assign({}, init);
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    data,
  };
}
const brokenStorage = {
  getItem() { throw new Error('blocked'); },
  setItem() { throw new Error('blocked'); },
  removeItem() { throw new Error('blocked'); },
};

console.log('Lưu trữ');
test('khóa theo quy ước playnine-<id>-*-v1', () => {
  const s = K.createStore({ gameId: 'abc', storage: memStorage() });
  eq(s.keys, { save: 'playnine-abc-save-v1', stats: 'playnine-abc-stats-v1', settings: 'playnine-abc-settings-v1', summary: 'playnine-abc-summary-v1' });
});
test('ghi rồi đọc lại JSON', () => {
  const st = memStorage();
  const s = K.createStore({ gameId: 'abc', storage: st });
  s.write(s.keys.stats, { played: 2 });
  eq(st.data['playnine-abc-stats-v1'], '{"played":2}');
  eq(s.read(s.keys.stats, null), { played: 2 });
});
test('JSON hỏng hoặc thiếu khóa: trả giá trị mặc định', () => {
  const s = K.createStore({ gameId: 'abc', storage: memStorage({ 'playnine-abc-save-v1': '{oops' }) });
  eq(s.read(s.keys.save, 'def'), 'def');
  eq(s.read(s.keys.stats, { a: 1 }), { a: 1 });
});
test('storage ném lỗi: không ném ra ngoài', () => {
  const s = K.createStore({ gameId: 'abc', storage: brokenStorage });
  eq(s.read(s.keys.save, 7), 7);
  s.write(s.keys.save, { x: 1 });
  s.remove(s.keys.save);
});
test('không có storage: vẫn chạy', () => {
  const s = K.createStore({ gameId: 'abc', storage: null });
  eq(s.read(s.keys.save, 1), 1);
  s.write(s.keys.save, 2);
});

console.log('Đồng hồ');
test('cộng dồn qua start / pause / resume', () => {
  let t = 1000;
  const c = K.createTimer({ now: () => t });
  eq(c.elapsed(), 0);
  eq(c.running, false);
  c.start();
  t += 500;
  eq(c.elapsed(), 500);
  c.pause();
  t += 10000;
  eq(c.elapsed(), 500);
  eq(c.running, false);
  c.resume();
  t += 250;
  eq(c.elapsed(), 750);
  eq(c.running, true);
});
test('start khi đang chạy không đặt lại; reset về 0 và dừng', () => {
  let t = 0;
  const c = K.createTimer({ now: () => t });
  c.start();
  t = 100;
  c.start();
  eq(c.elapsed(), 100);
  c.reset();
  eq(c.elapsed(), 0);
  eq(c.running, false);
});
test('set(ms) khôi phục thời gian đã chơi (ván lưu)', () => {
  let t = 0;
  const c = K.createTimer({ now: () => t });
  c.set(60000);
  eq(c.elapsed(), 60000);
  c.resume();
  t = 40;
  eq(c.elapsed(), 60040);
});

console.log('Dịch');
const kitDict = { en: { 'kit.close': 'Close', 'kit.x': 'Kit X' }, vi: { 'kit.close': 'Đóng' } };
const dict = {
  en: { hello: 'Hello {name}', moves: { one: '1 move', other: '{n} moves' }, 'kit.x': 'Game X' },
  vi: { hello: 'Chào {name}', moves: { one: '{n} nước', other: '{n} nước' } },
};
test('tra theo ngôn ngữ, thay tham số', () => {
  const vi = K.createI18n({ dict, lang: 'vi', kitDict });
  eq(vi.t('hello', { name: 'An' }), 'Chào An');
  eq(vi.t('kit.close'), 'Đóng');
});
test('thiếu khóa: rơi về tiếng Anh rồi về chính khóa', () => {
  const vi = K.createI18n({ dict: { en: { only: 'Only en' }, vi: {} }, lang: 'vi', kitDict });
  eq(vi.t('only'), 'Only en');
  eq(vi.t('nope'), 'nope');
});
test('số nhiều: n = 1 lấy one, còn lại other', () => {
  const en = K.createI18n({ dict, lang: 'en', kitDict });
  eq(en.t('moves', { n: 1 }), '1 move');
  eq(en.t('moves', { n: 3 }), '3 moves');
});
test('chuỗi của game đè chuỗi của kit', () => {
  const en = K.createI18n({ dict, lang: 'en', kitDict });
  eq(en.t('kit.x'), 'Game X');
});
test('ngôn ngữ lạ thì dùng tiếng Anh', () => {
  eq(K.createI18n({ dict, lang: 'fr', kitDict }).lang, 'en');
});
test('fmtNumber theo ngôn ngữ', () => {
  eq(K.createI18n({ dict, lang: 'vi', kitDict }).fmtNumber(1234), (1234).toLocaleString('vi-VN'));
});

console.log('Tóm tắt cho cổng');
test('buildSummary: v 1, updatedAt, giá trị mặc định', () => {
  eq(K.buildSummary({ played: 3, won: 1, note: 'n', now: 42 }), {
    v: 1, updatedAt: 42, played: 3, won: 1, note: 'n', stats: [], resume: null, daily: null,
  });
});
test('buildSummary giữ stats, resume, daily', () => {
  const s = K.buildSummary({ played: 1, won: 0, note: '', stats: [{ value: 5, label: 'Best' }], resume: { title: 'T', pct: 0.5 }, daily: { date: '2026-10-23', done: true }, now: 1 });
  eq(s.stats, [{ value: 5, label: 'Best' }]);
  eq(s.resume, { title: 'T', pct: 0.5 });
  eq(s.daily, { date: '2026-10-23', done: true });
});

console.log('\n' + passed + ' ok, ' + failed + ' lỗi');
if (failed) process.exit(1);
