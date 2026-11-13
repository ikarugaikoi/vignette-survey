(function (root) {
  'use strict';
  const LEVELS = ['大', '中', '小'];
  const TYPES = ['金銭', '不倫'];
  const QUESTIONS = [
    { id: 'read_more', label: 'この記事の続きを読みたいと思いますか。', low: '読みたくない', high: '読みたい', type: 'binary', block: 'Q1' },
    { id: 'social_acceptability', label: '社会的に許されると思いますか。', low: 'まったくそう思わない', high: '非常にそう思う', type: 'likert7', block: 'Q2' },
    { id: 'envy', label: 'ねたましいと思いますか。', low: 'まったくそう思わない', high: '非常にそう思う', type: 'likert7', block: 'Q2' },
    { id: 'sexual_curiosity', label: '性的好奇心を感じましたか。', low: 'まったく感じなかった', high: '非常に強く感じた', type: 'likert7', block: 'Q2' }
  ];
  function validateDemographics(value) {
    if (!value || !['female','male','other'].includes(value.gender)) throw new Error('性別を選択してください。');
    const other = typeof value.other === 'string' ? value.other.trim() : '';
    if (value.gender === 'other' && (!other || other.length > 100)) throw new Error('その他の内容を1〜100字で入力してください。');
    return {gender:value.gender,other:value.gender === 'other' ? other : ''};
  }
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
    if (!Array.isArray(bank) || ![54,108].includes(bank.length)) throw new Error('刺激文は54件（各条件1件）または108件（各条件2件）必要です。');
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
      const perType = bank.length / 54;
      if (g.length !== perType * 2 || TYPES.some(t => g.filter(x => x.category === t).length !== perType)) throw new Error(k + ' は金銭・不倫それぞれ' + perType + '件にしてください。');
    }
    return Object.keys(groups).sort().map(k => groups[k].slice().sort((a, b) => a.id.localeCompare(b.id)));
  }
  function validateQuestions(questions) {
    if (!Array.isArray(questions) || questions.length < 1 || questions.length > 12) throw new Error('有効な質問は1〜12件にしてください。');
    const ids = new Set();
    questions.forEach(q => {
      if (!q || typeof q.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(q.id) || ['__proto__','constructor','prototype'].includes(q.id) || ids.has(q.id)) throw new Error('質問IDが不正、または重複しています。');
      ids.add(q.id);
      if (q.type && !['binary','likert7'].includes(q.type)) throw new Error('質問typeはbinaryまたはlikert7にしてください。');
      if (q.block && !['Q1','Q2'].includes(q.block)) throw new Error('質問blockはQ1またはQ2にしてください。');
      for (const k of ['label','low','high']) if (typeof q[k] !== 'string' || !q[k].trim() || q[k].length > 1000) throw new Error('質問文・両端の説明を1〜1000字で入力してください。');
    });
    return questions;
  }
  function allocate54(bank, questions, seed) {
    const groups = validateBank(bank);
    validateQuestions(questions);
    const random = rng(seed);
    return {
      items: shuffle(groups.flatMap(group => TYPES.map(type => {
        const choices = group.filter(x => x.category === type);
        return choices[Math.floor(random() * choices.length)];
      })), random),
      questions: questions.filter(q=>q.block==='Q1').concat(shuffle(questions.filter(q=>q.block!=='Q1').sort((a,b) => a.id.localeCompare(b.id)), random))
    };
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
        if (!qs.has(q)) throw new Error('質問IDが不正です。');
        const binary=questions.find(x=>x.id===q).type==='binary';
        if (!Number.isInteger(n) || (binary ? ![0,1].includes(n) : n < 1 || n > 7)) throw new Error(binary ? '二択の回答は0または1にしてください。' : '回答は1〜7の整数にしてください。');
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
  const api = { LEVELS, TYPES, QUESTIONS, key, rng, shuffle, validateBank, validateQuestions, validateDemographics, allocate54, validateAnswers, summary };
  if (typeof module !== 'undefined') module.exports = api;
  root.StudyCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
