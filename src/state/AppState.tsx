import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { z } from 'zod';
import { getModel, type ModelError, type WinProbabilityEstimate } from '../analytics/probabilityModel';
import { actualDataSource } from '../data/actualDataSource';
import type { DataLoadError, DataSource } from '../data/dataSource';
import { sampleDataSource } from '../data/sampleDataSource';
import { analysisRecordListSchema, dataSourceKindSchema } from '../domain/schemas';
import type { AnalysisRecord, Dataset, DataSourceKind, Result } from '../domain/types';
import { loadJson, saveJson } from '../utils/storage';

// ---- 設定 ----
export const settingsSchema = z.object({
  dataMode: dataSourceKindSchema,
  modelId: z.string(),
  /** ダッシュボードで候補とみなす期待収益率の下限（0.1 = +10%） */
  minExpectedReturnRate: z.number().min(-1).max(100),
  /** 候補とみなす推定確率の下限 */
  minProbability: z.number().min(0).max(1),
  /** 分析記録1件あたりの想定購入額（円、100円単位） */
  stake: z.number().int().min(100).max(100000),
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  dataMode: 'sample',
  modelId: 'demo-composite',
  minExpectedReturnRate: 0.1,
  minProbability: 0.01,
  stake: 100,
};

const SETTINGS_KEY = 'boat-analyzer:settings:v1';
const RECORDS_KEY = 'boat-analyzer:records:v1';

export type DataState =
  | { status: 'loading' }
  | { status: 'error'; error: DataLoadError }
  | { status: 'ready'; dataset: Dataset };

export interface LoadLogEntry {
  at: string;
  source: DataSourceKind;
  ok: boolean;
  message: string;
}

export type Prediction = Result<WinProbabilityEstimate, ModelError>;

interface AppStateValue {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  data: DataState;
  reload: () => void;
  loadLog: LoadLogEntry[];
  /** 現在のモデルによるレース別1着確率（データ読み込み後に計算） */
  predictions: Map<string, Prediction>;
  records: AnalysisRecord[];
  addRecord: (r: Omit<AnalysisRecord, 'id' | 'createdAt' | 'source' | 'stake'>) => void;
  removeRecord: (id: string) => void;
  clearRecords: (source?: DataSourceKind) => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

const SOURCES: Record<DataSourceKind, DataSource> = { sample: sampleDataSource, actual: actualDataSource };

/** 日本時間のISO文字列（+09:00） */
export function nowIso(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().replace(/\.\d{3}Z$/, '+09:00');
}

export function AppStateProvider({ children, sources = SOURCES }: { children: ReactNode; sources?: Record<DataSourceKind, DataSource> }) {
  const [settings, setSettings] = useState<Settings>(() => loadJson(SETTINGS_KEY, settingsSchema, DEFAULT_SETTINGS));
  const [data, setData] = useState<DataState>({ status: 'loading' });
  const [loadLog, setLoadLog] = useState<LoadLogEntry[]>([]);
  const [reloadToken, setReloadToken] = useState(0);
  const [records, setRecords] = useState<AnalysisRecord[]>(() => loadJson(RECORDS_KEY, analysisRecordListSchema, []));

  useEffect(() => {
    saveJson(SETTINGS_KEY, settings);
  }, [settings]);
  useEffect(() => {
    saveJson(RECORDS_KEY, records);
  }, [records]);

  useEffect(() => {
    let cancelled = false;
    setData({ status: 'loading' });
    const source = sources[settings.dataMode];
    source.load().then((res) => {
      if (cancelled) return;
      setData(res.ok ? { status: 'ready', dataset: res.value } : { status: 'error', error: res.error });
      setLoadLog((log) =>
        [
          {
            at: nowIso(),
            source: source.kind,
            ok: res.ok,
            message: res.ok ? `${source.label}を読み込みました（${res.value.races.length}レース）` : res.error.message,
          },
          ...log,
        ].slice(0, 20),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [settings.dataMode, reloadToken, sources]);

  const predictions = useMemo(() => {
    const map = new Map<string, Prediction>();
    if (data.status !== 'ready') return map;
    const model = getModel(settings.modelId);
    const ctx = { historicalRaces: data.dataset.historicalRaces };
    for (const race of data.dataset.races) map.set(race.id, model.predictWin(race, ctx));
    return map;
  }, [data, settings.modelId]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = settingsSchema.safeParse({ ...s, ...patch });
      return next.success ? next.data : s;
    });
  }, []);

  const addRecord = useCallback<AppStateValue['addRecord']>(
    (r) => {
      setRecords((list) => [
        {
          ...r,
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt: nowIso(),
          source: settings.dataMode,
          stake: settings.stake,
        },
        ...list,
      ]);
    },
    [settings.dataMode, settings.stake],
  );

  const value: AppStateValue = {
    settings,
    updateSettings,
    data,
    reload: () => setReloadToken((t) => t + 1),
    loadLog,
    predictions,
    records,
    addRecord,
    removeRecord: (id) => setRecords((list) => list.filter((r) => r.id !== id)),
    clearRecords: (source) => setRecords((list) => (source ? list.filter((r) => r.source !== source) : [])),
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const v = useContext(AppStateContext);
  if (!v) throw new Error('useAppState は AppStateProvider の内側で使用してください');
  return v;
}
