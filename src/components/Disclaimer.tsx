export function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <aside className="disclaimer" role="note">
      <strong>注意：</strong>
      推定確率は未検証のデモモデルによる参考値で、精度は保証されません。期待収益率がプラスでも利益を保証するものではありません。
      「⚠要検証」は推定確率がオッズ逆算確率の2倍以上の候補で、利益機会よりモデル誤差の可能性が高いものです。
      {!compact && ' 舟券の購入は自己責任で、余裕資金の範囲で行ってください。'}
    </aside>
  );
}
