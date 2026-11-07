import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ProjectCategory } from '@shared/constants'
import { todayDateOnly } from '@shared/date-utils'
import type { Project } from '@shared/types'
import { Button } from '../../common/Button'
import { EmptyState, ErrorBlock, LoadingBlock } from '../../common/EmptyState'
import { Field, Select } from '../../common/Field'
import { CheckboxField } from '../../common/Field'
import { Modal } from '../../common/Modal'
import { useApp } from '../../state/AppContext'
import { useLock } from '../../state/LockContext'
import { useToast } from '../../state/ToastContext'
import { applyProjectFilters, emptyFilters, ProjectFilters } from './ProjectFilters'
import type { ProjectFilterState } from './ProjectFilters'
import { ProjectFormDialog } from './ProjectFormDialog'
import { ProjectImportDialog } from './ProjectImportDialog'
import { ProjectRow } from './ProjectRow'

const TITLES: Record<ProjectCategory, string> = {
  event_mmo: 'Event MMO',
  airdrop: 'Airdrop'
}

export function ProjectListPage({ category }: { category: ProjectCategory }): React.JSX.Element {
  const { dataVersion, refreshData, openProject } = useApp()
  const { isAiBusy } = useLock()
  const { pushToast } = useToast()

  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filters, setFilters] = useState<ProjectFilterState>(emptyFilters)
  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportFormat, setExportFormat] = useState<'json' | 'txt'>('json')
  const [chooseLocation, setChooseLocation] = useState(false)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await window.api.projects.list(category)
    if (result.ok) {
      setProjects(result.data)
      setLoadError(null)
    } else {
      setLoadError(result.error.message)
    }
    setLoading(false)
  }, [category])

  useEffect(() => {
    void load()
  }, [load, dataVersion])

  const filtered = useMemo(() => applyProjectFilters(projects, filters, todayDateOnly()), [projects, filters])

  const closeForm = useCallback(() => setFormOpen(false), [])
  const closeImport = useCallback(() => setImportOpen(false), [])

  function handleSaved(): void {
    refreshData()
    void load()
  }

  async function handleExport(): Promise<void> {
    setExporting(true)
    const result = await window.api.projects.export({ format: exportFormat, chooseLocation })
    setExporting(false)
    if (!result.ok) {
      pushToast(result.error.message, 'error')
      return
    }
    if (result.data.canceled) {
      return
    }
    setExportOpen(false)
    pushToast(`Đã xuất ${result.data.count} dự án: ${result.data.filePath}`, 'success')
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header__title">
          <h1>{TITLES[category]}</h1>
          <span className="page-header__subtitle">
            {projects.length} dự án · ưu tiên hiển thị dự án sắp hết hạn
          </span>
        </div>
        <div className="row">
          <Button variant="secondary" onClick={() => setImportOpen(true)} disabled={isAiBusy}>
            Nhập JSON
          </Button>
          <Button variant="secondary" onClick={() => setExportOpen(true)} disabled={isAiBusy || projects.length === 0}>
            Xuất…
          </Button>
          <Button variant="primary" onClick={() => setFormOpen(true)} disabled={isAiBusy}>
            Thêm dự án
          </Button>
        </div>
      </div>

      <ProjectFilters filters={filters} onChange={setFilters} />

      {loading && projects.length === 0 ? <LoadingBlock message="Đang tải danh sách dự án…" /> : null}

      {loadError ? <ErrorBlock message={loadError} action={<Button onClick={() => void load()}>Thử lại</Button>} /> : null}

      {!loading && !loadError && projects.length === 0 ? (
        <EmptyState
          title="Chưa có dự án nào"
          message="Thêm dự án đầu tiên bằng form, hoặc dùng Scan Project để AI đề xuất."
          action={
            <Button variant="primary" onClick={() => setFormOpen(true)} disabled={isAiBusy}>
              Thêm dự án đầu tiên
            </Button>
          }
        />
      ) : null}

      {!loadError && projects.length > 0 && filtered.length === 0 ? (
        <EmptyState
          title="Không có dự án khớp bộ lọc"
          message="Thử xóa từ khóa tìm kiếm hoặc đổi bộ lọc."
          action={<Button onClick={() => setFilters(emptyFilters)}>Xóa bộ lọc</Button>}
        />
      ) : null}

      {filtered.length > 0 ? (
        <div className="project-rows">
          {filtered.map((project) => (
            <ProjectRow key={project.id} project={project} onOpen={() => openProject(project.id)} />
          ))}
        </div>
      ) : null}

      <ProjectFormDialog
        open={formOpen}
        mode="create"
        defaultCategory={category}
        onClose={closeForm}
        onSaved={() => handleSaved()}
      />

      <ProjectImportDialog open={importOpen} onClose={closeImport} onImported={handleSaved} />

      <Modal
        open={exportOpen}
        title="Xuất danh sách dự án"
        closeDisabled={exporting}
        onClose={() => setExportOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setExportOpen(false)} disabled={exporting}>
              Hủy
            </Button>
            <Button variant="primary" loading={exporting} onClick={() => void handleExport()}>
              Xuất
            </Button>
          </>
        }
      >
        <Field label="Định dạng">
          <Select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as 'json' | 'txt')}>
            <option value="json">JSON (nhập lại được)</option>
            <option value="txt">TXT (đọc nhanh)</option>
          </Select>
        </Field>
        <CheckboxField
          label="Chọn nơi lưu khác"
          checked={chooseLocation}
          onChange={setChooseLocation}
          hint="Bỏ trống để lưu vào thư mục Downloads"
        />
      </Modal>
    </>
  )
}
