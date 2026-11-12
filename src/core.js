(function (root) {
  'use strict';
  const LEVELS = ['大', '中', '小'];
  const TYPES = ['金銭', '不倫'];
  const QUESTIONS = [
    { id: 'wrongness', label: 'この人物の行為を、どの程度許せないと感じますか。', low: 'まったく感じない', high: '非常に強く感じる' },
    { id: 'economic_advantage', label: 'この人物は、経済的に恵まれていると思いますか。', low: 'まったくそう思わない', high: '非常にそう思う' },
    { id: 'intimacy_imagery', label: 'この記事を読んで、身体的に親密な場面がどの程度思い浮かびましたか。', low: 'まったく思い浮かばなかった', high: '非常にはっきりと思い浮かんだ' }
  ];
  function key(x) { return [x.justice, x.envy, x.sexual].join('|'); }
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a += 0x6D2B79F5;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(array, random) {
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function validateBank(bank) {
    if (!Array.isArray(bank) || bank.length !== 108) throw new Error('刺激文は108件必要です。');
    const ids = new Set(), groups = {};
    bank.forEach(x => {
      if (!x || typeof x.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(x.id) || ['__proto__','constructor','prototype'].includes(x.id) || ids.has(x.id)) throw new Error('刺激文IDは重複のない半角英数字・ハイフン・下線にしてください。');
      ids.add(x.id);
      if (!TYPES.includes(x.category) || !['justice', 'envy', 'sexual'].every(k => LEVELS.includes(x[k]))) throw new Error('分類または条件ラベルが不正です: ' + x.id);
      if (typeof x.text !== 'string' || !x.text.trim() || x.text.length > 2000) throw new Error('本文が空欄、または2000字を超えています: ' + x.id);
      (groups[key(x)] = groups[key(x)] || []).push(x);
    });
    for (const j of LEVELS) for (const e of LEVELS) for (const s of LEVELS) {
      const k = [j, e, s].join('|'), g = groups[k] || [];
      if (g.length !== 4 || TYPES.some(t => g.filter(x => x.category === t).length !== 2)) throw new Error(k + ' は金銭2件・不倫2件の計4件にしてください。');
    }
    return Object.keys(groups).sort().map(k => groups[k].slice().sort((a, b) => a.id.localeCompare(b.id)));
  }
  function balancedMask(groups, random) {
    const indexes = groups.map((_, i) => i);
    for (let attempt = 0; attempt < 100000; attempt++) {
      const selected = new Set(shuffle(indexes, random).slice(0, 13));
      if (['justice', 'envy', 'sexual'].every(axis => LEVELS.every(level => {
        const n = groups.reduce((n, g, i) => n + (selected.has(i) && g[0][axis] === level ? 1 : 0), 0);
        return n === 4 || n === 5;
      }))) return indexes.map(i => selected.has(i));
    }
    throw new Error('割り当てを生成できませんでした。もう一度お試しください。');
  }
  function allocateBlock(bank, seed) {
    const groups = validateBank(bank), random = rng(seed);
    const a = balancedMask(groups, random), b = balancedMask(groups, random);
    const masks = shuffle([a, a.map(v => !v), b, b.map(v => !v)], random);
    const schedules = [[], [], [], []];
    groups.forEach((g, i) => {
      const money = shuffle(g.filter(x => x.category === '金銭'), random);
      const affair = shuffle(g.filter(x => x.category === '不倫'), random);
      for (let p = 0; p < 4; p++) schedules[p].push(masks[p][i] ? money.pop() : affair.pop());
    });
    return schedules.map(s => shuffle(s, random));
  }
  function validateAnswers(items, questions, answers, complete) {
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new Error('回答データが不正です。');
    const ids = new Set(items.map(x => x.id)), qs = new Set(questions.map(x => x.id));
    const clean = {};
    Object.keys(answers).forEach(id => {
      if (!ids.has(id)) throw new Error('割り当て外の刺激文です。');
      const entry = answers[id];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('回答形式が不正です。');
      clean[id] = {};
      Object.keys(entry).forEach(q => {
        const n = entry[q];
        if (!qs.has(q) || !Number.isInteger(n) || n < 1 || n > 7) throw new Error('回答は1〜7の整数にしてください。');
        clean[id][q] = n;
      });
    });
    if (complete && items.some(x => questions.some(q => !Number.isInteger(clean[x.id]?.[q.id])))) throw new Error('未回答の項目があります。');
    return clean;
  }
  function summary(items) {
    const result = { total: items.length, unique: new Set(items.map(key)).size, category: {}, justice: {}, envy: {}, sexual: {} };
    for (const x of items) for (const axis of ['category', 'justice', 'envy', 'sexual']) result[axis][x[axis]] = (result[axis][x[axis]] || 0) + 1;
    return result;
  }
  const api = { LEVELS, TYPES, QUESTIONS, key, rng, shuffle, validateBank, allocateBlock, validateAnswers, summary };
  if (typeof module !== 'undefined') module.exports = api;
  root.StudyCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
