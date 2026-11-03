import { MATERIALS, PRIORITIES, bestOf, fmt, titleCase } from '../engine/engine.js';
import { describeSpec, matShort, recommendation, storeys } from '../state/helpers.js';

export const ASSUMPTIONS = [
  'Cost, embodied carbon (A1 to A3, biogenic storage excluded) and schedule use placeholder factors. WSP data replaces them later.',
  'Members are sized with span-to-depth rules of thumb, not a structural analysis.',
  'Schedule covers foundations and the structural frame only.',
];

export function buildReport(state) {
  const opts = state.options;
  const rec = recommendation(opts, state.priority);
  const order = rec ? rec.order.map((id) => opts.find((o) => o.id === id)) : opts;
  const best = opts.length > 1 ? bestOf(opts.map((o) => o.result)) : null;
  const sameSpec = opts.every((o) => JSON.stringify({ ...o.spec, bay: null }) === JSON.stringify({ ...opts[0].spec, bay: null }));
  const date = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  const rank = PRIORITIES[state.priority].label.toLowerCase();
  const brief = sameSpec && opts[0]
    ? `${titleCase(opts[0].spec.type)}, ${describeSpec(opts[0].spec)}. Ranked by ${rank}.`
    : `The options use different footprints, listed in the table. Ranked by ${rank}.`;
  const rows = [
    ['System', (o) => MATERIALS[o.material].system],
    ['Design code', (o) => MATERIALS[o.material].code],
    ...(sameSpec ? [] : [['Footprint', (o) => `${fmt.m(o.spec.length)} × ${fmt.m(o.spec.width)} m, ${storeys(o.spec.floors)}`]]),
    ['Bay size', (o) => `${fmt.bay(o.result.grid.sx, o.result.grid.sz)} m${o.result.manualBay ? ' (manual)' : ''}`],
    ['Columns', (o) => `${o.result.metrics.columns}`],
    ['Cost', (o) => fmt.money(o.result.metrics.cost), 'cost'],
    ['Cost per m²', (o) => `$${fmt.int(o.result.metrics.costPerM2)}`],
    ['Embodied carbon', (o) => `${fmt.carbon(o.result.metrics.carbon)} tCO₂e`, 'carbon'],
    ['Carbon per m²', (o) => `${fmt.int(o.result.metrics.intensity)} kgCO₂e`],
    ['Schedule', (o) => `${fmt.weeks(o.result.metrics.weeks)} weeks`, 'weeks'],
    ['Column section', (o) => o.result.sections.column.name],
  ];
  const study = opts.map((o) => ({
    o,
    text: `Tried ${o.result.study.map((s) => `${fmt.bay(s.sx, s.sz)} m`).join(', ')}. Kept ${fmt.bay(o.result.grid.sx, o.result.grid.sz)} m${o.result.manualBay ? ', set by you' : ''}.`,
  }));
  const md = [
    `# Structural options study: ${state.project.name}`,
    `Prepared ${date} in Structure Studio (prototype). All figures use synthetic factors.`,
    '',
    '## Brief',
    brief,
    '',
    '## Options',
    `| | ${opts.map((o) => `${o.letter} ${matShort(o.material)}`).join(' | ')} |`,
    `|---|${opts.map(() => '---').join('|')}|`,
    ...rows.map(([k, f]) => `| ${k} | ${opts.map(f).join(' | ')} |`),
    '',
    '## Recommendation',
    rec ? rec.text : 'Add a second option to get a ranking.',
    '',
    '## How the agent chose bay sizes',
    ...study.map(({ o, text }) => `- ${o.letter} ${matShort(o.material)}: ${text}`),
    '',
    '## Assumptions',
    ...ASSUMPTIONS.map((a) => `- ${a}`),
  ].join('\n');
  return { rec, order, best, rows, md, date, sameSpec, brief, study };
}
