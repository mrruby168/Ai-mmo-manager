import { useCallback, useEffect, useState } from 'react'
import type { NewsItem, Project, DeadlineItem, NewsImportPreview } from '@shared/types'
import { getDeadlineInfo, todayDateOnly } from '@shared/date-utils'
import {
  buildDeadlineRows,
  buildHeadline,
  formatDmy,
  MILESTONE_LABEL,
  oneLine,
  selectTopImportantPerProject
} from '@shared/newsView'
import { ProjectLogo } from '../../common/ProjectLogo'
import { VerificationBadge } from '../../common/Badge'
import { Button } from '../../common/Button'
import { EmptyState, ErrorBlock, LoadingBlock } from '../../common/EmptyState'
import { ExternalLink } from '../../common/ExternalLink'
import { Modal } from '../../common/Modal'
import { useApp } from '../../state/AppContext'
import { useLock } from '../../state/LockContext'
import { useToast } from '../../state/ToastContext'
import { canImportNews } from '@shared/newsAccess'

const VERIFICATION_SORT: Record<string, number> = { verified: 0, unverified: 1 }

const IMPORT_REASON_LABELS: Record<string, string> = {
  invalid_json: 'File không phải JSON hợp lệ',
  invalid_schema: 'Tin không đúng schema hoặc URL không hợp lệ',
  unknown_project: 'projectId không tồn tại',
  out_of_window: 'Ngày ngoài cửa sổ 7 ngày',
  duplicate: 'Tin trùng'
}

function sortByVerification(items: NewsItem[]): NewsItem[] {
  return [...items].sort(
    (left, right) =>
      (VERIFICATION_SORT[left.verification] ?? 1) - (VERIFICATION_SORT[right.verification] ?? 1) ||
      right.publishedAt.localeCompare(left.publishedAt)
  )
}

export function NewsPage(): React.JSX.Element {
  const { refreshData, dataVersion, openProject, isAiEnabled } = useApp()
  const { isAiBusy } = useLock()
  const { pushToast } = useToast()

  const [important, setImportant] = useState<NewsItem[]>([])
  const [todos, setTodos] = useState<NewsItem[]>([])
  const [projectsById, setProjectsById] = useState<Map<string, Project>>(new Map())
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null)
  const [promptOpen, setPromptOpen] = useState(false)
  const [promptText, setPromptText] = useState('')
  const [promptLoading, setPromptLoading] = useState(false)
  const [promptProjectCount, setPromptProjectCount] = useState(0)
  const [importPreview, setImportPreview] = useState<NewsImportPreview | null>(null)
  const [importOpening, setImportOpening] = useState(false)
  const [importBusy, setImportBusy] = useState(false)

  const load = useCallback(async () => {
    const [listResult, projectsResult] = await Promise.all([
      window.api.news.list(),
      window.api.projects.list()
    ])

    if (listResult.ok) {
      setImportant(listResult.data.important)
      setTodos(listResult.data.todos)
      setLastCheckedAt(listResult.data.lastCheckedAt)
      setError(null)
    } else {
      setError(listResult.error.message)
    }

    if (projectsResult.ok) {
      setProjectsById(new Map(projectsResult.data.map((project) => [project.id, project])))
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load, dataVersion])

  // Đổi sang AI Mode thì đóng ngay hộp thoại Import đang mở.
  useEffect(() => {
    if (!canImportNews(isAiEnabled)) {
      setImportPreview(null)
    }
  }, [isAiEnabled])

  async function handleCheck(): Promise<void> {
    if (checking || promptLoading || isAiBusy) {
      return
    }

    if (!isAiEnabled) {
      setPromptLoading(true)
      const result = await window.api.news.buildPrompt()
      setPromptLoading(false)
      if (!result.ok) {
        pushToast(result.error.message, 'error')
        return
      }
      setPromptText(result.data.prompt)
      setPromptProjectCount(result.data.projectCount)
      setPromptOpen(true)
      return
    }

    setChecking(true)
    const result = await window.api.news.check()
    setChecking(false)
    if (!result.ok) {
      pushToast(result.error.message, 'error')
      return
    }
    pushToast(result.data.message, result.data.added > 0 ? 'success' : 'info')
    refreshData()
  }

  async function handleCopyPrompt(): Promise<void> {
    try {
      await navigator.clipboard.writeText(promptText)
      pushToast('Đã copy Prompt', 'success')
    } catch {
      pushToast('Không copy được. Hãy chọn toàn bộ nội dung và copy thủ công.', 'error')
    }
  }

  async function handleImportPreview(): Promise<void> {
    if (!canImportNews(isAiEnabled)) {
      return
    }
    if (importOpening || importBusy) {
      return
    }
    setImportOpening(true)
    const result = await window.api.news.importPreview()
    setImportOpening(false)
    if (!result.ok) {
      pushToast(result.error.message, 'error')
      return
    }
    if (result.data.canceled) {
      return
    }
    setImportPreview(result.data)
  }

  async function handleImportConfirm(): Promise<void> {
    if (!importPreview?.token || importBusy) {
      return
    }
    setImportBusy(true)
    const result = await window.api.news.importConfirm(importPreview.token)
    setImportBusy(false)
    if (!result.ok) {
      pushToast(result.error.message, 'error')
      return
    }
    setImportPreview(null)
    pushToast(result.data.message, result.data.added > 0 ? 'success' : 'info')
    refreshData()
  }

  async function handleToggleTodo(item: NewsItem): Promise<void> {
    const result = await window.api.news.toggleTodo(item.id, !item.isDone)
    if (!result.ok) {
      pushToast(result.error.message, 'error')
      return
    }
    refreshData()
  }

  const today = todayDateOnly()
  const topImportant = selectTopImportantPerProject(important, today)
  const deadlineRows = buildDeadlineRows(
    [...projectsById.values()],
    [...important, ...todos],
    today
  )

  const verifiedTodos = sortByVerification(todos.filter((item) => !item.isDone && item.verification === 'verified'))
  const unverifiedTodos = todos.filter((item) => !item.isDone && item.verification !== 'verified')
  const doneTodos = todos.filter((item) => item.isDone)

  const urgent = deadlineRows.filter((item) => item.daysRemaining <= 3 && item.daysRemaining >= 0)
  const soon = deadlineRows.filter((item) => item.daysRemaining >= 4 && item.daysRemaining <= 14)
  const expired = deadlineRows.filter((item) => item.daysRemaining < 0)

  if (loading && important.length === 0 && todos.length === 0) {
    return <LoadingBlock message="Đang tải tin tức…" />
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header__title">
          <h1>News</h1>
          <span className="page-header__subtitle">
            {lastCheckedAt ? `Kiểm tra gần nhất: ${new Date(lastCheckedAt).toLocaleString('vi-VN')}` : 'Chưa kiểm tra lần nào'} · 7 ngày gần nhất
          </span>
        </div>
        <div className="row row--wrap">
          {canImportNews(isAiEnabled) ? (
            <Button variant="secondary" loading={importOpening} disabled={isAiBusy || importOpening || importBusy} onClick={() => void handleImportPreview()}>
              Import News
            </Button>
          ) : null}
          <Button variant="primary" loading={checking || promptLoading} disabled={isAiBusy || checking || promptLoading} onClick={() => void handleCheck()}>
            Check News
          </Button>
        </div>
      </div>

      {error ? <ErrorBlock message={error} action={<Button onClick={() => void load()}>Thử lại</Button>} /> : null}

      <div className="news-grid">
        <section className="card stack news-panel">
          <div className="section-title">
            <h2>Tin quan trọng mới</h2>
            <span className="muted">{topImportant.length} dự án</span>
          </div>

          {topImportant.length === 0 ? (
            <EmptyState
              title="Chưa có tin nào"
              message={
                isAiEnabled
                  ? 'Bấm Check News để AI tìm tin trong 7 ngày gần nhất.'
                  : 'Bấm Check News để tạo Prompt, hoặc Import News từ file JSON.'
              }
            />
          ) : (
            <div className="news-list">
              {topImportant.map((item) => (
                <NewsHeadlineRow
                  key={item.id}
                  item={item}
                  project={projectsById.get(item.projectId)}
                  onOpenProject={openProject}
                />
              ))}
            </div>
          )}
        </section>

        <div className="stack">
          <section className="card stack news-panel">
            <div className="section-title">
              <h2>Deadline sắp hết</h2>
              <span className="muted">{urgent.length + soon.length} mốc</span>
            </div>
            {urgent.length + soon.length === 0 ? (
              <p className="muted">Không có hạn chót nào trong 14 ngày tới. Hạn đã qua hiển thị ở nhóm dưới.</p>
            ) : (
              <div className="deadline-list">
                {urgent.map((item) => (
                  <DeadlineRow key={`${item.projectId}-${item.kind}-${item.date}`} item={item} today={today} urgent onOpenProject={openProject} />
                ))}
                {soon.map((item) => (
                  <DeadlineRow key={`${item.projectId}-${item.kind}-${item.date}`} item={item} today={today} onOpenProject={openProject} />
                ))}
              </div>
            )}
            {expired.length > 0 ? (
              <details className="expired-group">
                <summary className="expired-group__summary">Đã qua hạn — giữ để tra cứu ({expired.length})</summary>
                <div className="deadline-list">
                  {expired.map((item) => (
                    <DeadlineRow key={`${item.projectId}-${item.kind}-${item.date}`} item={item} today={today} expired onOpenProject={openProject} />
                  ))}
                </div>
              </details>
            ) : null}
          </section>

          <section className="card stack news-panel">
            <div className="section-title">
              <h2>Việc cần làm ngay</h2>
              <span className="muted">{todos.filter((item) => !item.isDone).length} chưa xử lý</span>
            </div>
            {todos.length === 0 ? (
              <p className="muted">Chưa có việc nào. Check News sẽ liệt kê việc cần làm trong ngày.</p>
            ) : (
              <div className="todo-list">
                {[...verifiedTodos, ...unverifiedTodos].map((item) => (
                  <TodoRow key={item.id} item={item} project={projectsById.get(item.projectId)} onToggle={() => void handleToggleTodo(item)} onOpenProject={openProject} />
                ))}
                {doneTodos.map((item) => (
                  <TodoRow key={item.id} item={item} project={projectsById.get(item.projectId)} done onToggle={() => void handleToggleTodo(item)} onOpenProject={openProject} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <Modal
        open={promptOpen}
        title="Prompt Check News — No AI Mode"
        wide
        onClose={() => setPromptOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPromptOpen(false)}>
              Đóng
            </Button>
            <Button variant="primary" onClick={() => void handleCopyPrompt()}>
              Copy Prompt
            </Button>
          </>
        }
      >
        <div className="stack">
          <p className="muted">
            No AI Mode: app không gọi AI. Copy Prompt này và dán vào công cụ AI bên ngoài. Danh sách có {promptProjectCount} dự án chưa hoàn thành.
          </p>
          <textarea
            className="field__control prompt-preview"
            readOnly
            rows={20}
            aria-label="Prompt Check News"
            value={promptText}
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      </Modal>

      <Modal
        open={importPreview !== null}
        title="Xem trước Import News"
        wide
        closeDisabled={importBusy}
        onClose={() => setImportPreview(null)}
        footer={
          <>
            <Button variant="ghost" disabled={importBusy} onClick={() => setImportPreview(null)}>
              Hủy
            </Button>
            <Button
              variant="primary"
              loading={importBusy}
              disabled={!importPreview?.token || importBusy}
              onClick={() => void handleImportConfirm()}
            >
              Xác nhận
            </Button>
          </>
        }
      >
        {importPreview ? (
          <div className="stack">
            <p className="muted">File: {importPreview.fileName}</p>
            <ul className="import-summary">
              <li>Tổng số tin trong file: {importPreview.total}</li>
              <li>Hợp lệ: {importPreview.validCount}</li>
              <li>Bị loại: {importPreview.rejections.reduce((sum, rejection) => sum + rejection.count, 0)}</li>
            </ul>
            {importPreview.rejections.length > 0 ? (
              <div className="stack">
                <h3>Lý do loại</h3>
                <ul className="import-summary">
                  {importPreview.rejections.map((rejection) => (
                    <li key={rejection.reason}>
                      {IMPORT_REASON_LABELS[rejection.reason] ?? rejection.reason}: {rejection.count}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="muted">Không có tin bị loại.</p>
            )}
            <p className="muted">Chưa ghi dữ liệu. Bấm Xác nhận để nhập các tin hợp lệ (cửa sổ 7 ngày, UTC+7).</p>
          </div>
        ) : null}
      </Modal>
    </>
  )
}

function NewsHeadlineRow({
  item,
  project,
  onOpenProject
}: {
  item: NewsItem
  project: Project | undefined
  onOpenProject: (id: string) => void
}): React.JSX.Element {
  const name = project?.name ?? 'Dự án không tồn tại'
  const headline = buildHeadline(item)
  const unverified = item.verification !== 'verified'
  return (
    <div className={`news-row${unverified ? ' news-row--unverified' : ''}`}>
      <ProjectLogo projectId={item.projectId} name={name} hasLogo={Boolean(project?.logoPath)} size="news" />
      <button
        type="button"
        className="news-row__project"
        data-lock-allow="true"
        title={name}
        onClick={() => onOpenProject(item.projectId)}
      >
        {name}
      </button>
      <span className="news-row__dash" aria-hidden="true">
        –
      </span>
      <span className="news-row__headline" title={`${headline} · ${item.summary}`}>
        {headline}
      </span>
      {unverified ? <span className="news-row__badge">Chưa xác minh</span> : null}
      <ExternalLink url={item.sourceUrl} className="news-row__link" ariaLabel="Mở bài gốc">
        {null}
      </ExternalLink>
    </div>
  )
}

function DeadlineRow({
  item,
  today,
  urgent = false,
  expired = false,
  onOpenProject
}: {
  item: DeadlineItem
  today: string
  urgent?: boolean
  expired?: boolean
  onOpenProject: (id: string) => void
}): React.JSX.Element {
  const deadline = getDeadlineInfo(item.date, today)
  const label = expired ? `Đã quá hạn ${Math.abs(item.daysRemaining)} ngày` : deadline.text
  const unverified = item.verification !== 'verified'
  return (
    <button type="button" className={`deadline-item${urgent ? ' deadline-item--urgent' : ''}${expired ? ' deadline-item--expired' : ''}`} data-lock-allow="true" onClick={() => onOpenProject(item.projectId)}>
      <span className="deadline-item__main">
        <ProjectLogo projectId={item.projectId} name={item.projectName} hasLogo={Boolean(item.logoPath)} size="news" />
        <span className="deadline-item__text">
          <span className="deadline-item__name">{item.projectName}:</span>
          <span className="deadline-item__kind">
            {MILESTONE_LABEL[item.kind]} {formatDmy(item.date)}
          </span>
          {unverified ? <span className="deadline-item__badge">Chưa xác minh</span> : null}
        </span>
      </span>
      <span className={urgent ? 'deadline--soon_3d' : expired ? 'deadline--expired' : 'deadline--normal'}>{label}</span>
    </button>
  )
}

function TodoRow({
  item,
  project,
  done = false,
  onToggle,
  onOpenProject
}: {
  item: NewsItem
  project: Project | undefined
  done?: boolean
  onToggle: () => void
  onOpenProject: (id: string) => void
}): React.JSX.Element {
  const name = project?.name ?? 'Dự án không tồn tại'
  return (
    <div className={`todo-item${done ? ' todo-item--done' : ''}`}>
      <input
        className="todo-item__check"
        type="checkbox"
        id={`todo-${item.id}`}
        checked={done}
        onChange={onToggle}
        aria-label={`Đánh dấu đã xử lý: ${name}`}
      />
      <label htmlFor={`todo-${item.id}`} className="todo-item__body">
        <span className="todo-item__title">
          <span className="todo-item__project">{name}</span>
          {item.todoDeadline ? <span className="todo-item__deadline">Hạn {formatDmy(item.todoDeadline)}</span> : null}
          {item.verification !== 'verified' ? <VerificationBadge verification={item.verification} /> : null}
        </span>
        <span className="todo-item__summary" title={item.summary}>
          {oneLine(item.summary, 160)}
        </span>
      </label>
      <button type="button" className="news-item__project" data-lock-allow="true" onClick={() => onOpenProject(item.projectId)} aria-label={`Mở chi tiết ${name}`}>
        Chi tiết
      </button>
    </div>
  )
}
