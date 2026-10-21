// Thu thập tin game từ RSS/Atom rồi gửi lên Supabase qua RPC ingest_news (service role).
// Chỉ lấy tiêu đề, tóm tắt ngắn, ảnh và link bài gốc; không chép nội dung bài.
// Chạy: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/crawl-news.mjs [--dry-run]
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// linkHost: RSS của GameK trỏ link qua tên miền chuyển hướng (cl44.cnnd.vn) chặn trình duyệt; đổi về trang chính.
// GameK chỉ lấy chuyên mục Esports và PC/Console: trang chủ và các mục khác lẫn nhiều tin showbiz, phim 18+.
export const SOURCES = [
  { name: 'GameK', lang: 'vi', url: 'https://gamek.vn/esport.rss', linkHost: 'gamek.vn' },
  { name: 'GameK', lang: 'vi', url: 'https://gamek.vn/pc-console.rss', linkHost: 'gamek.vn' },
  { name: 'IGN', lang: 'en', url: 'https://feeds.ign.com/ign/all' },
  { name: 'PC Gamer', lang: 'en', url: 'https://www.pcgamer.com/rss/' },
  { name: 'Eurogamer', lang: 'en', url: 'https://www.eurogamer.net/feed' },
  { name: 'Rock Paper Shotgun', lang: 'en', url: 'https://www.rockpapershotgun.com/feed' },
];

export const PER_SOURCE = 30;
// Tin có tiêu đề hoặc tóm tắt khớp mẫu này bị bỏ (cổng có người chơi nhỏ tuổi). Admin vẫn ẩn tay được tin lọt qua.
export const BLOCKED = /18\+|\bnsfw\b|\bsex|\bporn|\bhentai\b|\bjav\b|cảnh nóng|nóng bỏng|gợi cảm|sexy|bikini|nội y|hở bạo|khoe (?:vòng|dáng|chân|thân)|hot girl|hot dancer|nhan sắc|yua mikami|cá cược|nhà cái|casino/i;
export const SUMMARY_MAX = 280;
const TIMEOUT_MS = 20_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; PlayNineNewsBot/1.0)';

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', euro: '€', trade: '™', amacr: 'ā', emacr: 'ē', imacr: 'ī', omacr: 'ō', umacr: 'ū', oelig: 'œ', scaron: 'š', zcaron: 'ž' };
// Entity Latin-1 (U+00A0..U+00FF) theo đúng thứ tự mã, ví dụ &atilde; trong tóm tắt HTML.
const LATIN1 = 'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml';
LATIN1.split(' ').forEach((name, i) => (NAMED[name] = String.fromCharCode(0xa0 + i)));

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED[e] ?? NAMED[e.toLowerCase()] ?? m;
  });
}

// Nội dung text của một phần tử: bỏ CDATA, giải mã entity (ngoài CDATA).
function text(raw) {
  if (raw == null) return '';
  let out = '';
  for (const part of raw.split(/(<!\[CDATA\[[\s\S]*?\]\]>)/)) {
    out += part.startsWith('<![CDATA[') ? part.slice(9, -3) : decodeEntities(part);
  }
  return out.trim();
}

const esc = (tag) => tag.replace(/[:.]/g, (c) => '\\' + c);

// Nội dung thô của phần tử đầu tiên tên `tag` (kể cả có namespace như media:content).
function inner(xml, tag) {
  const m = xml.match(new RegExp(`<${esc(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc(tag)}>`, 'i'));
  return m ? m[1] : null;
}

// Các thẻ mở (tự đóng hoặc không) tên `tag`, trả về chuỗi thuộc tính.
function openTags(xml, tag) {
  return [...xml.matchAll(new RegExp(`<${esc(tag)}(\\s[^>]*?)?/?>`, 'gi'))].map((m) => m[1] ?? '');
}

function attr(attrs, name) {
  const m = attrs.match(new RegExp(`\\s${esc(name)}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return m ? decodeEntities(m[2] ?? m[3]) : null;
}

export function stripHtml(html) {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?)])/g, '$1')
    .replace(/\s*(?:Read more|Continue reading|Đọc tiếp)\W*$/i, '')
    .trim();
}

export function truncate(s, max = SUMMARY_MAX) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:–—-]+$/, '') + '…';
}

// RFC 822 với múi giờ kiểu "GMT+7" (GameK) hoặc ISO 8601; sai thì null.
export function parseDate(s) {
  if (!s) return null;
  const fixed = s.trim().replace(/GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i, (_, sign, h, m) => `${sign}${h.padStart(2, '0')}${m ?? '00'}`);
  const t = Date.parse(fixed);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function httpsUrl(raw, base) {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim(), base);
    if (u.protocol === 'http:') u.protocol = 'https:';
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

function imageOf(block, html) {
  for (const a of openTags(block, 'media:content')) {
    const type = attr(a, 'type') ?? '';
    const medium = attr(a, 'medium') ?? '';
    if (medium === 'image' || type.startsWith('image/') || (!medium && !type)) return attr(a, 'url');
  }
  for (const a of openTags(block, 'media:thumbnail')) if (attr(a, 'url')) return attr(a, 'url');
  for (const a of openTags(block, 'enclosure')) if ((attr(a, 'type') ?? '').startsWith('image/')) return attr(a, 'url');
  const img = html.match(/<img\s[^>]*?src\s*=\s*["']([^"']+)["']/i);
  return img ? decodeEntities(img[1]) : null;
}

function linkOf(block) {
  const rss = text(inner(block, 'link'));
  if (rss) return rss;
  // Atom: <link rel="alternate" href="..."/> (rel mặc định là alternate).
  const links = openTags(block, 'link');
  const alt = links.find((a) => (attr(a, 'rel') ?? 'alternate') === 'alternate') ?? links[0];
  return alt ? attr(alt, 'href') : null;
}

/** Các bài trong một feed RSS 2.0 hoặc Atom, chưa chuẩn hóa theo nguồn. */
export function parseFeed(xml) {
  const blocks = [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].map((m) => m[2]);
  return blocks.map((b) => {
    const descRaw = inner(b, 'description') ?? inner(b, 'summary') ?? '';
    const contentRaw = inner(b, 'content:encoded') ?? inner(b, 'content') ?? '';
    const desc = text(descRaw);
    const content = text(contentRaw);
    return {
      title: stripHtml(text(inner(b, 'title'))),
      link: linkOf(b),
      summary: stripHtml(desc || content),
      image: imageOf(b, desc + ' ' + content),
      date: text(inner(b, 'pubDate') ?? inner(b, 'published') ?? inner(b, 'dc:date') ?? inner(b, 'updated')),
    };
  });
}

/** Bài đã chuẩn hóa theo nguồn (đúng dạng ingest_news nhận); bài thiếu link/tiêu đề bị bỏ. */
export function normalize(entries, source, now = Date.now()) {
  const out = [];
  const seen = new Set();
  for (const e of entries) {
    let url = httpsUrl(e.link, source.url);
    if (!url || !e.title || BLOCKED.test(e.title + ' ' + (e.summary ?? ''))) continue;
    if (source.linkHost) {
      const u = new URL(url);
      u.host = source.linkHost;
      url = u.href;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    const published = parseDate(e.date);
    out.push({
      url,
      source: source.name,
      lang: source.lang,
      title: truncate(e.title, 300),
      summary: e.summary ? truncate(e.summary) : null,
      image_url: httpsUrl(e.image, url),
      published_at: published && Date.parse(published) <= now ? published : new Date(now).toISOString(),
    });
  }
  return out
    .sort((a, b) => b.published_at.localeCompare(a.published_at))
    .slice(0, PER_SOURCE);
}

async function fetchText(url, fetchImpl) {
  const res = await fetchImpl(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Lấy mọi nguồn song song; nguồn lỗi chỉ ghi log, không làm hỏng các nguồn khác. */
export async function collect(sources = SOURCES, { fetchImpl = fetch, log = console.log } = {}) {
  const results = await Promise.allSettled(sources.map(async (s) => normalize(parseFeed(await fetchText(s.url, fetchImpl)), s)));
  const items = [];
  let failed = 0;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      log(`${sources[i].name}: ${r.value.length} items`);
      items.push(...r.value);
    } else {
      failed++;
      log(`${sources[i].name}: failed (${r.reason?.message ?? r.reason})`);
    }
  });
  return { items, failed };
}

export async function ingest(items, { url, key, fetchImpl = fetch }) {
  const res = await fetchImpl(`${url.replace(/\/+$/, '')}/rest/v1/rpc/ingest_news`, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ p_items: items }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`ingest_news HTTP ${res.status}: ${await res.text()}`);
  return Number(await res.json());
}

async function main() {
  const dry = process.argv.includes('--dry-run');
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
  if (!dry && (!url || !key)) {
    console.log('::warning::Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY, skipping news crawl.');
    return;
  }
  const { items, failed } = await collect();
  if (failed === SOURCES.length) throw new Error('every source failed');
  if (dry) {
    console.log(JSON.stringify(items, null, 2));
    return;
  }
  console.log(`inserted ${await ingest(items, { url, key })} new of ${items.length}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
