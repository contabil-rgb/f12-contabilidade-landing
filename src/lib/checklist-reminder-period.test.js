import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isPastCompetence,
  previousCompetence,
  selectRetroactiveReminderGroups,
} from './checklist-reminder-period.js';

const groups = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, pendingItems: [{ key: `item-${index + 1}` }] }));

test('em setembro, cobra somente janeiro a agosto do mesmo ano', () => {
  const selected = selectRetroactiveReminderGroups(groups, 2026, 'todos', { ano: 2026, mes: 9 });
  assert.deepEqual(selected.map((group) => group.month), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('em outubro, inclui setembro e continua excluindo outubro', () => {
  const selected = selectRetroactiveReminderGroups(groups, 2026, 'todos', { ano: 2026, mes: 10 });
  assert.deepEqual(selected.map((group) => group.month), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(selectRetroactiveReminderGroups(groups, 2026, 10, { ano: 2026, mes: 10 }), []);
});

test('na virada do ano, dezembro anterior é elegível e janeiro atual não', () => {
  const january = { ano: 2027, mes: 1 };
  assert.deepEqual(previousCompetence(january), { ano: 2026, mes: 12 });
  assert.equal(isPastCompetence(2026, 12, january), true);
  assert.equal(isPastCompetence(2027, 1, january), false);
  assert.deepEqual(selectRetroactiveReminderGroups(groups, 2027, 'todos', january), []);
  assert.equal(selectRetroactiveReminderGroups(groups, 2026, 12, january).length, 1);
});
