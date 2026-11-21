import { PROJECT_PAGE_SIZES } from '@shared/projectList'
import type { ProjectPageSize } from '@shared/projectList'
import { Button } from './Button'
import { Select } from './Field'

function pageWindow(page: number, pageCount: number): Array<number | 'gap'> {
  const wanted = new Set([1, pageCount, page - 1, page, page + 1])
  const sorted = [...wanted].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b)
  const result: Array<number | 'gap'> = []
  sorted.forEach((n, index) => {
    if (index > 0 && n - sorted[index - 1] > 1) {
      result.push('gap')
    }
    result.push(n)
  })
  return result
}

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
  onPageSize
}: {
  page: number
  pageCount: number
  total: number
  pageSize: ProjectPageSize
  onPage: (page: number) => void
  onPageSize: (size: ProjectPageSize) => void
}): React.JSX.Element {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <nav className="pagination" aria-label="Phân trang">
      <span className="pagination__info">
        {from}–{to} / {total} dự án
      </span>
      <div className="pagination__pages">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Trước
        </Button>
        {pageWindow(page, pageCount).map((entry, index) =>
          entry === 'gap' ? (
            <span key={`gap-${index}`} className="pagination__gap" aria-hidden="true">
              …
            </span>
          ) : (
            <Button
              key={entry}
              size="sm"
              variant={entry === page ? 'primary' : 'ghost'}
              aria-current={entry === page ? 'page' : undefined}
              onClick={() => onPage(entry)}
            >
              {entry}
            </Button>
          )
        )}
        <Button size="sm" variant="secondary" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          Sau
        </Button>
      </div>
      <label className="pagination__size">
        <span className="visually-hidden">Số dự án mỗi trang</span>
        <Select value={pageSize} onChange={(event) => onPageSize(Number(event.target.value) as ProjectPageSize)}>
          {PROJECT_PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size} / trang
            </option>
          ))}
        </Select>
      </label>
    </nav>
  )
}
