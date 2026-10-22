# データモデル

すべての型は `src/domain/schemas.ts` の zod スキーマで定義しています。TypeScript の型（`src/domain/types.ts`）はそのスキーマから自動で生成されます。**欠損値は `null` で表し、0では埋めません。**

## Dataset（読み込み単位）
| 項目 | 型 | 説明 |
|---|---|---|
| meta | DatasetMeta | 取得元・デモかどうか・更新時刻 |
| venues | Venue[] | 競艇場マスタ |
| races | Race[] | 開催レース（出走表・展示・オッズ・結果） |
| historicalRaces | HistoricalRace[] | 過去レース（場別統計とモデルの基礎データ） |

## DatasetMeta
| 項目 | 型 | 説明 |
|---|---|---|
| source | `'sample' \| 'actual'` | サンプルか実データか |
| isDemo | boolean | true のとき画面に「デモデータ」を表示 |
| provider / description | string | 取得元の名前と説明 |
| generatedAt | ISO8601 | 生成日時 |
| updatedAt.{races,exhibition,odds,results,historical} | ISO8601 \| null | データ種別ごとの最終更新（null＝未取得） |

## Venue
`id`（場コード "01"〜"24"）、`name`、`hasOriginalExhibition`（直線・回り足・周回展示のデータを提供しているか）

## Race
| 項目 | 型 | 説明 |
|---|---|---|
| id | string | `YYYY-MM-DD_場コード_R番号`（例 `2026-10-22_12_05`） |
| date / venueId / raceNo | | 開催日、場、1〜12R |
| title / deadline / distance | | レース名、締切（HH:MM）、距離(m) |
| status | `'scheduled' \| 'finished' \| 'cancelled'` | 発走前／確定／中止 |
| entries | Entry[6] | 出走表（艇番1〜6が揃っていることを検証する） |
| exhibition | Exhibition \| null | null＝展示が未発表 |
| odds | Odds \| null | null＝オッズが未発表 |
| result | RaceResult \| null | null＝結果が未確定 |

### Entry
`boatNumber`、`status`（`entered` / `absent`＝欠場）、`racer`（登録番号、氏名、級別 A1/A2/B1/B2、支部、年齢、体重、全国勝率、当地勝率、平均ST。数値は null になることがある）、`motor` / `boat`（番号、2連率% \| null）、`flyingCount`、`lateCount`

### Exhibition
`publishedAt`、`weather`、`windSpeed`(m)、`windDirection`、`waveHeight`(cm)、`entries[6]`：
`exhibitionTime`（展示タイム）、`straightTime`（直線）、`turnTime`（回り足）、`lapTime`（周回展示）、`startTiming`（展示ST）、`startCourse`（進入）、`tilt`、`partsChanged[]`。計測値はいずれも `number | null`。

### Odds
`fetchedAt`（取得時刻）、`win` / `exacta` / `trifecta`：買い目キー（`"1"`、`"1-2"`、`"1-2-3"`）→ オッズ（倍）\| null。null は発売なしや欠場を表す。**オッズは的中時の総払戻倍率**（100円に対する払戻 ÷ 100）。

### RaceResult
`finishOrder`（着順の艇番配列）、`kimarite`、`payouts.{win,exacta,trifecta}`：`{ combination, payout(円/100円) } | null`

## HistoricalRace（過去レース・軽量形式）
`date`、`venueId`、`raceNo`、`weather`、`windSpeed`、`waveHeight`、`kimarite`、`rows[6]`：`{ course, boatNumber, rank | null }`（rank が null＝失格・欠場など。統計の出走数から除外する）

## AnalysisRecord（利用者が保存する分析記録・localStorage）
| 項目 | 説明 |
|---|---|
| id / createdAt | 識別子・保存日時 |
| source | 保存したときのデータモード。**サンプルと実績を区別して集計するためのキー** |
| raceId / raceLabel | 対象レース |
| modelId | 使ったモデル |
| betType / combination | 券種と買い目 |
| odds / oddsFetchedAt | 保存時のオッズと取得時刻 |
| probability / expectedReturnRate | 保存時の推定確率と期待収益率 |
| stake | 想定購入額（円） |

## localStorage のキー
- `boat-analyzer:settings:v1`：設定（データモード、モデル、候補条件、購入額）
- `boat-analyzer:records:v1`：分析記録

読み込むときに zod で検証し、壊れていれば既定値に戻します。

## サンプルデータ
`npm run generate:sample` で `src/data/sample/` に生成します（乱数のシードは固定なので、何度実行しても同じ内容になります）。
- 開催レース 72件：2026-10-21（戸田・住之江・大村、全レース確定）、2026-10-22（桐生・住之江・大村、発走前）
- 過去レース約1,100件：2026-09-21〜10-20、6場
- 動作確認用のケース：欠場（10/22 住之江5R 6号艇）、展示未発表（10/22 の9R以降）、オッズ未発表（10/22 大村12R）、独自展示のない場（戸田）、計測値の一部欠損
- 選手名・登録番号（`D9xxx`）・成績・オッズ・結果はすべて架空です。場名と場コードは公開されている名称を使っていますが、場ごとの特性値は架空です。
