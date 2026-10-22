import { NavLink, Outlet } from 'react-router-dom';
import { useAppState } from '../state/AppState';
import { DemoBadge } from './Badges';

export const NAV_ITEMS = [
  { to: '/', label: 'ダッシュボード', short: 'ホーム', icon: '◧' },
  { to: '/races', label: 'レース一覧・出走表', short: 'レース', icon: '☰' },
  { to: '/exhibition', label: '展示情報比較', short: '展示', icon: '⏱' },
  { to: '/venues', label: '競艇場別分析', short: '場別', icon: '⚑' },
  { to: '/odds', label: 'オッズ・期待値', short: '期待値', icon: '％' },
  { to: '/history', label: '分析履歴', short: '履歴', icon: '↺' },
  { to: '/settings', label: '設定・データ管理', short: '設定', icon: '⚙' },
] as const;

export function Layout() {
  const { data, settings } = useAppState();
  const isDemo = data.status === 'ready' ? data.dataset.meta.isDemo : settings.dataMode === 'sample';
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        本文へスキップ
      </a>
      <aside className="sidebar" aria-label="メインメニュー">
        <div className="brand">
          <span className="brand__logo" aria-hidden="true">
            ⛵
          </span>
          <span className="brand__name">BOAT ANALYZER</span>
        </div>
        <nav>
          <ul className="nav">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.to === '/'} className={({ isActive }) => (isActive ? 'nav__link is-active' : 'nav__link')}>
                  <span className="nav__icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="nav__label">{item.label}</span>
                  <span className="nav__short">{item.short}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar__foot">
          <span className="muted">データ：{settings.dataMode === 'sample' ? 'サンプル' : '実データ'}</span>
          {isDemo && <DemoBadge />}
        </div>
      </aside>
      <div className="main-col">
        <header className="topbar">
          <span className="topbar__brand">BOAT ANALYZER</span>
          {isDemo && <DemoBadge />}
        </header>
        {isDemo && (
          <div className="demo-banner" role="note">
            <DemoBadge /> 表示中のデータはすべて架空のサンプルです。実在の選手・レース・オッズではありません。
          </div>
        )}
        <main id="main" className="content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
