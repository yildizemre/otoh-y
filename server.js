// hype vision · Parça-AI (PoC)
// Veritabanı yok: her şey data/*.json dosyalarında.
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { chromium } = require('playwright');

const PORT = process.env.PORT || 3000;
const headless = !process.argv.includes('--goster');
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(path.join(DATA, 'sessions'), { recursive: true });

const readJson = (f, def) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch { return def; } };
const writeJson = (f, v) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(v, null, 2));
const uid = (n = 6) => crypto.randomBytes(n).toString('hex');
const now = () => new Date().toISOString();
const norm = s => String(s || '').toLocaleUpperCase('tr').replace(/[^A-Z0-9]/g, '');
const tl = n => n ? n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺' : '—';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Altyapılar. Yeni altyapı = adapters/ altına dosya + buraya satır.
const ADAPTERS = {
  buyasoft: { ad: 'Buyasoft B4B', ornek: 'https://b4b.sedaford.com' },
  sener: { ad: 'Şener (doğrulama kodlu)', ornek: 'https://m.seneroto.com.tr', interaktif: true },
};
const adapterOf = site => require(`./adapters/${site.adapter}`);

// ================= Kalıcı depo =================
const store = Object.assign({ history: [], carts: {}, watch: {}, notifs: [], loginLog: [], specials: {}, schedule: {} }, readJson('store.json', {}));
let saveT;
const saveStore = () => { clearTimeout(saveT); saveT = setTimeout(() => writeJson('store.json', store), 800); };

function notify({ userId = null, tip = 'bilgi', baslik, mesaj = '', link = '' }) {
  store.notifs.unshift({ id: uid(), userId, tip, baslik, mesaj, link, tarih: now(), okuyan: [] });
  store.notifs.length = Math.min(store.notifs.length, 500);
  saveStore();
}
function logLogin(site, ok, hata, sebep) {
  store.loginLog.unshift({ id: uid(4), siteId: site.id, ad: site.ad, tarih: now(), ok, hata: hata || null, sebep });
  store.loginLog.length = Math.min(store.loginLog.length, 300);
  saveStore();
}

// ================= Kullanıcılar =================
const hashPw = (pw, salt = crypto.randomBytes(16).toString('hex')) => ({ salt, hash: crypto.scryptSync(pw, salt, 32).toString('hex') });
const checkPw = (u, pw) => crypto.timingSafeEqual(Buffer.from(hashPw(pw, u.salt).hash, 'hex'), Buffer.from(u.hash, 'hex'));
let users = readJson('users.json', []);
if (!users.length) {
  users.push({ id: 'u1', username: 'emre', ad: 'Emre', rol: 'admin', aktif: true, olusturma: now(), ...hashPw('emre') });
  writeJson('users.json', users);
}
const saveUsers = () => writeJson('users.json', users);
const publicUser = u => ({ id: u.id, username: u.username, ad: u.ad, rol: u.rol, aktif: u.aktif, olusturma: u.olusturma, sonGiris: u.sonGiris });

// ================= Ayarlar & toptancılar =================
let config = readJson('config.json', { sites: [] });
config.ayarlar = {
  keepAliveDk: 8, istekAraligiMs: 1500, zamanAsimiSn: 45,
  kontrolSaatleri: '09:00,15:00',          // takip / kampanya / sepet kontrolleri
  whatsapp: { aktif: false, numara: '' },
  ...(config.ayarlar || {}),
};
if (!config.sites.some(s => s.adapter === 'sener'))
  config.sites.push({ id: 'sener', ad: 'Şener Oto', adapter: 'sener', baseUrl: 'https://m.seneroto.com.tr', username: '', password: '', aktif: true });
const saveConfig = () => writeJson('config.json', config);
saveConfig();
const publicSite = s => {
  const st = sessions[s.id] || {};
  return {
    ...s, password: undefined, sifreVar: !!s.password, interaktif: !!ADAPTERS[s.adapter]?.interaktif,
    durum: st.durum || (s.username && s.password ? 'bekliyor' : 'eksik'), sonKontrol: st.sonKontrol, sonHata: st.sonHata,
    oturumKayitli: fs.existsSync(stateFile(s.id)),
  };
};

// ================= Tarayıcı oturumları =================
let browser, headedBrowser;
const sessions = {};
const stateFile = id => path.join(DATA, 'sessions', `${id}.json`);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';
const ctxOpts = () => ({ userAgent: UA, locale: 'tr-TR', viewport: { width: 1440, height: 900 } });

async function getSession(site) {
  let s = sessions[site.id];
  if (s?.context) return s;
  const opts = ctxOpts();
  const hasState = fs.existsSync(stateFile(site.id));
  if (hasState) opts.storageState = stateFile(site.id);
  const context = await browser.newContext(opts);
  s = sessions[site.id] = { ...(s || {}), context, page: await context.newPage(), loggedIn: hasState, queue: Promise.resolve(), sonIstek: 0, durum: s?.durum || 'bekliyor' };
  return s;
}
async function closeSession(id, silCerez = false) {
  const s = sessions[id];
  if (s?.context) await s.context.close().catch(() => {});
  if (s) { delete s.context; delete s.page; s.loggedIn = false; }
  if (silCerez) fs.rmSync(stateFile(id), { force: true });
}
// Aynı siteye işlemler sırayla ve aralıklı (ban yememek için)
function enqueue(site, fn) {
  return getSession(site).then(s => {
    const run = async () => {
      const bekle = config.ayarlar.istekAraligiMs - (Date.now() - s.sonIstek);
      if (bekle > 0) await sleep(bekle);
      try { return await fn(s); } finally { s.sonIstek = Date.now(); }
    };
    const p = s.queue.then(run, run);
    s.queue = p.catch(() => {});
    return p;
  });
}
const creds = site => ({ baseUrl: site.baseUrl, username: site.username, password: site.password });
const setState = (site, patch) => { sessions[site.id] = Object.assign(sessions[site.id] || {}, patch); };

// Doğrulama kodlu siteler otomatik giriş yapamaz → kullanıcıya bildirim
const sonUyari = {};
function needUserLogin(site, sebep) {
  setState(site, { durum: 'giris-gerekli', loggedIn: false, sonHata: 'Giriş gerekli (doğrulama kodu)' });
  if (!sonUyari[site.id] || Date.now() - sonUyari[site.id] > 60 * 60000) {
    sonUyari[site.id] = Date.now();
    notify({ tip: 'uyari', baslik: `${site.ad} oturumu kapalı`, mesaj: 'Doğrulama kodu gerektiği için girişi senin yapman lazım. Entegrasyonlar → Bağlan.', link: 'entegrasyon' });
  }
  logLogin(site, false, 'Kullanıcı girişi gerekli', sebep);
  return new Error('Giriş gerekli — Entegrasyonlar\'dan "Bağlan"');
}

async function doLogin(site, s, sebep) {
  const adapter = adapterOf(site);
  if (adapter.interactiveLogin) throw needUserLogin(site, sebep);
  s.durum = 'baglaniyor';
  try {
    await adapter.login(s.page, creds(site));
    await s.context.storageState({ path: stateFile(site.id) });
    Object.assign(s, { loggedIn: true, durum: 'bagli', sonHata: null, sonKontrol: now() });
    logLogin(site, true, null, sebep);
  } catch (e) {
    Object.assign(s, { loggedIn: false, durum: 'hata', sonHata: e.message });
    logLogin(site, false, e.message, sebep);
    throw e;
  }
}

// Görünür pencerede kullanıcı girişi (Şener gibi doğrulama kodlu siteler)
const interactiveRunning = {};
async function interactiveConnect(site) {
  if (interactiveRunning[site.id]) return;
  interactiveRunning[site.id] = true;
  setState(site, { durum: 'giris-bekliyor', sonHata: null });
  let ctx;
  try {
    if (!headedBrowser || !headedBrowser.isConnected()) headedBrowser = await chromium.launch({ headless: false });
    ctx = await headedBrowser.newContext({ ...ctxOpts(), viewport: null });
    const page = await ctx.newPage();
    await adapterOf(site).login(page, creds(site));
    await ctx.storageState({ path: stateFile(site.id) });
    await closeSession(site.id);
    setState(site, { durum: 'bagli', sonHata: null, sonKontrol: now() });
    logLogin(site, true, null, 'manuel');
    notify({ tip: 'basari', baslik: `${site.ad} bağlandı`, mesaj: 'Oturum kaydedildi, aramalar arka planda devam edecek.', link: 'entegrasyon' });
  } catch (e) {
    setState(site, { durum: 'hata', sonHata: 'Giriş tamamlanmadı: ' + e.message.split('\n')[0] });
    logLogin(site, false, e.message.split('\n')[0], 'manuel');
  } finally {
    interactiveRunning[site.id] = false;
    if (ctx) await ctx.close().catch(() => {});
  }
}

async function siteCall(site, fn, sebep = 'arama') {
  if (!site.username || !site.password) throw new Error('Giriş bilgisi yok');
  const adapter = adapterOf(site);
  const st = sessions[site.id];
  if (adapter.interactiveLogin && (st?.durum === 'giris-gerekli' || st?.durum === 'giris-bekliyor') && !fs.existsSync(stateFile(site.id)))
    throw new Error('Giriş gerekli — Entegrasyonlar\'dan "Bağlan"');
  return enqueue(site, async s => {
    if (!s.loggedIn) await doLogin(site, s, sebep);
    let out;
    try { out = await fn(adapter, s); }
    catch (e) {
      if (e.message !== 'NEED_LOGIN') { Object.assign(s, { durum: 'hata', sonHata: e.message }); throw e; }
      s.loggedIn = false;
      if (adapter.interactiveLogin) { fs.rmSync(stateFile(site.id), { force: true }); throw needUserLogin(site, sebep); }
      await doLogin(site, s, sebep + ' (oturum düştü)');
      out = await fn(adapter, s);
    }
    Object.assign(s, { durum: 'bagli', sonHata: null, sonKontrol: now() });
    return out;
  });
}
const searchSite = (site, q) => siteCall(site, (a, s) => a.search(s.page, creds(site), q));

// Keep-alive
async function keepAlive(site) {
  if (!site.aktif || !site.username || !site.password) return;
  const adapter = adapterOf(site);
  if (adapter.interactiveLogin && !fs.existsSync(stateFile(site.id))) { setState(site, { durum: 'giris-gerekli' }); return; }
  await enqueue(site, async s => {
    try {
      const ok = s.loggedIn && await adapter.check(s.page, creds(site));
      if (!ok) {
        if (adapter.interactiveLogin) { fs.rmSync(stateFile(site.id), { force: true }); needUserLogin(site, 'oturum kontrolü'); return; }
        await doLogin(site, s, 'oturum kontrolü');
      } else {
        Object.assign(s, { durum: 'bagli', sonKontrol: now() });
        await s.context.storageState({ path: stateFile(site.id) });
      }
    } catch (e) { Object.assign(s, { loggedIn: false, durum: 'hata', sonHata: e.message }); }
  }).catch(() => {});
}
const keepAliveAll = () => Promise.all(config.sites.map(keepAlive));
let kaTimer;
const scheduleKeepAlive = () => { clearInterval(kaTimer); kaTimer = setInterval(keepAliveAll, Math.max(1, config.ayarlar.keepAliveDk) * 60000); };
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('Zaman aşımı')), ms))]);

// ================= Arama çekirdeği =================
async function searchAll(q) {
  const start = Date.now();
  const durum = await Promise.all(config.sites.filter(s => s.aktif).map(async site => {
    const t = Date.now();
    try {
      const rows = await withTimeout(searchSite(site, q), config.ayarlar.zamanAsimiSn * 1000);
      return { id: site.id, ad: site.ad, ok: true, sure: Date.now() - t, rows: rows.map(r => ({ ...r, toptanci: site.ad, toptanciId: site.id })) };
    } catch (e) {
      return { id: site.id, ad: site.ad, ok: false, sure: Date.now() - t, hata: e.message, rows: [] };
    }
  }));
  const sonuclar = durum.flatMap(d => d.rows);
  const f = sonuclar.map(r => r.kdvliFiyat).filter(Boolean);
  return { q, tarih: now(), sure: Date.now() - start, firmalar: durum.map(({ rows, ...d }) => ({ ...d, adet: rows.length })), sonuclar, enUcuz: f.length ? Math.min(...f) : null, enPahali: f.length ? Math.max(...f) : null };
}
// Bir stok kodunun toptancı bazında en iyi teklifleri
function offersFor(rows, key) {
  const o = {};
  for (const d of rows) if (norm(d.stokKodu) === key && d.kdvliFiyat) {
    if (!o[d.toptanciId] || d.kdvliFiyat < o[d.toptanciId].kdvliFiyat)
      o[d.toptanciId] = { toptanciId: d.toptanciId, toptanci: d.toptanci, kdvliFiyat: d.kdvliFiyat, netFiyat: d.netFiyat, stokVar: d.stokVar, depo: d.depo };
  }
  return Object.values(o);
}
const bestOf = offers => offers.filter(o => o.kdvliFiyat > 0).sort((a, b) => a.kdvliFiyat - b.kdvliFiyat)[0];

// Sepet fiyatlarını yeniden sorgula
async function refreshCart(userId, cart, sebep = 'manuel') {
  const degisim = [];
  const cache = {};
  for (const it of cart.items) {
    const q = it.stokKodu;
    cache[q] ||= await searchAll(q);
    const yeni = offersFor(cache[q].sonuclar, it.key);
    if (!yeni.length) continue;
    const eski = bestOf(it.teklifler || []), b = bestOf(yeni);
    if (eski && b && (Math.abs(eski.kdvliFiyat - b.kdvliFiyat) > 0.009 || eski.toptanciId !== b.toptanciId))
      degisim.push(`${it.stokKodu}: ${tl(eski.kdvliFiyat)} (${eski.toptanci}) → ${tl(b.kdvliFiyat)} (${b.toptanci})`);
    it.teklifler = yeni;
  }
  cart.sonYenileme = now(); cart.guncelleme = now(); saveStore();
  if (degisim.length || sebep === 'zamanlanmis')
    notify({ userId, tip: degisim.length ? 'fiyat' : 'bilgi', baslik: `"${cart.ad}" sepeti yeniden sorgulandı`, mesaj: degisim.length ? degisim.slice(0, 6).join('\n') : 'Fiyat değişimi yok.', link: 'sepet:' + cart.id });
  return { degisim };
}

// Takip listesi kontrolü
async function runWatch(userId) {
  const list = store.watch[userId] || [];
  const cache = {};
  for (const w of list) {
    cache[w.stokKodu] ||= await searchAll(w.stokKodu);
    const b = bestOf(offersFor(cache[w.stokKodu].sonuclar, w.key));
    w.sonKontrol = now();
    if (!b) continue;
    const eski = w.sonFiyat, eskiStok = w.stokVar;
    Object.assign(w, { sonFiyat: b.kdvliFiyat, sonToptanci: b.toptanci, stokVar: b.stokVar });
    (w.gecmis ||= []).push({ tarih: now(), fiyat: b.kdvliFiyat, toptanci: b.toptanci });
    w.gecmis = w.gecmis.slice(-60);
    if (eski && b.kdvliFiyat < eski - 0.009)
      notify({ userId, tip: 'fiyat', baslik: `Fiyat düştü: ${w.stokKodu}`, mesaj: `${tl(eski)} → ${tl(b.kdvliFiyat)} (${b.toptanci})`, link: 'takip' });
    if (w.hedefFiyat && b.kdvliFiyat <= w.hedefFiyat && !(eski && eski <= w.hedefFiyat))
      notify({ userId, tip: 'basari', baslik: `Hedef fiyata ulaştı: ${w.stokKodu}`, mesaj: `${tl(b.kdvliFiyat)} ≤ hedef ${tl(w.hedefFiyat)} — ${b.toptanci}`, link: 'takip' });
    if (eskiStok === false && b.stokVar)
      notify({ userId, tip: 'basari', baslik: `Stoğa girdi: ${w.stokKodu}`, mesaj: `${b.toptanci} · ${tl(b.kdvliFiyat)}`, link: 'takip' });
  }
  saveStore();
}

// Kampanyalı / yeni ürün taraması
async function runSpecials() {
  for (const site of config.sites.filter(s => s.aktif && s.username && s.password)) {
    const adapter = adapterOf(site);
    if (!adapter.special) continue;
    for (const tur of ['kampanya', 'yeni']) {
      try {
        const rows = await siteCall(site, (a, s) => a.special(s.page, creds(site), tur), tur + ' taraması');
        const prev = new Set((store.specials[site.id]?.[tur]?.rows || []).map(r => norm(r.stokKodu)));
        const yeniler = prev.size ? rows.filter(r => !prev.has(norm(r.stokKodu))) : [];
        (store.specials[site.id] ||= {})[tur] = { tarih: now(), rows: rows.map(r => ({ ...r, toptanci: site.ad, toptanciId: site.id, yeni: !prev.has(norm(r.stokKodu)) && prev.size > 0 })) };
        if (yeniler.length)
          notify({ tip: 'kampanya', baslik: `${site.ad}: ${yeniler.length} yeni ${tur === 'kampanya' ? 'kampanyalı' : ''} ürün`, mesaj: yeniler.slice(0, 5).map(r => `${r.stokKodu} · ${tl(r.kdvliFiyat)}`).join('\n'), link: 'kampanya' });
      } catch (e) { /* oturum yoksa sessiz geç, bildirim needUserLogin'den gelir */ }
    }
  }
  saveStore();
}

// Günlük zamanlayıcı (Ayarlar → Kontrol saatleri)
async function scheduledRun() {
  await runSpecials();
  for (const userId of Object.keys(store.watch)) await runWatch(userId).catch(() => {});
  for (const [userId, carts] of Object.entries(store.carts))
    for (const c of carts.filter(c => c.takip && c.items.length)) await refreshCart(userId, c, 'zamanlanmis').catch(() => {});
}
setInterval(() => {
  const d = new Date(), hm = d.toTimeString().slice(0, 5), key = d.toDateString() + ' ' + hm;
  const saatler = String(config.ayarlar.kontrolSaatleri).split(',').map(s => s.trim());
  if (saatler.includes(hm) && !store.schedule[key]) { store.schedule = { [key]: true }; saveStore(); scheduledRun(); }
}, 30000);

// ================= Panel oturumu =================
const tokens = new Map();
const parseCookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(x => x[0]));
function auth(req, res, next) {
  const u = users.find(u => u.id === tokens.get(parseCookies(req).tok));
  if (!u || !u.aktif) return res.status(401).json({ error: 'Giriş gerekli' });
  req.user = u; next();
}
const admin = (req, res, next) => req.user.rol === 'admin' ? next() : res.status(403).json({ error: 'Yetkiniz yok' });

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = users.find(u => u.username === String(username || '').trim().toLowerCase());
  if (!u || !checkPw(u, String(password || ''))) return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı' });
  if (!u.aktif) return res.status(403).json({ error: 'Hesabınız pasif' });
  const tok = uid(24); tokens.set(tok, u.id);
  u.sonGiris = now(); saveUsers();
  res.setHeader('Set-Cookie', `tok=${tok}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${60 * 60 * 24 * 7}`);
  res.json(publicUser(u));
});
app.post('/api/logout', (req, res) => { tokens.delete(parseCookies(req).tok); res.setHeader('Set-Cookie', 'tok=; Path=/; Max-Age=0'); res.json({ ok: true }); });
app.get('/api/me', auth, (req, res) => res.json(publicUser(req.user)));
app.post('/api/me/password', auth, (req, res) => {
  const { eski, yeni } = req.body || {};
  if (!checkPw(req.user, String(eski || ''))) return res.status(400).json({ error: 'Mevcut şifre hatalı' });
  if (String(yeni || '').length < 4) return res.status(400).json({ error: 'Yeni şifre en az 4 karakter' });
  Object.assign(req.user, hashPw(yeni)); saveUsers(); res.json({ ok: true });
});

// ---- Üyeler
app.get('/api/users', auth, admin, (req, res) => res.json(users.map(publicUser)));
app.post('/api/users', auth, admin, (req, res) => {
  const b = req.body || {}, username = String(b.username || '').trim().toLowerCase();
  if (!username || !b.ad) return res.status(400).json({ error: 'Kullanıcı adı ve ad zorunlu' });
  let u = users.find(x => x.id === b.id);
  if (users.some(x => x.username === username && x !== u)) return res.status(400).json({ error: 'Bu kullanıcı adı alınmış' });
  if (!u) { if (!b.password) return res.status(400).json({ error: 'Şifre zorunlu' }); u = { id: 'u' + uid(4), olusturma: now() }; users.push(u); }
  if (u.id === req.user.id && (b.rol !== 'admin' || b.aktif === false)) return res.status(400).json({ error: 'Kendi yetkini kaldıramazsın' });
  Object.assign(u, { username, ad: b.ad.trim(), rol: b.rol === 'admin' ? 'admin' : 'kullanici', aktif: b.aktif !== false });
  if (b.password) Object.assign(u, hashPw(b.password));
  saveUsers(); res.json(publicUser(u));
});
app.delete('/api/users/:id', auth, admin, (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Kendini silemezsin' });
  users = users.filter(u => u.id !== req.params.id); saveUsers(); res.json({ ok: true });
});

// ---- Ayarlar
app.get('/api/settings', auth, (req, res) => res.json(config.ayarlar));
app.post('/api/settings', auth, admin, (req, res) => {
  const b = req.body || {}, n = (v, min, max, d) => Math.min(max, Math.max(min, Number(v) || d));
  const saatler = String(b.kontrolSaatleri || '').split(',').map(s => s.trim()).filter(s => /^\d{2}:\d{2}$/.test(s));
  config.ayarlar = {
    keepAliveDk: n(b.keepAliveDk, 1, 60, 8), istekAraligiMs: n(b.istekAraligiMs, 0, 10000, 1500), zamanAsimiSn: n(b.zamanAsimiSn, 10, 120, 45),
    kontrolSaatleri: saatler.join(',') || '09:00,15:00',
    whatsapp: { aktif: !!b.whatsapp?.aktif, numara: String(b.whatsapp?.numara || '').trim() },
  };
  saveConfig(); scheduleKeepAlive(); res.json(config.ayarlar);
});

// ---- Entegrasyonlar
app.get('/api/adapters', auth, (req, res) => res.json(ADAPTERS));
app.get('/api/sites', auth, (req, res) => res.json(config.sites.map(publicSite)));
app.post('/api/sites', auth, admin, async (req, res) => {
  const b = req.body || {};
  if (!b.ad || !b.baseUrl || !ADAPTERS[b.adapter]) return res.status(400).json({ error: 'Ad, adres ve altyapı zorunlu' });
  let site = config.sites.find(s => s.id === b.id);
  if (!site) { site = { id: uid(4), password: '' }; config.sites.push(site); }
  const url = b.baseUrl.trim().replace(/\/+$/, '');
  const degisti = site.username !== (b.username || '').trim() || !!b.password || site.baseUrl !== url || site.adapter !== b.adapter;
  Object.assign(site, { ad: b.ad.trim(), adapter: b.adapter, baseUrl: url, username: (b.username || '').trim(), aktif: b.aktif !== false });
  if (b.password) site.password = b.password;
  saveConfig();
  if (degisti) { await closeSession(site.id, true); delete sessions[site.id]; }
  res.json(publicSite(site));
});
app.delete('/api/sites/:id', auth, admin, async (req, res) => {
  config.sites = config.sites.filter(s => s.id !== req.params.id); saveConfig();
  await closeSession(req.params.id, true); delete sessions[req.params.id]; res.json({ ok: true });
});
app.post('/api/sites/:id/connect', auth, async (req, res) => {
  const site = config.sites.find(s => s.id === req.params.id);
  if (!site) return res.status(404).json({ error: 'Bulunamadı' });
  if (!site.username || !site.password) return res.status(400).json({ error: 'Önce kullanıcı adı ve şifreyi kaydet' });
  if (ADAPTERS[site.adapter]?.interaktif) {
    interactiveConnect(site);
    return res.json({ ok: true, interaktif: true });
  }
  await closeSession(site.id, true);
  const t = Date.now();
  try {
    await withTimeout(enqueue(site, s => doLogin(site, s, 'manuel')), config.ayarlar.zamanAsimiSn * 1000);
    res.json({ ok: true, sure: Date.now() - t });
  } catch (e) { res.json({ ok: false, sure: Date.now() - t, hata: e.message }); }
});
app.get('/api/login-log', auth, (req, res) => res.json(store.loginLog.slice(0, 100)));

// ---- Arama + geçmiş
app.get('/api/search', auth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Arama boş' });
  const result = { id: uid(), userId: req.user.id, kullanici: req.user.ad, ...(await searchAll(q)) };
  store.history.unshift(result); store.history.length = Math.min(store.history.length, 200); saveStore();
  res.json(result);
});
const visibleHistory = req => req.user.rol === 'admin' && req.query.hepsi ? store.history : store.history.filter(h => h.userId === req.user.id);
app.get('/api/history', auth, (req, res) => res.json(visibleHistory(req).map(({ sonuclar, ...h }) => ({ ...h, adet: sonuclar.length, stokta: sonuclar.filter(r => r.stokVar).length }))));
app.get('/api/history/:id', auth, (req, res) => {
  const h = store.history.find(h => h.id === req.params.id && (h.userId === req.user.id || req.user.rol === 'admin'));
  h ? res.json(h) : res.status(404).json({ error: 'Bulunamadı' });
});
app.delete('/api/history', auth, (req, res) => { store.history = store.history.filter(h => h.userId !== req.user.id); saveStore(); res.json({ ok: true }); });

// ---- Sepetler (birden fazla)
const myCarts = req => (store.carts[req.user.id] ||= []);
const findCart = req => myCarts(req).find(c => c.id === req.params.id);
app.get('/api/carts', auth, (req, res) => res.json(myCarts(req)));
app.post('/api/carts', auth, (req, res) => {
  const c = { id: uid(4), ad: String(req.body?.ad || 'Yeni sepet').slice(0, 60), items: [], takip: false, olusturma: now(), guncelleme: now() };
  myCarts(req).push(c); saveStore(); res.json(c);
});
app.put('/api/carts/:id', auth, (req, res) => {
  const c = findCart(req); if (!c) return res.status(404).json({ error: 'Sepet yok' });
  const b = req.body || {};
  if (b.ad != null) c.ad = String(b.ad).slice(0, 60);
  if (b.takip != null) c.takip = !!b.takip;
  if (Array.isArray(b.items)) c.items = b.items.slice(0, 300);
  c.guncelleme = now(); saveStore(); res.json(c);
});
app.delete('/api/carts/:id', auth, (req, res) => { store.carts[req.user.id] = myCarts(req).filter(c => c.id !== req.params.id); saveStore(); res.json({ ok: true }); });
app.post('/api/carts/:id/refresh', auth, async (req, res) => {
  const c = findCart(req); if (!c) return res.status(404).json({ error: 'Sepet yok' });
  const r = await refreshCart(req.user.id, c); res.json({ ...r, cart: c });
});

// ---- Takip listesi
const myWatch = req => (store.watch[req.user.id] ||= []);
app.get('/api/watch', auth, (req, res) => res.json(myWatch(req)));
app.post('/api/watch', auth, (req, res) => {
  const b = req.body || {}, key = norm(b.stokKodu);
  if (!key) return res.status(400).json({ error: 'Stok kodu yok' });
  let w = myWatch(req).find(x => x.key === key);
  if (!w) { w = { id: uid(4), key, stokKodu: b.stokKodu, marka: b.marka, urunAdi: b.urunAdi, eklendi: now(), gecmis: [] }; myWatch(req).push(w); }
  Object.assign(w, { hedefFiyat: Number(b.hedefFiyat) || w.hedefFiyat || null });
  if (b.fiyat && !w.sonFiyat) Object.assign(w, { sonFiyat: b.fiyat, sonToptanci: b.toptanci, stokVar: b.stokVar, gecmis: [{ tarih: now(), fiyat: b.fiyat, toptanci: b.toptanci }] });
  saveStore(); res.json(w);
});
app.put('/api/watch/:id', auth, (req, res) => {
  const w = myWatch(req).find(x => x.id === req.params.id); if (!w) return res.status(404).json({ error: 'Yok' });
  w.hedefFiyat = Number(req.body?.hedefFiyat) || null; saveStore(); res.json(w);
});
app.delete('/api/watch/:id', auth, (req, res) => { store.watch[req.user.id] = myWatch(req).filter(x => x.id !== req.params.id); saveStore(); res.json({ ok: true }); });
app.post('/api/watch/run', auth, async (req, res) => { await runWatch(req.user.id); res.json(myWatch(req)); });

// ---- Kampanyalar & yeni ürünler
app.get('/api/specials', auth, (req, res) => res.json(store.specials));
app.post('/api/specials/run', auth, async (req, res) => { await runSpecials(); res.json(store.specials); });

// ---- Bildirimler
const myNotifs = req => store.notifs.filter(n => !n.userId || n.userId === req.user.id);
app.get('/api/notifications', auth, (req, res) =>
  res.json(myNotifs(req).slice(0, 80).map(({ okuyan, ...n }) => ({ ...n, okundu: okuyan.includes(req.user.id) }))));
app.post('/api/notifications/read', auth, (req, res) => {
  for (const n of myNotifs(req)) if ((!req.body?.id || n.id === req.body.id) && !n.okuyan.includes(req.user.id)) n.okuyan.push(req.user.id);
  saveStore(); res.json({ ok: true });
});

// ---- Panel istatistikleri
app.get('/api/dashboard', auth, (req, res) => {
  const bugun = new Date().toDateString();
  const mine = store.history.filter(h => h.userId === req.user.id);
  const today = store.history.filter(h => new Date(h.tarih).toDateString() === bugun);
  const kazanan = {};
  for (const h of today) {
    const byCode = {};
    for (const r of h.sonuclar) if (r.kdvliFiyat) { const k = norm(r.stokKodu); if (!byCode[k] || r.kdvliFiyat < byCode[k].kdvliFiyat) byCode[k] = r; }
    for (const r of Object.values(byCode)) kazanan[r.toptanci] = (kazanan[r.toptanci] || 0) + 1;
  }
  const sp = Object.values(store.specials).flatMap(s => [...(s.kampanya?.rows || []), ...(s.yeni?.rows || [])]);
  res.json({
    bugunArama: today.length, toplamArama: mine.length,
    ortSure: today.length ? Math.round(today.reduce((a, h) => a + h.sure, 0) / today.length) : 0,
    sepet: myCarts(req).reduce((a, c) => a + c.items.length, 0), sepetSayi: myCarts(req).length,
    takip: myWatch(req).length, kampanya: sp.length,
    bagli: config.sites.filter(s => sessions[s.id]?.durum === 'bagli').length, toptanci: config.sites.filter(s => s.aktif).length,
    kazanan, kontrolSaatleri: config.ayarlar.kontrolSaatleri, whatsapp: config.ayarlar.whatsapp,
    sonAramalar: mine.slice(0, 8).map(({ sonuclar, ...h }) => ({ ...h, adet: sonuclar.length })),
  });
});

(async () => {
  browser = await chromium.launch({ headless });
  app.listen(PORT, () => console.log(`hype vision Parça-AI hazır: http://localhost:${PORT}`));
  scheduleKeepAlive();
  keepAliveAll();
})();
