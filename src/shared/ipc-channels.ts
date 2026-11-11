export const IPC = {
  projectsList: 'projects:list',
  projectsGet: 'projects:get',
  projectsCreate: 'projects:create',
  projectsUpdate: 'projects:update',
  projectsDelete: 'projects:delete',
  projectsSetLogo: 'projects:setLogo',
  projectsImport: 'projects:import',
  projectsExport: 'projects:export',

  revenueList: 'revenue:list',
  revenueGet: 'revenue:get',
  revenueSummary: 'revenue:summary',
  revenueSave: 'revenue:save',
  revenueDelete: 'revenue:delete',
  revenueAttachEvidence: 'revenue:attachEvidence',

  newsList: 'news:list',
  newsDeadlines: 'news:deadlines',
  newsTodos: 'news:todos',
  newsToggleTodo: 'news:toggleTodo',
  newsCheck: 'news:check',
  newsBuildPrompt: 'news:buildPrompt',
  newsImportPreview: 'news:importPreview',
  newsImportConfirm: 'news:importConfirm',
  newsCreate: 'news:create',
  newsUpdate: 'news:update',
  newsDelete: 'news:delete',

  scanStart: 'scan:start',
  scanSubmit: 'scan:submit',
  scanGetLatest: 'scan:getLatest',
  scanCancel: 'scan:cancel',

  chatSend: 'chat:send',
  chatNewSession: 'chat:newSession',
  chatSubmitImport: 'chat:submitImport',
  chatConfirm: 'chat:confirm',
  chatCancelAction: 'chat:cancelAction',
  aiCancel: 'ai:cancel',

  settingsGet: 'settings:get',
  settingsSetAppearance: 'settings:setAppearance',
  settingsSetLastSelection: 'settings:setLastSelection',
  settingsSetTaskSelection: 'settings:setTaskSelection',
  settingsSetAiMode: 'settings:setAiMode',
  settingsSetDataPath: 'settings:setDataPath',
  settingsOpenDataFolder: 'settings:openDataFolder',
  settingsGetWebSearch: 'settings:getWebSearch',
  settingsSaveWebSearch: 'settings:saveWebSearch',
  settingsTestWebSearch: 'settings:testWebSearch',
  providersList: 'providers:list',
  providersSave: 'providers:save',
  providersDelete: 'providers:delete',
  providersParseJson: 'providers:parseJson',
  providersTest: 'providers:test',
  providersExportConfig: 'providers:exportConfig',

  lockGet: 'lock:get',
  lockUserBegin: 'lock:userBegin',
  lockUserEnd: 'lock:userEnd',

  appOpenExternal: 'app:openExternal',

  updateGetState: 'update:getState',
  updateCheck: 'update:check',
  updateDownload: 'update:download',
  updateInstall: 'update:install',
  updateOpenRelease: 'update:openRelease'
} as const

export const EVENTS = {
  lockChanged: 'lock:changed',
  aiProgress: 'ai:progress',
  dataChanged: 'data:changed',
  updateState: 'update:state'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
export type AppEvent = (typeof EVENTS)[keyof typeof EVENTS]
