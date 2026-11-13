import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AppSettings,
  DeadlineItem,
  NewsImportPreview,
  NewsItem,
  NewsManualInput,
  Project
} from '@shared/types'
import type { MilestoneKind, NewsKind } from '@shared/constants'
import { todayDateOnly } from '@shared/date-utils'
import {
  MILESTONE_LABEL,
  buildDeadlineRows,
  formatDmy,
  oneLine,
  selectTopImportantPerProject
} from '@shared/newsView'
import { canImportNews } from '@shared/newsAccess'
import {
  appSearchConfigured,
  chainWarnings,
  effectiveChain,
  firstRunnable,
  listModelChoices
} from '@shared/modelConfig'
import { ProjectLogo } from '../../common/ProjectLogo'
import { Button } from '../../common/Button'
import { AiActivityLog } from '../../common/AiActivityLog'
import { EmptyState, ErrorBlock, LoadingBlock } from '../../common/EmptyState'
import { ExternalLink } from '../../common/ExternalLink'
import { Modal, ConfirmDialog } from '../../common/Modal'
import { useApp } from '../../state/AppContext'
import { useLock } from '../../state/LockContext'
import { useToast } from '../../state/ToastContext'
import { NewsFormDialog } from './NewsFormDialog'

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

function deadlineBadge(daysRemaining: number): string {
  if (daysRemaining < 0) {
    return 'Overdue'
  }
  if (daysRemaining === 0) {
    return 'Today'
  }
  return `${daysRemaining} day`
}

export function NewsPage(): React.JSX.Element {
  const { refreshData, dataVersion, openProject, isAiEnabled } = useApp()
  const { isAiBusy, isBusy } = useLock()
  const { pushToast } = useToast()
  const newsBusy = isBusy('news')

  const [important, setImportant] = useState<NewsItem[]>([])
  const [todos, setTodos] = useState<NewsItem[]>([])
  const [projectsById, setProjectsById] = useState<Map<string, Project>>(new Map())
  const [settings, setSettings] = useState<AppSettings | null>(null)
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

  const [formOpen, setFormOpen] = useState(false)
  const [formInitial, setFormInitial] = useState<NewsItem | null>(null)
  const [formKind, setFormKind] = useState<NewsKind>('important')
  const [formMilestone, setFormMilestone] = useState<MilestoneKind | ''>('')
  const [formBusy, setFormBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<NewsItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [logExpanded, setLogExpanded] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const [listResult, projectsResult, settingsResult] = await Promise.all([
      window.api.news.list(),
      window.api.projects.list(),
      window.api.settings.get()
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

    if (settingsResult.ok) {
      setSettings(settingsResult.data)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load, dataVersion])

  // Đổi sang AI Mode thì đóng ngay các hộp thoại chỉ dành cho No AI Mode.
  useEffect(() => {
    if (!canImportNews(isAiEnabled)) {
      setImportPreview(null)
      setFormOpen(false)
      setDeleteTarget(null)
    }
  }, [isAiEnabled])

  /** Log nằm cuối trang: cuộn tới để người dùng thấy tiến trình khi vừa bấm Check News. */
  function revealLog(): void {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    logRef.current?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  async function handleCheck(): Promise<void> {
    if (checking || promptLoading || newsBusy) {
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

    if (newsModelWarning) {
      pushToast(newsModelWarning, 'error')
      return
    }

    revealLog()
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
    if (isAiBusy) {
      return
    }
    const result = await window.api.news.toggleTodo(item.id, !item.isDone)
    if (!result.ok) {
      pushToast(result.error.message, 'error')
      return
    }
    refreshData()
  }

  function openCreate(kind: NewsKind, milestone: MilestoneKind | '' = ''): void {
    setFormInitial(null)
    setFormKind(kind)
    setFormMilestone(milestone)
    setFormOpen(true)
  }

  function openEdit(item: NewsItem): void {
    setFormInitial(item)
    setFormKind(item.kind)
    setFormMilestone(item.milestoneKind ?? '')
    setFormOpen(true)
  }

  async function handleFormSubmit(input: NewsManualInput): Promise<void> {
    setFormBusy(true)
    const result = formInitial
      ? await window.api.news.update(formInitial.id, input)
      : await window.api.news.create(input)
    setFormBusy(false)
    if (!result.ok) {
      pushToast(result.error.message, 'error')
      return
    }
    setFormOpen(false)
    pushToast(formInitial ? 'Đã cập nhật tin' : 'Đã thêm tin', 'success')
    refreshData()
  }

  async function handleDelete(): Promise<void> {
    if (!deleteTarget || deleting) {
      return
    }
    setDeleting(true)
    const result = await window.api.news.remove(deleteTarget.id)
    setDeleting(false)
    if (!result.ok) {
      pushToast(result.error.message, 'error')
      return
    }
    setDeleteTarget(null)
    pushToast('Đã xóa tin', 'success')
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

  const newsById = new Map([...important, ...todos].map((item) => [item.id, item]))
  const canEdit = canImportNews(isAiEnabled)
  const projects = [...projectsById.values()]

  const providers = settings?.ai.providers ?? []
  const modelChoices = listModelChoices(providers)
  const appSearch = appSearchConfigured(settings?.webSearch ?? null)
  const newsChain = effectiveChain(
    'news',
    settings?.ai.taskModels.news ?? [],
    settings?.ai.lastSelection ?? null
  )
  const newsWarnings = chainWarnings('news', newsChain, modelChoices, appSearch)
  const newsRunnable = firstRunnable('news', newsChain, modelChoices, appSearch)
  let newsModelWarning: string | null = null
  if (isAiEnabled && !newsRunnable) {
    newsModelWarning =
      newsChain.length === 0
        ? 'Chưa có Model cho Check News. Vào Settings → Model Configuration để chọn A1.'
        : `${newsWarnings[0]?.message ?? 'Không có Model nào dùng được cho Check News.'} Vào Settings → Model Configuration để chọn model khác.`
  }

  if (loading && important.length === 0 && todos.length === 0) {
    return <LoadingBlock message="Đang tải tin tức…" />
  }

  return (
    <div className="news-page">
      <div className="page-header">
        <div className="page-header__title">
          <h1>News</h1>
        </div>
        <div className="row row--wrap">
          {canEdit ? (
            <Button variant="secondary" loading={importOpening} disabled={isAiBusy || importOpening || importBusy} onClick={() => void handleImportPreview()}>
              Import News
            </Button>
          ) : null}
          <Button
            variant="primary"
            loading={checking || promptLoading}
            disabled={newsBusy || checking || promptLoading || (isAiEnabled && newsModelWarning !== null)}
            title={isAiEnabled && newsModelWarning ? newsModelWarning : undefined}
            onClick={() => void handleCheck()}
          >
            Check News
          </Button>
        </div>
      </div>

      <div className="news-page__meta">
        <span className="news-page__dot" aria-hidden="true" />
        <span>
          {lastCheckedAt ? `Kiểm tra gần nhất: ${new Date(lastCheckedAt).toLocaleString('vi-VN')}` : 'Chưa kiểm tra lần nào'} · 7 ngày gần nhất
        </span>
      </div>

      {isAiEnabled && newsModelWarning ? (
        <div className="banner banner--warning" role="alert">
          {newsModelWarning}
        </div>
      ) : null}

      {error ? <ErrorBlock message={error} action={<Button onClick={() => void load()}>Thử lại</Button>} /> : null}

      <div className="news-grid">
        <section className="card stack news-panel news-panel--important">
          <div className="section-title news-panel__head">
            <h2>
              <span aria-hidden="true">🔔</span> Tin quan trọng mới
            </h2>
            <div className="row row--wrap">
              <span className="muted">{topImportant.length} dự án</span>
              {canEdit ? (
                <Button size="sm" variant="secondary" onClick={() => openCreate('important')}>
                  Thêm
                </Button>
              ) : null}
            </div>
          </div>

          {topImportant.length === 0 ? (
            <EmptyState
              title="Chưa có tin nào"
              message={
                isAiEnabled
                  ? 'Bấm Check News để AI tìm tin trong 7 ngày gần nhất.'
                  : 'Bấm Thêm để nhập tin, hoặc Import News từ file JSON.'
              }
            />
          ) : (
            <div className="news-panel__scroll">
              {topImportant.map((item) => (
                <ImportantCard
                  key={item.id}
                  item={item}
                  project={projectsById.get(item.projectId)}
                  onOpenProject={openProject}
                  onEdit={canEdit ? () => openEdit(item) : null}
                  onDelete={canEdit ? () => setDeleteTarget(item) : null}
                />
              ))}
            </div>
          )}
        </section>

        <section className="card stack news-panel">
          <div className="section-title news-panel__head">
            <h2>
              <span aria-hidden="true">⏰</span> Deadline sắp hết
            </h2>
              <div className="row row--wrap">
                <span className="muted">{urgent.length + soon.length} mốc</span>
                {canEdit ? (
                  <Button size="sm" variant="secondary" onClick={() => openCreate('important', 'end')}>
                    Thêm
                  </Button>
                ) : null}
              </div>
            </div>
            {urgent.length + soon.length === 0 && expired.length === 0 ? (
              <p className="muted">Không có hạn chót nào trong 14 ngày tới.</p>
            ) : (
              <div className="news-panel__scroll">
                {urgent.length + soon.length === 0 ? (
                  <p className="muted">Không có hạn chót nào trong 14 ngày tới. Hạn đã qua hiển thị ở nhóm dưới.</p>
                ) : null}
                {urgent.map((item) => (
                  <DeadlineCard
                    key={`${item.projectId}-${item.kind}-${item.date}`}
                    item={item}
                    onOpenProject={openProject}
                    onEdit={
                      canEdit && item.newsId != null && newsById.get(item.newsId)
                        ? () => openEdit(newsById.get(item.newsId as number)!)
                        : null
                    }
                    onDelete={
                      canEdit && item.newsId != null && newsById.get(item.newsId)
                        ? () => setDeleteTarget(newsById.get(item.newsId as number)!)
                        : null
                    }
                  />
                ))}
                {soon.map((item) => (
                  <DeadlineCard
                    key={`${item.projectId}-${item.kind}-${item.date}`}
                    item={item}
                    onOpenProject={openProject}
                    onEdit={
                      canEdit && item.newsId != null && newsById.get(item.newsId)
                        ? () => openEdit(newsById.get(item.newsId as number)!)
                        : null
                    }
                    onDelete={
                      canEdit && item.newsId != null && newsById.get(item.newsId)
                        ? () => setDeleteTarget(newsById.get(item.newsId as number)!)
                        : null
                    }
                  />
                ))}
                {expired.length > 0 ? (
                  <details className="expired-group">
                    <summary className="expired-group__summary">Đã qua hạn — giữ để tra cứu ({expired.length})</summary>
                    {expired.map((item) => (
                      <DeadlineCard
                        key={`${item.projectId}-${item.kind}-${item.date}`}
                        item={item}
                        onOpenProject={openProject}
                        onEdit={
                          canEdit && item.newsId != null && newsById.get(item.newsId)
                            ? () => openEdit(newsById.get(item.newsId as number)!)
                            : null
                        }
                        onDelete={
                          canEdit && item.newsId != null && newsById.get(item.newsId)
                            ? () => setDeleteTarget(newsById.get(item.newsId as number)!)
                            : null
                        }
                      />
                    ))}
                  </details>
                ) : null}
              </div>
            )}
          </section>

          <section className="card stack news-panel">
            <div className="section-title news-panel__head">
              <h2>
                <span aria-hidden="true">🎯</span> Việc cần làm ngay
              </h2>
              <div className="row row--wrap">
                <span className="muted">{todos.filter((item) => !item.isDone).length} chưa xử lý</span>
                {canEdit ? (
                  <Button size="sm" variant="secondary" onClick={() => openCreate('todo')}>
                    Thêm
                  </Button>
                ) : null}
              </div>
            </div>
            {todos.length === 0 ? (
              <p className="muted">
                {isAiEnabled
                  ? 'Chưa có việc nào. Check News sẽ liệt kê việc cần làm trong ngày.'
                  : 'Chưa có việc nào. Bấm Thêm để nhập việc cần làm.'}
              </p>
            ) : (
              <div className="news-panel__scroll">
                {[...verifiedTodos, ...unverifiedTodos].map((item) => (
                  <TodoCard
                    key={item.id}
                    item={item}
                    project={projectsById.get(item.projectId)}
                    locked={isAiBusy}
                    onToggle={() => void handleToggleTodo(item)}
                    onOpenProject={openProject}
                    onEdit={canEdit ? () => openEdit(item) : null}
                    onDelete={canEdit ? () => setDeleteTarget(item) : null}
                  />
                ))}
                {doneTodos.map((item) => (
                  <TodoCard
                    key={item.id}
                    item={item}
                    project={projectsById.get(item.projectId)}
                    done
                    locked={isAiBusy}
                    onToggle={() => void handleToggleTodo(item)}
                    onOpenProject={openProject}
                    onEdit={canEdit ? () => openEdit(item) : null}
                    onDelete={canEdit ? () => setDeleteTarget(item) : null}
                  />
                ))}
              </div>
            )}
          </section>
      </div>

      <div className="ai-log-actions">
        <button
          type="button"
          className="ai-log-actions__button"
          aria-expanded={logExpanded}
          onClick={() => setLogExpanded((current) => !current)}
        >
          {logExpanded ? 'Thu gọn nhật ký' : 'Mở rộng nhật ký'}
        </button>
      </div>

      <div ref={logRef}>
        <AiActivityLog
          channel="news"
          className={logExpanded ? 'ai-log--expanded' : undefined}
          emptyText="Chưa có hoạt động. Bấm Check News để bắt đầu."
        />
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

      <NewsFormDialog
        open={formOpen}
        projects={projects}
        initial={formInitial}
        defaultKind={formKind}
        defaultMilestone={formMilestone}
        busy={formBusy}
        onClose={() => setFormOpen(false)}
        onSubmit={handleFormSubmit}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Xóa tin / mốc"
        message={
          deleteTarget
            ? `Xóa "${oneLine(deleteTarget.summary, 80)}"? Hành động này không thể hoàn tác.`
            : ''
        }
        confirmLabel="Xóa"
        danger
        busy={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

function CardActions({
  onEdit,
  onDelete
}: {
  onEdit: (() => void) | null
  onDelete: (() => void) | null
}): React.JSX.Element | null {
  if (!onEdit && !onDelete) {
    return null
  }
  return (
    <span className="news-card__actions">
      {onEdit ? (
        <Button size="sm" variant="ghost" iconOnly aria-label="Sửa tin" title="Sửa" onClick={onEdit}>
          ✎
        </Button>
      ) : null}
      {onDelete ? (
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          aria-label="Xóa tin"
          title="Xóa"
          onClick={onDelete}
        >
          🗑
        </Button>
      ) : null}
    </span>
  )
}

function ImportantCard({
  item,
  project,
  onOpenProject,
  onEdit,
  onDelete
}: {
  item: NewsItem
  project: Project | undefined
  onOpenProject: (id: string) => void
  onEdit: (() => void) | null
  onDelete: (() => void) | null
}): React.JSX.Element {
  const name = project?.name ?? 'Dự án không tồn tại'
  const summary = oneLine(item.summary, 160)
  const unverified = item.verification !== 'verified'
  return (
    <article className="news-card">
      <button
        type="button"
        className="news-card__open"
        data-lock-allow="true"
        title={`${name} · ${item.summary}`}
        onClick={() => onOpenProject(item.projectId)}
      >
        <span className="news-card__logo">
          <ProjectLogo projectId={item.projectId} name={name} hasLogo={Boolean(project?.logoPath)} size="news" />
        </span>
        <span className="news-card__line">
          <span className="news-card__name">{name}</span>
          <span className="news-card__text">{summary}</span>
        </span>
      </button>
      {unverified ? <span className="news-card__flag">Chưa xác minh</span> : null}
      {item.sourceUrl ? (
        <ExternalLink url={item.sourceUrl} className="news-card__link" ariaLabel="Mở bài gốc">
          {null}
        </ExternalLink>
      ) : null}
      <CardActions onEdit={onEdit} onDelete={onDelete} />
    </article>
  )
}

function DeadlineCard({
  item,
  onOpenProject,
  onEdit,
  onDelete
}: {
  item: DeadlineItem
  onOpenProject: (id: string) => void
  onEdit: (() => void) | null
  onDelete: (() => void) | null
}): React.JSX.Element {
  return (
    <article className="news-card news-card--deadline">
      <button
        type="button"
        className="news-card__open"
        data-lock-allow="true"
        title={`${item.projectName} · ${MILESTONE_LABEL[item.kind]} ${formatDmy(item.date)}`}
        onClick={() => onOpenProject(item.projectId)}
      >
        <span className="news-card__logo">
          <ProjectLogo projectId={item.projectId} name={item.projectName} hasLogo={Boolean(item.logoPath)} size="news" />
        </span>
        <span className="news-card__line">
          <span className="news-card__name">{item.projectName}</span>
          <span className="news-card__text">
            {MILESTONE_LABEL[item.kind]} {formatDmy(item.date)}
          </span>
        </span>
      </button>
      {item.verification !== 'verified' ? <span className="news-card__flag">Chưa xác minh</span> : null}
      <span className="news-card__badge">{deadlineBadge(item.daysRemaining)}</span>
      <CardActions onEdit={onEdit} onDelete={onDelete} />
    </article>
  )
}

function TodoCard({
  item,
  project,
  done = false,
  locked = false,
  onToggle,
  onOpenProject,
  onEdit,
  onDelete
}: {
  item: NewsItem
  project: Project | undefined
  done?: boolean
  locked?: boolean
  onToggle: () => void
  onOpenProject: (id: string) => void
  onEdit: (() => void) | null
  onDelete: (() => void) | null
}): React.JSX.Element {
  const name = project?.name ?? 'Dự án không tồn tại'
  return (
    <article className={`news-card news-card--todo${done ? ' news-card--done' : ''}`}>
      <input
        className="news-card__check"
        type="checkbox"
        id={`todo-${item.id}`}
        checked={done}
        disabled={locked}
        onChange={onToggle}
        aria-label={`Đánh dấu đã xử lý: ${name}`}
      />
      <button
        type="button"
        className="news-card__open"
        data-lock-allow="true"
        title={item.summary}
        onClick={() => onOpenProject(item.projectId)}
      >
        <span className="news-card__logo">
          <ProjectLogo projectId={item.projectId} name={name} hasLogo={Boolean(project?.logoPath)} size="news" />
        </span>
        <span className="news-card__body">
          <span className="news-card__line">
            <span className="news-card__name">{name}</span>
          </span>
          <span className="news-card__text news-card__text--single">{oneLine(item.summary, 160)}</span>
        </span>
      </button>
      {item.verification !== 'verified' ? <span className="news-card__flag">Chưa xác minh</span> : null}
      <CardActions onEdit={onEdit} onDelete={onDelete} />
    </article>
  )
}
