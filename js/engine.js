/* 게임 엔진: 선수 생성, 시즌 시뮬레이션, 이벤트, 은퇴 평가 (DOM 의존 없음) */
(function (root) {
  const D = typeof module !== 'undefined' && module.exports ? require('./data.js') : root.DATA;
  const { POSITIONS, STYLES, LEAGUES, CLUBS, NATIONS, TOURNAMENTS, STAT_NAMES } = D;

  const SAVE_VERSION = 1;
  const START_YEAR = 2026;

  // ---------- 난수 ----------
  let R = Math.random;
  function setRandom(fn) { R = fn || Math.random; }
  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = (a = 0, b = 1) => a + (b - a) * R();
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const chance = (p) => R() < p;
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  function randn() {
    let u = 0, v = 0;
    while (u === 0) u = R();
    while (v === 0) v = R();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const r1 = (x) => Math.round(x * 10) / 10;
  const r3 = (x) => Math.round(x * 1000) / 1000;

  // ---------- 능력치 ----------
  const isPitcherPos = (pos) => !!POSITIONS[pos].pitcher;
  const statKeys = (pos) => (isPitcherPos(pos) ? D.PIT_STATS : D.HIT_STATS);

  function calcOvrRaw(stats, pos) {
    const w = POSITIONS[pos].w;
    let s = 0;
    for (const k in w) s += w[k] * (stats[k] || 0);
    return s;
  }
  const calcOvr = (stats, pos) => Math.round(calcOvrRaw(stats, pos));

  function potStars(pot) {
    if (pot >= 88) return 5;
    if (pot >= 81) return 4;
    if (pot >= 74) return 3;
    if (pot >= 67) return 2;
    return 1;
  }

  // 시작 후보: 오버롤 45, 여섯 능력치 합 260
  function makeStartStats(pos, style) {
    const keys = statKeys(pos);
    const w = POSITIONS[pos].w;
    const v = {};
    keys.forEach((k) => { v[k] = Math.round(43 + (style.bias[k] || 0) * 3 + randn() * 2.5); });
    const SUM = 260;
    let diff = SUM - keys.reduce((s, k) => s + v[k], 0);
    while (diff !== 0) {
      const k = pick(keys);
      const step = diff > 0 ? 1 : -1;
      if (v[k] + step < 25 || v[k] + step > 66) continue;
      v[k] += step; diff -= step;
    }
    // 합계를 유지한 채 가중치가 큰 능력치로 포인트를 옮겨 오버롤을 45로 맞춘다
    for (let guard = 0; guard < 2000; guard++) {
      const o = calcOvrRaw(v, pos);
      if (Math.round(o) === 45) break;
      const up = o < 45;
      const from = pick(keys), to = pick(keys);
      if (from === to) continue;
      const gain = (w[to] || 0) - (w[from] || 0);
      if (up ? gain <= 0 : gain >= 0) continue;
      if (v[from] - 1 < 25 || v[to] + 1 > 66) continue;
      v[from] -= 1; v[to] += 1;
    }
    return v;
  }

  function makeCandidates(pos) {
    const pool = isPitcherPos(pos) ? STYLES.pitcher.slice() : STYLES.hitter.slice();
    const out = [];
    for (let i = 0; i < 3 && pool.length; i++) {
      const style = pool.splice(Math.floor(R() * pool.length), 1)[0];
      const stats = makeStartStats(pos, style);
      const pot = clamp(Math.round(74 + randn() * 7), 58, 96);
      const est = pot + randn() * 3;
      const lo = Math.round(est - rand(3, 6)), hi = Math.round(est + rand(3, 6));
      const growthType = chance(0.22) ? 'early' : chance(0.13) ? 'late' : 'normal';
      out.push({
        style: style.id, styleName: style.name, styleDesc: style.desc, stats, pot,
        potRange: [lo, hi], stars: potStars(est),
        hidden: { growthType, injury: clamp(Math.exp(randn() * 0.35), 0.5, 2.2) },
        throws: chance(0.72) ? '우' : '좌',
        bats: chance(0.6) ? '우' : chance(0.9) ? '좌' : '양',
      });
    }
    return out;
  }

  // ---------- 구단 ----------
  const clubId = (league, i) => league + ':' + i;
  function clubName(id) {
    if (id === 'MIL') return '국군체육부대(상무)';
    const [lg, i] = id.split(':');
    return CLUBS[lg][+i];
  }
  const clubLeague = (id) => (id === 'MIL' ? 'KBO' : id.split(':')[0]);
  function makeWorld() {
    const clubs = {};
    for (const lg in CLUBS) CLUBS[lg].forEach((_, i) => { clubs[clubId(lg, i)] = r1(clamp(randn() * 3, -6, 6)); });
    return { clubs };
  }
  function driftWorld(world) {
    for (const id in world.clubs) world.clubs[id] = r1(clamp(world.clubs[id] * 0.8 + randn() * 1.6, -6, 6));
  }
  const clubStr = (c, id) => (id === 'MIL' ? 0 : c.world.clubs[id] || 0);

  // ---------- 커리어 생성 ----------
  function newCareer(opts) {
    const cand = opts.candidate;
    const start = D.START_COUNTRIES.find((s) => s.id === opts.startCountry);
    const league = start.league;
    const world = makeWorld();
    const ids = CLUBS[league].map((_, i) => clubId(league, i));
    const club = pick(ids);
    const L = LEAGUES[league];
    const bonusMax = { MLB: 90, NPB: 10, KBO: 5, CPBL: 1.5 }[league];
    const bonus = r1(Math.max(0.1, bonusMax * Math.pow(clamp((cand.pot - 60) / 36, 0, 1), 2.2)));
    const round = cand.pot >= 88 ? 1 : cand.pot >= 80 ? randInt(1, 2) : cand.pot >= 72 ? randInt(2, 5) : randInt(5, 10);
    const c = {
      v: SAVE_VERSION,
      id: Date.now().toString(36) + Math.floor(R() * 1e6).toString(36),
      name: (opts.name || '').trim() || '무명 선수',
      number: clamp(parseInt(opts.number, 10) || 1, 0, 99),
      nationality: opts.nationality,
      startLeague: league,
      position: opts.position,
      origPosition: opts.position,
      style: cand.style, styleName: cand.styleName,
      throws: cand.throws, bats: cand.bats,
      stats: Object.assign({}, cand.stats),
      pot: cand.pot,
      hidden: Object.assign({}, cand.hidden),
      potRange: cand.potRange, stars: cand.stars,
      age: 18, year: START_YEAR,
      world,
      club, levelIdx: L.levels.length - 1, foreign: false,
      contract: { years: 1, salary: L.levels[L.levels.length - 1].pay[0], fa: false },
      service: {}, earnings: bonus,
      focus: 'auto',
      military: { served: false, exempt: false, left: 0, homeClub: null },
      flags: { campLeft: 3, switchDone: false, pitchDone: false, tradeAsked: false, injuryCarry: 0, momentum: 0, posOffered: 0 },
      history: [], events: [], log: [], milestones: [],
      clubs: [club],
      bestOvr: 45, bestOvrAge: 18,
      intl: [],
      retired: false,
    };
    addLog(c, `${START_YEAR} ${L.name} 신인 드래프트 ${round}라운드 지명 — ${clubName(club)} 입단 (계약금 ${money(bonus)})`);
    c.draft = { year: START_YEAR, round, club, bonus };
    return c;
  }

  function addLog(c, text) { c.log.unshift({ year: c.year, text }); if (c.log.length > 200) c.log.length = 200; }
  function money(eok) {
    if (eok >= 1) return (Math.round(eok * 10) / 10).toLocaleString('ko-KR') + '억 원';
    return Math.round(eok * 10000).toLocaleString('ko-KR') + '만 원';
  }

  const ovrOf = (c) => calcOvr(c.stats, c.position);
  const isNativeTo = (c, league) => NATIONS[c.nationality].home === league || c.startLeague === league ||
    (LEAGUES[league].country === c.nationality);

  // ---------- 출전 무대 / 역할 ----------
  function levelBar(c, league, idx, club) {
    return LEAGUES[league].levels[idx].avg + clubStr(c, club) * 0.6;
  }

  function assignLevel(c) {
    const ovr = ovrOf(c);
    if (c.military.left > 0) return { league: 'KBO', idx: 1, club: 'MIL', role: rolePack(c, 3), pt: 0.95, note: '상무 복무' };
    const league = clubLeague(c.club);
    const levels = LEAGUES[league].levels;
    let idx = levels.length - 1;
    if (c.foreign) idx = 0;
    else {
      for (let i = 0; i < levels.length; i++) {
        if (ovr >= levelBar(c, league, i, c.club) - 5) { idx = i; break; }
      }
    }
    const diff = ovr - levelBar(c, league, idx, c.club);
    let tier = diff >= 0 ? 3 : diff >= -5 ? 2 : 1;
    if (isPitcherPos(c.position) && c.position === 'RP' && diff >= 6) tier = 4;
    let pt = tier >= 3 ? 0.95 : tier === 2 ? 0.5 : 0.18;
    if (idx === levels.length - 1 && c.age <= 21) pt = Math.max(pt, 0.55);
    return { league, idx, club: c.club, role: rolePack(c, tier), pt };
  }

  function rolePack(c, tier) {
    const pos = c.position;
    if (pos === 'SP') return { tier, name: ['', '추격조', '롱릴리프·5선발', '선발 로테이션', '선발 로테이션'][tier] };
    if (pos === 'RP') return { tier, name: ['', '추격조', '불펜', '셋업맨', '마무리'][tier] };
    return { tier, name: ['', '벤치', '백업·플래툰', '주전', '주전'][tier] };
  }

  // ---------- 시즌 기록 생성 ----------
  function hitterLine(c, L, games, pt, form) {
    const s = c.stats;
    const r = (k) => (s[k] - L) / 10;
    const G = Math.max(0, Math.round(games * pt));
    const PA = Math.round(G * (pt > 0.7 ? 4.2 : 3.4));
    if (PA < 5) return { G, PA, AB: 0, H: 0, D2: 0, D3: 0, HR: 0, RBI: 0, R: 0, BB: 0, SO: 0, SB: 0, avg: 0, obp: 0, slg: 0, ops: 0, opsPlus: 0, war: 0 };
    const sw = c.flags.switchDone ? 0.006 : 0;
    const avgT = clamp(0.252 + 0.026 * r('con') + 0.006 * r('eye') + 0.018 * form + sw, 0.15, 0.39);
    const obpT = clamp(avgT + 0.062 + 0.024 * r('eye') + 0.005 * form, avgT + 0.02, 0.52);
    const iso = clamp(0.145 + 0.05 * r('pow') + 0.015 * form, 0.03, 0.42);
    const BB = Math.round(PA * (obpT - avgT) * 1.05);
    const AB = Math.max(1, PA - BB - Math.round(PA * 0.012));
    const H = Math.round(AB * avgT);
    const HR = Math.min(H, Math.round(AB * iso * 0.22 * rand(0.85, 1.15)));
    const D2 = Math.round((H - HR) * 0.22);
    const D3 = Math.round((H - HR) * clamp(0.02 + 0.01 * r('spd'), 0, 0.06));
    const SB = Math.round(PA * clamp(0.004 + 0.012 * r('spd') + 0.004 * form, 0, 0.09));
    const RBI = Math.max(0, Math.round(HR * 1.55 + (H - HR) * 0.28 + randn() * 4));
    const RUN = Math.max(0, Math.round(H * 0.33 + BB * 0.3 + HR * 0.6 + SB * 0.3));
    const SO = Math.round(PA * clamp(0.22 - 0.03 * r('con') + 0.015 * r('pow'), 0.07, 0.35));
    const avg = H / AB, obp = (H + BB) / PA, slg = (H + D2 + 2 * D3 + 3 * HR) / AB;
    const opsPlus = Math.round(100 * (obp / 0.318 + slg / 0.405 - 1));
    const fldR = (s.fld - L) / 10 * 0.6 + (s.arm - L) / 10 * 0.2;
    const war = r1(PA / 650 * (2.2 + (opsPlus - 100) * 0.085 + POSITIONS[c.position].warAdj + fldR) + randn() * 0.2);
    return { G, PA, AB, H, D2, D3, HR, RBI, R: RUN, BB, SO, SB, avg: r3(avg), obp: r3(obp), slg: r3(slg), ops: r3(obp + slg), opsPlus, war };
  }

  function pitcherLine(c, L, games, pt, form, tier, teamS) {
    const s = c.stats;
    const r = (k) => (s[k] - L) / 10;
    const rP = (ovrOf(c) - L) / 8 + form;
    const gf = games / 162;
    let G, GS, IP, ERA, SV = 0, HLD = 0;
    if (c.position === 'SP' && tier >= 2) {
      GS = Math.round(32 * gf * (tier >= 3 ? pt : 0.45));
      const relief = tier >= 3 ? 0 : Math.round(18 * gf);
      const perStart = clamp(5.6 + r('sta') * 0.7 + 0.2 * rP, 4.0, 7.4);
      IP = GS * perStart + relief * 1.6;
      G = GS + relief;
      ERA = clamp(4.15 - 0.72 * rP, 1.0, 9.5);
    } else {
      GS = 0;
      G = Math.round(games * 0.42 * (tier >= 3 ? pt : tier === 2 ? pt * 1.2 : pt * 1.4));
      IP = G * clamp(1.0 + (s.sta - L) / 30, 0.85, 1.3);
      ERA = clamp(3.95 - 0.95 * rP, 0.5, 9.5);
      if (tier === 4) SV = Math.round(G * clamp(0.6 + teamS * 0.03 + rP * 0.03, 0.35, 0.8));
      else if (tier === 3) { HLD = Math.round(G * clamp(0.42 + teamS * 0.02, 0.2, 0.6)); SV = randInt(0, 4); }
    }
    IP = Math.round(IP * 3) / 3;
    if (IP < 1) return { G, GS, IP: 0, W: 0, L: 0, SV: 0, HLD: 0, SO: 0, BB: 0, ERA: 0, WHIP: 0, war: 0 };
    const K9 = clamp(8.4 + 0.9 * r('vel') + 0.6 * r('stf') + 0.5 * r('brk') + 0.3 * form, 4, 15);
    const BB9 = clamp(3.2 - 0.7 * r('ctl') - 0.2 * form, 0.8, 6.5);
    const SO = Math.round(IP * K9 / 9), BB = Math.round(IP * BB9 / 9);
    const H9 = clamp(8.6 - 0.7 * rP, 4.5, 13);
    const WHIP = (BB + IP * H9 / 9) / IP;
    let W, Lo;
    if (GS > 0) {
      const dec = Math.round(GS * 0.72);
      const wp = clamp(0.5 + 0.09 * (4.15 - ERA) + teamS * 0.02, 0.15, 0.88);
      W = Math.round(dec * wp); Lo = dec - W;
    } else {
      W = randInt(0, Math.max(1, Math.round(G / 14))); Lo = randInt(0, Math.max(1, Math.round(G / 16)));
    }
    const lev = GS > 0 ? 1 : tier === 4 ? 1.5 : tier === 3 ? 1.3 : 1;
    const war = r1(IP * ((GS > 0 ? 5.3 : 5.0) - ERA) / 9 / 9.6 * lev + randn() * 0.2);
    return { G, GS, IP: r1(IP), W, L: Lo, SV, HLD, SO, BB, ERA: Math.round(ERA * 100) / 100, WHIP: Math.round(WHIP * 100) / 100, war };
  }

  // ---------- 팀 성적 ----------
  function teamSeason(c, league, club, isTop, contrib) {
    const ids = CLUBS[league].map((_, i) => clubId(league, i));
    const scores = {};
    ids.forEach((id) => { scores[id] = clubStr(c, id) + randn() * 2.6; });
    const own = club === 'MIL' ? null : club;
    if (own) scores[own] += isTop ? contrib : 0;
    const order = ids.slice().sort((a, b) => scores[b] - scores[a]);
    const n = ids.length;
    if (!own) {
      const rank = randInt(1, 10);
      return { rank, n: 11, result: `퓨처스 ${rank}위`, champ: false, final: false, playoff: false };
    }
    const rank = order.indexOf(own) + 1;
    const po = LEAGUES[league].playoff;
    const playoff = rank <= po;
    let champ = false, final = false, result = `정규시즌 ${rank}위`;
    if (playoff) {
      const teams = order.slice(0, po);
      const weightOf = (id, i) => Math.exp(scores[id] / 2.2) * (1 + (po - i) * 0.08);
      const draw = (pool) => {
        const tot = pool.reduce((s, x) => s + x.w, 0);
        let t = R() * tot;
        for (const x of pool) { t -= x.w; if (t <= 0) return x; }
        return pool[pool.length - 1];
      };
      let pool = teams.map((id, i) => ({ id, w: weightOf(id, i) }));
      const winner = draw(pool);
      pool = pool.filter((x) => x.id !== winner.id);
      const runner = draw(pool);
      champ = winner.id === own;
      final = champ || runner.id === own;
      const lvName = isTop ? LEAGUES[league].champ : LEAGUES[league].name + ' 하위리그';
      result = champ ? `${lvName} 우승` : final ? `${lvName} 준우승` : `정규시즌 ${rank}위 · 포스트시즌 진출`;
    }
    return { rank, n, result, champ, final, playoff };
  }

  // ---------- 시상 ----------
  function seasonAwards(c, ctx) {
    const { league, isTop, line, games, team, pitcher } = ctx;
    const A = LEAGUES[league].awards;
    const gf = games / 162;
    const out = [];
    const war = line.war;
    if (!isTop) {
      if (war / gf > 4.2 + randn() * 0.6) out.push({ key: 'MINOR', name: `${ctx.levelName} 올스타` });
      if (war / gf > 5.8 + randn() * 0.8) out.push({ key: 'MINOR', name: `${ctx.levelName} MVP` });
      return { list: out, mvpRank: 0 };
    }
    // MVP
    const score = war * (pitcher ? 0.85 : 1) + (team.playoff ? 0.4 : 0) + (team.champ ? 0.4 : 0);
    const rival = (7.6 + (74 - LEAGUES[league].levels[0].avg) / 10 + randn() * 1.1) * gf; // 약한 리그일수록 외국인 에이스 등 경쟁자가 두드러짐
    let mvpRank = 0;
    if (score > rival) { mvpRank = 1; out.push({ key: 'MVP', name: A.MVP }); }
    else {
      const d = rival - score;
      if (d < 1.2 && team.playoff) mvpRank = 2 + Math.floor(d / 0.4);
      else if (d < 3.2) mvpRank = 5 + Math.floor((d - 1.2) / 0.4);
    }
    if (pitcher && war > (6.4 + randn() * 0.9) * gf) out.push({ key: 'PIT', name: A.PIT });
    if (c.flags.rookieYear === c.year && c.age <= 27 && war > (3.2 + randn() * 1.0) * gf) out.push({ key: 'ROY', name: A.ROY });
    if (!pitcher) {
      const fld = (c.stats.fld - ctx.L) / 10 * 1.2 + (c.stats.arm - ctx.L) / 10 * 0.4 + randn() * 0.3;
      if (ctx.pt >= 0.7 && fld > 1.6 + randn() * 0.4) out.push({ key: 'GLOVE', name: A.GLOVE });
      if (line.PA >= games * 3.1 && line.opsPlus > 138 + randn() * 12) out.push({ key: 'BAT', name: A.BAT });
    } else if (league !== 'MLB' && war > (4.8 + randn() * 0.9) * gf) out.push({ key: 'BAT', name: A.BAT });
    if (war / gf > 3.0 + randn() * 0.8) out.push({ key: 'ALL', name: A.ALL });
    // 타이틀
    if (!pitcher && line.PA >= games * 3.1) {
      if (line.HR > (44 + randn() * 5) * gf) out.push({ key: 'LEAD', name: '홈런왕' });
      if (line.avg > 0.333 + randn() * 0.012) out.push({ key: 'LEAD', name: '타격왕' });
      if (line.RBI > (122 + randn() * 10) * gf) out.push({ key: 'LEAD', name: '타점왕' });
      if (line.SB > (44 + randn() * 9) * gf) out.push({ key: 'LEAD', name: '도루왕' });
    }
    if (pitcher) {
      if (line.W > (17.5 + randn() * 1.6) * gf) out.push({ key: 'LEAD', name: '다승왕' });
      if (line.IP >= games && line.ERA < 2.45 + randn() * 0.25) out.push({ key: 'LEAD', name: '평균자책점왕' });
      if (line.SO > (245 + randn() * 22) * gf) out.push({ key: 'LEAD', name: '탈삼진왕' });
      if (line.SV > (41 + randn() * 4) * gf) out.push({ key: 'LEAD', name: '세이브왕' });
      if (line.HLD > (36 + randn() * 4) * gf) out.push({ key: 'LEAD', name: '홀드왕' });
    }
    if (team.champ && war > 2 && chance(clamp(0.12 + war * 0.05, 0, 0.6))) out.push({ key: 'FMVP', name: `${LEAGUES[league].champ} MVP` });
    return { list: out, mvpRank };
  }

  // ---------- 국제대회 ----------
  function runTournament(c, key, ovr) {
    const T = TOURNAMENTS[key];
    const N = NATIONS[c.nationality];
    if (T.asiaOnly && !N.asia) return null;
    if (c.age < 19) return null;
    const league = c.military.left > 0 ? 'KBO' : clubLeague(c.club);
    const mlbRoster = league === 'MLB' && c.levelIdx <= 1;
    if (T.noMLB && mlbRoster) return { key, name: T.name, selected: false, reason: 'MLB 40인 로스터 선수는 출전할 수 없었어요.' };
    let bar = N.bar - 2;
    if (T.u25 && c.age > 25) bar += 6; // 와일드카드
    if (key === 'ASG' && N.home === 'KBO') bar -= 3;
    if (ovr < bar + randn() * 1.5) return null;
    const opp = { WBC: [5.5, 7.2, 8.0, 8.6], OLY: [6.0, 7.0, 7.8, 8.3], ASG: [4.0, 5.5, 6.4, 7.0], P12: [6.3, 7.2, 7.9, 8.4] }[key];
    const str = N.str + (ovr - N.bar) / 12 + randn() * 0.9;
    const stages = ['조별리그 탈락', '8강 탈락', '4강 탈락', '준우승', '우승'];
    let stage = 0;
    for (let i = 0; i < 4; i++) {
      const p = 1 / (1 + Math.exp(-(str - opp[i]) / 1.1));
      if (chance(p)) stage = i + 1; else break;
    }
    let medal = stage === 4 ? '금' : stage === 3 ? '은' : null;
    if (stage === 2 && (key === 'OLY' || key === 'ASG') && chance(0.55)) medal = '동';
    const label = medal === '동' ? '동메달' : stages[stage];
    const star = stage >= 3 && chance(0.25 + (ovr - N.bar) / 40);
    return { key, name: T.name, year: c.year, selected: true, stage, result: label, medal, star };
  }

  // ---------- 성장 ----------
  function growthRate(c) {
    const a = c.age, t = c.hidden.growthType;
    if (t === 'late') {
      if (a <= 26) return 0.07;
      if (a <= 31) return 0.2;
      return 0.04;
    }
    const shift = t === 'early' ? 2 : 0;
    const x = a + shift;
    if (x <= 23) return 0.21;
    return [0.17, 0.15, 0.12, 0.09, 0.06, 0.03][x - 24] || 0;
  }
  function peakAge(c) {
    if (c.hidden.growthType === 'late') return 37;
    let p = isPitcherPos(c.position) ? 31 : 30;
    if (c.hidden.growthType === 'early') p -= 2;
    if (['CF', 'SS', '2B'].includes(c.position)) p -= 1;
    if (c.position === 'C' || c.position === '1B') p += 1;
    return p;
  }

  function applyGrowth(c, info) {
    const ovr0 = ovrOf(c);
    const pos = c.position, w = POSITIONS[pos].w, keys = statKeys(pos);
    let g = 0;
    const gap = c.pot - ovr0;
    if (gap > 0) {
      let rate = growthRate(c);
      if (c.hidden.growthType === 'late' && c.age > 26 && info.pt < 0.6) rate = 0.06; // 벤치에서는 개화가 미뤄짐
      const play = 0.3 + 0.7 * info.ptEff;
      const perf = clamp(1 + 0.12 * info.z, 0.8, 1.25);
      const d = ovr0 - info.L;
      const chal = d > 12 ? 0.75 : d > 8 ? 0.88 : d < -8 ? 0.9 : 1.0;
      const mom = 1 + c.flags.momentum;
      g = Math.min(gap, gap * rate * play * perf * chal * mom + randn() * 0.5);
    } else g = randn() * 0.3;
    const peak = peakAge(c);
    if (c.age >= peak) {
      let dec = (c.age - peak) * 0.7 + 0.6 + randn() * 0.5;
      if (c.hidden.growthType === 'late') dec *= 1.8;
      g -= Math.max(0, dec);
    }
    // 능력치 배분
    const fade = g < 0;
    const a = {};
    let norm = 0;
    keys.forEach((k) => {
      let x = (w[k] || 0) + 0.15 + rand(0, 0.12);
      if (!fade && c.focus === k) x += 0.6;
      if (fade && (k === 'spd' || k === 'vel')) x += 0.35;
      if (fade && c.focus === k) x *= 0.5;
      a[k] = x; norm += (w[k] || 0) * x;
    });
    const before = Object.assign({}, c.stats);
    keys.forEach((k) => {
      const d = g * a[k] / norm;
      c.stats[k] = clamp(Math.round((c.stats[k] + d) * 10) / 10, 20, 99);
    });
    if (info.injuryHit) {
      const k = isPitcherPos(pos) ? 'vel' : 'spd';
      c.stats[k] = clamp(c.stats[k] - info.injuryHit, 20, 99);
    }
    if (c.flags.pendingBoost) {
      const { stat, amt } = c.flags.pendingBoost;
      c.stats[stat] = clamp(c.stats[stat] + amt, 20, 99);
      c.flags.pendingBoost = null;
    }
    const changes = {};
    keys.forEach((k) => { changes[k] = Math.round(c.stats[k]) - Math.round(before[k]); });
    return { before: ovr0, after: ovrOf(c), changes };
  }

  // ---------- 계약 ----------
  function salaryFor(league, idx, ovr) {
    const lv = LEAGUES[league].levels[idx];
    const t = Math.pow(clamp((ovr - (lv.avg - 6)) / 22, 0, 1), 2);
    return r1(lv.pay[0] + (lv.pay[1] - lv.pay[0]) * t);
  }

  function makeOffers(c, opts) {
    const ovr = ovrOf(c);
    const offers = [];
    const leagues = opts.leagues || D.LEAGUE_ORDER;
    for (const lg of leagues) {
      const L = LEAGUES[lg];
      const native = isNativeTo(c, lg);
      if (!native && L.foreignBar && ovr < L.foreignBar - 3) continue;
      const ids = CLUBS[lg].map((_, i) => clubId(lg, i)).filter((id) => id !== c.club || opts.allowSame);
      const count = lg === 'MLB' ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const club = pick(ids);
        let idx = -1;
        for (let i = 0; i < L.levels.length; i++) {
          if (ovr >= levelBar(c, lg, i, club) - 5) { idx = i; break; }
        }
        if (idx === -1) {
          if (!native || ovr < L.levels[L.levels.length - 1].avg - 3) continue;
          idx = L.levels.length - 1;
        }
        if (!native && idx > 0) continue;
        if (lg === 'MLB' && idx >= 2 && c.age > 27) continue;
        if (offers.some((o) => o.club === club)) continue;
        const base = salaryFor(lg, idx, ovr);
        const prem = opts.fa ? rand(1.1, 1.5) : rand(0.9, 1.1);
        const years = idx > 0 ? 1 : c.age <= 29 && ovr >= L.levels[0].avg + 4 ? randInt(3, 6) : c.age <= 33 ? randInt(1, 3) : 1;
        offers.push({
          club, league: lg, levelIdx: idx, foreign: !native, years,
          salary: r1(base * prem), str: clubStr(c, club),
          label: `${clubName(club)} (${L.name}${idx > 0 ? ' · ' + L.levels[idx].name + ' 계약' : ''})`,
        });
      }
    }
    offers.sort((a, b) => b.salary - a.salary);
    return offers.slice(0, 5);
  }

  function joinClub(c, o) {
    if (o.club !== c.club) {
      addLog(c, `${clubName(o.club)} 이적 (${o.years}년 · 연 ${money(o.salary)})`);
      if (!c.clubs.includes(o.club)) c.clubs.push(o.club);
    } else addLog(c, `${clubName(o.club)} 잔류 (${o.years}년 · 연 ${money(o.salary)})`);
    c.club = o.club;
    c.foreign = !!o.foreign;
    c.contract = { years: o.years, salary: o.salary, fa: true };
  }

  // ---------- 시즌 진행 ----------
  function simulateSeason(c) {
    if (c.retired || c.events.length) throw new Error('진행할 수 없는 상태');
    const season = { year: c.year, age: c.age, pos: c.position, awards: [], intl: [], notes: [] };
    const ovrStart = ovrOf(c);

    // 봄: WBC
    if (TOURNAMENTS.WBC.years(c.year)) {
      const t = runTournament(c, 'WBC', ovrStart);
      if (t) season.intl.push(t);
    }

    driftWorld(c.world);
    const asg = assignLevel(c);
    const prevLevel = c.levelIdx, prevLeague = c.lastLeague;
    c.levelIdx = asg.idx;
    const L = LEAGUES[asg.league];
    const lv = L.levels[asg.idx];
    const isTop = asg.idx === 0 && asg.club !== 'MIL';
    if (prevLeague === asg.league && asg.club !== 'MIL' && c.history.length) {
      if (asg.idx < prevLevel) season.notes.push(asg.idx === 0 ? `${lv.name} 콜업!` : `${lv.name} 승격`);
      else if (asg.idx > prevLevel) season.notes.push(`${lv.name}로 강등`);
    }
    c.lastLeague = asg.league;

    // 부상
    let lost = c.flags.injuryCarry || 0;
    c.flags.injuryCarry = 0;
    let injury = null, injuryHit = 0;
    const injP = 0.13 * c.hidden.injury + Math.max(0, c.age - 30) * 0.012;
    if (chance(injP)) {
      const roll = R();
      const pitcher = isPitcherPos(c.position);
      if (roll < 0.07) {
        injury = pitcher ? '팔꿈치 인대 파열 — 토미 존 수술' : '전방십자인대 파열';
        lost = Math.max(lost, rand(0.7, 0.95)); c.flags.injuryCarry = rand(0.2, 0.45); injuryHit = randInt(1, 3);
      } else if (roll < 0.3) {
        injury = pick(pitcher ? ['어깨 염증', '광배근 부상', '팔꿈치 염좌'] : ['햄스트링 부상', '손목 골절', '옆구리 부상']);
        lost = Math.max(lost, rand(0.3, 0.5));
      } else {
        injury = pick(['허리 통증', '발목 염좌', '손가락 물집', '종아리 경련', '타구에 맞은 타박상']);
        lost = Math.max(lost, rand(0.06, 0.2));
      }
    }
    const ptEff = asg.pt * (1 - lost);
    const form = randn() * 0.55 + c.flags.momentum;
    const teamS = clubStr(c, asg.club);
    const pitcher = isPitcherPos(c.position);
    const line = pitcher ? pitcherLine(c, lv.avg, lv.games, ptEff, form, asg.role.tier, teamS) : hitterLine(c, lv.avg, lv.games, ptEff, form);

    if (isTop && !c.flags.rookieYear && line.G > 0) c.flags.rookieYear = c.year;
    const gf = lv.games / 162;
    const contrib = (line.war / gf - 2) * 0.25;
    const team = teamSeason(c, asg.league, asg.club, isTop, contrib);
    const aw = seasonAwards(c, { league: asg.league, isTop, line, games: lv.games, team, pitcher, L: lv.avg, pt: asg.pt, levelName: lv.name });

    // 가을: 아시안게임·올림픽·프리미어12
    for (const k of ['OLY', 'ASG', 'P12']) {
      if (TOURNAMENTS[k].years(c.year)) {
        const t = runTournament(c, k, ovrStart);
        if (t) season.intl.push(t);
      }
    }
    season.intl.forEach((t) => {
      if (!t.selected) return;
      c.intl.push(t);
      if (c.nationality === 'KOR' && !c.military.served && !c.military.exempt &&
        ((t.key === 'ASG' && t.medal === '금') || (t.key === 'OLY' && t.medal))) {
        c.military.exempt = true;
        season.notes.push('병역 특례 혜택!');
      }
    });

    Object.assign(season, {
      league: asg.league, levelIdx: asg.idx, level: lv.name, levelShort: lv.short, isTop,
      club: asg.club, clubName: clubName(asg.club), role: asg.role.name, tier: asg.role.tier,
      ovr: ovrStart, pitcher, line, war: line.war, team, injury, mvpRank: aw.mvpRank,
      awards: aw.list,
    });
    if (injury) season.notes.push(`부상: ${injury}`);

    // 마일스톤
    milestone(c, 'debut', isTop && line.G > 0, `${L.name} 데뷔`);
    if (pitcher) milestone(c, 'first', isTop && (line.W > 0 || line.SV > 0), line.W > 0 ? '첫 승리' : '첫 세이브');
    else milestone(c, 'first', isTop && line.HR > 0, '첫 홈런');
    milestone(c, 'champ', isTop && team.champ, `첫 ${L.champ} 우승`);
    milestone(c, 'mvp', aw.mvpRank === 1, `첫 ${L.name} MVP`);

    // 수입 / 서비스 타임
    const pay = asg.club === 'MIL' ? 0.03 : c.contract.salary;
    c.earnings = r1(c.earnings + pay);
    season.salary = pay;
    if (isTop && line.G >= lv.games * 0.25) c.service[asg.league] = (c.service[asg.league] || 0) + 1;

    // 성장
    const z = (line.war / gf - 1.5) / 2.5;
    const growth = applyGrowth(c, { pt: asg.pt, ptEff, z, L: lv.avg, injuryHit });
    season.growth = growth;
    c.flags.momentum = aw.list.some((a) => ['MVP', 'PIT', 'ROY', 'LEAD'].includes(a.key)) || (isTop && team.champ) ? 0.1 : 0;
    const o = ovrOf(c);
    if (o > c.bestOvr) { c.bestOvr = o; c.bestOvrAge = c.age + 1; }

    c.history.push(season);
    c.age += 1;
    c.year += 1;
    c.flags.tradeAsked = false;
    afterSeason(c, season);
    return season;
  }

  function milestone(c, key, cond, label) {
    if (!cond || c.milestones.some((m) => m.key === key)) return;
    c.milestones.push({ key, label, year: c.year, age: c.age });
  }

  // ---------- 시즌 후 이벤트 ----------
  function pushEvent(c, ev) { c.events.push(ev); }

  function afterSeason(c, s) {
    const ovr = ovrOf(c);
    const pitcher = isPitcherPos(c.position);

    // 군 복무 진행
    if (c.military.left > 0) {
      c.military.left -= 1;
      if (c.military.left === 0) {
        c.military.served = true;
        c.club = c.military.homeClub;
        pushEvent(c, info('전역', `복무를 마치고 ${clubName(c.club)}로 돌아왔어요. 다시 경쟁을 시작해요.`));
      }
      return;
    }

    // 은퇴 강제/권유
    if (c.age >= 45) {
      pushEvent(c, { kind: 'retire_force', title: '은퇴', body: '마흔다섯, 이제 유니폼을 벗을 때가 됐어요.', options: [{ id: 'retire', label: '은퇴하기', primary: true }] });
      return;
    }

    // 계약
    const league = clubLeague(c.club);
    const L = LEAGUES[league];
    c.contract.years -= 1;
    const lowest = L.levels[L.levels.length - 1];
    const released = (c.foreign && ovr < levelBar(c, league, 0, c.club) - 6) ||
      (!c.foreign && c.age >= 24 && ovr < lowest.avg - 5 && s.tier <= 1) ||
      (c.age >= 31 && s.levelIdx > 0 && chance(0.5)) ||
      (c.age >= 35 && s.tier <= 1 && chance(0.5));
    if (released) {
      const offers = makeOffers(c, {});
      pushEvent(c, {
        kind: 'offers', sub: 'release', title: '방출 통보',
        body: `${clubName(c.club)}이(가) 재계약을 하지 않기로 했어요. ${offers.length ? '관심을 보인 구단이 있어요.' : '새 팀을 찾지 못했어요.'}`,
        offers,
        options: offers.map((o, i) => ({ id: 'offer:' + i, label: offerLabel(o) })).concat([{ id: 'retire', label: '은퇴하기' }]),
      });
      return;
    }
    if (c.contract.years <= 0) {
      const svc = c.service[league] || 0;
      if (svc >= L.faYears) {
        const offers = makeOffers(c, { fa: true, allowSame: false });
        const stay = { club: c.club, league, levelIdx: 0, foreign: c.foreign, years: c.age <= 31 ? randInt(2, 4) : 1, salary: r1(salaryFor(league, Math.min(c.levelIdx, L.levels.length - 1), ovr) * rand(1.0, 1.3)) };
        stay.label = `${clubName(c.club)} 잔류`;
        const all = [stay].concat(offers);
        pushEvent(c, {
          kind: 'offers', sub: 'fa', title: 'FA 자격 획득',
          body: `${L.name} ${svc}시즌을 채워 자유계약선수(FA)가 됐어요. 어디서 뛸지 직접 고를 수 있어요.`,
          offers: all,
          options: all.map((o, i) => ({ id: 'offer:' + i, label: offerLabel(o), primary: i === 0 })),
        });
      } else {
        const idx = Math.min(c.levelIdx, L.levels.length - 1);
        const sal = salaryFor(league, idx, ovr);
        const old = c.contract.salary;
        c.contract = { years: 1, salary: sal, fa: false };
        if (Math.abs(sal - old) >= 0.1) addLog(c, `연봉 재계약 ${money(old)} → ${money(sal)}`);
      }
    }

    // 포스팅
    const svc = c.service[league] || 0;
    if (L.postingYears && league !== 'MLB' && svc >= L.postingYears && !c.flags['posted' + league] &&
      c.age <= 33 && ovr >= 66 && c.contract.years > 0 && !c.events.some((e) => e.kind === 'offers')) {
      pushEvent(c, {
        kind: 'posting', title: '포스팅 기회',
        body: `구단이 메이저리그 포스팅을 허락해 줄 수 있대요. 도전할까요? (오버롤 ${ovr})`,
        options: [{ id: 'yes', label: 'MLB 도전', primary: true }, { id: 'no', label: '남는다' }],
      });
    }

    // 군 복무 (대한민국)
    if (c.nationality === 'KOR' && !c.military.served && !c.military.exempt) {
      if (c.age >= 28) {
        pushEvent(c, { kind: 'military', forced: true, title: '입대 통지', body: '병역 의무를 더 미룰 수 없어요. 국군체육부대(상무)에서 2시즌 동안 퓨처스리그를 뛰어요.', options: [{ id: 'yes', label: '입대', primary: true }] });
        return;
      }
      if (c.age >= 21 && s.tier <= 2 && chance(0.6)) {
        pushEvent(c, { kind: 'military', title: '상무 지원', body: '출전 기회가 부족하다면 일찍 상무에 입대해 꾸준히 경기에 나서는 방법도 있어요. 2시즌 동안 퓨처스리그에서 주전으로 뛰어요.', options: [{ id: 'yes', label: '상무 지원' }, { id: 'no', label: '다음에', primary: true }] });
      }
    }

    // 트레이드
    if (!c.events.length && c.contract.years > 0 && ovr < levelBar(c, league, 0, c.club) + 4 && chance(0.07)) {
      const ids = CLUBS[league].map((_, i) => clubId(league, i)).filter((id) => id !== c.club);
      const to = pick(ids);
      pushEvent(c, info('트레이드', `${clubName(c.club)}이(가) 당신을 ${clubName(to)}로 트레이드했어요.`, { tradeTo: to }));
    }

    // 포지션 전환 제안
    if (c.flags.posOffered < 2 && c.age <= 31 && chance(0.25)) {
      const cands = pitcher ? ['SP', 'RP'] : D.POSITION_ORDER.filter((p) => !isPitcherPos(p));
      let best = null;
      cands.forEach((p) => {
        if (p === c.position) return;
        const o2 = calcOvr(c.stats, p);
        if (o2 >= ovr + 2 && (!best || o2 > best.ovr)) best = { pos: p, ovr: o2 };
      });
      if (best) {
        c.flags.posOffered += 1;
        pushEvent(c, {
          kind: 'position', title: '포지션 전환 제안', pos: best.pos,
          body: `코치가 "${POSITIONS[best.pos].name}가 더 잘 맞을 것 같다"고 해요. 능력치는 그대로지만 평가 기준이 바뀌어 오버롤이 ${ovr} → ${best.ovr}가 돼요.`,
          options: [{ id: 'yes', label: `${POSITIONS[best.pos].name}로 전환`, primary: true }, { id: 'no', label: `${POSITIONS[c.position].name} 유지` }],
        });
      }
    }

    // 스위치 히터 / 새 구종
    if (!pitcher && !c.flags.switchDone && c.bats !== '양' && c.age <= 26 && chance(0.08)) {
      pushEvent(c, { kind: 'switch', title: '스위치 히터 도전', body: '타격 코치가 반대 타석도 연습해 보자고 해요. 한 시즌은 어색하겠지만 익숙해지면 좌우 투수를 가리지 않게 돼요.', options: [{ id: 'yes', label: '도전한다', primary: true }, { id: 'no', label: '지금 타석에 집중' }] });
    }
    if (pitcher && !c.flags.pitchDone && c.age <= 30 && chance(0.1)) {
      const p = pick(['스플리터', '스위퍼', '커터', '체인지업', '너클 커브']);
      pushEvent(c, { kind: 'pitch', title: '새 구종 장착', pitch: p, body: `투수 코치가 ${p}를 배워 보자고 해요. 익히는 데 실패할 수도 있지만, 성공하면 변화구가 확 좋아져요.`, options: [{ id: 'yes', label: `${p} 연마`, primary: true }, { id: 'no', label: '지금 구종으로' }] });
    }

    // 집중 훈련 캠프 (커리어당 최대 3번)
    if (c.flags.campLeft > 0 && c.age <= 30 && chance(0.18)) {
      const keys = statKeys(c.position).slice().sort((a, b) => (POSITIONS[c.position].w[b] || 0) - (POSITIONS[c.position].w[a] || 0)).slice(0, 4);
      const two = [];
      while (two.length < 2) { const k = pick(keys); if (!two.includes(k)) two.push(k); }
      const cost = r1(Math.max(0.2, c.earnings * 0.05));
      pushEvent(c, {
        kind: 'camp', title: '비시즌 개인 훈련 캠프', cost, stats: two,
        body: `유명 트레이너가 비시즌 집중 훈련을 제안했어요. 비용은 ${money(cost)}. 어디에 집중할까요? (남은 기회 ${c.flags.campLeft}번)`,
        options: two.map((k) => ({ id: 'stat:' + k, label: `${STAT_NAMES[k]} 집중 (+3)` })).concat([{ id: 'no', label: '쉬면서 회복', primary: false }]),
      });
    }

    // 은퇴 권유
    if (c.age >= 35 && (ovr < c.bestOvr - 12 || s.tier <= 1)) {
      pushEvent(c, { kind: 'retire_q', title: '은퇴를 고민할 때', body: `전성기(오버롤 ${c.bestOvr})보다 기량이 많이 떨어졌어요. 한 시즌 더 뛸까요?`, options: [{ id: 'no', label: '한 시즌 더', primary: true }, { id: 'retire', label: '은퇴하기' }] });
    }
  }

  function info(title, body, extra) {
    return Object.assign({ kind: 'info', title, body, options: [{ id: 'ok', label: '확인', primary: true }] }, extra || {});
  }
  function offerLabel(o) {
    const lg = LEAGUES[o.league];
    return `${clubName(o.club)} · ${lg.name}${o.levelIdx > 0 ? ' ' + lg.levels[o.levelIdx].name : ''} · ${o.years}년 · 연 ${money(o.salary)}${o.foreign ? ' · 외국인 선수' : ''}`;
  }

  // 현재 이벤트에 답한다. 결과 메시지를 돌려준다.
  function choose(c, optId) {
    const ev = c.events[0];
    if (!ev) return null;
    let msg = null;
    if (optId === 'retire') { c.events = []; retire(c); return '은퇴를 결정했어요.'; }
    switch (ev.kind) {
      case 'info':
        if (ev.tradeTo) {
          c.club = ev.tradeTo;
          if (!c.clubs.includes(ev.tradeTo)) c.clubs.push(ev.tradeTo);
          addLog(c, `${clubName(ev.tradeTo)}로 트레이드`);
        }
        break;
      case 'offers': {
        const i = +optId.split(':')[1];
        const o = ev.offers[i];
        if (o) {
          if (ev.sub === 'posting' || o.league !== clubLeague(c.club)) c.lastLeague = null;
          joinClub(c, o);
          msg = `${clubName(o.club)}와(과) 계약했어요.`;
        }
        break;
      }
      case 'posting':
        c.flags['posted' + clubLeague(c.club)] = true;
        if (optId === 'yes') {
          const offers = makeOffers(c, { leagues: ['MLB'], fa: true }).filter((o) => o.levelIdx <= 1);
          c.events.shift();
          if (!offers.length) { addLog(c, 'MLB 포스팅 — 응찰 구단 없음'); return '아쉽게도 응찰한 구단이 없었어요. 원소속팀에 남아요.'; }
          c.events.unshift({
            kind: 'offers', sub: 'posting', title: 'MLB 응찰 결과', offers,
            body: '메이저리그 구단들이 손을 내밀었어요.',
            options: offers.map((o, i) => ({ id: 'offer:' + i, label: offerLabel(o), primary: i === 0 })).concat([{ id: 'stay', label: '원소속팀 잔류' }]),
          });
          return null;
        }
        break;
      case 'military':
        if (optId === 'yes') {
          c.military.left = 2; c.military.homeClub = c.club;
          addLog(c, '국군체육부대(상무) 입대');
          msg = '입대했어요. 2시즌 뒤 원소속팀으로 돌아와요.';
          c.events = [];
          return msg;
        }
        break;
      case 'position':
        if (optId === 'yes') {
          addLog(c, `${POSITIONS[c.position].name} → ${POSITIONS[ev.pos].name} 포지션 전환`);
          c.position = ev.pos;
          msg = `이제 ${POSITIONS[ev.pos].name}예요.`;
        }
        break;
      case 'switch':
        if (optId === 'yes') {
          c.flags.switchDone = true;
          c.stats.con = clamp(c.stats.con - 2, 20, 99);
          c.flags.pendingBoost = { stat: 'con', amt: 5 };
          c.bats = '양';
          addLog(c, '스위치 히터 전향');
          msg = '스위치 히터에 도전해요. 한 시즌 적응 뒤 컨택이 오를 거예요.';
        }
        break;
      case 'pitch':
        c.flags.pitchDone = true;
        if (optId === 'yes') {
          if (chance(0.75)) {
            c.flags.pendingBoost = { stat: 'brk', amt: 5 };
            addLog(c, `${ev.pitch} 장착`);
            msg = `${ev.pitch} 감을 잡았어요! 다음 시즌 변화구가 좋아질 거예요.`;
          } else msg = `${ev.pitch}는 손에 맞지 않았어요.`;
        }
        break;
      case 'camp':
        if (optId.startsWith('stat:')) {
          const k = optId.split(':')[1];
          c.flags.campLeft -= 1;
          c.earnings = r1(c.earnings - ev.cost);
          c.stats[k] = clamp(c.stats[k] + 3, 20, 99);
          msg = `${STAT_NAMES[k]} +3`;
        }
        break;
      default:
        break;
    }
    c.events.shift();
    return msg;
  }

  // 시즌 전 트레이드 요청
  function requestTrade(c) {
    if (c.flags.tradeAsked || c.military.left > 0) return '이번 시즌에는 더 요청할 수 없어요.';
    c.flags.tradeAsked = true;
    if (!chance(0.5)) return '구단이 트레이드 요청을 거절했어요.';
    const league = clubLeague(c.club);
    const ids = CLUBS[league].map((_, i) => clubId(league, i)).filter((id) => id !== c.club);
    const to = pick(ids);
    c.club = to;
    if (!c.clubs.includes(to)) c.clubs.push(to);
    addLog(c, `트레이드 요청 → ${clubName(to)} 이적`);
    return `${clubName(to)}로 트레이드됐어요.`;
  }

  // ---------- 통산 / 은퇴 ----------
  function totals(c, filter) {
    const t = { seasons: 0, G: 0, PA: 0, AB: 0, H: 0, HR: 0, RBI: 0, SB: 0, BB: 0, D2: 0, D3: 0, W: 0, L: 0, SV: 0, HLD: 0, SO: 0, IP: 0, ER: 0, war: 0, pSO: 0 };
    c.history.forEach((s) => {
      if (filter && !filter(s)) return;
      const l = s.line;
      t.seasons += 1; t.G += l.G || 0; t.war += s.war || 0;
      if (s.pitcher) {
        t.W += l.W; t.L += l.L; t.SV += l.SV; t.HLD += l.HLD; t.pSO += l.SO; t.IP += l.IP; t.ER += l.ERA * l.IP / 9;
      } else {
        t.PA += l.PA; t.AB += l.AB; t.H += l.H; t.HR += l.HR; t.RBI += l.RBI; t.SB += l.SB; t.BB += l.BB; t.D2 += l.D2; t.D3 += l.D3;
      }
    });
    t.war = r1(t.war); t.IP = r1(t.IP);
    t.avg = t.AB ? r3(t.H / t.AB) : 0;
    t.ERA = t.IP ? Math.round(t.ER / t.IP * 900) / 100 : 0;
    t.so = t.pSO;
    t.w = t.W; t.sv = t.SV; t.hr = t.HR; t.h = t.H;
    return t;
  }

  function awardCounts(c) {
    const k = { MVP: 0, PIT: 0, ROY: 0, GLOVE: 0, BAT: 0, ALL: 0, LEAD: 0, FMVP: 0, rings: 0, finals: 0, MINOR: 0 };
    c.history.forEach((s) => {
      s.awards.forEach((a) => { k[a.key] = (k[a.key] || 0) + 1; });
      if (s.isTop && s.team.champ) k.rings += 1;
      if (s.isTop && s.team.final && !s.team.champ) k.finals += 1;
    });
    return k;
  }
  const majorAwardTotal = (k) => k.MVP + k.PIT + k.ROY + k.GLOVE + k.BAT + k.LEAD + k.FMVP;

  function hallOfFame(c) {
    const lw = { MLB: 1.0, NPB: 0.8, KBO: 0.7, CPBL: 0.5 };
    let war = 0;
    c.history.forEach((s) => { if (s.isTop) war += s.war * lw[s.league]; });
    const k = awardCounts(c);
    const wbc = c.intl.filter((t) => t.key === 'WBC' && t.stage === 4).length;
    const score = war + k.MVP * 6 + k.PIT * 5 + k.rings * 1.5 + k.ALL * 0.4 + (k.GLOVE + k.BAT + k.LEAD) * 0.4 + wbc * 2;
    const vote = clamp(Math.round(score / 80 * 75 * 10) / 10, 0, 99.7);
    let tier = '평범한 프로 선수';
    if (vote >= 75) tier = '명예의 전당 헌액';
    else if (vote >= 45) tier = '리그 레전드';
    else if (vote >= 20) tier = '팬들이 기억하는 선수';
    return { score: r1(score), vote, tier, inducted: vote >= 75 };
  }

  function lifeTitles(c, k, hof) {
    const t = [];
    if (hof.inducted) t.push('명예의 전당');
    else if (hof.vote >= 45) t.push('레전드');
    if (k.MVP >= 3) t.push(`MVP ${k.MVP}회`);
    else if (k.MVP) t.push('MVP');
    const topClubs = new Set(c.history.filter((s) => s.club !== 'MIL').map((s) => s.club));
    if (topClubs.size === 1 && c.history.length >= 10) t.push('원클럽맨');
    if (topClubs.size >= 6) t.push('저니맨');
    if (c.history.some((s) => s.isTop && s.league === 'MLB')) t.push('메이저리거');
    if (c.history.some((s) => s.isTop && s.league !== NATIONS[c.nationality].home && s.league !== 'MLB')) t.push('해외파');
    if (c.hidden.growthType === 'late' && c.bestOvrAge >= 30) t.push('늦게 핀 꽃');
    if (c.pot - c.bestOvr >= 12) t.push('만년 유망주');
    if (c.intl.some((x) => x.key === 'WBC' && x.stage === 4)) t.push('WBC 챔피언');
    if (k.rings >= 3) t.push('우승 청부사');
    if (c.history.some((s) => s.awards.some((a) => a.name === '홈런왕'))) t.push('홈런왕');
    const tt = totals(c, (s) => s.isTop);
    if (tt.IP >= 2500) t.push('철완');
    if (tt.SV >= 300) t.push('수호신');
    return t;
  }

  function retire(c) {
    c.retired = true;
    c.events = [];
    const k = awardCounts(c);
    const hof = hallOfFame(c);
    milestone(c, 'hof', hof.inducted, '명예의 전당 헌액');
    const top = totals(c, (s) => s.isTop);
    c.summary = {
      retiredYear: c.year, retiredAge: c.age, awards: k, hof, titles: lifeTitles(c, k, hof),
      top, all: totals(c), majorAwards: majorAwardTotal(k),
    };
    addLog(c, `현역 은퇴 (${c.age}세) — ${hof.tier}`);
    return c.summary;
  }

  // 랭킹에 쓰는 요약
  function rankingEntry(c) {
    const s = c.summary;
    return {
      id: c.id, name: c.name, number: c.number, nationality: c.nationality, position: c.position,
      mvp: s.awards.MVP, bestOvr: c.bestOvr, awards: s.majorAwards, war: s.top.war,
      hr: s.top.HR, h: s.top.H, w: s.top.W, sv: s.top.SV, rings: s.awards.rings,
      hof: s.hof, titles: s.titles, retiredAge: c.age, seasons: c.history.length,
      clubs: c.clubs.map(clubName), date: new Date().toISOString(),
    };
  }
  function compareRanking(a, b) {
    return b.mvp - a.mvp || b.bestOvr - a.bestOvr || b.awards - a.awards || b.war - a.war;
  }

  const ENGINE = {
    SAVE_VERSION, START_YEAR, setRandom, seeded,
    isPitcherPos, statKeys, calcOvr, ovrOf, potStars, makeCandidates, newCareer,
    simulateSeason, choose, requestTrade, retire, totals, awardCounts, hallOfFame,
    rankingEntry, compareRanking, clubName, clubLeague, assignLevel, money, salaryFor,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = ENGINE;
  else root.ENGINE = ENGINE;
})(typeof window !== 'undefined' ? window : globalThis);
