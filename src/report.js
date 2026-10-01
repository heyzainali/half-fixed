export function palette(color) {
  const paint = (code) => (s) => (color ? `\x1b[${code}m${s}\x1b[0m` : String(s));
  return { red: paint(31), green: paint(32), yellow: paint(33), dim: paint(2), bold: paint(1) };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Lines only on one side of the change, in order, for a compact preview. */
export function changedLines(finding) {
  const kept = new Set(finding.old.filter((l) => finding.new.includes(l)));
  return [
    ...finding.old.filter((l) => !kept.has(l)).map((l) => ({ t: '-', l })),
    ...finding.new.filter((l) => !kept.has(l)).map((l) => ({ t: '+', l })),
  ];
}

function fixedLines(finding, c) {
  const byCommit = new Map();
  for (const f of finding.fixedIn) {
    if (!byCommit.has(f.commit)) byCommit.set(f.commit, { ...f, members: [] });
    byCommit.get(f.commit).members.push(f.member);
  }
  return [...byCommit.values()].map(
    (f) => `${c.green(f.members.join(', '))} ${c.dim(`${f.commit.slice(0, 7)} ${f.date}`)} ${f.subject}`,
  );
}

export function trim(line, max = 100) {
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export function renderScan(result, { color = false } = {}) {
  const c = palette(color);
  const shown = result.findings;
  const out = [];

  for (const w of result.warnings) out.push(c.yellow(`warning: ${w}`));
  const head = shown.length
    ? c.red(c.bold(`${plural(shown.length, 'half-fixed change')} found`))
    : c.green(c.bold('no half-fixed changes found'));
  const range = result.base ? `${result.base}..${result.rev}` : `at ${result.rev}`;
  out.push(`${head} ${c.dim(`(${plural(result.commitsScanned, 'commit')}, ${plural(result.groupsScanned, 'sibling group')}, ${range})`)}`);

  let group = null;
  for (const f of shown) {
    if (f.group !== group) {
      group = f.group;
      out.push('', c.bold(group));
    }
    const tag = { high: c.red('high'), medium: c.yellow('medium'), low: c.dim('low') }[f.confidence];
    out.push(`  ${c.bold(f.id)}  ${tag}  fixed in ${f.fixedIn.length} of ${f.size}, still old in ${f.missing.length}`);
    for (const line of fixedLines(f, c)) out.push(`    fixed    ${line}`);
    out.push(`    missing  ${f.missing.map((m) => c.red(m.member) + c.dim(`:${m.line}`)).join(', ')}`);
    const diff = changedLines(f);
    for (const d of diff.slice(0, 6)) out.push(c.dim(`    ${d.t} ${trim(d.l)}`));
    if (diff.length > 6) out.push(c.dim(`    … ${diff.length - 6} more lines, run: half-fixed show ${f.id}`));
  }

  const tail = [];
  if (result.hidden) tail.push(`${plural(result.hidden, 'lower-confidence change')} hidden (--confidence medium, or --all)`);
  if (result.dismissed.length) tail.push(`${result.dismissed.length} dismissed by .half-fixed.json`);
  if (tail.length) out.push('', c.dim(tail.join(', ')));
  return out.join('\n');
}

export function renderShow(finding, dismissedReason, { color = false } = {}) {
  const c = palette(color);
  const out = [];
  out.push(`${c.bold(finding.id)}  ${finding.confidence}  ${finding.kind}`);
  out.push(`group    ${finding.group} (${finding.size} members)`);
  if (dismissedReason !== undefined) out.push(c.dim(`dismissed: ${dismissedReason || 'no reason given'}`));
  out.push('', c.bold('Fixed in'));
  for (const f of finding.fixedIn) {
    out.push(`  ${c.green(f.member)}  ${f.path}`);
    out.push(c.dim(`    ${f.commit} ${f.date} ${f.subject}`));
  }
  out.push('', c.bold('Still has the old code'));
  for (const m of finding.missing) {
    const needs = m.needs.length ? c.dim(`  (fix uses ${m.needs.join(', ')}, not in this file)`) : '';
    out.push(`  ${c.red(m.member)}  ${m.path}:${m.line}${needs}`);
  }
  out.push('', c.bold('Old code (normalized)'));
  for (const l of finding.old) out.push(c.red(`  - ${l}`));
  out.push('', c.bold('New code (normalized)'));
  for (const l of finding.new) out.push(c.green(`  + ${l}`));
  out.push('', c.dim(`Next: git show ${finding.fixedIn[0].commit.slice(0, 12)} to read the original fix, then decide whether each sibling needs it.`));
  return out.join('\n');
}

export function renderGroups(result, { color = false } = {}) {
  const c = palette(color);
  const out = [c.bold(`${plural(result.groups.length, 'sibling group')} at ${result.rev}`)];
  for (const g of result.groups) out.push(`  ${g.pattern}  ${c.dim(`${g.members.length}: ${g.members.join(', ')}`)}`);
  return out.join('\n');
}
