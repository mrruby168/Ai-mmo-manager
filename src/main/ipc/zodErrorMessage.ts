import { ZodError } from 'zod'

export interface IpcErrorShape {
  code: string
  message: string
}

/**
 * Turns a zod error into a short IPC error. The channel name is included so a
 * renderer failure ("Invalid input") can be traced to the exact IPC call.
 */
export function formatZodError(error: ZodError, channel?: string): IpcErrorShape {
  const prefix = channel ? `${channel} → ` : ''
  const first = error.issues[0]
  if (!first) {
    return { code: 'INVALID_INPUT', message: `${prefix}Dữ liệu không hợp lệ` }
  }
  const path = first.path.length > 0 ? `${first.path.join('.')}: ` : ''
  const message =
    first.code === 'invalid_union'
      ? `${prefix}Payload không khớp định dạng nào được chấp nhận (${path || 'root'})`
      : `${prefix}${path}${first.message}`
  return { code: 'INVALID_INPUT', message }
}
