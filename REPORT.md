Changed:
  - src/shared/provider-presets.ts: thêm 3 hàm thuần normaliseBaseUrl/resolveBaseUrl/joinEndpoint; chuẩn hóa logic baseUrl resolve
  - src/main/ai/types.ts: đổi ProviderConnection.baseUrl: string | null → string; xoá hàm buildEndpoint (không còn import)
  - src/main/ai/providerService.ts: getModelConnection dùng resolveBaseUrl và throw INVALID_CONFIG nếu custom thiếu Base URL; sanitiseProvider dùng normaliseBaseUrl; parseImport dùng normaliseBaseUrl
  - src/main/ai/providers/openaiCompatible.ts: import joinEndpoint từ @shared/provider-presets; buildEndpoint(...) → joinEndpoint(connection.baseUrl, '/chat/completions'); khôi phục các import bị xóa (AiError, extractErrorDetail, mapFetchFailure, mapHttpStatus)
  - src/main/ai/providers/anthropic.ts: import joinEndpoint, AiError, extractErrorDetail, mapFetchFailure, mapHttpStatus từ đúng nguồn; buildEndpoint(...) → joinEndpoint(connection.baseUrl, '/messages')
  - src/main/ai/providers/google.ts: import joinEndpoint từ @shared/provider-presets; buildEndpoint(...) → joinEndpoint(connection.baseUrl, '')
  - tests/: test cases bổ sung cho resolveBaseUrl, joinEndpoint, adapter fetch giả, schema, getModelConnection (205/205 pass)
  - PROJECT_MAP.json: thêm symbol src/shared/provider-presets.ts
  - PROGRESS.md: thêm checkpoint WI-15 FIX Provider config mặc định + Custom

Verified:
  - T1: npm run typecheck sạch (node + web); npm test 205/205 pass (20 file); npm run build xanh (main 208.96 kB, preload 5.11 kB, renderer CSS 40.09 kB, JS 776.81 kB) — [VERIFIED]
  - T2: Kiểm chứng logic resolveBaseUrl/joinEndpoint bằng vitest (stub fetch, không gọi mạng) — [VERIFIED] (xem test details bên dưới)
  - T3: Các test case:
    * resolveBaseUrl: opencode+null → https://opencode.ai/inference/openai/v1; openai+null → https://api.openai.com/v1; anthropic/google+null → preset tương ứng; custom+null/''/' ' → null; openai+'https://x.com/v1/' → https://x.com/v1 (bỏ / cuối)
    * joinEndpoint: ('https://a/v1/', '/chat/completions') và ('https://a/v1', '/chat/completions') cùng ra https://a/v1/chat/completions; suffix '' trả nguyên gốc
    * Adapter fetch giả (stub globalThis.fetch): opencode+URL preset → URL gọi là https://opencode.ai/inference/openai/v1/chat/completions, **không** chứa api.openai.com; openai → body max_completion_tokens; opencode/custom → body max_tokens; custom → đúng URL tự nhập; google/anthropic → đúng endpoint
    * getModelConnection (mock settingsStore/secretStore): custom+null → ném INVALID_CONFIG, fetch không được gọi; opencode+null → baseUrl = preset OpenCode (https://opencode.ai/inference/openai/v1)
    * saveProvider/Upload JSON: custom thiếu baseUrl bị từ chối kèm "Provider Custom cần có Base URL"; non-custom thiếu baseUrl hợp lệ
    * Mọi preset non-custom: http(s), không kết thúc bằng /
  - Grep "api.openai.com|generativelanguage|api.anthropic.com" trong src/: chỉ còn 3 dòng ở provider-presets.ts (và test), không còn ở code adapter

NOT RUN:
  - Electron GUI chạy thật (cần môi trường có app window, không có trong môi trường này)
  - AI thật (Scan/News/Chat với API key thật)
  - Web search thật từng provider (OpenAI-compatible/OpenCode/Custom và Gemini)
  - T2 user chạy app test từng Model (cần đóng app, đổi settings.json, mở lại)

Assumptions:  [ASSUMED]  - OpenCode docs: "Free-tier chat models require OpenCode; use paid models or Go from other clients" — xác nhận base URL OpenAI-compatible đúng (https://opencode.ai/inference/openai/v1), đường dẫn /chat/completions đúng, header Authorization: Bearer đúng; Tuy nhiên docs này cũng cảnh báo free-tier cần OpenCode, dùng paid hoặc Go từ clients khác → coi là [ASSUMED] behavior khi app Electron (client khác) gọi free model
  [ASSUMED] - Cổng bên thứ ba (wusrouter, river) chỉ nhận max_tokens thay vì max_completion_tokens — không khẳng định nhưng ghi nhận tác động có thể là 400; nên đề xuất đổi sang type "custom" (xem USER GUIDANCE)
  [ASSUMED] - Nếu user đổi type "openai" sang "custom" cho wusrouter-free/river, khóa API trong secrets.json vẫn còn hiệu lực vì gắn theo providerId, không cần tạo provider mới
  [ASSUMED] - Test adapter giả (stub fetch) mô phỏng đủ các trường hợp nhưng chưa thay thế test thực tế trên Electron GUI với mạng thật

Risks/unfinished:
  - Nếu user không đổi wusriver/river sang type "custom", gateway có thể trả 400 do gửi max_completion_tokens (nguy cơ nhưng chưa kiểm chứng trên thực tế)
  - OpenCode free model có thể bị chặn bởi chính sách "Free-tier chat models require OpenCode" — cần test thực tế hoặc dùng paid model
  - Code GUI/Test renderer chưa có (không cài jsdom/testing-library) → UI hành vi chỉ test bằng typecheck/build

Out-of-scope:
  - Thêm dependency mới, field mới vào schema, auto-swap model khi lỗi, thay đổi Design Pack, sửa settings.json thật của user
  - Migration dữ liệu cũ (baseUrl: null sẽ tự resolve đúng nhờ FIX-2, không cần migrate)

Cleanup:
  - none
  - LEFTOVER: kiểm tra lại các file test có chứa logic cũ liên quan buildEndpoint (đã được update nhưng vẫn tồn tại trong git history)

Sync:
  - PROJECT_MAP.json updated (thêm src/shared/provider-presets.ts, generated_at 2026-11-06)
  - PROGRESS.md updated (thêm WI-15 — FIX Provider config mặc định + Custom — DONE 2026-11-06)

---
Kết quả Grep hardcode URL:
  - Chạy: grep "api.openai.com|generativelanguage|api.anthropic.com" src/ --include="*.ts" --include="*.tsx"
  - Kết quả: Chỉ còn 3 dòng ở src/shared/provider-presets.ts (các preset definition: openai baseUrl, anthropic baseUrl, google baseUrl)
  - Kết luận: Code adapter đã được sửa hoàn toàn, không còn hardcode fallback OpenAI/Anthropic/Google

Danh sách chỗ tạo ProviderConnection (từ Grep ProviderConnection trong src/):
  - 15 matches tìm thấy, các file chính:
    * src/main/ai/types.ts: định nghĩa interface (baseUrl: string sau sửa)
    * src/main/ai/providerService.ts: getModelConnection (xử lý resolve), sanitiseProvider, parseImport
    * src/main/ai/providers/openaiCompatible.ts: createOpenAiCompatibleClient (sử dụng joinEndpoint)
    * src/main/ai/providers/anthropic.ts: createAnthropicClient (sử dụng joinEndpoint)
    * src/main/ai/providers/google.ts: createGoogleClient (sử dụng joinEndpoint)
    * src/main/ai/providers/index.ts: createModelClient (factory, case openai/custom/opencode)
    * src/renderer/src/features/settings/ProviderEditor.tsx: UI form (lưu baseUrl, handleSave)
    * Nguồn gốc: settings.json / %APPDATA%\mmo-manager\settings.json (dữ liệu thật)

Nguồn tài liệu FIX-7 và phần [ASSUMED]:
  - Docs OpenCode (opencode.ai): (a) Base URL OpenAI-compatible: https://opencode.ai/inference/openai/v1; (b) Đường dẫn: /chat/completions; (c) Header xác thực: Authorization: Bearer — ghi nhận nhưng [ASSUMED] do docs cũng bảo "Free-tier chat models require OpenCode; use paid models or Go from other clients", việc app Electron (client khác) gọi free model có thể bị chặn, chưa kiểm chứng thực tế
  - Design Pack ARCHITECTURE.md §9.1: ghi openaiCompatible phục vụ OpenAI/OpenCode/Custom với "Base URL cố định" cho OpenCode
  - UI_SPEC.json ProviderEditor: Custom thêm Tên Provider, URL/Base URL, Model ID, Headers;êu trường nâng cao ẩn mặc định

Test hiện có bị ảnh hưởng:
  - 205/205 test pass vẫn giữ nguyên (không bị phá bởi thay đổi)
  - tests/aiProviders.test.ts, tests/schemas.test.ts, tests/providerConfigFile.test.ts: đã bổ sung test case cho resolveBaseUrl, joinEndpoint, adapter fetch giả, schema, getModelConnection — tất cả pass
  - tests/providerConfigFile.test.ts vẫn pass với providers-current.json (đọc 5 provider + BeatAPI free supportsWebSearch: false)