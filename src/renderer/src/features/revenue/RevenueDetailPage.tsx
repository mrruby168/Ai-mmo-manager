import { useCallback, useEffect, useState } from 'react'
import type { Project, RevenueEntry } from '@shared/types'
import type { ClaimStatus } from '@shared/constants'
import { computeEntryProfitUsd } from '@shared/revenue-calc'
import { formatAmount, formatUsd } from '@shared/format'
import { Button } from '../../common/Button'
import { ErrorBlock, LoadingBlock } from '../../common/EmptyState'
import { ConfirmDialog } from '../../common/Modal'
import { ProjectLogo } from '../../common/ProjectLogo'
import { useApp } from '../../state/AppContext'
import { useLock } from '../../state/LockContext'
import { useToast } from '../../state/ToastContext'
import { RevenueFormDialog } from './RevenueFormDialog'

const CLAIM_LABELS: Record<ClaimStatus, string> = {
  pending: 'Đang chờ',
  claimable: 'Có thể claim',
  claimed: 'Đã nhận'
}

const KIND_LABELS: Record<string, string> = {
  cash: 'Tiền mặt',
  token: 'Token',
  points: 'Điểm'
}

export function RevenueDetailPage({ revenueId }: { revenueId: number }): React.JSX.Element {
  const { closeRevenue, refreshData } = useApp()
  const { isAiBusy } = useLock()
  const { pushToast } = useToast()

  const [entry, setEntry] = useState<RevenueEntry | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [attaching, setAttaching] = useState(false)

  const load = useCallback(async () => {
    const [entryResult, projectsResult] = await Promise.all([
      window.api.revenue.get(revenueId),
      window.api.projects.list()
    ])
    if (entryResult.ok) {
      setEntry(entryResult.data)
      setError(null)
    } else {
      setError(entryResult.error.message)
    }
    if (projectsResult.ok) {
      setProjects(projectsResult.data)
    }
    setLoading(false)
  }, [revenueId])

  useEffect(() => {
    void load()
  }, [load])

  async function handleDelete(): Promise<void> {
    setDeleting(true)
    const result = await window.api.revenue.remove(revenueId)
    setDeleting(false)
    setConfirmDelete(false)
    if (!result.ok) {
      pushToast(result.error.message, 'error')
      return
    }
    pushToast('Đã xóa khoản thưởng', 'success')
    refreshData()
    closeRevenue()
  }

  async function handleAttachEvidence(): Promise<void> {
    setAttaching(true)
    const result = await window.api.revenue.attachEvidence({ revenueId })
    setAttaching(false)
    if (!result.ok) {
      pushToast(result.error.message, 'error')
      return
    }
    if (result.data.fileName === null) {
      return
    }
    pushToast(`Đã đính kèm: ${result.data.fileName}`, 'success')
    refreshData()
  }

  if (loading && !entry) {
    return <LoadingBlock message="Đang tải khoản thưởng…" />
  }

  if (error && !entry) {
    return <ErrorBlock message={error} action={<Button onClick={() => void load()}>Thử lại</Button>} />
  }

  if (!entry) {
    return <ErrorBlock message="Không tìm thấy khoản thưởng." action={<Button onClick={closeRevenue}>Quay lại</Button>} />
  }

  const project = entry.projectId ? projects.find((item) => item.id === entry.projectId) : undefined
  const profit = computeEntryProfitUsd(entry)
  const isPoints = entry.rewardKind === 'points'
  const totalCost = entry.participationCostUsd + entry.txFeeUsd

  return (
    <>
      <div className="page-header">
        <div className="row" style={{ gap: '16px' }}>
          <Button variant="ghost" onClick={closeRevenue} aria-label="Quay lại">←</Button>
          <ProjectLogo
            projectId={entry.projectId ?? String(entry.id)}
            name={entry.projectNameSnapshot}
            hasLogo={Boolean(project?.logoPath)}
            size="detail"
          />
          <div className="page-header__title">
            <h1>{entry.projectNameSnapshot}</h1>
            <span className="page-header__subtitle">
              {KIND_LABELS[entry.rewardKind]} · {entry.rewardSymbol} · {CLAIM_LABELS[entry.claimStatus]}
              {project ? ` · ${project.category === 'airdrop' ? 'Airdrop' : 'Event MMO'}` : ' · Không gắn dự án'}
            </span>
          </div>
        </div>
        <div className="row">
          <Button variant="secondary" disabled={isAiBusy} onClick={() => setEditOpen(true)}>Sửa</Button>
          <Button variant="danger" disabled={isAiBusy} onClick={() => setConfirmDelete(true)}>Xóa</Button>
        </div>
      </div>

      <div className="revenue-detail-grid">
        <section className="card stack">
          <h2>Thưởng</h2>
          <dl className="definition-list">
            <dt>Ước tính</dt>
            <dd>
              {entry.estimatedAmount !== null ? `${formatAmount(entry.estimatedAmount, entry.rewardSymbol)}` : 'Chưa rõ'}
              {!isPoints && entry.estimatedUsd !== null ? <span className="muted"> (≈ {formatUsd(entry.estimatedUsd)})</span> : null}
            </dd>
            <dt>Thực nhận</dt>
            <dd>
              {entry.claimStatus === 'claimed' && entry.receivedAmount !== null
                ? formatAmount(entry.receivedAmount, entry.rewardSymbol)
                : 'Chưa nhận'}
              {!isPoints && entry.receivedUsd !== null ? <span className="muted"> (≈ {formatUsd(entry.receivedUsd)})</span> : null}
            </dd>
            <dt>Ngày nhận</dt>
            <dd>{entry.receivedAt ?? 'Chưa rõ'}</dd>
            <dt>Trạng thái</dt>
            <dd><span className={`claim-badge claim-badge--${entry.claimStatus}`}>{CLAIM_LABELS[entry.claimStatus]}</span></dd>
          </dl>
        </section>

        <section className="card stack">
          <h2>Chi phí</h2>
          <dl className="definition-list">
            <dt>Chi phí tham gia</dt>
            <dd>{formatUsd(entry.participationCostUsd)}</dd>
            <dt>Phí giao dịch</dt>
            <dd>{formatUsd(entry.txFeeUsd)}</dd>
            <dt>Tổng chi phí</dt>
            <dd><strong>{formatUsd(totalCost)}</strong></dd>
            <dt>Loại thưởng</dt>
            <dd>{KIND_LABELS[entry.rewardKind]}</dd>
          </dl>
        </section>

        <section className="card stack">
          <h2>Lãi / lỗ</h2>
          {profit === null ? (
            <p className="muted">
              {isPoints
                ? 'Điểm chưa quy đổi không tính vào lãi/lỗ USD.'
                : 'Chưa có giá trị thực nhận bằng USD nên chưa tính được lãi/lỗ.'}
            </p>
          ) : (
            <>
              <p className="summary-card__label">Lãi thực tế</p>
              <p className={`summary-card__value ${profit < 0 ? 'summary-card__value--negative' : 'summary-card__value--positive'}`}>
                {formatUsd(profit)}
              </p>
              <p className="muted">Thực nhận {entry.receivedUsd !== null ? formatUsd(entry.receivedUsd) : '—'} − chi phí {formatUsd(totalCost)}</p>
            </>
          )}
        </section>

        <section className="card stack">
          <h2>Bằng chứng</h2>
          <dl className="definition-list">
            <dt>Tx Hash</dt>
            <dd className="mono">{entry.txHash ?? '—'}</dd>
            <dt>Ghi chú bằng chứng</dt>
            <dd>{entry.evidenceNote ?? '—'}</dd>
            <dt>File bằng chứng</dt>
            <dd>
              {entry.evidenceFile ? (
                <span className="chip">{entry.evidenceFile}</span>
              ) : (
                <span className="muted">Chưa đính kèm</span>
              )}
            </dd>
            <dt>Ghi chú</dt>
            <dd>{entry.note || '—'}</dd>
          </dl>
          <div>
            <Button loading={attaching} disabled={isAiBusy || attaching} onClick={() => void handleAttachEvidence()}>
              Đính kèm file bằng chứng
            </Button>
          </div>
        </section>
      </div>

      <RevenueFormDialog
        open={editOpen}
        mode="edit"
        projects={projects}
        entry={entry}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false)
          refreshData()
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Xóa khoản thưởng"
        message={
          <p>
            Xóa khoản thưởng của <strong>{entry.projectNameSnapshot}</strong>? Thao tác này không thể hoàn tác.
          </p>
        }
        confirmLabel="Xóa"
        danger
        busy={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  )
}
