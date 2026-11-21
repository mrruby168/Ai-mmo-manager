import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProjectCategory } from '@shared/constants'
import { todayDateOnly } from '@shared/date-utils'
import { DEFAULT_PROJECT_PAGE_SIZE } from '@shared/projectList'
import type { ProjectListQuery, ProjectListResult, ProjectPageSize } from '@shared/projectList'
import { Button } from '../../common/Button'
import { EmptyState, ErrorBlock, LoadingBlock } from '../../common/EmptyState'
import { Field, Select } from '../../common/Field'
import { CheckboxField } from '../../common/Field'
import { Modal } from '../../common/Modal'
import { Pagination } from '../../common/Pagination'
import { Switch } from '../../common/Switch'
import { useApp } from '../../state/AppContext'
import { useLock } from '../../state/LockContext'
import { usePriorityPicks } from '../../state/priorityStore'
import { useToast } from '../../state/ToastContext'
import { emptyFilters, ProjectFilters } from './ProjectFilters'
import type { ProjectFilterState } from './ProjectFilters'
import { ProjectFormDialog } from './ProjectFormDialog'
import { ProjectImportDialog } from './ProjectImportDialog'
import { ProjectRow } from './ProjectRow'

const TITLES: Record<ProjectCategory, string> = {
  event_mmo: 'Event MMO',
  airdrop: 'Airdrop'
}

const SEARCH_DEBOUNCE_MS = 250

export function ProjectListPage({ category }: { category: ProjectCategory }): React.JSX.Element {
  const { dataVersion, refreshData, openProject, isAiEnabled } = useApp()
  const { isAiBusy } = useLock()
  const { pushToast } = useToast()
  const picks = usePriorityPicks(category)
  const selectActive = !isAiEnabled && picks.selectMode

  const [data, setData] = useState<ProjectListResult | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<ProjectPageSize>(DEFAULT_PROJECT_PAGE_SIZE)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filters, setFilters] = useState<ProjectFilterState>(emptyFilters)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportFormat, setExportFormat] = useState<'json' | 'txt'>('json')
  const [chooseLocation, setChooseLocation] = useState(false)
  const [exporting, setExporting] = useState(false)
  const requestRef = useRef(0)
  const topRef = useRef<HTMLDivElement>(null)

  // Gõ tìm kiếm: chờ 250 ms rồi mới truy vấn.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(filters.search), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [filters.search])

  const load = useCallback(async () => {
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    setLoading(true)
    const query: ProjectListQuery = {
      category,
      search: debouncedSearch.slice(0, 200),
      status: filters.status,
      cost: filters.cost,
      deadline: filters.deadline,
      today: todayDateOnly(),
      page,
      pageSize
    }
    try {
      const result = await window.api.projects.listPage(query)
      if (requestId !== requestRef.current) {
        return // đã có yêu cầu mới hơn, bỏ kết quả cũ
      }
      if (result.ok) {
        setData(result.data)
        setLoadError(null)
        if (result.data.page !== page) {
          setPage(result.data.page) // trang bị cắt về trang cuối (vừa xoá dự án cuối trang)
        }
      } else {
        setLoadError(result.error.message)
      }
    } catch {
      if (requestId !== requestRef.current) {
        return
      }
      setLoadError('Không tải được danh sách dự án')
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false)
      }
    }
  }, [category, debouncedSearch, filters.status, filters.cost, filters.deadline, page, pageSize])

  useEffect(() => {
    void load()
  }, [load, dataVersion])

  function handleFiltersChange(next: ProjectFilterState): void {
    setFilters(next)
    setPage(1)
    if (next.search === '') {
      setDebouncedSearch('')
    }
  }

  function handlePageSize(size: ProjectPageSize): void {
    setPageSize(size)
    setPage(1)
  }

  function handlePage(next: number): void {
    setPage(next)
    topRef.current?.scrollIntoView({ block: 'start' })
  }

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalAll = data?.totalAll ?? 0

  const closeForm = useCallback(() => setFormOpen(false), [])
  const closeImport = useCallback(() => setImportOpen(false), [])

  function handleSaved(): void {
    setPage(1)
    refreshData()
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
            {data === null ? 'Đang tải…' : `${totalAll} dự án · ưu tiên hiển thị dự án sắp hết hạn`}
          </span>
        </div>
        <div className="row">
          {!isAiEnabled ? (
            <Switch label="Chọn dự án ưu tiên" checked={picks.selectMode} onChange={picks.setSelectMode} />
          ) : null}
          <Button variant="secondary" onClick={() => setImportOpen(true)} disabled={isAiBusy}>
            Nhập JSON
          </Button>
          <Button variant="secondary" onClick={() => setExportOpen(true)} disabled={isAiBusy || totalAll === 0}>
            Xuất…
          </Button>
          <Button variant="primary" onClick={() => setFormOpen(true)} disabled={isAiBusy}>
            Thêm dự án
          </Button>
        </div>
      </div>

      <div ref={topRef} />
      <ProjectFilters filters={filters} onChange={handleFiltersChange} />

      {selectActive ? (
        <p className="muted priority-hint">Chế độ chọn ưu tiên đang bật · Click Card để chọn hoặc bỏ chọn</p>
      ) : null}

      {loading && data === null ? <LoadingBlock message="Đang tải danh sách dự án…" /> : null}

      {loadError ? <ErrorBlock message={loadError} action={<Button onClick={() => void load()}>Thử lại</Button>} /> : null}

      {!loading && !loadError && data !== null && totalAll === 0 ? (
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

      {!loadError && totalAll > 0 && total === 0 && !loading ? (
        <EmptyState
          title="Không có dự án khớp bộ lọc"
          message="Thử xóa từ khóa tìm kiếm hoặc đổi bộ lọc."
          action={<Button onClick={() => handleFiltersChange(emptyFilters)}>Xóa bộ lọc</Button>}
        />
      ) : null}

      {items.length > 0 ? (
        <div className="project-rows">
          {items.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              priority={picks.ids.has(project.id)}
              selectMode={selectActive}
              onOpen={() => openProject(project.id)}
              onTogglePriority={() => picks.toggle(project.id)}
            />
          ))}
        </div>
      ) : null}

      {data !== null && total > 0 ? (
        <Pagination
          page={data.page}
          pageCount={data.pageCount}
          total={total}
          pageSize={pageSize}
          onPage={handlePage}
          onPageSize={handlePageSize}
        />
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
