export interface BarDatum {
  label: string;
  value: number | null;
  /** 棒の右に出す表示文字列（未指定なら値） */
  display?: string;
  highlight?: boolean;
}

/**
 * 依存ライブラリなしの横棒グラフ（SVG）。
 * 値が null の項目は棒を描かず「データなし」と表示する。
 */
export function BarChart({
  data,
  max,
  title,
  invert = false,
}: {
  data: BarDatum[];
  max?: number;
  title: string;
  /** 小さいほど良い指標で、最小値を最も長く描く */
  invert?: boolean;
}) {
  const values = data.map((d) => d.value).filter((v): v is number => v !== null);
  const rowH = 26;
  const labelW = 64;
  const valueW = 76;
  const width = 360;
  const barW = width - labelW - valueW;
  const hi = max ?? (values.length ? Math.max(...values) : 1);
  const lo = values.length ? Math.min(...values) : 0;
  const length = (v: number) => {
    if (invert) {
      const span = hi - lo;
      // 最大値でも最小限の長さを残し、差を見やすくする
      return span > 0 ? 0.15 + (0.85 * (hi - v)) / span : 1;
    }
    return hi > 0 ? Math.max(0, v / hi) : 0;
  };
  return (
    <figure className="chart">
      <figcaption className="chart__title">{title}</figcaption>
      <svg viewBox={`0 0 ${width} ${data.length * rowH}`} role="img" aria-label={title} width="100%">
        {data.map((d, i) => {
          const y = i * rowH;
          return (
            <g key={d.label} transform={`translate(0 ${y})`}>
              <text x={0} y={rowH / 2 + 4} className="chart__label">
                {d.label}
              </text>
              <rect x={labelW} y={5} width={barW} height={rowH - 10} className="chart__track" rx={3} />
              {d.value !== null && (
                <rect
                  x={labelW}
                  y={5}
                  width={Math.max(2, barW * length(d.value))}
                  height={rowH - 10}
                  rx={3}
                  className={d.highlight ? 'chart__bar chart__bar--hi' : 'chart__bar'}
                />
              )}
              <text x={width} y={rowH / 2 + 4} textAnchor="end" className={d.value === null ? 'chart__value chart__value--na' : 'chart__value'}>
                {d.value === null ? 'データなし' : (d.display ?? String(d.value))}
                {d.highlight ? ' ★' : ''}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
