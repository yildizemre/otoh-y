# Parça-AI · hype vision

B2B oto yedek parça toptancılarını tek ekranda karşılaştıran platform. Parça numarasını bir kez yaz; tüm toptancılarda paralel arar, en ucuz ve stoktaki teklifi bulur, siparişi toptancılara en uygun şekilde dağıtır.

## Özellikler

- **Paralel arama**: tüm aktif toptancılarda aynı anda, fiyata göre sıralı tek tablo
- **Toplu arama**: liste yapıştır veya Excel yükle, her parçanın en iyi teklifi
- **Sepetler & sipariş planı**: birden fazla sepet, ürün başına en ucuz toptancı, tek toptancı senaryoları, tasarruf hesabı, fiyatları yeniden sorgulama
- **Takip listesi**: hedef fiyat, fiyat grafiği; fiyat düşünce / hedefe ulaşınca / stoğa girince bildirim
- **Kampanya & yeni ürünler**: günde N kez otomatik tarama, yeni gelenler bildirim olarak
- **Bildirim merkezi**, **AI rapor** (kural tabanlı analiz), **arama geçmişi**
- **Excel / PDF** dışa aktarma
- **Üyelik yönetimi** (yönetici / kullanıcı), ayarlar, açık/koyu tema, mobil uyumlu
- **Oturum yönetimi**: toptancı oturumları kaydedilir, belirli aralıkla kontrol edilir, düşerse yeniden bağlanır; istekler sıraya alınıp aralıklı gönderilir
- **Giriş kayıtları**: toptancı sitelerine yapılan tüm giriş denemeleri

## Desteklenen altyapılar

| Altyapı | Örnek | Giriş |
|---|---|---|
| Buyasoft B4B | b4b.sedaford.com, biparca.com | Otomatik |
| Şener (ASP.NET) | m.seneroto.com.tr | Doğrulama kodu + Cloudflare → kullanıcı görünür pencerede bir kez giriş yapar |

Yeni altyapı: `adapters/<ad>.js` dosyasında `login`, `search`, `check` (opsiyonel `special`) yaz, `server.js` içindeki `ADAPTERS` listesine ekle.

## Çalıştırma (yerel)

```bash
npm install
npm start
```

http://localhost:3000 — ilk kullanıcı `emre` / `emre` (ilk girişten sonra Ayarlar'dan değiştirin).

Toptancı bilgileri panelden **Entegrasyonlar** sayfasında girilir. Veriler `data/` klasöründe tutulur (git'e gönderilmez).

## Sunucuya kurulum (Docker)

```bash
docker build -t parca-ai .
docker run -d -p 3000:3000 -v parca-data:/data --name parca-ai parca-ai
```

Railway, Render, Fly.io veya herhangi bir VPS üzerinde bu Dockerfile ile çalışır. Kalıcı disk (`/data`) bağlanmalıdır.

> **Netlify / Vercel uygun değildir**: uygulama sürekli açık duran bir sunucu ve Chromium tarayıcı gerektirir (oturum tutma, zamanlanmış kontroller). Bu platformlar yalnızca statik site ve kısa ömürlü fonksiyon çalıştırır.

> **Şener notu**: doğrulama kodlu girişte görünür tarayıcı penceresi açılır; ekransız sunucuda bu adım yapılamaz. Sunucu kurulumunda Şener oturumu yerelde açılıp `data/sessions/sener.json` dosyası sunucuya kopyalanmalı veya uzak masaüstü (VNC) kullanılmalıdır.
