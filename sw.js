// Service worker của Sổ Thu Máy
// - Ưu tiên lấy bản mới nhất từ mạng (sửa trên Vercel là máy cập nhật ngay)
// - Mất sóng thì dùng bản đã lưu, app vẫn mở và xem được dữ liệu
// - Dữ liệu lưu trong localStorage của máy nên không phụ thuộc mạng
// Khi sửa tệp này, tăng số phiên bản để máy nhận bản mới.
const CACHE = 'sothumay-v1';
const CORE = [
  '/',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Trang của mình + thư viện giao diện (Tailwind, Font Awesome, font)
  const isOwn = url.origin === self.location.origin;
  const isLib = /cdn\.tailwindcss\.com|cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/.test(url.hostname);
  if (!isOwn && !isLib) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('/') : undefined))
      )
  );
});
