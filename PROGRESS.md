## WI-17 — PROMPT FIX V2 (7 FIX) — DONE (2026-11-07)
- Commits trong repo riêng `Ai-mmo-manager/.git` (không đụng repo cha): `2f1b150` baseline, `05941fb` FIX 7, FIX 6, FIX 2, `10e7431` FIX 5a, FIX 5b, `ab8ee1d` FIX 5c, `58a765e` FIX 1 data, `0e218ac` FIX 1 display, `de31e24` FIX 3, `8228a6d` FIX 4.
- Changed:
  - FIX 7: `styles/tokens.css` Soft Royal Blue (`#5B8DEF`, hover `#709BF2`, active `#4779D0`, on-primary `#FFFFFF`, focus `#8CB0FF`, soft/ring); `.btn--primary`; xoá toàn bộ teal cũ; `docs/design-pack` cập nhật.
  - FIX 6: NEW `src/renderer/src/assets/new-icon.svg` (byte-identical, SHA256 `9CA38F02…`); NEW `vite-env.d.ts`; `Sidebar.tsx` dùng `<img width={28} height={28} alt="">`; bỏ style `.sidebar__brand-mark`.
  - FIX 2: NEW `src/shared/newsAccess.ts` (`canImportNews`); NewsPage ẩn Import News trong AI Mode, tự đóng preview, `handleImportPreview` trả sớm.
  - FIX 5a: `:root { color-scheme: dark }` + `select option` nền/chữ đúng theme.
  - FIX 5b: NEW `src/shared/listbox.ts`, `providerLogo.ts`, `letterColor.ts`; NEW `common/Listbox.tsx`, `common/ProviderLogo.tsx`.
  - FIX 5c: ChatPanel dựng lại theo design: khung giữa `min(70vw,960px)`/`84vh` (full-screen <640px), 2 Listbox Provider/Model có logo + nhãn Free/Paid, 3 nút nhanh, bong bóng User/AI có avatar + `HH:mm`, thẻ PendingAction, composer `#0F1827`, bỏ paperclip; `--chat-*` tokens; NEW `src/shared/chatView.ts`; `ChatMessage.at`.
  - FIX 1 data: `MILESTONE_KINDS`/`MilestoneKind`; migration schema v2 chỉ `ADD COLUMN milestone_kind/milestone_date` (nullable) + `PRAGMA user_version`; backup một lần `*.bak-v1`; `newsRepo`/`NewsItem`/`NewsBatchInput`/`DeadlineItem` (`date`/`kind`/`verification`); `computeDeadlines` chuyển sang `newsService`.
  - FIX 1 display: NEW `src/shared/newsView.ts` (`formatDmy`, `MILESTONE_LABEL`, `extractMilestoneFromText`, `resolveMilestone`, `buildHeadline`, `oneLine`, `selectTopImportantPerProject`, `buildDeadlineRows`, `textContainsDate`, `mentionsMilestone`); NewsPage mỗi dự án một dòng, một danh sách, gộp deadline từ dự án + tin, todo một dòng, phụ đề "7 ngày gần nhất".
  - FIX 3: NEW `src/main/services/searchProviders.ts` (Tavily/Brave/SearXNG, timeout 15s, cap 1MB, lỗi AUTH/HTTP/PARSE/NETWORK/TIMEOUT không lộ key); NEW `webSearchService.ts` (config + secret `websearch:<provider>` + test); NEW `newsEvidence.ts`; IPC `settings:getWebSearch|saveWebSearch|testWebSearch` + payload + preload; Settings → Web Search (`WebSearchPanel.tsx`); `createWebSearchTool` (8 lần/lô, bọc `<untrusted_web_content>`); `getNewsTools({ search, evidence })`; Check News quét mọi dự án (completed cuối), cửa sổ 7 ngày UTC+7, bắt buộc bằng chứng, lọc URL tự nghĩ, verify thêm mốc/ngày, ghi `meta.news_last_checked_at`.
  - FIX 4: `CHAT_SYSTEM_PROMPT` trả lời tự nhiên + bắt buộc tool cho CRUD + không nói "đã thêm/xoá" khi chưa OK; `buildAddPendingAction` dùng chung cho `propose_add_projects` và `tryDeterministicAdd`; `chatService.ts` không còn gọi `createPendingAction`.
  - Docs: `Plan-fix-app.md` §7 ghi rõ CHƯA KIỂM CHỨNG GUI; `docs/design-pack/PROJECT_MAP.json` thêm module mới và cập nhật phụ thuộc.
- Tests: 36 file / 337 test. Mới: `themeTokens`, `titleIcon`, `newsAccess`, `selectTheme`, `listbox`, `providerLogo`, `chatView`, `migrations`, `newsView`, `newsUi`, `searchProviders`, `newsEvidence`, `chatFlow`; cập nhật `schemas`, `dbRepo`, `newsBatch`, `newsCheck`, `newsImport`, `newsPrompt`, `toolSchemas`, `ipcPayloads`, `newsView`.
- Verify: `npm run typecheck` PASS; `npm test` PASS (36 file / 337 test); `npm run build` PASS.
- NOT verified: toàn bộ checklist GUI `Plan-fix-app.md` §7 (màu/focus, icon sidebar, layout News, ẩn/hiện Import News, Listbox, Chat Box, Check News thật với search gốc và search của app, Chat kiến thức + CRUD, gọi thật Tavily/Brave/SearXNG, backup DB v1→v2 khi mở app lần đầu). Không chạy Electron trong môi trường này.
- Open: user chạy app kiểm tra GUI; đổi/rotate Google API key trong `gg.json` vì key đang nằm dạng plaintext trên máy (file đã gitignore).

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