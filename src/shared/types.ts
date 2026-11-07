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
  VerificationState
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

export interface AiSettings {
  providers: ProviderConfig[]
  lastSelection: ModelSelection | null
}

export interface AppearanceSettings {
  fontFamily: string
  fontSize: number
  fontWeight: number
}

export interface AppSettings {
  schemaVersion: 1
  dataPath: string
  appearance: AppearanceSettings
  ai: AiSettings
  aiMode: AiMode
}

export type LockOwner = 'none' | 'ai'

export interface LockState {
  owner: LockOwner
  taskId: string | null
  label: string | null
  startedAt: string | null
  userEditing: boolean
}

export interface AiProgress {
  taskId: string
  step: string
  done: number
  total: number
  message: string
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
  }
  scan: {
    start(payload: { text: string; fileName?: string }): Promise<IpcResult<{ items: ScanItem[]; rejected: number; message: string }>>
    submit(names: string[]): Promise<IpcResult<ProjectImportSummary>>
    latest(): Promise<IpcResult<ScanLatest | null>>
    cancel(): Promise<IpcResult<{ canceled: boolean }>>
  }
  chat: {
    send(payload: { text: string; providerId: string; modelId: string }): Promise<IpcResult<ChatReply>>
    choose(choiceId: string): Promise<IpcResult<ChatReply>>
    newSession(): Promise<IpcResult<{ ok: boolean }>>
    confirm(actionId: string): Promise<IpcResult<{ message: string; ok: boolean }>>
    cancelAction(actionId: string): Promise<IpcResult<{ canceled: boolean }>>
    cancelTask(): Promise<IpcResult<{ canceled: boolean }>>
  }
  settings: {
    get(): Promise<IpcResult<AppSettings>>
    setAppearance(appearance: AppearanceSettings): Promise<IpcResult<AppSettings>>
    setLastSelection(selection: ModelSelection): Promise<IpcResult<AppSettings>>
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
  }
  lock: {
    get(): Promise<IpcResult<LockState>>
    beginUserEditing(): Promise<IpcResult<LockState>>
    endUserEditing(): Promise<IpcResult<LockState>>
  }
  app: {
    openExternal(url: string): Promise<IpcResult<{ opened: boolean }>>
  }
  events: {
    onLockChanged(listener: (state: LockState) => void): () => void
    onDataChanged(listener: (payload: { entity: string }) => void): () => void
    onAiProgress(listener: (progress: AiProgress) => void): () => void
  }
}
