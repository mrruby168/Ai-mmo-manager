import { useCallback, useEffect, useState } from 'react'
import type { NewsItem, Project, DeadlineItem, NewsImportPreview } from '@shared/types'
import { getDeadlineInfo, todayDateOnly } from '@shared/date-utils'
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
  const [deadlines, setDeadlines] = useState<DeadlineItem[]>([])
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
    const [listResult, deadlinesResult, projectsResult] = await Promise.all([
      window.api.news.list(),
      window.api.news.deadlines(),
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

    if (deadlinesResult.ok) {
      setDeadlines(deadlinesResult.data)
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

  const verifiedImportant = sortByVerification(important.filter((item) => item.verification === 'verified'))
  const unverifiedImportant = important.filter((item) => item.verification !== 'verified')
  const verifiedTodos = sortByVerification(todos.filter((item) => !item.isDone && item.verification === 'verified'))
  const unverifiedTodos = todos.filter((item) => !item.isDone && item.verification !== 'verified')
  const doneTodos = todos.filter((item) => item.isDone)

  const urgent = deadlines.filter((item) => item.daysRemaining <= 3 && item.daysRemaining >= 0)
  const soon = deadlines.filter((item) => item.daysRemaining >= 4 && item.daysRemaining <= 14)
  const expired = deadlines.filter((item) => item.daysRemaining < 0)

  const today = todayDateOnly()

  if (loading && important.length === 0 && todos.length === 0) {
    return <LoadingBlock message="Đang tải tin tức…" />
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header__title">
          <h1>News</h1>
          <span className="page-header__subtitle">
            {lastCheckedAt ? `Kiểm tra gần nhất: ${new Date(lastCheckedAt).toLocaleString('vi-VN')}` : 'Chưa kiểm tra lần nào'} · Tin mới trong ngày
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
            <span className="muted">{important.length} tin</span>
          </div>

          {important.length === 0 ? (
            <EmptyState
              title="Chưa có tin nào"
              message={
                isAiEnabled
                  ? 'Bấm Check News để AI tìm tin mới trong ngày.'
                  : 'Bấm Check News để tạo Prompt, hoặc Import News từ file JSON.'
              }
            />
          ) : (
            <div className="news-list">
              {verifiedImportant.length > 0 ? (
                <>
                  {verifiedImportant.map((item) => (
                    <NewsFeedItem key={item.id} item={item} project={projectsById.get(item.projectId)} onOpenProject={openProject} />
                  ))}
                </>
              ) : null}
              {unverifiedImportant.length > 0 ? (
                <>
                  <h3 className="news-group-title muted">Chưa xác minh</h3>
                  {unverifiedImportant.map((item) => (
                    <NewsFeedItem key={item.id} item={item} project={projectsById.get(item.projectId)} onOpenProject={openProject} unverified />
                  ))}
                </>
              ) : null}
            </div>
          )}
        </section>

        <div className="stack">
          <section className="card stack news-panel">
            <div className="section-title">
              <h2>Deadline sắp hết</h2>
              <span className="muted">{urgent.length + soon.length} dự án</span>
            </div>
            {urgent.length + soon.length === 0 ? (
              <p className="muted">Không có hạn chót nào trong 14 ngày tới. Hạn đã qua hiển thị ở nhóm dưới.</p>
            ) : (
              <div className="deadline-list">
                {urgent.map((item) => (
                  <DeadlineRow key={item.projectId} item={item} today={today} urgent onOpenProject={openProject} />
                ))}
                {soon.map((item) => (
                  <DeadlineRow key={item.projectId} item={item} today={today} onOpenProject={openProject} />
                ))}
              </div>
            )}
            {expired.length > 0 ? (
              <details className="expired-group">
                <summary className="expired-group__summary">Đã qua hạn — giữ để tra cứu ({expired.length})</summary>
                <div className="deadline-list">
                  {expired.map((item) => (
                    <DeadlineRow key={item.projectId} item={item} today={today} expired onOpenProject={openProject} />
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

function NewsFeedItem({
  item,
  project,
  onOpenProject,
  unverified = false
}: {
  item: NewsItem
  project: Project | undefined
  onOpenProject: (id: string) => void
  unverified?: boolean
}): React.JSX.Element {
  const name = project?.name ?? 'Dự án không tồn tại'
  return (
    <article className={`news-item${unverified ? ' news-item--unverified' : ''}`}>
      <ProjectLogo projectId={item.projectId} name={name} hasLogo={Boolean(project?.logoPath)} size="news" />
      <div className="news-item__body">
        <div className="news-item__meta">
          <button type="button" className="news-item__project" data-lock-allow="true" onClick={() => onOpenProject(item.projectId)}>
            {name}
          </button>
          <span>{new Date(item.publishedAt).toLocaleString('vi-VN')}</span>
          <VerificationBadge verification={item.verification} />
        </div>
        <p>{item.summary}</p>
        <div className="news-item__meta">
          {item.sourceName ? <span>{item.sourceName}</span> : null}
          <ExternalLink url={item.sourceUrl}>Mở bài gốc</ExternalLink>
        </div>
      </div>
    </article>
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
  return (
    <button type="button" className={`deadline-item${urgent ? ' deadline-item--urgent' : ''}${expired ? ' deadline-item--expired' : ''}`} data-lock-allow="true" onClick={() => onOpenProject(item.projectId)}>
      <span className="deadline-item__main">
        <span className="deadline-item__name">{item.projectName}</span>
        <span className="muted">{item.date}</span>
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
      <input type="checkbox" id={`todo-${item.id}`} checked={done} onChange={onToggle} aria-label={`Đánh dấu đã xử lý: ${name}`} />
      <label htmlFor={`todo-${item.id}`} className="todo-item__body">
        <span className="todo-item__project">{name}</span>
        <span className="todo-item__summary">{item.summary}</span>
        <span className="todo-item__meta">
          {item.todoDeadline ? `Hạn: ${item.todoDeadline} · ` : ''}
          <VerificationBadge verification={item.verification} />
        </span>
      </label>
      <button type="button" className="news-item__project" data-lock-allow="true" onClick={() => onOpenProject(item.projectId)} aria-label={`Mở chi tiết ${name}`}>
        Chi tiết
      </button>
    </div>
  )
}
