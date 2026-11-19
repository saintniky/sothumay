// Cầu nối tới API tin đăng công khai của Chợ Tốt.
// Trình duyệt không gọi thẳng sang tên miền khác được (CORS), nên đi vòng qua đây.
// Chạy trên Vercel: tệp nằm ở api/chotot.js là tự thành địa chỉ /api/chotot
//
// Tham số:
//   cg      mã ngành hàng  (5010 = Điện thoại)
//   region  mã tỉnh/thành  (12000 = Hà Nội; bỏ trống = toàn quốc)
//   limit   số tin lấy về  (tối đa 100)
//   page    trang thứ mấy
//   q       từ khóa (để trống thì lấy tin mới nhất của cả ngành hàng)
//   debug   =1 để xem địa chỉ đã gọi và số tin nhận được

const UPSTREAM = 'https://gateway.chotot.com/v1/public/ad-listing';

module.exports = async function handler(req, res) {
  const g = (k, d) => {
    const v = req.query?.[k];
    return v === undefined || v === '' ? d : String(v);
  };

  const cg = g('cg', '5010');
  const region = g('region', '12000');
  const limit = Math.min(parseInt(g('limit', '50'), 10) || 50, 100);
  const page = Math.max(parseInt(g('page', '1'), 10) || 1, 1);
  const q = g('q', '');
  const debug = g('debug', '') === '1';

  const u = new URL(UPSTREAM);
  u.searchParams.set('limit', String(limit));
  u.searchParams.set('o', String((page - 1) * limit));
  u.searchParams.set('st', 's,k');
  u.searchParams.set('key_param_included', 'true');
  if (cg) u.searchParams.set('cg', cg);
  if (region) u.searchParams.set('region_v2', region);
  if (q) u.searchParams.set('q', q);

  try {
    const r = await fetch(u.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
        'Referer': 'https://www.chotot.com/'
      }
    });

    if (!r.ok) {
      res.status(502).json({ error: 'upstream', status: r.status, url: debug ? u.toString() : undefined });
      return;
    }

    const data = await r.json();
    const ads = Array.isArray(data?.ads) ? data.ads : [];

    // Chỉ giữ những trường cần dùng, cho nhẹ
    const items = ads.map((a) => ({
      id: a.list_id || a.ad_id || a.id || null,
      title: a.subject || a.title || '',
      price: Number(a.price || 0),
      priceText: a.price_string || '',
      area: a.area_name || a.region_name || '',
      region: a.region_name || '',
      time: a.list_time || a.date || null,
      seller: a.account_name || a.seller_name || '',
      image: a.image || (Array.isArray(a.images) ? a.images[0] : '') || '',
      url: (a.list_id || a.ad_id)
        ? `https://www.chotot.com/${a.list_id || a.ad_id}.htm`
        : 'https://www.chotot.com/'
    })).filter((x) => x.id);

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
    res.status(200).json({
      total: data?.total ?? items.length,
      count: items.length,
      items,
      ...(debug ? { upstream: u.toString(), rawKeys: Object.keys(data || {}) } : {})
    });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message || err), url: debug ? u.toString() : undefined });
  }
};
