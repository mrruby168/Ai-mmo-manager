import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Project, RevenueEntry } from '@shared/types'
import type { ClaimStatus } from '@shared/constants'
import { formatAmount, formatUsd } from '@shared/format'
import { Button } from '../../common/Button'
import { EmptyState, ErrorBlock, LoadingBlock } from '../../common/EmptyState'
import { Field, Select, TextInput } from '../../common/Field'
import { ProjectLogo } from '../../common/ProjectLogo'
import { useApp } from '../../state/AppContext'
import { useLock } from '../../state/LockContext'
import { RevenueFormDialog } from './RevenueFormDialog'

const CLAIM_LABELS: Record<ClaimStatus, string> = {
  pending: 'Đang chờ',
  claimable: 'Có thể claim',
  claimed: 'Đã nhận'
}

export function RevenuePage(): React.JSX.Element {
  const { refreshData, dataVersion, openRevenue } = useApp()
  const { isAiBusy } = useLock()

  const [entries, setEntries] = useState<RevenueEntry[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [summary, setSummary] = useState<import('@shared/revenue-calc').RevenueTotals | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [claimFilter, setClaimFilter] = useState<'all' | ClaimStatus>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const load = useCallback(async () => {
    const [listResult, projectsResult, summaryResult] = await Promise.all([
      window.api.revenue.list(),
      window.api.projects.list(),
      window.api.revenue.summary()
    ])
    if (listResult.ok) {
      setEntries(listResult.data)
    } else {
      setError(listResult.error.message)
    }
    if (projectsResult.ok) {
      setProjects(projectsResult.data)
    }
    if (summaryResult.ok) {
      setSummary(summaryResult.data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load, dataVersion])

  const projectsById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects])

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return entries.filter((entry) => {
      if (projectFilter !== 'all' && entry.projectId !== projectFilter) {
        return false
      }
      if (claimFilter !== 'all' && entry.claimStatus !== claimFilter) {
        return false
      }
      if (normalizedQuery.length > 0) {
        const haystack =
          `${entry.projectNameSnapshot} ${entry.rewardSymbol} ${entry.note} ${entry.txHash ?? ''}`.toLowerCase()
        if (!haystack.includes(normalizedQuery)) {
          return false
        }
      }
      const dateValue = entry.receivedAt ?? entry.createdAt.slice(0, 10)
      if (fromDate && dateValue < fromDate) {
        return false
      }
      if (toDate && dateValue > toDate) {
        return false
      }
      return true
    })
  }, [entries, projectFilter, claimFilter, query, fromDate, toDate])

  if (loading && entries.length === 0) {
    return <LoadingBlock message="Đang tải dữ liệu doanh thu…" />
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header__title">
          <h1>Doanh thu</h1>
          <span className="page-header__subtitle">Tổng thu thực nhận · thưởng đang chờ · chi phí · lãi thực tế</span>
        </div>
        <Button variant="primary" disabled={isAiBusy} onClick={() => setFormOpen(true)}>
          Thêm khoản thưởng
        </Button>
      </div>

      {error ? <ErrorBlock message={error} action={<Button onClick={() => void load()}>Thử lại</Button>} /> : null}

      {summary ? (
        <div className="revenue-summary">
          <div className="summary-card">
            <span className="summary-card__label">Tổng thu thực nhận</span>
            <span className="summary-card__value summary-card__value--positive">{formatUsd(summary.realizedUsd)}</span>
            <span className="summary-card__hint">Các khoản đã nhận (không tính điểm)</span>
          </div>
          <div className="summary-card">
            <span className="summary-card__label">Thưởng đang chờ</span>
            <span className="summary-card__value summary-card__value--warning">{formatUsd(summary.pendingUsd)}</span>
            <span className="summary-card__hint">Ước tính của các khoản chưa nhận</span>
          </div>
          <div className="summary-card">
            <span className="summary-card__label">Tổng chi phí</span>
            <span className="summary-card__value summary-card__value--cost">{formatUsd(summary.totalCostUsd)}</span>
            <span className="summary-card__hint">Phí tham gia + phí giao dịch</span>
          </div>
          <div className="summary-card">
            <span className="summary-card__label">Lãi thực tế</span>
            <span className={`summary-card__value ${summary.netProfitUsd < 0 ? 'summary-card__value--negative' : 'summary-card__value--positive'}`}>
              {formatUsd(summary.netProfitUsd)}
            </span>
            <span className="summary-card__hint">Thực nhận − chi phí</span>
          </div>
        </div>
      ) : null}

      {summary && summary.unconverted.length > 0 ? (
        <p className="unconverted-note">
          Chưa quy đổi:{' '}
          {summary.unconverted.map((entry) => (
            <span key={entry.symbol} className="unconverted-symbol">
              {formatAmount(entry.amount, entry.symbol)}
              {'  '}
            </span>
          ))}
          · Các khoản chưa có giá trị USD không tính vào doanh thu.
        </p>
      ) : null}

      <div className="toolbar">
        <TextInput
          className="field__control search-input__control"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm theo dự án, symbol, ghi chú, Tx Hash…"
          aria-label="Tìm kiếm"
        />
        <Field label="Dự án">
          <Select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
            <option value="all">Tất cả dự án</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Trạng thái nhận">
          <Select value={claimFilter} onChange={(event) => setClaimFilter(event.target.value as 'all' | ClaimStatus)}>
            <option value="all">Tất cả</option>
            <option value="pending">Đang chờ</option>
            <option value="claimable">Có thể claim</option>
            <option value="claimed">Đã nhận</option>
          </Select>
        </Field>
        <Field label="Từ ngày">
          <TextInput type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        </Field>
        <Field label="Đến ngày">
          <TextInput type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        </Field>
        <span className="toolbar__spacer" />
        <span className="muted">{filtered.length} khoản</span>
      </div>

      {!error && filtered.length === 0 && entries.length > 0 ? (
        <EmptyState title="Không có khoản thưởng khớp bộ lọc" message="Thử xóa bớt điều kiện lọc." />
      ) : null}

      {!error && entries.length === 0 ? (
        <EmptyState
          title="Chưa có khoản thưởng nào"
          message="Thêm khoản thưởng đầu tiên để theo dõi thu nhập của bạn qua từng dự án."
          action={<Button variant="primary" onClick={() => setFormOpen(true)} disabled={isAiBusy}>Thêm khoản thưởng đầu tiên</Button>}
        />
      ) : null}

      {filtered.length > 0 ? (
        <div className="project-rows">
          {filtered.map((entry) => {
            const project = entry.projectId ? projectsById.get(entry.projectId) : undefined
            return (
              <button key={entry.id} type="button" className="revenue-row" data-lock-allow="true" onClick={() => openRevenue(entry.id)}>
                <span className="revenue-row__identity">
                  <ProjectLogo
                    projectId={entry.projectId ?? String(entry.id)}
                    name={entry.projectNameSnapshot}
                    hasLogo={Boolean(project?.logoPath)}
                    size="news"
                  />
                  <span>
                    <span className="revenue-row__name">{entry.projectNameSnapshot}</span>
                    {!entry.projectId ? <div className="revenue-row__meta">Không gắn dự án</div> : null}
                  </span>
                </span>
                <span className="revenue-row__details">
                  <span className="revenue-row__detail">
                    <span className="revenue-row__meta">Thưởng</span>
                    <strong>{formatAmount(entry.estimatedAmount ?? entry.receivedAmount ?? 0, entry.rewardSymbol)}</strong>
                    {entry.rewardKind !== 'points' && entry.estimatedUsd !== null ? (
                      <span className="revenue-row__meta"> ≈ {formatUsd(entry.estimatedUsd)}</span>
                    ) : null}
                  </span>
                  <span className="revenue-row__detail">
                    <span className="revenue-row__meta">Thực nhận</span>
                    <strong>{entry.claimStatus === 'claimed' ? formatAmount(entry.receivedAmount ?? 0, entry.rewardSymbol) : '—'}</strong>
                    {entry.claimStatus === 'claimed' && entry.rewardKind !== 'points' && entry.receivedUsd !== null ? (
                      <span className="revenue-row__meta"> ≈ {formatUsd(entry.receivedUsd)}</span>
                    ) : null}
                  </span>
                </span>
                <span className="revenue-row__status">
                  <span className={`claim-badge claim-badge--${entry.claimStatus}`}>{CLAIM_LABELS[entry.claimStatus]}</span>
                </span>
              </button>
            )
          })}
        </div>
      ) : null}

      <RevenueFormDialog
        open={formOpen}
        mode="create"
        projects={projects}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false)
          refreshData()
        }}
      />
    </>
  )
}
