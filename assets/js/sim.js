/* ULO · 手写 SVG 图表 + 猫砂盆实时模拟器 */
(function (global) {
  'use strict';
  var ULO = global.ULO;
  var util = ULO.util;

  /* ================= 图表（无第三方依赖） ================= */
  var charts = (ULO.charts = {
    /* 折线图 / 面积图 */
    line: function (values, opts) {
      opts = opts || {};
      values = (values || []).filter(function (v) { return typeof v === 'number' && isFinite(v); });
      var w = opts.w || 320, h = opts.h || 130;
      var pad = opts.compact ? { l: 6, r: 6, t: 10, b: 10 } : { l: 44, r: 12, t: 14, b: 24 };
      var iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
      var uid = 'g' + Math.random().toString(36).slice(2, 8);

      if (!values.length) {
        return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" preserveAspectRatio="none">' +
          '<text x="' + w / 2 + '" y="' + h / 2 + '" text-anchor="middle" fill="#63799a" font-size="12">暂无数据</text></svg>';
      }
      var min = opts.min != null ? opts.min : Math.min.apply(null, values);
      var max = opts.max != null ? opts.max : Math.max.apply(null, values);
      if (max - min < (opts.minSpan || 1)) { var c = (max + min) / 2; min = c - (opts.minSpan || 1) / 2; max = c + (opts.minSpan || 1) / 2; }
      var span = max - min;
      var n = values.length;
      var X = function (i) { return pad.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1)); };
      var Y = function (v) { return pad.t + ih - ((v - min) / span) * ih; };

      var d = '', area = '';
      values.forEach(function (v, i) {
        d += (i ? ' L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1);
      });
      area = d + ' L' + X(n - 1).toFixed(1) + ' ' + (pad.t + ih) + ' L' + X(0).toFixed(1) + ' ' + (pad.t + ih) + ' Z';

      var grid = '';
      var ticks = opts.compact ? 2 : 3;
      if (!opts.compact) {
        for (var t = 0; t <= ticks; t++) {
          var gv = min + (span * t) / ticks, gy = Y(gv);
          grid += '<line x1="' + pad.l + '" y1="' + gy.toFixed(1) + '" x2="' + (w - pad.r) + '" y2="' + gy.toFixed(1) +
            '" stroke="rgba(96,168,224,.14)" stroke-width="1"/>';
          grid += '<text x="' + (pad.l - 7) + '" y="' + (gy + 3.5).toFixed(1) + '" text-anchor="end" fill="#63799a" font-size="10" font-family="' +
            'system-ui,sans-serif">' + (opts.yFmt ? opts.yFmt(gv) : Math.round(gv)) + '</text>';
        }
      }
      var xlabels = '';
      if (opts.labels && !opts.compact) {
        opts.labels.forEach(function (lb, i) {
          if (opts.labels.length > 5 && i % 2) return;
          xlabels += '<text x="' + X(opts.labels.length === 1 ? 0 : (i * iw) / (opts.labels.length - 1)).toFixed(1) +
            '" y="' + (h - 6) + '" text-anchor="middle" fill="#63799a" font-size="10" font-family="system-ui,sans-serif">' +
            util.esc(lb) + '</text>';
        });
      }
      var last = '';
      if (opts.showLast !== false) {
        last = '<circle cx="' + X(n - 1).toFixed(1) + '" cy="' + Y(values[n - 1]).toFixed(1) +
          '" r="3.6" fill="' + (opts.color || '#22d3ee') + '"/>' +
          '<circle cx="' + X(n - 1).toFixed(1) + '" cy="' + Y(values[n - 1]).toFixed(1) +
          '" r="7" fill="' + (opts.color || '#22d3ee') + '" opacity=".22"/>';
      }
      var color = opts.color || '#22d3ee';
      return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" preserveAspectRatio="none">' +
        '<defs><linearGradient id="' + uid + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="' + color + '" stop-opacity=".34"/>' +
        '<stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>' +
        grid +
        '<path d="' + area + '" fill="url(#' + uid + ')"/>' +
        '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' +
        last + xlabels + '</svg>';
    },

    /* 柱状图，items = [{label, value, parts:[{value,color}]}] */
    bars: function (items, opts) {
      opts = opts || {};
      items = items || [];
      var w = opts.w || 320, h = opts.h || 140;
      var pad = { l: 34, r: 10, t: 14, b: 26 };
      var iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
      if (!items.length) {
        return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '"><text x="' + w / 2 + '" y="' + h / 2 +
          '" text-anchor="middle" fill="#63799a" font-size="12">暂无数据</text></svg>';
      }
      var max = opts.max != null ? opts.max : Math.max.apply(null, items.map(function (i) { return i.value; }));
      max = max <= 0 ? 1 : max;
      var step = iw / items.length;
      var bw = Math.min(opts.barWidth || 26, step * 0.56);
      var out = '';
      for (var t = 0; t <= 2; t++) {
        var gv = (max * t) / 2, gy = pad.t + ih - (gv / max) * ih;
        out += '<line x1="' + pad.l + '" y1="' + gy.toFixed(1) + '" x2="' + (w - pad.r) + '" y2="' + gy.toFixed(1) +
          '" stroke="rgba(96,168,224,.14)"/>' +
          '<text x="' + (pad.l - 6) + '" y="' + (gy + 3.5).toFixed(1) + '" text-anchor="end" fill="#63799a" font-size="10">' +
          Math.round(gv) + '</text>';
      }
      items.forEach(function (it, i) {
        var cx = pad.l + step * i + step / 2;
        var x = cx - bw / 2;
        var top = pad.t + ih - (it.value / max) * ih;
        var parts = it.parts && it.parts.length ? it.parts : [{ value: it.value, color: it.color || '#38bdf8' }];
        var y = pad.t + ih;
        parts.forEach(function (p) {
          var ph = (p.value / max) * ih;
          y -= ph;
          out += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0, ph).toFixed(1) +
            '" rx="4" fill="' + (p.color || '#38bdf8') + '" opacity="' + (p.opacity == null ? 0.92 : p.opacity) + '"/>';
        });
        if (it.value > 0) {
          out += '<text x="' + cx.toFixed(1) + '" y="' + (top - 5).toFixed(1) + '" text-anchor="middle" fill="#bcd7f2" font-size="10" font-weight="700">' +
            (it.valueText || it.value) + '</text>';
        }
        out += '<text x="' + cx.toFixed(1) + '" y="' + (h - 8) + '" text-anchor="middle" fill="#63799a" font-size="10">' +
          util.esc(it.label) + '</text>';
      });
      return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '">' + out + '</svg>';
    },

    /* 环形健康分 */
    ring: function (score, opts) {
      opts = opts || {};
      var size = opts.size || 92, r = size / 2 - 8, c = 2 * Math.PI * r;
      var pct = util.clamp(score, 0, 100) / 100;
      var color = score >= 85 ? '#34d399' : score >= 65 ? '#fbbf24' : '#fb7185';
      return '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '">' +
        '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="rgba(96,168,224,.18)" stroke-width="8"/>' +
        '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="8" ' +
        'stroke-linecap="round" stroke-dasharray="' + (c * pct).toFixed(1) + ' ' + c.toFixed(1) +
        '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/>' +
        '<text x="' + size / 2 + '" y="' + (size / 2 + 2) + '" text-anchor="middle" fill="#e8f1ff" font-size="22" font-weight="800">' + Math.round(score) + '</text>' +
        '<text x="' + size / 2 + '" y="' + (size / 2 + 18) + '" text-anchor="middle" fill="#63799a" font-size="10">健康分</text></svg>';
    }
  });

  /* ================= 实时模拟器 ================= */
  var TICK = 100; /* ms */

  function Simulator(opts) {
    this.opts = opts || {};
    this.timer = null;
    this.t = 0;
    this.running = false;
    this.scenario = null;
  }

  Simulator.prototype.buildScenario = function (mode, cats) {
    var util_ = util;
    var auto = mode === 'auto' || !mode;
    var conflict = mode === 'conflict';
    var target = cats[0];
    if (mode && mode !== 'auto' && mode !== 'conflict') {
      target = cats.filter(function (c) { return c.id === mode; })[0] || cats[0];
    } else if (auto) {
      target = util_.pick(cats);
    }
    var other = cats.filter(function (c) { return c.id !== target.id; })[0] || target;

    var voiding = util_.pick(['urine', 'urine', 'urine', 'stool', 'both']);
    var deltaG = voiding === 'urine' ? util_.rand(16, 46)
      : voiding === 'stool' ? util_.rand(38, 88) : util_.rand(60, 120);
    /* 10% 概率演一次「久蹲 + 尿量偏少」的异常 */
    var abnormal = util_.rand(0, 1) < 0.15;
    var durationSec = abnormal ? util_.rand(140, 210) : util_.rand(38, 96);
    if (abnormal && voiding === 'stool') { voiding = 'urine'; deltaG = util_.rand(6, 11); }
    else if (abnormal) deltaG = Math.min(deltaG, util_.rand(6, 11));

    var peak = target.baselineWeightG + util_.rand(-1, 1) * target.weightToleranceG * 0.45;
    var frameCat = conflict ? other : target;

    return {
      target: target,
      frameCat: frameCat,
      conflict: conflict,
      peak: Math.round(peak),
      delta: util_.round(deltaG, 1),
      voiding: voiding,
      durationSec: Math.round(durationSec),
      abnormal: abnormal,
      timings: {
        approach: 10, settle: 14, voiding: 22, leave: 34, end: 44, analyze: 60
      }
    };
  };

  Simulator.prototype.phaseAt = function (t) {
    var tm = this.scenario.timings;
    if (t < tm.approach) return { key: 'approach', label: '侦测到猫咪进入', hint: '红外 + 重量阈值触发' };
    if (t < tm.settle) return { key: 'settle', label: '猫咪站立稳定，正在称重', hint: '4 路称重模块取均值' };
    if (t < tm.voiding) return { key: 'voiding', label: '检测到重量变化：如厕中', hint: '重量曲线出现阶跃' };
    if (t < tm.end) return { key: 'leave', label: '猫咪离开，采样结束', hint: '重量归零，序列封存' };
    return { key: 'analyze', label: 'AI 正在识别与分析', hint: '重量特征 + 图像特征融合' };
  };

  Simulator.prototype.weightAt = function (t) {
    var s = this.scenario, p = s.peak, d = s.delta;
    var kf = [
      [0, 0], [3, p * 0.12], [6, p * 0.55], [8, p * 0.93], [10, p],
      [13, p * 0.995], [17, p * 1.004], [21, p * 0.998],
      [23, p - d * 0.35], [25, p - d * 0.8], [27, p - d], [30, p - d * 0.995],
      [33, p - d * 0.98], [36, (p - d) * 0.55], [39, (p - d) * 0.16], [42, 0], [44, 0]
    ];
    if (t <= 0) return 0;
    if (t >= 44) return 0;
    for (var i = 0; i < kf.length - 1; i++) {
      if (t >= kf[i][0] && t <= kf[i + 1][0]) {
        var a = kf[i], b = kf[i + 1];
        var r = b[0] === a[0] ? 0 : (t - a[0]) / (b[0] - a[0]);
        var v = a[1] + (b[1] - a[1]) * r;
        /* 站立时的抖动噪声 */
        if (t > 10 && t < 22) v += Math.sin(t * 2.2) * 9 + util.rand(-4, 4);
        if (t > 27 && t < 36) v += Math.sin(t * 1.7) * 5;
        return Math.max(0, v);
      }
    }
    return 0;
  };

  Simulator.prototype.start = function (mode, cats) {
    var self = this;
    this.stop();
    this.scenario = this.buildScenario(mode, cats);
    this.t = 0;
    this.running = true;
    this.samples = [];
    this.lastPhase = null;
    if (this.opts.onStart) this.opts.onStart(this.scenario);

    var tickFn = function () {
      var t = self.t;
      var phase = self.phaseAt(t);
      if (phase.key !== self.lastPhase) {
        self.lastPhase = phase.key;
        if (self.opts.onPhase) self.opts.onPhase(phase, t);
      }
      var g = self.weightAt(t);
      self.samples.push(g);
      if (self.opts.onSample) self.opts.onSample(g, t, self.samples);
      if (phase.key === 'settle' && t === 12 && self.opts.onFrame) self.opts.onFrame(self.scenario.frameCat, 'settle');
      if (phase.key === 'voiding' && t === 25 && self.opts.onFrame) self.opts.onFrame(self.scenario.frameCat, 'voiding');

      if (t >= self.scenario.timings.analyze) {
        self.running = false;
        clearInterval(self.timer);
        self.timer = null;
        if (self.opts.onAnalyzeStart) self.opts.onAnalyzeStart();
        setTimeout(function () { self.finish(); }, self.opts.analyzeDelay == null ? 900 : self.opts.analyzeDelay);
        return;
      }
      self.t += 1;
    };
    this.timer = setInterval(tickFn, TICK);
    tickFn();
  };

  Simulator.prototype.finish = function () {
    var s = this.scenario, opts = this.opts;
    var refMap = opts.refMap && opts.refMap.map;
    var frameSig = refMap ? refMap[s.frameCat.id] : null;
    var result = ULO.identify.recognize({
      peakWeightG: s.peak,
      signature: frameSig
    }, opts.cats, refMap, {
      threshold: opts.threshold,
      weightWeight: opts.weightWeight,
      imageWeight: opts.imageWeight
    });

    var cat = result.best ? opts.cats.filter(function (c) { return c.id === result.best; })[0] : null;
    var visit = {
      catId: result.best,
      startedAt: Date.now() - s.durationSec * 1000,
      endedAt: Date.now(),
      durationSec: s.durationSec,
      entryWeightG: s.peak,
      peakWeightG: s.peak,
      deltaG: s.delta,
      voiding: s.voiding,
      confidence: result.confidence,
      source: 'sim',
      evidence: {
        weightScore: result.ranked[0] ? result.ranked[0].weightScore : 0,
        imageScore: result.ranked[0] ? result.ranked[0].imageScore : null,
        usedImage: result.usedImage,
        ranked: result.ranked,
        reason: result.reason,
        frameCatId: s.frameCat.id,
        conflict: s.conflict
      },
      signals: {
        series: this.samples.map(function (v) { return Math.round(v); }),
        frames: [s.frameCat.avatar]
      }
    };
    visit.anomalies = ULO.rules.visitAnomalies(visit, cat);
    if (result.unknown && !visit.anomalies.some(function (a) { return a.code === 'UNKNOWN_ID'; })) {
      visit.anomalies.unshift({ code: 'UNKNOWN_ID', level: 'warn', message: '识别置信度不足：' + (result.reason || '无法确定身份') });
    }
    if (opts.onResult) opts.onResult({ visit: visit, result: result, cat: cat, scenario: s });
  };

  Simulator.prototype.stop = function () {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.running = false;
  };

  ULO.Simulator = Simulator;
})(window);
