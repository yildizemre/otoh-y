// Şener Oto (m.seneroto.com.tr) — ASP.NET MVC.
// Girişte resimli doğrulama kodu + Cloudflare Turnstile var: giriş kullanıcı tarafından
// görünür bir tarayıcı penceresinde yapılır (interactive), sonra oturum çerezleriyle
// aramalar arka planda yapılır.

const interactiveLogin = true;

// Görünür pencerede: bilgileri doldur, kullanıcı kodu yazıp "Giriş Yap"a basınca bitir.
async function login(page, { baseUrl, username, password }, { timeoutMs = 5 * 60000 } = {}) {
  await page.goto(`${baseUrl}/Login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#kullanicikodu', username);
  await page.fill('#password', password);
  await page.focus('#captcha');
  await page.waitForURL(u => !/\/login/i.test(u.pathname), { timeout: timeoutMs });
}

const searchUrl = (baseUrl, { q = '', kampanya = false, yeni = false } = {}) =>
  `${baseUrl}/Stok/Arama?OemKodu=&AracMarka=-1&AracModel=-1&Tedarikci=${encodeURIComponent('Tedarikçi Seçiniz...')}` +
  `&Kampanya=${kampanya}&YeniUrun=${yeni}&HizliArama=${encodeURIComponent(q)}&GrupId=-1&SatirNo=-1&AramaSartlari=`;

async function fetchRows(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (/\/login/i.test(new URL(page.url()).pathname)) throw new Error('NEED_LOGIN');
  return parse(page);
}

const search = (page, { baseUrl }, query) => fetchRows(page, searchUrl(baseUrl, { q: query }));

// Kampanyalı / yeni ürün listeleri
async function special(page, { baseUrl }, tur) {
  return fetchRows(page, searchUrl(baseUrl, tur === 'kampanya' ? { kampanya: true } : { yeni: true }));
}

function parse(page) {
  return page.$$eval('tr', trs => {
    const txt = el => (el ? (el.innerText || el.textContent).replace(/\s+/g, ' ').trim() : '');
    const num = s => parseFloat(String(s).replace(/[^\d,]/g, '').replace(',', '.')) || 0;
    // Başlıklar: Stok Kodu, Ürün Adı, Resim, Oem, Marka, Birim, Liste, Net, KDV'li, İskonto, Mrkz, Adn, Sam, Ank, Den
    const depoAd = ['Merkez', 'Adana', 'Samsun', 'Ankara', 'Denizli'];
    return trs.filter(tr => tr.querySelector('td.StokKod')).map(tr => {
      const td = [...tr.querySelectorAll('td')];
      const k = td.findIndex(c => c.classList.contains('StokKod'));
      const at = i => td[k + i];
      const fiyatlar = td.filter(c => /TL\s*$/.test(txt(c))).map(c => num(txt(c)));
      const stokImgs = td.map(c => c.querySelector('img[title]')).filter(i => i && /Var|Yok|truck|kritik|malkabul/i.test(i.title + i.src));
      const depolar = stokImgs.map((img, i) => {
        const t = (img.title || '').toLowerCase();
        const d = t === 'var' ? 'Var' : t === 'truck' ? 'Yolda' : t.includes('kritik') ? 'Kritik' : t.includes('malkabul') ? 'Mal kabul' : 'Yok';
        return `${depoAd[i] || 'Depo' + (i + 1)}:${d}`;
      });
      const oem = tr.querySelector('span') ? txt(tr.querySelector('td span')) : '';
      return {
        stokKodu: txt(at(0)),
        urunAdi: txt(at(1)),
        oem,
        marka: txt(at(4)),
        arac: '',
        depo: depolar.join(' '),
        stokVar: depolar.some(d => /:(Var|Kritik)$/.test(d)),
        listeFiyat: fiyatlar[0] || 0,
        netFiyat: fiyatlar[1] || 0,
        kdvliFiyat: fiyatlar[2] || fiyatlar[1] || 0,
        iskonto: txt(td.find(c => /%/.test(txt(c)))),
      };
    });
  });
}

async function check(page, { baseUrl }) {
  await page.goto(`${baseUrl}/Stok`, { waitUntil: 'domcontentloaded' });
  return !/\/login/i.test(new URL(page.url()).pathname);
}

module.exports = { login, search, parse, check, special, interactiveLogin };
