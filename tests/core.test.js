const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core');
const bank = require('../src/demo-bank');

test('1,000 participants: each condition once, 9/9/9 levels, genre 13/14 and within-genre levels 4/5', () => {
  const exposure = Object.fromEntries(bank.map(x => [x.id, 0]));
  for (let b = 0; b < 250; b++) {
    const block = C.allocateBlock(bank, b + 82491);
    assert.equal(new Set(block.flat().map(x => x.id)).size, 108);
    for (const items of block) {
      const s = C.summary(items);
      assert.equal(s.total, 27); assert.equal(s.unique, 27);
      assert.deepEqual(Object.values(s.category).sort(), [13,14]);
      for (const axis of ['justice','envy','sexual']) assert.deepEqual(Object.values(s[axis]), [9,9,9]);
      for (const type of C.TYPES) {
        const sub = C.summary(items.filter(x => x.category === type));
        for (const axis of ['justice','envy','sexual']) for (const n of Object.values(sub[axis])) assert.ok(n === 4 || n === 5);
      }
      items.forEach(x => exposure[x.id]++);
    }
  }
  assert.ok(Object.values(exposure).every(n => n === 250));
});

test('same seed reproducible, fresh seeds differ, input data unchanged', () => {
  const before = JSON.stringify(bank);
  const a = C.allocateBlock(bank, 23), b = C.allocateBlock(bank, 23), c = C.allocateBlock(bank, 24);
  assert.deepEqual(a, b); assert.notDeepEqual(a, c); assert.equal(JSON.stringify(bank), before);
});

test('reject missing / duplicate / unbalanced / invalid stimuli', () => {
  assert.throws(() => C.validateBank(bank.slice(1)));
  const bad = JSON.parse(JSON.stringify(bank)); bad[0].id = bad[1].id; assert.throws(() => C.validateBank(bad));
  bad[0] = { ...bank[0], category: '不倫' }; assert.throws(() => C.validateBank(bad));
  bad[0] = { ...bank[0], id: '__proto__' }; assert.throws(() => C.validateBank(bad));
  bad[0] = { ...bank[0], text: '' }; assert.throws(() => C.validateBank(bad));
});

test('answer validation checks all assigned articles and permits complete seven-point ratings only', () => {
  const items = C.allocateBlock(bank, 1)[0], answers = {};
  assert.deepEqual(C.validateAnswers(items, C.QUESTIONS, answers, false), {});
  assert.throws(() => C.validateAnswers(items, C.QUESTIONS, answers, true));
  items.forEach(x => answers[x.id] = Object.fromEntries(C.QUESTIONS.map(q => [q.id, 4])));
  assert.deepEqual(C.validateAnswers(items, C.QUESTIONS, answers, true), answers);
  answers[items[0].id].wrongness = '4'; assert.throws(() => C.validateAnswers(items, C.QUESTIONS, answers, true));
  answers[items[0].id].wrongness = 8; assert.throws(() => C.validateAnswers(items, C.QUESTIONS, answers, true));
  answers[items[0].id].wrongness = 4; answers.INTRUDER = {}; assert.throws(() => C.validateAnswers(items, C.QUESTIONS, answers, false));
});
