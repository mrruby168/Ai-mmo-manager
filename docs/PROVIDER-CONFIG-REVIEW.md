# PROVIDER CONFIG REVIEW — MMO Manager

## 1. Preset mặc định — `src/shared/provider-presets.ts`

```ts
export const PROVIDER_PRESETS: Record<ProviderType, ProviderPreset> = {
  openai: {
    type: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    docsUrl: 'https://developers.openai.com/api/docs/',
    description: 'Chat Completions chính thức của OpenAI.'
  },
  anthropic: {
    type: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    docsUrl: 'https://platform.claude.com/docs/en/api/messages',
    description: 'Messages API, hỗ trợ tool calling và web search gốc.'
  },
  opencode: {
    type: 'opencode',
    name: 'OpenCode',
    baseUrl: 'https://opencode.ai/inference/openai/v1',
    docsUrl: 'https://opencode.ai/v2/docs/console/harnesses#base-urls',
    description: 'Gateway OpenAI-compatible của OpenCode Console.'
  },
  google: {
    type: 'google',
    name: 'Google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    docsUrl: 'https://ai.google.dev/gemini-api/docs',
    description: 'Gemini API, hỗ trợ function calling và Google Search grounding.'
  },
  custom: {
    type: 'custom',
    name: 'Custom',
    baseUrl: '',
    docsUrl: '',
    description: 'Endpoint OpenAI-compatible khác do bạn cấu hình.'
  }
}
```

## 2. Lưu Base URL — `src/renderer/src/features/settings/ProviderEditor.tsx`

```tsx
// dòng 94-98
const resolvedBaseUrl = baseUrl.trim().length > 0 ? baseUrl.trim() : null
if (isCustom && !resolvedBaseUrl) {
  setError('Provider Custom cần Base URL')
  return
}
```

```tsx
// dòng 367-381 (UI)
<Field
  label="Base URL"
  hint={
    isCustom
      ? 'Bắt buộc. Ví dụ: https://api.example.com/v1 (OpenAI-compatible).'
      : `Tùy chọn. Để trống dùng mặc định: ${preset.baseUrl}`   // <- LỜI HỨA SAI
  }
>
  <TextInput value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder={preset.baseUrl || 'https://...'} />
</Field>
```

Để trống thì lưu `null`, nhưng main **không** dùng `preset.baseUrl` để bù vào.

## 3. Chuẩn hoá + lấy kết nối — `src/main/ai/providerService.ts`

```ts
// dòng 89-108
function sanitiseProvider(provider: ProviderDraft): ProviderConfig {
  const parsed = providerConfigSchema.parse(provider)
  if (parsed.type === 'custom' && !parsed.baseUrl) {
    throw new ProviderError('INVALID_CONFIG', 'Provider Custom cần có Base URL')
  }
  ...
  return { id, type, name, baseUrl: parsed.baseUrl ?? null, models }   // null được giữ nguyên
}
```

```ts
// dòng 296-314
export function getModelConnection(providerId: string, modelId: string): ProviderConnection {
  const provider = findProvider(providerId)
  ...
  return {
    providerType: provider.type,
    baseUrl: provider.baseUrl,     // <- null nếu User để trống
    apiKey: secret.apiKey,
    headers: secret.headers,
    modelId: model.id,
    supportsWebSearch: model.supportsWebSearch
  }
}
```

## 4. Chọn client + build endpoint

`src/main/ai/providers/index.ts`

```ts
export function createModelClient(connection: ProviderConnection): ModelClient {
  switch (connection.providerType) {
    case 'anthropic': return createAnthropicClient(connection)
    case 'google':    return createGoogleClient(connection)
    case 'openai':    return createOpenAiCompatibleClient(connection, { useMaxCompletionTokens: true })
    case 'opencode':
    case 'custom':
    default:          return createOpenAiCompatibleClient(connection)   // <- dùng chung
  }
}
```

`src/main/ai/providers/openaiCompatible.ts`

```ts
// dòng 146-151
export function createOpenAiCompatibleClient(connection, options = {}): ModelClient {
  const endpoint = buildEndpoint(connection.baseUrl, 'https://api.openai.com/v1', '/chat/completions')
  //                                     ^ null                     ^ FALLBACK CỨNG = OPENAI
```

`src/main/ai/types.ts`

```ts
// dòng 111-114
export function buildEndpoint(baseUrl: string | null, fallback: string, suffix: string): string {
  const root = (baseUrl && baseUrl.trim().length > 0 ? baseUrl.trim() : fallback).replace(/\/+$/, '')
  return `${root}${suffix}`
}
```

So sánh: `google.ts:160` fallback `https://generativelanguage.googleapis.com/v1beta`, `anthropic.ts:137` fallback `https://api.anthropic.com/v1` → riêng OpenAI-compatible dùng **một fallback duy nhất**, không phân biệt `opencode`/`custom`.

## 5. Ràng buộc schema — `src/shared/schemas.ts`

```ts
const optionalUrl = z.string().trim().max(2048).nullable().optional()
  .refine((value) => !value || isHttpUrl(value), 'URL phải bắt đầu bằng http:// hoặc https://')

export const providerConfigSchema = z.object({
  id: z.string().trim().min(1).max(100),
  type: z.enum(PROVIDER_TYPES),
  name: z.string().trim().min(1).max(200),
  baseUrl: optionalUrl,
  models: z.array(modelConfigSchema).min(1).max(100)
})
```

## 6. Cấu hình thực tế đang lưu (`%APPDATA%\mmo-manager\settings.json`)

```
openrouter-free          | type=custom   | baseUrl=https://openrouter.ai/api/v1        | 4 models
wusrouter-free           | type=openai   | baseUrl=https://wusrouter.com/v1            | 3 models
google-mw4lmysa-ft9t71   | type=google   | baseUrl=<null>  -> OK, google.ts tự fallback | 1 model
river                    | type=openai   | baseUrl=https://api.river.ai/v1             | 1 model
opencode-mw4ptgmb-r1v1qw | type=opencode | baseUrl=<null>  -> LỖI                      | 1 model
lastSelection: openrouter-free / nvidia/nemotron-3-ultra-550b-a55b:free
```

## 7. Bảng lỗi

| # | Vị trí | Vấn đề | Hậu quả |
|---|---|---|---|
| 1 | `openaiCompatible.ts:150` | fallback cứng `api.openai.com` cho mọi type | `opencode` + baseUrl null → gửi key `oc_sk_…` tới OpenAI → `invalid_api_key` |
| 2 | `ProviderEditor.tsx:372` | hint “để trống dùng mặc định: {preset}” | User tin là đúng, nhưng code không bù preset |
| 3 | `providerService.ts:308` | trả `provider.baseUrl` thô, không resolve theo type | Không có chỗ nào biết `opencode` phải dùng URL nào |
| 4 | `ProviderEditor.tsx:94` | lưu `null` thay vì preset | Mọi provider tạo mới đều null nếu không nhập tay |
| 5 | `providers/index.ts:16-17` | `openai` dùng `max_completion_tokens` | Gateway bên thứ ba (`wusrouter`, `river`) có thể 400 nếu chỉ nhận `max_tokens` |

## 8. Case `custom`

- `custom` **không** bị lỗi #1 vì `sanitiseProvider` chặn khi thiếu `baseUrl` (“Provider Custom cần có Base URL”) và UI cũng chặn trước khi lưu.
- `custom` vẫn dùng `max_tokens` (đúng cho phần lớn gateway OpenAI-compatible).

## 9. Kết luận

Lỗi **không nằm ở key OpenCode** mà ở chỗ: `type: "opencode"` + Base URL trống → `baseUrl: null` → `buildEndpoint` rơi vào fallback OpenAI. Cùng một lỗi sẽ xảy ra với bất kỳ provider `opencode` nào tạo mới mà không nhập Base URL.

**Điểm sửa tối thiểu (1 chỗ):** trong `getModelConnection`, thay
`baseUrl: provider.baseUrl`
bằng
`baseUrl: provider.baseUrl ?? (PROVIDER_PRESETS[provider.type].baseUrl || null)`.

**Sửa triệt để:** truyền `fallbackBaseUrl` theo type vào `createOpenAiCompatibleClient` (bỏ hardcode OpenAI), và prefill Base URL khi tạo provider mới.

**Test cần thêm:** `type: opencode` + null → endpoint `opencode.ai/inference/openai/v1/chat/completions`; `type: openai` + null → vẫn là `api.openai.com`; `type: custom` + null → vẫn lỗi cấu hình.

Kèm 2 điểm đáng sửa khác trong file cấu hình hiện tại:
- `wusrouter-free` và `river` đang `type: "openai"` → gửi `max_completion_tokens`; nếu gateway chỉ nhận `max_tokens` sẽ 400, nên đổi sang `custom`.
- Provider `river` mới thêm cũng cần kiểm tra key/endpoint trước khi dùng cho Check News (cần `supportsWebSearch: true` mới chạy được).
