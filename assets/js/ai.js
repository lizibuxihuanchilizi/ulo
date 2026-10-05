/* ULO · AI 适配层：本地规则报告 / 真实 OpenAI 兼容视觉模型，失败自动降级 */
(function (global) {
  'use strict';
  var ULO = global.ULO;
  var util = ULO.util;

  function summarizeCat(cat, visits, now) {
    var mine = visits.filter(function (v) { return v.catId === cat.id; });
    var last7 = mine.filter(function (v) { return now - v.startedAt <= 7 * 86400000; });
    var urine = last7.filter(function (v) { return v.voiding === 'urine' || v.voiding === 'both'; });
    var stool = last7.filter(function (v) { return v.voiding === 'stool' || v.voiding === 'both'; });
    return {
      name: cat.name,
      coat: cat.coat,
      baselineKg: util.round(cat.baselineWeightG / 1000, 2),
      tolG: cat.weightToleranceG,
      visits7: last7.length,
      urine7: urine.length,
      stool7: stool.length,
      avgDuration: last7.length ? util.round(util.mean(last7.map(function (v) { return v.durationSec; })), 1) : 0,
      avgUrineG: urine.length ? util.round(util.mean(urine.map(function (v) { return v.deltaG; })), 1) : 0,
      avgStoolG: stool.length ? util.round(util.mean(stool.map(function (v) { return v.deltaG; })), 1) : 0
    };
  }

  /* ---------- 本地报告：完全基于规则引擎，无需联网 ---------- */
  function localReport(ctx) {
    var visit = ctx.visit, cat = ctx.cat, cats = ctx.cats, visits = ctx.visits, now = Date.now();
    var anomalies = visit.anomalies || ULO.rules.visitAnomalies(visit, cat);
    var level = 'ok';
    anomalies.forEach(function (a) {
      if (a.level === 'alert') level = 'alert';
      else if (a.level === 'warn' && level !== 'alert') level = 'warn';
      else if (a.level === 'info' && level === 'ok') level = 'info';
    });

    var who = cat ? cat.name : '身份未确认的猫咪';
    var headline = who + ' · ' + (ULO.VOID_LABEL[visit.voiding] || '如厕') + ' · ' + util.dur(visit.durationSec);
    var findings = [
      { label: '实测体重', value: util.fmtKg(visit.peakWeightG), tone: 'ok' },
      { label: '排出量', value: util.fmtG(visit.deltaG), tone: visit.deltaG < 12 ? 'warn' : 'ok' },
      { label: '停留时长', value: util.dur(visit.durationSec), tone: visit.durationSec > 120 ? 'warn' : 'ok' },
      { label: '识别置信度', value: util.pct(visit.confidence), tone: visit.confidence >= 0.68 ? 'ok' : 'warn' }
    ];

    var parts = [];
    if (cat) {
      var dev = visit.peakWeightG - cat.baselineWeightG;
      parts.push('本次称重 ' + util.fmtKg(visit.peakWeightG) + '，与该猫基线 ' + util.fmtKg(cat.baselineWeightG) +
        ' 相差 ' + util.signed(dev / 1000, 2) + ' kg。');
      var s = summarizeCat(cat, visits, now);
      parts.push('近 7 天共记录 ' + s.visits7 + ' 次，其中排尿 ' + s.urine7 + ' 次、排便 ' + s.stool7 +
        ' 次，平均单次停留 ' + util.dur(s.avgDuration) + '。');
      if (s.avgUrineG) parts.push('该猫平均单次尿量约 ' + util.fmtG(s.avgUrineG) + '，本次为 ' + util.fmtG(visit.deltaG) + '。');
    } else {
      parts.push('本次重量与所有猫咪档案的吻合度都不足，或两只猫得分过于接近，因此没有强行判定身份。' +
        '建议核对基线体重，或让猫咪在摄像头范围内多停留一会儿。');
    }
    anomalies.forEach(function (a) { parts.push(a.message); });

    var advice = [];
    if (anomalies.some(function (a) { return a.code === 'LONG_STAY'; })) {
      advice.push('记录接下来 2–3 次如厕的时长；若持续超过 2 分钟，建议做尿检或就医。');
    }
    if (anomalies.some(function (a) { return a.code === 'LOW_URINE'; })) {
      advice.push('留意饮水量与尿量变化，必要时收集尿样送检。');
    }
    if (anomalies.some(function (a) { return a.code === 'UNKNOWN_ID'; })) {
      advice.push('为该猫补一张清晰的照片，或重新测定基准体重，可提升识别准确率。');
    }
    if (anomalies.some(function (a) { return a.code === 'WEIGHT_LOSS'; })) {
      advice.push('体重持续下降需要优先排查，建议尽快咨询兽医并做血液检查。');
    }
    if (!advice.length) advice.push('本次数据在正常范围内，继续保持日常记录即可。');

    return {
      source: 'local',
      level: level,
      headline: headline,
      summary: parts.join(' '),
      findings: findings,
      advice: advice,
      model: '本地规则引擎 v1'
    };
  }

  /* ---------- 真实大模型 ---------- */
  function buildMessages(ctx) {
    var visit = ctx.visit, cat = ctx.cat, cats = ctx.cats, visits = ctx.visits;
    var roster = cats.map(function (c) { return summarizeCat(c, visits, Date.now()); });
    var payload = {
      visit: {
        startedAt: new Date(visit.startedAt).toISOString(),
        durationSec: visit.durationSec,
        measuredWeightG: visit.peakWeightG,
        deltaG: visit.deltaG,
        voiding: visit.voiding,
        identificationConfidence: visit.confidence,
        identifiedCat: cat ? cat.name : null,
        ruleFlags: (visit.anomalies || []).map(function (a) { return a.message; })
      },
      cats: roster
    };
    var text = [
      '你是猫科健康监测助手。下面是一台智能猫砂盆刚采集到的一次如厕记录，以及家里所有猫的 7 日统计。',
      '请判断这次如厕是否正常，并用简体中文输出严格的 JSON（不要 Markdown 代码块），字段为：',
      '{"headline": "一句话标题", "level": "ok|info|warn|alert", "summary": "2-4 句分析", "findings": [{"label":"指标名","value":"值"}], "advice": ["建议1","建议2"]}',
      '要求：结论要克制，不要下诊断，出现异常时提示就医；数据不足以判断时直接说明。',
      JSON.stringify(payload)
    ].join('\n');

    var content = [{ type: 'text', text: text }];
    if (ctx.imageDataUrl) {
      content.push({ type: 'text', text: '以下是本次如厕时摄像头抓拍的画面，请结合画面特征判断猫咪状态：' });
      content.push({ type: 'image_url', image_url: { url: ctx.imageDataUrl } });
    }
    return [{ role: 'user', content: content }];
  }

  function parseJson(text) {
    if (!text) return null;
    var t = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try { return JSON.parse(t); } catch (e) { /* 宽松提取 */ }
    var m = t.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch (e2) { /* ignore */ } }
    return null;
  }

  function callApi(settings, messages, useJsonMode) {
    var url = String(settings.baseUrl || '').replace(/\/+$/, '') + '/chat/completions';
    var body = {
      model: settings.model,
      messages: messages,
      temperature: 0.3,
      max_tokens: 700
    };
    if (useJsonMode) body.response_format = { type: 'json_object' };
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 30000) : null;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + settings.apiKey },
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      return res.text().then(function (txt) {
        if (!res.ok) {
          var err = new Error('HTTP ' + res.status + ' ' + txt.slice(0, 200));
          err.status = res.status;
          throw err;
        }
        var json = null;
        try { json = JSON.parse(txt); } catch (e) { throw new Error('返回内容不是合法 JSON'); }
        var content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
        return { text: content, usage: json.usage || null };
      });
    }).catch(function (e) {
      if (timer) clearTimeout(timer);
      throw e;
    });
  }

  var ai = (ULO.ai = {
    summarizeCat: summarizeCat,
    local: localReport,

    /* 统一入口：按设置决定走本地还是真实模型；真实模型失败自动降级 */
    analyze: function (ctx) {
      var settings = ctx.settings || ULO.store.settings();
      var fallback = localReport(ctx);
      if (settings.aiMode !== 'real' || !settings.apiKey) {
        return Promise.resolve(fallback).then(function (r) {
          r.note = settings.aiMode === 'real' ? '未填写 API Key，已使用本地规则引擎。' : '当前为本地规则引擎模式。';
          return r;
        });
      }
      var messages = buildMessages(ctx);
      return callApi(settings, messages, true).catch(function (e) {
        if (e && e.status === 400) return callApi(settings, messages, false); /* 部分端点不支持 json_object */
        throw e;
      }).then(function (res) {
        var parsed = parseJson(res.text);
        if (!parsed) throw new Error('模型没有返回可解析的 JSON');
        return {
          source: 'real',
          level: ['ok', 'info', 'warn', 'alert'].indexOf(parsed.level) >= 0 ? parsed.level : fallback.level,
          headline: parsed.headline || fallback.headline,
          summary: parsed.summary || fallback.summary,
          findings: Array.isArray(parsed.findings) && parsed.findings.length ? parsed.findings : fallback.findings,
          advice: Array.isArray(parsed.advice) && parsed.advice.length ? parsed.advice : fallback.advice,
          model: settings.model,
          usage: res.usage,
          note: '由视觉大模型生成'
        };
      }).catch(function (e) {
        fallback.note = '真实模型调用失败（' + (e && e.message ? e.message : '未知错误') + '），已自动降级为本地规则引擎。';
        fallback.degraded = true;
        return fallback;
      });
    },

    /* 连接自检 */
    test: function (settings) {
      if (!settings.apiKey) return Promise.resolve({ ok: false, message: '请先填写 API Key' });
      return callApi(settings, [{ role: 'user', content: '只回复两个字：可用' }], false)
        .then(function (r) { return { ok: true, message: '连接成功：' + String(r.text || '').trim().slice(0, 40) }; })
        .catch(function (e) { return { ok: false, message: '连接失败：' + (e && e.message ? e.message : '未知错误') }; });
    },

    /* 图片压缩为 dataURL，便于上传给视觉模型 */
    compress: function (file, maxSize) {
      maxSize = maxSize || 768;
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () {
          var img = new Image();
          img.onload = function () {
            var scale = Math.min(1, maxSize / Math.max(img.width, img.height));
            var c = document.createElement('canvas');
            c.width = Math.round(img.width * scale);
            c.height = Math.round(img.height * scale);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            try { resolve(c.toDataURL('image/jpeg', 0.82)); }
            catch (e) { resolve(reader.result); }
          };
          img.onerror = function () { reject(new Error('图片读取失败')); };
          img.src = reader.result;
        };
        reader.onerror = function () { reject(new Error('文件读取失败')); };
        reader.readAsDataURL(file);
      });
    }
  });
})(window);
