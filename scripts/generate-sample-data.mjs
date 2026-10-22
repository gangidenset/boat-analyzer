// BOAT ANALYZER サンプル（デモ）データ生成スクリプト
//
// 生成されるデータはすべて架空です。選手名・成績・オッズ・結果は乱数で作成しており、
// 実在の選手・実際のレースとは一切関係ありません。
// シード固定の乱数を使うため、何度実行しても同じデータになります。
//
// 実行: npm run generate:sample

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'sample');
const GENERATED_AT = '2026-10-22T09:00:00+09:00';

// ---- 乱数（mulberry32） ----
function createRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = createRng(20261022);
const rand = (min, max) => min + (max - min) * rng();
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const normal = () => {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const round = (x, digits) => Math.round(x * 10 ** digits) / 10 ** digits;
const pad2 = (n) => String(n).padStart(2, '0');

// ---- 競艇場（名称・場コードは公開情報。特性値はデモ用の架空値） ----
const VENUES = [
  ['01', '桐生', true], ['02', '戸田', false], ['03', '江戸川', false], ['04', '平和島', true],
  ['05', '多摩川', true], ['06', '浜名湖', true], ['07', '蒲郡', true], ['08', '常滑', true],
  ['09', '津', true], ['10', '三国', true], ['11', 'びわこ', true], ['12', '住之江', true],
  ['13', '尼崎', true], ['14', '鳴門', true], ['15', '丸亀', true], ['16', '児島', true],
  ['17', '宮島', true], ['18', '徳山', true], ['19', '下関', true], ['20', '若松', true],
  ['21', '芦屋', true], ['22', '福岡', true], ['23', '唐津', true], ['24', '大村', true],
].map(([id, name, hasOriginalExhibition]) => ({ id, name, hasOriginalExhibition }));

// 1コースの強さ係数（デモ用の架空値）
const VENUE_INNER_FACTOR = { '02': 0.8, '12': 1.1, '24': 1.25, '01': 0.95, '18': 1.15, '04': 0.85 };
// コース別の基礎強さ（架空値）
const COURSE_BASE = [5.2, 1.5, 1.3, 1.1, 0.7, 0.45];

// 発走順を Plackett-Luce で決める（重み比例で1着から順に抽選）
function samplePlackettLuce(weights) {
  const remaining = weights.map((w, i) => ({ w, i }));
  const order = [];
  while (remaining.length > 0) {
    const total = remaining.reduce((s, r) => s + r.w, 0);
    let x = rng() * total;
    let idx = 0;
    for (; idx < remaining.length - 1; idx++) {
      x -= remaining[idx].w;
      if (x <= 0) break;
    }
    order.push(remaining[idx].i);
    remaining.splice(idx, 1);
  }
  return order;
}

function kimariteFor(winnerCourse) {
  if (winnerCourse === 1) return rng() < 0.93 ? '逃げ' : '恵まれ';
  if (winnerCourse === 2) return pick(['差し', '差し', '差し', 'まくり', '抜き']);
  return pick(['まくり', 'まくり差し', 'まくり差し', '差し', '抜き']);
}

function weatherSample() {
  const weather = pick(['晴', '晴', '曇り', '曇り', '雨']);
  const windSpeed = Math.min(9, Math.max(0, Math.round(Math.abs(normal()) * 2.5)));
  const waveHeight = Math.min(12, Math.max(0, Math.round(windSpeed * rand(0.4, 1.4))));
  const windDirection = pick(['北', '北東', '東', '南東', '南', '南西', '西', '北西']);
  return { weather, windSpeed, waveHeight, windDirection: windSpeed === 0 ? '無風' : windDirection };
}

// ---- 過去レース（場別・コース別統計用） ----
const HIST_VENUES = ['01', '02', '04', '12', '18', '24'];
const historical = [];
// 軽量形式の過去レースは 10/6 まで。10/7〜10/20 は出走表付きの確定レース（学習・検証用）として下で生成する
for (let d = 0; d < 16; d++) {
  const date = new Date(Date.UTC(2026, 8, 21 + d)); // 2026-09-21 〜 2026-10-06
  const dateStr = date.toISOString().slice(0, 10);
  for (const venueId of HIST_VENUES) {
    // 開催日は各場おおむね半分
    if (rng() < 0.45) continue;
    for (let raceNo = 1; raceNo <= 12; raceNo++) {
      const w = weatherSample();
      // 進入: 9割は枠なり、残りは隣同士の入れ替え
      const boatsByCourse = [1, 2, 3, 4, 5, 6];
      if (rng() < 0.1) {
        const k = randInt(1, 4);
        [boatsByCourse[k], boatsByCourse[k + 1]] = [boatsByCourse[k + 1], boatsByCourse[k]];
      }
      const inner = VENUE_INNER_FACTOR[venueId] ?? 1;
      const windPenalty = w.windSpeed >= 5 ? 0.75 : 1;
      const weights = COURSE_BASE.map((b, c) =>
        (c === 0 ? b * inner * windPenalty : b) * Math.exp(normal() * 0.35),
      );
      const order = samplePlackettLuce(weights); // コースindexの着順
      const rankByCourse = new Array(6);
      order.forEach((courseIdx, rankIdx) => (rankByCourse[courseIdx] = rankIdx + 1));
      // まれに失格・欠場（着順なし）
      if (rng() < 0.02) rankByCourse[randInt(1, 5)] = null;
      historical.push({
        date: dateStr,
        venueId,
        raceNo,
        weather: w.weather,
        windSpeed: w.windSpeed,
        waveHeight: w.waveHeight,
        kimarite: kimariteFor(order[0] + 1),
        rows: boatsByCourse.map((boatNumber, c) => ({
          course: c + 1,
          boatNumber,
          rank: rankByCourse[c],
        })),
      });
    }
  }
}

// ---- 架空の選手 ----
const SURNAMES = ['青山', '石田', '上野', '江口', '大塚', '川村', '木下', '久保', '小松', '佐野', '柴田', '杉山', '高野', '田村', '千葉', '土屋', '中西', '西川', '野口', '浜田', '平野', '福島', '松岡', '水野', '宮本', '村田', '森下', '矢野', '山根', '吉岡'];
const GIVEN = ['翔太', '健一', '大輔', '拓也', '雄太', '直樹', '亮', '誠', '浩二', '隆之', '美咲', '彩', '真由', '恵', '光', '海斗', '蓮', '颯', '陸', '湊'];
const BRANCHES = ['群馬', '埼玉', '東京', '静岡', '愛知', '三重', '福井', '滋賀', '大阪', '兵庫', '徳島', '香川', '岡山', '広島', '山口', '福岡', '佐賀', '長崎'];
const GRADE_PROFILE = {
  A1: { winRate: [6.6, 8.2], st: [0.12, 0.15], strength: 1.6 },
  A2: { winRate: [5.6, 6.6], st: [0.14, 0.17], strength: 1.25 },
  B1: { winRate: [3.8, 5.6], st: [0.15, 0.19], strength: 1.0 },
  B2: { winRate: [1.5, 3.8], st: [0.17, 0.22], strength: 0.7 },
};
let racerSerial = 0;
function createRacer() {
  racerSerial++;
  const g = rng();
  const grade = g < 0.2 ? 'A1' : g < 0.42 ? 'A2' : g < 0.9 ? 'B1' : 'B2';
  const p = GRADE_PROFILE[grade];
  return {
    id: `D${String(9000 + racerSerial)}`, // 架空の登録番号（Dはデモの意味）
    name: `${pick(SURNAMES)} ${pick(GIVEN)}`,
    grade,
    branch: pick(BRANCHES),
    age: randInt(21, 55),
    weight: round(rand(47, 56), 1),
    nationalWinRate: round(rand(...p.winRate), 2),
    localWinRate: rng() < 0.15 ? null : round(rand(...p.winRate) + normal() * 0.4, 2),
    averageStartTiming: round(rand(...p.st), 2),
    _strength: p.strength,
  };
}

// ---- オッズ ----
function permutations(n, k) {
  const out = [];
  const rec = (prefix) => {
    if (prefix.length === k) return out.push([...prefix]);
    for (let i = 1; i <= n; i++) if (!prefix.includes(i)) rec([...prefix, i]);
  };
  rec([]);
  return out;
}
const TRIFECTA = permutations(6, 3);
const EXACTA = permutations(6, 2);

function harville(weights, combo) {
  let remaining = weights.reduce((s, w) => s + w, 0);
  let p = 1;
  for (const b of combo) {
    const w = weights[b - 1];
    if (w <= 0 || remaining <= 0) return 0;
    p *= w / remaining;
    remaining -= w;
  }
  return p;
}

function oddsFromProb(p, takeout) {
  if (p <= 0) return null;
  return Math.max(1.0, Math.min(9999.9, round((1 - takeout) / p, 1)));
}

function buildOdds(marketWeights, absentBoats, fetchedAt) {
  const table = (combos, takeout) => {
    const t = {};
    for (const c of combos) {
      const key = c.join('-');
      t[key] = c.some((b) => absentBoats.includes(b)) ? null : oddsFromProb(harville(marketWeights, c), takeout);
    }
    return t;
  };
  return {
    fetchedAt,
    win: table([1, 2, 3, 4, 5, 6].map((b) => [b]), 0.2),
    exacta: table(EXACTA, 0.25),
    trifecta: table(TRIFECTA, 0.25),
  };
}

// ---- 開催レース（出走表・展示・オッズ・結果） ----
const RACE_TITLES = ['予選', '予選', '一般戦', '一般戦', '特選', '準優勝戦', '選抜戦'];
// 学習・検証用の確定レース（公式ダウンロードデータと同じくオッズなし）
const TRAINING_DAYS = Array.from({ length: 14 }, (_, d) => {
  const date = new Date(Date.UTC(2026, 9, 7 + d)).toISOString().slice(0, 10); // 2026-10-07 〜 2026-10-20
  const venues = [0, 1, 2].map((k) => HIST_VENUES[(d + k * 2) % HIST_VENUES.length]).sort();
  return { date, venues, finished: true, withOdds: false };
});
const SCHEDULE = [
  ...TRAINING_DAYS,
  { date: '2026-10-21', venues: ['02', '12', '24'], finished: true, withOdds: true },
  { date: '2026-10-22', venues: ['01', '12', '24'], finished: false, withOdds: true },
];
const races = [];
for (const day of SCHEDULE) {
  for (const venueId of day.venues) {
    const venue = VENUES.find((v) => v.id === venueId);
    const inner = VENUE_INNER_FACTOR[venueId] ?? 1;
    for (let raceNo = 1; raceNo <= 12; raceNo++) {
      const raceId = `${day.date}_${venueId}_${pad2(raceNo)}`;
      const deadlineMinutes = 10 * 60 + 30 + (raceNo - 1) * 30;
      const deadline = `${pad2(Math.floor(deadlineMinutes / 60))}:${pad2(deadlineMinutes % 60)}`;
      const racers = Array.from({ length: 6 }, createRacer);
      // 特定レースで欠場を再現（テスト・表示確認用）
      const absentBoats = day.date === '2026-10-22' && venueId === '12' && raceNo === 5 ? [6] : [];

      const entries = racers.map((r, i) => {
        const { _strength, ...racer } = r;
        return {
          boatNumber: i + 1,
          status: absentBoats.includes(i + 1) ? 'absent' : 'entered',
          racer,
          motor: { number: randInt(10, 80), twoRate: rng() < 0.05 ? null : round(rand(22, 52), 1) },
          boat: { number: randInt(10, 80), twoRate: rng() < 0.05 ? null : round(rand(25, 45), 1) },
          flyingCount: rng() < 0.08 ? 1 : 0,
          lateCount: 0,
        };
      });

      // 真の強さ（架空）：コース × 級別 × モーター × ノイズ
      const trueWeights = entries.map((e, i) => {
        if (e.status === 'absent') return 0;
        const motorFactor = e.motor.twoRate == null ? 1 : 0.8 + (e.motor.twoRate - 22) / 75;
        const base = i === 0 ? COURSE_BASE[0] * inner : COURSE_BASE[i];
        return base * racers[i]._strength * motorFactor * Math.exp(normal() * 0.25);
      });

      // 展示情報：本日の後半レースは未発表
      const exhibitionPublished = day.finished || raceNo <= 8;
      // 学習用の日はオッズを持たない（払戻金の計算にだけ市場オッズを使う）
      const w = weatherSample();
      let exhibition = null;
      if (exhibitionPublished) {
        const strengthRank = [...trueWeights].map((x, i) => ({ x, i })).sort((a, b) => b.x - a.x);
        exhibition = {
          publishedAt: `${day.date}T${pad2(Math.floor((deadlineMinutes - 25) / 60))}:${pad2((deadlineMinutes - 25) % 60)}:00+09:00`,
          weather: w.weather,
          windSpeed: w.windSpeed,
          windDirection: w.windDirection,
          waveHeight: w.waveHeight,
          entries: entries.map((e, i) => {
            if (e.status === 'absent') {
              return { boatNumber: i + 1, exhibitionTime: null, straightTime: null, turnTime: null, lapTime: null, startCourse: null, startTiming: null, tilt: null, partsChanged: [] };
            }
            const rankPos = strengthRank.findIndex((s) => s.i === i);
            const t = 6.62 + rankPos * 0.025 + normal() * 0.04;
            const missingTime = rng() < 0.04; // 計測欠損（「データなし」表示の確認用）
            const orig = venue.hasOriginalExhibition;
            return {
              boatNumber: i + 1,
              exhibitionTime: missingTime ? null : round(t, 2),
              straightTime: orig ? round(6.75 + rankPos * 0.03 + normal() * 0.05, 2) : null,
              turnTime: orig ? round(5.6 + rankPos * 0.04 + normal() * 0.08, 2) : null,
              lapTime: orig ? round(36.8 + rankPos * 0.15 + normal() * 0.3, 2) : null,
              startCourse: i + 1,
              startTiming: rng() < 0.05 ? null : round(Math.max(0.01, (racers[i].averageStartTiming ?? 0.16) + normal() * 0.04), 2),
              tilt: pick([-0.5, -0.5, 0, 0, 0.5, 1.0]),
              partsChanged: rng() < 0.08 ? [pick(['ピストン', 'リング', 'キャブレター', 'ギアケース'])] : [],
            };
          }),
        };
      }

      // 市場の評価（オッズの元）＝ 真の強さに別のノイズをかけたもの
      const marketWeights = trueWeights.map((x) => x * Math.exp(normal() * 0.3));
      const oddsMissing = !day.finished && venueId === '24' && raceNo === 12; // オッズ未発表の例
      const fetchedAt = day.finished
        ? `${day.date}T${deadline}:00+09:00`
        : `${day.date}T09:00:00+09:00`;
      const market = buildOdds(marketWeights, absentBoats, fetchedAt);
      const odds = oddsMissing || !day.withOdds ? null : market;

      let result = null;
      if (day.finished) {
        const order = samplePlackettLuce(trueWeights.map((x) => Math.max(x, 0))).map((i) => i + 1)
          .filter((b) => !absentBoats.includes(b));
        const [a, b, c] = order;
        result = {
          finishOrder: order,
          kimarite: kimariteFor(a),
          payouts: {
            win: { combination: `${a}`, payout: Math.round((market.win[`${a}`] ?? 1) * 100) },
            exacta: { combination: `${a}-${b}`, payout: Math.round((market.exacta[`${a}-${b}`] ?? 1) * 100) },
            trifecta: { combination: `${a}-${b}-${c}`, payout: Math.round((market.trifecta[`${a}-${b}-${c}`] ?? 1) * 100) },
          },
        };
      }

      races.push({
        id: raceId,
        date: day.date,
        venueId,
        raceNo,
        title: raceNo === 12 ? (day.finished ? '準優勝戦' : '選抜戦') : pick(RACE_TITLES),
        deadline,
        distance: 1800,
        status: day.finished ? 'finished' : 'scheduled',
        entries,
        exhibition,
        odds,
        result,
      });
    }
  }
}

const meta = {
  source: 'sample',
  isDemo: true,
  provider: 'BOAT ANALYZER 同梱サンプル（架空データ）',
  description: 'シード固定の乱数で生成した架空データです。実在の選手・レースとは関係ありません。',
  generatedAt: GENERATED_AT,
  updatedAt: {
    races: GENERATED_AT,
    exhibition: '2026-10-22T13:35:00+09:00',
    odds: '2026-10-22T09:00:00+09:00',
    results: '2026-10-21T21:00:00+09:00',
    historical: '2026-10-07T06:00:00+09:00',
  },
};

mkdirSync(OUT_DIR, { recursive: true });
const write = (name, data) => writeFileSync(join(OUT_DIR, name), JSON.stringify(data) + '\n');
write('meta.json', meta);
write('venues.json', VENUES);
write('races.json', races);
write('historical-races.json', historical);
console.log(`races: ${races.length}, historical: ${historical.length} -> ${OUT_DIR}`);
