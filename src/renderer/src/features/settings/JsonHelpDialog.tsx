import { useState } from 'react'
import { Button } from '../../common/Button'
import { Modal } from '../../common/Modal'

const SAMPLE_JSON = `{
  "schemaVersion": "1.0",
  "apiKey": "sk-...",
  "providers": [
    {
      "id": "openai-main",
      "type": "openai",
      "name": "OpenAI",
      "baseUrl": null,
      "models": [
        {
          "id": "gpt-5",
          "label": "GPT-5",
          "supportsWebSearch": true,
          "supportsTools": true,
          "costTier": "paid"
        }
      ]
    }
  ]
}`

const COMMON_ERRORS = [
  'JSON sai cú pháp: thiếu dấu phẩy, thừa dấu phẩy cuối hoặc dùng nháy đơn. Sửa bằng trình soạn thảo có kiểm tra JSON.',
  'Thiếu "schemaVersion": bắt buộc là chuỗi "1.0".',
  '"providers" phải là mảng có ít nhất 1 phần tử.',
  '"type" chỉ nhận: openai, anthropic, opencode, google, custom.',
  '"models" phải có ít nhất 1 Model; mỗi Model cần "id" và "label".',
  'Provider "custom" bắt buộc có "baseUrl" dạng http:// hoặc https://.',
  '"id" của Provider không được trùng nhau trong cùng file.'
]

export function JsonHelpDialog({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  async function copySample(): Promise<void> {
    try {
      await navigator.clipboard.writeText(SAMPLE_JSON)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Modal
      open={open}
      wide
      title="Hướng dẫn Upload JSON"
      onClose={onClose}
      footer={<Button onClick={onClose}>Đóng</Button>}
    >
      <div className="help-block">
        <h3>1. Chuẩn bị file</h3>
        <p className="muted">
          Tạo một file <span className="mono">.json</span> lưu bằng UTF-8. File có thể chứa một hoặc nhiều Provider, mỗi
          Provider có một hoặc nhiều Model. App kiểm tra toàn bộ file trước khi lưu: chỉ cần một trường sai là không có gì
          được ghi.
        </p>
      </div>

      <div className="help-block">
        <h3>2. Trường bắt buộc</h3>
        <ul className="help-list">
          <li>
            <span className="mono">schemaVersion</span>: đúng chuỗi <span className="mono">"1.0"</span>.
          </li>
          <li>
            <span className="mono">providers</span>: mảng 1–10 Provider.
          </li>
          <li>
            Mỗi Provider: <span className="mono">type</span>, <span className="mono">name</span>,{' '}
            <span className="mono">models</span>. <span className="mono">id</span> có thể bỏ trống, app tự tạo.
          </li>
          <li>
            Mỗi Model: <span className="mono">id</span>, <span className="mono">label</span>. Các cờ{' '}
            <span className="mono">supportsTools</span>, <span className="mono">supportsWebSearch</span>,{' '}
            <span className="mono">costTier</span> có thể bỏ trống (mặc định false/free).
          </li>
          <li>
            <span className="mono">apiKey</span> đặt ở cấp file (dùng chung) hoặc trong từng Provider. Khóa được mã hóa
            bằng hệ điều hành và không hiển thị lại.
          </li>
          <li>
            <span className="mono">headers</span> tùy chọn: object các header bổ sung, dùng cho Provider Custom.
          </li>
        </ul>
      </div>

      <div className="help-block">
        <div className="section-title">
          <h3>3. JSON mẫu</h3>
          <Button size="sm" onClick={() => void copySample()}>
            {copied ? 'Đã copy' : 'Copy'}
          </Button>
        </div>
        <pre>{SAMPLE_JSON}</pre>
      </div>

      <div className="help-block">
        <h3>4. Lỗi thường gặp</h3>
        <ul className="help-list">
          {COMMON_ERRORS.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      </div>

      <p className="muted">
        Lưu ý: file xuất cấu hình (Export) không chứa API Key. Nếu Upload lại file Export, cần nhập khóa cho từng Provider
        trước khi Test hoặc chạy AI.
      </p>
    </Modal>
  )
}
