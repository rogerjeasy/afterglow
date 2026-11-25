import type { formulary } from '@afterglow/core';

/** FP-10: the documentation is generated from the validated entries and nothing else. */
export function renderFormularyDoc(
  entries: readonly formulary.FormularyEntry[],
  version: string,
): string {
  const lines = [
    '# Validated formulary',
    '',
    `Snapshot version: ${version}. Generated from \`validated/\`. Do not edit by hand.`,
    '',
    'Each figure is taken from the label excerpt shown, checked by a second model family and',
    'approved by a licensed pharmacist. This is not medical advice: ask your pharmacist.',
    '',
  ];
  if (entries.length === 0) {
    lines.push('No entries have been approved yet.', '');
    return lines.join('\n');
  }
  const sorted = [...entries].sort((a, b) =>
    `${a.product}\u0000${a.condition}`.localeCompare(`${b.product}\u0000${b.condition}`),
  );
  for (const e of sorted) {
    lines.push(
      `## ${e.product} (${e.condition === 'inUse' ? 'in use' : 'unopened'})`,
      '',
      `- Up to ${e.maxTempC} °C for ${e.maxDays} days`,
      `- Label version: ${e.labelVersion}`,
      `- Source: [${e.source.title}](${e.source.url})`,
      `- Approved by ${e.approver} on ${e.approvedAt}`,
      e.notes ? `- Notes: ${e.notes}` : '',
      '',
      `> ${e.source.excerpt.replace(/\s+/g, ' ')}`,
      '',
    );
  }
  return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}
