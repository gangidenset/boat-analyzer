import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { EmptyState } from './components/StateViews';
import { DashboardPage } from './pages/DashboardPage';
import { ExhibitionPage } from './pages/ExhibitionPage';
import { HistoryPage } from './pages/HistoryPage';
import { OddsPage } from './pages/OddsPage';
import { RaceDetailPage } from './pages/RaceDetailPage';
import { RacesPage } from './pages/RacesPage';
import { SettingsPage } from './pages/SettingsPage';
import { VenuesPage } from './pages/VenuesPage';
import { AppStateProvider } from './state/AppState';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="races" element={<RacesPage />} />
        <Route path="races/:raceId" element={<RaceDetailPage />} />
        <Route path="exhibition" element={<ExhibitionPage />} />
        <Route path="venues" element={<VenuesPage />} />
        <Route path="odds" element={<OddsPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<EmptyState title="ページが見つかりません" />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <AppStateProvider>
      {/* HashRouter: 静的ファイルとして配置してもリロードで404にならない */}
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </AppStateProvider>
  );
}
