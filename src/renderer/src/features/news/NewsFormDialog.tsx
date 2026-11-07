import { useEffect, useState } from 'react'
import { MILESTONE_KINDS, NEWS_KINDS, VERIFICATION_STATES } from '@shared/constants'
import type { MilestoneKind, NewsKind, VerificationState } from '@shared/constants'
import { newsManualInputSchema } from '@shared/schemas'
import type { NewsItem, NewsManualInput, Project } from '@shared/types'
import { todayDateOnly } from '@shared/date-utils'
import { MILESTONE_LABEL } from '@shared/newsView'
import { Button } from '../../common/Button'
import { Field, Select, TextInput } from '../../common/Field'
import { Modal } from '../../common/Modal'

const KIND_LABEL: Record<NewsKind, string> = {
  important: 'Tin quan trọng mới',
  todo: 'Việc cần làm ngay'
}

function initialDate(item: NewsItem): string {
  if (item.kind === 'todo') {
    return item.todoDeadline ?? item.publishedAt.slice(0, 10)
  }
  if (item.milestoneKind && item.milestoneDate) {
    return item.milestoneDate
  }
  return item.publishedAt.slice(0, 10)
}

export interface NewsFormDialogProps {
  open: boolean
  projects: Project[]
  /** null = create, otherwise edit the existing row. */
  initial: NewsItem | null
  defaultKind: NewsKind
  /** Preselected milestone when adding from the Deadline panel. */
  defaultMilestone?: MilestoneKind | ''
  busy: boolean
  onClose: () => void
  onSubmit: (input: NewsManualInput) => Promise<void>
}

/** FIX 1: shared add/edit form for the three News panels (No AI Mode only). */
export function NewsFormDialog({
  open,
  projects,
  initial,
  defaultKind,
  defaultMilestone = '',
  busy,
  onClose,
  onSubmit
}: NewsFormDialogProps): React.JSX.Element {
  const [projectId, setProjectId] = useState('')
  const [kind, setKind] = useState<NewsKind>(defaultKind)
  const [summary, setSummary] = useState('')
  const [verification, setVerification] = useState<VerificationState>('unverified')
  const [date, setDate] = useState(todayDateOnly())
  const [milestoneKind, setMilestoneKind] = useState<MilestoneKind | ''>('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    setProjectId(initial?.projectId ?? projects[0]?.id ?? '')
    setKind(initial?.kind ?? defaultKind)
    setSummary(initial?.summary ?? '')
    setVerification(initial?.verification ?? 'unverified')
    setDate(initial ? initialDate(initial) : todayDateOnly())
    setMilestoneKind(initial?.milestoneKind ?? defaultMilestone)
    setSourceUrl(initial?.sourceUrl ?? '')
    setSourceName(initial?.sourceName ?? '')
    setError(null)
  }, [open, initial, defaultKind, defaultMilestone, projects])

  async function handleSubmit(): Promise<void> {
    const candidate = {
      projectId,
      kind,
      summary,
      verification,
      sourceUrl: sourceUrl.trim() ? sourceUrl.trim() : null,
      sourceName: sourceName.trim() ? sourceName.trim() : null,
      date,
      milestoneKind: kind === 'important' && milestoneKind ? milestoneKind : null
    }
    const parsed = newsManualInputSchema.safeParse(candidate)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      const path = first && first.path.length > 0 ? `${first.path.join('.')}: ` : ''
      setError(`${path}${first?.message ?? 'Dữ liệu không hợp lệ'}`)
      return
    }
    setError(null)
    await onSubmit({
      projectId: parsed.data.projectId,
      kind: parsed.data.kind,
      summary: parsed.data.summary,
      verification: parsed.data.verification,
      sourceUrl: parsed.data.sourceUrl ?? null,
      sourceName: parsed.data.sourceName ?? null,
      date: parsed.data.date,
      milestoneKind: parsed.data.milestoneKind ?? null
    })
  }

  return (
    <Modal
      open={open}
      title={initial ? 'Sửa tin / mốc' : 'Thêm tin / mốc'}
      closeDisabled={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Hủy
          </Button>
          <Button variant="primary" loading={busy} disabled={busy} onClick={() => void handleSubmit()}>
            Lưu
          </Button>
        </>
      }
    >
      <div className="stack">
        <p className="muted">Chỉ dùng ở No AI Mode. Mỗi dự án chỉ có một tin quan trọng.</p>
        <Field label="Dự án" htmlFor="news-form-project">
          <Select id="news-form-project" value={projectId} onChange={(event) => setProjectId(event.target.value)} disabled={busy}>
            {projects.length === 0 ? <option value="">Chưa có dự án</option> : null}
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Khung dữ liệu" htmlFor="news-form-kind">
          <Select
            id="news-form-kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as NewsKind)}
            disabled={busy}
          >
            {NEWS_KINDS.map((value) => (
              <option key={value} value={value}>
                {KIND_LABEL[value]}
              </option>
            ))}
          </Select>
        </Field>
        {kind === 'important' ? (
          <Field
            label="Loại mốc (không bắt buộc)"
            htmlFor="news-form-milestone"
            hint="Chọn mốc để mục này xuất hiện trong khung Deadline sắp hết."
          >
            <Select
              id="news-form-milestone"
              value={milestoneKind}
              onChange={(event) => setMilestoneKind(event.target.value as MilestoneKind | '')}
              disabled={busy}
            >
              <option value="">Không có mốc</option>
              {MILESTONE_KINDS.map((value) => (
                <option key={value} value={value}>
                  {MILESTONE_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Tóm tắt một dòng" htmlFor="news-form-summary" error={error}>
          <TextInput
            id="news-form-summary"
            value={summary}
            maxLength={280}
            placeholder="Ví dụ: Snapshot ngày 20/11, kiểm tra ví trước 24h"
            onChange={(event) => setSummary(event.target.value)}
            disabled={busy}
          />
        </Field>
        <Field
          label="Ngày"
          htmlFor="news-form-date"
          hint="Todo dùng làm hạn việc; tin quan trọng dùng làm ngày mốc (nếu có) hoặc ngày đăng."
        >
          <TextInput
            id="news-form-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            disabled={busy}
          />
        </Field>
        <Field label="Trạng thái xác minh" htmlFor="news-form-verification">
          <Select
            id="news-form-verification"
            value={verification}
            onChange={(event) => setVerification(event.target.value as VerificationState)}
            disabled={busy}
          >
            {VERIFICATION_STATES.map((value) => (
              <option key={value} value={value}>
                {value === 'verified' ? 'Đã xác minh' : 'Chưa xác minh'}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Link nguồn (nếu có)" htmlFor="news-form-source-url">
          <TextInput
            id="news-form-source-url"
            value={sourceUrl}
            placeholder="https://…"
            onChange={(event) => setSourceUrl(event.target.value)}
            disabled={busy}
          />
        </Field>
        <Field label="Tên nguồn (nếu có)" htmlFor="news-form-source-name">
          <TextInput
            id="news-form-source-name"
            value={sourceName}
            maxLength={200}
            onChange={(event) => setSourceName(event.target.value)}
            disabled={busy}
          />
        </Field>
      </div>
    </Modal>
  )
}
