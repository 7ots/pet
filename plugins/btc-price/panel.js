// BTC price (7ots plugin): CoinGecko's free API, the price every 60 s and the 24 h chart every 5 min.
// It runs in its own sandboxed window and can only reach api.coingecko.com (see 7ots-plugin.json "net").
const API = 'https://api.coingecko.com/api/v3';
const $ = (id) => document.getElementById(id);
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
const lang = (navigator.language || 'en').slice(0, 2);
let vs = store.get('vs') || ({ es: 'usd', pt: 'brl' }[lang] || 'usd');
$('vs').value = vs;

const money = (n) => new Intl.NumberFormat(navigator.language, { style: 'currency', currency: vs.toUpperCase(), maximumFractionDigits: n >= 1000 ? 0 : 2 }).format(n);

async function price() {
  try {
    const r = await fetch(`${API}/simple/price?ids=bitcoin&vs_currencies=${vs}&include_24hr_change=true`);
    if (!r.ok) throw new Error(r.status === 429 ? 'busy' : `HTTP ${r.status}`);
    const b = (await r.json()).bitcoin;
    const p = b[vs];
    const ch = b[`${vs}_24h_change`];
    $('price').classList.remove('err');
    $('price').textContent = money(p);
    $('change').textContent = Number.isFinite(ch) ? `${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch).toFixed(2)} % · 24 h` : '';
    $('change').className = `change ${ch >= 0 ? 'up' : 'down'}`;
    $('at').textContent = new Date().toLocaleTimeString(navigator.language, { hour: '2-digit', minute: '2-digit' });
    document.title = `₿ ${money(p)}`;
  } catch (e) {
    if ($('price').textContent === '…') {
      $('price').textContent = e.message === 'busy' ? 'CoinGecko busy, retrying…' : 'No connection';
      $('price').classList.add('err');
    }
  }
}

async function chart() {
  try {
    const r = await fetch(`${API}/coins/bitcoin/market_chart?vs_currency=${vs}&days=1`);
    if (!r.ok) return;
    const pts = (await r.json()).prices || [];
    if (pts.length < 2) return;
    const ys = pts.map((p) => p[1]);
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    const W = 280, H = 60;
    const xy = pts.map((p, i) => [(i / (pts.length - 1)) * W, H - 4 - ((p[1] - lo) / (hi - lo || 1)) * (H - 8)]);
    const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
    $('line').setAttribute('d', d);
    $('area').setAttribute('d', `${d}L${W},${H}L0,${H}Z`);
  } catch {}
}

$('vs').addEventListener('change', (e) => {
  vs = e.target.value;
  store.set('vs', vs);
  $('price').textContent = '…';
  price();
  chart();
});

price();
chart();
setInterval(price, 60_000);
setInterval(chart, 5 * 60_000);
