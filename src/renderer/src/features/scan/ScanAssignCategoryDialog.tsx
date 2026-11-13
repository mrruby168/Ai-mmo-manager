import type { ProjectCategory } from '@shared/constants'
import { Modal } from '../../common/Modal'
import { Button } from '../../common/Button'

export interface ScanAssignRow {
  index: number
  name: string
  website: string | null
}

interface ScanAssignCategoryDialogProps {
  open: boolean
  rows: ScanAssignRow[]
  /** Loại đã chọn theo vị trí dòng; dòng chưa chọn không có trong map. */
  value: Record<number, ProjectCategory>
  busy: boolean
  onChange: (index: number, category: ProjectCategory) => void
  onCancel: () => void
  onConfirm: () => void
}

const CATEGORY_OPTIONS: Array<{ value: ProjectCategory; label: string }> = [
  { value: 'event_mmo', label: 'Event MMO' },
  { value: 'airdrop', label: 'Airdrop' }
]

/**
 * Dự án "insufficient" không đủ bằng chứng nên AI không tự phân loại;
 * người dùng phải chọn Event MMO / Airdrop cho từng dự án trước khi thêm.
 * Trạng thái "Chưa xác minh" và nguồn bằng chứng được giữ nguyên.
 */
export function ScanAssignCategoryDialog({
  open,
  rows,
  value,
  busy,
  onChange,
  onCancel,
  onConfirm
}: ScanAssignCategoryDialogProps): React.JSX.Element | null {
  const complete = rows.length > 0 && rows.every((row) => value[row.index] !== undefined)

  return (
    <Modal
      open={open}
      title="Chọn loại dự án chưa xác minh"
      onClose={onCancel}
      closeDisabled={busy}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Hủy
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={!complete} loading={busy}>
            Xác nhận thêm
          </Button>
        </>
      }
    >
      <p className="muted">
        AI không đủ bằng chứng để tự phân loại các dự án dưới đây. Chọn loại cho từng dự án trước khi thêm;
        chúng sẽ được lưu với trạng thái Chưa xác minh.
      </p>
      <div className="stack" style={{ gap: 8 }}>
        {rows.map((row) => (
          <div className="row" key={row.index}>
            <div className="stack" style={{ gap: 2, minWidth: 0 }}>
              <strong>{row.name}</strong>
              {row.website ? (
                <span className="muted" style={{ overflowWrap: 'anywhere' }}>
                  {row.website}
                </span>
              ) : null}
            </div>
            <span className="spacer" />
            <div className="segmented" role="group" aria-label={`Loại của ${row.name}`}>
              {CATEGORY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`segmented__item${value[row.index] === option.value ? ' segmented__item--active' : ''}`}
                  aria-pressed={value[row.index] === option.value}
                  disabled={busy}
                  onClick={() => onChange(row.index, option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
