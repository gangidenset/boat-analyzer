import type { Grade } from '../domain/types';

/** 艇番。色だけでなく数字を必ず表示する */
export function BoatBadge({ n, size = 'md' }: { n: number; size?: 'sm' | 'md' }) {
  return (
    <span className={`boat boat--${n} boat--${size}`} aria-label={`${n}号艇`}>
      {n}
    </span>
  );
}

export function GradeBadge({ grade }: { grade: Grade }) {
  return <span className={`grade grade--${grade.toLowerCase()}`}>{grade}</span>;
}

export function DemoBadge() {
  return (
    <span className="demo-badge" title="架空のサンプルデータです">
      デモデータ
    </span>
  );
}

/** 期待収益率の符号を記号と文字でも示す（色だけに頼らない） */
export function SignedRate({ value, text }: { value: number | null; text: string }) {
  if (value === null) return <span className="muted">{text}</span>;
  const cls = value > 0 ? 'pos' : value < 0 ? 'neg' : '';
  const mark = value > 0 ? '▲' : value < 0 ? '▼' : '±';
  return (
    <span className={cls}>
      <span aria-hidden="true">{mark} </span>
      {text}
    </span>
  );
}

/** 推定確率とオッズの乖離が大きい（モデル誤差の可能性が高い）候補の印 */
export function DivergenceMark({ warnings }: { warnings: readonly string[] }) {
  if (!warnings.includes('model_market_divergence')) return null;
  return (
    <span className="warn small" title="推定確率がオッズ逆算確率の2倍以上です。市場との乖離が大きく、モデルの誤差である可能性が高いため要検証です。">
      {' '}
      ⚠要検証
    </span>
  );
}
