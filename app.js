/* Latschding – Wander- & Radeltour-Tracker */
(function () {
  'use strict';

  var LS_CONFIG = 'latschding-config';
  var LS_CACHE = 'latschding-cache';
  var LS_DEMO = 'latschding-demo';
  var LS_DEMODATA = 'latschding-demodata';

  var ARTS = ['Wandern', 'Radeln'];
  var ART_ICON = { Wandern: '🥾', Radeln: '🚴' };
  var MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

  var state = {
    config: readJson(LS_CONFIG) || { url: '', token: '' },
    demo: localStorage.getItem(LS_DEMO) === '1',
    data: { tours: [], goals: [] },
    view: 'eingabe',
    formArt: 'Wandern',
    diary: { art: '', search: '', year: '' },
    cockpitYear: null,
    chartsYear: null,
    cumArt: 'Wandern',
    monthMetric: 'km',
    statArt: 'Wandern',
    statYear: '',
    importRows: null,
    charts: {}
  };

  // ---------- Utilities ----------

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.hidden = true; }, 3000);
  }
  function fmtKm(v, digits) {
    return v.toLocaleString('de-DE', {
      minimumFractionDigits: digits === undefined ? 1 : digits,
      maximumFractionDigits: digits === undefined ? 1 : digits
    });
  }
  function fmtInt(v) { return Math.round(v).toLocaleString('de-DE'); }
  function fmtDur(min) {
    if (!min) return '–';
    var h = Math.floor(min / 60), m = Math.round(min % 60);
    return h + ':' + (m < 10 ? '0' : '') + m;
  }
  function fmtDurLong(min) {
    if (!min) return '–';
    var h = Math.floor(min / 60), m = Math.round(min % 60);
    return h + ' h ' + (m < 10 ? '0' : '') + m + ' min';
  }
  function fmtDate(iso) {
    var p = iso.split('-');
    return p[2] + '.' + p[1] + '.' + p[0];
  }
  function parseNum(s) {
    if (s === null || s === undefined) return NaN;
    s = String(s).trim().replace(/\./g, function (m, i, str) {
      // Punkt nur als Tausendertrenner werten, wenn auch ein Komma vorkommt
      return str.indexOf(',') >= 0 ? '' : m;
    }).replace(',', '.');
    return s === '' ? NaN : Number(s);
  }
  function parseTimeToMin(s) {
    if (s === null || s === undefined) return 0;
    s = String(s).trim();
    if (s === '') return 0;
    var m = s.match(/^(\d{1,2})[:.,](\d{1,2})(?::\d{1,2})?$/);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    if (/^\d{1,3}$/.test(s)) return Number(s); // reine Minuten
    return 0;
  }
  function parseDateFlexible(s) {
    s = String(s).trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
    if (m) {
      var y = m[3].length === 2 ? '20' + m[3] : m[3];
      return y + '-' + pad2(m[2]) + '-' + pad2(m[1]);
    }
    return null;
  }
  function pad2(n) { return (Number(n) < 10 ? '0' : '') + Number(n); }
  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function artColor(art) {
    return cssVar(art === 'Wandern' ? '--series-wandern' : '--series-radeln');
  }
  function dupKey(t) {
    return t.datum + '|' + t.art + '|' + String(t.tour).trim().toLowerCase() + '|' + (Math.round(t.km * 100) / 100);
  }
  function speedLabel(art) { return art === 'Radeln' ? 'Fahrzeit' : 'Gehzeit'; }

  // ---------- Daten laden / API ----------

  function setSync(txt) { $('syncStatus').textContent = txt; }

  function apiGet() {
    var url = state.config.url + '?token=' + encodeURIComponent(state.config.token);
    return fetch(url).then(function (r) { return r.json(); });
  }
  function apiPost(body) {
    body.token = state.config.token;
    // String-Body ohne Content-Type-Header → kein CORS-Preflight (wie FinOne)
    return fetch(state.config.url, { method: 'POST', body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }

  /** Datum in beliebiger Form → 'YYYY-MM-DD' (Sicherheitsnetz für alte Script-Versionen
   *  oder von Hand ins Sheet getippte Zeilen). */
  function normIso(v) {
    var s = String(v == null ? '' : v).trim();
    var iso = parseDateFlexible(s);
    if (iso) return iso;
    var d = new Date(s);
    if (!isNaN(d.getTime())) {
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }
    return s;
  }

  function applyData(data) {
    data.tours.forEach(function (t) { t.datum = normIso(t.datum); });
    data.tours.sort(function (a, b) { return a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0; });
    state.data = data;
    localStorage.setItem(LS_CACHE, JSON.stringify(data));
    renderAll();
  }

  function loadRemote(showMsg) {
    if (state.demo) { renderAll(); return Promise.resolve(); }
    if (!state.config.url || !state.config.token) {
      setSync('⚙️ nicht verbunden');
      renderAll();
      return Promise.resolve();
    }
    setSync('⏳ lädt…');
    return apiGet().then(function (res) {
      if (!res.ok) throw new Error(res.error || 'Fehler');
      applyData(res.data);
      setSync('🟢 verbunden');
      if (showMsg) toast('Verbunden – ' + res.data.tours.length + ' Touren geladen');
    }).catch(function (err) {
      setSync('🔴 offline (Cache)');
      if (showMsg) toast('Fehler: ' + err.message);
      renderAll();
    });
  }

  /** Aktion ausführen: im Demo-Modus lokal, sonst via Apps Script. */
  function runAction(body) {
    if (state.demo) {
      demoAction(body);
      localStorage.setItem(LS_DEMODATA, JSON.stringify(state.data));
      applyData(state.data);
      return Promise.resolve({ ok: true });
    }
    if (!state.config.url) {
      toast('Bitte erst unter Setup verbinden oder Demo-Modus starten');
      return Promise.reject(new Error('nicht verbunden'));
    }
    setSync('⏳ speichert…');
    return apiPost(body).then(function (res) {
      if (!res.ok) throw new Error(res.error || 'Fehler');
      applyData(res.data);
      setSync('🟢 verbunden');
      return res;
    }).catch(function (err) {
      setSync('🔴 Fehler');
      toast('Fehler: ' + err.message);
      throw err;
    });
  }

  function demoAction(body) {
    var d = state.data;
    if (body.action === 'addTour') {
      body.tour.id = 'd' + Date.now() + Math.floor(Math.random() * 1000);
      d.tours.push(body.tour);
    } else if (body.action === 'updateTour') {
      for (var i = 0; i < d.tours.length; i++) {
        if (d.tours[i].id === body.id) { body.tour.id = body.id; d.tours[i] = body.tour; }
      }
    } else if (body.action === 'deleteTour') {
      d.tours = d.tours.filter(function (t) { return t.id !== body.id; });
    } else if (body.action === 'importTours') {
      var keys = {};
      d.tours.forEach(function (t) { keys[dupKey(t)] = true; });
      var imported = 0, skipped = 0;
      body.tours.forEach(function (t) {
        var k = dupKey(t);
        if (keys[k]) { skipped++; return; }
        keys[k] = true;
        t.id = 'd' + Date.now() + Math.floor(Math.random() * 100000) + imported;
        d.tours.push(t);
        imported++;
      });
      toast(imported + ' importiert, ' + skipped + ' Duplikate übersprungen');
    } else if (body.action === 'saveGoal') {
      var found = false;
      d.goals.forEach(function (g) {
        if (g.jahr === body.jahr && g.art === body.art) { g.ziel = body.ziel; found = true; }
      });
      if (!found) d.goals.push({ jahr: body.jahr, art: body.art, ziel: body.ziel });
    }
  }

  // ---------- Abgeleitete Daten ----------

  function allYears() {
    var ys = {};
    state.data.tours.forEach(function (t) { ys[t.datum.slice(0, 4)] = true; });
    ys[String(new Date().getFullYear())] = true;
    return Object.keys(ys).sort().reverse();
  }
  function toursOf(year, art) {
    return state.data.tours.filter(function (t) {
      return (!year || t.datum.slice(0, 4) === String(year)) && (!art || t.art === art);
    });
  }
  function goalFor(year, art) {
    var g = state.data.goals.filter(function (g) {
      return g.jahr === Number(year) && g.art === art;
    })[0];
    return g ? g.ziel : 0;
  }
  function sum(arr, f) { return arr.reduce(function (s, x) { return s + f(x); }, 0); }
  function daysInYear(y) { return (Number(y) % 4 === 0 && (Number(y) % 100 !== 0 || Number(y) % 400 === 0)) ? 366 : 365; }
  function dayOfYear(iso) {
    var d = new Date(iso + 'T12:00:00');
    return Math.round((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  }

  // ---------- Navigation ----------

  function switchView(v) {
    state.view = v;
    document.querySelectorAll('.tabbar button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === v);
    });
    document.querySelectorAll('.view').forEach(function (s) {
      s.classList.toggle('active', s.id === 'view-' + v);
    });
    renderView(v);
    window.scrollTo(0, 0);
  }

  // ---------- Rendering ----------

  function renderAll() {
    fillYearSelects();
    fillTourDatalist();
    renderView(state.view);
    renderLastTours();
  }

  function renderView(v) {
    if (v === 'eingabe') renderLastTours();
    if (v === 'tagebuch') renderDiary();
    if (v === 'cockpit') renderCockpit();
    if (v === 'charts') renderCharts();
    if (v === 'statistik') renderStatistik();
    if (v === 'einstellungen') renderSettings();
  }

  function fillYearSelects() {
    var years = allYears();
    [['diaryYear', true], ['cockpitYear', false], ['chartsYear', false], ['statYear', true], ['goalYear', false]]
      .forEach(function (cfg) {
        var sel = $(cfg[0]);
        var cur = sel.value;
        sel.innerHTML = (cfg[1] ? '<option value="">Alle Jahre</option>' : '') +
          years.map(function (y) { return '<option value="' + y + '">' + y + '</option>'; }).join('');
        if (cur && Array.prototype.some.call(sel.options, function (o) { return o.value === cur; })) {
          sel.value = cur;
        } else if (!cfg[1]) {
          sel.value = String(new Date().getFullYear());
          if (sel.selectedIndex < 0) sel.selectedIndex = 0;
        }
      });
  }

  function fillTourDatalist() {
    var names = {};
    state.data.tours.forEach(function (t) { names[t.tour] = (names[t.tour] || 0) + 1; });
    $('tourNames').innerHTML = Object.keys(names)
      .sort(function (a, b) { return names[b] - names[a]; })
      .map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
  }

  function tourItemHtml(t, withYear) {
    var pace = t.gehzeit ? (t.km / (t.gehzeit / 60)) : 0;
    return '<div class="tour-item" data-id="' + esc(t.id) + '">' +
      '<span class="ticon">' + ART_ICON[t.art] + '</span>' +
      '<div class="tmain"><div class="tname">' + esc(t.tour) + '</div>' +
      '<div class="tsub">' + fmtDate(t.datum) + ' · ' + fmtInt(t.hm) + ' HM' +
      (t.gehzeit ? ' · ' + fmtDur(t.gehzeit) + ' h' : '') +
      (pace ? ' · ' + fmtKm(pace) + ' km/h' : '') + '</div>' +
      (t.notiz ? '<div class="tour-note">📝 ' + esc(t.notiz) + '</div>' : '') +
      '</div>' +
      '<div class="tkm">' + fmtKm(t.km, 2) + '<small> km</small></div></div>';
  }

  function renderLastTours() {
    var tours = state.data.tours.slice().reverse().slice(0, 5);
    $('lastTours').innerHTML = tours.length
      ? tours.map(function (t) { return tourItemHtml(t); }).join('')
      : '<div class="empty">Noch keine Touren – leg los! 🥾</div>';
  }

  // ----- Tagebuch -----

  function renderDiary() {
    var f = state.diary;
    var list = state.data.tours.slice().reverse().filter(function (t) {
      if (f.art && t.art !== f.art) return false;
      if (f.year && t.datum.slice(0, 4) !== f.year) return false;
      if (f.search && t.tour.toLowerCase().indexOf(f.search.toLowerCase()) < 0) return false;
      return true;
    });
    if (!list.length) {
      $('diaryList').innerHTML = '<div class="empty">Keine Touren gefunden.</div>';
      return;
    }
    var html = '', lastMonth = '';
    list.forEach(function (t) {
      var mk = t.datum.slice(0, 7);
      if (mk !== lastMonth) {
        lastMonth = mk;
        html += '<div class="diary-month">' + MONTHS[Number(mk.slice(5, 7)) - 1] + ' ' + mk.slice(0, 4) + '</div>';
      }
      html += tourItemHtml(t);
    });
    var km = sum(list, function (t) { return t.km; });
    html += '<div class="diary-month">' + list.length + ' Touren · ' + fmtKm(km) + ' km gesamt</div>';
    $('diaryList').innerHTML = html;
  }

  // ----- Cockpit -----

  function renderCockpit() {
    var year = $('cockpitYear').value || String(new Date().getFullYear());
    var isCurrent = Number(year) === new Date().getFullYear();
    var yearShare = isCurrent ? dayOfYear(todayIso()) / daysInYear(year) : 1;
    var html = '';

    ARTS.forEach(function (art) {
      var tours = toursOf(year, art);
      var km = sum(tours, function (t) { return t.km; });
      var hm = sum(tours, function (t) { return t.hm; });
      var zeit = sum(tours, function (t) { return t.gehzeit; });
      var ziel = goalFor(year, art);
      var pct = ziel ? Math.min(100, km / ziel * 100) : 0;
      var soll = ziel * yearShare;
      var delta = km - soll;
      var pace = zeit ? km / (zeit / 60) : 0;
      var color = artColor(art);

      // Prognose & Bedarf (nur laufendes Jahr)
      var prognose = isCurrent && yearShare > 0 ? km / yearShare : km;
      var restWochen = isCurrent ? Math.max(1, (daysInYear(year) - dayOfYear(todayIso())) / 7) : 0;
      var proWoche = isCurrent && ziel > km ? (ziel - km) / restWochen : 0;

      html += '<div class="card goal-card">' +
        '<h2>' + ART_ICON[art] + ' ' + art + ' ' + year +
        '<span class="gsum">' + tours.length + ' Touren · ' + fmtInt(hm) + ' HM</span></h2>' +
        '<div class="hero">' + fmtKm(km) + ' <small>von ' + fmtInt(ziel) + ' km</small></div>';

      if (ziel) {
        html += '<div class="progress"><div class="fill" style="width:' + pct.toFixed(1) + '%;background:' + color + '"></div>' +
          (isCurrent ? '<div class="soll" style="left:' + (yearShare * 100).toFixed(1) + '%" title="Soll heute"></div>' : '') +
          '</div>' +
          '<div class="progress-legend"><span>' + pct.toFixed(0) + ' % erreicht</span>' +
          (isCurrent ? '<span>Soll heute: ' + fmtKm(soll, 0) + ' km</span>' : '') + '</div>' +
          '<div class="delta ' + (delta >= 0 ? 'pos' : 'neg') + '">' +
          (delta >= 0 ? '▲ ' + fmtKm(delta, 0) + ' km vor dem Plan' : '▼ ' + fmtKm(-delta, 0) + ' km hinter dem Plan') +
          '</div>';
      }

      html += '<div class="kpi-grid">' +
        kpi(fmtKm(pace), 'Ø km/h') +
        kpi(tours.length ? fmtKm(km / tours.length) : '–', 'Ø km/Tour') +
        kpi(fmtDurLong(zeit), speedLabel(art) + ' gesamt');
      if (isCurrent && ziel) {
        html += kpi(fmtKm(prognose, 0) + ' km', 'Prognose Jahresende') +
          kpi(fmtKm(proWoche) + ' km', 'nötig pro Woche');
      }
      html += '</div></div>';
    });

    $('cockpitContent').innerHTML = html;
  }

  function kpi(v, l) {
    return '<div class="kpi"><div class="kv">' + v + '</div><div class="kl">' + l + '</div></div>';
  }

  // ----- Charts -----

  function destroyChart(key) {
    if (state.charts[key]) { state.charts[key].destroy(); delete state.charts[key]; }
  }

  function chartDefaults() {
    Chart.defaults.color = cssVar('--muted');
    Chart.defaults.borderColor = cssVar('--grid');
    Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  }

  function renderCharts() {
    chartDefaults();
    renderCumChart();
    renderMonthChart();
  }

  function renderCumChart() {
    var year = $('chartsYear').value || String(new Date().getFullYear());
    var art = state.cumArt;
    var tours = toursOf(year, art);
    var ziel = goalFor(year, art);
    var diy = daysInYear(year);
    var isCurrent = Number(year) === new Date().getFullYear();
    var lastDay = isCurrent ? dayOfYear(todayIso()) : diy;

    // Kumulierte km je Tag
    var perDay = new Array(diy + 1).fill(0);
    tours.forEach(function (t) { perDay[dayOfYear(t.datum)] += t.km; });
    var cum = [], c = 0;
    for (var d = 1; d <= diy; d++) {
      c += perDay[d];
      cum.push(d <= lastDay ? Math.round(c * 10) / 10 : null);
    }
    var target = [];
    for (var d2 = 1; d2 <= diy; d2++) target.push(Math.round(ziel * d2 / diy));

    // Monatsgrenzen als Labels
    var labels = [], monthAt = {};
    for (var d3 = 1; d3 <= diy; d3++) {
      var dt = new Date(Number(year), 0, d3);
      labels.push(d3);
      if (dt.getDate() === 1) monthAt[d3 - 1] = MONTHS[dt.getMonth()];
    }

    var color = artColor(art);
    destroyChart('cum');
    state.charts.cum = new Chart($('cumChart'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: art, data: cum, borderColor: color, backgroundColor: color,
            borderWidth: 2, pointRadius: 0, spanGaps: false, tension: 0.1
          },
          {
            label: 'Ziel-Linie', data: target, borderColor: cssVar('--baseline'),
            borderDash: [6, 4], borderWidth: 2, pointRadius: 0
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { usePointStyle: true, boxHeight: 6 } },
          tooltip: {
            callbacks: {
              title: function (items) {
                var dt = new Date(Number(year), 0, Number(items[0].label));
                return dt.getDate() + '. ' + MONTHS[dt.getMonth()];
              },
              label: function (item) {
                return item.dataset.label + ': ' + fmtKm(item.parsed.y, 0) + ' km';
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              autoSkip: false, maxRotation: 0,
              callback: function (v, i) { return monthAt[i] || null; }
            }
          },
          y: { beginAtZero: true, title: { display: true, text: 'km' } }
        }
      }
    });

    var km = sum(tours, function (t) { return t.km; });
    $('cumNote').textContent = ziel
      ? fmtKm(km) + ' von ' + fmtInt(ziel) + ' km — gestrichelte Linie = gleichmäßiges Soll übers Jahr.'
      : 'Kein Ziel für ' + year + ' hinterlegt (unter Setup → Jahresziele).';
  }

  function renderMonthChart() {
    var year = $('chartsYear').value || String(new Date().getFullYear());
    var metric = state.monthMetric;
    var f = { km: function (t) { return t.km; }, hm: function (t) { return t.hm; }, touren: function () { return 1; } }[metric];
    var unit = { km: 'km', hm: 'HM', touren: 'Touren' }[metric];

    var datasets = ARTS.map(function (art) {
      var byMonth = new Array(12).fill(0);
      toursOf(year, art).forEach(function (t) { byMonth[Number(t.datum.slice(5, 7)) - 1] += f(t); });
      return {
        label: ART_ICON[art] + ' ' + art,
        data: byMonth.map(function (v) { return Math.round(v * 10) / 10; }),
        backgroundColor: artColor(art),
        borderRadius: 4, borderSkipped: 'bottom',
        maxBarThickness: 22
      };
    });

    destroyChart('month');
    state.charts.month = new Chart($('monthChart'), {
      type: 'bar',
      data: { labels: MONTHS, datasets: datasets },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { usePointStyle: true, boxHeight: 6 } },
          tooltip: {
            callbacks: {
              label: function (item) {
                return item.dataset.label + ': ' + fmtKm(item.parsed.y, metric === 'km' ? 1 : 0) + ' ' + unit;
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, title: { display: true, text: unit } }
        }
      }
    });
  }

  // ----- Statistik -----

  function renderStatistik() {
    chartDefaults();
    var art = state.statArt;
    var year = $('statYear').value;
    var tours = toursOf(year, art);

    // Rekorde
    function best(f, fmt) {
      var b = null;
      tours.forEach(function (t) { if (f(t) > 0 && (!b || f(t) > f(b))) b = t; });
      return b ? { v: fmt(f(b)), t: b } : null;
    }
    var recs = [
      ['Längste Tour', best(function (t) { return t.km; }, function (v) { return fmtKm(v, 2) + ' km'; })],
      ['Meiste Höhenmeter', best(function (t) { return t.hm; }, function (v) { return fmtInt(v) + ' HM'; })],
      ['Schnellste Tour', best(function (t) { return t.gehzeit ? t.km / (t.gehzeit / 60) : 0; }, function (v) { return fmtKm(v) + ' km/h'; })],
      ['Längste ' + speedLabel(art), best(function (t) { return t.gehzeit; }, fmtDurLong)]
    ];
    $('records').innerHTML = recs.map(function (r) {
      if (!r[1]) return '<div class="record"><div class="rv">–</div><div class="rl">' + r[0] + '</div></div>';
      return '<div class="record"><div class="rv">' + r[1].v + '</div><div class="rl">' + r[0] + '</div>' +
        '<div class="rt">' + esc(r[1].t.tour) + ' · ' + fmtDate(r[1].t.datum) + '</div></div>';
    }).join('');

    // Top-Touren
    var byName = {};
    tours.forEach(function (t) {
      var e = byName[t.tour] || (byName[t.tour] = { n: 0, km: 0, hm: 0 });
      e.n++; e.km += t.km; e.hm += t.hm;
    });
    var top = Object.keys(byName).map(function (k) {
      return { name: k, n: byName[k].n, km: byName[k].km, hm: byName[k].hm };
    }).sort(function (a, b) { return b.n - a.n || b.km - a.km; }).slice(0, 10);
    $('topToursTable').innerHTML = '<tr><th>Tour</th><th>Anzahl</th><th>Σ km</th><th>Σ HM</th></tr>' +
      (top.length ? top.map(function (t) {
        return '<tr><td>' + esc(t.name) + '</td><td>' + t.n + '×</td><td>' + fmtKm(t.km) + '</td><td>' + fmtInt(t.hm) + '</td></tr>';
      }).join('') : '<tr><td colspan="4">Keine Daten</td></tr>');

    renderYearCompare(art);
  }

  function renderYearCompare(art) {
    var years = allYears().slice().reverse().filter(function (y) {
      return toursOf(y, art).length || goalFor(y, art);
    });
    var rows = years.map(function (y) {
      var t = toursOf(y, art);
      var zeit = sum(t, function (x) { return x.gehzeit; });
      return {
        jahr: y, n: t.length,
        km: sum(t, function (x) { return x.km; }),
        hm: sum(t, function (x) { return x.hm; }),
        ziel: goalFor(y, art),
        pace: zeit ? sum(t, function (x) { return x.km; }) / (zeit / 60) : 0
      };
    });

    destroyChart('year');
    state.charts.year = new Chart($('yearChart'), {
      type: 'bar',
      data: {
        labels: years,
        datasets: [{
          label: ART_ICON[art] + ' km', data: rows.map(function (r) { return Math.round(r.km); }),
          backgroundColor: artColor(art), borderRadius: 4, borderSkipped: 'bottom', maxBarThickness: 48
        }, {
          label: 'Ziel', data: rows.map(function (r) { return r.ziel || null; }),
          type: 'line', borderColor: cssVar('--baseline'), borderDash: [6, 4],
          borderWidth: 2, pointStyle: 'line', pointRadius: 0, showLine: false,
          pointBorderWidth: 2, pointHitRadius: 10,
          pointBorderColor: cssVar('--text-primary')
        }]
      },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { labels: { usePointStyle: true, boxHeight: 6 } } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, title: { display: true, text: 'km' } }
        }
      }
    });

    $('yearTable').innerHTML = '<tr><th>Jahr</th><th>Touren</th><th>km</th><th>HM</th><th>Ø km/h</th><th>Ziel</th><th>erreicht</th></tr>' +
      rows.map(function (r) {
        return '<tr><td>' + r.jahr + '</td><td>' + r.n + '</td><td>' + fmtKm(r.km) + '</td><td>' + fmtInt(r.hm) +
          '</td><td>' + (r.pace ? fmtKm(r.pace) : '–') + '</td><td>' + (r.ziel ? fmtInt(r.ziel) : '–') +
          '</td><td>' + (r.ziel ? Math.round(r.km / r.ziel * 100) + ' %' : '–') + '</td></tr>';
      }).join('');
  }

  // ----- Einstellungen -----

  function renderSettings() {
    $('cfgUrl').value = state.config.url;
    $('cfgToken').value = state.config.token;
    $('btnDemo').textContent = state.demo ? 'Demo-Modus beenden' : 'Demo-Modus starten';
    var y = $('goalYear').value || String(new Date().getFullYear());
    $('goalWandern').value = goalFor(y, 'Wandern') || '';
    $('goalRadeln').value = goalFor(y, 'Radeln') || '';
  }

  // ---------- Formular ----------

  function setFormArt(art) {
    state.formArt = art;
    document.querySelectorAll('#fArtSeg button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.art === art);
    });
    $('lblGehzeit').textContent = speedLabel(art);
  }

  function resetForm() {
    $('fId').value = '';
    $('tourForm').reset();
    $('fDatum').value = todayIso();
    setFormArt(state.formArt);
    $('formTitle').textContent = 'Neue Tour';
    $('btnDelete').hidden = true;
    $('btnCancelEdit').hidden = true;
    $('btnSave').textContent = 'Speichern';
  }

  function fillForm(t) {
    $('fId').value = t.id;
    $('fDatum').value = t.datum;
    setFormArt(t.art);
    $('fTour').value = t.tour;
    $('fKm').value = String(t.km).replace('.', ',');
    $('fHm').value = t.hm || '';
    $('fGehzeit').value = t.gehzeit ? fmtDur(t.gehzeit) : '';
    $('fGesamtzeit').value = t.gesamtzeit ? fmtDur(t.gesamtzeit) : '';
    $('fNotiz').value = t.notiz || '';
    $('formTitle').textContent = 'Tour bearbeiten';
    $('btnDelete').hidden = false;
    $('btnCancelEdit').hidden = false;
    $('btnSave').textContent = 'Aktualisieren';
    switchView('eingabe');
  }

  function submitForm(e) {
    e.preventDefault();
    var km = parseNum($('fKm').value);
    if (isNaN(km) || km <= 0) { toast('Bitte gültige Strecke angeben'); return; }
    // Datum tolerant einlesen (Browser ohne Date-Picker liefern z. B. "16.07.2026")
    var datum = parseDateFlexible($('fDatum').value);
    if (!datum) { toast('Bitte gültiges Datum angeben (z. B. 16.07.2026)'); return; }
    var tour = {
      datum: datum,
      art: state.formArt,
      tour: $('fTour').value.trim(),
      km: Math.round(km * 100) / 100,
      hm: Math.round(parseNum($('fHm').value) || 0),
      gehzeit: parseTimeToMin($('fGehzeit').value),
      gesamtzeit: parseTimeToMin($('fGesamtzeit').value),
      notiz: $('fNotiz').value.trim()
    };
    var id = $('fId').value;
    var body = id ? { action: 'updateTour', id: id, tour: tour } : { action: 'addTour', tour: tour };
    runAction(body).then(function () {
      toast(id ? 'Tour aktualisiert ✅' : 'Tour gespeichert ✅ ' + fmtKm(tour.km, 2) + ' km');
      resetForm();
    }).catch(function () {});
  }

  // ---------- Import ----------

  function parseImportText(text) {
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
    var rows = [], errors = [];
    lines.forEach(function (line, i) {
      var cells = line.indexOf('\t') >= 0 ? line.split('\t') : line.split(';');
      if (cells.length < 4) { errors.push('Zeile ' + (i + 1) + ': zu wenige Spalten'); return; }
      var datum = parseDateFlexible(cells[0]);
      if (!datum) {
        if (i === 0) return; // Kopfzeile
        errors.push('Zeile ' + (i + 1) + ': Datum nicht lesbar („' + cells[0] + '“)');
        return;
      }
      var art = String(cells[1]).trim();
      if (ARTS.indexOf(art) < 0) { errors.push('Zeile ' + (i + 1) + ': Art muss Wandern/Radeln sein'); return; }
      var km = parseNum(cells[3]);
      if (isNaN(km) || km <= 0) { errors.push('Zeile ' + (i + 1) + ': Strecke nicht lesbar'); return; }
      rows.push({
        datum: datum, art: art, tour: String(cells[2]).trim(),
        km: Math.round(km * 100) / 100,
        hm: Math.round(parseNum(cells[4]) || 0),
        gehzeit: parseTimeToMin(cells[5]),
        gesamtzeit: parseTimeToMin(cells[6]),
        notiz: cells[7] ? String(cells[7]).trim() : ''
      });
    });
    return { rows: rows, errors: errors };
  }

  function previewImport() {
    var run = function (text) {
      if (!text.trim()) { toast('Keine Daten – Datei wählen oder Zeilen einfügen'); return; }
      var res = parseImportText(text);
      var existing = {};
      state.data.tours.forEach(function (t) { existing[dupKey(t)] = true; });
      var dups = res.rows.filter(function (r) { return existing[dupKey(r)]; }).length;
      state.importRows = res.rows;
      var html = '<p class="hint"><strong>' + res.rows.length + ' Touren erkannt</strong>' +
        (dups ? ', davon ' + dups + ' bereits vorhanden (werden übersprungen)' : '') + '.</p>';
      if (res.errors.length) {
        html += '<p class="hint">⚠️ ' + res.errors.slice(0, 5).map(esc).join('<br>') +
          (res.errors.length > 5 ? '<br>… und ' + (res.errors.length - 5) + ' weitere' : '') + '</p>';
      }
      $('importPreview').innerHTML = html;
      $('btnDoImport').disabled = res.rows.length === 0;
    };
    var file = $('importFile').files[0];
    if (file) {
      var reader = new FileReader();
      reader.onload = function () { run(String(reader.result)); };
      reader.readAsText(file, 'UTF-8');
    } else {
      run($('importPaste').value);
    }
  }

  function doImport() {
    if (!state.importRows || !state.importRows.length) return;
    runAction({ action: 'importTours', tours: state.importRows }).then(function (res) {
      if (res && res.extra) {
        toast(res.extra.imported + ' importiert, ' + res.extra.skipped + ' Duplikate übersprungen');
      }
      state.importRows = null;
      $('btnDoImport').disabled = true;
      $('importPreview').innerHTML = '';
      $('importFile').value = '';
      $('importPaste').value = '';
    }).catch(function () {});
  }

  // ---------- Demo-Daten ----------

  function demoData() {
    var tours = [];
    var names = {
      Wandern: ['Lamberg', 'Osser', 'Hohenbogen', 'Cerchov', 'Gibacht'],
      Radeln: ['Untertraubenbach', 'Willmering', 'Weiding', 'Roding', 'Fichtental']
    };
    var year = new Date().getFullYear();
    var today = new Date();
    var d = new Date(year, 0, 1);
    var i = 0;
    while (d <= today && d.getFullYear() === year) {
      if (Math.random() < 0.28) {
        var art = Math.random() < 0.6 ? 'Wandern' : 'Radeln';
        var km = art === 'Wandern' ? 5 + Math.random() * 12 : 10 + Math.random() * 45;
        var speed = art === 'Wandern' ? 4 + Math.random() : 17 + Math.random() * 6;
        var geh = Math.round(km / speed * 60);
        tours.push({
          id: 'demo' + (i++),
          datum: d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()),
          art: art,
          tour: names[art][Math.floor(Math.random() * names[art].length)],
          km: Math.round(km * 100) / 100,
          hm: Math.round((art === 'Wandern' ? km * 30 : km * 8) / 10) * 10,
          gehzeit: geh,
          gesamtzeit: geh + Math.round(Math.random() * 20),
          notiz: ''
        });
      }
      d.setDate(d.getDate() + 1);
    }
    return {
      tours: tours,
      goals: [
        { jahr: year, art: 'Wandern', ziel: 1000 },
        { jahr: year, art: 'Radeln', ziel: 2000 }
      ]
    };
  }

  // ---------- Events ----------

  function bind() {
    $('tabbar').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) switchView(b.dataset.view);
    });

    $('tourForm').addEventListener('submit', submitForm);
    $('fArtSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) setFormArt(b.dataset.art);
    });
    $('btnCancelEdit').addEventListener('click', resetForm);
    $('btnDelete').addEventListener('click', function () {
      var id = $('fId').value;
      if (!id) return;
      if (!confirm('Diese Tour wirklich löschen?')) return;
      runAction({ action: 'deleteTour', id: id }).then(function () {
        toast('Tour gelöscht');
        resetForm();
      }).catch(function () {});
    });

    // Klick auf Tour-Einträge → bearbeiten
    document.body.addEventListener('click', function (e) {
      var item = e.target.closest('.tour-item');
      if (!item) return;
      var t = state.data.tours.filter(function (x) { return String(x.id) === item.dataset.id; })[0];
      if (t) fillForm(t);
    });

    // Tagebuch-Filter
    $('diaryArtSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      state.diary.art = b.dataset.art;
      this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('active', x === b); });
      renderDiary();
    });
    $('diarySearch').addEventListener('input', function () { state.diary.search = this.value; renderDiary(); });
    $('diaryYear').addEventListener('change', function () { state.diary.year = this.value; renderDiary(); });

    $('cockpitYear').addEventListener('change', renderCockpit);
    $('chartsYear').addEventListener('change', renderCharts);
    $('cumArtSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      state.cumArt = b.dataset.art;
      this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('active', x === b); });
      renderCumChart();
    });
    $('monthMetricSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      state.monthMetric = b.dataset.metric;
      this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('active', x === b); });
      renderMonthChart();
    });
    $('statArtSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      state.statArt = b.dataset.art;
      this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('active', x === b); });
      renderStatistik();
    });
    $('statYear').addEventListener('change', renderStatistik);

    // Setup
    $('btnConnect').addEventListener('click', function () {
      state.config = { url: $('cfgUrl').value.trim(), token: $('cfgToken').value.trim() };
      localStorage.setItem(LS_CONFIG, JSON.stringify(state.config));
      if (state.demo) toggleDemo(false);
      $('connectMsg').textContent = 'Verbinde…';
      loadRemote(true).then(function () {
        $('connectMsg').textContent = state.data.tours.length + ' Touren im Sheet.';
      });
    });
    $('btnReload').addEventListener('click', function () { loadRemote(true); });

    $('goalYear').addEventListener('change', renderSettings);
    $('btnSaveGoals').addEventListener('click', function () {
      var y = Number($('goalYear').value);
      var w = Number($('goalWandern').value) || 0;
      var r = Number($('goalRadeln').value) || 0;
      runAction({ action: 'saveGoal', jahr: y, art: 'Wandern', ziel: w }).then(function () {
        return runAction({ action: 'saveGoal', jahr: y, art: 'Radeln', ziel: r });
      }).then(function () { toast('Ziele gespeichert ✅'); }).catch(function () {});
    });

    $('btnPreviewImport').addEventListener('click', previewImport);
    $('btnDoImport').addEventListener('click', doImport);
    $('importFile').addEventListener('change', function () { $('importPreview').innerHTML = ''; $('btnDoImport').disabled = true; });

    $('btnDemo').addEventListener('click', function () { toggleDemo(!state.demo); });

    // Dark-Mode-Wechsel → Charts neu einfärben
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
        renderView(state.view);
      });
    }
  }

  function toggleDemo(on) {
    state.demo = on;
    localStorage.setItem(LS_DEMO, on ? '1' : '0');
    if (on) {
      var saved = readJson(LS_DEMODATA);
      state.data = saved && saved.tours && saved.tours.length ? saved : demoData();
      localStorage.setItem(LS_DEMODATA, JSON.stringify(state.data));
      setSync('🧪 Demo');
      toast('Demo-Modus aktiv – Daten nur lokal');
      renderAll();
      renderSettings();
    } else {
      localStorage.removeItem(LS_DEMODATA);
      state.data = { tours: [], goals: [] };
      renderSettings();
      loadRemote(false);
    }
  }

  // ---------- Start ----------

  function init() {
    $('fDatum').value = todayIso();
    bind();
    if (state.demo) {
      var saved = readJson(LS_DEMODATA);
      state.data = saved || demoData();
      setSync('🧪 Demo');
      renderAll();
    } else {
      var cache = readJson(LS_CACHE);
      if (cache) {
        cache.tours.forEach(function (t) { t.datum = normIso(t.datum); });
        state.data = cache;
        renderAll();
      }
      if (!state.config.url) switchView('einstellungen');
      loadRemote(false);
    }
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  }

  init();
})();
