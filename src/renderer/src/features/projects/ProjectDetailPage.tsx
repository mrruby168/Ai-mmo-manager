import { useCallback, useEffect, useState } from 'react'
import type { ProjectStatus } from '@shared/constants'
import type { Project } from '@shared/types'
import { getDeadlineInfo, todayDateOnly } from '@shared/date-utils'
import { Badge, CostBadge } from '../../common/Badge'
import { Button } from '../../common/Button'
import { ErrorBlock, LoadingBlock } from '../../common/EmptyState'
import { ExternalLink } from '../../common/ExternalLink'
import { ConfirmDialog } from '../../common/Modal'
import { ProjectLogo } from '../../common/ProjectLogo'
import { useApp } from '../../state/AppContext'
import { useLock } from '../../state/LockContext'
import { useToast } from '../../state/ToastContext'
import { ProjectFormDialog } from './ProjectFormDialog'

const STATUS_OPTIONS: Array<{ value: ProjectStatus; label: string }> = [
  { value: 'not_joined', label: 'Chưa tham gia' },
  { value: 'in_progress', label: 'Đang thực hiện' },
  { value: 'completed', label: 'Hoàn thành' }
]

const CATEGORY_LABEL = { event_mmo: 'Event MMO', airdrop: 'Airdrop' } as const

function payloadFrom(project: Project, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    category: project.category,
    name: project.name,
    website: project.website,
    socials: project.socials,
    taskSummary: project.taskSummary,
    howToJoin: project.howToJoin,
    startDate: project.startDate,
    endDate: project.endDate,
    costType: project.costType,
    costAmountUsd: project.costAmountUsd,
    status: project.status,
    verification: project.verification,
    sources: project.sources,
    notes: project.notes,
    ...overrides
  }
}

export function ProjectDetailPage({ projectId }: { projectId: string }): React.JSX.Element {
  const { closeProject, refreshData, dataVersion } = useApp()
  const { canMutate, beginUserEditing, endUserEditing } = useLock()
  const { pushToast } = useToast()

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [logoBusy, setLogoBusy] = useState<'file' | 'auto' | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await window.api.projects.get(projectId)
    if (result.ok) {
      setProject(result.data)
      setNotesDraft(result.data?.notes ?? '')
      setError(result.data ? null : 'Không tìm thấy dự án')
    } else {
      setError(result.error.message)
    }
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load, dataVersion])

  const closeForm = useCallback(() => setFormOpen(false), [])

  async function savePatch(overrides: Record<string, unknown>, successMessage: string): Promise<boolean> {
    if (!project) {
      return false
    }
    const result = await window.api.projects.update(project.id, payloadFrom(project, overrides), project.rowVersion)
    if (!result.ok) {
      pushToast(result.error.message, 'error')
      return false
    }
    setProject(result.data)
    setNotesDraft(result.data.notes)
    pushToast(successMessage, 'success')
    refreshData()
    return true
  }

  async function handleStatus(status: ProjectStatus): Promise<void> {
    if (!project || status === project.status) {
      return
    }
    await savePatch({ status }, 'Đã lưu trạng thái')
  }

  async function handleSaveNotes(): Promise<void> {
    setSavingNotes(true)
    const ok = await savePatch({ notes: notesDraft }, 'Đã lưu ghi chú')
    setSavingNotes(false)
    setNotesSaved(ok)
  }

  async function handleDelete(): Promise<void> {
    if (!project) {
      return
    }
    setDeleting(true)
    const result = await window.api.projects.remove(project.id)
    setDeleting(false)
    if (!result.ok) {
      pushToast(result.error.message, 'error')
      return
    }
    setConfirmDelete(false)
    pushToast('Đã xóa dự án', 'success')
    refreshData()
    closeProject()
  }

  async function handleLogo(mode: 'file' | 'auto'): Promise<void> {
    if (!project) {
      return
    }
    setLogoBusy(mode)
    const result = await window.api.projects.setLogo(
      mode === 'file' ? { id: project.id } : { id: project.id, autoFetch: true }
    )
    setLogoBusy(null)
    if (!result.ok) {
      pushToast(result.error.message, 'error')
      return
    }
    setProject(result.data.project)
    pushToast(result.data.message, result.data.logoUpdated ? 'success' : 'info')
    refreshData()
  }

  if (loading) {
    return <LoadingBlock message="Đang tải dự án…" />
  }

  if (error || !project) {
    return (
      <ErrorBlock
        message={error ?? 'Không tìm thấy dự án'}
        action={<Button onClick={closeProject}>Quay lại danh sách</Button>}
      />
    )
  }

  const deadline = getDeadlineInfo(project.endDate, todayDateOnly())
  const socialEntries = Object.entries(project.socials).flatMap(([key, value]) =>
    Array.isArray(value) ? value.map((url, index) => ({ key: `${key}-${index}`, label: key, url })) : value ? [{ key, label: key, url: value }] : []
  )

  return (
    <>
      <div className="page-header">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <Button variant="ghost" onClick={closeProject} aria-label="Quay lại danh sách">
            ←
          </Button>
          <ProjectLogo projectId={project.id} name={project.name} hasLogo={Boolean(project.logoPath)} size="detail" />
          <div className="page-header__title">
            <h1>{project.name}</h1>
            <div className="row">
              <Badge tone="neutral">{CATEGORY_LABEL[project.category]}</Badge>
              <CostBadge costType={project.costType} amountUsd={project.costAmountUsd} />
            </div>
          </div>
        </div>
        <div className="row">
          <Button variant="secondary" onClick={() => setFormOpen(true)} disabled={!canMutate}>
            Sửa
          </Button>
          <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={!canMutate}>
            Xóa
          </Button>
        </div>
      </div>

      <div className="project-detail">
        <section className="card project-detail__info">
          <div className="section-title">
            <h2>Thông tin dự án</h2>
            <div className="row">
              <Button
                size="sm"
                variant="secondary"
                loading={logoBusy === 'file'}
                disabled={!canMutate}
                onClick={() => void handleLogo('file')}
              >
                Đổi logo
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={logoBusy === 'auto'}
                disabled={!canMutate}
                onClick={() => void handleLogo('auto')}
              >
                Làm mới logo
              </Button>
            </div>
          </div>
          <dl className="definition-list" style={{ marginTop: 'var(--space-4)' }}>
            <dt>Website</dt>
            <dd>{project.website ? <ExternalLink url={project.website}>{project.website}</ExternalLink> : 'Chưa có'}</dd>
            <dt>Mạng xã hội</dt>
            <dd>
              {socialEntries.length === 0
                ? 'Chưa có'
                : socialEntries.map((entry) => (
                    <div key={entry.key}>
                      <ExternalLink url={entry.url}>{entry.label}</ExternalLink>
                    </div>
                  ))}
            </dd>
            <dt>Bắt đầu</dt>
            <dd>{project.startDate ?? 'Chưa rõ'}</dd>
            <dt>Kết thúc</dt>
            <dd>{project.endDate ?? 'Chưa rõ'}</dd>
            <dt>Còn lại</dt>
            <dd className={`deadline--${deadline.tone}`}>{deadline.text}</dd>
          </dl>
          <div className="project-detail__status">
            <h2>Trạng thái</h2>
            <div className="segmented" role="group" aria-label="Trạng thái dự án">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`segmented__item${project.status === option.value ? ' segmented__item--active' : ''}`}
                  aria-pressed={project.status === option.value}
                  disabled={!canMutate}
                  onClick={() => void handleStatus(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="card project-detail__tasks">
          <h2>Thông tin nhiệm vụ</h2>
          <div className="stack" style={{ marginTop: 'var(--space-4)' }}>
            <div>
              <div className="muted">Nội dung nhiệm vụ</div>
              <p className="project-detail__text">{project.taskSummary || 'Chưa có'}</p>
            </div>
            <div>
              <div className="muted">Cách tham gia</div>
              <p className="project-detail__text">{project.howToJoin || 'Chưa có'}</p>
            </div>
          </div>
        </section>

        <section className="card project-detail__notes">
          <h2>Ghi chú</h2>
          <div className="stack" style={{ marginTop: 'var(--space-4)' }}>
            <textarea
              className="field__control project-detail__notes-input"
              value={notesDraft}
              disabled={!canMutate}
              onChange={(event) => {
                setNotesDraft(event.target.value)
                setNotesSaved(false)
              }}
              onFocus={() => void beginUserEditing()}
              onBlur={() => void endUserEditing()}
            />
            <div className="row">
              <Button variant="primary" size="sm" loading={savingNotes} disabled={!canMutate} onClick={() => void handleSaveNotes()}>
                Lưu ghi chú
              </Button>
              {notesSaved ? <span className="muted">Đã lưu</span> : null}
            </div>
          </div>
        </section>
      </div>

      <ProjectFormDialog
        open={formOpen}
        mode="edit"
        project={project}
        defaultCategory={project.category}
        onClose={closeForm}
        onSaved={(updated) => {
          setProject(updated)
          setNotesDraft(updated.notes)
          refreshData()
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        danger
        busy={deleting}
        title="Xóa dự án?"
        message={
          <div className="stack">
            <p>
              Bạn sắp xóa <strong>{project.name}</strong> ({project.id}).
            </p>
            <p className="muted">Khoản doanh thu liên quan được giữ lại (không gắn dự án). Tin tức của dự án sẽ bị xóa.</p>
          </div>
        }
        confirmLabel="Xóa dự án"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void handleDelete()}
      />
    </>
  )
}
