import { useEffect, useMemo, useState } from 'react'
import type { Project, RevenueEntry } from '@shared/types'
import type { ClaimStatus, RewardKind } from '@shared/constants'
import { REWARD_KINDS } from '@shared/constants'
import { Button } from '../../common/Button'
import { Field, Select, Textarea, TextInput } from '../../common/Field'
import { Modal } from '../../common/Modal'
import { useToast } from '../../state/ToastContext'

interface RevenueFormDialogProps {
  open: boolean
  mode: 'create' | 'edit'
  projects: Project[]
  entry?: RevenueEntry | null
  onClose: () => void
  onSaved: (entry: RevenueEntry) => void
}

const CLAIM_OPTIONS: Array<{ value: ClaimStatus; label: string }> = [
  { value: 'pending', label: 'Đang chờ' },
  { value: 'claimable', label: 'Có thể claim' },
  { value: 'claimed', label: 'Đã nhận' }
]

const REWARD_LABELS: Record<RewardKind, string> = {
  cash: 'Tiền mặt',
  token: 'Token',
  points: 'Điểm'
}

function parseNumber(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return null
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

export function RevenueFormDialog({ open, mode, projects, entry, onClose, onSaved }: RevenueFormDialogProps): React.JSX.Element {
  const { pushToast } = useToast()
  const [projectId, setProjectId] = useState('')
  const [snapshot, setSnapshot] = useState('')
  const [rewardKind, setRewardKind] = useState<RewardKind>('token')
  const [rewardSymbol, setRewardSymbol] = useState('')
  const [estimatedAmount, setEstimatedAmount] = useState('')
  const [estimatedUsd, setEstimatedUsd] = useState('')
  const [receivedAmount, setReceivedAmount] = useState('')
  const [receivedUsd, setReceivedUsd] = useState('')
  const [receivedAt, setReceivedAt] = useState('')
  const [claimStatus, setClaimStatus] = useState<ClaimStatus>('pending')
  const [participationCostUsd, setParticipationCostUsd] = useState('0')
  const [txFeeUsd, setTxFeeUsd] = useState('0')
  const [txHash, setTxHash] = useState('')
  const [evidenceNote, setEvidenceNote] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const isPoints = rewardKind === 'points'
  const isEdit = mode === 'edit'

  useEffect(() => {
    if (open) {
      if (entry) {
        setProjectId(entry.projectId ?? '')
        setSnapshot(entry.projectNameSnapshot)
        setRewardKind(entry.rewardKind)
        setRewardSymbol(entry.rewardSymbol)
        setEstimatedAmount(entry.estimatedAmount?.toString() ?? '')
        setEstimatedUsd(entry.estimatedUsd?.toString() ?? '')
        setReceivedAmount(entry.receivedAmount?.toString() ?? '')
        setReceivedUsd(entry.receivedUsd?.toString() ?? '')
        setReceivedAt(entry.receivedAt ?? '')
        setClaimStatus(entry.claimStatus)
        setParticipationCostUsd(String(entry.participationCostUsd ?? 0))
        setTxFeeUsd(String(entry.txFeeUsd ?? 0))
        setTxHash(entry.txHash ?? '')
        setEvidenceNote(entry.evidenceNote ?? '')
        setNote(entry.note)
      } else {
        setProjectId('')
        setSnapshot('')
        setRewardKind('token')
        setRewardSymbol('')
        setEstimatedAmount('')
        setEstimatedUsd('')
        setReceivedAmount('')
        setReceivedUsd('')
        setReceivedAt('')
        setClaimStatus('pending')
        setParticipationCostUsd('0')
        setTxFeeUsd('0')
        setTxHash('')
        setEvidenceNote('')
        setNote('')
      }
      setError(null)
    }
  }, [open, entry])

  const selectedProject = useMemo(() => projects.find((project) => project.id === projectId) ?? null, [projects, projectId])

  useEffect(() => {
    if (selectedProject && !isEdit) {
      setSnapshot(selectedProject.name)
    }
  }, [selectedProject, isEdit])

  async function handleSave(): Promise<void> {
    setError(null)
    const symbol = rewardSymbol.trim().toUpperCase()
    if (symbol.length === 0) {
      setError('Nhập ký hiệu thưởng (USDT, XYZ…)')
      return
    }

    const effectiveSnapshot = projectId ? (selectedProject?.name ?? snapshot) : snapshot.trim()
    if (effectiveSnapshot.trim().length === 0) {
      setError('Nhập tên dự án hoặc chọn dự án có sẵn')
      return
    }

    const parseNullable = (value: string): number | null => {
      const parsed = parseNumber(value)
      return Number.isNaN(parsed) ? Number.NaN : parsed
    }
    const cost = parseNullable(participationCostUsd)
    const fee = parseNullable(txFeeUsd)
    if (Number.isNaN(cost) || Number.isNaN(fee)) {
      setError('Chi phí và phí giao dịch phải là số')
      return
    }
    const estimatedAmountValue = parseNullable(estimatedAmount)
    const estimatedUsdValue = isPoints ? null : parseNullable(estimatedUsd)
    const receivedAmountValue = parseNullable(receivedAmount)
    const receivedUsdValue = isPoints ? null : parseNullable(receivedUsd)
    if (
      Number.isNaN(estimatedAmountValue) ||
      (estimatedUsdValue !== null && Number.isNaN(estimatedUsdValue)) ||
      Number.isNaN(receivedAmountValue) ||
      (receivedUsdValue !== null && Number.isNaN(receivedUsdValue))
    ) {
      setError('Số tiền không hợp lệ')
      return
    }

    if (claimStatus === 'claimed' && !isPoints && receivedAmountValue === null) {
      setError('Khoản đã nhận phải có số lượng thực nhận')
      return
    }

    setSaving(true)
    const result = await window.api.revenue.save({
      projectId: projectId.length > 0 ? projectId : null,
      projectNameSnapshot: effectiveSnapshot.trim().slice(0, 200),
      rewardKind,
      rewardSymbol: symbol,
      estimatedAmount: estimatedAmountValue,
      estimatedUsd: estimatedUsdValue,
      receivedAmount: receivedAmountValue,
      receivedUsd: receivedUsdValue,
      receivedAt: receivedAt.length > 0 ? receivedAt : null,
      claimStatus,
      participationCostUsd: cost ?? 0,
      txFeeUsd: fee ?? 0,
      txHash: txHash.trim().length > 0 ? txHash.trim() : null,
      evidenceNote: evidenceNote.trim().length > 0 ? evidenceNote.trim() : null,
      note: note.trim()
    }, entry?.id)
    setSaving(false)

    if (!result.ok) {
      setError(result.error.message)
      pushToast(result.error.message, 'error')
      return
    }
    pushToast(isEdit ? 'Đã lưu khoản thưởng' : 'Đã thêm khoản thưởng', 'success')
    onSaved(result.data)
  }

  return (
    <Modal
      open={open}
      wide
      title={isEdit ? 'Sửa khoản thưởng' : 'Thêm khoản thưởng'}
      onClose={onClose}
      closeDisabled={saving}
      footer={
        <div className="row" style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void handleSave()}>
            Lưu
          </Button>
        </div>
      }
    >
      {error ? (
        <div className="banner banner--error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="form-grid">
        <Field label="Dự án" className="form-grid__full">
          <Select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">Không gắn dự án</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Tên dự án (snapshot)" className="form-grid__full">
          <TextInput
            value={projectId && selectedProject ? selectedProject.name : snapshot}
            onChange={(event) => setSnapshot(event.target.value)}
            disabled={Boolean(projectId && selectedProject)}
            placeholder="Tên hiển thị kể cả khi dự án bị xóa"
            maxLength={200}
          />
        </Field>

        <Field label="Loại thưởng">
          <Select value={rewardKind} onChange={(event) => setRewardKind(event.target.value as RewardKind)}>
            {REWARD_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {REWARD_LABELS[kind]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Ký hiệu (USDT, XYZ…)">
          <TextInput value={rewardSymbol} onChange={(event) => setRewardSymbol(event.target.value)} maxLength={20} placeholder="USDT" />
        </Field>

        <Field label={isPoints ? 'Số điểm ước tính' : 'Số lượng ước tính'}>
          <TextInput inputMode="decimal" value={estimatedAmount} onChange={(event) => setEstimatedAmount(event.target.value)} placeholder="0" />
        </Field>
        {!isPoints ? (
          <Field label="Giá trị ước tính (USD)">
            <TextInput inputMode="decimal" value={estimatedUsd} onChange={(event) => setEstimatedUsd(event.target.value)} placeholder="0.00" />
          </Field>
        ) : null}

        <Field label="Trạng thái nhận">
          <Select value={claimStatus} onChange={(event) => setClaimStatus(event.target.value as ClaimStatus)}>
            {CLAIM_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        {!isPoints ? (
          <Field label="Ngày nhận">
            <TextInput type="date" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} />
          </Field>
        ) : (
          <Field label="Ngày nhận">
            <TextInput type="date" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} />
          </Field>
        )}

        <Field label={isPoints ? 'Số điểm thực nhận' : 'Số lượng thực nhận'}>
          <TextInput inputMode="decimal" value={receivedAmount} onChange={(event) => setReceivedAmount(event.target.value)} placeholder="0" />
        </Field>
        {!isPoints ? (
          <Field label="Giá trị thực nhận (USD)">
            <TextInput inputMode="decimal" value={receivedUsd} onChange={(event) => setReceivedUsd(event.target.value)} placeholder="0.00" />
          </Field>
        ) : null}

        <Field label="Chi phí tham gia (USD)">
          <TextInput inputMode="decimal" value={participationCostUsd} onChange={(event) => setParticipationCostUsd(event.target.value)} placeholder="0.00" />
        </Field>
        <Field label="Phí giao dịch (USD)">
          <TextInput inputMode="decimal" value={txFeeUsd} onChange={(event) => setTxFeeUsd(event.target.value)} placeholder="0.00" />
        </Field>

        <Field label="Transaction Hash" className="form-grid__full">
          <TextInput className="mono" value={txHash} onChange={(event) => setTxHash(event.target.value)} placeholder="0x…" spellCheck={false} />
        </Field>

        <Field label="Ghi chú bằng chứng" className="form-grid__full">
          <Textarea value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} placeholder="Kênh, ảnh chụp, liên kết giao dịch…" />
        </Field>

        <Field label="Ghi chú" className="form-grid__full">
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ghi chú cho khoản thưởng này…" />
        </Field>
      </div>

      {isPoints ? (
        <p className="points-hint">Điểm chưa quy đổi không được tính vào doanh thu USD. Nhập số điểm ở mục thực nhận khi đã nhận.</p>
      ) : null}
    </Modal>
  )
}
