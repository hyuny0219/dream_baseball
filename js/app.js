/* 화면: 라우팅, 렌더링, 저장 */
(function () {
  const D = window.DATA, E = window.ENGINE;
  const { POSITIONS, STAT_NAMES, LEAGUES, NATIONS } = D;
  const SAVE_KEY = 'dbb.save.v1';
  const RANK_KEY = 'dbb.rank.v1';
  const app = document.getElementById('app');

  // ---------- 저장 ----------
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* 무시 */ } },
  };
  let career = store.get(SAVE_KEY);
  if (career && career.v !== E.SAVE_VERSION) career = null;
  const save = () => { if (career) store.set(SAVE_KEY, career); };
  const rankings = () => store.get(RANK_KEY) || [];

  // ---------- 유틸 ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
  const f3 = (x) => (x >= 1 ? x.toFixed(3) : x.toFixed(3).replace(/^0/, ''));
  const flag = (code) => NATIONS[code].flag;
  const posName = (p) => POSITIONS[p].name;
  const sign = (n) => (n > 0 ? `<span class="up">+${n}</span>` : n < 0 ? `<span class="down">${n}</span>` : '<span class="muted">0</span>');

  function toast(msg) {
    if (!msg) return;
    const t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { t.hidden = true; }, 2600);
  }

  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modal-body');
  function openModal(html, dismissable) {
    modalBody.innerHTML = html;
    modal.hidden = false;
    modal.onclick = dismissable ? (e) => { if (e.target === modal) closeModal(); } : null;
    modal.querySelector('.modal-card').scrollTop = 0;
  }
  function closeModal() { modal.hidden = true; modalBody.innerHTML = ''; }

  function statBars(stats, pos, focus) {
    const w = POSITIONS[pos].w;
    return `<div class="bars">${E.statKeys(pos).map((k) => {
      const v = Math.round(stats[k]);
      return `<div class="bar ${focus === k ? 'focus' : ''}"><span>${STAT_NAMES[k]}${w[k] >= 0.25 ? ' <span class="w">●</span>' : ''}</span>
        <div class="track"><div class="fill" style="width:${v}%"></div></div><span class="v">${v}</span></div>`;
    }).join('')}</div>`;
  }

  // ---------- 라우터 ----------
  const routes = { '': home, play, new: newCareer, rank, guide };
  function route() {
    const name = (location.hash.replace(/^#\/?/, '').split('/')[0]) || '';
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === name || (name === 'new' && a.dataset.nav === 'play')));
    closeModal();
    (routes[name] || home)();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  const go = (h) => { if (location.hash === h) route(); else location.hash = h; };

  // ---------- 홈 ----------
  const STEPS = ['퓨처스', '데뷔', '첫 홈런', '우승', 'MVP', '명예의 전당'];
  function home() {
    const has = career && !career.retired;
    app.innerHTML = `
      <section class="hero">
        <div class="diamond"><div class="field"></div><i class="base b0"></i><i class="base b1"></i><i class="base b2"></i><i class="base b3"></i></div>
        <h1>벤치에서 <em>명예의 전당</em>까지</h1>
        <p>나만의 야구선수 키우기 게임. 한 시즌의 활약과 선택이 쌓여 커리어가 돼요. 데뷔, 국가대표, MVP, 명예의 전당까지 도전해 보세요.</p>
        <ol class="steps">${STEPS.map((s) => `<li>${s}</li>`).join('')}</ol>
        <div class="row" style="max-width:420px;margin:0 auto">
          ${has ? `<a class="btn primary big" href="#/play">이어하기 — ${esc(career.name)} (${career.age}세)</a>` : ''}
          <a class="btn ${has ? '' : 'primary'} big" href="#/new">새 커리어 시작</a>
        </div>
      </section>
      <section class="features">
        <div><b>⚾ 포지션과 스타일</b>투수 2개, 야수 8개 포지션. 거포·교타자·파이어볼러·기교파 등 플레이 스타일로 시작해요.</div>
        <div><b>📈 결국 뛰어야 큰다</b>나이, 출전 시간, 활약, 부상과 숨겨진 성장 특성이 성장을 결정해요.</div>
        <div><b>🔁 콜업·트레이드·FA·포스팅</b>2군과 마이너에서 시작해 1군으로. 서비스 타임을 채우면 FA, KBO·NPB에서는 포스팅으로 MLB에 도전해요.</div>
        <div><b>🏆 MVP와 명예의 전당</b>리그 MVP, 사이영상, 골든글러브, 타이틀. 은퇴하면 명예의 전당 득표율로 커리어를 평가받아요.</div>
        <div><b>🇰🇷 국가대표와 병역</b>WBC, 올림픽, 아시안게임, 프리미어12. 한국 선수는 메달로 병역 특례를 받거나 상무에 입대해요.</div>
        <div><b>📊 랭킹과 베스트 나인</b>은퇴한 선수는 이 기기의 랭킹에 올라 포지션별 베스트 나인을 겨뤄요.</div>
      </section>`;
  }

  // ---------- 새 커리어 ----------
  const draft = { name: '', number: 10, nationality: 'KOR', startCountry: 'KOR', position: 'SS', cands: null, pick: 0 };
  function newCareer() {
    if (career && !career.retired && !draft.confirmed) {
      app.innerHTML = `<div class="card"><h2 style="margin-top:0">진행 중인 커리어가 있어요</h2>
        <p class="muted">${esc(career.name)} (${career.age}세, ${posName(career.position)}) 커리어를 진행 중이에요. 새로 시작하면 지금 커리어는 사라져요. 필요하면 설정에서 저장 파일을 먼저 내보내 두세요.</p>
        <div class="row"><a class="btn primary" href="#/play">이어하기</a><button class="btn danger" id="force-new">새로 시작</button></div></div>`;
      document.getElementById('force-new').onclick = () => { draft.confirmed = true; newCareer(); };
      return;
    }
    if (!draft.cands) draft.cands = E.makeCandidates(draft.position);
    const nats = D.NATION_ORDER.map((k) => `<option value="${k}" ${draft.nationality === k ? 'selected' : ''}>${NATIONS[k].flag} ${NATIONS[k].name}</option>`).join('');
    app.innerHTML = `
      <h2 style="margin-top:4px">새 선수 만들기</h2>
      <div class="card">
        <div class="grid2">
          <div><label class="f" for="nm">선수 이름</label><input id="nm" type="text" maxlength="12" placeholder="닉네임을 추천해요" value="${esc(draft.name)}"></div>
          <div><label class="f" for="no">등번호</label><input id="no" type="number" min="0" max="99" value="${draft.number}"></div>
        </div>
        <label class="f" for="nat">국적</label><select id="nat">${nats}</select>
        <label class="f">시작 리그</label>
        <div class="opts" id="sc">${D.START_COUNTRIES.map((s) => `<button type="button" class="opt ${draft.startCountry === s.id ? 'on' : ''}" data-v="${s.id}"><b>${s.name} · ${LEAGUES[s.league].name}</b><span>${s.desc}</span></button>`).join('')}</div>
        <label class="f">포지션</label>
        <div class="opts pos" id="pos">${D.POSITION_ORDER.map((p) => `<button type="button" class="opt ${draft.position === p ? 'on' : ''}" data-v="${p}"><b>${p}</b><span>${posName(p)}</span></button>`).join('')}</div>
      </div>
      <h2>후보 선택 <span class="muted small">모두 오버롤 45 · 능력치 합 260</span></h2>
      <div class="grid3">${draft.cands.map((cd, i) => `
        <div class="card cand ${draft.pick === i ? 'on' : ''}" data-i="${i}">
          <h3>${cd.styleName}</h3>
          <div class="muted small">${cd.styleDesc}</div>
          <div class="small" style="margin-top:6px">${cd.throws}투${cd.bats}타 · 잠재력 <span class="stars">${stars(cd.stars)}</span></div>
          <div class="muted small">스카우트 예상 ${cd.potRange[0]}~${cd.potRange[1]}</div>
          ${statBars(cd.stats, draft.position)}
        </div>`).join('')}</div>
      <p class="muted small">● 표시는 이 포지션 오버롤에 크게 반영되는 능력치예요. 잠재력은 스카우트 예상일 뿐, 높은 잠재력이 성공을 보장하지는 않아요.</p>
      <div class="row"><button class="btn" id="reroll">후보 다시 뽑기</button><button class="btn primary" id="start">이 선수로 시작</button></div>`;

    const sync = () => {
      draft.name = document.getElementById('nm').value;
      draft.number = document.getElementById('no').value;
      draft.nationality = document.getElementById('nat').value;
    };
    app.querySelectorAll('#sc .opt').forEach((b) => b.onclick = () => { sync(); draft.startCountry = b.dataset.v; newCareer(); });
    app.querySelectorAll('#pos .opt').forEach((b) => b.onclick = () => { sync(); draft.position = b.dataset.v; draft.cands = null; draft.pick = 0; newCareer(); });
    app.querySelectorAll('.cand').forEach((b) => b.onclick = () => { sync(); draft.pick = +b.dataset.i; newCareer(); });
    document.getElementById('reroll').onclick = () => { sync(); draft.cands = null; draft.pick = 0; newCareer(); };
    document.getElementById('start').onclick = () => {
      sync();
      if (!draft.name.trim()) { toast('선수 이름을 입력해 주세요.'); document.getElementById('nm').focus(); return; }
      career = E.newCareer({
        name: draft.name, number: draft.number, nationality: draft.nationality,
        startCountry: draft.startCountry, position: draft.position, candidate: draft.cands[draft.pick],
      });
      draft.cands = null; draft.confirmed = false;
      save();
      welcome = true;
      go('#/play');
    };
  }

  // ---------- 게임 허브 ----------
  let tab = 'season';
  let welcome = false;
  function play() {
    if (!career) { go('#/new'); return; }
    if (career.retired) { retiredView(); return; }
    const c = career;
    const ovr = E.ovrOf(c);
    const asg = E.assignLevel(c);
    const L = LEAGUES[asg.league];
    const lv = L.levels[asg.idx];
    const nat = NATIONS[c.nationality];
    const leagueNow = E.clubLeague(c.club);
    const svc = c.service[leagueNow] || 0;
    const ms = new Set(c.milestones.map((m) => m.key));
    const trackKeys = ['start', 'debut', 'first', 'champ', 'mvp', 'hof'];
    const trackLabels = ['입단', '데뷔', E.isPitcherPos(c.position) ? '첫 승' : '첫 홈런', '우승', 'MVP', '명예의 전당'];
    const mil = c.nationality === 'KOR'
      ? `<div><small>병역</small>${c.military.left > 0 ? `상무 복무 중 (${c.military.left}시즌 남음)` : c.military.exempt ? '특례 혜택' : c.military.served ? '복무 완료' : `미필 (만 28세 전 입대)`}</div>` : '';

    app.innerHTML = `
      <div class="player">
        <div style="z-index:1">
          <div class="muted small">${nat.flag} ${nat.name} · ${c.throws}투${c.bats}타 · ${esc(c.styleName)}</div>
          <h1><span class="num">${c.number}</span>${esc(c.name)}</h1>
          <div>${posName(c.position)} · ${c.age}세 · ${c.year} 시즌 준비</div>
          <div class="small muted">잠재력 <span class="stars">${stars(c.stars)}</span> · 최고 오버롤 ${c.bestOvr}</div>
        </div>
        <div class="ovr"><b>${ovr}</b><span>OVR</span></div>
      </div>

      <div class="card">
        <div class="kv">
          <div><small>소속</small>${esc(E.clubName(asg.club))}</div>
          <div><small>예상 무대 · 역할</small>${L.name} ${asg.idx > 0 ? lv.name : ''} · ${asg.role.name}</div>
          <div><small>계약</small>${c.contract.fa ? `${c.contract.years}년 남음` : '연봉 계약'} · ${E.money(c.contract.salary)}</div>
          <div><small>누적 수입</small>${E.money(c.earnings)}</div>
          <div><small>${L.name} 1군 서비스 타임</small>${svc}시즌 (FA ${L.faYears}${L.postingYears ? ` · 포스팅 ${L.postingYears}` : ''})</div>
          ${mil || `<div><small>통산 1군 WAR</small>${E.totals(c, (s) => s.isTop).war}</div>`}
        </div>
        <div class="track-steps" style="margin-top:12px">${trackKeys.map((k, i) => `<div class="${k === 'start' || ms.has(k) ? 'done' : ''}">${trackLabels[i]}</div>`).join('')}</div>
      </div>

      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:baseline"><b>능력치</b><span class="muted small">비시즌 훈련 집중</span></div>
        ${statBars(c.stats, c.position, c.focus)}
        <div class="focus-row" style="margin-top:12px">
          <button data-f="auto" class="${c.focus === 'auto' ? 'on' : ''}">균형</button>
          ${E.statKeys(c.position).map((k) => `<button data-f="${k}" class="${c.focus === k ? 'on' : ''}">${STAT_NAMES[k]}</button>`).join('')}
        </div>
      </div>

      <button class="btn primary big" id="sim">⚾ ${c.year} 시즌 진행</button>
      <div class="row" style="margin-top:8px">
        <button class="btn" id="trade" ${c.flags.tradeAsked || c.military.left > 0 ? 'disabled' : ''}>트레이드 요청</button>
        <button class="btn danger" id="retire">은퇴</button>
      </div>

      <div class="tabs">
        ${[['season', '시즌 기록'], ['awards', '수상'], ['intl', '국가대표'], ['log', '커리어 일지']].map(([k, n]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('')}
      </div>
      <div id="tabbody">${tabBody(c)}</div>`;

    app.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { c.focus = b.dataset.f; save(); play(); });
    app.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { tab = b.dataset.t; play(); });
    document.getElementById('sim').onclick = runSeason;
    document.getElementById('trade').onclick = () => { const m = E.requestTrade(c); save(); play(); toast(m); };
    document.getElementById('retire').onclick = () => {
      openModal(`<h2>은퇴할까요?</h2><p class="muted">${c.age}세에 유니폼을 벗어요. 은퇴하면 커리어가 평가되고 이 기기의 랭킹에 등록돼요. 되돌릴 수 없어요.</p>
        <div class="row"><button class="btn" id="no">계속 뛴다</button><button class="btn danger" id="yes">은퇴하기</button></div>`, true);
      document.getElementById('no').onclick = closeModal;
      document.getElementById('yes').onclick = () => { E.retire(c); finishRetire(); };
    };
    if (c.events.length) showEvent();
    else if (welcome) {
      welcome = false;
      openModal(`<h2>🎉 프로 입단</h2><p>${esc(c.log[0].text)}</p>
        <p class="muted small">시즌 진행 버튼을 누르면 한 시즌이 시뮬레이션돼요. 시즌 전에 훈련 집중 능력치를 고를 수 있어요.</p>
        <button class="btn primary big" id="ok">시작하기</button>`);
      document.getElementById('ok').onclick = closeModal;
    }
  }

  function tabBody(c) {
    if (tab === 'season') return seasonTable(c.history);
    if (tab === 'awards') return awardsView(c);
    if (tab === 'intl') return intlView(c);
    return `<ul class="log">${c.log.map((l) => `<li><b>${l.year}</b>${esc(l.text)}</li>`).join('')}</ul>`;
  }

  function seasonTable(hist) {
    if (!hist.length) return '<div class="empty">아직 치른 시즌이 없어요.</div>';
    const pitcher = hist[hist.length - 1].pitcher;
    const rows = hist.slice().reverse().map((s) => {
      const l = s.line;
      const aw = s.awards.filter((a) => a.key !== 'ALL' && a.key !== 'MINOR').map((a) => a.name);
      const cls = s.isTop ? 'top' : 'minor';
      const base = `<td class="l">${s.year}</td><td>${s.age}</td><td class="l">${esc(s.levelShort)}</td><td class="l">${esc(s.clubName)}</td><td>${s.ovr}</td>`;
      const tail = `<td>${s.war.toFixed(1)}</td><td class="l">${esc(s.team.result)}</td><td class="l">${aw.join(', ')}${s.injury ? ' 🩹' : ''}</td>`;
      if (s.pitcher) return `<tr class="${cls}">${base}<td>${l.G}</td><td>${l.IP}</td><td>${l.W}-${l.L}</td><td>${l.SV}</td><td>${l.HLD}</td><td>${l.ERA.toFixed(2)}</td><td>${l.SO}</td>${tail}</tr>`;
      return `<tr class="${cls}">${base}<td>${l.G}</td><td>${f3(l.avg)}</td><td>${l.HR}</td><td>${l.RBI}</td><td>${l.SB}</td><td>${f3(l.ops)}</td><td>${l.H}</td>${tail}</tr>`;
    }).join('');
    const head = pitcher
      ? '<th>경기</th><th>이닝</th><th>승-패</th><th>세</th><th>홀</th><th>ERA</th><th>삼진</th>'
      : '<th>경기</th><th>타율</th><th>홈런</th><th>타점</th><th>도루</th><th>OPS</th><th>안타</th>';
    return `<div class="tbl-wrap"><table><thead><tr><th class="l">연도</th><th>나이</th><th class="l">무대</th><th class="l">구단</th><th>OVR</th>${head}<th>WAR</th><th class="l">팀 성적</th><th class="l">수상</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted small">노란 줄은 1군(최상위 무대) 시즌이에요. 포지션을 바꾼 경우 표의 기록 형식은 마지막 시즌 기준이에요.</p>`;
  }

  function awardsView(c) {
    const list = [];
    c.history.forEach((s) => s.awards.forEach((a) => list.push({ y: s.year, name: a.name, lg: s.league, key: a.key })));
    const rings = c.history.filter((s) => s.isTop && s.team.champ);
    if (!list.length && !rings.length) return '<div class="empty">아직 수상 기록이 없어요.</div>';
    const ranks = c.history.filter((s) => s.mvpRank > 1 && s.mvpRank <= 10).map((s) => `<li><b>${s.year}</b>${LEAGUES[s.league].name} MVP 투표 ${s.mvpRank}위</li>`);
    return `<ul class="log">
      ${rings.map((s) => `<li><b>${s.year}</b>🏆 ${LEAGUES[s.league].champ} 우승 (${esc(s.clubName)})</li>`).join('')}
      ${list.map((a) => `<li><b>${a.y}</b>${a.key === 'MVP' || a.key === 'PIT' ? '🥇 ' : a.key === 'MINOR' ? '' : '🏅 '}${a.key === 'MINOR' ? '' : LEAGUES[a.lg].name + ' '}${esc(a.name)}</li>`).join('')}
      ${ranks.join('')}</ul>`;
  }

  function intlView(c) {
    if (!c.intl.length) return `<div class="empty">아직 국가대표에 뽑힌 적이 없어요.<br><span class="small">WBC(3년마다), 올림픽(2028), 아시안게임(4년마다·아시아 국가), 프리미어12(4년마다)가 열려요.</span></div>`;
    return `<ul class="log">${c.intl.slice().reverse().map((t) => `<li><b>${t.year}</b>${flag(c.nationality)} ${t.name} — ${t.result}${t.medal ? ` (${t.medal}메달)` : ''}${t.star ? ' · 대회 베스트 플레이어' : ''}</li>`).join('')}</ul>`;
  }

  // ---------- 시즌 진행 ----------
  function runSeason() {
    if (career.events.length) { showEvent(); return; }
    const s = E.simulateSeason(career);
    save();
    seasonReport(s);
  }

  function seasonReport(s) {
    const l = s.line;
    const L = LEAGUES[s.league];
    const lineHtml = s.pitcher
      ? [['경기', l.G], ['이닝', l.IP], ['승-패', `${l.W}-${l.L}`], ['ERA', l.ERA.toFixed(2)], ['삼진', l.SO], ['세이브', l.SV], ['홀드', l.HLD], ['WAR', s.war.toFixed(1)]]
      : [['경기', l.G], ['타율', f3(l.avg)], ['홈런', l.HR], ['타점', l.RBI], ['OPS', f3(l.ops)], ['안타', l.H], ['도루', l.SB], ['WAR', s.war.toFixed(1)]];
    const g = s.growth;
    const changes = Object.entries(g.changes).filter(([, v]) => v !== 0).map(([k, v]) => `${STAT_NAMES[k]} ${sign(v)}`).join(' · ');
    const aw = s.awards.map((a) => `<span class="chip ${['MVP', 'PIT', 'FMVP'].includes(a.key) ? 'gold' : a.key === 'MINOR' ? '' : 'green'}">${esc(a.name)}</span>`).join('');
    const intl = s.intl.map((t) => t.selected
      ? `<li>${flag(career.nationality)} ${t.name} 국가대표 — <b>${t.result}</b>${t.medal ? ` (${t.medal}메달)` : ''}${t.star ? ' · 대회 베스트 플레이어' : ''}</li>`
      : `<li class="muted">${t.name}: ${esc(t.reason)}</li>`).join('');
    openModal(`
      <div class="muted small">${s.year} 시즌 · ${s.age}세</div>
      <h2>${esc(s.clubName)}</h2>
      <div><span class="chip">${L.name} ${s.levelIdx > 0 || s.club === 'MIL' ? esc(s.level) : '1군'}</span><span class="chip">${esc(s.role)}</span><span class="chip ${s.team.champ ? 'gold' : ''}">${esc(s.team.result)}</span></div>
      ${s.notes.length ? `<p>${s.notes.map((n) => `<span class="chip ${n.startsWith('부상') ? 'red' : 'gold'}">${esc(n)}</span>`).join('')}</p>` : ''}
      <div class="stat-line">${lineHtml.map(([k, v]) => `<div><b>${v}</b><small>${k}</small></div>`).join('')}</div>
      ${aw ? `<h3>수상</h3><div>${aw}</div>` : ''}
      ${s.mvpRank > 1 && s.mvpRank <= 10 ? `<p class="small">MVP 투표 ${s.mvpRank}위</p>` : ''}
      ${intl ? `<h3>국가대표</h3><ul class="log">${intl}</ul>` : ''}
      <h3>성장</h3>
      <p>오버롤 ${g.before} → <b>${g.after}</b> (${sign(g.after - g.before)})<br><span class="small">${changes || '능력치 변화 없음'}</span></p>
      <button class="btn primary big" id="next">${career.events.length ? '다음' : '확인'}</button>`);
    document.getElementById('next').onclick = () => {
      closeModal();
      if (career.retired) { finishRetire(); return; }
      tab = 'season';
      play();
    };
  }

  function showEvent() {
    const ev = career.events[0];
    if (!ev) return;
    openModal(`<div class="muted small">${career.year - 1} 시즌 종료 후</div><h2>${esc(ev.title)}</h2><p>${esc(ev.body)}</p>
      <div class="ev-opts">${ev.options.map((o) => `<button class="btn ${o.primary ? 'primary' : ''} ${o.id === 'retire' ? 'danger' : ''}" data-o="${esc(o.id)}">${esc(o.label)}</button>`).join('')}</div>`);
    modalBody.querySelectorAll('[data-o]').forEach((b) => b.onclick = () => {
      const msg = E.choose(career, b.dataset.o);
      save();
      closeModal();
      if (career.retired) { finishRetire(); return; }
      toast(msg);
      if (career.events.length) showEvent(); else play();
    });
  }

  // ---------- 은퇴 ----------
  function finishRetire() {
    const list = rankings().filter((r) => r.id !== career.id);
    if (career.history.some((s) => s.isTop && s.line.G > 0)) list.push(E.rankingEntry(career));
    store.set(RANK_KEY, list.slice(-300));
    save();
    go('#/play');
  }

  function retiredView() {
    const c = career, s = c.summary;
    const pitcher = E.isPitcherPos(c.position);
    const t = s.top, k = s.awards;
    const nat = NATIONS[c.nationality];
    const recs = D.RECORDS.filter((r) => (pitcher ? ['w', 'sv', 'so'] : ['hr', 'h']).includes(r.key)).map((r) => {
      const mine = t[r.key] || 0;
      return `<div class="card"><b>${r.label}</b> <span class="muted">— 내 기록 ${mine.toLocaleString()}</span><div class="rec" style="margin-top:8px">
        ${r.items.map(([n, v]) => `<span>${n} ${v.toLocaleString()}</span><span>${Math.round(mine / v * 100)}%</span><div class="barline"><i style="width:${Math.min(100, mine / v * 100)}%"></i></div>`).join('')}</div></div>`;
    }).join('');
    const awardList = [['MVP', k.MVP], ['최우수 투수', k.PIT], ['신인왕', k.ROY], ['수비상', k.GLOVE], ['타격·베스트 나인', k.BAT], ['타이틀', k.LEAD], ['시리즈 MVP', k.FMVP], ['올스타', k.ALL], ['우승', k.rings], ['준우승', k.finals]]
      .filter(([, v]) => v > 0).map(([n, v]) => `<span class="chip ${n === 'MVP' || n === '우승' ? 'gold' : ''}">${n} ${v}</span>`).join('') || '<span class="muted">없음</span>';
    const line = pitcher
      ? [['1군 시즌', t.seasons], ['승-패', `${t.W}-${t.L}`], ['ERA', t.ERA.toFixed(2)], ['이닝', t.IP], ['탈삼진', t.so], ['세이브', t.SV], ['홀드', t.HLD], ['WAR', t.war]]
      : [['1군 시즌', t.seasons], ['경기', t.G], ['타율', f3(t.avg)], ['안타', t.H], ['홈런', t.HR], ['타점', t.RBI], ['도루', t.SB], ['WAR', t.war]];
    app.innerHTML = `
      <div class="card hof">
        <div class="muted small">${s.retiredYear} · ${s.retiredAge}세 은퇴</div>
        <h1 style="margin:4px 0">${nat.flag} ${esc(c.name)} <span class="muted">#${c.number}</span></h1>
        <div>${posName(c.position)} · 최고 오버롤 ${c.bestOvr} (${c.bestOvrAge}세)</div>
        <h3>명예의 전당 득표율</h3>
        <div class="vote">${s.hof.vote}%</div>
        <div class="meter"><i style="width:${s.hof.vote}%"></i></div>
        <div><b>${s.hof.tier}</b> <span class="muted small">(헌액 기준 75%)</span></div>
        <div style="margin-top:10px">${s.titles.map((x) => `<span class="chip gold">${esc(x)}</span>`).join('') || '<span class="muted small">인생 이야기 타이틀 없음</span>'}</div>
      </div>
      <div class="tabs">
        ${[['card', '커리어 카드'], ['sum', '통산 기록'], ['season', '시즌 기록'], ['log', '일지']].map(([k2, n]) => `<button data-t="${k2}" class="${rtab === k2 ? 'on' : ''}">${n}</button>`).join('')}
      </div>
      <div id="rbody"></div>
      <div class="row" style="margin-top:18px"><a class="btn" href="#/rank">랭킹 보기</a><button class="btn primary" id="again">새 커리어 시작</button></div>`;
    const body = document.getElementById('rbody');
    if (rtab === 'card') {
      body.innerHTML = `<canvas class="cardimg" id="cv" width="720" height="1000"></canvas><div class="row" style="margin-top:10px"><button class="btn" id="dl">카드 이미지 저장</button></div>`;
      drawCard(document.getElementById('cv'), c);
      document.getElementById('dl').onclick = () => {
        const a = document.createElement('a');
        a.download = `${c.name}_career.png`; a.href = document.getElementById('cv').toDataURL('image/png'); a.click();
      };
    } else if (rtab === 'sum') {
      body.innerHTML = `<h3>1군 통산</h3><div class="stat-line">${line.map(([n, v]) => `<div><b>${v}</b><small>${n}</small></div>`).join('')}</div>
        <h3>수상</h3><div>${awardList}</div>
        <h3>소속 구단</h3><div>${c.clubs.map((id) => `<span class="chip">${esc(E.clubName(id))}</span>`).join('')}</div>
        <p class="small muted">통산 수입 ${E.money(c.earnings)} · 국가대표 ${c.intl.length}회</p>
        <h3>실제 역대 기록과 비교</h3>${recs}`;
    } else if (rtab === 'season') body.innerHTML = seasonTable(c.history);
    else body.innerHTML = `<ul class="log">${c.log.map((l) => `<li><b>${l.year}</b>${esc(l.text)}</li>`).join('')}</ul>`;
    app.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { rtab = b.dataset.t; retiredView(); });
    document.getElementById('again').onclick = () => { draft.confirmed = true; go('#/new'); };
  }
  let rtab = 'card';

  function drawCard(cv, c) {
    const x = cv.getContext('2d');
    const s = c.summary, t = s.top;
    const W = cv.width, H = cv.height;
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, s.hof.inducted ? '#3a2d0c' : '#1d3c5d'); g.addColorStop(1, '#0d1b2a');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.strokeStyle = s.hof.inducted ? '#f4c542' : '#2b4c6f'; x.lineWidth = 10; x.strokeRect(14, 14, W - 28, H - 28);
    // 다이아몬드
    x.save(); x.translate(W - 150, 170); x.rotate(Math.PI / 4);
    x.fillStyle = 'rgba(47,158,91,.35)'; x.fillRect(-70, -70, 140, 140);
    x.strokeStyle = 'rgba(201,139,85,.8)'; x.lineWidth = 6; x.strokeRect(-70, -70, 140, 140); x.restore();
    const font = (sz, w) => `${w || 700} ${sz}px "Pretendard","Apple SD Gothic Neo","Noto Sans KR",sans-serif`;
    x.fillStyle = '#f4c542'; x.font = font(150, 800); x.fillText(String(c.number), 50, 200);
    x.fillStyle = '#eef3f8'; x.font = font(56, 800); x.fillText(c.name, 50, 290);
    x.fillStyle = '#9fb3c8'; x.font = font(28, 500);
    x.fillText(`${NATIONS[c.nationality].name} · ${posName(c.position)} · ${c.draft.year}–${s.retiredYear}`, 50, 340);
    x.fillStyle = '#f4c542'; x.font = font(34, 800); x.fillText(s.hof.tier, 50, 410);
    x.fillStyle = '#eef3f8'; x.font = font(26, 500); x.fillText(`명예의 전당 득표율 ${s.hof.vote}% · 최고 오버롤 ${c.bestOvr}`, 50, 452);
    const pitcher = E.isPitcherPos(c.position);
    const cells = pitcher
      ? [['승', t.W], ['ERA', t.ERA.toFixed(2)], ['탈삼진', t.so], ['세이브', t.SV], ['이닝', Math.round(t.IP)], ['WAR', t.war]]
      : [['타율', f3(t.avg)], ['홈런', t.HR], ['안타', t.H], ['타점', t.RBI], ['도루', t.SB], ['WAR', t.war]];
    cells.forEach(([k, v], i) => {
      const cx = 50 + (i % 3) * 210, cy = 510 + Math.floor(i / 3) * 130;
      x.fillStyle = 'rgba(255,255,255,.06)'; x.fillRect(cx, cy, 190, 110);
      x.fillStyle = '#eef3f8'; x.font = font(44, 800); x.fillText(String(v), cx + 16, cy + 60);
      x.fillStyle = '#9fb3c8'; x.font = font(22, 500); x.fillText(k, cx + 16, cy + 94);
    });
    const k = s.awards;
    const aw = [k.MVP && `MVP ${k.MVP}`, k.PIT && `최우수 투수 ${k.PIT}`, k.rings && `우승 ${k.rings}`, k.ALL && `올스타 ${k.ALL}`, k.LEAD && `타이틀 ${k.LEAD}`].filter(Boolean).join(' · ');
    x.fillStyle = '#eef3f8'; x.font = font(28, 700); x.fillText(aw || '수상 없음', 50, 820);
    x.fillStyle = '#f4c542'; x.font = font(24, 600);
    wrap(x, s.titles.join(' · ') || '', 50, 868, W - 100, 32);
    x.fillStyle = '#9fb3c8'; x.font = font(20, 500); x.fillText('벤치에서 명예의 전당까지 ⚾', 50, H - 44);
  }
  function wrap(x, text, px, py, maxW, lh) {
    let lineStr = '';
    for (const ch of text) {
      if (x.measureText(lineStr + ch).width > maxW) { x.fillText(lineStr, px, py); lineStr = ch; py += lh; } else lineStr += ch;
    }
    if (lineStr) x.fillText(lineStr, px, py);
  }

  // ---------- 랭킹 ----------
  function rank() {
    const list = rankings().slice().sort(E.compareRanking);
    const NINE = ['SP', 'RP', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
    const best = {};
    list.forEach((r) => { if (!best[r.position]) best[r.position] = r; });
    app.innerHTML = `
      <h2 style="margin-top:4px">랭킹</h2>
      <p class="muted small">MVP 횟수 → 최고 오버롤 → 개인상 → 1군 통산 WAR 순으로 비교해요. 이 기기에서 은퇴한 선수(1군 출전 기록 보유)만 등록돼요.</p>
      <h3>포지션별 베스트 나인</h3>
      <div class="nine">${NINE.map((p) => `<div><b>${p}</b>${best[p] ? `${flag(best[p].nationality)} ${esc(best[p].name)} <span class="muted small">· MVP ${best[p].mvp} · ${best[p].bestOvr}</span>` : '<span class="muted">비어 있음</span>'}</div>`).join('')}</div>
      <h3>전체 순위</h3>
      ${list.length ? `<div class="tbl-wrap"><table><thead><tr><th>#</th><th class="l">선수</th><th class="l">포지션</th><th>MVP</th><th>최고 OVR</th><th>개인상</th><th>WAR</th><th>우승</th><th class="l">평가</th></tr></thead><tbody>
        ${list.map((r, i) => `<tr><td>${i + 1}</td><td class="l">${flag(r.nationality)} ${esc(r.name)} <span class="muted">#${r.number}</span></td><td class="l">${r.position}</td><td>${r.mvp}</td><td>${r.bestOvr}</td><td>${r.awards}</td><td>${r.war}</td><td>${r.rings}</td><td class="l">${esc(r.hof.tier)} (${r.hof.vote}%)</td></tr>`).join('')}
      </tbody></table></div>
      <button class="btn danger" id="clr" style="margin-top:8px">랭킹 기록 지우기</button>` : '<div class="empty">아직 은퇴한 선수가 없어요. 첫 커리어를 완주해 보세요!</div>'}`;
    const clr = document.getElementById('clr');
    if (clr) clr.onclick = () => {
      openModal(`<h2>랭킹을 지울까요?</h2><p class="muted">이 기기에 저장된 은퇴 선수 기록이 모두 사라져요.</p><div class="row"><button class="btn" id="n">취소</button><button class="btn danger" id="y">지우기</button></div>`, true);
      document.getElementById('n').onclick = closeModal;
      document.getElementById('y').onclick = () => { store.del(RANK_KEY); closeModal(); rank(); };
    };
  }

  // ---------- 가이드 ----------
  function guide() {
    const lg = D.LEAGUE_ORDER.map((k) => {
      const L = LEAGUES[k];
      return `<tr><td class="l">${L.name}</td><td class="l">${L.levels.map((v) => v.name).join(' → ')}</td><td>${L.levels[0].games}</td><td>${L.faYears}</td><td>${L.postingYears || '-'}</td><td class="l">${L.champ}</td></tr>`;
    }).join('');
    app.innerHTML = `<article class="prose">
      <h2 style="margin-top:4px">첫 시즌부터 은퇴까지</h2>
      <h3>1. 선수를 만들어요</h3>
      <p>이름, 등번호, 국적, 시작 리그, 포지션을 정하고 스카우트가 추천한 후보 세 명 중 한 명을 골라요. 후보는 모두 오버롤 45, 여섯 능력치 합 260이에요. 플레이 스타일에 따라 능력치 구성이 달라요.</p>
      <p>오버롤은 포지션별 능력치 가중평균이에요. 유격수는 수비·송구, 1루수는 파워·컨택, 선발투수는 체력·제구, 구원투수는 구속·멘탈이 더 크게 반영돼요. 그래서 같은 능력치라도 포지션에 따라 오버롤이 달라요.</p>
      <h3>2. 시즌을 쌓아요</h3>
      <p>시즌 진행 버튼을 누르면 한 시즌이 시뮬레이션돼요. 구단은 오버롤을 보고 1군·2군(마이너) 중 어디서 뛸지, 주전·백업·벤치 중 어떤 역할을 줄지 정해요.</p>
      <ul>
        <li><b>결국 뛰어야 커요.</b> 10대 후반부터 20대 초반에 가장 많이 자라고, 출전 시간과 활약이 성장 폭을 정해요.</li>
        <li><b>잠재력은 한계예요.</b> 성인이 된 뒤 출전 기회가 적으면 잠재력에 닿지 못할 수 있어요.</li>
        <li><b>너무 약한 무대에 오래 머물면</b> 성장이 둔해져요. 한 단계씩 올라가는 걸 추천해요.</li>
        <li><b>숨겨진 성장 특성</b>이 있어요. 일찍 피는 선수, 서른 넘어 터지는 늦게 핀 꽃도 있어요.</li>
        <li><b>훈련 집중</b>으로 비시즌에 키울 능력치를 고를 수 있어요. 우승이나 개인상을 받은 다음 시즌에는 자신감이 붙어요.</li>
        <li><b>부상</b>은 운의 영역이에요. 토미 존 수술이나 십자인대 파열은 1년 가까이 쉬어야 해요.</li>
      </ul>
      <h3>3. 진로를 선택해요</h3>
      <div class="tbl-wrap"><table><thead><tr><th class="l">리그</th><th class="l">무대</th><th>경기</th><th>FA</th><th>포스팅</th><th class="l">챔피언십</th></tr></thead><tbody>${lg}</tbody></table></div>
      <ul>
        <li><b>콜업·강등:</b> 실력이 오르면 자동으로 1군에 올라가고, 떨어지면 내려가요.</li>
        <li><b>트레이드 요청:</b> 시즌마다 한 번 요청할 수 있어요. 구단이 거절할 수도 있어요.</li>
        <li><b>FA:</b> 한 리그에서 1군 서비스 타임을 채우면 원하는 구단을 고를 수 있어요. 다른 나라 리그에서는 외국인 선수 기준을 넘어야 제안이 와요.</li>
        <li><b>포스팅:</b> KBO·NPB·CPBL에서 7시즌을 채우고 실력이 충분하면 메이저리그에 도전할 수 있어요.</li>
        <li><b>제안 이벤트:</b> 포지션 전환, 스위치 히터, 새 구종, 비시즌 개인 훈련 캠프(최대 3번) 제안이 와요.</li>
      </ul>
      <h3>4. 국가대표와 병역</h3>
      <p>WBC(2026년부터 3년마다, 봄), 올림픽(2028), 아시안게임(2026년부터 4년마다, 아시아 국가), 프리미어12(2027년부터 4년마다)가 열려요. 올림픽·아시안게임·프리미어12에는 MLB 40인 로스터 선수가 나갈 수 없어요. 아시안게임은 만 25세 이하 위주로 뽑고 와일드카드가 있어요.</p>
      <p>대한민국 선수는 아시안게임 금메달이나 올림픽 메달로 병역 특례를 받을 수 있어요. 그렇지 않으면 만 28세가 되기 전에 국군체육부대(상무)에 입대해 2시즌 동안 퓨처스리그에서 뛰어요. 출전 기회가 적을 때 일찍 지원할 수도 있어요.</p>
      <h3>5. MVP와 명예의 전당</h3>
      <p>MVP는 그 시즌의 활약(WAR)과 팀 성적으로 정해져요. 약한 리그일수록 압도적인 외국인 선수들과 경쟁해야 해서 기준이 높아요. 그 밖에 최우수 투수상(사이영상·사와무라상), 신인왕, 골드글러브·골든글러브, 실버슬러거·베스트 나인, 각종 타이틀과 올스타가 있어요.</p>
      <p>은퇴하면 1군 WAR(리그 수준 보정), MVP, 우승, 개인상, WBC 우승을 바탕으로 명예의 전당 득표율이 매겨져요. 75% 이상이면 헌액이에요.</p>
      <h3>6. 저장</h3>
      <p>진행 내용은 이 브라우저에 자동 저장돼요. 시크릿 모드나 브라우저 데이터 삭제 시 사라질 수 있으니, 중요한 커리어는 설정(⚙︎)에서 저장 파일을 내보내 두세요.</p>
    </article>`;
  }

  // ---------- 설정 ----------
  document.getElementById('btn-settings').onclick = () => {
    openModal(`<h2>설정</h2>
      <p class="muted small">저장 파일에는 진행 중인 커리어와 이 기기의 랭킹이 들어 있어요.</p>
      <div class="ev-opts">
        <button class="btn" id="ex">저장 파일 내보내기</button>
        <label class="btn" style="cursor:pointer">저장 파일 가져오기<input type="file" id="im" accept="application/json,.json" hidden></label>
        <button class="btn danger" id="rs" ${career ? '' : 'disabled'}>진행 중인 커리어 삭제</button>
        <button class="btn" id="cl">닫기</button>
      </div>`, true);
    document.getElementById('cl').onclick = closeModal;
    document.getElementById('ex').onclick = () => {
      const blob = new Blob([JSON.stringify({ app: 'dream_baseball', v: E.SAVE_VERSION, career, rankings: rankings() })], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `dream_baseball_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    document.getElementById('im').onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      file.text().then((txt) => {
        const data = JSON.parse(txt);
        if (data.app !== 'dream_baseball' || data.v !== E.SAVE_VERSION) throw new Error('형식');
        career = data.career || null;
        if (career) save(); else store.del(SAVE_KEY);
        if (Array.isArray(data.rankings)) store.set(RANK_KEY, data.rankings);
        closeModal(); toast('저장 파일을 불러왔어요.'); go('#/play');
      }).catch(() => toast('저장 파일을 읽지 못했어요.'));
    };
    document.getElementById('rs').onclick = () => {
      store.del(SAVE_KEY); career = null; closeModal(); toast('커리어를 삭제했어요.'); go('#/');
    };
  };

  route();
})();
