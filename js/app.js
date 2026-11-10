/* Bento New Tab — logique de la page.
   Règle de sécurité : aucune donnée externe (flux, API) n'est insérée en HTML ;
   tout passe par textContent / createElement, et les liens sont filtrés (http/https). */
'use strict';
function main() {
  const C = window.CONFIG;
  const holidays = C.holidays || [];
  const hasAlternance = Array.isArray(C.schoolWeeks) && C.schoolWeeks.length > 0;
  const L = Object.assign({ deadlines: 'Échéances', progress: 'Progression de l’année' }, C.labels);
  const $ = (s, r = document) => r.querySelector(s);
  const ext = (typeof browser !== 'undefined' && browser.storage && browser.storage.local) ? browser : null;

  /* ---------------- Outils ---------------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style') Object.assign(el.style, v);
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const c of kids.flat()) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : String(c));
    }
    return el;
  }
  const store = {
    async get(k, d) {
      try {
        if (ext) { const r = await ext.storage.local.get(k); return r[k] === undefined ? d : r[k]; }
        const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v);
      } catch (e) { return d; }
    },
    async set(k, v) {
      try { if (ext) await ext.storage.local.set({ [k]: v }); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ }
    },
  };
  const safeUrl = (u) => {
    try { const x = new URL(String(u).trim()); return (x.protocol === 'https:' || x.protocol === 'http:') ? x.href : null; } catch (e) { return null; }
  };
  async function fetchText(url, ms = 12000) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms);
    try {
      const r = await fetch(url, { signal: ac.signal, cache: 'no-cache', credentials: 'omit' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } finally { clearTimeout(t); }
  }

  const DAY = 86400000;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const daysBetween = (a, b) => Math.round((b - a) / DAY);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const fmtDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  const fmtShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
  const fmtLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const fmtWd = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
  function ago(ts) {
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return 'à l’instant';
    if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
    if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
    return rtf.format(-Math.round(s / 86400), 'day');
  }
  function isoWeek(d) {
    const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
    return Math.ceil(((x - y0) / DAY + 1) / 7);
  }
  function hue(str) { let n = 0; for (const ch of str) n = (n * 31 + ch.charCodeAt(0)) % 360; return n; }
  function shade(hex, f = 0.65) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * f));
    return `rgb(${c.join(',')})`;
  }
  const initials = (name) => {
    const w = name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/);
    return (w.length > 1 ? w[0][0] + w[1][0] : w[0][0]).toUpperCase();
  };

  /* ---------------- En-tête : horloge, semaine, progression ---------------- */
  let lastDay = '';
  function tickClock() {
    const n = new Date();
    $('#clock').textContent = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
    const hr = n.getHours();
    $('#greeting').textContent = hr < 5 ? 'Bonne nuit' : hr < 12 ? 'Bonjour' : hr < 18 ? 'Bon après-midi' : hr < 22 ? 'Bonsoir' : 'Bonne nuit';
    const key = iso(n);
    if (key !== lastDay) {
      lastDay = key;
      $('#date').replaceChildren(h('b', null, cap(fmtLong.format(n))), ` · semaine ${isoWeek(n)}`);
      renderWeek(); renderProgress(); renderDeadlines();
    }
  }

  function renderWeek() {
    if (!hasAlternance) { $('.status').hidden = true; return; }
    const t = today0();
    const dow = t.getDay();
    const weekend = dow === 0 || dow === 6;
    const ref = weekend ? addDays(t, dow === 6 ? 2 : 1) : t;
    const prefix = weekend ? 'Semaine prochaine' : 'Cette semaine';
    const wk = C.schoolWeeks.find((w) => parseDay(w.start) <= ref && ref <= parseDay(w.end));
    const pill = $('#week-pill');
    const holiday = holidays.includes(iso(t)) && !weekend;
    if (wk) {
      pill.replaceChildren(
        h('span', null, `${prefix} : `, h('b', { class: 'hl' }, 'école'), ' · ', wk.label, holiday ? ' · férié aujourd’hui' : ''));
      pill.title = '';
    } else {
      const next = C.schoolWeeks.find((w) => parseDay(w.start) > ref);
      pill.replaceChildren(...[
        h('span', null, `${prefix} : `, h('b', null, 'entreprise'), ` · ${C.company}`, holiday ? ' · férié aujourd’hui' : ''),
        next ? h('small', null, `École le ${fmtDay.format(parseDay(next.start))}`) : null].filter(Boolean));
      pill.title = next ? `Prochaine semaine école : ${next.label}` : '';
    }
  }

  function renderProgress() {
    if (!hasAlternance) return;
    const t = today0();
    let total = 0; let done = 0;
    for (const w of C.schoolWeeks) {
      const end = parseDay(w.end);
      for (let d = parseDay(w.start); d <= end; d = addDays(d, 1)) {
        const dw = d.getDay();
        if (dw === 0 || dw === 6 || holidays.includes(iso(d))) continue;
        total++; if (d <= t) done++;
      }
    }
    const pct = total ? (done / total) * 100 : 0;
    $('#ms-progress-txt').textContent = `${done} / ${total} jours école · ${Math.round(pct)} %`;
    requestAnimationFrame(() => { $('#ms-progress-bar').style.width = pct.toFixed(1) + '%'; });
  }

  /* ---------------- Recherche ---------------- */
  function resolveQuery(v) {
    const m = v.match(/^(\S+)\s+(.+)$/);
    const bang = m && C.bangs[m[1].toLowerCase()];
    if (bang) return bang.url.replace('%s', encodeURIComponent(m[2]));
    if (/^https?:\/\//i.test(v)) return safeUrl(v) || C.search.replace('%s', encodeURIComponent(v));
    if (!/\s/.test(v) && /^[\w-]+(\.[\w-]+)+(:\d+)?([/?#].*)?$/.test(v)) return 'https://' + v;
    return C.search.replace('%s', encodeURIComponent(v));
  }
  function setupSearch() {
    const q = $('#q');
    const wrap = $('#bangs');
    for (const [k, b] of Object.entries(C.bangs)) {
      wrap.append(h('button', {
        type: 'button', class: 'bang', title: `${b.label} : taper « ${k} mot-clé »`,
        onclick: () => { q.value = `${k} ${q.value.replace(/^(\S+)\s+/, (all, w) => (C.bangs[w.toLowerCase()] ? '' : all))}`; q.focus(); },
      }, k));
    }
    $('#search').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = q.value.trim();
      if (v) location.href = resolveQuery(v);
    });
    document.addEventListener('keydown', (e) => {
      const tag = document.activeElement && document.activeElement.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') { e.preventDefault(); q.focus(); }
    });
  }

  /* ---------------- Raccourcis ---------------- */
  function letterIcon(l) {
    const c = l.color || `hsl(${hue(l.name)} 60% 50%)`;
    const bg = l.color ? `linear-gradient(135deg, ${c}, ${shade(c)})` : c;
    return h('div', { class: 'ico letter', style: { background: bg } }, initials(l.name));
  }
  function faviconUrls(url) {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' ? [`${u.origin}/apple-touch-icon.png`, `${u.origin}/favicon.ico`] : [];
    } catch (e) { return []; }
  }
  function renderShortcuts() {
    const root = $('#groups');
    for (const g of C.groups) {
      const tiles = g.links.map((l) => {
        let ico;
        // Icône locale, sinon adresse fournie, sinon favicon du site (si activé), sinon pastille
        const sources = l.icon ? [`img/sites/${l.icon}`] : (l.favicon ? [l.favicon] : (C.favicons !== false ? faviconUrls(l.url) : []));
        if (sources.length) {
          const img = h('img', { alt: '', decoding: 'async', referrerpolicy: 'no-referrer' });
          ico = h('div', { class: 'ico' }, img);
          let i = 0;
          const next = () => { if (i < sources.length) img.src = sources[i++]; else ico.replaceWith(letterIcon(l)); };
          img.addEventListener('error', next);
          img.addEventListener('load', () => { if (img.naturalWidth < 8) next(); });
          next();
        } else {
          ico = letterIcon(l);
        }
        return h('a', { class: 'sc', href: l.url, title: l.title || l.name }, ico, h('span', null, l.name));
      });
      const grp = h('div', { class: 'group' },
        h('p', { class: 'group-title' }, g.name),
        h('div', { class: 'tiles' }, tiles));
      root.append(grp);
    }
  }

  /* ---------------- Échéances ---------------- */
  function renderDeadlines() {
    const t = today0();
    const items = C.deadlines
      .map((d) => ({ ...d, s: parseDay(d.date), e: parseDay(d.end || d.date) }))
      .filter((d) => d.e >= t)
      .sort((a, b) => a.s - b.s);
    const ul = $('#deadlines');
    $('#dl-meta').textContent = items.length ? `${items.length} à venir` : '';
    ul.replaceChildren(...items.map((d, idx) => {
      const n = daysBetween(t, d.s);
      const cd = n <= 0 ? h('div', { class: 'cd' }, h('b', null, n < 0 ? 'En' : 'Auj.'), h('small', null, n < 0 ? 'cours' : ''))
        : h('div', { class: 'cd' }, h('b', null, n), h('small', null, n > 1 ? 'jours' : 'jour'));
      const cls = 'dl' + (idx === 0 ? ' featured' : '') + (n <= 3 ? ' urgent' : n <= 10 ? ' soon' : '');
      const when = cap(fmtDay.format(d.s)) + (d.end ? ` → ${fmtDay.format(d.e)}` : '') + (d.s.getFullYear() !== t.getFullYear() ? ` ${d.s.getFullYear()}` : '');
      return h('li', { class: cls, title: d.note || null }, cd,
        h('div', null,
          h('div', { class: 't' }, d.title),
          h('div', { class: 'm' }, h('span', null, when),
            d.tag ? h('span', { class: 'badge violet' }, d.tag) : null,
            d.where ? h('span', null, '· ' + d.where) : null,
            d.unsure ? h('span', { class: 'unsure', title: d.note || 'À confirmer' }, 'à confirmer') : null)));
    }));
    if (!items.length) ul.append(h('li', { class: 'empty' }, 'Plus aucune échéance enregistrée.'));
  }

  /* ---------------- Météo ---------------- */
  const WMO = {
    0: ['Ciel dégagé', 'clear'], 1: ['Plutôt dégagé', 'partly'], 2: ['Partiellement nuageux', 'partly'], 3: ['Couvert', 'cloud'],
    45: ['Brouillard', 'fog'], 48: ['Brouillard givrant', 'fog'],
    51: ['Bruine légère', 'drizzle'], 53: ['Bruine', 'drizzle'], 55: ['Bruine dense', 'drizzle'], 56: ['Bruine verglaçante', 'drizzle'], 57: ['Bruine verglaçante', 'drizzle'],
    61: ['Pluie faible', 'rain'], 63: ['Pluie', 'rain'], 65: ['Forte pluie', 'rain'], 66: ['Pluie verglaçante', 'rain'], 67: ['Pluie verglaçante', 'rain'],
    71: ['Neige faible', 'snow'], 73: ['Neige', 'snow'], 75: ['Forte neige', 'snow'], 77: ['Grains de neige', 'snow'],
    80: ['Averses', 'rain'], 81: ['Averses', 'rain'], 82: ['Fortes averses', 'rain'], 85: ['Averses de neige', 'snow'], 86: ['Averses de neige', 'snow'],
    95: ['Orage', 'storm'], 96: ['Orage et grêle', 'storm'], 99: ['Orage et grêle', 'storm'],
  };
  const wxLabel = (c) => (WMO[c] || ['—'])[0];
  function wxIcon(code, day = 1) {
    const k = (WMO[code] || ['', 'cloud'])[1];
    if (k === 'clear') return day ? 'sun' : 'moon';
    if (k === 'partly') return day ? 'partly-day' : 'partly-night';
    return k;
  }
  const wxImg = (code, day, cls) => h('img', { src: `img/wx/${wxIcon(code, day)}.svg`, alt: wxLabel(code), class: cls || null });
  let city = null;

  async function loadWeather(force) {
    city = await store.get('wx:city', C.weatherDefault);
    $('#city-name').textContent = city.name;
    const key = `wx:data:${city.lat.toFixed(3)},${city.lon.toFixed(3)}`;
    const cached = await store.get(key, null);
    if (cached) renderWeather(cached.data);
    if (!force && cached && Date.now() - cached.ts < 20 * 60 * 1000) return;
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + city.lat + '&longitude=' + city.lon +
      '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,is_day' +
      '&hourly=temperature_2m,weather_code,precipitation_probability,is_day' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
      '&timezone=auto&forecast_days=6';
    try {
      const data = JSON.parse(await fetchText(url));
      await store.set(key, { ts: Date.now(), data });
      renderWeather(data);
    } catch (e) {
      if (!cached) $('#wx-now').replaceChildren(h('p', { class: 'empty' }, 'Météo indisponible pour le moment.'));
    }
  }

  function skyOf(code, day) {
    const k = (WMO[code] || ['', 'cloud'])[1];
    if (k === 'clear' || k === 'partly') return day ? 'clear-day' : 'clear-night';
    if (k === 'drizzle') return 'rain';
    return k;
  }
  function renderWeather(d) {
    const c = d.current;
    $('#weather-card').dataset.sky = skyOf(c.weather_code, c.is_day);
    $('#wx-now').replaceChildren(
      wxImg(c.weather_code, c.is_day),
      h('div', { class: 'wx-temp' }, Math.round(c.temperature_2m), h('sup', null, '°C')),
      h('div', { class: 'wx-desc' }, h('b', null, wxLabel(c.weather_code)),
        h('br'), `Ressenti ${Math.round(c.apparent_temperature)}° · vent ${Math.round(c.wind_speed_10m)} km/h · ${c.relative_humidity_2m} %`));
    // Prochaines heures : toutes les 2 h sur 12 h
    const nowKey = c.time.slice(0, 13);
    let i0 = d.hourly.time.findIndex((t) => t.slice(0, 13) === nowKey);
    if (i0 < 0) i0 = 0;
    const hours = [];
    for (let k = 1; k <= 11 && hours.length < 6; k += 2) {
      const i = i0 + k; if (i >= d.hourly.time.length) break;
      const p = d.hourly.precipitation_probability ? d.hourly.precipitation_probability[i] : null;
      hours.push(h('div', { class: 'wx-h' },
        h('span', null, d.hourly.time[i].slice(11, 13) + 'h'),
        wxImg(d.hourly.weather_code[i], d.hourly.is_day ? d.hourly.is_day[i] : 1),
        h('b', null, Math.round(d.hourly.temperature_2m[i]) + '°'),
        h('small', null, p != null && p >= 20 ? p + ' %' : '')));
    }
    $('#wx-hours').replaceChildren(...hours);
    // Jours
    const n = Math.min(5, d.daily.time.length);
    const lo = d.daily.temperature_2m_min.slice(0, n); const hi = d.daily.temperature_2m_max.slice(0, n);
    const gmin = Math.min(...lo); const gmax = Math.max(...hi); const span = Math.max(1, gmax - gmin);
    const rows = [];
    for (let i = 0; i < n; i++) {
      const date = parseDay(d.daily.time[i]);
      const left = ((lo[i] - gmin) / span) * 100; const width = Math.max(6, ((hi[i] - lo[i]) / span) * 100);
      rows.push(h('div', { class: 'wx-d', title: wxLabel(d.daily.weather_code[i]) + (d.daily.precipitation_probability_max ? ` · pluie ${d.daily.precipitation_probability_max[i]} %` : '') },
        h('span', null, i === 0 ? 'Auj.' : cap(fmtWd.format(date))),
        wxImg(d.daily.weather_code[i], 1),
        h('span', { class: 'lo' }, Math.round(lo[i]) + '°'),
        h('div', { class: 'wx-bar' }, h('span', { style: { left: left + '%', width: Math.min(100 - left, width) + '%' } })),
        h('span', { class: 'hi' }, Math.round(hi[i]) + '°')));
    }
    $('#wx-days').replaceChildren(...rows);
  }

  function setupCitySearch() {
    const box = $('#city-search'); const input = $('#city-q'); const res = $('#city-results');
    let timer = null;
    $('#city-btn').addEventListener('click', () => { box.hidden = !box.hidden; if (!box.hidden) { input.value = ''; res.replaceChildren(); input.focus(); } });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') box.hidden = true; });
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { res.replaceChildren(); return; }
      timer = setTimeout(async () => {
        try {
          const j = JSON.parse(await fetchText(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=fr&format=json`));
          const list = (j.results || []).map((r) => h('li', null, h('button', {
            type: 'button',
            onclick: async () => {
              await store.set('wx:city', { name: r.name, admin: r.admin1 || '', lat: r.latitude, lon: r.longitude });
              box.hidden = true; loadWeather(true);
            },
          }, r.name, h('small', null, [r.admin2 || r.admin1, r.country].filter(Boolean).join(', ')))));
          res.replaceChildren(...(list.length ? list : [h('li', { class: 'empty' }, 'Aucune ville trouvée.')]));
        } catch (e) { res.replaceChildren(h('li', { class: 'empty' }, 'Recherche indisponible.')); }
      }, 350);
    });
  }

  /* ---------------- Flux RSS / Atom ---------------- */
  function parseFeed(xml, src, max = 8) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return [];
    let nodes = [...doc.getElementsByTagName('item')]; let atom = false;
    if (!nodes.length) { nodes = [...doc.getElementsByTagName('entry')]; atom = true; }
    const txt = (el, tag) => { const n = el.getElementsByTagName(tag)[0]; return n ? n.textContent.trim() : ''; };
    const out = [];
    for (const it of nodes.slice(0, max)) {
      let link = '';
      if (atom) {
        const links = [...it.getElementsByTagName('link')];
        const alt = links.find((l) => !l.getAttribute('rel') || l.getAttribute('rel') === 'alternate') || links[0];
        link = alt ? alt.getAttribute('href') : '';
      } else {
        link = txt(it, 'link') || txt(it, 'guid');
      }
      const url = safeUrl(link);
      const title = txt(it, 'title').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      const dateStr = txt(it, 'pubDate') || txt(it, 'published') || txt(it, 'updated') || txt(it, 'dc:date');
      const ts = Date.parse(dateStr) || 0;
      if (url && title) out.push({ title: title.slice(0, 240), url, ts, src: src.name || src.kind, lang: src.lang || 'fr', kind: src.kind || null });
    }
    return out;
  }

  /* ---------------- Actus ---------------- */
  const NEWS_TTL = 30 * 60 * 1000;
  let newsTab = 'cyber'; const newsCache = {};

  function renderNews() {
    const data = newsCache[newsTab];
    const ul = $('#news-list');
    if (!data) { ul.replaceChildren(...Array.from({ length: 8 }, () => h('li', { class: 'skel' }))); return; }
    const items = data.items.slice(0, 30);
    ul.replaceChildren(...items.map((it) => h('li', null, h('a', { href: it.url, rel: 'noreferrer' },
      h('span', { class: 't' }, it.title),
      h('span', { class: 'm' },
        h('span', { class: 'src' }, it.src),
        it.lang === 'fr' ? h('span', { class: 'lang' }, 'FR') : null,
        it.ts ? h('span', null, '· ' + ago(it.ts)) : null)))));
    if (!items.length) ul.append(h('li', { class: 'empty' }, 'Aucune actu récupérée (réseau ou sources indisponibles).'));
    const meta = $('#news-meta');
    meta.textContent = 'Mis à jour ' + ago(data.ts) + (data.failed.length ? ` · ${data.failed.length} source(s) indisponible(s)` : '');
    meta.title = data.failed.length ? 'Indisponible : ' + data.failed.join(', ') : '';
  }

  async function loadNews(tab, force) {
    const key = 'news:' + tab;
    if (!newsCache[tab]) newsCache[tab] = await store.get(key, null);
    if (tab === newsTab) renderNews();
    const cached = newsCache[tab];
    if (!force && cached && Date.now() - cached.ts < NEWS_TTL) return;
    const btn = $('#news-refresh'); btn.classList.add('spin');
    const feeds = C.feeds[tab];
    const res = await Promise.allSettled(feeds.map(async (f) => parseFeed(await fetchText(f.url), f)));
    const items = []; const failed = []; const seen = new Set();
    res.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value.length) {
        for (const it of r.value) { if (!seen.has(it.url)) { seen.add(it.url); items.push(it); } }
      } else failed.push(feeds[i].name);
    });
    items.sort((a, b) => b.ts - a.ts);
    btn.classList.remove('spin');
    if (!items.length && cached) return;
    newsCache[tab] = { ts: Date.now(), items: items.slice(0, 40), failed };
    await store.set(key, newsCache[tab]);
    if (tab === newsTab) renderNews();
  }

  function setupNews() {
    for (const b of document.querySelectorAll('#news-tabs button')) {
      b.addEventListener('click', async () => {
        document.querySelectorAll('#news-tabs button').forEach((x) => x.classList.toggle('on', x === b));
        newsTab = b.dataset.tab;
        $('#news-list').scrollTop = 0;
        await store.set('news:tab', newsTab);
        loadNews(newsTab, false);
      });
    }
    $('#news-refresh').addEventListener('click', () => { loadNews(newsTab, true); loadAlerts(true); });
  }

  /* ---------------- Alertes cyber : CERT-FR + CISA KEV ---------------- */
  function renderCertfr(data) {
    const ul = $('#certfr-list');
    if (!data || !data.items.length) { ul.replaceChildren(h('li', { class: 'empty' }, data ? 'Flux CERT-FR indisponible.' : 'Chargement…')); return; }
    const recent = Date.now() - 30 * DAY;
    const alertes = data.items.filter((i) => i.kind === 'Alerte' && i.ts > recent);
    const avis = data.items.filter((i) => i.kind !== 'Alerte');
    const list = [...alertes.slice(0, 2), ...avis].slice(0, 5);
    ul.replaceChildren(...list.map((it) => h('li', null, h('a', { href: it.url, rel: 'noreferrer' },
      h('span', { class: 't' }, it.title.replace(/\s*\(\d{1,2}\s+\S+\s+\d{4}\)\s*$/, '')),
      h('span', { class: 'm' }, h('span', { class: 'badge ' + (it.kind === 'Alerte' ? 'red' : 'amber') }, it.kind),
        it.ts ? h('span', null, ago(it.ts)) : null)))));
  }
  function renderKev(data) {
    const ul = $('#kev-list');
    if (!data || !data.items.length) { ul.replaceChildren(h('li', { class: 'empty' }, data ? 'Catalogue KEV indisponible.' : 'Chargement…')); return; }
    ul.replaceChildren(...data.items.map((v) => h('li', null, h('a', { href: `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(v.cve)}`, rel: 'noreferrer', title: `${v.vendor} ${v.product}` },
      h('span', { class: 't' }, v.name || `${v.vendor} ${v.product}`),
      h('span', { class: 'm' }, h('span', { class: 'cve' }, v.cve),
        h('span', null, 'ajoutée le ' + fmtShort.format(parseDay(v.added))),
        v.ransomware ? h('span', { class: 'badge red' }, 'Rançongiciel') : null)))));
  }
  async function loadAlerts(force) {
    let cert = await store.get('certfr', null);
    let kev = await store.get('kev', null);
    renderCertfr(cert); renderKev(kev);
    const stamp = () => { const ts = Math.min(cert ? cert.ts : Date.now(), kev ? kev.ts : Date.now()); $('#alerts-meta').textContent = 'Mis à jour ' + ago(ts); };
    if (cert || kev) stamp();
    const jobs = [];
    if (force || !cert || Date.now() - cert.ts > 60 * 60 * 1000) {
      jobs.push(Promise.allSettled(C.certfr.map(async (f) => parseFeed(await fetchText(f.url), f, 10))).then(async (res) => {
        const items = res.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).sort((a, b) => b.ts - a.ts);
        if (!items.length) return;
        cert = { ts: Date.now(), items }; await store.set('certfr', cert); renderCertfr(cert);
      }));
    }
    if (force || !kev || Date.now() - kev.ts > 6 * 60 * 60 * 1000) {
      jobs.push(fetchText(C.kev, 20000).then(async (txt) => {
        const j = JSON.parse(txt);
        const items = (j.vulnerabilities || [])
          .filter((v) => /^CVE-\d{4}-\d{4,}$/.test(v.cveID || ''))
          .sort((a, b) => String(b.dateAdded).localeCompare(String(a.dateAdded)))
          .slice(0, 5)
          .map((v) => ({ cve: v.cveID, vendor: String(v.vendorProject || '').slice(0, 60), product: String(v.product || '').slice(0, 60),
            name: String(v.vulnerabilityName || '').slice(0, 200), added: /^\d{4}-\d{2}-\d{2}$/.test(v.dateAdded) ? v.dateAdded : iso(new Date()),
            ransomware: v.knownRansomwareCampaignUse === 'Known' }));
        kev = { ts: Date.now(), items }; await store.set('kev', kev); renderKev(kev);
      }).catch(() => { if (!kev) renderKev({ items: [] }); }));
    }
    if (jobs.length) { await Promise.allSettled(jobs); if (!cert) renderCertfr({ items: [] }); stamp(); }
  }

  /* ---------------- Pomodoro ---------------- */
  const DUR = { focus: 25 * 60000, short: 5 * 60000, long: 15 * 60000 };
  const RING = 2 * Math.PI * 52;
  let pomo = { mode: 'focus', count: 0, running: false, endAt: null, remaining: DUR.focus };
  let pomoTimer = null;

  const nextMode = (p) => (p.mode === 'focus' ? ((p.count + 1) % 4 === 0 ? 'long' : 'short') : 'focus');
  function notifText(p) {
    const n = nextMode(p);
    if (p.mode === 'focus') return { title: 'Session de focus terminée', body: n === 'long' ? 'Bravo, 4 sessions ! Grande pause de 15 min.' : 'Prends 5 minutes de pause.' };
    return { title: 'Pause terminée', body: 'On reprend : 25 minutes de focus.' };
  }
  function send(msg) { if (ext && ext.runtime && ext.runtime.sendMessage) ext.runtime.sendMessage(msg).catch(() => {}); }

  function renderPomo() {
    const left = pomo.running ? Math.max(0, pomo.endAt - Date.now()) : pomo.remaining;
    const total = DUR[pomo.mode];
    const s = Math.ceil(left / 1000);
    const txt = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
    $('#pomo-time').textContent = txt;
    $('#pomo-cycle').textContent = pomo.mode === 'focus' ? `Session ${(pomo.count % 4) + 1}/4` : pomo.mode === 'short' ? 'Petite pause' : 'Grande pause';
    const ring = $('#pomo-ring');
    ring.style.strokeDasharray = RING.toFixed(2);
    ring.style.strokeDashoffset = (RING * (1 - left / total)).toFixed(2);
    $('#pomo-start').textContent = pomo.running ? 'Pause' : (left < total ? 'Reprendre' : 'Démarrer');
    $('#pomo-card').classList.toggle('running', pomo.running);
    document.querySelectorAll('#pomo-modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === pomo.mode));
    document.title = pomo.running ? `${txt} · ${pomo.mode === 'focus' ? 'Focus' : 'Pause'}` : 'Accueil';
  }
  async function savePomo() { await store.set('pomo', pomo); }
  async function completePomo() {
    const fresh = await store.get('pomo', pomo);
    if (fresh.running && fresh.endAt === pomo.endAt) {
      const n = nextMode(fresh);
      pomo = { mode: n, count: fresh.mode === 'focus' ? fresh.count + 1 : fresh.count, running: false, endAt: null, remaining: DUR[n] };
      await savePomo();
    } else { pomo = fresh; }
    syncPomoTimer(); renderPomo();
  }
  function syncPomoTimer() {
    clearInterval(pomoTimer); pomoTimer = null;
    if (pomo.running) {
      pomoTimer = setInterval(() => { if (Date.now() >= pomo.endAt) completePomo(); else renderPomo(); }, 250);
    }
  }
  async function setupPomo() {
    pomo = await store.get('pomo', pomo);
    if (pomo.running && Date.now() >= pomo.endAt) await completePomo();
    $('#pomo-start').addEventListener('click', async () => {
      if (pomo.running) {
        pomo.remaining = Math.max(0, pomo.endAt - Date.now()); pomo.running = false; pomo.endAt = null;
        send({ type: 'pomo-cancel' });
      } else {
        pomo.endAt = Date.now() + pomo.remaining; pomo.running = true;
        send({ type: 'pomo-schedule', when: pomo.endAt, ...notifText(pomo) });
      }
      await savePomo(); syncPomoTimer(); renderPomo();
    });
    $('#pomo-reset').addEventListener('click', async () => {
      pomo = { ...pomo, running: false, endAt: null, remaining: DUR[pomo.mode] };
      send({ type: 'pomo-cancel' }); await savePomo(); syncPomoTimer(); renderPomo();
    });
    $('#pomo-skip').addEventListener('click', async () => {
      const n = nextMode(pomo);
      pomo = { mode: n, count: pomo.mode === 'focus' ? pomo.count + 1 : pomo.count, running: false, endAt: null, remaining: DUR[n] };
      send({ type: 'pomo-cancel' }); await savePomo(); syncPomoTimer(); renderPomo();
    });
    for (const b of document.querySelectorAll('#pomo-modes button')) {
      b.addEventListener('click', async () => {
        pomo = { ...pomo, mode: b.dataset.mode, running: false, endAt: null, remaining: DUR[b.dataset.mode] };
        send({ type: 'pomo-cancel' }); await savePomo(); syncPomoTimer(); renderPomo();
      });
    }
    syncPomoTimer(); renderPomo();
  }

  /* ---------------- To-do ---------------- */
  let todos = [];
  function renderTodos() {
    const ul = $('#todo-list');
    ul.replaceChildren(...todos.map((t) => {
      const cb = h('input', { type: 'checkbox', 'aria-label': 'Terminé' });
      cb.checked = !!t.done;
      cb.addEventListener('change', async () => { t.done = cb.checked; await store.set('todos', todos); renderTodos(); });
      return h('li', { class: t.done ? 'done' : null }, cb, h('span', null, t.text),
        h('button', { type: 'button', title: 'Supprimer', 'aria-label': 'Supprimer', onclick: async () => { todos = todos.filter((x) => x !== t); await store.set('todos', todos); renderTodos(); } }, '×'));
    }));
    const left = todos.filter((t) => !t.done).length;
    $('#todo-meta').textContent = todos.length ? `${left} restante${left > 1 ? 's' : ''}` : '';
    $('#todo-clear').hidden = !todos.some((t) => t.done);
  }
  async function setupTodos() {
    todos = await store.get('todos', []);
    $('#todo-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = $('#todo-in').value.trim();
      if (!v) return;
      todos.push({ id: Date.now(), text: v.slice(0, 200), done: false });
      $('#todo-in').value = '';
      await store.set('todos', todos); renderTodos();
    });
    $('#todo-clear').addEventListener('click', async () => { todos = todos.filter((t) => !t.done); await store.set('todos', todos); renderTodos(); });
    renderTodos();
  }

  /* ---------------- Synchronisation entre onglets ---------------- */
  if (ext && ext.storage.onChanged) {
    ext.storage.onChanged.addListener((ch, area) => {
      if (area !== 'local') return;
      if (ch.todos && ch.todos.newValue) { todos = ch.todos.newValue; renderTodos(); }
      if (ch.pomo && ch.pomo.newValue) { pomo = ch.pomo.newValue; syncPomoTimer(); renderPomo(); }
    });
  }

  /* ---------------- Thème clair / sombre ---------------- */
  function setupTheme() {
    const root = document.documentElement;
    const btn = $('#theme-btn');
    const label = () => {
      const t = root.dataset.theme === 'light' ? 'Passer en sombre' : 'Passer en clair';
      btn.title = t; btn.setAttribute('aria-label', t);
    };
    const saved = () => { try { return localStorage.getItem('theme'); } catch (e) { return null; } };
    btn.addEventListener('click', () => {
      const next = root.dataset.theme === 'light' ? 'dark' : 'light';
      root.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch (e) { /* stockage indisponible */ }
      label();
    });
    // Autres onglets ouverts : même thème
    window.addEventListener('storage', (e) => {
      if (e.key === 'theme' && (e.newValue === 'light' || e.newValue === 'dark')) { root.dataset.theme = e.newValue; label(); }
    });
    // Sans choix enregistré : suit Windows en direct
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', () => { if (!saved()) { root.dataset.theme = mq.matches ? 'light' : 'dark'; label(); } });
    label();
  }

  /* ---------------- Démarrage ---------------- */
  renderShortcuts();
  $('#dl-title').textContent = L.deadlines;
  $('#progress-label').textContent = L.progress;
  setupTheme();
  setupSearch();
  tickClock(); setInterval(tickClock, 1000);
  setupTodos();
  setupPomo();
  setupCitySearch();
  setupNews();
  loadWeather(false);
  store.get('news:tab', 'cyber').then((tab) => {
    newsTab = C.feeds[tab] ? tab : 'cyber';
    document.querySelectorAll('#news-tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === newsTab));
    loadNews(newsTab, false);
  });
  loadAlerts(false);
  // Rafraîchir les données si l'onglet reste ouvert longtemps
  setInterval(() => { loadWeather(false); loadNews(newsTab, false); loadAlerts(false); }, 15 * 60 * 1000);
}

/* Configuration perso facultative (js/config.local.js, ignorée par Git), puis démarrage */
(() => {
  const s = document.createElement('script');
  s.src = 'js/config.local.js';
  s.onload = main; s.onerror = main;
  document.head.append(s);
})();
