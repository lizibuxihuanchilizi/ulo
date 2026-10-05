/* ULO · 视图层：路由 / 看板 / 模拟器 / 记录 / 猫档案 / 设置 / 实现说明 / 自检 */
(function (global) {
  'use strict';
  var ULO = global.ULO, util = ULO.util, store = ULO.store, rules = ULO.rules, charts = ULO.charts, ai = ULO.ai;

  var app, viewEl;
  var REF = { map: null, allReal: false, ready: false };
  var UI = {
    logCat: 'all', logLevel: 'all',
    sim: { running: false, samples: [], scenario: null, lastRun: null, mode: 'auto', pick: '' },
    photo: { dataUrl: null, signature: null, weightG: 4000 }
  };
  var sim = new ULO.Simulator({
    cats: [], refMap: null,
    onPhase: function (phase) {
      var el = document.getElementById('sim-phase');
      if (el) el.innerHTML = '<b>' + util.esc(phase.label) + '</b><span class="muted tiny">' + util.esc(phase.hint) + '</span>';
      var cam = document.getElementById('sim-cam-live');
      if (cam) cam.classList.toggle('on', phase.key !== 'analyze');
    },
    onSample: function (g, t, samples) {
      var el = document.getElementById('sim-weight');
      if (el) el.textContent = (g / 1000).toFixed(2) + ' kg';
      var ch = document.getElementById('sim-chart');
      if (ch) ch.innerHTML = charts.line(samples, { w: 320, h: 130, compact: true, color: '#22d3ee', min: 0, minSpan: 1000 });
      var raw = document.getElementById('sim-raw');
      if (raw) raw.textContent = Math.round(g) + ' g';
      var p = document.getElementById('sim-progress');
      if (p) p.style.width = Math.round((t / sim.scenario.timings.analyze) * 100) + '%';
      if (t % 3 === 0) pushStream(t, g);
    },
    onFrame: function (cat, kind) {
      var img = document.getElementById('sim-cam-img');
      if (img) { img.src = cat.avatar; img.alt = cat.name; }
      pushStream(sim.t, null, (kind === 'settle' ? '抓拍关键帧：' : '抓拍关键帧（如厕中）：') + cat.name);
    },
    onAnalyzeStart: function () {
      var r = document.getElementById('sim-result');
      if (r) r.innerHTML = '<div class="card row" style="gap:10px"><span class="spinner"></span><div><b>AI 正在识别与分析…</b><div class="tiny muted">重量特征 + 图像特征加权打分</div></div></div>';
    },
    onResult: onSimResult
  });

  /* ================= 小工具 ================= */
  var I = {
    dash: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    sim: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5A3.5 3.5 0 0 1 6.5 5h11A3.5 3.5 0 0 1 21 8.5v7A3.5 3.5 0 0 1 17.5 19h-11A3.5 3.5 0 0 1 3 15.5z"/><path d="M10 9.5l5 2.5-5 2.5z"/></svg>',
    log: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>',
    cats: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="15" rx="4.6" ry="3.8"/><ellipse cx="5.6" cy="10" rx="2.1" ry="2.6"/><ellipse cx="18.4" cy="10" rx="2.1" ry="2.6"/><ellipse cx="9.2" cy="6" rx="1.9" ry="2.4"/><ellipse cx="14.8" cy="6" rx="1.9" ry="2.4"/></svg>',
    more: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    chev: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".5"><path d="M9 5l7 7-7 7"/></svg>'
  };

  var TABS = [
    { href: '#/dashboard', label: '看板', icon: I.dash },
    { href: '#/simulator', label: '模拟器', icon: I.sim },
    { href: '#/log', label: '记录', icon: I.log },
    { href: '#/cats', label: '猫档案', icon: I.cats },
    { href: '#/more', label: '更多', icon: I.more }
  ];

  function toast(msg, kind) {
    var wrap = document.querySelector('.toast-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
    var t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(function () { t.remove(); }, 3600);
  }

  function levelChip(level) {
    var map = { ok: ['ok', '正常'], info: ['', '提示'], warn: ['warn', '关注'], alert: ['alert', '预警'] };
    var m = map[level] || map.info;
    return '<span class="chip ' + m[0] + '">' + m[1] + '</span>';
  }

  function catById(id) { return store.state.cats.filter(function (c) { return c.id === id; })[0] || null; }

  function ensureRefs() {
    return ULO.image.reference(store.state.cats).then(function (ref) {
      REF.map = ref.map; REF.allReal = ref.allReal; REF.ready = true;
      sim.opts.refMap = ref;
      return ref;
    });
  }

  function imageToDataUrl(src, maxSize) {
    maxSize = maxSize || 768;
    return new Promise(function (resolve) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        try {
          var s = Math.min(1, maxSize / Math.max(img.width, img.height));
          var c = document.createElement('canvas');
          c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.85));
        } catch (e) { resolve(null); }
      };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  /* ================= 路由 ================= */
  var ROUTES = {
    '#/dashboard': renderDashboard,
    '#/simulator': renderSimulator,
    '#/log': renderLog,
    '#/cats': renderCats,
    '#/more': renderMore,
    '#/settings': renderSettings,
    '#/about': renderAbout,
    '#/selftest': renderSelftest
  };

  function route() {
    var hash = location.hash || '#/dashboard';
    var base = hash.split('?')[0];
    var fn = ROUTES[base] || renderDashboard;
    var titles = { '#/dashboard': '健康看板', '#/simulator': '猫砂盆模拟器', '#/log': '如厕记录', '#/cats': '猫档案', '#/more': '更多', '#/settings': 'AI 设置', '#/about': '实现说明', '#/selftest': '逻辑自检' };
    window.scrollTo(0, 0);
    var showBack = ['#/settings', '#/about', '#/selftest'].indexOf(base) >= 0;
    app.innerHTML = topbar(titles[base] || 'ULO', showBack) + '<main class="view" id="view"></main>' + tabbar(base);
    viewEl = document.getElementById('view');
    fn();
  }

  function topbar(title, back) {
    return '<header class="topbar">' +
      (back
        ? '<button class="icon-btn" data-act="nav" data-to="#/more">' + I.back + '</button>'
        : '<div class="brand"><img class="mark" src="assets/img/favicon.svg" alt=""><div><div class="name">ULO</div><div class="sub">PRISM · DEMO</div></div></div>') +
      '<div class="spacer"></div>' +
      (back ? '<b style="font-size:15px">' + util.esc(title) + '</b><div class="spacer"></div><span style="width:36px"></span>' : '<span class="chip ghost">' + util.esc(title) + '</span>') +
      '</header>';
  }

  function tabbar(base) {
    return '<nav class="tabbar">' + TABS.map(function (t) {
      return '<a href="' + t.href + '" class="' + (t.href === base ? 'on' : '') + '">' + t.icon + '<span>' + t.label + '</span></a>';
    }).join('') + '</nav>';
  }

  /* ================= 看板 ================= */
  function renderDashboard() {
    var now = Date.now();
    var cats = store.state.cats;
    var health = cats.map(function (c) { return rules.catHealth(c, store.state.visits, now); });
    var todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    var today = store.state.visits.filter(function (v) { return v.startedAt >= todayStart.getTime(); });
    var alerts = [];
    health.forEach(function (h) {
      h.alerts.forEach(function (a) { alerts.push(Object.assign({ catLevel: h.level }, a)); });
    });
    alerts.sort(function (a, b) {
      var rank = { alert: 0, warn: 1, info: 2 };
      return (rank[a.level] || 3) - (rank[b.level] || 3);
    });

    var days = [];
    for (var d = 6; d >= 0; d--) {
      var s = new Date(); s.setHours(0, 0, 0, 0); s.setDate(s.getDate() - d);
      var e = s.getTime() + 86400000;
      var dayVisits = store.state.visits.filter(function (v) { return v.startedAt >= s.getTime() && v.startedAt < e; });
      var urine = dayVisits.filter(function (v) { return v.voiding === 'urine' || v.voiding === 'both'; }).length;
      var stool = dayVisits.filter(function (v) { return v.voiding === 'stool' || v.voiding === 'both'; }).length;
      days.push({ label: d === 0 ? '今天' : (s.getMonth() + 1) + '/' + s.getDate(), value: dayVisits.length, parts: [{ value: urine, color: '#38bdf8' }, { value: stool, color: '#34d399' }] });
    }

    var overall = health.length ? Math.round(util.mean(health.map(function (h) { return h.healthScore; }))) : 100;

    viewEl.innerHTML =
      '<div class="hero"><div class="q">QUESTION</div><h1>让猫厕所「看见」猫咪</h1>' +
      '<p>重力感应 + 图像识别：分辨是哪只猫、记录如厕行为、发现健康异常。下面是这套 Demo 的实时看板。</p></div>' +

      '<div class="section"><div class="grid c3">' +
      '<div class="stat"><div class="k">今日如厕</div><div class="v mono">' + today.length + '<small> 次</small></div></div>' +
      '<div class="stat"><div class="k">活跃预警</div><div class="v mono" style="color:' + (alerts.length ? 'var(--warn)' : 'var(--ok)') + '">' + alerts.length + '<small> 条</small></div></div>' +
      '<div class="stat"><div class="k">监测猫咪</div><div class="v mono">' + cats.length + '<small> 只</small></div></div>' +
      '</div></div>' +

      '<div class="section"><div class="section-head"><h2>健康预警</h2><span class="hint">按严重程度排序</span></div>' +
      (alerts.length ? alerts.map(alertCard).join('') : '<div class="empty">所有猫咪的指标都在正常范围内</div>') +
      '</div>' +

      '<div class="section"><div class="section-head"><h2>猫咪状态</h2><span class="hint">综合健康分 ' + overall + '</span></div>' +
      health.map(function (h) {
        var last = h.lastVisitAt ? util.relTime(h.lastVisitAt, now) + '有记录' : '暂无记录';
        return '<div class="card">' +
          '<div class="row">' +
          '<img src="' + h.cat.avatar + '" alt="' + util.esc(h.cat.name) + '" style="width:46px;height:46px;border-radius:13px;border:1px solid var(--border)">' +
          '<div style="flex:1;min-width:0"><div class="row" style="gap:7px"><b>' + util.esc(h.cat.name) + '</b>' + levelChip(h.level) +
          '<span class="tiny2 muted">' + util.esc(h.cat.coat) + '</span></div>' +
          '<div class="tiny muted">' + last + ' · 近 24h 排尿 ' + h.urine24 + ' 次</div></div>' +
          '<div style="text-align:right">' + charts.ring(h.healthScore, { size: 62 }) + '</div>' +
          '</div>' +
          (h.series.length > 1 ? '<div style="margin-top:8px">' + charts.line(h.series.map(function (p) { return p.y; }), { w: 300, h: 56, compact: true, color: h.level === 'alert' ? '#fb7185' : h.level === 'warn' ? '#fbbf24' : '#34d399', min: 0 }) + '</div>' +
            '<div class="tiny2 muted">近 7 日体重趋势 ' + (h.pctPerDay >= 0 ? '↑' : '↓') + Math.abs(h.pctPerDay).toFixed(2) + '% / 天</div>' : '') +
          '</div>';
      }).join('') +
      '</div>' +

      '<div class="section"><div class="section-head"><h2>近 7 日如厕次数</h2><span class="hint">蓝=排尿 绿=排便</span></div>' +
      '<div class="card">' + charts.bars(days, { w: 320, h: 150 }) + '</div></div>' +

      '<div class="section banner">这是一份用于演示的合成数据看板：猫咪与记录均为脚本生成，<b>不构成任何医疗建议</b>。真实产品中这些数据会来自猫砂盆底部的称重模块与上方摄像头。</div>';
  }

  function alertCard(a) {
    var cat = catById(a.catId);
    var cls = a.level === 'alert' ? '' : a.level === 'warn' ? 'warn' : 'info';
    var icon = a.level === 'alert' ? '!' : a.level === 'warn' ? '!' : 'i';
    return '<div class="card alert-card ' + cls + '">' +
      '<div class="row between" style="align-items:center;gap:10px">' +
      '<span class="chip ' + (a.level === 'alert' ? 'alert' : a.level === 'warn' ? 'warn' : '') + '" style="flex:0 0 auto">' + icon + ' ' + util.esc(rules.RULE_META[a.code] ? rules.RULE_META[a.code].title : '提示') + '</span>' +
      (cat ? '<img src="' + cat.avatar + '" alt="" style="width:26px;height:26px;border-radius:8px;border:1px solid var(--border);flex:0 0 auto">' : '') +
      '</div>' +
      '<p class="tiny" style="margin-top:8px;color:#d7e6f7">' + util.esc(a.message) + '</p></div>';
  }
  /* ================= 模拟器 ================= */
  function renderSimulator() {
    var cats = store.state.cats;
    var st = store.settings();
    sim.opts.cats = cats;
    sim.opts.threshold = st.threshold;
    sim.opts.weightWeight = st.weightWeight;
    sim.opts.imageWeight = st.imageWeight;

    viewEl.innerHTML =
      '<div class="section" style="margin-top:4px"><div class="cam" id="sim-cam">' +
      '<img id="sim-cam-img" src="assets/img/cam-idle.svg" alt="等待猫咪进入">' +
      '<div class="scan"></div>' +
      '<div class="live" id="sim-cam-live"><span class="rec"></span>CAM 01 · REC</div>' +
      '<div class="box" id="sim-box" style="display:none"><span>识别中</span></div>' +
      '<div class="ts"><span id="sim-clock">--:--:--</span><span>ULO Litter Box</span></div>' +
      '</div>' +
      '<div class="card" style="margin-top:10px">' +
      '<div class="row between"><div><div class="tiny2 muted">称重读数</div><div id="sim-weight" class="mono" style="font-size:30px;font-weight:800">0.00 kg</div></div>' +
      '<div style="text-align:right"><div class="tiny2 muted">原始采样</div><div id="sim-raw" class="mono tiny">0 g</div></div></div>' +
      '<div class="banner" style="margin-top:10px" id="sim-phase"><b>待机中</b><span class="muted tiny">点击下方按钮开始一次监测</span></div>' +
      '<div style="height:6px;border-radius:4px;background:#0a1424;margin-top:10px;overflow:hidden"><div id="sim-progress" style="height:100%;width:0;background:linear-gradient(90deg,#2f9fe0,#22d3ee);transition:width .1s linear"></div></div>' +
      '</div>' +
      '<div class="card"><div class="tiny2 muted" style="margin-bottom:6px">重量曲线（实时）</div><div id="sim-chart">' +
      charts.line([0, 0], { w: 320, h: 130, compact: true, color: '#22d3ee', min: 0, minSpan: 1000 }) + '</div></div>' +
      '</div>' +

      '<div class="section"><div class="section-head"><h2>选择场景</h2></div>' +
      '<div class="segmented" data-act="sim-mode">' +
      '<button data-val="auto" class="' + (UI.sim.mode === 'auto' ? 'on' : '') + '">自动</button>' +
      '<button data-val="pick" class="' + (UI.sim.mode === 'pick' ? 'on' : '') + '">指定猫咪</button>' +
      '<button data-val="conflict" class="' + (UI.sim.mode === 'conflict' ? 'on' : '') + '">冲突样本</button>' +
      '<button data-val="photo" class="' + (UI.sim.mode === 'photo' ? 'on' : '') + '">上传照片</button>' +
      '</div>' +
      '<div class="tiny2 muted" style="margin-top:7px">' + ({
        auto: '随机挑一只猫，按它自己的基线生成重量与画面。',
        pick: '指定一只猫，验证识别是否会给出正确的结论。',
        conflict: '重量来自一只猫、画面来自另一只猫，用来测试「宁可判定不出，也不乱猜」。',
        photo: '上传一张你自己的猫咪照片，做一次真实图像特征提取与识别。'
      })[UI.sim.mode] + '</div>' +

      (UI.sim.mode === 'pick' ? '<div class="field" style="margin-top:12px"><label>指定哪只猫</label><select data-act="sim-pick">' +
        cats.map(function (c) { return '<option value="' + c.id + '"' + (UI.sim.pick === c.id ? ' selected' : '') + '>' + util.esc(c.name) + ' · ' + util.fmtKg(c.baselineWeightG) + '</option>'; }).join('') +
        '</select></div>' : '') +

      (UI.sim.mode === 'photo' ? '<div class="field" style="margin-top:12px"><label>猫咪照片</label>' +
        '<input type="file" accept="image/*" data-act="sim-photo"></div>' +
        '<div class="field"><label>本次实测体重（克）</label><input type="number" data-act="sim-photo-weight" value="' + UI.photo.weightG + '" step="10"></div>' +
        (UI.photo.signature ? '<div class="banner">照片已就绪，可以开始识别。</div>' : '') : '') +

      '<div class="btn-row" style="margin-top:12px">' +
      '<button class="btn primary block" data-act="sim-start" id="sim-start">开始监测</button>' +
      '<button class="btn ghost" data-act="sim-stop">停止</button>' +
      '</div></div>' +

      '<div class="section"><div class="section-head"><h2>原始事件流</h2><span class="hint">模拟串口输出</span></div>' +
      '<div class="card"><div class="stream" id="sim-stream"><div class="line"><b>sys</b><span>设备就绪 · 4 路称重模块 0 g · 摄像头在线</span></div></div></div></div>' +

      '<div class="section" id="sim-result"></div>' +
      '<div class="section banner">当前图像特征来源：' + (REF.allReal ? '浏览器画布真实提取' : 'canvas 受限时的确定性降级向量（部署到 https 后会走真实提取）') + '</div>';

    if (UI.sim.lastRun) renderSimResult(UI.sim.lastRun);
  }

  function pushStream(t, g, text) {
    var el = document.getElementById('sim-stream');
    if (!el) return;
    var d = new Date();
    var ts = util.pad(d.getHours()) + ':' + util.pad(d.getMinutes()) + ':' + util.pad(d.getSeconds()) + '.' + ('00' + d.getMilliseconds()).slice(-3);
    var line = document.createElement('div');
    line.className = 'line';
    line.innerHTML = '<b>' + ts + '</b><span>' + util.esc(text || ('重量 ' + Math.round(g) + ' g')) + '</span>';
    el.appendChild(line);
    while (el.children.length > 60) el.removeChild(el.firstChild);
    el.scrollTop = el.scrollHeight;
  }

  function startSim() {
    sim.opts.cats = store.state.cats;
    var s = store.settings();
    sim.opts.threshold = s.threshold; sim.opts.weightWeight = s.weightWeight; sim.opts.imageWeight = s.imageWeight;
    sim.opts.refMap = { map: REF.map };

    if (UI.sim.mode === 'photo') {
      if (!UI.photo.signature) { toast('请先选择一张猫咪照片', 'err'); return; }
      runPhotoIdentify();
      return;
    }
    var mode = UI.sim.mode === 'pick' ? (UI.sim.pick || store.state.cats[0].id) : UI.sim.mode;
    UI.sim.running = true;
    document.getElementById('sim-start').textContent = '监测中…';
    var st = document.getElementById('sim-stream');
    if (st) st.innerHTML = '<div class="line"><b>sys</b><span>新一轮监测开始</span></div>';
    var box = document.getElementById('sim-box');
    if (box) box.style.display = 'none';
    sim.start(mode, store.state.cats);
  }

  function runPhotoIdentify() {
    var res = ULO.identify.recognize({
      peakWeightG: UI.photo.weightG,
      signature: UI.photo.signature
    }, store.state.cats, REF.map, {
      threshold: store.settings().threshold,
      weightWeight: store.settings().weightWeight,
      imageWeight: store.settings().imageWeight
    });
    var cat = res.best ? catById(res.best) : null;
    var visit = {
      catId: res.best,
      startedAt: Date.now() - 45000,
      endedAt: Date.now(),
      durationSec: 45,
      entryWeightG: UI.photo.weightG,
      peakWeightG: UI.photo.weightG,
      deltaG: 0,
      voiding: 'unknown',
      confidence: res.confidence,
      source: 'photo',
      evidence: { weightScore: res.ranked[0] ? res.ranked[0].weightScore : 0, imageScore: res.ranked[0] ? res.ranked[0].imageScore : null, usedImage: res.usedImage, ranked: res.ranked, reason: res.reason },
      signals: { series: [], frames: [UI.photo.dataUrl || 'assets/img/cam-idle.svg'] }
    };
    visit.anomalies = rules.visitAnomalies(visit, cat);
    if (res.unknown) visit.anomalies.unshift({ code: 'UNKNOWN_ID', level: 'warn', message: '识别置信度不足：' + (res.reason || '无法确定身份') });
    UI.sim.lastRun = { visit: visit, result: res, cat: cat, scenario: { target: cat, frameCat: cat, peak: UI.photo.weightG, delta: 0, voiding: 'unknown', durationSec: 45, conflict: false, photo: true } };
    renderSimResult(UI.sim.lastRun);
  }

  function onSimResult(payload) {
    UI.sim.running = false;
    UI.sim.lastRun = payload;
    var btn = document.getElementById('sim-start');
    if (btn) btn.textContent = '开始监测';
    var cam = document.getElementById('sim-cam-live');
    if (cam) cam.classList.remove('on');
    var sc = payload.scenario;
    if (sc && !sc.photo) {
      var img = document.getElementById('sim-cam-img');
      if (img) img.src = sc.frameCat.avatar;
      var box = document.getElementById('sim-box');
      if (box) {
        var w = 46 + Math.random() * 12;
        box.style.display = 'block';
        box.style.width = w + '%'; box.style.height = w + '%';
        box.style.left = (16 + Math.random() * 14) + '%'; box.style.top = (16 + Math.random() * 12) + '%';
        box.querySelector('span').textContent = (payload.result.bestName || '身份未确认') + ' ' + util.pct(payload.result.confidence);
      }
      pushStream(sim.t, null, '分析完成：' + (payload.result.bestName || '身份未确认') + '，置信度 ' + util.pct(payload.result.confidence));
    }
    renderSimResult(payload);
  }

  function renderSimResult(payload) {
    var host = document.getElementById('sim-result');
    if (!host) return;
    var r = payload.result, visit = payload.visit, cat = payload.cat;
    host.innerHTML =
      '<div class="section-head" style="margin-top:0"><h2>识别结果</h2><span class="hint">' + (r.usedImage ? '重量 + 图像融合' : '仅重量特征') + '</span></div>' +
      '<div class="card' + (r.unknown ? ' alert-card warn' : '') + '">' +
      '<div class="row">' +
      (cat ? '<img src="' + cat.avatar + '" alt="" style="width:52px;height:52px;border-radius:14px;border:1px solid var(--border-strong)">' : '<div style="width:52px;height:52px;border-radius:14px;border:1px dashed var(--border);display:grid;place-items:center;font-size:20px">?</div>') +
      '<div style="flex:1"><b style="font-size:17px">' + util.esc(r.bestName || '身份未确认') + '</b>' +
      '<div class="tiny muted">置信度 ' + util.pct(r.confidence) + ' · 阈值 ' + util.pct(r.threshold) + ' · 与第二名差 ' + r.margin.toFixed(2) + '</div>' +
      (r.reason ? '<div class="tiny" style="color:var(--warn);margin-top:3px">' + util.esc(r.reason) + '</div>' : '') +
      '</div></div>' +
      '<div class="grid c2" style="margin-top:12px">' +
      '<div class="stat"><div class="k">实测体重</div><div class="v mono">' + util.fmtKg(visit.peakWeightG) + '</div></div>' +
      '<div class="stat"><div class="k">排出量</div><div class="v mono">' + util.fmtG(visit.deltaG) + '</div></div>' +
      '<div class="stat"><div class="k">停留时长</div><div class="v mono">' + util.dur(visit.durationSec) + '</div></div>' +
      '<div class="stat"><div class="k">行为判定</div><div class="v mono">' + util.esc(ULO.VOID_LABEL[visit.voiding]) + '</div></div>' +
      '</div>' +
      '<div style="margin-top:12px"><div class="tiny2 muted" style="margin-bottom:6px">打分明细</div>' +
      r.ranked.map(function (x) {
        return '<div style="margin-bottom:7px"><div class="row between tiny"><span>' + util.esc(x.name) + '</span><span class="mono">' +
          x.score.toFixed(2) + ' <span class="muted">(重量 ' + x.weightScore.toFixed(2) + (x.imageScore == null ? '' : ' · 图像 ' + x.imageScore.toFixed(2)) + ')</span></span></div>' +
          '<div style="height:6px;border-radius:4px;background:#0a1424;overflow:hidden"><div style="height:100%;width:' + (x.score * 100).toFixed(0) + '%;background:' +
          (x.score >= r.threshold ? 'linear-gradient(90deg,#2f9fe0,#22d3ee)' : 'rgba(96,168,224,.35)') + '"></div></div></div>';
      }).join('') + '</div>' +
      (visit.anomalies.length ? '<div style="margin-top:12px">' + visit.anomalies.map(function (a) {
        return '<div class="banner ' + (a.level === 'alert' ? 'alert' : a.level === 'warn' ? 'warn' : '') + '" style="margin-bottom:6px">' + util.esc(a.message) + '</div>';
      }).join('') + '</div>' : '<div class="banner" style="margin-top:12px">本次数据未见异常。</div>') +
      '<div class="btn-row" style="margin-top:12px">' +
      (visit.source === 'sim' ? '<button class="btn primary" data-act="sim-save">保存到记录</button>' : '') +
      '<button class="btn" data-act="sim-ai">AI 生成分析</button>' +
      '</div>' +
      '<div id="sim-ai-out" style="margin-top:10px"></div>' +
      '</div>' +
      (payload.scenario && payload.scenario.conflict ? '<div class="banner warn" style="margin-top:10px">这是「冲突样本」：重量来自 <b>' + util.esc(payload.scenario.target.name) + '</b>，画面却来自 <b>' + util.esc(payload.scenario.frameCat.name) + '</b>。两组特征指向不同的猫，系统因此拒绝给出结论——这正是真实产品里避免误判的关键设计。</div>' : '');
  }
  /* ================= 记录 ================= */
  function renderLog(catFilter) {
    if (catFilter) UI.logCat = catFilter;
    var cats = store.state.cats;
    var list = store.state.visits.slice().sort(function (a, b) { return b.startedAt - a.startedAt; });
    if (UI.logCat !== 'all') list = list.filter(function (v) { return v.catId === UI.logCat; });
    list = list.map(function (v) {
      var cat = catById(v.catId);
      var an = rules.visitAnomalies(v, cat);
      var level = an.some(function (a) { return a.level === 'alert'; }) ? 'alert' : an.some(function (a) { return a.level === 'warn'; }) ? 'warn' : an.length ? 'info' : 'ok';
      return { v: v, cat: cat, an: an, level: level };
    });
    if (UI.logLevel !== 'all') list = list.filter(function (x) { return x.level === UI.logLevel; });

    viewEl.innerHTML =
      '<div class="section" style="margin-top:4px">' +
      '<div class="segmented" data-act="log-cat" style="overflow-x:auto">' +
      '<button data-val="all" class="' + (UI.logCat === 'all' ? 'on' : '') + '">全部</button>' +
      cats.map(function (c) { return '<button data-val="' + c.id + '" class="' + (UI.logCat === c.id ? 'on' : '') + '">' + util.esc(c.name) + '</button>'; }).join('') +
      '</div>' +
      '<div class="segmented" data-act="log-level" style="margin-top:8px">' +
      ['all', 'ok', 'info', 'warn', 'alert'].map(function (k) {
        var lb = { all: '全部级别', ok: '正常', info: '提示', warn: '关注', alert: '预警' }[k];
        return '<button data-val="' + k + '" class="' + (UI.logLevel === k ? 'on' : '') + '">' + lb + '</button>';
      }).join('') + '</div>' +
      '<div class="tiny2 muted" style="margin:9px 2px">共 ' + list.length + ' 条记录 · 点任意一条查看判定证据</div>' +
      '</div>' +

      '<div class="section"><div class="list">' +
      (list.length ? list.slice(0, 200).map(function (x) {
        var v = x.v;
        return '<div class="item" data-act="log-open" data-id="' + v.id + '">' +
          '<img class="avatar" src="' + (x.cat ? x.cat.avatar : 'assets/img/favicon.svg') + '" alt="">' +
          '<div class="main"><div class="t1">' + util.esc(x.cat ? x.cat.name : '身份未确认') + ' · ' + util.esc(ULO.VOID_LABEL[v.voiding]) + '</div>' +
          '<div class="t2">' + util.fmtDateTime(v.startedAt) + ' · ' + util.dur(v.durationSec) + ' · ' + util.fmtG(v.deltaG) + ' · 置信度 ' + util.pct(v.confidence) + '</div></div>' +
          '<div class="right"><span class="dot ' + x.level + '"></span>' +
          '<div class="tiny2 muted" style="margin-top:3px">' + (x.an.length ? x.an.length + ' 项异常' : '正常') + '</div></div>' +
          '</div>';
      }).join('') : '<div class="empty">没有符合条件的记录</div>') +
      '</div></div>';
  }

  function openVisitSheet(id) {
    var v = store.state.visits.filter(function (x) { return x.id === id; })[0];
    if (!v) return;
    var cat = catById(v.catId);
    var an = rules.visitAnomalies(v, cat);
    var series = ((v.signals && v.signals.series) || []).map(Number);
    var ev = v.evidence || {};
    var rank = ev.ranked || [];

    var mask = document.createElement('div');
    mask.className = 'sheet-mask';
    mask.innerHTML = '<div class="sheet"><div class="grab"></div>' +
      '<div class="row"><img src="' + (cat ? cat.avatar : 'assets/img/favicon.svg') + '" alt="" style="width:44px;height:44px;border-radius:12px;border:1px solid var(--border)">' +
      '<div style="flex:1"><b style="font-size:16px">' + util.esc(cat ? cat.name : '身份未确认') + '</b>' +
      '<div class="tiny muted">' + util.fmtDateTime(v.startedAt) + ' · 来源：' + (v.source === 'seed' ? '合成数据' : v.source === 'photo' ? '上传照片' : '模拟器') + '</div></div>' +
      '<button class="icon-btn" data-act="sheet-close">✕</button></div>' +
      '<div class="grid c2" style="margin-top:12px">' +
      '<div class="stat"><div class="k">实测体重</div><div class="v mono">' + util.fmtKg(v.peakWeightG) + '</div></div>' +
      '<div class="stat"><div class="k">排出量</div><div class="v mono">' + util.fmtG(v.deltaG) + '</div></div>' +
      '<div class="stat"><div class="k">停留时长</div><div class="v mono">' + util.dur(v.durationSec) + '</div></div>' +
      '<div class="stat"><div class="k">识别置信度</div><div class="v mono">' + util.pct(v.confidence) + '</div></div>' +
      '</div>' +
      (series.length > 2 ? '<div class="card" style="margin-top:10px"><div class="tiny2 muted" style="margin-bottom:6px">重量曲线</div>' + charts.line(series, { w: 320, h: 120, color: '#22d3ee', min: 0, yFmt: function (x) { return (x / 1000).toFixed(1); } }) + '</div>' : '') +
      (rank.length ? '<div class="card" style="margin-top:10px"><div class="tiny2 muted" style="margin-bottom:8px">识别打分明细</div>' +
        rank.map(function (x) {
          return '<div style="margin-bottom:8px"><div class="row between tiny"><span>' + util.esc(x.name) + '</span><span class="mono">' + x.score.toFixed(2) + '</span></div>' +
            '<div class="tiny2 muted">重量吻合 ' + x.weightScore.toFixed(2) + (x.imageScore == null ? ' · 图像不可用' : ' · 图像吻合 ' + x.imageScore.toFixed(2)) + '</div>' +
            '<div style="height:5px;border-radius:3px;background:#0a1424;margin-top:4px"><div style="height:100%;width:' + (x.score * 100).toFixed(0) + '%;background:linear-gradient(90deg,#2f9fe0,#22d3ee);border-radius:3px"></div></div></div>';
        }).join('') + '</div>' : '') +
      '<div class="card" style="margin-top:10px"><div class="tiny2 muted" style="margin-bottom:6px">本次异常判定</div>' +
      (an.length ? an.map(function (a) { return '<div class="banner ' + (a.level === 'warn' ? 'warn' : a.level === 'alert' ? 'alert' : '') + '" style="margin-bottom:6px">' + util.esc(a.message) + '</div>'; }).join('')
        : '<div class="tiny muted">未见异常。</div>') + '</div>' +
      '<div class="btn-row" style="margin-top:12px"><button class="btn primary" data-act="log-ai" data-id="' + v.id + '">AI 生成分析</button>' +
      '<button class="btn danger" data-act="log-del" data-id="' + v.id + '">删除记录</button></div>' +
      '<div id="sheet-ai" style="margin-top:10px"></div>' +
      '</div>';
    document.body.appendChild(mask);
  }
  /* ================= 猫档案 ================= */
  var AVATARS = ['assets/img/cat-mimi.svg', 'assets/img/cat-doudou.svg', 'assets/img/cat-tuanzi.svg'];

  function renderCats() {
    var cats = store.state.cats;
    var now = Date.now();
    viewEl.innerHTML =
      '<div class="section" style="margin-top:4px"><div class="section-head"><h2>猫咪档案</h2><span class="hint">识别与预警的基线来源</span></div>' +
      '<div class="list" style="gap:10px">' + (cats.length ? cats.map(function (c) {
        var h = rules.catHealth(c, store.state.visits, now);
        return '<div class="card"><div class="row">' +
          '<img src="' + c.avatar + '" alt="" style="width:52px;height:52px;border-radius:14px;border:1px solid var(--border)">' +
          '<div style="flex:1;min-width:0"><div class="row" style="gap:7px"><b>' + util.esc(c.name) + '</b>' + levelChip(h.level) + '</div>' +
          '<div class="tiny muted">' + util.esc(c.coat) + ' · 基线 ' + util.fmtKg(c.baselineWeightG) + ' ± ' + c.weightToleranceG + ' g</div>' +
          '<div class="tiny2 muted">' + util.esc(c.note || '') + '</div></div></div>' +
          '<div class="grid c3" style="margin-top:10px">' +
          '<div class="stat"><div class="k">近 24h</div><div class="v mono">' + h.urine24 + '<small> 次尿</small></div></div>' +
          '<div class="stat"><div class="k">体重趋势</div><div class="v mono" style="font-size:16px;color:' + (h.pctPerDay <= -1.5 ? 'var(--alert)' : 'inherit') + '">' + (h.pctPerDay >= 0 ? '+' : '') + h.pctPerDay.toFixed(2) + '%<small>/天</small></div></div>' +
          '<div class="stat"><div class="k">平均时长</div><div class="v mono" style="font-size:16px">' + util.dur(h.avgDuration) + '</div></div>' +
          '</div>' +
          '<div class="btn-row" style="margin-top:10px"><button class="btn sm" data-act="cat-edit" data-id="' + c.id + '">编辑</button>' +
          '<button class="btn sm danger" data-act="cat-del" data-id="' + c.id + '">删除</button></div></div>';
      }).join('') : '<div class="empty">还没有猫咪档案</div>') + '</div>' +
      '<button class="btn primary block" style="margin-top:12px" data-act="cat-edit" data-id="">+ 新增猫咪</button>' +
      '<div class="section banner">基准体重是识别的核心：实测体重与某只猫基线越接近，重量特征的吻合度越高。容差表示可接受的波动范围。</div></div>';
  }

  function openCatSheet(id) {
    var c = id ? catById(id) : null;
    var mask = document.createElement('div');
    mask.className = 'sheet-mask';
    mask.innerHTML = '<div class="sheet"><div class="grab"></div>' +
      '<h3>' + (c ? '编辑猫咪' : '新增猫咪') + '</h3>' +
      '<div class="field"><label>名字</label><input id="cat-name" value="' + util.esc(c ? c.name : '') + '" placeholder="例如：咪咪"></div>' +
      '<div class="field"><label>花色</label><input id="cat-coat" value="' + util.esc(c ? c.coat : '') + '" placeholder="例如：橘猫"></div>' +
      '<div class="field"><label>头像</label><div class="row" style="gap:8px">' +
      AVATARS.map(function (a, i) {
        var on = c ? c.avatar === a : i === 0;
        return '<img src="' + a + '" data-act="cat-avatar" data-src="' + a + '" alt="" data-selected="' + (on ? '1' : '0') + '" style="width:54px;height:54px;border-radius:14px;border:2px solid ' + (on ? 'var(--accent)' : 'var(--border)') + ';cursor:pointer">';
      }).join('') + '</div></div>' +
      '<div class="grid c2">' +
      '<div class="field"><label>基准体重（克）</label><input id="cat-bw" type="number" step="10" value="' + (c ? c.baselineWeightG : 4200) + '"></div>' +
      '<div class="field"><label>容差（克）</label><input id="cat-tol" type="number" step="10" value="' + (c ? c.weightToleranceG : 250) + '"></div>' +
      '</div>' +
      '<div class="field"><label>备注</label><input id="cat-note" value="' + util.esc(c ? c.note || '' : '') + '" placeholder="年龄 / 是否绝育 / 其他"></div>' +
      '<div class="btn-row"><button class="btn primary block" data-act="cat-save" data-id="' + (c ? c.id : '') + '">保存</button>' +
      '<button class="btn ghost" data-act="sheet-close">取消</button></div></div>';
    document.body.appendChild(mask);
  }

  /* ================= 更多 / 设置 ================= */
  function renderMore() {
    var s = store.settings();
    viewEl.innerHTML =
      '<div class="section" style="margin-top:4px">' +
      '<div class="card"><div class="row between"><div><b>AI 模式</b><div class="tiny muted">' +
      (s.aiMode === 'real' ? '真实视觉大模型' : '本地规则引擎') + (s.apiKey ? ' · 已配置 Key' : '') + '</div></div>' +
      '<span class="chip ' + (s.aiMode === 'real' && s.apiKey ? 'ok' : 'ghost') + '">' + (s.aiMode === 'real' && s.apiKey ? '已启用' : '默认') + '</span></div></div>' +
      '<div class="list" style="margin-top:10px">' +
      moreItem('#/settings', 'AI 接入设置', '可选的视觉大模型配置') +
      moreItem('#/about', '实现说明', '真实硬件方案 + Demo 如何近似 + 工时与踩坑') +
      moreItem('#/selftest', '逻辑自检', '在浏览器里跑一遍断言') +
      '</div>' +
      '<div class="card" style="margin-top:10px">' +
      '<b>演示数据</b><div class="tiny muted" style="margin:6px 0 10px">当前共 ' + store.state.cats.length + ' 只猫、' + store.state.visits.length + ' 条记录，全部保存在本机浏览器（localStorage），不会上传到任何服务器。</div>' +
      '<div class="btn-row"><button class="btn sm" data-act="export">导出数据 JSON</button>' +
      '<button class="btn sm danger" data-act="reset">重置演示数据</button></div></div>' +
      '<div class="section banner">本 Demo 为纯静态前端，没有后端、没有数据库。所有识别与预警算法都在你的浏览器里运行。</div></div>';
  }

  function moreItem(href, title, sub) {
    return '<a class="item" href="' + href + '" style="color:inherit"><div class="main"><div class="t1">' + title + '</div><div class="t2">' + sub + '</div></div>' + I.chev + '</a>';
  }

  function renderSettings() {
    var s = store.settings();
    viewEl.innerHTML =
      '<div class="section" style="margin-top:4px">' +
      '<div class="field"><label>AI 模式</label><div class="segmented" data-act="set-mode">' +
      '<button data-val="local" class="' + (s.aiMode === 'local' ? 'on' : '') + '">本地规则引擎</button>' +
      '<button data-val="real" class="' + (s.aiMode === 'real' ? 'on' : '') + '">真实视觉大模型</button>' +
      '</div><div class="tip">本地模式不需要网络与密钥，所有判定由浏览器内的规则引擎完成；真实模式会把重量数据与抓拍图片发给你指定的模型。</div></div>' +
      '<div class="field"><label>接口地址（OpenAI 兼容 /chat/completions）</label><input id="set-url" value="' + util.esc(s.baseUrl) + '" placeholder="https://api.openai.com/v1"></div>' +
      '<div class="field"><label>模型名</label><input id="set-model" value="' + util.esc(s.model) + '" placeholder="gpt-4o-mini"></div>' +
      '<div class="field"><label>API Key</label><input id="set-key" type="password" value="' + util.esc(s.apiKey) + '" placeholder="sk-..."></div>' +
      '<div class="field"><label>识别置信阈值：<b id="set-th-v">' + s.threshold.toFixed(2) + '</b></label>' +
      '<input id="set-th" type="range" min="0.4" max="0.95" step="0.01" value="' + s.threshold + '">' +
      '<div class="tip">低于该值就判为「身份未确认」，而不是硬猜一只猫。</div></div>' +
      '<div class="btn-row"><button class="btn primary" data-act="set-save">保存设置</button>' +
      '<button class="btn" data-act="set-test">测试连接</button></div>' +
      '<div id="set-out" style="margin-top:10px"></div>' +
      '<div class="section banner warn">API Key 只保存在本机浏览器里。因为是纯静态页面，从浏览器直连大模型服务时密钥对使用者是可见的，正式产品应改为服务端代理调用。</div>' +
      '</div>';
  }
  /* ================= 实现说明 ================= */
  function renderAbout() {
    viewEl.innerHTML =
      '<div class="section md" style="margin-top:4px">' +
      '<figure><img src="assets/img/litterbox.svg" alt="ULO 猫砂盆硬件结构"><figcaption>真实产品侧的感知结构：4 路称重 + 上方摄像头 + 边缘主控</figcaption></figure>' +

      '<h3>这个 Demo 做了什么</h3>' +
      '<p>题目要求「让猫厕所看见猫咪」：分辨是哪只猫、记录如厕行为、发现健康异常。这个网页把整条链路都跑通了，而且不需要后端——所有算法都在你的浏览器里运行。</p>' +

      '<h3>真实的 ULO 会怎么做</h3>' +
      '<ul>' +
      '<li><b>称重</b>：盆底四角各一个电阻应变式称重传感器（配合 HX711 放大），采样 10–20 Hz，得到猫咪站立时的稳定重量与如厕前后的差值。</li>' +
      '<li><b>图像</b>：盆体上方一颗广角摄像头，猫咪进入时抓拍 3–5 帧关键帧。</li>' +
      '<li><b>边缘</b>：ESP32-S3 负责去噪与事件切分（重量从 0 上升、稳定、出现阶跃、归零），只上传关键帧与特征，既省流量也保护隐私。</li>' +
      '<li><b>识别</b>：重量特征（峰值体重、波动方差）与图像特征（花色直方图、体长体宽比）融合打分取最高；分数太低就判「未确认」。</li>' +
      '<li><b>健康</b>：单次指标（时长、排出量）加长期趋势（7 日体重斜率、24 小时排尿次数）进规则引擎，再由大模型生成可读的分析。</li>' +
      '</ul>' +

      '<h3>Demo 里是怎么近似这些的</h3>' +
      '<div class="step"><b>1</b><div>模拟器按猫咪档案的基准体重生成一条真实形状的重量曲线：进入 → 稳定 → 如厕时阶跃下降 → 离开归零，每 100 ms 采一个点。</div></div>' +
      '<div class="step"><b>2</b><div>识别用两个真实计算的分数：重量用高斯函数衡量「实测体重与基线体重之差除以容差」；图像用画布提取的 16 维特征向量（12 个色相直方图 + 饱和度 + 明度 + 暗部占比 + 暖色占比）做余弦相似度。</div></div>' +
      '<div class="step"><b>3</b><div>两者按 0.65 与 0.35 加权，低于阈值、或前两名差距不足 0.06 时输出「身份未确认」。</div></div>' +
      '<div class="step"><b>4</b><div>规则引擎按个体基线判定 6 类异常：体重下降、排尿频繁、久蹲、尿量偏少、长时间无记录、粪便量偏离。</div></div>' +
      '<div class="step"><b>5</b><div>点「AI 生成分析」时，本地模式用模板生成中文报告；真实模式把数据连同抓拍图片发给视觉大模型，并要求返回严格 JSON。</div></div>' +

      '<h3>怎么自己跑一遍</h3>' +
      '<ol style="padding-left:18px;font-size:13px;color:#c6d6ea">' +
      '<li>看板页：观察预置的合成数据，团子会同时触发体重下降、排尿频繁与久蹲的预警。</li>' +
      '<li>模拟器页：选「自动」并点开始监测，看整条重量曲线如何演化。</li>' +
      '<li>切成「冲突样本」再跑一次，看系统如何拒绝给出结论。</li>' +
      '<li>切成「上传照片」传一张你自己的猫咪照片，看真实图像特征的打分。</li>' +
      '<li>记录页点任意一条查看判定证据；设置页可切换到真实大模型。</li>' +
      '</ol>' +

      '<h3>工时记录</h3>' +
      '<table><tr><th>阶段</th><th>内容</th><th>耗时</th></tr>' +
      '<tr><td>选题与拆解</td><td>确定 B 方案、划分四个功能模块</td><td>0.5 h</td></tr>' +
      '<tr><td>素材</td><td>手写 6 个 SVG（3 只猫、结构图、封面、图标）</td><td>1 h</td></tr>' +
      '<tr><td>核心算法</td><td>识别打分、规则引擎、合成数据</td><td>2.5 h</td></tr>' +
      '<tr><td>界面与模拟器</td><td>5 个标签页、实时曲线、事件流</td><td>3 h</td></tr>' +
      '<tr><td>联调与自检</td><td>断言、移动端适配、降级验证</td><td>1 h</td></tr>' +
      '<tr><td>合计</td><td>—</td><td>约 8 h</td></tr></table>' +

      '<h3>踩过的坑</h3>' +
      '<ul>' +
      '<li><b>file:// 下 ES Module 会被 CORS 拦截</b>：双击打开 HTML 时 type="module" 直接报错，所以全部改成传统脚本加全局命名空间，双击也能跑。</li>' +
      '<li><b>SVG 图片画到 canvas 会被视为污染</b>：本地 file:// 下 getImageData 会抛异常，图像特征提取失败。解决办法是 try/catch 后降级为确定性的哈希特征向量，部署到 https 之后自动恢复真实提取。</li>' +
      '<li><b>手机端 100vh 会被浏览器工具栏吃掉</b>：改用 100dvh 配合 env(safe-area-inset-bottom)，底部标签栏才不会被 iPhone 的小黑条盖住。</li>' +
      '<li><b>识别阈值不能太高</b>：一开始设 0.8，同一只猫稍微胖一点就判不出来。改成 0.68 并加入「前两名差距不足 0.06 也算未确认」，才既有区分度又不乱猜。</li>' +
      '<li><b>重量单位</b>：传感器输出是克，界面要显示千克，合成数据里来回换算极容易写错，最后统一以克存储、只在展示层除 1000。</li>' +
      '<li><b>浏览器直连大模型会暴露密钥</b>：纯静态页面没有后端可藏，只能作演示用途，README 里已明确标注。</li>' +
      '</ul>' +

      '<h3>已知局限</h3>' +
      '<ul>' +
      '<li>数据是合成的，不能用于任何真实的健康判断。</li>' +
      '<li>图像识别用的是通用颜色与轮廓特征，不是训练过的猫咪个体识别模型；真实产品需要每只猫的定标样本。</li>' +
      '<li>规则阈值（例如每天 1.5%）来自常见兽医参考区间，需要在真实数据上重新标定。</li>' +
      '</ul>' +
      '</div>';
  }

  /* ================= 自检 ================= */
  function runTests() {
    var T = [];
    function ok(name, cond, detail) { T.push({ name: name, pass: !!cond, detail: detail || '' }); }
    var u = util;

    ok('高斯打分在完全吻合时为 1', Math.abs(u.gauss(0, 250) - 1) < 1e-9);
    ok('高斯打分随偏差单调下降', u.gauss(100, 250) > u.gauss(500, 250));
    ok('线性回归斜率正确', Math.abs(u.linreg([{ x: 0, y: 100 }, { x: 1, y: 98 }, { x: 2, y: 96 }]).slope + 2) < 1e-9);
    ok('余弦相似度自比为 1', Math.abs(u.cosine([1, 2, 3], [1, 2, 3]) - 1) < 1e-9);

    var cats = store.state.cats;
    var fakeRef = {};
    cats.forEach(function (c) { fakeRef[c.id] = u.hashVec(c.avatar, 16); });

    var r1 = ULO.identify.recognize({ peakWeightG: cats[0].baselineWeightG, signature: fakeRef[cats[0].id] }, cats, fakeRef, {});
    ok('体重与图像完全吻合时识别正确', r1.best === cats[0].id && r1.confidence > 0.9, 'best=' + r1.best + ' conf=' + r1.confidence);

    var r2 = ULO.identify.recognize({ peakWeightG: cats[0].baselineWeightG, signature: fakeRef[cats[1].id] }, cats, fakeRef, {});
    ok('重量与图像互相矛盾时拒绝判定', r2.unknown === true, 'topScore=' + (r2.ranked[0] ? r2.ranked[0].score : 'n/a'));

    var r3 = ULO.identify.recognize({ peakWeightG: 99999, signature: fakeRef[cats[0].id] }, cats, fakeRef, {});
    ok('体重完全对不上时拒绝判定', r3.unknown === true);

    var r4 = ULO.identify.recognize({ peakWeightG: cats[1].baselineWeightG, signature: null }, cats, fakeRef, {});
    ok('没有图像时只按重量判定且置信度封顶 0.9', r4.best === cats[1].id && r4.confidence <= 0.9 && r4.usedImage === false);

    ok('久蹲能被识别', rules.visitAnomalies({ catId: cats[0].id, durationSec: 200, deltaG: 30, voiding: 'urine' }, cats[0]).some(function (a) { return a.code === 'LONG_STAY'; }));
    ok('尿量偏少能被识别', rules.visitAnomalies({ catId: cats[0].id, durationSec: 40, deltaG: 8, voiding: 'urine' }, cats[0]).some(function (a) { return a.code === 'LOW_URINE'; }));
    ok('正常记录不产生异常', rules.visitAnomalies({ catId: cats[0].id, durationSec: 45, deltaG: 30, voiding: 'urine' }, cats[0]).length === 0);

    var now = Date.now();
    var hs = cats.map(function (c) { return rules.catHealth(c, store.state.visits, now); });
    var tuanzi = hs.filter(function (h) { return h.cat.id === 'cat-tuanzi'; })[0];
    var mimi = hs.filter(function (h) { return h.cat.id === 'cat-mimi'; })[0];
    ok('预置数据让团子触发预警', tuanzi && tuanzi.level === 'alert', tuanzi ? 'level=' + tuanzi.level + '、体重斜率=' + tuanzi.pctPerDay + '%/天' : '无数据');
    ok('预置数据让团子的体重趋势为下降', tuanzi && tuanzi.pctPerDay <= -1.5, tuanzi ? tuanzi.pctPerDay + '%' : '');
    var doudou = hs.filter(function (h) { return h.cat.id === 'cat-doudou'; })[0];
    ok('预置数据不会让咪咪误报', mimi && mimi.level === 'ok', mimi ? 'level=' + mimi.level : '');
    ok('预置数据不会让豆豆误报', doudou && doudou.level === 'ok', doudou ? 'level=' + doudou.level + (doudou.alerts.length ? '：' + doudou.alerts.map(function (x) { return x.code; }).join(',') : '') : '');

    var before = store.state.cats.length;
    var tmp = store.addCat({ name: '自检猫', baselineWeightG: 3900 });
    var added = store.cat(tmp.id) != null;
    store.removeCat(tmp.id);
    ok('新增与删除猫咪可正确落库', added && store.cat(tmp.id) == null && store.state.cats.length === before);

    ok('数据可完整序列化', JSON.parse(JSON.stringify(store.state)).cats.length === before);

    return T;
  }

  function renderSelftest() {
    var T = runTests();
    var pass = T.filter(function (t) { return t.pass; }).length;
    viewEl.innerHTML =
      '<div class="section" style="margin-top:4px"><div class="card"><div class="row between"><b>共 ' + T.length + ' 项断言</b>' +
      '<span class="chip ' + (pass === T.length ? 'ok' : 'alert') + '">' + pass + ' / ' + T.length + ' 通过</span></div>' +
      '<div class="tiny muted" style="margin-top:6px">这些断言直接跑在页面里的真实算法上：识别打分、规则引擎、数据读写，不需要任何测试框架。</div></div>' +
      '<div class="selftest" style="margin-top:12px">' + T.map(function (t) {
        return '<div class="case ' + (t.pass ? 'pass' : 'fail') + '"><span class="mark">' + (t.pass ? '✓' : '✗') + '</span><span>' + util.esc(t.name) +
          (t.detail ? '<span class="why">' + util.esc(t.detail) + '</span>' : '') + '</span></div>';
      }).join('') + '</div>' +
      '<button class="btn block" style="margin-top:12px" data-act="selftest-run">重新运行</button></div>';
  }
  /* ================= 事件 ================= */
  function closeSheet() {
    var m = document.querySelector('.sheet-mask');
    if (m) m.remove();
  }

  function reportHtml(rep) {
    var cls = rep.level === 'alert' ? ' alert-card' : rep.level === 'warn' ? ' alert-card warn' : '';
    return '<div class="card' + cls + '">' +
      '<div class="row between"><b>' + util.esc(rep.headline) + '</b>' + levelChip(rep.level) + '</div>' +
      '<div class="tiny2 muted" style="margin-top:4px">' + util.esc(rep.model || '') + (rep.note ? ' · ' + util.esc(rep.note) : '') + '</div>' +
      '<p class="tiny" style="margin-top:8px;color:#d7e6f7">' + util.esc(rep.summary) + '</p>' +
      (rep.findings && rep.findings.length ? '<div class="grid c2" style="margin-top:10px">' + rep.findings.map(function (f) {
        return '<div class="stat"><div class="k">' + util.esc(f.label) + '</div><div class="v mono" style="font-size:15px">' + util.esc(f.value) + '</div></div>';
      }).join('') + '</div>' : '') +
      (rep.advice && rep.advice.length ? '<div style="margin-top:10px">' + rep.advice.map(function (a) {
        return '<div class="banner" style="margin-bottom:6px">' + util.esc(a) + '</div>';
      }).join('') + '</div>' : '') +
      '</div>';
  }

  function runAiAnalysis(visitId, outId) {
    var visit = visitId
      ? store.state.visits.filter(function (x) { return x.id === visitId; })[0]
      : (UI.sim.lastRun && UI.sim.lastRun.visit);
    if (!visit) return;
    var out = document.getElementById(outId);
    if (!out) return;
    out.innerHTML = '<div class="banner row" style="gap:9px;align-items:center"><span class="spinner"></span><span>正在生成分析…</span></div>';
    var cat = catById(visit.catId);
    var src = (visit.signals && visit.signals.frames && visit.signals.frames[0]) || null;
    var needImg = store.settings().aiMode === 'real' && src;
    (needImg ? imageToDataUrl(src) : Promise.resolve(null)).then(function (dataUrl) {
      return ai.analyze({
        visit: visit, cat: cat, cats: store.state.cats,
        visits: store.state.visits, settings: store.settings(), imageDataUrl: dataUrl
      });
    }).then(function (rep) {
      out.innerHTML = reportHtml(rep);
    }).catch(function (err) {
      out.innerHTML = '<div class="banner alert">分析失败：' + util.esc(err.message) + '</div>';
    });
  }

  function bind() {
    app.addEventListener('click', function (e) {
      var seg = e.target.closest('.segmented');
      var segVal = e.target.getAttribute && e.target.getAttribute('data-val');
      if (seg && segVal != null) {
        var segAct = seg.getAttribute('data-act');
        if (segAct === 'sim-mode') { UI.sim.mode = segVal; if (segVal === 'pick' && !UI.sim.pick) UI.sim.pick = store.state.cats[0].id; renderSimulator(); return; }
        if (segAct === 'log-cat') { UI.logCat = segVal; renderLog(); return; }
        if (segAct === 'log-level') { UI.logLevel = segVal; renderLog(); return; }
        if (segAct === 'set-mode') { store.updateSettings({ aiMode: segVal }); renderSettings(); return; }
      }

      var t = e.target.closest('[data-act]');
      if (!t) return;
      var act = t.getAttribute('data-act');

      if (act === 'nav') {
        if (t.getAttribute('data-cat')) UI.logCat = t.getAttribute('data-cat');
        closeSheet();
        location.hash = t.getAttribute('data-to');
        return;
      }
      if (act === 'sheet-close') { closeSheet(); return; }
      if (act === 'sim-start') { startSim(); return; }
      if (act === 'sim-stop') {
        sim.stop();
        UI.sim.running = false;
        var b = document.getElementById('sim-start');
        if (b) b.textContent = '开始监测';
        toast('已停止监测');
        return;
      }
      if (act === 'sim-save') {
        if (!UI.sim.lastRun) return;
        store.addVisit(UI.sim.lastRun.visit);
        UI.sim.lastRun = null;
        var host = document.getElementById('sim-result');
        if (host) host.innerHTML = '<div class="banner">这次记录已经保存，可以在「记录」标签页里查看。</div>';
        toast('已保存到如厕记录', 'ok');
        return;
      }
      if (act === 'sim-ai') { runAiAnalysis(null, 'sim-ai-out'); return; }
      if (act === 'log-ai') { runAiAnalysis(t.getAttribute('data-id'), 'sheet-ai'); return; }
      if (act === 'log-open') { openVisitSheet(t.getAttribute('data-id')); return; }
      if (act === 'log-del') {
        store.removeVisit(t.getAttribute('data-id'));
        closeSheet();
        renderLog();
        toast('已删除该条记录');
        return;
      }
      if (act === 'cat-edit') { openCatSheet(t.getAttribute('data-id')); return; }
      if (act === 'cat-avatar') {
        var imgs = t.parentNode.querySelectorAll('img');
        Array.prototype.forEach.call(imgs, function (x) { x.style.borderColor = 'var(--border)'; x.setAttribute('data-selected', '0'); });
        t.style.borderColor = 'var(--accent)';
        t.setAttribute('data-selected', '1');
        return;
      }
      if (act === 'cat-save') {
        var id = t.getAttribute('data-id');
        var name = document.getElementById('cat-name').value.trim();
        if (!name) { toast('请填写名字', 'err'); return; }
        var sel = document.querySelector('[data-act="cat-avatar"][data-selected="1"]');
        var payload = {
          name: name,
          coat: document.getElementById('cat-coat').value.trim() || '未知花色',
          avatar: sel ? sel.getAttribute('data-src') : AVATARS[0],
          baselineWeightG: Number(document.getElementById('cat-bw').value) || 4000,
          weightToleranceG: Number(document.getElementById('cat-tol').value) || 250,
          note: document.getElementById('cat-note').value.trim()
        };
        if (id) store.updateCat(id, payload); else store.addCat(payload);
        closeSheet();
        ensureRefs().then(function () { renderCats(); });
        toast('已保存', 'ok');
        return;
      }
      if (act === 'cat-del') {
        var cid = t.getAttribute('data-id');
        var c = catById(cid);
        if (confirm('删除「' + (c ? c.name : '') + '」？该猫的所有记录也会一并删除。')) {
          store.removeCat(cid);
          ensureRefs().then(function () { renderCats(); });
          toast('已删除');
        }
        return;
      }
      if (act === 'set-save') {
        store.updateSettings({
          baseUrl: document.getElementById('set-url').value.trim() || 'https://api.openai.com/v1',
          model: document.getElementById('set-model').value.trim() || 'gpt-4o-mini',
          apiKey: document.getElementById('set-key').value.trim(),
          threshold: Number(document.getElementById('set-th').value) || 0.68
        });
        toast('设置已保存', 'ok');
        return;
      }
      if (act === 'set-test') {
        var out2 = document.getElementById('set-out');
        out2.innerHTML = '<div class="banner row" style="gap:9px;align-items:center"><span class="spinner"></span><span>正在测试连接…</span></div>';
        ai.test({
          baseUrl: document.getElementById('set-url').value.trim(),
          model: document.getElementById('set-model').value.trim(),
          apiKey: document.getElementById('set-key').value.trim()
        }).then(function (r) {
          out2.innerHTML = '<div class="banner ' + (r.ok ? '' : 'alert') + '">' + util.esc(r.message) + '</div>';
        });
        return;
      }
      if (act === 'reset') {
        if (confirm('重置为初始演示数据？你新增的猫咪与记录都会被清除。')) {
          store.reset();
          UI.logCat = 'all'; UI.logLevel = 'all'; UI.sim.lastRun = null;
          ensureRefs().then(function () { renderMore(); });
          toast('已重置演示数据', 'ok');
        }
        return;
      }
      if (act === 'export') {
        var blob = new Blob([JSON.stringify(store.state, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'ulo-demo-data.json';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
        return;
      }
      if (act === 'selftest-run') { renderSelftest(); return; }
    });

    app.addEventListener('input', function (e) {
      var t = e.target.closest('[data-act]');
      if (!t) return;
      var act = t.getAttribute('data-act');
      if (act === 'set-th') {
        var el = document.getElementById('set-th-v');
        if (el) el.textContent = Number(t.value).toFixed(2);
      }
      if (act === 'sim-photo-weight') UI.photo.weightG = Number(t.value) || 4000;
    });

    app.addEventListener('change', function (e) {
      var t = e.target.closest('[data-act]');
      if (!t) return;
      var act = t.getAttribute('data-act');
      if (act === 'sim-pick') { UI.sim.pick = t.value; return; }
      if (act === 'sim-photo') {
        var f = t.files && t.files[0];
        if (!f) return;
        toast('正在读取照片…');
        ai.compress(f).then(function (dataUrl) {
          UI.photo.dataUrl = dataUrl;
          return ULO.image.extract(dataUrl);
        }).then(function (sig) {
          UI.photo.signature = sig || util.hashVec(UI.photo.dataUrl.slice(-64), 16);
          renderSimulator();
          toast(sig ? '照片特征提取成功（真实画布特征）' : 'canvas 受限，已使用降级特征向量', sig ? 'ok' : '');
        }).catch(function (err) { toast('照片读取失败：' + err.message, 'err'); });
        return;
      }
    });

    document.addEventListener('click', function (e) {
      if (e.target.classList && e.target.classList.contains('sheet-mask')) closeSheet();
    });
  }

  /* ================= 启动 ================= */
  function boot() {
    app = document.getElementById('app');
    store.load();
    store.save();
    window.addEventListener('hashchange', route);
    bind();
    ensureRefs().then(route).catch(route);
    setInterval(function () {
      var el = document.getElementById('sim-clock');
      if (el) { var d = new Date(); el.textContent = util.pad(d.getHours()) + ':' + util.pad(d.getMinutes()) + ':' + util.pad(d.getSeconds()); }
    }, 1000);
  }

  ULO.app = { boot: boot, route: route, tests: runTests };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
