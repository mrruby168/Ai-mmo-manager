import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { EVENTS, IPC } from '../shared/ipc-channels'
import type { AiProgress, IpcResult, LockState, RendererApi } from '../shared/types'

async function invoke<T>(channel: string, payload?: unknown): Promise<IpcResult<T>> {
  return (await ipcRenderer.invoke(channel, payload)) as IpcResult<T>
}

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: IpcRendererEvent, payload: T): void => {
    listener(payload)
  }
  ipcRenderer.on(channel, wrapped)
  return () => {
    ipcRenderer.removeListener(channel, wrapped)
  }
}

const api: RendererApi = {
  projects: {
    list: (category) => invoke(IPC.projectsList, category ? { category } : {}),
    get: (id) => invoke(IPC.projectsGet, { id }),
    create: (input) => invoke(IPC.projectsCreate, { input }),
    update: (id, input, expectedRowVersion) => invoke(IPC.projectsUpdate, { id, input, expectedRowVersion }),
    remove: (id) => invoke(IPC.projectsDelete, { id }),
    setLogo: (payload) => invoke(IPC.projectsSetLogo, payload),
    importJson: (payload) => invoke(IPC.projectsImport, payload),
    export: (payload) => invoke(IPC.projectsExport, payload)
  },
  revenue: {
    list: (projectId) => invoke(IPC.revenueList, projectId ? { projectId } : {}),
    get: (id) => invoke(IPC.revenueGet, { id }),
    summary: () => invoke(IPC.revenueSummary),
    save: (input, id) => invoke(IPC.revenueSave, id === undefined ? { input } : { input, id }),
    remove: (id) => invoke(IPC.revenueDelete, { id }),
    attachEvidence: (payload) => invoke(IPC.revenueAttachEvidence, payload)
  },
  news: {
    list: () => invoke(IPC.newsList),
    deadlines: () => invoke(IPC.newsDeadlines),
    toggleTodo: (id, isDone) => invoke(IPC.newsToggleTodo, { id, isDone }),
    check: () => invoke(IPC.newsCheck),
    buildPrompt: () => invoke(IPC.newsBuildPrompt),
    importPreview: () => invoke(IPC.newsImportPreview),
    importConfirm: (token) => invoke(IPC.newsImportConfirm, { token }),
    create: (input) => invoke(IPC.newsCreate, { input }),
    update: (id, input) => invoke(IPC.newsUpdate, { id, input }),
    remove: (id) => invoke(IPC.newsDelete, { id })
  },
  scan: {
    start: (payload) => invoke(IPC.scanStart, payload),
    submit: (names) => invoke(IPC.scanSubmit, { names }),
    latest: () => invoke(IPC.scanGetLatest),
    cancel: () => invoke(IPC.scanCancel)
  },
  chat: {
    send: (payload) => invoke(IPC.chatSend, payload),
    choose: (choiceId) => invoke(IPC.chatSend, { choiceId }),
    newSession: () => invoke(IPC.chatNewSession),
    confirm: (actionId) => invoke(IPC.chatConfirm, { actionId }),
    cancelAction: (actionId) => invoke(IPC.chatCancelAction, { actionId }),
    cancelTask: (channel) => invoke(IPC.aiCancel, channel ? { channel } : undefined)
  },
  settings: {
    get: () => invoke(IPC.settingsGet),
    setLastSelection: (selection) => invoke(IPC.settingsSetLastSelection, selection),
    setTaskSelection: (task, selection) => invoke(IPC.settingsSetTaskSelection, { task, selection }),
    setAppearance: (appearance) => invoke(IPC.settingsSetAppearance, { appearance }),
    setAiMode: (aiMode) => invoke(IPC.settingsSetAiMode, { aiMode }),
    setDataPath: (payload) => invoke(IPC.settingsSetDataPath, payload),
    chooseDataPath: () => invoke(IPC.settingsSetDataPath, { choose: true }),
    openDataFolder: () => invoke(IPC.settingsOpenDataFolder),
    providers: () => invoke(IPC.providersList),
    saveProvider: (input) => invoke(IPC.providersSave, input),
    deleteProvider: (id) => invoke(IPC.providersDelete, { id }),
    parseProviderJson: (json) => invoke(IPC.providersParseJson, { json }),
    testProvider: (payload) => invoke(IPC.providersTest, payload),
    exportConfig: () => invoke(IPC.providersExportConfig),
    webSearch: () => invoke(IPC.settingsGetWebSearch),
    saveWebSearch: (input) => invoke(IPC.settingsSaveWebSearch, input),
    testWebSearch: (input) => invoke(IPC.settingsTestWebSearch, input ?? {})
  },
  lock: {
    get: () => invoke(IPC.lockGet),
    beginUserEditing: () => invoke(IPC.lockUserBegin),
    endUserEditing: () => invoke(IPC.lockUserEnd)
  },
  app: {
    openExternal: (url) => invoke(IPC.appOpenExternal, { url })
  },
  events: {
    onLockChanged: (listener) => subscribe<LockState>(EVENTS.lockChanged, listener),
    onDataChanged: (listener) => subscribe<{ entity: string }>(EVENTS.dataChanged, listener),
    onAiProgress: (listener) => subscribe<AiProgress>(EVENTS.aiProgress, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
