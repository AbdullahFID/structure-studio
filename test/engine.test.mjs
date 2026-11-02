import * as E from '../src/engine.js';
const cases = [
  ['Shed 6x4x3 gable', { type:'shed', length:6, width:4, storeyHeight:3, floors:1, roof:'gable' }],
  ['Workshop 30x12x4.5 gable', { length:30, width:12, storeyHeight:4.5, floors:1, roof:'gable' }],
  ['Office 48x24 5fl 3.8', { length:48, width:24, storeyHeight:3.8, floors:5, roof:'flat' }],
];
for (const pr of ['balanced','carbon']) for (const [name, s] of cases) {
  console.log(`\n== ${name} (${pr})`);
  const rs = E.MATERIAL_KEYS.map(m => E.computeOption(s, m, pr));
  for (const r of rs) {
    const M = r.metrics;
    console.log(r.material.padEnd(9), 'bay', E.fmt.bay(M.bayX,M.bayZ).padEnd(11), 'cols', String(M.columns).padStart(3),
      'cost', E.fmt.money(M.cost).padStart(7), `($${Math.round(M.costPerM2)}/m2)`.padStart(10),
      'CO2', (E.fmt.carbon(M.carbon)+' t').padStart(8), `(${Math.round(M.intensity)} kg/m2)`.padStart(12),
      'wk', E.fmt.weeks(M.weeks).padStart(5), '|', r.sections.column.name, '/', r.sections.beamX.name, '/', r.sections.girder.name, '/', r.sections.slab.name);
    console.log('   study:', r.study.map(x => `${x.span}m→${x.nx}x${x.nz}${x.chosen?'*':''} ${E.fmt.money(x.cost)} ${E.fmt.carbon(x.carbon)}t ${x.weeks.toFixed(1)}wk d${Math.round(x.depth*1000)}`).join(' | '));
  }
  console.log('   rank:', E.rankOptions(rs, pr).map(i => rs[i].material).join(' > '));
}
// geometry counts
const r = E.computeOption({ length:48, width:24, storeyHeight:3.8, floors:5 }, 'steel');
const g = E.buildGeometry(r);
console.log('\nsteel office parts', Object.fromEntries(Object.entries(g.parts).map(([k,v])=>[k,v.length])));
const r2 = E.computeOption({ length:6, width:4, storeyHeight:3, floors:1, roof:'gable' }, 'timber');
console.log('timber shed parts', Object.fromEntries(Object.entries(E.buildGeometry(r2).parts).map(([k,v])=>[k,v.length])));
// big
const r3 = E.computeOption({ length:120, width:60, storeyHeight:4, floors:12 }, 'timber');
console.log('max timber parts total', Object.values(E.buildGeometry(r3).parts).reduce((s,v)=>s+v.length,0));
// parser
const briefs = [
  'Generate a 6 m x 4 m wooden shed',
  'Single-storey workshop, 30 × 12 m, 4.5 m to eaves, gable roof. Compare timber, concrete and steel. Lowest carbon matters most.',
  '5-storey office, 48 x 24 m, lowest carbon',
  'Now try it in steel as a new option',
  'Switch it to steel',
  'Make it 8 m long',
  'delete option B',
  'show option a',
  'Add a timber version as a new option',
  'compare options',
  'Write the report',
  'use 4 m bays',
  'a 20 x 12 ft shed, 8 ft tall',
  'three storey school 40 by 20 m with 3.6 m storey height in concrete or steel',
  'make it two storeys',
  'remove this option',
  'what about concrete?',
  'build me something nice',
];
for (const b of briefs) { const p = E.parseBrief(b); const keep = Object.fromEntries(Object.entries(p).filter(([k,v]) => v !== undefined && v !== null && v !== false && !(Array.isArray(v) && !v.length) && k!=='units' || (k==='units'&&v!=='m'))); console.log(JSON.stringify(b).padEnd(70).slice(0,70), JSON.stringify(keep)); }
