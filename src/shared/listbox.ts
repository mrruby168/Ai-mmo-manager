export interface PopupAnchor {
  left: number
  top: number
  bottom: number
  width: number
}

export interface PopupRect {
  placement: 'below' | 'above'
  top: number
  left: number
  width: number
  maxHeight: number
}

export interface PopupBounds {
  viewportWidth: number
  viewportHeight: number
  /** Khoảng cách tối thiểu tới mép màn hình. */
  edge?: number
  /** Khoảng cách giữa trigger và popup. */
  gap?: number
  /** Chiều cao tối đa cho phép của popup. */
  maxHeight?: number
}

/**
 * Tính vị trí popup fixed theo trigger. Lật lên khi phía dưới không đủ chỗ
 * và phía trên rộng hơn, rồi kẹp trong viewport.
 */
export function computePopupRect(anchor: PopupAnchor, popupHeight: number, bounds: PopupBounds): PopupRect {
  const edge = bounds.edge ?? 8
  const gap = bounds.gap ?? 4
  const maxHeight = bounds.maxHeight ?? 280
  const availableBelow = bounds.viewportHeight - anchor.bottom - gap - edge
  const availableAbove = anchor.top - gap - edge
  const needed = Math.min(popupHeight, maxHeight)
  const placement = availableBelow < needed && availableAbove > availableBelow ? 'above' : 'below'
  const available = Math.max(0, placement === 'below' ? availableBelow : availableAbove)
  const height = Math.min(needed, available)
  const top = placement === 'below' ? anchor.bottom + gap : Math.max(edge, anchor.top - gap - height)
  const maxLeft = Math.max(edge, bounds.viewportWidth - anchor.width - edge)
  const left = Math.min(Math.max(anchor.left, edge), maxLeft)

  return {
    placement,
    top,
    left,
    width: Math.max(0, anchor.width),
    maxHeight: height
  }
}

/** Chỉ số kế tiếp, quay vòng; trả -1 khi danh sách rỗng. */
export function nextIndex(current: number, count: number, delta: 1 | -1): number {
  if (count <= 0) {
    return -1
  }
  if (current < 0 || current >= count) {
    return delta > 0 ? 0 : count - 1
  }
  return (current + delta + count) % count
}

export function edgeIndex(count: number, edge: 'first' | 'last'): number {
  if (count <= 0) {
    return -1
  }
  return edge === 'first' ? 0 : count - 1
}

/**
 * Gõ chữ để nhảy tới mục khớp tiền tố, bắt đầu tìm từ mục kế tiếp
 * để bấm cùng một chữ nhiều lần vẫn xoay vòng qua các mục.
 */
export function typeaheadMatch(labels: readonly string[], query: string, from: number): number {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0 || labels.length === 0) {
    return -1
  }
  for (let step = 1; step <= labels.length; step += 1) {
    const index = (Math.max(from, -1) + step + labels.length) % labels.length
    if (labels[index].toLowerCase().startsWith(needle)) {
      return index
    }
  }
  return -1
}
