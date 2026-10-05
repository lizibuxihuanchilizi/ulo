/* ULO · 核心层：工具函数 / 数据存储 / 多猫识别 / 健康规则引擎 */
(function (global) {
  'use strict';
  var ULO = (global.ULO = global.ULO || {});

  /* ================= 工具函数 ================= */
  var util = (ULO.util = {
    uid: function (p) {
      return (p || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    },
    clamp: function (v, a, b) { return v < a ? a : v > b ? b : v; },
    round: function (v, d) { var m = Math.pow(10, d || 0); return Math.round(v * m) / m; },
    rand: function (a, b) { return a + Math.random() * (b - a); },
    randInt: function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
    pick: function (arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    mean: function (arr) { return arr.length ? arr.reduce(function (s, v) { return s + v; }, 0) / arr.length : 0; },
    stdev: function (arr) {
      if (arr.length < 2) return 0;
      var m = util.mean(arr);
      return Math.sqrt(util.mean(arr.map(function (v) { return (v - m) * (v - m); })));
    },
    /* 高斯打分：diff 越小越接近 1 */
    gauss: function (diff, sigma) {
      if (!sigma) return 0;
      return Math.exp(-0.5 * Math.pow(diff / sigma, 2));
    },
    /* 最小二乘线性回归，points = [{x, y}] */
    linreg: function (points) {
      var n = points.length;
      if (n < 2) return { slope: 0, intercept: points.length ? points[0].y : 0, n: n };
      var sx = 0, sy = 0, sxy = 0, sxx = 0;
      points.forEach(function (p) { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; });
      var den = n * sxx - sx * sx;
      var slope = den === 0 ? 0 : (n * sxy - sx * sy) / den;
      var intercept = (sy - slope * sx) / n;
      return { slope: slope, intercept: intercept, n: n };
    },
    cosine: function (a, b) {
      if (!a || !b) return 0;
      var dot = 0, na = 0, nb = 0;
      for (var i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
      if (!na || !nb) return 0;
      return dot / (Math.sqrt(na) * Math.sqrt(nb));
    },
    /* 直方图交集：先各自归一化再取 min 求和，比余弦对分布差异敏感得多 */
    histIntersection: function (a, b, bins) {
      var sa = 0, sb = 0, s = 0, i;
      for (i = 0; i < bins; i++) { sa += a[i]; sb += b[i]; }
      if (!sa || !sb) return 0;
      for (i = 0; i < bins; i++) s += Math.min(a[i] / sa, b[i] / sb);
      return s;
    },
    /* 标量特征（后 4 维）的相似度 */
    scalarSim: function (a, b, from) {
      var d = 0, n = a.length - from;
      if (n <= 0) return 1;
      for (var i = from; i < a.length; i++) d += Math.abs(a[i] - b[i]);
      return Math.max(0, 1 - d / n);
    },
    /* 16 维图像特征向量相似度：前 12 维色相直方图 + 后 4 维标量 */
    imageSim: function (a, b) {
      if (!a || !b || a.length !== b.length) return 0;
      if (a.length <= 8) return util.histIntersection(a, b, a.length);
      return 0.65 * util.histIntersection(a, b, 12) + 0.35 * util.scalarSim(a, b, 12);
    },
    /* 稳定哈希 -> [0,1) 向量，用于 canvas 不可用时的确定性降级 */    hashVec: function (str, n) {
      n = n || 16;
      var bins = Math.max(1, n - 4), out = [], i, j, sum = 0;
      function hashAt(k) {
        var key = str + '#' + k + '#ulo';
        var h = 2166136261;
        for (j = 0; j < key.length; j++) { h ^= key.charCodeAt(j); h = Math.imul(h, 16777619); }
        return ((h >>> 0) % 100003) / 100003;
      }
      /* 前 bins 维：指数分布归一化，模拟稀疏的色相直方图 */
      for (i = 0; i < bins; i++) { var v = -Math.log(1 - hashAt(i) * 0.999); out.push(v); sum += v; }
      for (i = 0; i < bins; i++) out[i] = +(out[i] / (sum || 1)).toFixed(5);
      /* 后 4 维：0..1 标量特征 */
      for (i = 0; i < 4 && out.length < n; i++) out.push(+hashAt(bins + i).toFixed(4));
      return out;
    },
    /* 归一化到 0..1（按最大值） */
    normalize: function (v) {
      var m = Math.max.apply(null, v) || 1;
      return v.map(function (x) { return x / m; });
    },
    fmtKg: function (g) { return (g / 1000).toFixed(2) + ' kg'; },
    fmtG: function (g) { return Math.round(g) + ' g'; },
    pad: function (n) { return n < 10 ? '0' + n : '' + n; },
    fmtTime: function (ts) { var d = new Date(ts); return util.pad(d.getHours()) + ':' + util.pad(d.getMinutes()); },
    fmtDate: function (ts) { var d = new Date(ts); return d.getMonth() + 1 + '月' + d.getDate() + '日'; },
    fmtDateTime: function (ts) { var d = new Date(ts); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + util.fmtTime(ts); },
    dayKey: function (ts) { var d = new Date(ts); return d.getFullYear() + '-' + util.pad(d.getMonth() + 1) + '-' + util.pad(d.getDate()); },
    relTime: function (ts, now) {
      var s = Math.max(0, ((now || Date.now()) - ts) / 1000);
      if (s < 60) return '刚刚';
      if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
      if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
      var d = Math.floor(s / 86400);
      return d === 1 ? '昨天' : d + ' 天前';
    },
    dur: function (sec) {
      sec = Math.round(sec);
      if (sec < 60) return sec + ' 秒';
      return Math.floor(sec / 60) + ' 分 ' + util.pad(sec % 60) + ' 秒';
    },
    esc: function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },
    pct: function (v) { return Math.round(v * 100) + '%'; },
    signed: function (v, d) { return (v > 0 ? '+' : '') + v.toFixed(d == null ? 1 : d); }
  });

  /* ================= 图像特征 ================= */
  var VOID_LABEL = { urine: '排尿', stool: '排便', both: '排便 + 排尿', unknown: '未判定' };
  ULO.VOID_LABEL = VOID_LABEL;
  ULO.LEVEL_LABEL = { ok: '正常', info: '提示', warn: '关注', alert: '预警' };

  var sigCache = {};
  var image = (ULO.image = {
    /* 尝试从图片中真正提取特征向量；浏览器限制 canvas 读取时返回 null */
    extract: function (src) {
      if (Object.prototype.hasOwnProperty.call(sigCache, src)) return Promise.resolve(sigCache[src]);
      return new Promise(function (resolve) {
        var img;
        try { img = new Image(); }
        catch (e) { sigCache[src] = null; resolve(null); return; }
        img.crossOrigin = 'anonymous';
        img.onload = function () {
          var sig = null;
          try {
            var c = document.createElement('canvas');
            c.width = 48; c.height = 48;
            var ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0, 48, 48);
            var d = ctx.getImageData(0, 0, 48, 48).data;
            var hue = new Array(12).fill(0), satSum = 0, valSum = 0, dark = 0, warm = 0, count = 0;
            for (var i = 0; i < d.length; i += 4) {
              var r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
              var mx = Math.max(r, g, b), mn = Math.min(r, g, b), df = mx - mn;
              var v = mx, s = mx === 0 ? 0 : df / mx;
              var h = 0;
              if (df !== 0) {
                if (mx === r) h = ((g - b) / df) % 6;
                else if (mx === g) h = (b - r) / df + 2;
                else h = (r - g) / df + 4;
                h *= 60; if (h < 0) h += 360;
              }
              if (s > 0.12 && v > 0.35) hue[Math.min(11, Math.floor(h / 30))] += s;
              satSum += s; valSum += v;
              if (v < 0.28) dark++;
              if (s > 0.25 && (h < 70 || h > 330)) warm++;
              count++;
            }
            var hs = hue.reduce(function (a, b) { return a + b; }, 0) || 1;
            sig = hue.map(function (x) { return +(x / hs).toFixed(4); }).concat([
              +(satSum / count).toFixed(4),
              +(valSum / count).toFixed(4),
              +(dark / count).toFixed(4),
              +(warm / count).toFixed(4)
            ]);
          } catch (e) { sig = null; }
          sigCache[src] = sig;
          resolve(sig);
        };
        img.onerror = function () { sigCache[src] = null; resolve(null); };
        img.src = src;
      });
    },
    /* 特征向量：优先真实提取，失败则退回确定性哈希向量 */
    signatureOf: function (src) {
      return image.extract(src).then(function (sig) {
        return { vec: sig || util.hashVec(src, 16), real: !!sig };
      });
    },
    /* 批量：返回 { catId: vec } 与是否全部为真实特征 */
    reference: function (cats) {
      return Promise.all(cats.map(function (c) { return image.signatureOf(c.avatar); }))
        .then(function (list) {
          var map = {}, allReal = true;
          list.forEach(function (s, i) { map[cats[i].id] = s.vec; if (!s.real) allReal = false; });
          return { map: map, allReal: allReal };
        });
    }
  });

  /* ================= 多猫识别 ================= */
  var identify = (ULO.identify = {
    DEFAULT_THRESHOLD: 0.68,
    /* peakWeightG 实测体重；signature 摄像头帧特征；cats 候选猫 */
    recognize: function (input, cats, refMap, opts) {
      opts = opts || {};
      var threshold = opts.threshold == null ? identify.DEFAULT_THRESHOLD : opts.threshold;
      var wW = opts.weightWeight == null ? 0.65 : opts.weightWeight;
      var wI = opts.imageWeight == null ? 0.35 : opts.imageWeight;
      var frameVec = input.signature || null;

      var ranked = cats.map(function (c) {
        var tol = c.weightToleranceG || 250;
        var weightScore = util.gauss((input.peakWeightG || 0) - c.baselineWeightG, tol);
        var imageScore = null;
        if (frameVec && refMap && refMap[c.id]) {
          imageScore = util.clamp(util.imageSim(frameVec, refMap[c.id]), 0, 1);
        }
        var score, usedImage = imageScore != null;
        if (usedImage) score = wW * weightScore + wI * imageScore;
        else score = weightScore;
        return {
          catId: c.id, name: c.name, avatar: c.avatar,
          weightScore: +weightScore.toFixed(4),
          imageScore: imageScore == null ? null : +imageScore.toFixed(4),
          score: +score.toFixed(4),
          usedImage: usedImage
        };
      }).sort(function (a, b) { return b.score - a.score; });

      var top = ranked[0] || null;
      var second = ranked[1] || null;
      var usedImage = !!(top && top.usedImage);
      var unknown = !top || top.score < threshold;
      /* 第一名与第二名过于接近 -> 视为无法区分 */
      var margin = top && second ? top.score - second.score : 1;
      var ambiguous = !unknown && margin < 0.06;
      if (ambiguous) unknown = true;

      /* 证据冲突：重量最像的猫与图像最像的猫不是同一只，且图像证据足够可信时，拒绝下结论 */
      var conflictReason = null;
      if (!unknown && usedImage) {
        var byW = ranked.slice().sort(function (a, b) { return b.weightScore - a.weightScore; })[0];
        var byI = ranked.slice().sort(function (a, b) { return (b.imageScore || 0) - (a.imageScore || 0); })[0];
        if (byW && byI && byW.catId !== byI.catId && byI.imageScore >= 0.6) {
          var wImg = ranked.filter(function (x) { return x.catId === byW.catId; })[0].imageScore || 0;
          if (byI.imageScore - wImg >= 0.15) {
            unknown = true;
            conflictReason = '重量特征最像 ' + byW.name + '，图像特征最像 ' + byI.name + '，两组证据互相矛盾，因此不给出结论。';
          }
        }
      }

      var confidence = top ? top.score : 0;
      /* 仅用重量判定时不给满信心 */
      if (!usedImage) confidence = Math.min(confidence, 0.9);

      return {
        ranked: ranked,
        best: unknown ? null : top.catId,
        bestName: unknown ? null : top.name,
        confidence: +confidence.toFixed(3),
        margin: +margin.toFixed(3),
        unknown: unknown,
        usedImage: usedImage,
        threshold: threshold,
        reason: !top ? '没有可比对的猫咪档案'
          : unknown
            ? (conflictReason || (ambiguous ? '两只猫的得分过于接近，无法区分' : '最高分低于置信阈值 ' + util.pct(threshold)))
            : null
      };
    }
  });

  /* ================= 健康规则引擎 ================= */
  var rules = (ULO.rules = {
    RULE_META: {
      WEIGHT_LOSS: { level: 'alert', title: '体重持续下降' },
      FREQ_UP: { level: 'warn', title: '如厕次数明显增多' },
      LONG_STAY: { level: 'warn', title: '久蹲 / 疑似费力' },
      LOW_URINE: { level: 'warn', title: '单次尿量偏少' },
      SILENT: { level: 'warn', title: '长时间没有如厕记录' },
      STOOL_DEV: { level: 'info', title: '粪便量与基线偏差较大' },
      UNKNOWN_ID: { level: 'warn', title: '身份未确认' }
    },
    /* 单次记录级别的异常 */
    visitAnomalies: function (visit, cat) {
      var out = [];
      if (!visit) return out;
      if (!visit.catId) {
        out.push({ code: 'UNKNOWN_ID', level: 'warn', message: '这次如厕没能确认是哪只猫，建议核对体重基线或补拍照片。' });
      }
      if (visit.durationSec > 120) {
        out.push({
          code: 'LONG_STAY', level: 'warn',
          message: '在猫砂盆里待了 ' + util.dur(visit.durationSec) + '，明显长于常见水平（< 90 秒），猫咪可能在用力或不适。'
        });
      }
      if (visit.voiding === 'urine' || visit.voiding === 'both') {
        if (visit.deltaG < 12) {
          out.push({ code: 'LOW_URINE', level: 'warn', message: '这次排尿量只有 ' + util.fmtG(visit.deltaG) + '，偏少。' });
        }
      }
      if (visit.voiding === 'stool' || visit.voiding === 'both') {
        if (cat && cat.stoolBaselineG && Math.abs(visit.deltaG - cat.stoolBaselineG) / cat.stoolBaselineG > 0.5) {
          out.push({
            code: 'STOOL_DEV', level: 'info',
            message: '粪便量 ' + util.fmtG(visit.deltaG) + '，与该猫基线 ' + util.fmtG(cat.stoolBaselineG) + ' 偏差超过一半。'
          });
        }
      }
      return out;
    },
    /* 单只猫的统计与聚合预警 */
    catHealth: function (cat, allVisits, now) {
      now = now || Date.now();
      var day = 86400000;
      var mine = allVisits.filter(function (v) { return v.catId === cat.id; })
        .sort(function (a, b) { return a.startedAt - b.startedAt; });
      var last24 = mine.filter(function (v) { return now - v.startedAt <= day; });
      var last7 = mine.filter(function (v) { return now - v.startedAt <= 7 * day; });
      var urine24 = last24.filter(function (v) { return v.voiding === 'urine' || v.voiding === 'both'; }).length;

      /* 按天取平均体重，做 7 日趋势 */
      var buckets = {};
      last7.forEach(function (v) {
        var k = util.dayKey(v.startedAt);
        (buckets[k] = buckets[k] || []).push(v.peakWeightG);
      });
      var keys = Object.keys(buckets).sort();
      var series = keys.map(function (k) { return { x: keys.indexOf(k), y: util.mean(buckets[k]), key: k }; });
      var reg = util.linreg(series);
      var refWeight = series.length ? util.mean(series.map(function (p) { return p.y; })) : cat.baselineWeightG;
      var pctPerDay = refWeight ? (reg.slope / refWeight) * 100 : 0;

      /* 今天的排尿次数 vs 之前几天的日均（用自然日，避免滚动窗口把昨天算进今天） */
      var todayKey = util.dayKey(now);
      var urineByDay = {};
      last7.forEach(function (v) {
        if (v.voiding === 'urine' || v.voiding === 'both') {
          var k = util.dayKey(v.startedAt);
          urineByDay[k] = (urineByDay[k] || 0) + 1;
        }
      });
      var urineToday = urineByDay[todayKey] || 0;
      var prevKeys = Object.keys(urineByDay).filter(function (k) { return k !== todayKey; });
      var urineDaily = prevKeys.length ? util.mean(prevKeys.map(function (k) { return urineByDay[k]; })) : 0;

      var stoolVisits = mine.filter(function (v) { return v.voiding === 'stool' || v.voiding === 'both'; });
      var stoolAvg = stoolVisits.length >= 4 ? util.mean(stoolVisits.map(function (v) { return v.deltaG; })) : 0;

      var longStays = mine.filter(function (v) {
        return now - v.startedAt <= 3 * day && v.durationSec > 120;
      });
      var hoursSince = mine.length ? (now - mine[mine.length - 1].startedAt) / 3600000 : null;

      var alerts = [];
      if (mine.length >= 3) {
        if (series.length >= 3 && pctPerDay <= -1.5) {
          alerts.push({
            code: 'WEIGHT_LOSS', level: 'alert', catId: cat.id,
            message: cat.name + ' 的近 7 日体重平均每天下降 ' + Math.abs(pctPerDay).toFixed(1) + '%（当前约 ' +
              util.fmtKg(series[series.length - 1].y) + '）。持续下降常与食欲、消化或代谢问题相关，建议尽快称重复核并咨询兽医。',
            metric: util.round(pctPerDay, 2)
          });
        }
        if (urineToday >= 4 && urineDaily > 0 && urineToday > urineDaily * 1.5) {
          alerts.push({
            code: 'FREQ_UP', level: urineToday >= 6 ? 'alert' : 'warn', catId: cat.id,
            message: cat.name + ' 今天已经排尿 ' + urineToday + ' 次，明显多于它平时的 ' + urineDaily.toFixed(1) + ' 次/天。',
            metric: urineToday
          });
        }
        if (longStays.length) {
          alerts.push({
            code: 'LONG_STAY', level: 'warn', catId: cat.id,
            message: '最近 3 天有 ' + longStays.length + ' 次如厕时长超过 2 分钟（最长 ' +
              util.dur(Math.max.apply(null, longStays.map(function (v) { return v.durationSec; }))) + '），可能是排尿困难或便秘。',
            metric: longStays.length
          });
        }
        var lastUrine = mine.filter(function (v) { return v.voiding === 'urine' || v.voiding === 'both'; }).pop();
        if (lastUrine && lastUrine.deltaG < 12 && now - lastUrine.startedAt <= 2 * day) {
          alerts.push({
            code: 'LOW_URINE', level: 'warn', catId: cat.id,
            message: '最近一次排尿量仅 ' + util.fmtG(lastUrine.deltaG) + '，低于常见区间（15–45 g）。',
            metric: lastUrine.deltaG
          });
        }
        if (hoursSince != null && hoursSince > 18) {
          alerts.push({
            code: 'SILENT', level: 'warn', catId: cat.id,
            message: '已经 ' + hoursSince.toFixed(1) + ' 小时没有记录到 ' + cat.name + ' 的如厕行为，建议确认猫咪状态。',
            metric: util.round(hoursSince, 1)
          });
        }
        var avgStool = stoolAvg || 0;
        if (avgStool) {
          var lastStool = stoolVisits[stoolVisits.length - 1];
          if (lastStool && Math.abs(lastStool.deltaG - avgStool) / avgStool > 0.6 && now - lastStool.startedAt <= 3 * day) {
            alerts.push({
              code: 'STOOL_DEV', level: 'info', catId: cat.id,
              message: '最近一次粪便量 ' + util.fmtG(lastStool.deltaG) + '，与该猫基线 ' + util.fmtG(avgStool) + ' 偏差较大。',
              metric: lastStool.deltaG
            });
          }
        }
      }

      var level = 'ok';
      alerts.forEach(function (a) {
        if (a.level === 'alert') level = 'alert';
        else if (a.level === 'warn' && level !== 'alert') level = 'warn';
        else if (a.level === 'info' && level === 'ok') level = 'info';
      });

      return {
        cat: cat, visits: mine, last24: last24, last7: last7,
        urine24: urine24, urineToday: urineToday, urineDaily: +urineDaily.toFixed(2), pctPerDay: +pctPerDay.toFixed(2),
        series: series, alerts: alerts, level: level,
        lastVisitAt: mine.length ? mine[mine.length - 1].startedAt : null,
        hoursSince: hoursSince == null ? null : +hoursSince.toFixed(1),
        avgDuration: mine.length ? +util.mean(mine.map(function (v) { return v.durationSec; })).toFixed(1) : 0,
        stoolBaselineG: stoolAvg ? +stoolAvg.toFixed(1) : null,
        healthScore: util.clamp(100 - alerts.reduce(function (s, a) {
          return s + (a.level === 'alert' ? 26 : a.level === 'warn' ? 12 : 5);
        }, 0), 20, 100)
      };
    }
  });

  /* ================= 数据存储 ================= */
  var STORAGE_KEY = 'ulo.prism.demo.v1';

  var DEFAULT_SETTINGS = {
    aiMode: 'local',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: '',
    threshold: 0.68,
    weightWeight: 0.65,
    imageWeight: 0.35
  };

  function seedCats(now) {
    return [
      { id: 'cat-mimi', name: '咪咪', avatar: 'assets/img/cat-mimi.svg', coat: '橘猫', baselineWeightG: 4230, weightToleranceG: 250, note: '3 岁 · 已绝育 · 性格黏人', createdAt: now - 120 * 86400000 },
      { id: 'cat-doudou', name: '豆豆', avatar: 'assets/img/cat-doudou.svg', coat: '灰白', baselineWeightG: 3080, weightToleranceG: 210, note: '2 岁 · 已绝育 · 偏瘦小', createdAt: now - 90 * 86400000 },
      { id: 'cat-tuanzi', name: '团子', avatar: 'assets/img/cat-tuanzi.svg', coat: '三花', baselineWeightG: 5620, weightToleranceG: 300, note: '6 岁 · 重点观察对象', createdAt: now - 150 * 86400000 }
    ];
  }

    /* 确定性伪随机：重置演示数据永远得到同样的结果，方便复现与自检 */
  function makeRng(seed) {
    var h = 2166136261;
    for (var i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    var s = h >>> 0;
    if (!s) s = 0x9e3779b9;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return (s >>> 0) / 4294967296;
    };
  }
  function rngRange(rng, a, b) { return a + rng() * (b - a); }

  /* 生成 7 天合成数据：团子埋入体重下降 / 频次上升 / 久蹲 / 尿量偏少 */
  function seedVisits(cats, now) {
    var plan = {
      'cat-mimi': [2, 2, 3, 2, 3, 2, 3],
      'cat-doudou': [2, 2, 2, 3, 2, 2, 3],
      'cat-tuanzi': [2, 2, 3, 4, 5, 5, 6]
    };
    var start = new Date(now); start.setHours(0, 0, 0, 0);
    var dayStartMs = start.getTime();
    var curHour = Math.max(1, new Date(now).getHours() + new Date(now).getMinutes() / 60);
    var out = [];

    cats.forEach(function (cat) {
      var counts = plan[cat.id] || [2, 2, 2, 2, 2, 2, 2];
      counts.forEach(function (n, d) {
        var daysAgo = 6 - d;
        var base = dayStartMs - daysAgo * 86400000;
        /* 团子每天体重下降约 1.9%，7 日回归斜率稳定低于 -1.5%/天 */
        var factor = cat.id === 'cat-tuanzi' ? Math.pow(0.981, d) : 1 + (d - 3) * 0.0022;
        var lastHour = d === 6 ? curHour : 23;
        for (var i = 0; i < n; i++) {
          var rng = makeRng(cat.id + '|' + d + '|' + i);
          var hour = 6 + ((i + 0.5) / n) * Math.max(2, lastHour - 6) + rngRange(rng, -0.5, 0.5);
          hour = Math.max(0.2, Math.min(lastHour - 0.05, hour));
          var ts = base + hour * 3600000;
          if (ts > now) ts = now - (60 + i * 11) * 60000;

          var r = rng();
          var voiding = cat.id === 'cat-tuanzi' && d === 6 ? 'urine'
            : r < 0.7 ? 'urine' : r < 0.93 ? 'stool' : 'both';
          var deltaG = voiding === 'urine' ? rngRange(rng, 18, 45)
            : voiding === 'stool' ? rngRange(rng, 42, 76)
              : rngRange(rng, 62, 110);
          var durationSec = rngRange(rng, 35, 92);
          var peak = cat.baselineWeightG * factor + rngRange(rng, -1, 1) * cat.weightToleranceG * 0.3;

          if (cat.id === 'cat-tuanzi' && d === 6 && i === n - 1) {
            durationSec = rngRange(rng, 150, 205);
            deltaG = rngRange(rng, 6, 11);
          } else if (cat.id === 'cat-tuanzi' && d === 5 && i === 0) {
            durationSec = rngRange(rng, 132, 168);
          }

          var series = [
            0, cat.baselineWeightG * 0.35, cat.baselineWeightG * 0.86,
            peak, peak, Math.max(0, peak - deltaG * 0.5), Math.max(0, peak - deltaG)
          ].map(function (v) { return Math.round(v); });

          out.push({
            id: util.uid('v'),
            catId: cat.id,
            startedAt: Math.round(ts),
            endedAt: Math.round(ts + durationSec * 1000),
            durationSec: Math.round(durationSec),
            entryWeightG: Math.round(peak),
            peakWeightG: Math.round(peak),
            deltaG: util.round(deltaG, 1),
            voiding: voiding,
            confidence: +rngRange(rng, 0.86, 0.97).toFixed(2),
            source: 'seed',
            evidence: {
              weightScore: +util.gauss(peak - cat.baselineWeightG, cat.weightToleranceG).toFixed(3),
              imageScore: +rngRange(rng, 0.78, 0.96).toFixed(3),
              note: '合成数据：按基线体重 + 确定性噪声生成'
            },
            signals: { series: series, frames: [cat.avatar] }
          });
        }
      });
    });
    return out.sort(function (a, b) { return a.startedAt - b.startedAt; });
  }

  var store = (ULO.store = {
    state: null,
    load: function () {
      var raw = null;
      try { raw = global.localStorage.getItem(STORAGE_KEY); } catch (e) { raw = null; }
      if (raw) {
        try {
          var parsed = JSON.parse(raw);
          if (parsed && parsed.cats && parsed.visits) {
            store.state = parsed;
            store.state.settings = Object.assign({}, DEFAULT_SETTINGS, parsed.settings || {});
            return store.state;
          }
        } catch (e) { /* 损坏则重建 */ }
      }
      return store.reset();
    },
    lastError: null,
    save: function () {
      try {
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify(store.state));
        store.lastError = null;
      } catch (e) {
        store.lastError = e;
      }
      return store.state;
    },
    reset: function () {
      var now = Date.now();
      var cats = seedCats(now);
      store.state = {
        version: 1,
        seededAt: now,
        cats: cats,
        visits: seedVisits(cats, now),
        settings: Object.assign({}, DEFAULT_SETTINGS)
      };
      store.save();
      return store.state;
    },
    /* --- 猫 --- */
    cat: function (id) {
      return store.state.cats.filter(function (c) { return c.id === id; })[0] || null;
    },
    addCat: function (data) {
      var cat = {
        id: data.id || util.uid('cat'),
        name: data.name || '新猫咪',
        avatar: data.avatar || 'assets/img/cat-mimi.svg',
        coat: data.coat || '未知花色',
        baselineWeightG: Number(data.baselineWeightG) || 4000,
        weightToleranceG: Number(data.weightToleranceG) || 250,
        note: data.note || '',
        createdAt: Date.now()
      };
      store.state.cats.push(cat);
      store.save();
      return cat;
    },
    updateCat: function (id, patch) {
      var cat = store.cat(id);
      if (!cat) return null;
      Object.keys(patch).forEach(function (k) { cat[k] = patch[k]; });
      if (patch.baselineWeightG != null) cat.baselineWeightG = Number(patch.baselineWeightG);
      if (patch.weightToleranceG != null) cat.weightToleranceG = Number(patch.weightToleranceG);
      store.save();
      return cat;
    },
    removeCat: function (id) {
      store.state.cats = store.state.cats.filter(function (c) { return c.id !== id; });
      store.state.visits = store.state.visits.filter(function (v) { return v.catId !== id; });
      store.save();
    },
    /* --- 记录 --- */
    addVisit: function (v) {
      var visit = Object.assign({ id: util.uid('v'), source: 'sim', evidence: {} }, v);
      store.state.visits.push(visit);
      store.state.visits.sort(function (a, b) { return a.startedAt - b.startedAt; });
      store.save();
      return visit;
    },
    removeVisit: function (id) {
      store.state.visits = store.state.visits.filter(function (v) { return v.id !== id; });
      store.save();
    },
    visits: function (filter) {
      filter = filter || {};
      return store.state.visits.filter(function (v) {
        if (filter.catId && v.catId !== filter.catId) return false;
        if (filter.since && v.startedAt < filter.since) return false;
        if (filter.onlyAlert && !(v.anomaliesCache && v.anomaliesCache.length)) return false;
        return true;
      }).slice().sort(function (a, b) { return b.startedAt - a.startedAt; });
    },
    settings: function () { return store.state.settings; },
    updateSettings: function (patch) {
      Object.assign(store.state.settings, patch);
      store.save();
      return store.state.settings;
    }
  });

  ULO.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
})(window);
