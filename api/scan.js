// Cầu nối lấy tin rao bán điện thoại từ Vựa Tốt và Nhật Tảo.
// Hai trang này không có API công khai nên phải đọc trang HTML rồi bóc tách.
// Chạy trên Vercel: tệp ở api/scan.js thành địa chỉ /api/scan
//
// Tham số:
//   source  vuatot | nhattao   (bắt buộc)
//   page    trang thứ mấy (mặc định 1)
//   debug   =1 để xem địa chỉ đã gọi, số byte tải về và số tin bóc được

const UA = 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

async function getText(url) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'vi-VN,vi;q=0.9'
    }
  });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' từ ' + new URL(url).hostname);
  return await r.text();
}

// "7.000.000 đ" -> 7000000 ; "3tr5" -> 3500000 ; "3500k" -> 3500000
function findPrice(text) {
  if (!text) return 0;
  const t = String(text)
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd')
    .toLowerCase();
  let m;
  if ((m = t.match(/([0-9]{1,3}(?:[.,][0-9]{3}){2})\s*(?:d|vnd|₫)?/))) {
    const n = Number(m[1].replace(/[.,]/g, ''));
    if (n >= 100000 && n <= 200000000) return n;
  }
  if ((m = t.match(/(\d{1,2})[.,](\d{1,3})\s*(?:tr|trieu)/))) {
    const b = m[2];
    return Math.round((Number(m[1]) + (b.length === 1 ? +b / 10 : b.length === 2 ? +b / 100 : +b / 1000)) * 1e6);
  }
  if ((m = t.match(/(\d{1,2})\s*(?:tr|trieu)\s*(\d{1,3})(?!\d)/))) {
    const b = m[2];
    return Math.round((Number(m[1]) + (b.length === 1 ? +b / 10 : b.length === 2 ? +b / 100 : +b / 1000)) * 1e6);
  }
  if ((m = t.match(/(\d{1,2})\s*(?:tr|trieu)/))) return Number(m[1]) * 1e6;
  if ((m = t.match(/(\d{3,4})\s*k(?![a-z])/))) return Number(m[1]) * 1000;
  return 0;
}

const unslug = (s) => decodeURIComponent(s).replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
const strip = (s) => String(s || '')
  .replace(/<!\[CDATA\[|\]\]>/g, '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

/* ---------------- VỰA TỐT ---------------- */
async function vuatot(page) {
  const base = 'https://vuatot.vn/mua-ban-dien-thoai/ha-noi';
  const url = page > 1 ? base + '?page=' + page : base;
  const html = await getText(url);
  const items = [];
  const seen = new Set();

  // href dạng /mua-ban-dien-thoai-<slug>-<token>-<id>.html
  const re = /href="((?:https:\/\/vuatot\.vn)?\/mua-ban-dien-thoai-([^"]*?)-(\d+)\.html)"/g;
  let m;
  while ((m = re.exec(html))) {
    const id = m[3];
    if (seen.has(id)) continue;
    seen.add(id);

    const href = m[1].startsWith('http') ? m[1] : 'https://vuatot.vn' + m[1];
    // bỏ đoạn mã ngẫu nhiên cuối slug (chuỗi 10+ ký tự lẫn hoa thường)
    const parts = m[2].split('-');
    if (parts.length > 1 && /^[A-Za-z0-9]{10,}$/.test(parts[parts.length - 1])) parts.pop();
    let title = unslug(parts.join('-'));

    // tìm tiêu đề và giá trong đoạn HTML quanh liên kết
    const win = html.slice(m.index, m.index + 1600);
    const t2 = win.match(/title="([^"]{8,160})"/) || win.match(/alt="([^"]{8,160})"/);
    if (t2 && /[a-zA-Z]/.test(t2[1])) title = strip(t2[1]);

    const pm = win.match(/([0-9]{1,3}(?:[.,][0-9]{3}){1,3})\s*(?:đ|₫|<\/)/);
    const price = pm ? findPrice(pm[1] + ' đ') : findPrice(win.replace(/<[^>]*>/g, ' ').slice(0, 400));

    items.push({ id: 'vt' + id, title, price, priceText: '', area: 'Hà Nội', time: null, seller: '', url: href, src: 'vuatot' });
  }
  return { items, bytes: html.length, url };
}

/* ---------------- NHẬT TẢO ---------------- */
async function nhattao(page) {
  const node = 'dien-thoai.543';
  // Ưu tiên RSS (nhẹ, sạch); không có thì đọc trang danh sách
  if (page <= 1) {
    try {
      const xml = await getText('https://nhattao.com/f/' + node + '/index.rss');
      if (/<item[\s>]/i.test(xml)) {
        const items = [];
        const re = /<item[\s\S]*?<\/item>/gi;
        let m;
        while ((m = re.exec(xml))) {
          const blk = m[0];
          const link = strip((blk.match(/<link>([\s\S]*?)<\/link>/i) || [])[1]);
          const title = strip((blk.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]);
          const desc = strip((blk.match(/<description>([\s\S]*?)<\/description>/i) || [])[1]);
          const date = strip((blk.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1]);
          const idm = link.match(/\.(\d+)\/?$/);
          if (!link || !title) continue;
          items.push({
            id: 'nt' + (idm ? idm[1] : link),
            title,
            price: findPrice(title) || findPrice(desc),
            priceText: '', area: '', time: date || null, seller: '',
            url: link, src: 'nhattao'
          });
        }
        if (items.length) return { items, bytes: xml.length, url: 'rss' };
      }
    } catch (e) { /* rơi xuống đọc HTML */ }
  }

  const url = 'https://nhattao.com/f/' + node + '/?order=recent' + (page > 1 ? '&page=' + page : '');
  const html = await getText(url);
  const items = [];
  const seen = new Set();
  const re = /href="((?:https:\/\/nhattao\.com)?\/threads\/([^"]*?)\.(\d+)\/?)"/g;
  let m;
  while ((m = re.exec(html))) {
    const id = m[3];
    if (seen.has(id)) continue;
    seen.add(id);
    const href = m[1].startsWith('http') ? m[1] : 'https://nhattao.com' + m[1];
    const win = html.slice(m.index, m.index + 1200);
    let title = unslug(m[2]);
    const inner = win.match(/>([^<>]{10,160})<\/a>/);
    if (inner && /[a-zA-Z]/.test(inner[1])) title = strip(inner[1]);
    items.push({
      id: 'nt' + id, title,
      price: findPrice(title) || findPrice(strip(win).slice(0, 300)),
      priceText: '', area: '', time: null, seller: '', url: href, src: 'nhattao'
    });
  }
  return { items, bytes: html.length, url };
}

module.exports = async function handler(req, res) {
  const source = String(req.query?.source || '').toLowerCase();
  const page = Math.max(parseInt(String(req.query?.page || '1'), 10) || 1, 1);
  const debug = String(req.query?.debug || '') === '1';

  try {
    let out;
    if (source === 'vuatot') out = await vuatot(page);
    else if (source === 'nhattao') out = await nhattao(page);
    else { res.status(400).json({ error: 'source phải là vuatot hoặc nhattao' }); return; }

    res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=600');
    res.status(200).json({
      count: out.items.length,
      items: out.items,
      ...(debug ? { upstream: out.url, bytes: out.bytes, sample: out.items.slice(0, 3) } : {})
    });
  } catch (err) {
    res.status(502).json({ error: String((err && err.message) || err), source });
  }
};
