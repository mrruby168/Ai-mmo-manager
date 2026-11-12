import type {
  AiMode,
  ClaimStatus,
  CostType,
  MilestoneKind,
  NewsKind,
  ProjectCategory,
  ProjectOrigin,
  ProjectStatus,
  ProviderType,
  RewardKind,
  RiskLevel,
  VerificationState,
  WebSearchProvider
} from './constants'

export interface SocialLinks {
  x?: string
  discord?: string
  telegram?: string
  other?: string[]
}

export interface Project {
  id: string
  category: ProjectCategory
  name: string
  nameKey: string
  domainKey: string | null
  website: string | null
  socials: SocialLinks
  taskSummary: string
  howToJoin: string
  startDate: string | null
  endDate: string | null
  costType: CostType
  costAmountUsd: number | null
  status: ProjectStatus
  verification: VerificationState
  sources: string[]
  logoPath: string | null
  notes: string
  origin: ProjectOrigin
  rowVersion: number
  createdAt: string
  updatedAt: string
}

export interface ProjectInput {
  category: ProjectCategory
  name: string
  website?: string | null
  socials?: SocialLinks
  taskSummary?: string
  howToJoin?: string
  startDate?: string | null
  endDate?: string | null
  costType?: CostType
  costAmountUsd?: number | null
  status?: ProjectStatus
  verification?: VerificationState
  sources?: string[]
  notes?: string
}

export interface RevenueEntry {
  id: number
  projectId: string | null
  projectNameSnapshot: string
  rewardKind: RewardKind
  rewardSymbol: string
  estimatedAmount: number | null
  estimatedUsd: number | null
  receivedAmount: number | null
  receivedUsd: number | null
  receivedAt: string | null
  claimStatus: ClaimStatus
  participationCostUsd: number
  txFeeUsd: number
  txHash: string | null
  evidenceNote: string | null
  evidenceFile: string | null
  note: string
  createdAt: string
  updatedAt: string
}

export interface RevenueEntryInput {
  projectId: string | null
  projectNameSnapshot: string
  rewardKind: RewardKind
  rewardSymbol: string
  estimatedAmount?: number | null
  estimatedUsd?: number | null
  receivedAmount?: number | null
  receivedUsd?: number | null
  receivedAt?: string | null
  claimStatus?: ClaimStatus
  participationCostUsd?: number
  txFeeUsd?: number
  txHash?: string | null
  evidenceNote?: string | null
  evidenceFile?: string | null
  note?: string
}

export interface NewsItem {
  id: number
  projectId: string
  kind: NewsKind
  summary: string
  verification: VerificationState
  sourceUrl: string
  sourceName: string | null
  publishedAt: string
  fetchedAt: string
  todoDeadline: string | null
  isDone: boolean
  dedupeHash: string
  milestoneKind: MilestoneKind | null
  milestoneDate: string | null
}

export interface DeadlineItem {
  projectId: string
  projectName: string
  category: ProjectCategory
  date: string
  kind: MilestoneKind
  verification: VerificationState
  daysRemaining: number
  logoPath: string | null
  /** `news_items.id` when the milestone came from a news row, null for `projects.end_date`. */
  newsId?: number | null
}

export interface ScanItem {
  name: string
  category: ProjectCategory | 'insufficient'
  website: string | null
  summary: string
  taskSummary: string
  howToJoin: string
  startDate: string | null
  endDate: string | null
  costType: CostType
  costAmountUsd: number | null
  riskLevel: RiskLevel
  riskReason: string | null
  potential: string | null
  verification: VerificationState
  sources: string[]
  duplicateOf: string | null
}

export interface ScanLatest {
  items: ScanItem[]
  createdAt: string
}

export interface ProviderModel {
  id: string
  label: string
  supportsWebSearch: boolean
  supportsTools: boolean
  costTier: 'free' | 'paid'
}

export interface ProviderConfig {
  id: string
  type: ProviderType
  name: string
  baseUrl: string | null
  models: ProviderModel[]
}

export interface ModelSelection {
  providerId: string
  modelId: string
}

/** FIX 2: each AI tab keeps its own model, independent from Chat. */
export type AiTask = 'news' | 'scan'

/** Ba tác vụ có chuỗi model riêng (A1 → A2 → A3). */
export type ModelTask = AiTask | 'chat'

/** Chuỗi 0–3 model, không trùng, thứ tự = A1, A2, A3. */
export type ModelChain = ModelSelection[]

export interface TaskModels {
  news: ModelChain
  scan: ModelChain
  chat: ModelChain
}

/** FIX 2: TTL cache của Check News do người dùng chọn (1 phút để test, 3 giờ / 8 giờ production). */
export const NEWS_CACHE_TTL_OPTIONS_MS = [60_000, 3 * 3_600_000, 8 * 3_600_000] as const
export const DEFAULT_NEWS_CACHE_TTL_MS = 3 * 3_600_000

export interface AiSettings {
  providers: ProviderConfig[]
  /** Chat Box selection, also A1 of the Chat chain. */
  lastSelection: ModelSelection | null
  newsSelection: ModelSelection | null
  scanSelection: ModelSelection | null
  /** FIX 2: chuỗi model dự phòng theo tác vụ. */
  taskModels: TaskModels
  /** FIX 2: TTL cache Check News, một trong NEWS_CACHE_TTL_OPTIONS_MS. */
  newsCacheTtlMs: number
}

export interface AppearanceSettings {
  fontFamily: string
  fontSize: number
  fontWeight: number
}

/** D2: cấu hình Web Search của app (API key nằm trong secretStore, không ở đây). */
export interface WebSearchSettings {
  provider: WebSearchProvider
  /** Chỉ dùng cho SearXNG; null với provider khác. */
  baseUrl: string | null
}

export interface WebSearchView extends WebSearchSettings {
  hasApiKey: boolean
}

export interface WebSearchTestResult {
  ok: boolean
  message: string
  resultCount: number
}

export interface AppSettings {
  schemaVersion: 1
  dataPath: string
  appearance: AppearanceSettings
  ai: AiSettings
  aiMode: AiMode
  webSearch: WebSearchSettings
}

export type LockOwner = 'none' | 'ai'

/** Ba kênh AI độc lập: Check News, Scan Project và Chat. */
export type AiChannel = 'news' | 'scan' | 'chat'

export interface LockTask {
  taskId: string
  /** null = tác vụ cũ không khai báo kênh (xung đột với mọi tác vụ). */
  channel: AiChannel | null
  label: string
  startedAt: string
}

export interface LockState {
  owner: LockOwner
  taskId: string | null
  label: string | null
  startedAt: string | null
  userEditing: boolean
  /** Danh sách tác vụ đang chạy; tùy chọn để không phá vỡ payload cũ. */
  tasks?: LockTask[]
}

export interface AiProgress {
  taskId: string
  /** FIX 3: kênh của tiến trình, để trang News/Scan chỉ nghe đúng kênh mình. */
  channel?: AiChannel
  step: string
  done: number
  total: number
  message: string
}

/** FIX 3: một dòng Activity Log của News/Scan/Chat (không lưu qua lần khởi động lại). */
export type AiLogLevel = 'online' | 'step' | 'success' | 'warn' | 'error'

export interface AiLogEntry {
  id: string
  channel: AiChannel
  /** ISO timestamp. */
  at: string
  level: AiLogLevel
  text: string
}

export interface AiLogProgress {
  done: number
  total: number
  running: boolean
}

export interface AiLogSnapshot {
  entries: AiLogEntry[]
  progress: AiLogProgress
}

export interface AiLogEvent {
  channel: AiChannel
  /** Tác vụ mới bắt đầu: renderer xóa log cũ trước khi thêm `entry`. */
  reset: boolean
  entry: AiLogEntry | null
  progress: AiLogProgress
}

export interface IpcError {
  code: string
  message: string
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError }

export interface ProjectImportSummaryItem {
  name: string
  project: Project | null
  duplicateOf: string | null
  warning?: string | null
  error: string | null
}

export interface ProjectImportSummary {
  results: ProjectImportSummaryItem[]
  addedCount: number
  duplicateCount: number
  failedCount: number
}

export interface LogoUpdateResult {
  project: Project
  logoUpdated: boolean
  message: string
}

export interface ExportResult {
  canceled: boolean
  filePath: string | null
  format: 'json' | 'txt'
  count: number
}

export interface ProviderView extends ProviderConfig {
  hasApiKey: boolean
}

export interface ProviderTestResult {
  ok: boolean
  message: string
  supportsTools: boolean
  supportsWebSearch: boolean
  /** Result of the real search probe; absent on old cached results. */
  webSearchProbe?: 'off' | 'used' | 'not_detected'
}

export interface NewsSnapshot {
  important: NewsItem[]
  todos: NewsItem[]
  lastCheckedAt: string | null
}

/** FIX 1: payload typed by hand in No AI Mode. */
export interface NewsManualInput {
  projectId: string
  kind: NewsKind
  summary: string
  verification: VerificationState
  sourceUrl: string | null
  sourceName: string | null
  /** Published date, milestone date or todo deadline depending on `kind`/`milestoneKind`. */
  date: string
  milestoneKind: MilestoneKind | null
}

export interface NewsPromptResult {
  prompt: string
  projectCount: number
}

export type NewsImportRejectReason =
  | 'invalid_json'
  | 'invalid_schema'
  | 'unknown_project'
  | 'out_of_window'
  | 'duplicate'

export interface NewsImportRejectionSummary {
  reason: NewsImportRejectReason
  count: number
}

export interface NewsImportPreview {
  canceled: boolean
  token: string | null
  fileName: string | null
  total: number
  validCount: number
  rejections: NewsImportRejectionSummary[]
}

export interface NewsImportResult {
  added: number
  rejected: number
  message: string
}

export interface PendingAction {
  id: string
  type: 'add' | 'update' | 'delete'
  summary: string
  details: string[]
  before: string | null
  after: string | null
}

export interface ChatChoice {
  id: string
  label: string
}

export interface ChatReply {
  message: string
  pendingAction: PendingAction | null
  choices: ChatChoice[]
}

export type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'

export interface UpdateState {
  phase: UpdatePhase
  currentVersion: string
  latestVersion?: string
  percent?: number
  message?: string
  releaseUrl?: string
  portable?: boolean
  dataInsideInstallDir: boolean | null
}

export interface RendererApi {
  projects: {
    list(category?: ProjectCategory): Promise<IpcResult<Project[]>>
    get(id: string): Promise<IpcResult<Project | null>>
    create(input: unknown): Promise<IpcResult<Project>>
    update(id: string, input: unknown, expectedRowVersion?: number): Promise<IpcResult<Project>>
    remove(id: string): Promise<IpcResult<{ id: string }>>
    setLogo(payload: { id: string; sourcePath?: string; autoFetch?: boolean }): Promise<IpcResult<LogoUpdateResult>>
    importJson(payload: { json?: string; filePath?: string; pickFile?: boolean }): Promise<IpcResult<ProjectImportSummary & { canceled: boolean }>>
    export(payload: { format: 'json' | 'txt'; chooseLocation?: boolean }): Promise<IpcResult<ExportResult>>
  }
  revenue: {
    list(projectId?: string): Promise<IpcResult<RevenueEntry[]>>
    get(id: number): Promise<IpcResult<RevenueEntry | null>>
    summary(): Promise<IpcResult<import('./revenue-calc').RevenueTotals>>
    save(input: unknown, id?: number): Promise<IpcResult<RevenueEntry>>
    remove(id: number): Promise<IpcResult<{ id: number }>>
    attachEvidence(payload: { revenueId: number }): Promise<IpcResult<{ fileName: string | null }>>
  }
  news: {
    list(): Promise<IpcResult<NewsSnapshot>>
    deadlines(): Promise<IpcResult<DeadlineItem[]>>
    toggleTodo(id: number, isDone: boolean): Promise<IpcResult<{ id: number; isDone: boolean }>>
    check(): Promise<IpcResult<{ added: number; rejected: number; message: string }>>
    buildPrompt(): Promise<IpcResult<NewsPromptResult>>
    importPreview(): Promise<IpcResult<NewsImportPreview>>
    importConfirm(token: string): Promise<IpcResult<NewsImportResult>>
    create(input: unknown): Promise<IpcResult<NewsItem>>
    update(id: number, input: unknown): Promise<IpcResult<NewsItem>>
    remove(id: number): Promise<IpcResult<{ id: number }>>
  }
  scan: {
    start(payload: { text: string; fileName?: string }): Promise<IpcResult<{ items: ScanItem[]; rejected: number; message: string }>>
    submit(names: string[]): Promise<IpcResult<ProjectImportSummary>>
    latest(): Promise<IpcResult<ScanLatest | null>>
    cancel(): Promise<IpcResult<{ canceled: boolean }>>
  }
  chat: {
    send(payload: {
      text: string
      providerId: string
      modelId: string
      /** FIX 4: tệp văn bản đính kèm (≤ 1 MB), chỉ gửi một tệp mỗi tin nhắn. */
      attachment?: { name: string; text: string }
    }): Promise<IpcResult<ChatReply>>
    choose(choiceId: string): Promise<IpcResult<ChatReply>>
    newSession(): Promise<IpcResult<{ ok: boolean }>>
    confirm(actionId: string): Promise<IpcResult<{ message: string; ok: boolean }>>
    cancelAction(actionId: string): Promise<IpcResult<{ canceled: boolean }>>
    cancelTask(channel?: AiChannel): Promise<IpcResult<{ canceled: boolean }>>
  }
  ai: {
    /** FIX 3: lấy lại Activity Log + tiến trình của một kênh khi mở/chuyển tab. */
    getLog(channel: AiChannel): Promise<IpcResult<AiLogSnapshot>>
  }
  settings: {
    get(): Promise<IpcResult<AppSettings>>
    setAppearance(appearance: AppearanceSettings): Promise<IpcResult<AppSettings>>
    setLastSelection(selection: ModelSelection): Promise<IpcResult<AppSettings>>
    setTaskSelection(task: AiTask, selection: ModelSelection | null): Promise<IpcResult<AppSettings>>
    setModelConfig(input: {
      task: ModelTask
      chain: ModelChain
      newsCacheTtlMs?: number
    }): Promise<IpcResult<AppSettings>>
    setAiMode(aiMode: AiMode): Promise<IpcResult<AppSettings>>
    setDataPath(payload: { path: string; copyExisting: boolean }): Promise<IpcResult<AppSettings>>
    chooseDataPath(): Promise<IpcResult<{ canceled: boolean; path: string | null }>>
    openDataFolder(): Promise<IpcResult<{ opened: boolean }>>
    providers(): Promise<IpcResult<ProviderView[]>>
    saveProvider(input: unknown): Promise<IpcResult<ProviderView[]>>
    deleteProvider(id: string): Promise<IpcResult<ProviderView[]>>
    parseProviderJson(json: string): Promise<IpcResult<{ providers: ProviderConfig[]; errors: string[] }>>
    testProvider(payload: { providerId: string; modelId: string }): Promise<IpcResult<ProviderTestResult>>
    exportConfig(): Promise<IpcResult<ExportResult>>
    webSearch(): Promise<IpcResult<WebSearchView>>
    saveWebSearch(input: {
      provider: WebSearchProvider
      baseUrl?: string | null
      apiKey?: string
    }): Promise<IpcResult<WebSearchView>>
    testWebSearch(input?: {
      provider?: WebSearchProvider
      baseUrl?: string | null
      apiKey?: string
    }): Promise<IpcResult<WebSearchTestResult>>
  }
  lock: {
    get(): Promise<IpcResult<LockState>>
    beginUserEditing(): Promise<IpcResult<LockState>>
    endUserEditing(): Promise<IpcResult<LockState>>
  }
  app: {
    openExternal(url: string): Promise<IpcResult<{ opened: boolean }>>
  }
  update: {
    getState(): Promise<IpcResult<UpdateState>>
    check(): Promise<IpcResult<UpdateState>>
    download(): Promise<IpcResult<{ downloaded: boolean }>>
    install(): Promise<IpcResult<{ installed: boolean }>>
    openRelease(): Promise<IpcResult<{ opened: boolean }>>
  }
  events: {
    onLockChanged(listener: (state: LockState) => void): () => void
    onDataChanged(listener: (payload: { entity: string }) => void): () => void
    onAiProgress(listener: (progress: AiProgress) => void): () => void
    onAiLog(listener: (event: AiLogEvent) => void): () => void
    onUpdateState(listener: (state: UpdateState) => void): () => void
  }
}
