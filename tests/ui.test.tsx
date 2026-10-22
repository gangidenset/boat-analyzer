import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../src/App';
import type { DataSource } from '../src/data/dataSource';
import { sampleDataSource } from '../src/data/sampleDataSource';
import { actualDataSource } from '../src/data/actualDataSource';
import { AppStateProvider } from '../src/state/AppState';

function renderAt(path: string, sources?: Record<'sample' | 'actual', DataSource>) {
  return render(
    <AppStateProvider sources={sources}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AppStateProvider>,
  );
}

const waitReady = () => waitFor(() => expect(screen.queryByText('データを読み込んでいます…')).not.toBeInTheDocument(), { timeout: 5000 });

describe('画面操作', () => {
  it('ダッシュボード：読み込み中→デモデータ表示・各セクション', async () => {
    renderAt('/');
    expect(screen.getByRole('status')).toHaveTextContent('読み込んでいます');
    await waitReady();
    expect(screen.getAllByText('デモデータ').length).toBeGreaterThan(0);
    for (const h of ['レース一覧', '注目レース', '期待値条件に合う候補', 'データ更新状況', '分析履歴']) {
      expect(screen.getByRole('heading', { name: h })).toBeInTheDocument();
    }
    expect(screen.getAllByText(/利益を保証するものではありません/).length).toBeGreaterThan(0);
  });

  it('レース一覧：競艇場・レース番号で絞り込み、出走表へ遷移', async () => {
    const user = userEvent.setup();
    renderAt('/races');
    await waitReady();
    expect(screen.getByText('該当 72 レース')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('開催日'), '2026-10-22');
    expect(screen.getByText('該当 36 レース')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('競艇場'), '24');
    await user.selectOptions(screen.getByLabelText('レース番号'), '3');
    expect(screen.getByText('該当 1 レース')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '条件をクリア' }));
    expect(screen.getByText('該当 72 レース')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('開催日'), '2026-10-22');
    await user.selectOptions(screen.getByLabelText('競艇場'), '24');
    await user.selectOptions(screen.getByLabelText('レース番号'), '3');
    await user.click(screen.getByRole('link', { name: /3R\s*大村/ }));
    expect(await screen.findByRole('heading', { name: '出走表' })).toBeInTheDocument();
    expect(screen.getAllByLabelText('1号艇').length).toBeGreaterThan(0);
  });

  it('レース一覧：条件に合わない場合は空データ表示', async () => {
    renderAt('/races?date=2026-10-21&venue=01');
    await waitReady();
    expect(screen.getByText('条件に合うレースがありません')).toBeInTheDocument();
  });

  it('展示情報：独自展示のない場は「データなし」、未発表レースはその旨を表示', async () => {
    const { unmount } = renderAt('/exhibition?race=2026-10-21_02_01');
    await waitReady();
    const table = screen.getByRole('table');
    expect(within(table).getAllByText('データなし').length).toBeGreaterThanOrEqual(18);
    expect(within(table).queryByText('0.00')).not.toBeInTheDocument();
    unmount();
    renderAt('/exhibition?race=2026-10-22_12_10');
    await waitReady();
    expect(screen.getByText('展示情報はまだ発表されていません')).toBeInTheDocument();
  });

  it('オッズ・期待値：入力検証、保存→分析履歴で照合', async () => {
    const user = userEvent.setup();
    renderAt('/odds?race=2026-10-21_12_01');
    await waitReady();
    expect(screen.getByText(/オッズ取得時刻/)).toBeInTheDocument();
    const minEv = screen.getByLabelText('期待収益率の下限（%）');
    await user.type(minEv, 'abc');
    expect(screen.getByRole('alert')).toHaveTextContent('期待収益率の下限は数値で入力してください');
    await user.clear(minEv);
    await user.type(minEv, '0');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const table = screen.getByTestId('candidate-table');
    const firstSave = within(table).getAllByRole('button', { name: '保存' })[0]!;
    await user.click(firstSave);
    expect(screen.getByText(/分析履歴に保存しました/)).toBeInTheDocument();

    await user.click(screen.getAllByRole('link', { name: /分析履歴/ })[0]!);
    await screen.findByRole('heading', { name: '分析履歴・振り返り' });
    const summary = screen.getByTestId('summary-sample');
    expect(summary).toHaveTextContent('記録数1件（確定 1／結果待ち 0）');
    expect(screen.getByRole('heading', { name: /モデル検証/ })).toBeInTheDocument();
  });

  it('オッズ・期待値：オッズ未発表レースでは期待値を計算しない', async () => {
    renderAt('/odds?race=2026-10-22_24_12');
    await waitReady();
    expect(screen.getByText('オッズが未発表です')).toBeInTheDocument();
  });

  it('オッズ・期待値：券種の切替で件数が変わる', async () => {
    const user = userEvent.setup();
    renderAt('/odds?race=2026-10-22_12_01');
    await waitReady();
    expect(screen.getByText(/該当 120 件/)).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: '単勝' }));
    expect(screen.getByText(/該当 126 件/)).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: '3連単' }));
    expect(screen.getByText(/該当 6 件/)).toBeInTheDocument();
  });

  it('競艇場別分析：条件で対象件数が変わる', async () => {
    const user = userEvent.setup();
    renderAt('/venues');
    await waitReady();
    const all = Number(screen.getByTestId('sample-races').textContent!.replace(/\D/g, ''));
    await user.selectOptions(screen.getByLabelText('競艇場'), '24');
    const venue = Number(screen.getByTestId('sample-races').textContent!.replace(/\D/g, ''));
    expect(venue).toBeGreaterThan(0);
    expect(venue).toBeLessThan(all);
    expect(screen.getByText(/対象期間/)).toBeInTheDocument();
  });

  it('設定：実データモードに切り替えると未設定エラーを表示し、戻せる', async () => {
    const user = userEvent.setup();
    renderAt('/settings');
    await waitReady();
    await user.click(screen.getByRole('radio', { name: '実データ' }));
    expect((await screen.findAllByText(/実データの取得元が未設定です/)).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('radio', { name: 'サンプルデータ（デモ）' }));
    await waitFor(() => expect(screen.getByText(/BOAT ANALYZER 同梱サンプル/)).toBeInTheDocument());
  });

  it('設定：候補条件の不正入力はエラー表示', async () => {
    const user = userEvent.setup();
    renderAt('/settings');
    await waitReady();
    const prob = screen.getByLabelText('候補：推定確率の下限（%）');
    await user.clear(prob);
    await user.type(prob, '150');
    await user.click(screen.getByRole('button', { name: '候補条件を保存' }));
    expect(screen.getByRole('alert')).toHaveTextContent('0〜100');
  });

  it('データ読み込み失敗時はエラー状態と再読み込みボタン', async () => {
    const broken: DataSource = {
      kind: 'sample',
      label: '壊れたデータ',
      load: async () => ({ ok: false, error: { kind: 'validation', message: 'データの検証に失敗しました', issues: ['races: 0.raceNo - 範囲外'] } }),
    };
    renderAt('/', { sample: broken, actual: actualDataSource });
    expect(await screen.findByRole('alert')).toHaveTextContent('races: 0.raceNo');
    expect(screen.getByRole('button', { name: '再読み込み' })).toBeInTheDocument();
  });

  it('存在しないレースは空データ表示', async () => {
    renderAt('/races/unknown', { sample: sampleDataSource, actual: actualDataSource });
    await waitReady();
    expect(screen.getByText('レースが見つかりません')).toBeInTheDocument();
  });
});
