import { existsSync, readFileSync } from 'node:fs'
import { join, normalize, sep, dirname } from 'node:path'
import { app, BrowserWindow, dialog, protocol, session, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { closeDatabase } from './db/connection'
import { getProject } from './db/projectsRepo'
import { hasActiveAiTask } from './ai/aiTaskRunner'
import { registerAllIpc } from './ipc'
import { initializeDataDirectory, getCurrentLayout, getDataFolderToOpen } from './services/dataPathService'
import { getLockState } from './services/lockManager'
import { createUpdateService } from './services/updateService'
import { logError, logInfo } from './services/logger'
import { logoMimeForPath, resolveLogoAbsolutePath } from './services/logoService'
import { parseLogoProjectId } from './services/logoUrl'

const devServerUrl = process.env.ELECTRON_RENDERER_URL
const isDev = Boolean(devServerUrl)

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'mmo-logo',
    privileges: { standard: true, secure: true, supportFetchAPI: true }
  }
])

function buildCsp(): string {
  const shared = [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' mmo-logo: data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ]

  if (isDev) {
    shared.push("script-src 'self' 'unsafe-inline'")
    shared.push("connect-src 'self' ws: http://localhost:*")
  } else {
    shared.push("script-src 'self'")
    shared.push("connect-src 'none'")
  }

  return shared.join('; ')
}

function applyCsp(): void {
  const csp = buildCsp()
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })
}

function registerLogoProtocol(): void {
  protocol.handle('mmo-logo', (request) => {
    const projectId = parseLogoProjectId(request.url)
    const project = projectId ? getProject(projectId) : null
    if (!project?.logoPath) {
      return new Response('Not found', { status: 404 })
    }

    const absolutePath = resolveLogoAbsolutePath(project.logoPath)
    const root = normalize(getCurrentLayout().root)
    if (!normalize(absolutePath).startsWith(`${root}${sep}`) || !existsSync(absolutePath)) {
      return new Response('Not found', { status: 404 })
    }

    return new Response(new Uint8Array(readFileSync(absolutePath)), {
      headers: {
        'content-type': logoMimeForPath(project.logoPath) ?? 'application/octet-stream',
        'cache-control': 'no-store'
      }
    })
  })
}

function createWindow(updateService: { scheduleStartupCheck(): void } | null): void {
  const window = new BrowserWindow({
    width: 1360,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#0B1220',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  window.once('ready-to-show', () => {
    window.show()
    // Chỉ dò cập nhật SAU khi cửa sổ chính đã tải xong, sau 1 phút.
    if (updateService) {
      updateService.scheduleStartupCheck()
    }
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    if (devServerUrl && url.startsWith(devServerUrl)) {
      return
    }
    event.preventDefault()
  })

  if (devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function bootstrap(): void {
  try {
    initializeDataDirectory()
    logInfo('Khởi động MMO Manager')
  } catch (error) {
    logError('Không khởi tạo được thư mục dữ liệu', error)
    dialog.showErrorBox(
      'Không mở được dữ liệu',
      'Không tạo hoặc mở được database trong thư mục dữ liệu. Hãy kiểm tra quyền truy cập rồi mở lại app.'
    )
    app.quit()
    return
  }

  const updater = autoUpdater
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = false
  updater.allowPrerelease = false
  updater.allowDowngrade = false
  updater.setFeedURL({
    provider: 'github',
    owner: 'mrruby168',
    repo: 'Ai-mmo-manager',
    releaseType: 'release'
  })

  const updateService = createUpdateService({
    updater,
    isPackaged: !isDev,
    isPortable: Boolean(process.env.PORTABLE_EXECUTABLE_FILE),
    currentVersion: app.getVersion(),
    hasActiveAiTask: () => hasActiveAiTask(),
    getUserEditing: () => getLockState().userEditing,
    getDataDir: () => getDataFolderToOpen(),
    getInstallDir: () => process.env.PORTABLE_EXECUTABLE_DIR ?? dirname(app.getPath('exe')),
    closeDatabase,
    broadcast: (state) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send('update:state', state)
      }
    },
    log: { info: logInfo, error: logError },
    setTimer: setTimeout,
    clearTimer: clearTimeout
  })

  registerAllIpc(updateService)
  registerLogoProtocol()
  applyCsp()
  createWindow(updateService)
}

app.whenReady().then(() => {
  bootstrap()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(null)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  closeDatabase()
})
