export function previousCompetence({ ano, mes }) {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

export function isPastCompetence(ano, mes, currentCompetence) {
  return ano * 12 + mes < currentCompetence.ano * 12 + currentCompetence.mes;
}

export function selectRetroactiveReminderGroups(groups, ano, monthFilter, currentCompetence) {
  return groups.filter((group) => (
    (monthFilter === 'todos' || group.month === Number(monthFilter))
    && isPastCompetence(ano, group.month, currentCompetence)
  ));
}

export function reminderGroupSignature(groups) {
  return JSON.stringify(groups.map((group) => [group.month, group.pendingItems.map((item) => item.key)]));
}
