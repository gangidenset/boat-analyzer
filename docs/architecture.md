# アーキテクチャ・技術選定

## 1. 技術構成

| 区分 | 採用 | 採用理由 |
|---|---|---|
| 言語 | TypeScript（strict, `noUncheckedIndexedAccess`） | 型でバグを防げる。配列の範囲外アクセスもコンパイル時に検出できる |
| UI | React 19 | 利用者と学習資料が多く、初心者でも情報が見つけやすい。コンポーネントで画面を分けられる |
| ビルド | Vite | 設定がほとんど不要で起動が速い。JSONを別ファイル（チャンク）に分けて遅延読み込みできる |
| ルーティング | react-router-dom（HashRouter） | 画面遷移の定番。HashRouter はサーバ設定なしで静的配置でき、リロードしても404にならない |
| 検証 | zod | スキーマ1つから「実行時の検証」と「TypeScriptの型」の両方を作れる。型と検証が食い違わない |
| グラフ | 自前のSVG（`BarChart.tsx`） | 横棒グラフだけなら数十行で書ける。依存を増やさず、「データなし」の表示も自由にできる |
| スタイル | 素のCSS＋CSS変数 | 依存ゼロ。配色トークンを `:root` にまとめ、テーマを一か所で管理する |
| テスト | Vitest＋Testing Library＋jsdom | Vite と設定を共有できる。利用者の操作に近い形でUIをテストできる |
| 状態管理 | React Context＋localStorage | 規模が小さいので専用ライブラリは使わない |

実行時の依存は `react`、`react-dom`、`react-router-dom`、`zod` の4つだけです。

## 2. ディレクトリ構成

```
src/
  domain/       型とスキーマ（schemas.ts → types.ts で型生成）
  analytics/    計算ロジック（純粋関数・UI非依存・単体テスト対象）
    expectedValue.ts    期待値・確率／オッズの検証
    probabilityModel.ts 予測モデル（インターフェース＋2モデル）、Harville法
    evaluation.ts       モデル検証（Brier / 対数損失 / 本命1着率）
    candidates.ts       買い目候補の生成・絞り込み・並べ替え
    exhibition.ts       展示情報の集計（順位・平均・欠損）
    venueStats.ts       場・コース別の統計と条件フィルター
    history.ts          分析記録の照合と的中率・回収率
    raceFilters.ts      レース絞り込み
    insights.ts         注目レースの抽出
    combinations.ts     買い目の組み合わせと的中判定
  data/         データ取得層
    dataSource.ts       DataSource インターフェース
    sampleDataSource.ts 同梱サンプル（JSONを遅延読み込みし、zodで検証）
    actualDataSource.ts 実データ（未設定エラーを返すスタブ。通信しない）
    validate.ts         データセット全体の検証
    sample/*.json       サンプルデータ（scripts/generate-sample-data.mjs で生成）
  state/AppState.tsx    設定・データ読み込み・予測結果・分析記録
  components/           共通UI（レイアウト、状態表示、バッジ、グラフ等）
  pages/                画面A〜G
  utils/                表示フォーマット、localStorage ラッパー
tests/                  単体テスト・UI結合テスト
scripts/                サンプルデータ生成
```

## 3. データの流れ

```
DataSource.load() ──▶ validateDataset()（zod） ──▶ AppState（ready / error / loading）
                                                      │
                                                      ├─▶ PredictionModel.predictWin()  ─▶ 各レースの1着確率
                                                      │                                     │
pages/*  ◀── analytics/*（純粋関数）◀──────────────────┴─────────────────────────────────────┘
```

- **UIは計算をしない**：画面は `analytics/` の関数を呼んで結果を表示するだけ。計算はすべて単体テストで検証できる。
- **取得元の差し替え**：`DataSource` インターフェースを実装すれば実データに切り替えられ、画面側は変更不要。
- **エラーは Result 型**：計算・読み込みは例外を投げず `{ ok, value } | { ok: false, error }` を返す。画面は必ずエラー表示の分岐を持つ。
- **モデルの差し替え**：`PredictionModel` を実装して `MODELS` に追加すれば、画面とモデル検証にそのまま反映される。

## 4. 設計上の判断

- **HashRouter**：URLに `#/` が入るが、静的ファイルとして置くだけで動く（デプロイ先を選ばない）。
- **サンプルJSONの遅延読み込み**：レースと過去成績のJSON（計約750KB）は別チャンクにしており、初期表示に必要なJS本体を小さく保つ。
- **確率の連勝式展開に Harville 法**：1着確率だけで計算でき、モデルに依存しない。2着以下の確率を過大・過小評価する傾向は知られているので、[analytics-method.md](analytics-method.md) に限界として記載した。
- **バックエンドなし**：MVPは個人利用で外部通信もしないので、サーバは置かない。実データ連携でAPIキーが必要になったら、キーをブラウザに出さないために小さなサーバ（プロキシ）を追加する（README「実データ連携」参照）。

## 5. 既知の設計上の課題と対応案

| 課題 | 影響 | 対応案 |
|---|---|---|
| 予測モデルの係数が未検証 | 推定確率・期待値の信頼性が低い | 実データの過去成績を投入し、`evaluation.ts` でモデルを比較してから係数を推定する（ロジスティック回帰など）。検証が済むまで「未検証」表示は外さない |
| 推定確率と市場オッズの乖離 | 期待収益率が極端な値（+100%超）になり、誤解を招く | 「⚠要検証」の警告を表示済み。将来は市場確率と組み合わせて補正する（例：モデル確率と市場確率の加重平均） |
| 分析記録がブラウザ内だけに保存される | 端末間で共有できず、消えることがある | 必要になったらエクスポート／インポート、またはサーバ保存を追加する |
| 実データ取得が未実装 | 実レースでは使えない | [data-sources.md](data-sources.md) の手順で許諾を確認した提供元を決め、`actualDataSource.ts` を実装する |
