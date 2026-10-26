/* 게임 데이터: 포지션, 능력치, 리그, 구단, 국가, 대회 */
(function (root) {
  const HIT_STATS = ['con', 'pow', 'eye', 'spd', 'fld', 'arm'];
  const PIT_STATS = ['vel', 'ctl', 'brk', 'stf', 'sta', 'men'];

  const STAT_NAMES = {
    con: '컨택', pow: '파워', eye: '선구안', spd: '주루', fld: '수비', arm: '송구',
    vel: '구속', ctl: '제구', brk: '변화구', stf: '구위', sta: '체력', men: '멘탈',
  };

  // 포지션별 오버롤 가중치 (합 1)
  const POSITIONS = {
    SP: { name: '선발투수', pitcher: true, w: { vel: 0.2, ctl: 0.2, brk: 0.2, stf: 0.15, sta: 0.2, men: 0.05 } },
    RP: { name: '구원투수', pitcher: true, w: { vel: 0.3, ctl: 0.15, brk: 0.2, stf: 0.2, sta: 0, men: 0.15 } },
    C: { name: '포수', w: { con: 0.15, pow: 0.15, eye: 0.1, spd: 0.05, fld: 0.3, arm: 0.25 }, warAdj: 1.0 },
    '1B': { name: '1루수', w: { con: 0.25, pow: 0.35, eye: 0.2, spd: 0.05, fld: 0.1, arm: 0.05 }, warAdj: -0.8 },
    '2B': { name: '2루수', w: { con: 0.25, pow: 0.1, eye: 0.15, spd: 0.15, fld: 0.25, arm: 0.1 }, warAdj: 0.4 },
    '3B': { name: '3루수', w: { con: 0.2, pow: 0.25, eye: 0.1, spd: 0.05, fld: 0.2, arm: 0.2 }, warAdj: 0.3 },
    SS: { name: '유격수', w: { con: 0.2, pow: 0.1, eye: 0.1, spd: 0.15, fld: 0.3, arm: 0.15 }, warAdj: 0.8 },
    LF: { name: '좌익수', w: { con: 0.25, pow: 0.3, eye: 0.2, spd: 0.1, fld: 0.1, arm: 0.05 }, warAdj: -0.4 },
    CF: { name: '중견수', w: { con: 0.2, pow: 0.15, eye: 0.1, spd: 0.25, fld: 0.25, arm: 0.05 }, warAdj: 0.6 },
    RF: { name: '우익수', w: { con: 0.2, pow: 0.3, eye: 0.15, spd: 0.1, fld: 0.1, arm: 0.15 }, warAdj: -0.2 },
  };
  const POSITION_ORDER = ['SP', 'RP', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];

  // 플레이 스타일: 시작 능력치를 어느 쪽으로 기울일지
  const STYLES = {
    hitter: [
      { id: 'slugger', name: '거포', desc: '담장을 넘기는 한 방', bias: { pow: 3, eye: 1 } },
      { id: 'contact', name: '교타자', desc: '정확한 타격으로 안타 생산', bias: { con: 3, eye: 1 } },
      { id: 'fivetool', name: '호타준족', desc: '장타와 발을 겸비', bias: { spd: 2, pow: 2 } },
      { id: 'defense', name: '수비형', desc: '그라운드를 지배하는 수비', bias: { fld: 3, arm: 2 } },
      { id: 'obp', name: '출루머신', desc: '볼넷과 안타로 꾸준히 출루', bias: { eye: 3, con: 2 } },
      { id: 'cannon', name: '강견', desc: '강한 어깨와 파워', bias: { arm: 3, pow: 1 } },
    ],
    pitcher: [
      { id: 'power', name: '파이어볼러', desc: '강속구로 윽박지르는 투구', bias: { vel: 3, stf: 2 } },
      { id: 'finesse', name: '기교파', desc: '제구와 변화구로 맞혀 잡기', bias: { ctl: 3, brk: 2 } },
      { id: 'workhorse', name: '이닝이터', desc: '긴 이닝을 책임지는 체력', bias: { sta: 3, ctl: 1 } },
      { id: 'closer', name: '클로저형', desc: '강심장과 묵직한 구위', bias: { men: 3, stf: 2 } },
      { id: 'breaker', name: '변화구 마스터', desc: '마구에 가까운 결정구', bias: { brk: 3, men: 1 } },
    ],
  };

  // 리그: levels[0]이 1군(최상위). avg는 해당 무대 평균 주전 오버롤
  const LEAGUES = {
    MLB: {
      name: 'MLB', country: 'USA', countryName: '미국', champ: '월드시리즈', playoff: 12,
      faYears: 6, postingYears: null, foreignBar: null,
      levels: [
        { name: '메이저리그', short: 'MLB', avg: 74, games: 162, pay: [12, 420] },
        { name: '트리플A', short: 'AAA', avg: 64, games: 150, pay: [0.5, 1.2] },
        { name: '더블A', short: 'AA', avg: 57, games: 138, pay: [0.3, 0.6] },
        { name: '싱글A', short: 'A', avg: 50, games: 132, pay: [0.2, 0.4] },
      ],
      awards: { MVP: 'MVP', PIT: '사이영상', ROY: '신인왕', GLOVE: '골드글러브', BAT: '실버슬러거', ALL: '올스타' },
    },
    NPB: {
      name: 'NPB', country: 'JPN', countryName: '일본', champ: '일본시리즈', playoff: 6,
      faYears: 8, postingYears: 7, foreignBar: 72,
      levels: [
        { name: '1군', short: 'NPB', avg: 69, games: 143, pay: [1.5, 60] },
        { name: '2군', short: 'NPB 2군', avg: 54, games: 120, pay: [0.4, 1.0] },
      ],
      awards: { MVP: 'MVP', PIT: '사와무라상', ROY: '신인왕', GLOVE: '골든글러브', BAT: '베스트 나인', ALL: '올스타' },
    },
    KBO: {
      name: 'KBO', country: 'KOR', countryName: '한국', champ: '한국시리즈', playoff: 5,
      faYears: 8, postingYears: 7, foreignBar: 67,
      levels: [
        { name: '1군', short: 'KBO', avg: 64, games: 144, pay: [0.3, 30] },
        { name: '퓨처스', short: '퓨처스', avg: 49, games: 116, pay: [0.3, 0.5] },
      ],
      awards: { MVP: 'MVP', PIT: '최우수 투수상', ROY: '신인상', GLOVE: '수비상', BAT: '골든글러브', ALL: '올스타' },
    },
    CPBL: {
      name: 'CPBL', country: 'TWN', countryName: '대만', champ: '대만시리즈', playoff: 3,
      faYears: 8, postingYears: 7, foreignBar: 60,
      levels: [
        { name: '1군', short: 'CPBL', avg: 57, games: 120, pay: [0.3, 8] },
        { name: '2군', short: 'CPBL 2군', avg: 46, games: 90, pay: [0.2, 0.4] },
      ],
      awards: { MVP: 'MVP', PIT: '최우수 투수상', ROY: '신인왕', GLOVE: '골든글러브', BAT: '베스트 나인', ALL: '올스타' },
    },
  };
  const LEAGUE_ORDER = ['MLB', 'NPB', 'KBO', 'CPBL'];

  // 가상의 구단 (실제 구단과 무관)
  const CLUBS = {
    MLB: [
      '뉴욕 나이츠', '뉴욕 엠파이어', '보스턴 하버삭스', '필라델피아 벨스', '워싱턴 모뉴먼츠',
      '애틀랜타 피치스', '마이애미 웨이브', '토론토 노스스타', '볼티모어 버즈', '탬파 썬레이',
      '시카고 윈디스', '시카고 스톡야즈', '디트로이트 엔진스', '클리블랜드 록커스', '미네소타 레이크스',
      '밀워키 브루어리', '세인트루이스 아치스', '캔자스시티 파운틴스', '피츠버그 스틸러스', '신시내티 리버보츠',
      '휴스턴 로켓맨', '텍사스 론스타', '콜로라도 피크스', '애리조나 사구아로', 'LA 스타즈',
      'LA 엔젤시티', '샌디에이고 웨이브라이더스', '샌프란시스코 골든베이', '시애틀 레이니어스', '오클랜드 미션스',
    ],
    NPB: [
      '도쿄 썬더스', '도쿄 사무라이', '요코하마 마린스타', '나고야 샤치호코', '오사카 블레이즈', '히로시마 카프스톤',
      '후쿠오카 호크아이', '삿포로 노던라이츠', '센다이 이글레츠', '사이타마 포레스트', '지바 웨이브스', '고베 하버스',
    ],
    KBO: [
      '서울 블레이저스', '서울 스카이라인', '인천 시걸스', '수원 위저즈', '대전 스타워커스',
      '대구 썬더볼츠', '광주 피닉스', '부산 마린스', '창원 다이노스톰', '고척 루키스',
    ],
    CPBL: ['타이베이 스톰', '타이중 썬더', '타이난 레인저스', '가오슝 마린스', '신베이 팔콘스', '타오위안 비스트'],
  };

  const NATIONS = {
    KOR: { name: '대한민국', flag: '🇰🇷', bar: 69, str: 6.5, asia: true, home: 'KBO' },
    JPN: { name: '일본', flag: '🇯🇵', bar: 77, str: 9.0, asia: true, home: 'NPB' },
    USA: { name: '미국', flag: '🇺🇸', bar: 82, str: 9.0, home: 'MLB' },
    DOM: { name: '도미니카공화국', flag: '🇩🇴', bar: 79, str: 8.5, home: 'MLB' },
    VEN: { name: '베네수엘라', flag: '🇻🇪', bar: 76, str: 7.5, home: 'MLB' },
    PUR: { name: '푸에르토리코', flag: '🇵🇷', bar: 72, str: 7.0, home: 'MLB' },
    MEX: { name: '멕시코', flag: '🇲🇽', bar: 70, str: 6.8, home: 'MLB' },
    CUB: { name: '쿠바', flag: '🇨🇺', bar: 66, str: 6.2, home: 'NPB' },
    TWN: { name: '대만', flag: '🇹🇼', bar: 62, str: 6.2, asia: true, home: 'CPBL' },
  };
  const NATION_ORDER = ['KOR', 'JPN', 'USA', 'DOM', 'VEN', 'PUR', 'MEX', 'CUB', 'TWN'];

  // 국제대회 (개최 연도 판정)
  const TOURNAMENTS = {
    WBC: {
      name: 'WBC', full: '월드 베이스볼 클래식', when: 'spring', weight: 3,
      years: (y) => y >= 2026 && (y - 2026) % 3 === 0,
    },
    OLY: {
      name: '올림픽', full: '올림픽 야구', when: 'summer', weight: 2,
      years: (y) => y === 2028, noMLB: true,
    },
    ASG: {
      name: '아시안게임', full: '아시안게임 야구', when: 'fall', weight: 1,
      years: (y) => y >= 2026 && (y - 2026) % 4 === 0, asiaOnly: true, noMLB: true, u25: true,
    },
    P12: {
      name: '프리미어12', full: 'WBSC 프리미어12', when: 'fall', weight: 1,
      years: (y) => y >= 2027 && (y - 2027) % 4 === 0, noMLB: true,
    },
  };

  // 실제 통산 기록 (비교용)
  const RECORDS = [
    { key: 'hr', label: '통산 홈런', items: [['MLB 최다', 762], ['NPB 최다', 868]] },
    { key: 'h', label: '통산 안타', items: [['MLB 최다', 4256], ['NPB 최다', 3085]] },
    { key: 'w', label: '통산 승리', items: [['MLB 최다', 511], ['NPB 최다', 400]] },
    { key: 'sv', label: '통산 세이브', items: [['MLB 최다', 652], ['NPB 최다', 407]] },
    { key: 'so', label: '통산 탈삼진', items: [['MLB 최다', 5714]] },
  ];

  const START_COUNTRIES = [
    { id: 'KOR', league: 'KBO', name: '한국', desc: 'KBO 신인 드래프트 → 퓨처스리그' },
    { id: 'JPN', league: 'NPB', name: '일본', desc: 'NPB 드래프트 → 2군' },
    { id: 'USA', league: 'MLB', name: '미국', desc: 'MLB 드래프트 → 싱글A' },
    { id: 'TWN', league: 'CPBL', name: '대만', desc: 'CPBL 드래프트 → 2군' },
  ];

  const DATA = {
    HIT_STATS, PIT_STATS, STAT_NAMES, POSITIONS, POSITION_ORDER, STYLES,
    LEAGUES, LEAGUE_ORDER, CLUBS, NATIONS, NATION_ORDER, TOURNAMENTS, RECORDS, START_COUNTRIES,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
  else root.DATA = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
