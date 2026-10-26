// 엔진 단독 시뮬레이션: node test/sim.js [커리어 수]
const D = require('../js/data.js');
const E = require('../js/engine.js');

const N = +(process.argv[2] || 300);
E.setRandom(E.seeded(12345));
const out = [];
for (let i = 0; i < N; i++) {
  const pos = D.POSITION_ORDER[i % D.POSITION_ORDER.length];
  const sc = D.START_COUNTRIES[i % 4];
  const nat = ['KOR', 'JPN', 'USA', 'TWN', 'DOM'][i % 5];
  const cands = E.makeCandidates(pos);
  for (const cd of cands) {
    const o = E.calcOvr(cd.stats, pos);
    const sum = Object.values(cd.stats).reduce((a, b) => a + b, 0);
    if (o !== 45 || sum !== 260) throw new Error(`후보 능력치 오류 ${pos} ovr=${o} sum=${sum}`);
  }
  const c = E.newCareer({ name: 'T' + i, number: 10, nationality: nat, startCountry: sc.id, position: pos, candidate: cands[0] });
  let guard = 0;
  while (!c.retired && guard++ < 40) {
    E.simulateSeason(c);
    while (c.events.length && !c.retired) {
      const ev = c.events[0];
      const opt = ev.options.find((o) => o.primary) || ev.options[0];
      E.choose(c, opt.id);
    }
    JSON.parse(JSON.stringify(c));
  }
  if (!c.retired) throw new Error('은퇴하지 않음');
  out.push(c);
}
const avg = (f) => (out.reduce((s, c) => s + f(c), 0) / out.length).toFixed(2);
const pct = (f) => ((out.filter(f).length / out.length) * 100).toFixed(1) + '%';
console.log('커리어', N);
console.log('평균 은퇴 나이', avg((c) => c.age));
console.log('평균 최고 OVR', avg((c) => c.bestOvr), '평균 잠재력', avg((c) => c.pot));
console.log('1군 데뷔', pct((c) => c.milestones.some((m) => m.key === 'debut')));
console.log('MLB 경험', pct((c) => c.history.some((s) => s.isTop && s.league === 'MLB')));
console.log('MVP 1회 이상', pct((c) => c.summary.awards.MVP > 0), '평균 MVP', avg((c) => c.summary.awards.MVP));
console.log('우승 1회 이상', pct((c) => c.summary.awards.rings > 0));
console.log('명예의 전당', pct((c) => c.summary.hof.inducted), '레전드+', pct((c) => c.summary.hof.vote >= 45));
console.log('평균 1군 WAR', avg((c) => c.summary.top.war));
const hit = out.filter((c) => !E.isPitcherPos(c.position));
const best = hit.slice().sort((a, b) => b.summary.top.HR - a.summary.top.HR)[0];
console.log('최다 홈런', best.summary.top.HR, best.name, '최고 OVR', best.bestOvr);
const bestSeason = out.flatMap((c) => c.history).filter((s) => s.isTop && !s.pitcher).sort((a, b) => b.line.HR - a.line.HR)[0];
console.log('시즌 최다 홈런', bestSeason.line.HR, bestSeason.league, 'avg', bestSeason.line.avg, 'war', bestSeason.war);
const ace = out.flatMap((c) => c.history).filter((s) => s.isTop && s.pitcher).sort((a, b) => b.war - a.war)[0];
console.log('투수 최고 시즌', JSON.stringify(ace.line));
console.log('국가대표 경험', pct((c) => c.intl.length > 0));
console.log('명예의 전당 예시', out.filter((c) => c.summary.hof.inducted).slice(0, 3).map((c) => `${c.position} ${c.bestOvr} ${c.summary.titles.join('/')}`));
const tops = out.flatMap((c) => c.history.filter((s) => s.isTop).map((s) => ({ p: s.pitcher, war: s.war, lg: s.league })));
for (const p of [false, true]) {
  const w = tops.filter((t) => t.p === p).map((t) => t.war).sort((a, b) => b - a);
  console.log(p ? '투수' : '타자', 'WAR 상위', w.slice(0, 8).join(' '), '| 90퍼센타일', w[Math.floor(w.length * 0.1)]);
}
const mv = out.flatMap((c) => c.history.filter((s) => s.mvpRank === 1).map((s) => (s.pitcher ? 'P' : 'H') + s.league));
console.log('MVP 분포', mv.join(' '));
