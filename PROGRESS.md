## WI-16 — AI Mode / No AI Mode + Import News — DONE (2026-11-06)
- Changed:
  - Shared: `src/shared/constants.ts` (AI_MODES/AiMode); `src/shared/types.ts` (AppSettings.aiMode, NewsPromptResult, NewsImportPreview/Result/Rejection types, RendererApi); `src/shared/schemas.ts` (aiModeSchema); `src/shared/ipc-channels.ts` (settings:setAiMode, news:buildPrompt, news:importPreview, news:importConfirm); NEW `src/shared/newsPrompt.ts` (buildNewsPrompt, promptDateOnly, startOfTodayUtc7, isWithinNewsWindow, newsResultJsonSchema)
  - Main: NEW `src/main/ai/aiMode.ts` (AiDisabledError, assertAiEnabled, isAiEnabled); gates in `checkNewsService.ts`, `scanService.ts`, `chatService.ts` (send + choose), `providerService.ts` (testProvider); `guard.ts` maps AI_DISABLED; `settingsStore.ts` normalizes/saves aiMode; NEW `src/main/services/newsPromptService.ts`, NEW `src/main/services/newsImportService.ts`; `newsService.ts` exports newsDedupeHash; `newsIpc.ts` prompt + import preview/confirm (token cache)
  - IPC/preload: `settingsIpc.ts`, `payloadSchemas.ts` (aiModePayload, newsImportConfirmPayload), `src/preload/index.ts`
  - Renderer: `AppContext.tsx` (aiMode/isAiEnabled), NEW `AiModePanel.tsx`, `SettingsPage.tsx`, `ChatPanel.tsx`, `ScanPage.tsx`, `NewsPage.tsx` (prompt modal + Import News), `styles/components.css`
  - Tests: NEW `tests/aiMode.test.ts`, `tests/newsPrompt.test.ts`, `tests/newsImport.test.ts`; `tests/ipcPayloads.test.ts` extended
- Decisions/assumed:
  - Legacy settings.json without `aiMode` → `'ai'`; `schemaVersion` stays 1 (no migration). Switching modes never deletes keys/providers/chat/data.
  - Gating is in the main process at the service entry points, UI state is not a security boundary; error code `AI_DISABLED`.
  - Prompt is built from the real `newsResultSchema` via `z.toJSONSchema` (drops `$schema`) so it cannot drift; only incomplete projects + current date (UTC+7), missing socials become "không có".
  - Import runs in both modes; OS file dialog stays in main; renderer only gets a token, never a path. Size limit `LIMITS.importMaxBytes` (10 MB), BOM stripped.
  - Per-item validation: a bad item (schema/URL) is rejected alone, keeping valid rows; only invalid JSON or a wrong `{items:[...]}` shape rejects the whole file and disables Confirm.
  - 7-day window = last 7 calendar days in Asia/Bangkok including today; empty `{"items":[]}` is valid → "Không có tin mới". Confirm uses `lockManager` (`mutating: true`) and `saveNewsBatch` dedupe.
- Verify: `npm run typecheck` PASS; `npm test` PASS (23 files / 229 tests); `npm run build` PASS (main 222.40 kB, preload 5.52 kB, renderer 786.90 kB). Earlier test run was 23/228 before adding the per-item URL test.
- Not manually verified: running the Electron UI, the real OS file dialog, and clipboard write in No AI Mode (no GUI session here).
- Next: user chạy app kiểm tra trực tiếp: đổi mode qua Settings, Chat FAB/Scan bị chặn, Check News ra Prompt + Copy, Import News với file thật (hợp lệ / lỗi JSON / tin cũ > 7 ngày / trùng).
- Open: None

## WI-15 — FIX Provider config mặc định + Custom — DONE (2026-11-06)
- Changed: src/shared/provider-presets.ts (thêm normaliseBaseUrl/resolveBaseUrl/joinEndpoint); src/main/ai/types.ts (baseUrl: string, xoá buildEndpoint); src/main/ai/providerService.ts (resolveBaseUrl ở getModelConnection); src/main/ai/providers/{openaiCompatible,anthropic,google}.ts (dùng joinEndpoint); tests/ (205/205 pass)
- Decisions/assumed: Một nguồn sự thật cho URL mặc định là PROVIDER_PRESETS; ProviderConnection.baseUrl: string (bị biên dịch bắt null→throw); getModelConnection ném INVALID_CONFIG nếu custom thiếu Base URL; joinEndpoint thay buildEndpoint không còn fallback OpenAI cứng; baseUrl null cho custom vẫn gây lỗi rõ ràng tại runtime [ASSUMED]; typecheck/build/test vẫn pass như baseline [VERIFIED]
- Next: user chạy app Test từng Model; đổi wusrouter/river sang type "custom" trong settings.json (giữ id); verify providerConfigFile test vẫn pass
- Open: None

## WI-14 — Tích hợp + validate toàn dự án — DONE (2026-11-05)