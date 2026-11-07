import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow, dialog } from 'electron'
import type { OpenDialogOptions, SaveDialogOptions } from 'electron'
import { LIMITS } from '@shared/constants'
import { EVENTS, IPC } from '@shared/ipc-channels'
import { parseJsonText } from '@shared/coerce'
import { createProject, deleteProjectById, getProject, importProjects, listProjects, ProjectError, setProjectLogo, updateProjectById } from '../services/projectService'
import { defaultExportDirectory, defaultExportFileName, exportProjects } from '../services/exportService'
import { captureLogoFromFile, fetchLogoForProject } from '../services/logoService'
import { broadcastToRenderers, registerHandler } from './guard'
import {
  projectsCreatePayload,
  projectsExportPayload,
  projectsIdPayload,
  projectsImportPayload,
  projectsListPayload,
  projectsSetLogoPayload,
  projectsUpdatePayload
} from './payloadSchemas'

function parentWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

function notifyProjectsChanged(): void {
  broadcastToRenderers(EVENTS.dataChanged, { entity: 'projects' })
}

export function registerProjectsIpc(): void {
  registerHandler({
    channel: IPC.projectsList,
    parse: (raw) => projectsListPayload.parse(raw ?? undefined),
    handler: (input) => listProjects(input?.category)
  })

  registerHandler({
    channel: IPC.projectsGet,
    parse: (raw) => projectsIdPayload.parse(raw),
    handler: (input) => getProject(input.id)
  })

  registerHandler({
    channel: IPC.projectsCreate,
    mutating: true,
    parse: (raw) => projectsCreatePayload.parse(raw),
    handler: (input) => {
      const project = createProject(input.input)
      notifyProjectsChanged()
      return project
    }
  })

  registerHandler({
    channel: IPC.projectsUpdate,
    mutating: true,
    parse: (raw) => projectsUpdatePayload.parse(raw),
    handler: (input) => {
      const project = updateProjectById(input.id, input.input, input.expectedRowVersion)
      notifyProjectsChanged()
      return project
    }
  })

  registerHandler({
    channel: IPC.projectsDelete,
    mutating: true,
    parse: (raw) => projectsIdPayload.parse(raw),
    handler: (input) => {
      deleteProjectById(input.id)
      notifyProjectsChanged()
      return { id: input.id }
    }
  })

  registerHandler({
    channel: IPC.projectsSetLogo,
    mutating: true,
    parse: (raw) => projectsSetLogoPayload.parse(raw),
    handler: async (input) => {
      const project = getProject(input.id)
      if (!project) {
        throw new ProjectError('NOT_FOUND', 'Không tìm thấy dự án để đặt logo')
      }

      let relativePath: string | null = null
      if (input.autoFetch) {
        relativePath = await fetchLogoForProject({
          projectId: project.id,
          website: project.website,
          socialsX: project.socials.x ?? null
        })
        if (!relativePath) {
          return { project, logoUpdated: false, message: 'Không tìm thấy logo từ website hoặc X, đang dùng chữ cái đầu tên dự án' }
        }
      } else {
        let sourcePath = input.sourcePath
        if (!sourcePath) {
          const parent = parentWindow()
          const options: OpenDialogOptions = {
            title: 'Chọn ảnh logo',
            properties: ['openFile'],
            filters: [{ name: 'Ảnh', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
          }
          const selection = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
          if (selection.canceled || selection.filePaths.length === 0) {
            return { project, logoUpdated: false, message: 'Đã hủy chọn ảnh' }
          }
          sourcePath = selection.filePaths[0]
        }
        relativePath = await captureLogoFromFile(project.id, sourcePath)
      }

      const updated = setProjectLogo(project.id, relativePath)
      notifyProjectsChanged()
      return { project: updated, logoUpdated: true, message: 'Đã cập nhật logo' }
    }
  })

  registerHandler({
    channel: IPC.projectsImport,
    mutating: true,
    parse: (raw) => projectsImportPayload.parse(raw),
    handler: async (input) => {
      let filePath = input.filePath
      if (input.pickFile) {
        const parent = parentWindow()
        const options: OpenDialogOptions = {
          title: 'Chọn file JSON dự án',
          properties: ['openFile'],
          filters: [{ name: 'JSON', extensions: ['json'] }]
        }
        const selection = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
        if (selection.canceled || selection.filePaths.length === 0) {
          return { canceled: true, results: [], addedCount: 0, duplicateCount: 0, failedCount: 0 }
        }
        filePath = selection.filePaths[0]
      }

      let json = input.json
      if (!json && filePath) {
        const stats = statSync(filePath)
        if (!stats.isFile()) {
          throw new Error('Đường dẫn import không phải là file')
        }
        if (stats.size > LIMITS.importMaxBytes) {
          throw new Error('File import lớn hơn 10 MB')
        }
        json = readFileSync(filePath, 'utf8')
      }
      const parsed = parseJsonText(json as string)
      const result = importProjects(parsed)
      notifyProjectsChanged()
      return { canceled: false, ...result }
    }
  })

  registerHandler({
    channel: IPC.projectsExport,
    mutating: true,
    parse: (raw) => projectsExportPayload.parse(raw),
    handler: async (input) => {
      let targetPath: string | undefined
      if (input.chooseLocation) {
        const parent = parentWindow()
        const options: SaveDialogOptions = {
          title: 'Chọn nơi lưu file',
          defaultPath: join(defaultExportDirectory(), defaultExportFileName(input.format)),
          filters:
            input.format === 'json'
              ? [{ name: 'JSON', extensions: ['json'] }]
              : [{ name: 'Văn bản', extensions: ['txt'] }]
        }
        const selection = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options)
        if (selection.canceled || !selection.filePath) {
          return { canceled: true, filePath: null, format: input.format, count: 0 }
        }
        targetPath = selection.filePath
      }
      const outcome = exportProjects(input.format, targetPath)
      return { canceled: false, ...outcome }
    }
  })
}
