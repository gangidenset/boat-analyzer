import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { z } from 'zod';
import { mergeHistorical } from '../analytics/courseRates';
import {
  BUILTIN_MODELS,
  createModelContext,
  findModel,
  type ModelContext,
  type ModelError,
  type PredictionModel,
  type WinProbabilityEstimate,
} from '../analytics/probabilityModel';
import { trainedModelFromReport, trainingReportSchema, trainModel, type TrainingReport, type TrainingResult } from '../analytics/training';
import { actualDataSource } from '../data/actualDataSource';
import type { DataLoadError, DataSource } from '../data/dataSource';
import { indexedDbImportedStore, mergeImported, type ImportedStore } from '../data/importedStore';
import { parseOfficialFiles } from '../data/official/importFiles';
import { sampleDataSource } from '../data/sampleDataSource';
import { analysisRecordListSchema, dataSourceKindSchema } from '../domain/schemas';
import type { AnalysisRecord, Dataset, DataSourceKind, HistoricalRace, Result } from '../domain/types';
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
const trainingKey = (source: DataSourceKind) => `boat-analyzer:training:v1:${source}`;

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

export interface ImportOutcome {
  files: number;
  schedules: number;
  results: number;
  issues: string[];
}

interface AppStateValue {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  data: DataState;
  reload: () => void;
  loadLog: LoadLogEntry[];
  /** 選べるモデル（同梱モデル＋学習済みモデル） */
  models: PredictionModel[];
  /** 現在選択中のモデル */
  model: PredictionModel;
  /** 過去レース＋確定レース（重複なし）。場別統計とモデルの基礎データ */
  historicalAll: HistoricalRace[];
  modelContext: ModelContext | null;
  /** 現在のモデルによるレース別1着確率（データ読み込み後に計算） */
  predictions: Map<string, Prediction>;
  trainingReport: TrainingReport | null;
  runTraining: () => TrainingResult | null;
  clearTraining: () => void;
  records: AnalysisRecord[];
  addRecord: (r: Omit<AnalysisRecord, 'id' | 'createdAt' | 'source' | 'stake'>) => void;
  removeRecord: (id: string) => void;
  clearRecords: (source?: DataSourceKind) => void;
  /** 書き出した記録の読み込み。同じIDは上書きしない。追加件数を返す */
  importRecords: (list: AnalysisRecord[]) => number;
  importOfficialFiles: (files: { name: string; bytes: Uint8Array }[]) => Promise<ImportOutcome>;
  clearImported: () => Promise<void>;
}

const AppStateContext = createContext<AppStateValue | null>(null);

const SOURCES: Record<DataSourceKind, DataSource> = { sample: sampleDataSource, actual: actualDataSource };

/** 日本時間のISO文字列（+09:00） */
export function nowIso(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().replace(/\.\d{3}Z$/, '+09:00');
}

/** 既存の記録に、IDが重複しないものだけを追加する */
export function mergeRecords(current: readonly AnalysisRecord[], incoming: readonly AnalysisRecord[]): AnalysisRecord[] {
  const ids = new Set(current.map((r) => r.id));
  return [...current, ...incoming.filter((r) => !ids.has(r.id))].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function AppStateProvider({
  children,
  sources = SOURCES,
  importedStore = indexedDbImportedStore,
}: {
  children: ReactNode;
  sources?: Record<DataSourceKind, DataSource>;
  importedStore?: ImportedStore;
}) {
  const [settings, setSettings] = useState<Settings>(() => loadJson(SETTINGS_KEY, settingsSchema, DEFAULT_SETTINGS));
  const [data, setData] = useState<DataState>({ status: 'loading' });
  const [loadLog, setLoadLog] = useState<LoadLogEntry[]>([]);
  const [reloadToken, setReloadToken] = useState(0);
  const [records, setRecords] = useState<AnalysisRecord[]>(() => loadJson(RECORDS_KEY, analysisRecordListSchema, []));
  const [reports, setReports] = useState<Record<DataSourceKind, TrainingReport | null>>(() => ({
    sample: loadJson(trainingKey('sample'), trainingReportSchema.nullable(), null),
    actual: loadJson(trainingKey('actual'), trainingReportSchema.nullable(), null),
  }));

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

  const trainingReport = reports[settings.dataMode];
  const models = useMemo(
    () => (trainingReport ? [trainedModelFromReport(trainingReport), ...BUILTIN_MODELS] : [...BUILTIN_MODELS]),
    [trainingReport],
  );
  const model = findModel(models, settings.modelId);

  const historicalAll = useMemo(
    () => (data.status === 'ready' ? mergeHistorical(data.dataset.historicalRaces, data.dataset.races) : []),
    [data],
  );
  const modelContext = useMemo(() => (data.status === 'ready' ? createModelContext(historicalAll) : null), [data, historicalAll]);

  const predictions = useMemo(() => {
    const map = new Map<string, Prediction>();
    if (data.status !== 'ready' || !modelContext) return map;
    for (const race of data.dataset.races) map.set(race.id, model.predictWin(race, modelContext));
    return map;
  }, [data, model, modelContext]);

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

  const runTraining = (): TrainingResult | null => {
    if (data.status !== 'ready' || !modelContext) return null;
    const result = trainModel(data.dataset.races, modelContext, {
      dataSource: settings.dataMode,
      isDemoData: data.dataset.meta.isDemo,
      trainedAt: nowIso(),
    });
    if (result.ok) {
      saveJson(trainingKey(settings.dataMode), result.report);
      setReports((r) => ({ ...r, [settings.dataMode]: result.report }));
    }
    return result;
  };

  const clearTraining = () => {
    saveJson(trainingKey(settings.dataMode), null);
    setReports((r) => ({ ...r, [settings.dataMode]: null }));
    if (settings.modelId === 'trained') updateSettings({ modelId: DEFAULT_SETTINGS.modelId });
  };

  const importOfficialFiles = async (files: { name: string; bytes: Uint8Array }[]): Promise<ImportOutcome> => {
    const parsed = parseOfficialFiles(files, nowIso());
    if (parsed.data.files.length > 0) {
      const prev = await importedStore.load().catch(() => null);
      await importedStore.save(mergeImported(prev, parsed.data));
      if (settings.dataMode === 'actual') setReloadToken((t) => t + 1);
    }
    return {
      files: parsed.data.files.length,
      schedules: parsed.data.schedules.length,
      results: parsed.data.results.length,
      issues: parsed.issues,
    };
  };

  const value: AppStateValue = {
    settings,
    updateSettings,
    data,
    reload: () => setReloadToken((t) => t + 1),
    loadLog,
    models,
    model,
    historicalAll,
    modelContext,
    predictions,
    trainingReport,
    runTraining,
    clearTraining,
    records,
    addRecord,
    removeRecord: (id) => setRecords((list) => list.filter((r) => r.id !== id)),
    clearRecords: (source) => setRecords((list) => (source ? list.filter((r) => r.source !== source) : [])),
    importRecords: (list) => {
      const added = list.filter((r) => !records.some((x) => x.id === r.id)).length;
      setRecords((cur) => mergeRecords(cur, list));
      return added;
    },
    importOfficialFiles,
    clearImported: async () => {
      await importedStore.clear();
      if (settings.dataMode === 'actual') setReloadToken((t) => t + 1);
    },
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const v = useContext(AppStateContext);
  if (!v) throw new Error('useAppState は AppStateProvider の内側で使用してください');
  return v;
}
