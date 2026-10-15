// ================= yardımcılar =================
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tl = n => n ? n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺' : '—';
const ic = (n, cls = '') => `<svg class="i ${cls}"><use href="#i-${n}"/></svg>`;
const norm = s => String(s || '').toLocaleUpperCase('tr').replace(/[^A-Z0-9]/g, '');
const ago = d => { const s = (Date.now() - new Date(d)) / 1000; return s < 60 ? 'az önce' : s < 3600 ? `${Math.floor(s / 60)} dk önce` : s < 86400 ? `${Math.floor(s / 3600)} sa önce` : new Date(d).toLocaleDateString('tr-TR'); };
const ls = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const toast = m => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 2600); };

async function api(url, opt = {}) {
  const r = await fetch(url, { ...opt, headers: { 'Content-Type': 'application/json' }, body: opt.body && JSON.stringify(opt.body) });
  if (r.status === 401 && !url.endsWith('/login')) { showLogin(); throw new Error('Oturum kapandı'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Hata');
  return j;
}

// ================= durum =================
const S = { me: null, page: 'panel', last: null, carts: [], cartId: null, watch: [], sites: [], sortK: 'kdvliFiyat', sortDir: 1 };
const activeCart = () => S.carts.find(c => c.id === S.cartId) || S.carts[0];
Object.defineProperty(S, 'cart', { get: () => activeCart()?.items || [], set: v => { const c = activeCart(); if (c) c.items = v; } });

// ================= tema =================
function applyTheme(v) {
  const dark = v === 'dark' || (v === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
applyTheme(ls.get('theme', 'light'));
$('#themeBtn').onclick = () => { const v = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; ls.set('theme', v); applyTheme(v); };

// ================= giriş =================
function showLogin() { $('#login').classList.remove('hidden'); $('#app').classList.add('hidden'); }
$('#loginForm').onsubmit = async e => {
  e.preventDefault(); $('#lerr').textContent = '';
  try { boot(await api('/api/login', { method: 'POST', body: { username: $('#lu').value, password: $('#lp').value } })); }
  catch (err) { $('#lerr').textContent = err.message; }
};
$('#logoutBtn').onclick = async () => { await api('/api/logout', { method: 'POST' }); showLogin(); };

async function boot(me) {
  S.me = me;
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  $('#meName').textContent = me.ad; $('#meAv').textContent = me.ad[0].toUpperCase();
  $('#meRole').textContent = me.rol === 'admin' ? 'Yönetici' : 'Kullanıcı';
  $$('.admin-only').forEach(e => e.classList.toggle('hidden', me.rol !== 'admin'));
  await loadCarts(); await loadWatch();
  refreshSites(); loadNotifs();
  go(location.hash.slice(1) || 'panel');
}
async function loadCarts() {
  S.carts = await api('/api/carts');
  if (!S.carts.length) S.carts.push(await api('/api/carts', { method: 'POST', body: { ad: 'Ana sepet' } }));
  if (!S.carts.some(c => c.id === S.cartId)) S.cartId = ls.get('cartId', null);
  if (!S.carts.some(c => c.id === S.cartId)) S.cartId = S.carts[0].id;
  updateCartCnt();
}
async function loadWatch() { S.watch = await api('/api/watch'); $('#watchCnt').textContent = S.watch.length; }

// ================= bildirimler =================
let notifs = [];
const NI = { fiyat: ['g', 'tl'], basari: ['g', 'check'], uyari: ['o', 'bell'], kampanya: ['v', 'tag'], bilgi: ['b', 'bell'] };
async function loadNotifs() {
  if (!S.me) return;
  notifs = await api('/api/notifications').catch(() => notifs);
  const n = notifs.filter(x => !x.okundu).length;
  $$('.bdot').forEach(d => { d.classList.toggle('hidden', !n); d.textContent = n > 9 ? '9+' : n; });
  $('#nlist').innerHTML = notifs.length ? notifs.map(x => { const [c, i] = NI[x.tip] || NI.bilgi; return `
    <div class="ni ${x.okundu ? '' : 'unread'}" data-n="${x.id}" data-link="${esc(x.link)}"><div class="ic ${c}">${ic(i)}</div>
      <div style="min-width:0"><div class="t">${esc(x.baslik)}</div>${x.mesaj ? `<div class="m">${esc(x.mesaj)}</div>` : ''}<div class="d">${ago(x.tarih)}</div></div></div>`; }).join('')
    : `<div class="empty">${ic('bell')}<div>Bildirim yok</div></div>`;
  $$('#nlist [data-n]').forEach(el => el.onclick = async () => {
    await api('/api/notifications/read', { method: 'POST', body: { id: el.dataset.n } });
    const l = el.dataset.link; $('#npanel').classList.add('hidden');
    if (l.startsWith('sepet:')) { S.cartId = l.slice(6); go('sepet'); } else if (l) go(l);
    loadNotifs();
  });
}
setInterval(loadNotifs, 20000);
document.addEventListener('click', e => {
  if (e.target.closest('.bell-btn')) { $('#npanel').classList.toggle('hidden'); return; }
  if (!e.target.closest('#npanel')) $('#npanel').classList.add('hidden');
});
$('#readAll').onclick = async () => { await api('/api/notifications/read', { method: 'POST', body: {} }); loadNotifs(); };
api('/api/me').then(boot).catch(showLogin);

async function refreshSites() {
  S.sites = await api('/api/sites').catch(() => S.sites);
  $('#supCnt').textContent = `${S.sites.filter(s => s.durum === 'bagli').length}/${S.sites.filter(s => s.aktif).length}`;
}
setInterval(() => S.me && refreshSites(), 30000);

// ================= yönlendirme =================
const PAGES = {};
function go(p) {
  if (!PAGES[p] || (p === 'uyeler' && S.me.rol !== 'admin')) p = 'panel';
  S.page = p; location.hash = p;
  $$('.nav').forEach(n => n.classList.toggle('on', n.dataset.go === p));
  $('#side').classList.remove('open');
  PAGES[p]();
  window.scrollTo(0, 0);
}
document.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go); });
$('#menuBtn').onclick = () => $('#side').classList.toggle('open');
const view = html => { $('#view').innerHTML = html; };

// ================= modal =================
function modal(html) { $('#modalBody').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); }
$('#modal').onclick = e => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); };

// ================= durum rozetleri =================
const DURUM = {
  bagli: ['ok', 'Bağlı'], baglaniyor: ['warn', 'Bağlanıyor'], bekliyor: ['mut', 'Bekliyor'],
  hata: ['bad', 'Bağlantı koptu'], eksik: ['warn', 'Bilgi eksik'],
  'giris-gerekli': ['warn', 'Giriş gerekli'], 'giris-bekliyor': ['blue', 'Pencerede giriş bekleniyor'],
};
const durumBadge = s => { const [c, t] = s.aktif === false ? ['mut', 'Pasif'] : DURUM[s.durum] || DURUM.bekliyor; return `<span class="badge ${c}"><span class="dot ${s.durum === 'baglaniyor' ? 'pulse' : ''}"></span>${t}</span>`; };

// =====================================================================
// PANEL
// =====================================================================
PAGES.panel = async () => {
  view(`<div class="skel" style="height:260px;border-radius:24px"></div>`);
  const d = await api('/api/dashboard');
  const saat = new Date().getHours();
  const selam = saat < 12 ? 'Günaydın' : saat < 18 ? 'İyi günler' : 'İyi akşamlar';
  const kaz = Object.entries(d.kazanan).sort((a, b) => b[1] - a[1]);
  const kazMax = Math.max(1, ...kaz.map(k => k[1]));
  view(`
  <section class="hero mb">
    <div>
      <span class="chip-s">${selam} ${esc(S.me.ad)}</span>
      <h2>Bugün hangi parçayı arıyoruz?</h2>
      <p>Parça no, OEM veya ürün adını yaz; tüm toptancılarda aynı anda arayıp en ucuz ve stokta olanı bulalım.</p>
      <form class="sbox" id="heroForm">
        ${ic('search')}
        <input id="heroQ" placeholder="Parça no · örn. 2N1115201" autocomplete="off">
        <button class="btn btn-dark">${ic('search')}Ara</button>
      </form>
    </div>
    <div class="hstats">
      <div class="hs"><div class="ic t">${ic('plug')}</div><div><b>${d.bagli}/${d.toptanci}</b><small>Bağlı toptancı</small></div></div>
      <div class="hs"><div class="ic b">${ic('search')}</div><div><b>${d.bugunArama}</b><small>Bugünkü arama</small></div></div>
      <div class="hs"><div class="ic g">${ic('bolt')}</div><div><b>${d.ortSure ? (d.ortSure / 1000).toFixed(1) + 's' : '—'}</b><small>Ort. arama süresi</small></div></div>
      <div class="hs"><div class="ic v">${ic('cart')}</div><div><b>${d.sepet}</b><small>Sipariş planında</small></div></div>
    </div>
  </section>

  <div class="g2 mb">
    <div class="card">
      <div class="ch"><div><span class="badge ok"><span class="dot"></span>Otomatik bağlantı açık</span><h3 style="margin-top:10px">Toptancılar</h3><div class="sub">Oturumlar arka planda açık tutulur, koparsa otomatik yeniden bağlanır.</div></div>
        <button class="btn btn-sm" data-go="entegrasyon">Yönet →</button></div>
      <div class="list">${S.sites.map(s => `
        <div class="sup"><div class="ic t">${ic('store')}</div>
          <div style="flex:1;min-width:0"><div class="n">${esc(s.ad)}</div><div class="s">${s.sonKontrol ? 'Son kontrol ' + ago(s.sonKontrol) : esc(s.baseUrl)}</div></div>
          ${durumBadge(s)}</div>`).join('') || '<div class="empty">Henüz toptancı yok</div>'}</div>
    </div>
    <div class="card">
      <div class="ch"><div><h3>Bugün en ucuzu kim verdi?</h3><div class="sub">Bugünkü aramalarda ürün bazında en düşük fiyatı veren toptancılar</div></div></div>
      ${kaz.length ? kaz.map(([n, v]) => `<div class="hbar"><span class="l">${esc(n)}</span><span class="b"><i style="width:${v / kazMax * 100}%"></i></span><span class="v">${v} ürün</span></div>`).join('')
        : `<div class="empty">${ic('spark')}<div>Arama yaptıkça burada analiz görünecek</div></div>`}
    </div>
  </div>

  ${S.sites.filter(s => s.durum === 'giris-gerekli').map(s => `
  <div class="row mb" style="border-color:var(--warn);background:var(--warnbg)"><div class="ic o">${ic('bell')}</div>
    <div class="grow"><div class="t">${esc(s.ad)} oturumu kapalı</div><div class="s">Doğrulama kodu gerektiği için girişi senin yapman gerekiyor. Bir kez giriş yap, oturum açık tutulur.</div></div>
    <button class="btn btn-dark btn-sm" data-go="entegrasyon">Bağlan</button></div>`).join('')}
  <div class="g4 mb">
    <div class="stat" data-go="takip" style="cursor:pointer"><div class="ic t">${ic('eye')}</div><b>${d.takip}</b><small>Takipteki ürün</small></div>
    <div class="stat" data-go="sepet" style="cursor:pointer"><div class="ic v">${ic('cart')}</div><b>${d.sepetSayi}</b><small>Sepet · ${d.sepet} kalem</small></div>
    <div class="stat" data-go="kampanya" style="cursor:pointer"><div class="ic o">${ic('tag')}</div><b>${d.kampanya}</b><small>Kampanya & yeni ürün</small></div>
    <div class="stat"><div class="ic b">${ic('clock')}</div><b style="font-size:18px">${esc(d.kontrolSaatleri)}</b><small>Otomatik kontrol saatleri</small></div>
  </div>
  <div class="wa mb">
    <div class="ic">${ic('wa')}</div>
    <div style="flex:1;min-width:220px"><b>Bildirimler WhatsApp'a da gelsin</b>
      <p>Fiyat düşünce, ürün stoğa girince, yeni kampanya çıkınca ya da bir toptancının oturumu kapanınca anında WhatsApp mesajı — entegre edilebilir.</p></div>
    <button class="btn" style="background:#fff;color:#0f9d58;border:0" data-go="ayarlar">${d.whatsapp?.numara ? 'Numara kayıtlı' : 'Numara ekle'}</button>
  </div>
  <div class="card">
    <div class="ch"><div><h3>Son aramalar</h3><div class="sub">Kaldığın yerden devam et</div></div><button class="btn btn-sm" data-go="gecmis">Tümü →</button></div>
    ${d.sonAramalar.length ? `<div class="g4">${d.sonAramalar.map(h => `
      <div class="rc" data-hist="${h.id}">
        <div style="display:flex;justify-content:space-between;align-items:center"><span class="q">${esc(h.q)}</span>${h.firmalar.every(f => f.ok) ? '<span class="badge ok">Tamam</span>' : '<span class="badge warn">Kısmi</span>'}</div>
        <div class="m"><span>${h.adet} sonuç · ${ago(h.tarih)}</span><span class="p">${tl(h.enUcuz)}</span></div>
      </div>`).join('')}</div>` : `<div class="empty">${ic('clock')}<div>Henüz arama yok</div></div>`}
  </div>`);
  $('#heroForm').onsubmit = e => { e.preventDefault(); const q = $('#heroQ').value.trim(); if (q) { go('ara'); search(q); } };
  $$('[data-hist]').forEach(c => c.onclick = () => openHistory(c.dataset.hist));
};

// =====================================================================
// ARAMA
// =====================================================================
PAGES.ara = () => {
  view(`
  <div class="ph"><div><h1>Parça Ara</h1><p>Tüm aktif toptancılarda paralel arama</p></div></div>
  <div class="card mb">
    <form class="sbox" id="sf" style="box-shadow:none">
      ${ic('search')}<input id="q" placeholder="Parça no, OEM veya ürün adı" autocomplete="off" value="${esc(S.last?.q || '')}">
      <button class="btn btn-dark" id="sbtn">Ara</button>
    </form>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px" id="recent"></div>
  </div>
  <div id="result">${S.last ? '' : `<div class="card empty">${ic('search')}<div>Aramak istediğin parçayı yaz</div></div>`}</div>`);
  const rec = ls.get('recent', []);
  $('#recent').innerHTML = rec.length ? `<span class="small muted" style="align-self:center">Son:</span>` + rec.map(q => `<button class="btn btn-xs" data-q="${esc(q)}">${esc(q)}</button>`).join('') : '';
  $$('#recent [data-q]').forEach(b => b.onclick = () => search(b.dataset.q));
  $('#sf').onsubmit = e => { e.preventDefault(); search($('#q').value.trim()); };
  if (S.last) renderResult(); else $('#q').focus();
};

async function search(q) {
  if (!q) return;
  if (S.page !== 'ara') go('ara');
  $('#q').value = q;
  ls.set('recent', [q, ...ls.get('recent', []).filter(x => x !== q)].slice(0, 8));
  const b = $('#sbtn'); b.disabled = true; b.innerHTML = '<span class="spin"></span>Aranıyor';
  $('#result').innerHTML = `<div class="card"><div class="small muted mb">${S.sites.filter(s => s.aktif).map(s => esc(s.ad)).join(' · ')} aranıyor…</div>${'<div class="skel"></div>'.repeat(7)}</div>`;
  try { S.last = await api('/api/search?q=' + encodeURIComponent(q)); renderResult(); refreshSites(); }
  catch (err) { $('#result').innerHTML = `<div class="card empty">${esc(err.message)}</div>`; }
  finally { b.disabled = false; b.textContent = 'Ara'; }
}

function renderResult() {
  const r = S.last, data = r.sonuclar;
  const stokta = data.filter(d => d.stokVar && d.kdvliFiyat);
  const ucuzStok = stokta.sort((a, b) => a.kdvliFiyat - b.kdvliFiyat)[0];
  $('#result').innerHTML = `
  <div class="g5 mb">
    <div class="stat"><div class="ic b">${ic('box')}</div><b>${data.length}</b><small>Sonuç</small></div>
    <div class="stat"><div class="ic g">${ic('tl')}</div><b>${tl(r.enUcuz)}</b><small>En ucuz</small></div>
    <div class="stat"><div class="ic t">${ic('check')}</div><b>${ucuzStok ? tl(ucuzStok.kdvliFiyat) : '—'}</b><small>En ucuz (stokta)</small></div>
    <div class="stat"><div class="ic o">${ic('tl')}</div><b>${tl(r.enPahali)}</b><small>En pahalı</small></div>
    <div class="stat"><div class="ic v">${ic('bolt')}</div><b>${(r.sure / 1000).toFixed(1)}s</b><small>${r.firmalar.filter(f => f.ok).length}/${r.firmalar.length} toptancı</small></div>
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap" class="mb">${r.firmalar.map(f => `<span class="badge ${f.ok ? 'ok' : 'bad'}" title="${esc(f.hata || '')}">${f.ok ? '✓' : '✗'} ${esc(f.ad)} · ${f.ok ? f.adet + ' ürün · ' + (f.sure / 1000).toFixed(1) + 's' : esc(f.hata)}</span>`).join('') || '<span class="badge warn">Aktif toptancı yok — Entegrasyonlar\'dan ekle</span>'}</div>
  <div class="card">
    <div class="tools">
      <input class="inp" id="flt" placeholder="Sonuçlarda filtrele…">
      <select class="mini" id="fSup"><option value="">Tüm toptancılar</option>${r.firmalar.filter(f => f.ok).map(f => `<option>${esc(f.ad)}</option>`).join('')}</select>
      <label class="tg"><input type="checkbox" id="fStock" ${ls.get('optStock', false) ? 'checked' : ''}>Stokta olanlar</label>
      <label class="tg"><input type="checkbox" id="fZero" ${ls.get('optZero', true) ? 'checked' : ''}>0 ₺ gizle</label>
      <span style="flex:1"></span><span class="small muted" id="cnt"></span>
      <select class="mini" id="cartSel" title="Ürünlerin ekleneceği sepet">${S.carts.map(c => `<option value="${c.id}" ${c.id === activeCart()?.id ? 'selected' : ''}>🛒 ${esc(c.ad)}</option>`).join('')}</select>
      <button class="btn btn-sm" id="xls">${ic('down')}Excel</button>
      <button class="btn btn-sm" id="pdf">${ic('file')}PDF</button>
      <button class="btn btn-sm" id="rep">${ic('spark')}AI Rapor</button>
    </div>
    <div class="tw"><table>
      <thead><tr>
        <th data-k="stokKodu">Stok Kodu</th><th data-k="oem" class="hide-m">OEM</th><th data-k="marka">Marka</th>
        <th data-k="urunAdi">Ürün</th><th data-k="stokVar">Stok</th><th data-k="toptanci">Toptancı</th>
        <th data-k="netFiyat" class="num hide-m">Net</th><th data-k="kdvliFiyat" class="num">KDV'li ▲</th><th></th>
      </tr></thead><tbody id="tb"></tbody></table></div>
  </div>`;
  ['#flt', '#fStock', '#fZero', '#fSup'].forEach(s => $(s).oninput = renderRows);
  $$('#result th[data-k]').forEach(th => th.onclick = () => {
    const k = th.dataset.k; S.sortDir = S.sortK === k ? -S.sortDir : 1; S.sortK = k;
    $$('#result th').forEach(t => t.textContent = t.textContent.replace(/ [▲▼]$/, '')); th.textContent += S.sortDir > 0 ? ' ▲' : ' ▼'; renderRows();
  });
  $('#xls').onclick = () => exportXlsx(filtered().map(rowOut), `arama_${r.q}`);
  $('#pdf').onclick = () => exportPdf(`Arama: ${r.q}`, `${new Date(r.tarih).toLocaleString('tr-TR')} · ${data.length} sonuç`, ['Stok Kodu', 'Marka', 'Ürün', 'Stok', 'Toptancı', "KDV'li"],
    filtered().map(d => [d.stokKodu, d.marka, d.urunAdi, d.stokVar ? 'Var' : 'Yok', d.toptanci, tl(d.kdvliFiyat)]));
  $('#rep').onclick = () => { S.reportId = r.id; go('rapor'); };
  $('#cartSel').onchange = e => { S.cartId = e.target.value; ls.set('cartId', S.cartId); updateCartCnt(); renderRows(); };
  renderRows();
}

function filtered() {
  const f = $('#flt').value.toLocaleLowerCase('tr'), sup = $('#fSup').value;
  ls.set('optStock', $('#fStock').checked); ls.set('optZero', $('#fZero').checked);
  return S.last.sonuclar.filter(d => (!$('#fStock').checked || d.stokVar) && (!$('#fZero').checked || d.kdvliFiyat > 0) && (!sup || d.toptanci === sup) &&
    (!f || [d.stokKodu, d.oem, d.marka, d.urunAdi, d.toptanci, d.arac].join(' ').toLocaleLowerCase('tr').includes(f)))
    .sort((a, b) => {
      let x = a[S.sortK], y = b[S.sortK];
      if (typeof x === 'number') { x = x || Infinity; y = y || Infinity; return (x - y) * S.sortDir; }
      if (typeof x === 'boolean') return (y - x) * S.sortDir;
      return String(x).localeCompare(String(y), 'tr') * S.sortDir;
    });
}
const rowOut = d => ({ 'Stok Kodu': d.stokKodu, OEM: d.oem, Marka: d.marka, 'Ürün': d.urunAdi, 'Araç': d.arac, Stok: d.stokVar ? 'Var' : 'Yok', Depo: d.depo, 'Toptancı': d.toptanci, 'Liste': d.listeFiyat, 'Net': d.netFiyat, "KDV'li": d.kdvliFiyat });

function renderRows() {
  const rows = filtered(), min = Math.min(...rows.map(r => r.kdvliFiyat || Infinity));
  $('#cnt').textContent = `${rows.length} / ${S.last.sonuclar.length}`;
  const inCart = new Set(S.cart.map(c => c.key)), watched = new Set(S.watch.map(w => w.key));
  $('#tb').innerHTML = rows.length ? rows.map(d => {
    const i = S.last.sonuclar.indexOf(d), k = norm(d.stokKodu);
    return `<tr class="${d.kdvliFiyat && d.kdvliFiyat === min ? 'best' : ''}">
    <td class="mono"><b>${esc(d.stokKodu)}</b></td><td class="mono hide-m muted">${esc(d.oem)}</td><td><b>${esc(d.marka)}</b></td>
    <td>${esc(d.urunAdi)}${d.arac ? `<div class="small muted">${esc(d.arac)}</div>` : ''}</td>
    <td title="${esc(d.depo)}"><span class="badge ${d.stokVar ? 'ok' : 'mut'}">${d.stokVar ? 'Var' : 'Yok'}</span></td>
    <td><span class="badge teal">${esc(d.toptanci)}</span></td>
    <td class="num hide-m muted">${tl(d.netFiyat)}</td><td class="num price">${tl(d.kdvliFiyat)}</td>
    <td style="white-space:nowrap">${d.kdvliFiyat ? `<button class="btn btn-xs ${inCart.has(k) ? '' : 'btn-dark'}" data-add="${i}">${inCart.has(k) ? ic('check') + 'Sepette' : ic('plus') + 'Sepete'}</button>` : ''}
      <button class="btn btn-xs ${watched.has(k) ? 'btn-cyan' : ''}" data-watch="${i}" title="Takip et">${ic('eye')}</button></td></tr>`;
  }).join('') : `<tr><td colspan="9" class="empty">Sonuç yok</td></tr>`;
  $$('[data-add]').forEach(b => b.onclick = () => addToCart(S.last.sonuclar[+b.dataset.add]));
  $$('[data-watch]').forEach(b => b.onclick = () => addWatch(S.last.sonuclar[+b.dataset.watch]));
}

// =====================================================================
// SEPET / SİPARİŞ PLANI
// =====================================================================
function updateCartCnt() {
  const c = activeCart();
  $('#cartCnt').textContent = S.carts.reduce((a, c) => a + c.items.length, 0);
  $('#topCart').textContent = c ? `${c.ad} · ${c.items.length}` : 'Sepet';
}
async function saveCart() { updateCartCnt(); const c = activeCart(); if (c) await api('/api/carts/' + c.id, { method: 'PUT', body: { items: c.items } }); }

// Aynı stok koduna sahip tüm toptancı teklifleri (toptancı başına en ucuz)
function offersOf(rows, key) {
  const offers = {};
  for (const d of rows) if (norm(d.stokKodu) === key && d.kdvliFiyat) {
    if (!offers[d.toptanciId] || d.kdvliFiyat < offers[d.toptanciId].kdvliFiyat)
      offers[d.toptanciId] = { toptanciId: d.toptanciId, toptanci: d.toptanci, kdvliFiyat: d.kdvliFiyat, netFiyat: d.netFiyat, stokVar: d.stokVar, depo: d.depo };
  }
  return Object.values(offers);
}
function putInCart(row, rows, q, adet = 1) {
  const key = norm(row.stokKodu), teklifler = offersOf(rows, key);
  const ex = S.cart.find(c => c.key === key);
  if (ex) { ex.adet += adet; ex.teklifler = teklifler; }
  else S.cart.push({ key, stokKodu: row.stokKodu, marka: row.marka, urunAdi: row.urunAdi, oem: row.oem, q, adet, secili: '', teklifler, eklendi: new Date().toISOString() });
}
function addToCart(row) {
  putInCart(row, S.last.sonuclar, S.last.q);
  saveCart(); renderRows();
  toast(`${row.stokKodu} → "${activeCart().ad}" sepetine eklendi`);
}
async function addWatch(row) {
  const v = prompt(`${row.stokKodu} takibe alınıyor.\nHedef fiyat (KDV'li, boş bırakabilirsin):`, '');
  if (v === null) return;
  await api('/api/watch', { method: 'POST', body: { stokKodu: row.stokKodu, marka: row.marka, urunAdi: row.urunAdi, hedefFiyat: parseFloat(String(v).replace(',', '.')) || null, fiyat: row.kdvliFiyat, toptanci: row.toptanci, stokVar: row.stokVar } });
  await loadWatch(); renderRows(); toast(`${row.stokKodu} takip listesine eklendi`);
}

function computePlan(items, stokOnce) {
  const lines = items.map(it => {
    let offers = it.teklifler.filter(o => o.kdvliFiyat > 0);
    if (stokOnce && offers.some(o => o.stokVar)) offers = offers.filter(o => o.stokVar);
    const best = offers.slice().sort((a, b) => a.kdvliFiyat - b.kdvliFiyat)[0];
    const chosen = (it.secili && it.teklifler.find(o => o.toptanciId === it.secili)) || best;
    const max = Math.max(...it.teklifler.map(o => o.kdvliFiyat));
    return { it, chosen, best, max };
  });
  const groups = {};
  for (const l of lines) if (l.chosen) (groups[l.chosen.toptanci] ||= []).push(l);
  const toplam = lines.reduce((a, l) => a + (l.chosen ? l.chosen.kdvliFiyat * l.it.adet : 0), 0);
  const enPahali = lines.reduce((a, l) => a + (l.chosen ? l.max * l.it.adet : 0), 0);
  // Tek toptancıdan alsaydık
  const supIds = [...new Set(items.flatMap(i => i.teklifler.map(o => o.toptanci)))];
  const tek = supIds.map(s => {
    let t = 0, eksik = 0;
    for (const it of items) { const o = it.teklifler.find(o => o.toptanci === s); if (o) t += o.kdvliFiyat * it.adet; else eksik++; }
    return { s, t, eksik };
  }).sort((a, b) => a.eksik - b.eksik || a.t - b.t);
  return { lines, groups, toplam, enPahali, tek };
}

PAGES.sepet = () => {
  const stokOnce = ls.get('stokOnce', true);
  const P = computePlan(S.cart, stokOnce);
  const tekTam = P.tek.find(t => !t.eksik);
  const tasarruf = tekTam ? tekTam.t - P.toplam : P.enPahali - P.toplam;
  const C = activeCart();
  const cartTotal = c => computePlan(c.items, stokOnce).toplam;
  view(`
  <div class="ph"><div><h1>Sepetler & Sipariş Planı</h1><p>Birden fazla sepet oluştur; sistem her ürünü en ucuz toptancıdan alacak şekilde dağıtır</p></div>
    <button class="btn btn-dark no-print" id="newCart">${ic('plus')}Yeni sepet</button></div>
  <div class="g4 mb no-print">${S.carts.map(c => `
    <div class="cartcard ${c.id === C.id ? 'on' : ''}" data-cart="${c.id}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>${esc(c.ad)}</b>${c.takip ? `<span class="badge teal">${ic('eye')}Takipte</span>` : ''}</div>
      <div style="font-size:22px;font-weight:800;margin-top:10px;letter-spacing:-.6px">${tl(cartTotal(c))}</div>
      <div class="small muted" style="margin-top:4px">${c.items.length} kalem · ${c.sonYenileme ? 'sorgu ' + ago(c.sonYenileme) : 'henüz sorgulanmadı'}</div>
    </div>`).join('')}</div>
  <div class="card mb no-print"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
    <b style="font-size:16px;margin-right:6px">${esc(C.ad)}</b>
    <button class="btn btn-sm btn-dark" id="cRefresh">${ic('refresh')}Fiyatları yeniden sorgula</button>
    <label class="tg"><input type="checkbox" id="cTakip" ${C.takip ? 'checked' : ''}>Günlük takip et (fiyat değişince bildir)</label>
    <label class="tg"><input type="checkbox" id="stokOnce" ${stokOnce ? 'checked' : ''}>Stokta olanı önceliklendir</label>
    <span style="flex:1"></span>
    <button class="btn btn-sm" id="cRen">${ic('edit')}Adını değiştir</button>
    <button class="btn btn-sm" id="pXls">${ic('down')}Excel</button><button class="btn btn-sm" id="pPdf">${ic('file')}PDF</button>
    <button class="btn btn-sm btn-danger" id="pClr">${ic('trash')}Boşalt</button>
    ${S.carts.length > 1 ? `<button class="btn btn-sm btn-danger" id="cDel">Sepeti sil</button>` : ''}</div>
    <div class="small muted" id="cMsg" style="margin-top:8px"></div></div>
  ${!S.cart.length ? `<div class="card empty">${ic('cart')}<div>Sepet boş. Arama sonuçlarında <b>Sepete</b>'ye basarak ürün ekle.</div><button class="btn btn-dark" style="margin-top:14px" data-go="ara">Parça ara</button></div>` : `
  <div class="saving mb">
    <div><small>Optimize toplam (KDV'li)</small><b>${tl(P.toplam)}</b><small>${S.cart.length} kalem · ${Object.keys(P.groups).length} toptancı</small></div>
    <div><small>${tekTam ? `Tek toptancıdan (${esc(tekTam.s)}) alsaydın` : 'En pahalı seçeneklere göre'}</small><b>${tl(tekTam ? tekTam.t : P.enPahali)}</b></div>
    <div><small>Tasarruf</small><b style="color:#7ff0ff">${tl(Math.max(0, tasarruf))}</b><small>%${(Math.max(0, tasarruf) / Math.max(1, tekTam ? tekTam.t : P.enPahali) * 100).toFixed(1)}</small></div>
  </div>
  <div class="card mb">
    <div class="ch"><div><h3>Kalemler</h3><div class="sub">Toptancıyı elle değiştirebilirsin; "Otomatik" en ucuzu seçer</div></div></div>
    <div class="tw"><table><thead><tr><th>Ürün</th><th>Adet</th><th>Toptancı</th><th class="num">Birim</th><th class="num">Tutar</th><th class="num hide-m">En pahalı</th><th></th></tr></thead><tbody>
    ${P.lines.map(({ it, chosen, best, max }, i) => `<tr>
      <td><b class="mono">${esc(it.stokKodu)}</b> · <b>${esc(it.marka)}</b><div class="small muted">${esc(it.urunAdi)}</div></td>
      <td><span class="qty"><button data-dec="${i}">−</button><input value="${it.adet}" data-qty="${i}"><button data-inc="${i}">+</button></span></td>
      <td><select class="mini" data-sel="${i}"><option value="">Otomatik (${esc(best?.toptanci || '—')})</option>
        ${it.teklifler.map(o => `<option value="${o.toptanciId}" ${it.secili === o.toptanciId ? 'selected' : ''}>${esc(o.toptanci)} · ${tl(o.kdvliFiyat)}${o.stokVar ? ' · stokta' : ''}</option>`).join('')}</select>
        ${chosen ? `<div style="margin-top:4px"><span class="badge ${chosen.stokVar ? 'ok' : 'mut'}">${chosen.stokVar ? 'Stokta' : 'Stok yok'}</span></div>` : ''}</td>
      <td class="num">${tl(chosen?.kdvliFiyat)}</td><td class="num price">${tl(chosen ? chosen.kdvliFiyat * it.adet : 0)}</td>
      <td class="num hide-m muted">${tl(max * it.adet)}</td>
      <td><button class="btn btn-xs btn-ghost btn-danger" data-rm="${i}">${ic('trash')}</button></td></tr>`).join('')}
    </tbody></table></div>
  </div>
  <div class="g2">
    <div class="card"><div class="ch"><div><h3>Toptancıya göre sipariş listesi</h3><div class="sub">Her toptancının B2B sitesinden bu listeyi sepete ekle</div></div></div>
      <div class="list">${Object.entries(P.groups).map(([s, ls_]) => `
        <div class="row" style="align-items:flex-start"><div class="ic t">${ic('store')}</div><div class="grow"><div class="t">${esc(s)}</div>
          <div class="s">${ls_.map(l => `${esc(l.it.stokKodu)} × ${l.it.adet}`).join(' · ')}</div></div>
          <div class="num"><div class="price">${tl(ls_.reduce((a, l) => a + l.chosen.kdvliFiyat * l.it.adet, 0))}</div><div class="small muted">${ls_.length} kalem</div></div></div>`).join('')}</div></div>
    <div class="card"><div class="ch"><div><h3>Tek toptancı senaryoları</h3><div class="sub">Hepsini tek yerden alsaydın ne öderdin?</div></div></div>
      <div class="list">${P.tek.map(t => `<div class="row"><div class="grow"><div class="t">${esc(t.s)}</div><div class="s">${t.eksik ? `${t.eksik} ürün bu toptancıda yok` : 'Tüm ürünler mevcut'}</div></div>
        <div class="num"><div class="price">${tl(t.t)}</div><div class="small ${t.t > P.toplam ? 'muted' : ''}">${t.eksik ? 'eksik' : '+' + tl(t.t - P.toplam)}</div></div></div>`).join('')}</div></div>
  </div>`}`);
  $('#stokOnce') && ($('#stokOnce').onchange = e => { ls.set('stokOnce', e.target.checked); PAGES.sepet(); });
  const upd = () => { saveCart(); PAGES.sepet(); };
  $$('[data-inc]').forEach(b => b.onclick = () => { S.cart[b.dataset.inc].adet++; upd(); });
  $$('[data-dec]').forEach(b => b.onclick = () => { const c = S.cart[b.dataset.dec]; c.adet = Math.max(1, c.adet - 1); upd(); });
  $$('[data-qty]').forEach(b => b.onchange = () => { S.cart[b.dataset.qty].adet = Math.max(1, parseInt(b.value) || 1); upd(); });
  $$('[data-sel]').forEach(b => b.onchange = () => { S.cart[b.dataset.sel].secili = b.value; upd(); });
  $$('[data-rm]').forEach(b => b.onclick = () => { S.cart.splice(b.dataset.rm, 1); upd(); });
  $('#pClr').onclick = () => { if (confirm('Sepet boşaltılsın mı?')) { S.cart = []; upd(); } };
  $$('[data-cart]').forEach(el => el.onclick = () => { S.cartId = el.dataset.cart; ls.set('cartId', S.cartId); updateCartCnt(); PAGES.sepet(); });
  $('#newCart').onclick = async () => {
    const ad = prompt('Sepet adı:', `Sepet ${S.carts.length + 1}`); if (!ad) return;
    const c = await api('/api/carts', { method: 'POST', body: { ad } }); S.carts.push(c); S.cartId = c.id; ls.set('cartId', c.id); updateCartCnt(); PAGES.sepet();
  };
  $('#cRen').onclick = async () => { const ad = prompt('Yeni ad:', C.ad); if (!ad) return; C.ad = ad; await api('/api/carts/' + C.id, { method: 'PUT', body: { ad } }); updateCartCnt(); PAGES.sepet(); };
  $('#cTakip').onchange = async e => { C.takip = e.target.checked; await api('/api/carts/' + C.id, { method: 'PUT', body: { takip: C.takip } }); toast(C.takip ? 'Sepet günlük kontrol edilecek' : 'Takip kapatıldı'); PAGES.sepet(); };
  $('#cDel') && ($('#cDel').onclick = async () => { if (!confirm(`"${C.ad}" silinsin mi?`)) return; await api('/api/carts/' + C.id, { method: 'DELETE' }); await loadCarts(); S.cartId = S.carts[0].id; PAGES.sepet(); });
  $('#cRefresh').onclick = async e => {
    if (!C.items.length) return toast('Sepet boş');
    e.target.disabled = true; $('#cMsg').innerHTML = `⏳ ${C.items.length} ürün tüm toptancılarda yeniden aranıyor…`;
    try {
      const r = await api(`/api/carts/${C.id}/refresh`, { method: 'POST' });
      Object.assign(C, r.cart); PAGES.sepet(); loadNotifs();
      toast(r.degisim.length ? `${r.degisim.length} üründe fiyat/toptancı değişti` : 'Fiyatlar güncel');
    } catch (err) { $('#cMsg').textContent = err.message; e.target.disabled = false; }
  };
  const planRows = () => P.lines.filter(l => l.chosen).map(l => ({ 'Toptancı': l.chosen.toptanci, 'Stok Kodu': l.it.stokKodu, Marka: l.it.marka, 'Ürün': l.it.urunAdi, Adet: l.it.adet, Stok: l.chosen.stokVar ? 'Var' : 'Yok', 'Birim (KDV\'li)': l.chosen.kdvliFiyat, Tutar: +(l.chosen.kdvliFiyat * l.it.adet).toFixed(2) }))
    .sort((a, b) => a['Toptancı'].localeCompare(b['Toptancı'], 'tr'));
  $('#pXls') && ($('#pXls').onclick = () => exportXlsx(planRows(), 'siparis_plani'));
  $('#pPdf') && ($('#pPdf').onclick = () => exportPdf('Sipariş Planı', `Toplam ${tl(P.toplam)} · Tasarruf ${tl(Math.max(0, tasarruf))}`,
    ['Toptancı', 'Stok Kodu', 'Marka', 'Ürün', 'Adet', 'Birim', 'Tutar'], planRows().map(r => [r['Toptancı'], r['Stok Kodu'], r.Marka, r['Ürün'], r.Adet, tl(r["Birim (KDV'li)"]), tl(r.Tutar)])));
};

// =====================================================================
// TOPLU ARAMA
// =====================================================================
const BULK = { list: [], results: [], running: false };
PAGES.toplu = () => {
  view(`
  <div class="ph"><div><h1>Toplu Arama</h1><p>Parça listesini yapıştır veya Excel yükle; her biri tüm toptancılarda aranır, en ucuz teklif tek tabloda çıkar.</p></div></div>
  <div class="g2 mb">
    <div class="card">
      <h3>Liste</h3><div class="sub">Her satıra bir parça. Adet için: <span class="mono">2N1115201;4</span></div>
      <textarea class="inp mono" id="bTxt" rows="9" style="margin-top:12px;resize:vertical" placeholder="2N1115201;2&#10;CAB 330617&#10;BGA PK1400;10">${esc(BULK.list.map(x => x.adet > 1 ? `${x.q};${x.adet}` : x.q).join('\n'))}</textarea>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button class="btn btn-dark" id="bRun">${ic('search')}Toplu ara</button>
        <label class="btn">${ic('down')}Excel yükle<input type="file" id="bFile" accept=".xlsx,.xls,.csv" hidden></label>
        <label class="tg"><input type="checkbox" id="bStock" ${ls.get('stokOnce', true) ? 'checked' : ''}>Stokta olanı tercih et</label>
      </div>
      <div class="small muted" style="margin-top:8px">Excel: ilk sütun parça no, ikinci sütun (varsa) adet.</div>
    </div>
    <div class="card" id="bSum"></div>
  </div>
  <div class="card"><div class="tools">
    <span class="small muted" id="bProg"></span><span style="flex:1"></span>
    <select class="mini" id="bCart">${S.carts.map(c => `<option value="${c.id}" ${c.id === activeCart()?.id ? 'selected' : ''}>🛒 ${esc(c.ad)}</option>`).join('')}</select>
    <button class="btn btn-sm btn-dark" id="bAdd">${ic('cart')}En iyileri sepete ekle</button>
    <button class="btn btn-sm" id="bXls">${ic('down')}Excel</button>
  </div><div class="tw"><table><thead><tr><th>Aranan</th><th>Adet</th><th>En iyi teklif</th><th>Toptancı</th><th>Stok</th><th class="num">Birim</th><th class="num">Tutar</th><th class="hide-m">Teklif</th><th></th></tr></thead><tbody id="bTb"></tbody></table></div></div>`);
  $('#bRun').onclick = runBulk;
  $('#bStock').onchange = renderBulk;
  $('#bFile').onchange = async e => {
    const f = e.target.files[0]; if (!f || !window.XLSX) return;
    const wb = XLSX.read(await f.arrayBuffer());
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    $('#bTxt').value = rows.filter(r => r[0] && !/parça|stok|kod/i.test(String(r[0]))).map(r => r[1] ? `${r[0]};${r[1]}` : r[0]).join('\n');
    toast(`${$('#bTxt').value.split('\n').length} satır yüklendi`);
  };
  $('#bAdd').onclick = () => {
    S.cartId = $('#bCart').value; ls.set('cartId', S.cartId);
    let n = 0;
    for (const r of BULK.results) if (r.best) { putInCart(r.best, r.res.sonuclar, r.q, r.adet); n++; }
    if (!n) return toast('Eklenecek ürün yok');
    saveCart(); toast(`${n} ürün "${activeCart().ad}" sepetine eklendi`); go('sepet');
  };
  $('#bXls').onclick = () => exportXlsx(BULK.results.map(r => ({ Aranan: r.q, Adet: r.adet, 'Stok Kodu': r.best?.stokKodu || '', Marka: r.best?.marka || '', 'Ürün': r.best?.urunAdi || 'Bulunamadı', 'Toptancı': r.best?.toptanci || '', Stok: r.best ? (r.best.stokVar ? 'Var' : 'Yok') : '', Birim: r.best?.kdvliFiyat || 0, Tutar: r.best ? +(r.best.kdvliFiyat * r.adet).toFixed(2) : 0 })), 'toplu_arama');
  renderBulk();
};
function pickBest(rows, q, stokOnce) {
  const nq = norm(q);
  let c = rows.filter(r => r.kdvliFiyat > 0);
  // Önce koda birebir uyanlar (stok kodu veya OEM), yoksa tüm sonuçlar
  const exact = c.filter(r => norm(r.stokKodu).includes(nq) || norm(r.oem).includes(nq));
  if (exact.length) c = exact;
  if (stokOnce && c.some(r => r.stokVar)) c = c.filter(r => r.stokVar);
  return c.sort((a, b) => a.kdvliFiyat - b.kdvliFiyat)[0];
}
async function runBulk() {
  if (BULK.running) return;
  BULK.list = $('#bTxt').value.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 100)
    .map(l => { const [q, a] = l.split(/[;\t]/); return { q: q.trim(), adet: Math.max(1, parseInt(a) || 1) }; });
  if (!BULK.list.length) return toast('Liste boş');
  BULK.results = []; BULK.running = true; $('#bRun').disabled = true;
  for (const [i, it] of BULK.list.entries()) {
    $('#bProg').innerHTML = `<span class="spin" style="display:inline-block;vertical-align:middle;color:var(--cyan)"></span> ${i + 1}/${BULK.list.length} aranıyor: <b class="mono">${esc(it.q)}</b>`;
    try { BULK.results.push({ ...it, res: await api('/api/search?q=' + encodeURIComponent(it.q)) }); }
    catch (e) { BULK.results.push({ ...it, res: { sonuclar: [] }, hata: e.message }); }
    if (S.page === 'toplu') renderBulk();
  }
  BULK.running = false;
  if (S.page === 'toplu') { $('#bRun').disabled = false; $('#bProg').textContent = `${BULK.results.length} parça arandı`; }
  toast('Toplu arama bitti');
}
function renderBulk() {
  if (!$('#bTb')) return;
  const stokOnce = $('#bStock').checked;
  BULK.results.forEach(r => r.best = pickBest(r.res.sonuclar, r.q, stokOnce));
  const found = BULK.results.filter(r => r.best);
  const toplam = found.reduce((a, r) => a + r.best.kdvliFiyat * r.adet, 0);
  const sup = {}; found.forEach(r => sup[r.best.toptanci] = (sup[r.best.toptanci] || 0) + 1);
  $('#bSum').innerHTML = `<h3>Özet</h3><div class="sub">En iyi tekliflere göre</div>
    <div class="g2" style="gap:12px;margin-top:14px">
      <div class="stat"><small>Bulunan</small><b>${found.length}/${BULK.results.length || BULK.list.length || 0}</b></div>
      <div class="stat"><small>Toplam (KDV'li)</small><b>${tl(toplam)}</b></div></div>
    <div style="margin-top:14px">${Object.entries(sup).map(([n, v]) => `<div class="hbar"><span class="l">${esc(n)}</span><span class="b"><i style="width:${v / found.length * 100}%"></i></span><span class="v">${v} ürün</span></div>`).join('') || '<div class="small muted">Arama yapılınca toptancı dağılımı burada görünür</div>'}</div>`;
  $('#bTb').innerHTML = BULK.results.length ? BULK.results.map((r, i) => `<tr>
    <td class="mono"><b>${esc(r.q)}</b></td><td>${r.adet}</td>
    <td>${r.best ? `<b class="mono">${esc(r.best.stokKodu)}</b> · <b>${esc(r.best.marka)}</b><div class="small muted">${esc(r.best.urunAdi)}</div>` : `<span class="badge bad">${esc(r.hata || 'Bulunamadı')}</span>`}</td>
    <td>${r.best ? `<span class="badge teal">${esc(r.best.toptanci)}</span>` : ''}</td>
    <td>${r.best ? `<span class="badge ${r.best.stokVar ? 'ok' : 'mut'}">${r.best.stokVar ? 'Var' : 'Yok'}</span>` : ''}</td>
    <td class="num">${tl(r.best?.kdvliFiyat)}</td><td class="num price">${r.best ? tl(r.best.kdvliFiyat * r.adet) : '—'}</td>
    <td class="hide-m small muted">${r.res.sonuclar.length} sonuç</td>
    <td><button class="btn btn-xs" data-bopen="${i}">Detay</button></td></tr>`).join('')
    : `<tr><td colspan="9" class="empty">Liste girip "Toplu ara"ya bas</td></tr>`;
  $$('[data-bopen]').forEach(b => b.onclick = () => { S.last = BULK.results[+b.dataset.bopen].res; go('ara'); });
}

// =====================================================================
// TAKİP LİSTESİ
// =====================================================================
function sparkline(g) {
  if (!g || g.length < 2) return '<span class="small muted">—</span>';
  const v = g.map(x => x.fiyat), mn = Math.min(...v), mx = Math.max(...v), w = 90, h = 26;
  const pts = v.map((y, i) => `${(i / (v.length - 1) * w).toFixed(1)},${(mx === mn ? h / 2 : h - (y - mn) / (mx - mn) * (h - 4) - 2).toFixed(1)}`).join(' ');
  const c = v.at(-1) <= v[0] ? 'var(--ok)' : 'var(--bad)';
  return `<svg class="spark" width="${w}" height="${h}"><polyline points="${pts}" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
PAGES.takip = async () => {
  await loadWatch();
  const st = await api('/api/settings');
  view(`
  <div class="ph"><div><h1>Takip Listesi</h1><p>Ürünler her gün ${esc(st.kontrolSaatleri)} saatlerinde kontrol edilir; fiyat düşünce, hedefe ulaşınca veya stoğa girince bildirim gelir.</p></div>
    <div style="display:flex;gap:8px"><button class="btn btn-sm" id="wXls">${ic('down')}Excel</button><button class="btn btn-dark" id="wRun">${ic('refresh')}Şimdi kontrol et</button></div></div>
  ${S.watch.length ? `<div class="card"><div class="tw"><table><thead><tr><th>Ürün</th><th class="num">Son fiyat</th><th>Toptancı</th><th>Stok</th><th>Trend</th><th class="num">Hedef</th><th class="hide-m">Son kontrol</th><th></th></tr></thead><tbody>
    ${S.watch.map(w => `<tr>
      <td><b class="mono">${esc(w.stokKodu)}</b> · <b>${esc(w.marka || '')}</b><div class="small muted">${esc(w.urunAdi || '')}</div></td>
      <td class="num price">${tl(w.sonFiyat)}${w.hedefFiyat && w.sonFiyat <= w.hedefFiyat ? '<div><span class="badge ok">Hedefte</span></div>' : ''}</td>
      <td><span class="badge teal">${esc(w.sonToptanci || '—')}</span></td>
      <td><span class="badge ${w.stokVar ? 'ok' : 'mut'}">${w.stokVar ? 'Var' : 'Yok'}</span></td>
      <td>${sparkline(w.gecmis)}</td>
      <td class="num"><button class="btn btn-xs" data-hedef="${w.id}">${w.hedefFiyat ? tl(w.hedefFiyat) : 'Belirle'}</button></td>
      <td class="hide-m muted small">${w.sonKontrol ? ago(w.sonKontrol) : '—'}</td>
      <td style="white-space:nowrap"><button class="btn btn-xs" data-wq="${esc(w.stokKodu)}">${ic('search')}</button> <button class="btn btn-xs btn-ghost btn-danger" data-wdel="${w.id}">${ic('trash')}</button></td></tr>`).join('')}
  </tbody></table></div></div>` : `<div class="card empty">${ic('eye')}<div>Takip listesi boş. Arama sonuçlarında ${ic('eye')} butonuna bas.</div></div>`}`);
  $('#wRun').onclick = async e => { e.target.disabled = true; e.target.innerHTML = '<span class="spin"></span>Kontrol ediliyor'; await api('/api/watch/run', { method: 'POST' }); loadNotifs(); PAGES.takip(); };
  $('#wXls').onclick = () => exportXlsx(S.watch.map(w => ({ 'Stok Kodu': w.stokKodu, Marka: w.marka, 'Ürün': w.urunAdi, 'Son fiyat': w.sonFiyat, 'Toptancı': w.sonToptanci, Stok: w.stokVar ? 'Var' : 'Yok', Hedef: w.hedefFiyat })), 'takip_listesi');
  $$('[data-hedef]').forEach(b => b.onclick = async () => {
    const w = S.watch.find(x => x.id === b.dataset.hedef);
    const v = prompt('Hedef fiyat (KDV\'li), kaldırmak için boş bırak:', w.hedefFiyat || ''); if (v === null) return;
    await api('/api/watch/' + w.id, { method: 'PUT', body: { hedefFiyat: parseFloat(String(v).replace(',', '.')) || null } }); PAGES.takip();
  });
  $$('[data-wdel]').forEach(b => b.onclick = async () => { await api('/api/watch/' + b.dataset.wdel, { method: 'DELETE' }); PAGES.takip(); });
  $$('[data-wq]').forEach(b => b.onclick = () => search(b.dataset.wq));
};

// =====================================================================
// KAMPANYA & YENİ ÜRÜNLER
// =====================================================================
PAGES.kampanya = async () => {
  const sp = await api('/api/specials');
  const tur = ls.get('spTur', 'kampanya');
  const rows = Object.values(sp).flatMap(s => s[tur]?.rows || []).sort((a, b) => (b.yeni - a.yeni) || (a.kdvliFiyat || Infinity) - (b.kdvliFiyat || Infinity));
  const tarih = Object.values(sp).map(s => s[tur]?.tarih).filter(Boolean).sort().at(-1);
  const st = await api('/api/settings');
  view(`
  <div class="ph"><div><h1>Kampanya & Yeni Ürünler</h1><p>Toptancıların kampanyalı ve yeni ürün listeleri günde ${st.kontrolSaatleri.split(',').length} kez (${esc(st.kontrolSaatleri)}) taranır; yeni gelenler bildirim olarak düşer.</p></div>
    <div style="display:flex;gap:8px;align-items:center"><div class="seg"><button data-t="kampanya" class="${tur === 'kampanya' ? 'on' : ''}">Kampanyalar</button><button data-t="yeni" class="${tur === 'yeni' ? 'on' : ''}">Yeni ürünler</button></div>
    <button class="btn btn-dark" id="spRun">${ic('refresh')}Şimdi tara</button></div></div>
  <div class="small muted mb">${tarih ? 'Son tarama ' + ago(tarih) : 'Henüz tarama yapılmadı'} · Şu an destekleyen toptancılar: Şener. Buyasoft siteleri için kampanya sayfasının adresi gerekiyor.</div>
  ${rows.length ? `<div class="card"><div class="tw"><table><thead><tr><th>Stok Kodu</th><th>Marka</th><th>Ürün</th><th>Stok</th><th>Toptancı</th><th class="num">KDV'li</th><th></th></tr></thead><tbody>
    ${rows.map((d, i) => `<tr><td class="mono"><b>${esc(d.stokKodu)}</b> ${d.yeni ? '<span class="badge violet">YENİ</span>' : ''}</td><td><b>${esc(d.marka)}</b></td><td>${esc(d.urunAdi)}</td>
      <td><span class="badge ${d.stokVar ? 'ok' : 'mut'}">${d.stokVar ? 'Var' : 'Yok'}</span></td><td><span class="badge teal">${esc(d.toptanci)}</span></td><td class="num price">${tl(d.kdvliFiyat)}</td>
      <td><button class="btn btn-xs" data-sq="${esc(d.stokKodu)}">${ic('search')}Karşılaştır</button></td></tr>`).join('')}
  </tbody></table></div></div>` : `<div class="card empty">${ic('tag')}<div>Liste boş. "Şimdi tara" ile toptancılardan çek.</div></div>`}`);
  $$('[data-t]').forEach(b => b.onclick = () => { ls.set('spTur', b.dataset.t); PAGES.kampanya(); });
  $('#spRun').onclick = async e => { e.target.disabled = true; e.target.innerHTML = '<span class="spin"></span>Taranıyor'; await api('/api/specials/run', { method: 'POST' }); loadNotifs(); PAGES.kampanya(); };
  $$('[data-sq]').forEach(b => b.onclick = () => search(b.dataset.sq));
};

// =====================================================================
// GEÇMİŞ
// =====================================================================
async function openHistory(id) { S.last = await api('/api/history/' + id); go('ara'); }
PAGES.gecmis = async () => {
  const all = S.me.rol === 'admin' && ls.get('histAll', false);
  const h = await api('/api/history' + (all ? '?hepsi=1' : ''));
  view(`
  <div class="ph"><div><h1>Arama Geçmişi</h1><p>${h.length} arama · sunucu yeniden başlayınca sıfırlanır (PoC)</p></div>
    <div style="display:flex;gap:8px;align-items:center">${S.me.rol === 'admin' ? `<div class="seg"><button data-a="0" class="${all ? '' : 'on'}">Benim</button><button data-a="1" class="${all ? 'on' : ''}">Tüm ekip</button></div>` : ''}
      <button class="btn btn-sm" id="hXls">${ic('down')}Excel</button><button class="btn btn-sm btn-danger" id="hClr">${ic('trash')}Temizle</button></div></div>
  ${h.length ? `<div class="g4">${h.map(x => `
    <div class="rc" data-hist="${x.id}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="q">${esc(x.q)}</span>${x.firmalar.every(f => f.ok) ? '<span class="badge ok">Tamam</span>' : '<span class="badge warn">Kısmi</span>'}</div>
      <div class="small muted" style="margin-top:6px">${new Date(x.tarih).toLocaleString('tr-TR')}${all ? ' · ' + esc(x.kullanici) : ''}</div>
      <div class="m"><span>${x.adet} sonuç · ${x.stokta} stokta · ${(x.sure / 1000).toFixed(1)}s</span><span class="p">${tl(x.enUcuz)}</span></div>
    </div>`).join('')}</div>` : `<div class="card empty">${ic('clock')}<div>Henüz arama yok</div></div>`}`);
  $$('[data-hist]').forEach(c => c.onclick = () => openHistory(c.dataset.hist));
  $$('[data-a]').forEach(b => b.onclick = () => { ls.set('histAll', b.dataset.a === '1'); PAGES.gecmis(); });
  $('#hClr').onclick = async () => { await api('/api/history', { method: 'DELETE' }); PAGES.gecmis(); };
  $('#hXls').onclick = () => exportXlsx(h.map(x => ({ Arama: x.q, Tarih: new Date(x.tarih).toLocaleString('tr-TR'), Kullanici: x.kullanici, Sonuc: x.adet, Stokta: x.stokta, 'En ucuz': x.enUcuz, 'En pahalı': x.enPahali, 'Süre (sn)': +(x.sure / 1000).toFixed(1) })), 'arama_gecmisi');
};

// =====================================================================
// AI RAPORLAR (kural tabanlı analiz)
// =====================================================================
function analyze(r) {
  const rows = r.sonuclar.filter(d => d.kdvliFiyat > 0);
  const ins = [];
  if (!rows.length) return { ins: ['Fiyatlı sonuç bulunamadı.'], sup: [], brand: [] };
  const sorted = rows.slice().sort((a, b) => a.kdvliFiyat - b.kdvliFiyat);
  const cheap = sorted[0], cheapStock = sorted.find(d => d.stokVar);
  ins.push(`<b>${rows.length}</b> fiyatlı ürün bulundu; fiyatlar <b>${tl(sorted[0].kdvliFiyat)}</b> ile <b>${tl(sorted.at(-1).kdvliFiyat)}</b> arasında (fark <b>%${((sorted.at(-1).kdvliFiyat / sorted[0].kdvliFiyat - 1) * 100).toFixed(0)}</b>).`);
  ins.push(`En ucuz seçenek <b>${esc(cheap.marka)} ${esc(cheap.stokKodu)}</b> — ${esc(cheap.toptanci)}, ${tl(cheap.kdvliFiyat)}${cheap.stokVar ? ' ve stokta.' : ', ancak <b>stokta yok</b>.'}`);
  if (cheapStock && cheapStock !== cheap) ins.push(`Hemen teslim için en uygun: <b>${esc(cheapStock.marka)} ${esc(cheapStock.stokKodu)}</b> — ${esc(cheapStock.toptanci)}, ${tl(cheapStock.kdvliFiyat)} (stokta). En ucuza göre +${tl(cheapStock.kdvliFiyat - cheap.kdvliFiyat)}.`);
  const orj = rows.filter(d => /ORİJİNAL|ORIJINAL|ORJ|OE-|OTOSAN|FORD|PSA/i.test(d.marka));
  const muadil = rows.filter(d => !orj.includes(d));
  if (orj.length && muadil.length) {
    const o = Math.min(...orj.map(d => d.kdvliFiyat)), m = Math.min(...muadil.map(d => d.kdvliFiyat));
    ins.push(`Orijinal/OE en ucuz ${tl(o)}, muadil en ucuz ${tl(m)} — muadil tercih edilirse yaklaşık <b>%${((1 - m / o) * 100).toFixed(0)}</b> tasarruf.`);
  }
  // aynı ürün farklı toptancılarda
  const byKey = {};
  for (const d of rows) (byKey[norm(d.stokKodu)] ||= []).push(d);
  const multi = Object.values(byKey).filter(a => new Set(a.map(x => x.toptanci)).size > 1)
    .map(a => { const s = a.slice().sort((x, y) => x.kdvliFiyat - y.kdvliFiyat); return { a: s, fark: s.at(-1).kdvliFiyat - s[0].kdvliFiyat }; })
    .sort((x, y) => y.fark - x.fark);
  if (multi.length) ins.push(`<b>${multi.length}</b> ürün birden fazla toptancıda var. En büyük fark: <b>${esc(multi[0].a[0].stokKodu)}</b> — ${esc(multi[0].a[0].toptanci)} ${tl(multi[0].a[0].kdvliFiyat)} vs ${esc(multi[0].a.at(-1).toptanci)} ${tl(multi[0].a.at(-1).kdvliFiyat)}.`);
  const stokOran = rows.filter(d => d.stokVar).length / rows.length;
  ins.push(`Sonuçların <b>%${(stokOran * 100).toFixed(0)}</b>'i stokta. ${stokOran < 0.3 ? 'Stok durumu zayıf; siparişten önce toptancıyla teyit önerilir.' : 'Stok durumu iyi.'}`);
  const fail = r.firmalar.filter(f => !f.ok);
  if (fail.length) ins.push(`<span style="color:var(--bad)">${fail.map(f => esc(f.ad)).join(', ')}</span> aramaya cevap vermedi — sonuçlar eksik olabilir.`);

  const sup = r.firmalar.filter(f => f.ok).map(f => {
    const a = rows.filter(d => d.toptanci === f.ad);
    return { ad: f.ad, adet: a.length, stok: a.filter(d => d.stokVar).length, ort: a.length ? a.reduce((s, d) => s + d.kdvliFiyat, 0) / a.length : 0, min: a.length ? Math.min(...a.map(d => d.kdvliFiyat)) : 0 };
  });
  const bm = {};
  for (const d of rows) if (!bm[d.marka] || d.kdvliFiyat < bm[d.marka].kdvliFiyat) bm[d.marka] = d;
  const brand = Object.values(bm).sort((a, b) => a.kdvliFiyat - b.kdvliFiyat);
  return { ins, sup, brand };
}

PAGES.rapor = async () => {
  const h = await api('/api/history');
  if (!h.length) return view(`<div class="ph"><div><h1>AI Raporlar</h1></div></div><div class="card empty">${ic('spark')}<div>Rapor için önce bir arama yap</div><button class="btn btn-dark" style="margin-top:14px" data-go="ara">Parça ara</button></div>`);
  const id = S.reportId && h.find(x => x.id === S.reportId) ? S.reportId : h[0].id;
  const r = await api('/api/history/' + id);
  const A = analyze(r);
  const maxOrt = Math.max(1, ...A.sup.map(s => s.ort));
  // genel trend: en çok aranan
  const freq = {}; h.forEach(x => freq[x.q.toUpperCase()] = (freq[x.q.toUpperCase()] || 0) + 1);
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 6);
  view(`
  <div class="ph"><div><h1>AI Raporlar</h1><p>Arama sonuçlarının otomatik analizi ve satın alma önerileri</p></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap" class="no-print"><select class="mini" id="rSel" style="max-width:280px">${h.map(x => `<option value="${x.id}" ${x.id === id ? 'selected' : ''}>${esc(x.q)} · ${new Date(x.tarih).toLocaleString('tr-TR')}</option>`).join('')}</select>
      <button class="btn btn-sm" id="rPdf">${ic('file')}PDF</button></div></div>
  <div class="ai mb">
    <span class="badge violet">${ic('spark')} Parça-AI analizi</span>
    <h3 style="margin:10px 0 0;font-size:20px">“${esc(r.q)}” için satın alma özeti</h3>
    <ul>${A.ins.map(t => `<li><span style="color:var(--cyan)">●</span><span>${t}</span></li>`).join('')}</ul>
  </div>
  <div class="g2 mb">
    <div class="card"><div class="ch"><div><h3>Toptancı karşılaştırması</h3><div class="sub">Ortalama KDV'li fiyat</div></div></div>
      ${A.sup.map(s => `<div class="hbar"><span class="l">${esc(s.ad)}</span><span class="b"><i style="width:${s.ort / maxOrt * 100}%"></i></span><span class="v">${tl(s.ort)}</span></div>
        <div class="small muted" style="margin:-4px 0 10px 140px">${s.adet} ürün · ${s.stok} stokta · en ucuz ${tl(s.min)}</div>`).join('')}</div>
    <div class="card"><div class="ch"><div><h3>Marka bazında en ucuz</h3><div class="sub">Her markanın en uygun teklifi</div></div></div>
      <div class="tw" style="max-height:340px"><table><thead><tr><th>Marka</th><th>Kod</th><th>Toptancı</th><th class="num">Fiyat</th></tr></thead><tbody>
      ${A.brand.map(d => `<tr><td><b>${esc(d.marka)}</b></td><td class="mono">${esc(d.stokKodu)}</td><td><span class="badge teal">${esc(d.toptanci)}</span></td><td class="num price">${tl(d.kdvliFiyat)}</td></tr>`).join('')}</tbody></table></div></div>
  </div>
  <div class="card"><div class="ch"><div><h3>En çok aranan parçalar</h3><div class="sub">Tüm geçmiş</div></div></div>
    ${top.map(([q, n]) => `<div class="hbar"><span class="l mono">${esc(q)}</span><span class="b"><i style="width:${n / top[0][1] * 100}%"></i></span><span class="v">${n}×</span></div>`).join('')}</div>`);
  $('#rSel').onchange = e => { S.reportId = e.target.value; PAGES.rapor(); };
  $('#rPdf').onclick = () => window.print();
};

// =====================================================================
// ENTEGRASYONLAR
// =====================================================================
PAGES.entegrasyon = async () => {
  await refreshSites();
  const [adapters, log, st] = await Promise.all([api('/api/adapters'), api('/api/login-log'), api('/api/settings')]);
  const isAdmin = S.me.rol === 'admin';
  view(`
  <div class="ph"><div><h1>Entegrasyonlar</h1><p>B2B toptancı bağlantıları · oturumlar kaydedilir ve otomatik açık tutulur</p></div>
    ${isAdmin ? `<button class="btn btn-dark" id="addSite">${ic('plus')}Toptancı ekle</button>` : ''}</div>
  <div class="g4 mb">
    <div class="stat"><div class="ic g">${ic('check')}</div><b>${S.sites.filter(s => s.durum === 'bagli').length}</b><small>Bağlı</small></div>
    <div class="stat"><div class="ic o">${ic('bell')}</div><b>${S.sites.filter(s => s.durum === 'giris-gerekli').length}</b><small>Giriş bekleyen</small></div>
    <div class="stat"><div class="ic r">${ic('plug')}</div><b>${S.sites.filter(s => s.durum === 'hata').length}</b><small>Bağlantı sorunu</small></div>
    <div class="stat"><div class="ic b">${ic('store')}</div><b>${Object.keys(adapters).length}</b><small>Desteklenen altyapı</small></div>
  </div>
  <div class="list mb">${S.sites.map(s => `
    <div class="row">
      <div class="ic t">${ic('store')}</div>
      <div class="grow"><div class="t">${esc(s.ad)} ${durumBadge(s)} ${s.interaktif ? '<span class="badge violet">Doğrulama kodlu</span>' : ''}</div>
        <div class="s">${esc(s.baseUrl)} · ${esc(adapters[s.adapter]?.ad || s.adapter)} · ${s.username ? 'Kullanıcı: ' + esc(s.username) : 'Kullanıcı yok'}${s.oturumKayitli ? ' · oturum kayıtlı' : ''}${s.sonKontrol ? ' · son kontrol ' + ago(s.sonKontrol) : ''}</div>
        ${s.interaktif ? `<div class="s">"Bağlan"a basınca bilgisayarda bir tarayıcı penceresi açılır; kullanıcı adı/şifre dolu gelir, sen resimdeki kodu yazıp <b>Giriş Yap</b>'a basarsın. Oturum kaydedilir, sonra arka planda çalışır.</div>` : ''}
        ${s.sonHata ? `<div class="s" style="color:var(--bad)">${esc(s.sonHata)}</div>` : ''}<div class="s" id="st-${s.id}"></div></div>
      <button class="btn btn-sm ${s.durum === 'giris-gerekli' ? 'btn-dark' : ''}" data-rc="${s.id}" ${s.durum === 'giris-bekliyor' ? 'disabled' : ''}>${ic(s.interaktif ? 'window' : 'refresh')}${s.interaktif ? 'Bağlan' : 'Yeniden bağlan'}</button>
      ${isAdmin ? `<button class="btn btn-sm" data-ed="${s.id}">${ic('edit')}Düzenle</button><button class="btn btn-sm btn-ghost btn-danger" data-del="${s.id}">${ic('trash')}</button>` : ''}
    </div>`).join('') || `<div class="card empty">${ic('plug')}<div>Henüz toptancı yok</div></div>`}</div>

  <div class="wa mb">
    <div class="ic">${ic('wa')}</div>
    <div style="flex:1;min-width:220px"><b>WhatsApp bildirimleri</b> <span class="badge" style="background:rgba(255,255,255,.2);color:#fff">Entegre edilebilir</span>
      <p>Fiyat düşüşü, stoğa giren ürün, yeni kampanya ve oturumu kapanan toptancı bildirimleri WhatsApp'a da gönderilebilir (WhatsApp Business API ile). ${st.whatsapp?.numara ? 'Kayıtlı numara: ' + esc(st.whatsapp.numara) : 'Numarayı Ayarlar\'dan gir.'}</p></div>
    <button class="btn" style="background:#fff;color:#0f9d58;border:0" data-go="ayarlar">Ayarla</button>
  </div>

  <div class="card"><div class="ch"><div><h3>Son giriş denemeleri</h3><div class="sub">Toptancı sitelerine yapılan otomatik ve manuel girişler</div></div></div>
    ${log.length ? `<div class="tw" style="max-height:380px"><table><thead><tr><th>Zaman</th><th>Toptancı</th><th>Sonuç</th><th>Sebep</th><th>Detay</th></tr></thead><tbody>
      ${log.map(l => `<tr><td class="small">${new Date(l.tarih).toLocaleString('tr-TR')}</td><td><b>${esc(l.ad)}</b></td>
        <td><span class="badge ${l.ok ? 'ok' : 'bad'}">${l.ok ? 'Başarılı' : 'Başarısız'}</span></td><td class="small muted">${esc(l.sebep || '')}</td><td class="small muted">${esc(l.hata || '')}</td></tr>`).join('')}
    </tbody></table></div>` : `<div class="empty">Henüz giriş kaydı yok</div>`}</div>`);
  $$('[data-rc]').forEach(b => b.onclick = async () => {
    const el = $('#st-' + b.dataset.rc); b.disabled = true;
    const s = S.sites.find(x => x.id === b.dataset.rc);
    el.innerHTML = s.interaktif ? '🪟 Tarayıcı penceresi açılıyor — resimdeki kodu yazıp Giriş Yap\'a bas…' : '⏳ Giriş yapılıyor…';
    try {
      const r = await api(`/api/sites/${b.dataset.rc}/connect`, { method: 'POST' });
      if (r.interaktif) return pollConnect(s.id);
      el.innerHTML = r.ok ? `<span style="color:var(--ok)">✓ Bağlandı (${(r.sure / 1000).toFixed(1)} sn)</span>` : `<span style="color:var(--bad)">✗ ${esc(r.hata)}</span>`;
    } catch (err) { el.innerHTML = `<span style="color:var(--bad)">✗ ${esc(err.message)}</span>`; }
    b.disabled = false; setTimeout(() => S.page === 'entegrasyon' && PAGES.entegrasyon(), 1500);
  });
  if (!isAdmin) return;
  $('#addSite').onclick = () => siteForm({}, adapters);
  $$('[data-ed]').forEach(b => b.onclick = () => siteForm(S.sites.find(s => s.id === b.dataset.ed), adapters));
  $$('[data-del]').forEach(b => b.onclick = async () => { if (confirm('Bu toptancı silinsin mi?')) { await api('/api/sites/' + b.dataset.del, { method: 'DELETE' }); PAGES.entegrasyon(); } });
};
// Görünür pencerede giriş bitene kadar durumu izle
async function pollConnect(id) {
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 2500));
    await refreshSites();
    const s = S.sites.find(x => x.id === id);
    if (!s || s.durum !== 'giris-bekliyor') { loadNotifs(); if (S.page === 'entegrasyon') PAGES.entegrasyon(); toast(s?.durum === 'bagli' ? `${s.ad} bağlandı` : 'Giriş tamamlanmadı'); return; }
  }
}
function siteForm(s, adapters) {
  modal(`<form id="sf2"><h3>${s.id ? 'Toptancıyı düzenle' : 'Toptancı ekle'}</h3><div class="sub">B2B giriş bilgileri; sistem otomatik giriş yapar ve oturumu açık tutar.</div>
    <div class="g2" style="gap:0 14px"><div><label class="f">Firma adı</label><input class="inp" id="sAd" required value="${esc(s.ad || '')}"></div>
    <div><label class="f">Altyapı</label><select class="inp" id="sAdp">${Object.entries(adapters).map(([k, v]) => `<option value="${k}" ${s.adapter === k ? 'selected' : ''}>${esc(v.ad)}</option>`).join('')}</select></div></div>
    <label class="f">Site adresi</label><input class="inp" id="sUrl" required placeholder="https://b4b.firma.com" value="${esc(s.baseUrl || '')}">
    <div class="g2" style="gap:0 14px"><div><label class="f">Kullanıcı adı</label><input class="inp" id="sUser" autocomplete="off" value="${esc(s.username || '')}"></div>
    <div><label class="f">Şifre</label><input class="inp" id="sPass" type="password" autocomplete="new-password" placeholder="${s.sifreVar ? '•••••• (değiştirmek için yaz)' : 'Şifre'}"></div></div>
    <label class="tg" style="margin-top:14px"><input type="checkbox" id="sAkt" ${s.aktif !== false ? 'checked' : ''}>Aramalara dahil et</label>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px"><button type="button" class="btn" data-close>Vazgeç</button><button class="btn btn-dark">Kaydet</button></div></form>`);
  $('#sf2').onsubmit = async e => {
    e.preventDefault();
    try {
      await api('/api/sites', { method: 'POST', body: { id: s.id, ad: $('#sAd').value, adapter: $('#sAdp').value, baseUrl: $('#sUrl').value, username: $('#sUser').value, password: $('#sPass').value, aktif: $('#sAkt').checked } });
      closeModal(); toast('Kaydedildi'); PAGES.entegrasyon();
    } catch (err) { toast(err.message); }
  };
}

// =====================================================================
// ÜYELER
// =====================================================================
PAGES.uyeler = async () => {
  const us = await api('/api/users');
  view(`
  <div class="ph"><div><h1>Üyeler</h1><p>Kullanıcı ve yetki yönetimi</p></div><button class="btn btn-dark" id="addU">${ic('plus')}Üye ekle</button></div>
  <div class="g3 mb">
    <div class="stat"><div class="ic b">${ic('users')}</div><b>${us.length}</b><small>Toplam üye</small></div>
    <div class="stat"><div class="ic v">${ic('gear')}</div><b>${us.filter(u => u.rol === 'admin').length}</b><small>Yönetici</small></div>
    <div class="stat"><div class="ic g">${ic('check')}</div><b>${us.filter(u => u.aktif).length}</b><small>Aktif</small></div>
  </div>
  <div class="card"><div class="tw"><table><thead><tr><th>Üye</th><th>Kullanıcı adı</th><th>Rol</th><th>Durum</th><th class="hide-m">Son giriş</th><th></th></tr></thead><tbody>
  ${us.map(u => `<tr><td><div style="display:flex;align-items:center;gap:10px"><div class="av">${esc(u.ad[0].toUpperCase())}</div><b>${esc(u.ad)}</b></div></td>
    <td class="mono">${esc(u.username)}</td><td><span class="badge ${u.rol === 'admin' ? 'violet' : 'blue'}">${u.rol === 'admin' ? 'Yönetici' : 'Kullanıcı'}</span></td>
    <td><span class="badge ${u.aktif ? 'ok' : 'mut'}">${u.aktif ? 'Aktif' : 'Pasif'}</span></td><td class="hide-m muted">${u.sonGiris ? ago(u.sonGiris) : '—'}</td>
    <td style="text-align:right;white-space:nowrap"><button class="btn btn-xs" data-ue="${u.id}">${ic('edit')}Düzenle</button>${u.id !== S.me.id ? ` <button class="btn btn-xs btn-ghost btn-danger" data-ud="${u.id}">${ic('trash')}</button>` : ''}</td></tr>`).join('')}
  </tbody></table></div></div>`);
  const form = (u = {}) => {
    modal(`<form id="uf"><h3>${u.id ? 'Üyeyi düzenle' : 'Yeni üye'}</h3>
      <label class="f">Ad Soyad</label><input class="inp" id="uAd" required value="${esc(u.ad || '')}">
      <div class="g2" style="gap:0 14px"><div><label class="f">Kullanıcı adı</label><input class="inp" id="uUn" required value="${esc(u.username || '')}"></div>
      <div><label class="f">Şifre</label><input class="inp" id="uPw" type="password" autocomplete="new-password" ${u.id ? 'placeholder="Değiştirmek için yaz"' : 'required'}></div></div>
      <div class="g2" style="gap:0 14px"><div><label class="f">Rol</label><select class="inp" id="uRol"><option value="kullanici">Kullanıcı</option><option value="admin" ${u.rol === 'admin' ? 'selected' : ''}>Yönetici</option></select></div>
      <div><label class="f">Durum</label><select class="inp" id="uAkt"><option value="1">Aktif</option><option value="0" ${u.aktif === false ? 'selected' : ''}>Pasif</option></select></div></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px"><button type="button" class="btn" data-close>Vazgeç</button><button class="btn btn-dark">Kaydet</button></div></form>`);
    $('#uf').onsubmit = async e => {
      e.preventDefault();
      try {
        await api('/api/users', { method: 'POST', body: { id: u.id, ad: $('#uAd').value, username: $('#uUn').value, password: $('#uPw').value, rol: $('#uRol').value, aktif: $('#uAkt').value === '1' } });
        closeModal(); toast('Kaydedildi'); PAGES.uyeler();
      } catch (err) { toast(err.message); }
    };
  };
  $('#addU').onclick = () => form();
  $$('[data-ue]').forEach(b => b.onclick = () => form(us.find(u => u.id === b.dataset.ue)));
  $$('[data-ud]').forEach(b => b.onclick = async () => { if (confirm('Üye silinsin mi?')) { await api('/api/users/' + b.dataset.ud, { method: 'DELETE' }); PAGES.uyeler(); } });
};

// =====================================================================
// AYARLAR
// =====================================================================
PAGES.ayarlar = async () => {
  const st = await api('/api/settings');
  const isAdmin = S.me.rol === 'admin';
  const th = ls.get('theme', 'light');
  view(`
  <div class="ph"><div><h1>Ayarlar</h1><p>Profil, görünüm ve sistem ayarları</p></div></div>
  <div class="g2">
    <div>
      <div class="card mb"><h3>Profil</h3><div class="sub">${esc(S.me.ad)} · @${esc(S.me.username)}</div>
        <form id="pwf"><label class="f">Mevcut şifre</label><input class="inp" type="password" id="pw0" required>
        <label class="f">Yeni şifre</label><input class="inp" type="password" id="pw1" required minlength="4">
        <button class="btn btn-dark" style="margin-top:16px">Şifreyi değiştir</button></form></div>
      <div class="card mb"><h3>Görünüm</h3><div class="sub">Tema tercihi bu tarayıcıda saklanır</div>
        <div class="seg" style="margin-top:14px" id="thSeg">${[['light', 'Açık'], ['dark', 'Koyu'], ['auto', 'Sistem']].map(([v, t]) => `<button data-v="${v}" class="${th === v ? 'on' : ''}">${t}</button>`).join('')}</div></div>
      <div class="card"><h3>Arama varsayılanları</h3>
        <div style="display:grid;gap:10px;margin-top:14px">
          <label class="tg"><input type="checkbox" id="oZ" ${ls.get('optZero', true) ? 'checked' : ''}>Fiyatı 0 olanları gizle</label>
          <label class="tg"><input type="checkbox" id="oS" ${ls.get('optStock', false) ? 'checked' : ''}>Sadece stokta olanları göster</label>
          <label class="tg"><input type="checkbox" id="oP" ${ls.get('stokOnce', true) ? 'checked' : ''}>Sipariş planında stokta olanı önceliklendir</label></div></div>
    </div>
    <div>
      <div class="card mb"><h3>Bağlantı & güvenlik</h3><div class="sub">Toptancı sitelerinde engellenmemek için istekler sıraya alınır ve aralıklı gönderilir.</div>
        <form id="stf"><label class="f">Oturum kontrol aralığı (dakika)</label><input class="inp" type="number" id="ka" min="1" max="60" value="${st.keepAliveDk}" ${isAdmin ? '' : 'disabled'}>
        <label class="f">Aynı siteye istekler arası bekleme (ms)</label><input class="inp" type="number" id="ia" min="0" max="10000" step="100" value="${st.istekAraligiMs}" ${isAdmin ? '' : 'disabled'}>
        <label class="f">Toptancı zaman aşımı (sn)</label><input class="inp" type="number" id="za" min="10" max="120" value="${st.zamanAsimiSn}" ${isAdmin ? '' : 'disabled'}>
        <label class="f">Otomatik kontrol saatleri (takip, kampanya, takipteki sepetler)</label><input class="inp" id="ks" placeholder="09:00,15:00" value="${esc(st.kontrolSaatleri)}" ${isAdmin ? '' : 'disabled'}>
        <label class="f">WhatsApp bildirim numarası <span class="badge teal">Entegre edilebilir</span></label><input class="inp" id="waNo" placeholder="+90 5xx xxx xx xx" value="${esc(st.whatsapp?.numara || '')}" ${isAdmin ? '' : 'disabled'}>
        <div class="small muted" style="margin-top:6px">Mesaj gönderimi için WhatsApp Business API hesabı bağlanması gerekir; numara şimdiden kaydedilir.</div>
        ${isAdmin ? '<button class="btn btn-dark" style="margin-top:16px">Kaydet</button>' : '<div class="small muted" style="margin-top:10px">Sadece yöneticiler değiştirebilir</div>'}</form></div>
      <div class="card"><h3>Hakkında</h3><div class="sub" style="line-height:1.6">Parça-AI PoC v0.2 · hype vision<br>Veritabanı yok: üyeler/ayarlar <span class="mono">data/*.json</span>, geçmiş ve sepet bellekte.<br>Oturum çerezleri <span class="mono">data/sessions</span> altında saklanır, yeniden başlatmada tekrar giriş gerekmez.</div></div>
    </div>
  </div>`);
  $$('#thSeg button').forEach(b => b.onclick = () => { ls.set('theme', b.dataset.v); applyTheme(b.dataset.v); PAGES.ayarlar(); });
  $('#oZ').onchange = e => ls.set('optZero', e.target.checked);
  $('#oS').onchange = e => ls.set('optStock', e.target.checked);
  $('#oP').onchange = e => ls.set('stokOnce', e.target.checked);
  $('#pwf').onsubmit = async e => { e.preventDefault(); try { await api('/api/me/password', { method: 'POST', body: { eski: $('#pw0').value, yeni: $('#pw1').value } }); toast('Şifre değişti'); e.target.reset(); } catch (err) { toast(err.message); } };
  $('#stf').onsubmit = async e => { e.preventDefault(); try { await api('/api/settings', { method: 'POST', body: { keepAliveDk: $('#ka').value, istekAraligiMs: $('#ia').value, zamanAsimiSn: $('#za').value, kontrolSaatleri: $('#ks').value, whatsapp: { aktif: !!$('#waNo').value.trim(), numara: $('#waNo').value } } }); toast('Ayarlar kaydedildi'); } catch (err) { toast(err.message); } };
};

// ================= dışa aktarma =================
function exportXlsx(rows, name) {
  if (!rows.length) return toast('Aktarılacak veri yok');
  const fn = `${name.replace(/[^\w-]+/g, '_')}_${new Date().toISOString().slice(0, 10)}`;
  if (window.XLSX) {
    const ws = XLSX.utils.json_to_sheet(rows), wb = XLSX.utils.book_new();
    ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.min(50, Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length)) + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, 'Veri'); XLSX.writeFile(wb, fn + '.xlsx');
  } else {
    const cols = Object.keys(rows[0]);
    const csv = '﻿' + [cols.join(';'), ...rows.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(';'))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = fn + '.csv'; a.click();
  }
}
function exportPdf(title, sub, head, rows) {
  const w = window.open('', '_blank');
  if (!w) return toast('Açılır pencereye izin ver');
  w.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>body{font-family:Segoe UI,Arial,sans-serif;color:#0b1220;margin:28px}header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #17c1d6;padding-bottom:12px;margin-bottom:16px}
  img{height:22px}h1{font-size:20px;margin:0}p{color:#667;margin:4px 0 0;font-size:12px}table{width:100%;border-collapse:collapse;font-size:11px}
  th{background:#f3f5f9;text-align:left;padding:7px;border-bottom:1px solid #dde}td{padding:7px;border-bottom:1px solid #eef}tr:nth-child(even) td{background:#fafbfd}
  footer{margin-top:18px;font-size:10px;color:#99a}</style></head><body>
  <header><div><h1>${esc(title)}</h1><p>${esc(sub)}</p></div><img src="${location.origin}/img/logo.png"></header>
  <table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
  <footer>Parça-AI · hype vision · ${new Date().toLocaleString('tr-TR')} · ${esc(S.me.ad)}</footer>
  <script>onload=()=>setTimeout(()=>print(),300)<\/script></body></html>`);
  w.document.close();
}
