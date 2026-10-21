import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collect, decodeEntities, ingest, normalize, parseDate, parseFeed, PER_SOURCE, stripHtml, truncate } from './crawl-news.mjs';

const RSS = `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
<item><title><![CDATA[Một viễn cảnh "ảm đạm"]]></title><description><![CDATA[Tóm tắt ngắn.]]></description>
<link><![CDATA[https://cl44.cnnd.vn/bai-a-1.chn]]></link><enclosure url="https://cdn.vn/a.png" length="0" type="image/jpeg" />
<pubDate>Wed, 21 Oct 2026 21:20:00 GMT+7</pubDate></item>
<item><title>Tom &amp; Jerry &#8211; S&amp;atilde;o</title><link>http://site.com/b</link>
<description>&lt;img src="https://cdn.com/b.jpg?w=1&amp;q=2" /&gt; &lt;p&gt;Hello &lt;b&gt;world&lt;/b&gt; , again. Read more&lt;/p&gt;</description>
<pubDate>Tue, 20 Oct 2026 10:00:00 +0000</pubDate></item>
<item><title>Media</title><link>https://site.com/c</link><media:content medium="image" url="https://cdn.com/c.jpg"/>
<content:encoded><![CDATA[<p>From <i>content</i> S&atilde;o M&amacr;ori</p>]]></content:encoded><pubDate>not a date</pubDate></item>
<item><title>No link</title></item>
<item><title>Bad link</title><link>javascript:alert(1)</link></item>
</channel></rss>`;

const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title type="html">Atom &lt;b&gt;post&lt;/b&gt;</title>
<link rel="self" href="https://a.com/self"/><link rel="alternate" href="https://a.com/post"/>
<summary>Sum</summary><published>2026-10-19T08:00:00Z</published>
<media:thumbnail url="https://a.com/t.jpg"/></entry></feed>`;

const NOW = Date.parse('2026-10-21T15:00:00Z');
const SRC = { name: 'Site', lang: 'en', url: 'https://site.com/feed' };

test('decodeEntities: named, Latin-1, numeric; unknown kept', () => {
  assert.equal(decodeEntities('a &amp; b &atilde; &Eacute; &#8211; &#x1F3AE; &zzz;'), 'a & b ã É – 🎮 &zzz;');
});

test('stripHtml drops tags, tidies spaces before punctuation and a trailing "Read more"', () => {
  assert.equal(stripHtml('<p>Hello <b>world</b> , again. Read more</p><script>x()</script>'), 'Hello world, again.');
});

test('truncate cuts at a word boundary and adds an ellipsis', () => {
  assert.equal(truncate('short', 10), 'short');
  const t = truncate('one two three four five six seven', 20);
  assert.ok(t.length <= 20 && t.endsWith('…'), t);
  assert.equal(t, 'one two three four…');
});

test('parseDate understands GMT+7 offsets and ISO; garbage is null', () => {
  assert.equal(parseDate('Wed, 21 Oct 2026 21:20:00 GMT+7'), '2026-10-21T14:20:00.000Z');
  assert.equal(parseDate('2026-10-19T08:00:00Z'), '2026-10-19T08:00:00.000Z');
  assert.equal(parseDate('not a date'), null);
  assert.equal(parseDate(''), null);
});

test('parseFeed reads RSS items: CDATA, entities, enclosure / media / inline img', () => {
  const [a, b, c] = parseFeed(RSS);
  assert.deepEqual(a, { title: 'Một viễn cảnh "ảm đạm"', link: 'https://cl44.cnnd.vn/bai-a-1.chn', summary: 'Tóm tắt ngắn.', image: 'https://cdn.vn/a.png', date: 'Wed, 21 Oct 2026 21:20:00 GMT+7' });
  assert.equal(b.title, 'Tom & Jerry – São');
  assert.equal(b.summary, 'Hello world, again.');
  assert.equal(b.image, 'https://cdn.com/b.jpg?w=1&q=2');
  assert.equal(c.summary, 'From content São Māori');
  assert.equal(c.image, 'https://cdn.com/c.jpg');
});

test('parseFeed reads Atom entries: alternate link, summary, thumbnail', () => {
  assert.deepEqual(parseFeed(ATOM), [{ title: 'Atom post', link: 'https://a.com/post', summary: 'Sum', image: 'https://a.com/t.jpg', date: '2026-10-19T08:00:00Z' }]);
});

test('normalize: https only, rewrites linkHost, drops items without link/title, bad dates fall back to now, newest first', () => {
  const items = normalize(parseFeed(RSS), SRC, NOW);
  assert.deepEqual(items.map((i) => i.url), ['https://site.com/c', 'https://cl44.cnnd.vn/bai-a-1.chn', 'https://site.com/b']);
  assert.equal(items[0].published_at, new Date(NOW).toISOString());
  assert.deepEqual(items[1], {
    url: 'https://cl44.cnnd.vn/bai-a-1.chn', source: 'Site', lang: 'en', title: 'Một viễn cảnh "ảm đạm"', summary: 'Tóm tắt ngắn.',
    image_url: 'https://cdn.vn/a.png', published_at: '2026-10-21T14:20:00.000Z',
  });
  const gamek = normalize(parseFeed(RSS), { ...SRC, linkHost: 'gamek.vn' }, NOW);
  assert.ok(gamek.some((i) => i.url === 'https://gamek.vn/bai-a-1.chn'));
});

test('normalize: future dates clamp to now, duplicates collapse, at most PER_SOURCE per source', () => {
  const many = Array.from({ length: PER_SOURCE + 5 }, (_, i) => ({ title: 't' + i, link: 'https://x.com/' + (i % (PER_SOURCE + 2)), date: '2999-01-01T00:00:00Z' }));
  const out = normalize(many, SRC, NOW);
  assert.equal(out.length, PER_SOURCE);
  assert.ok(out.every((i) => i.published_at === new Date(NOW).toISOString()));
});

test('collect: a failing source is logged and skipped, others still come through', async () => {
  const logs = [];
  const fetchImpl = async (url) =>
    url === 'https://ok.com/feed' ? { ok: true, text: async () => ATOM } : { ok: false, status: 503, text: async () => '' };
  const { items, failed } = await collect(
    [{ name: 'OK', lang: 'en', url: 'https://ok.com/feed' }, { name: 'Down', lang: 'vi', url: 'https://down.com/feed' }],
    { fetchImpl, log: (m) => logs.push(m) },
  );
  assert.equal(failed, 1);
  assert.deepEqual(items.map((i) => i.source), ['OK']);
  assert.deepEqual(logs, ['OK: 1 items', 'Down: failed (HTTP 503)']);
});

test('ingest posts the items to the RPC with the service key and returns the count', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => 3 };
  };
  const n = await ingest([{ url: 'https://a.com' }], { url: 'https://p.supabase.co/', key: 'svc', fetchImpl });
  assert.equal(n, 3);
  assert.equal(calls[0].url, 'https://p.supabase.co/rest/v1/rpc/ingest_news');
  assert.equal(calls[0].init.headers.authorization, 'Bearer svc');
  assert.deepEqual(JSON.parse(calls[0].init.body), { p_items: [{ url: 'https://a.com' }] });
  await assert.rejects(ingest([], { url: 'https://p', key: 'k', fetchImpl: async () => ({ ok: false, status: 401, text: async () => 'no' }) }), /HTTP 401/);
});

test('normalize drops adult / gambling headlines matched by BLOCKED, keeps game news', () => {
  const entries = [
    { title: 'Top 7 phim Nhật gắn nhãn 18+: Cảnh nóng táo bạo', link: 'https://x.com/1' },
    { title: 'Hot girl khoe dáng', link: 'https://x.com/2' },
    { title: 'Esports', summary: 'Nghi án cá cược trong giải đấu', link: 'https://x.com/3' },
    { title: 'Elden Ring DLC review', summary: 'Essex studio', link: 'https://x.com/4' },
    { title: 'CKTG 2026: T1 vào bán kết', link: 'https://x.com/5' },
  ];
  assert.deepEqual(normalize(entries, SRC, NOW).map((i) => i.url).sort(), ['https://x.com/4', 'https://x.com/5']);
});
