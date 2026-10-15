// Buyasoft B4B altyapısı (b4b.sedaford.com vb.)
// Site sahte form alanları ve sahte fiyatlar kullandığı için gerçek tarayıcıyla,
// sadece GÖRÜNÜR elemanlar okunur.

async function login(page, { baseUrl, username, password }) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  const user = page.locator('form input[type=text]:visible, form input[type=tel]:visible, form input[type=email]:visible').first();
  const pass = page.locator('form input[type=password]:visible').first();
  await user.fill(username);
  await pass.fill(password);
  await Promise.all([
    page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 }),
    pass.press('Enter'),
  ]);
}

async function search(page, { baseUrl }, query) {
  await page.goto(`${baseUrl}/productsearch?key=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded' });
  if (new URL(page.url()).pathname.startsWith('/login')) throw new Error('NEED_LOGIN');
  await page.waitForSelector('tr.contextSearchRow, .no-result, .alert', { timeout: 20000 }).catch(() => {});
  return parse(page);
}

// Açık sonuç sayfasındaki tabloyu oku
function parse(page) {
  return page.$$eval('tr.contextSearchRow', rows => {
    const txt = el => (el ? (el.innerText || el.textContent).replace(/\s+/g, ' ').trim() : '');
    // Hücrede birden fazla fiyat var; sadece görünür olanı al
    const visiblePrice = td => {
      if (!td) return '';
      const divs = [...td.querySelectorAll('.divPrice')];
      if (!divs.length) return txt(td);
      const v = divs.find(d => d.offsetParent !== null && getComputedStyle(d).display !== 'none' && getComputedStyle(d).visibility !== 'hidden');
      return txt(v);
    };
    const num = s => parseFloat(String(s).replace(/[^\d,]/g, '').replace(',', '.')) || 0;
    // Her sitede sütunlar farklı: başlık adına göre sütun bul
    const colMap = table => {
      const heads = [...table.querySelectorAll('thead th')].map(th => txt(th).toLocaleUpperCase('tr'));
      const find = re => heads.findIndex(h => re.test(h));
      return {
        heads,
        stokKodu: find(/^KODU$|ÜRETİCİ KODU|STOK KODU|ÜRÜN KODU/),
        marka: find(/^MARKA$|^ÜRETİCİ$/),
        oem: find(/OEM/),
        urunAdi: find(/^ADI$|PARÇA ADI|ÜRÜN ADI/),
        arac: find(/ARA[CÇ]|MODEL/),
        liste: find(/LİSTE/),
        iskonto: find(/İSKONTO/),
        net: heads.findIndex(h => /SATIŞ FİYATI/.test(h) && !/KDV/.test(h)),
        kdvli: find(/KDV/),
      };
    };
    const maps = new Map();
    return rows.map(r => {
      const table = r.closest('table');
      if (!maps.has(table)) maps.set(table, colMap(table));
      const m = maps.get(table);
      const td = r.querySelectorAll('td');
      const at = i => (i >= 0 ? td[i] : null);
      const depolar = [...td].map((c, i) => c.querySelector('.divWarehouse') ? `${m.heads[i] || 'Depo'}:${txt(c)}` : null).filter(Boolean);
      const adi = at(m.urunAdi);
      return {
        stokKodu: txt(at(m.stokKodu)),
        oem: txt(at(m.oem)),
        marka: txt(at(m.marka)),
        arac: txt(at(m.arac)),
        urunAdi: txt(adi && (adi.querySelector('.product-name') || adi)),
        depo: depolar.join(' '),
        stokVar: depolar.some(d => d.endsWith(':Var')),
        listeFiyat: num(visiblePrice(at(m.liste))),
        iskonto: txt(at(m.iskonto)),
        netFiyat: num(visiblePrice(at(m.net))),
        kdvliFiyat: num(visiblePrice(at(m.kdvli))),
      };
    });
  });
}

// Oturum hâlâ açık mı? (keep-alive için hafif kontrol)
async function check(page, { baseUrl }) {
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  return !new URL(page.url()).pathname.startsWith('/login');
}

module.exports = { login, search, parse, check };
