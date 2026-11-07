const LOGO_HOST = 'logo'

/**
 * URL do renderer tạo: `mmo-logo://logo/<projectId>`.
 * Với scheme chuẩn, `host` là "logo" và `pathname` là "/<projectId>".
 * Hàm nhận cả dạng `mmo-logo:///<projectId>` để không phụ thuộc cách parse của Electron.
 */
export function parseLogoProjectId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'mmo-logo:') {
      return null
    }
    const segments = url.pathname.split('/').filter(Boolean)
    const candidate =
      segments.length > 0 ? segments[segments.length - 1] : url.hostname === LOGO_HOST ? '' : url.hostname
    if (!candidate) {
      return null
    }
    const projectId = decodeURIComponent(candidate).trim()
    return projectId.length > 0 ? projectId : null
  } catch {
    return null
  }
}
