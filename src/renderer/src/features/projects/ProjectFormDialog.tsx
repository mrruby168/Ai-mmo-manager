import { useEffect, useMemo, useState } from 'react'
import type { CostType, ProjectCategory, ProjectStatus } from '@shared/constants'
import { normalizeNameKey } from '@shared/normalize'
import type { Project } from '@shared/types'
import { Button } from '../../common/Button'
import { Field, Select, TextInput, Textarea } from '../../common/Field'
import { Modal } from '../../common/Modal'
import { useLock } from '../../state/LockContext'
import { useToast } from '../../state/ToastContext'

export type ProjectFormMode = 'create' | 'edit'

interface FormState {
  category: ProjectCategory
  name: string
  website: string
  x: string
  discord: string
  telegram: string
  other: string
  taskSummary: string
  howToJoin: string
  startDate: string
  endDate: string
  costType: CostType
  costAmountUsd: string
  status: ProjectStatus
}

function emptyForm(category: ProjectCategory): FormState {
  return {
    category,
    name: '',
    website: '',
    x: '',
    discord: '',
    telegram: '',
    other: '',
    taskSummary: '',
    howToJoin: '',
    startDate: '',
    endDate: '',
    costType: 'unverified',
    costAmountUsd: '',
    status: 'not_joined'
  }
}

function fromProject(project: Project): FormState {
  return {
    category: project.category,
    name: project.name,
    website: project.website ?? '',
    x: project.socials.x ?? '',
    discord: project.socials.discord ?? '',
    telegram: project.socials.telegram ?? '',
    other: (project.socials.other ?? []).join('\n'),
    taskSummary: project.taskSummary,
    howToJoin: project.howToJoin,
    startDate: project.startDate ?? '',
    endDate: project.endDate ?? '',
    costType: project.costType,
    costAmountUsd: project.costAmountUsd === null ? '' : String(project.costAmountUsd),
    status: project.status
  }
}

function buildPayload(form: FormState): Record<string, unknown> {
  const other = form.other
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean)

  return {
    category: form.category,
    name: form.name.trim(),
    website: form.website.trim() || null,
    socials: {
      x: form.x.trim() || undefined,
      discord: form.discord.trim() || undefined,
      telegram: form.telegram.trim() || undefined,
      other: other.length > 0 ? other : undefined
    },
    taskSummary: form.taskSummary.trim(),
    howToJoin: form.howToJoin.trim(),
    startDate: form.startDate || null,
    endDate: form.endDate || null,
    costType: form.costType,
    costAmountUsd: form.costType === 'paid' ? Number(form.costAmountUsd) : null,
    status: form.status
  }
}

export function ProjectFormDialog({
  open,
  mode,
  project,
  defaultCategory,
  onClose,
  onSaved
}: {
  open: boolean
  mode: ProjectFormMode
  project?: Project | null
  defaultCategory: ProjectCategory
  onClose: () => void
  onSaved: (project: Project) => void
}): React.JSX.Element {
  const { beginUserEditing, endUserEditing, isAiBusy } = useLock()
  const { pushToast } = useToast()
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultCategory))
  const [otherProjects, setOtherProjects] = useState<Project[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    setForm(mode === 'edit' && project ? fromProject(project) : emptyForm(defaultCategory))
    setError(null)
    void (async () => {
      const allowed = await beginUserEditing()
      if (!allowed) {
        pushToast('AI đang thực thi, chưa thể mở form', 'error')
        onClose()
      }
    })()

    return () => {
      void endUserEditing()
    }
  }, [open, mode, project?.id, defaultCategory, beginUserEditing, endUserEditing, pushToast, onClose])

  useEffect(() => {
    if (!open) {
      return
    }
    let active = true
    void window.api.projects.list(form.category).then((result) => {
      if (active && result.ok) {
        setOtherProjects(result.data)
      }
    })
    return () => {
      active = false
    }
  }, [open, form.category])

  const duplicateName = useMemo(() => {
    const key = normalizeNameKey(form.name)
    if (!key) {
      return null
    }
    const match = otherProjects.find(
      (candidate) => candidate.id !== project?.id && normalizeNameKey(candidate.name) === key
    )
    return match ?? null
  }, [form.name, otherProjects, project?.id])

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleSave(): Promise<void> {
    if (!form.name.trim()) {
      setError('Tên dự án không được rỗng')
      return
    }
    if (form.costType === 'paid' && (!form.costAmountUsd || Number(form.costAmountUsd) < 0)) {
      setError('Dự án có phí phải nhập số tiền USD hợp lệ')
      return
    }
    if (form.startDate && form.endDate && form.startDate > form.endDate) {
      setError('Ngày kết thúc phải sau ngày bắt đầu')
      return
    }

    setSaving(true)
    setError(null)
    const payload = buildPayload(form)
    const result =
      mode === 'edit' && project
        ? await window.api.projects.update(project.id, payload, project.rowVersion)
        : await window.api.projects.create(payload)
    setSaving(false)

    if (!result.ok) {
      setError(result.error.message)
      return
    }

    pushToast(mode === 'edit' ? 'Đã lưu dự án' : 'Đã thêm dự án', 'success')
    onSaved(result.data)
    onClose()
  }

  return (
    <Modal
      open={open}
      wide
      closeDisabled={saving}
      title={mode === 'edit' ? 'Sửa dự án' : 'Thêm dự án'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button variant="primary" onClick={() => void handleSave()} loading={saving} disabled={isAiBusy}>
            {mode === 'edit' ? 'Lưu thay đổi' : 'Thêm dự án'}
          </Button>
        </>
      }
    >
      {error ? (
        <div className="banner banner--error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="form-grid">
        <Field label="Loại dự án">
          <Select value={form.category} onChange={(event) => update('category', event.target.value as ProjectCategory)}>
            <option value="event_mmo">Event MMO</option>
            <option value="airdrop">Airdrop</option>
          </Select>
        </Field>
        <Field label="Tên dự án" error={duplicateName ? `Trùng tên với dự án đã có: ${duplicateName.name}` : null}>
          <TextInput value={form.name} maxLength={200} onChange={(event) => update('name', event.target.value)} />
        </Field>
        <Field label="Website" hint="Có thể nhập abc.com, app tự thêm https://" className="form-grid__full">
          <TextInput value={form.website} onChange={(event) => update('website', event.target.value)} />
        </Field>
        <Field label="X (Twitter)">
          <TextInput value={form.x} onChange={(event) => update('x', event.target.value)} />
        </Field>
        <Field label="Discord">
          <TextInput value={form.discord} onChange={(event) => update('discord', event.target.value)} />
        </Field>
        <Field label="Telegram">
          <TextInput value={form.telegram} onChange={(event) => update('telegram', event.target.value)} />
        </Field>
        <Field label="Mạng xã hội khác" hint="Mỗi dòng một link, có thể nhập link trần như abc.com">
          <Textarea value={form.other} onChange={(event) => update('other', event.target.value)} />
        </Field>
        <Field label="Nội dung nhiệm vụ" className="form-grid__full">
          <Textarea value={form.taskSummary} onChange={(event) => update('taskSummary', event.target.value)} />
        </Field>
        <Field label="Cách tham gia" className="form-grid__full">
          <Textarea value={form.howToJoin} onChange={(event) => update('howToJoin', event.target.value)} />
        </Field>
        <Field label="Ngày bắt đầu">
          <TextInput type="date" value={form.startDate} onChange={(event) => update('startDate', event.target.value)} />
        </Field>
        <Field label="Ngày kết thúc">
          <TextInput type="date" value={form.endDate} onChange={(event) => update('endDate', event.target.value)} />
        </Field>
        <Field label="Chi phí">
          <Select value={form.costType} onChange={(event) => update('costType', event.target.value as CostType)}>
            <option value="unverified">Chưa xác minh</option>
            <option value="free">FREE</option>
            <option value="paid">Có phí</option>
          </Select>
        </Field>
        {form.costType === 'paid' ? (
          <Field label="Số tiền (USD)">
            <TextInput
              type="number"
              min="0"
              step="0.01"
              value={form.costAmountUsd}
              onChange={(event) => update('costAmountUsd', event.target.value)}
            />
          </Field>
        ) : null}
        <Field label="Trạng thái">
          <Select value={form.status} onChange={(event) => update('status', event.target.value as ProjectStatus)}>
            <option value="not_joined">Chưa tham gia</option>
            <option value="in_progress">Đang thực hiện</option>
            <option value="completed">Hoàn thành</option>
          </Select>
        </Field>
      </div>
    </Modal>
  )
}
