const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'games/enigme/index.html'), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
const sandbox = vm.createContext({
  window: {},
  document: { getElementById: () => ({}), addEventListener() {} },
});
vm.runInContext(fs.readFileSync(path.join(root, 'games/enigme/missions.js'), 'utf8'), sandbox);
// Isolate the actual selection logic from rendering and startup effects.
vm.runInContext(script.slice(0, script.indexOf('      const style = document.createElement')), sandbox);
const evaluate = expression => vm.runInContext(expression, sandbox);
const count = evaluate('Object.values(QUESTIONS).flat().length');
assert.equal(evaluate('Object.values(window.CosmicMissions).reduce((sum, m) => sum + m.rows.length, 0)'), 36);
assert.equal(evaluate('new Set(Object.values(QUESTIONS).flat().map(q => q.question)).size'), count, 'Questions unique across the database');
assert.equal(evaluate('Object.values(QUESTIONS).flat().every(q => q.answers.length === 4 && new Set(q.answers).size === 4 && Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4 && q.hint && q.explanation)'), true);
for (const category of evaluate('Object.keys(QUESTIONS).concat("mixed")')) {
  for (const length of [5, 10]) {
    evaluate(`state.selectedCategory = ${JSON.stringify(category)}; state.totalQuestions = ${length}; state.questionHistory = []; loadQuestions();`);
    assert.equal(evaluate('state.questions.length'), length);
    assert.equal(evaluate('new Set(state.questions.map(q => q.question)).size'), length);
    assert.equal(evaluate('state.questions.every(q => { const original = QUESTIONS[q.category].find(p => p.question === q.question); return q.answers[q.correct] === original.answers[original.correct]; })'), true, 'Answer shuffling retains correct answer');
    assert.equal(evaluate('state.questions.every(q => getCategoryInfo(q).name === CATEGORIES[q.category].name)'), true);
  }
}
evaluate('state.selectedCategory = "logic"; state.totalQuestions = 5; state.questionHistory = []; loadQuestions(); var first = state.questions.map(q => q.question); state.questionHistory = first.slice(); loadQuestions();');
assert.equal(evaluate('state.questions.some(q => first.includes(q.question))'), false, 'Fresh questions precede previously played ones');
evaluate('state.questionHistory = QUESTIONS.logic.map(q => q.question); loadQuestions();');
assert.equal(evaluate('state.questions.every(q => QUESTIONS.logic.slice(0,5).some(p => p.question === q.question))'), true, 'After exhaustion, oldest questions return first');
const actualIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
const elementsBlock = script.slice(script.indexOf('const elements ='), script.indexOf('function init()'));
for (const match of elementsBlock.matchAll(/getElementById\("([^"]+)"\)/g)) {
  assert(actualIds.has(match[1]), `UI element ${match[1]} exists`);
}
console.log(`Cosmic missions: ${count} questions, 36 additions; selection, answer mapping and UI bindings OK`);
