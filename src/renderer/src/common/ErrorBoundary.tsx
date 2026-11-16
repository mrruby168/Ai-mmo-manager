import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Chặn lỗi render làm React gỡ cả cây (cửa sổ tối trống).
 * Ghi log qua console.error để main process bắt được ở 'console-message'.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Lỗi hiển thị renderer:', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="error-boundary" role="alert">
          <h1>Đã xảy ra lỗi hiển thị</h1>
          <p>Ứng dụng gặp lỗi khi hiển thị giao diện. Bạn có thể tải lại để tiếp tục sử dụng.</p>
          <pre className="error-boundary__detail">{this.state.error.message}</pre>
          <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
            Tải lại
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
