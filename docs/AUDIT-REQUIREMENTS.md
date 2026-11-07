# Audit REQUIREMENTS — MMO Manager

Ngày: 2026-11-06. Phạm vi: `docs/design-pack/REQUIREMENTS.json` (F-01…F-19).

Cách đọc cột **Mức đạt**:

- **Đạt (code + test)**: có code và có test tự động chứng minh phần logic.
- **Đạt (code)**: có code, chưa có test riêng; mới kiểm bằng typecheck/build.
- **Chưa kiểm chứng**: phần phụ thuộc giao diện Electron hoặc API thật, chưa chạy trong môi trường này.
- Không có mục nào được đánh "đạt" chỉ vì đã đọc code; mọi phần chạy thật đều ghi rõ.

## Bảng tổng hợp

| Mã | Tính năng | Mức đạt | Bằng chứng chính | Chưa kiểm chứng |
|---|---|---|---|---|
| F-01 | Khung ứng dụng và Sidebar | Đạt (code) | `layout/Sidebar.tsx` (5 tab + Settings), `layout/AppShell.tsx`, `App.tsx` | Bố cục/màu thực tế trong cửa sổ Electron |
| F-02 | Danh sách Event MMO/Airdrop | Đạt (code) | `ProjectListPage.tsx`, `ProjectRow.tsx`, `ProjectFilters.tsx` (`applyProjectFilters`, `sortByDeadline`), `dateUtils.test.ts`, `normalize.test.ts` | Click/mở chi tiết, cảm giác sắp xếp trên UI thật |
| F-03 | Trang chi tiết dự án | Đạt (code) | `ProjectDetailPage.tsx` (5 khu vực, lưu ghi chú, đổi trạng thái) | Lưu ghi chú/đổi trạng thái qua IPC thật |
| F-04 | Thêm/sửa/xóa + Import/Export | Đạt (code + test) | `ProjectFormDialog.tsx`, `ProjectImportDialog.tsx`, `projectService.ts`, `exportService.ts`, `projectsIpc.ts`, `projectService.test.ts`, `coerce.test.ts` | Hộp thoại chọn file/lưu file thật |
| F-05 | Nhãn chi phí | Đạt (code + test) | `Badge.tsx` (`CostBadge`), `format.ts`, `normalize.test.ts` | Hiển thị màu/nhãn thực tế |
| F-06 | Quản lý logo | Đạt (code) | `logoService.ts` (website → og/twitter image → avatar X, magic bytes, lưu `logos/`), `ProjectLogo.tsx` (chữ cái đầu), `setProjectLogo` | Tải logo từ web thật, chọn ảnh từ thư mục bất kỳ, hiển thị offline |
| F-07 | Scan Project | Đạt (code + test) | `ScanPage.tsx` (dán/file TXT-MD-JSON, 2 nhóm + nhóm thiếu bằng chứng, checkbox/All, Gửi), `scanService.ts`, `toolSchemas.test.ts` | Scan thật với API key; bảng 3 cột trên UI |
| F-08 | News + Check News | Đạt (code + test) | `NewsPage.tsx` (3 khung, xác minh trước/chưa xác minh sau, quá hạn giữ lại trong `<details>`, feed kiểu X), `checkNewsService.ts`, `newsCheck.test.ts`, `newsBatch.test.ts`, `searchTrace.test.ts` | Check News thật; nguồn X/Twitter thực tế |
| F-09 | AI Chat Box | Đạt (code + test) | `ChatPanel.tsx` (FAB, 3 nút, OK/Cancel, chọn Provider/Model, nút Dừng), `chatService.ts`, `pendingActions.test.ts`, `chatAdd.test.ts`, `agentRunner.test.ts` | Chat thật với model; thao tác OK/Cancel trên UI |
| F-10 | Tab Doanh thu | Đạt (code + test) | `RevenuePage.tsx`, `RevenueDetailPage.tsx`, `RevenueFormDialog.tsx`, `revenue-calc.ts`, `revenueCalc.test.ts` | Nhập liệu/đính kèm bằng chứng thật |
| F-11 | Settings — AI | Đạt (code + test) | `AiSettingsPanel.tsx` (5 loại Provider, Upload JSON, Export), `ProviderEditor.tsx`, `JsonHelpDialog.tsx`, `providerService.ts`, `aiProviders.test.ts` | Test Provider thật với từng nhà cung cấp |
| F-12 | Settings — Data Path | Đạt (code) | `DataPathPanel.tsx`, `dataPathService.ts` (database/logos/attachments), `settingsIpc.ts` (mở thư mục) | Đổi thư mục thật, sao chép dữ liệu thật |
| F-13 | Settings — Appearance | Đạt (code) | `AppearancePanel.tsx`, `AppearanceProvider.tsx` (Preview/Apply/Reset) | Xem font thực tế |
| F-14 | Phân quyền User/AI + khóa | Đạt (code + test) | `lockManager.ts`, `guard.ts` (`mutating`), `lockManager.test.ts`, `LOCK_POLICY.allowedWhileAiBusy = open_external_link, open_project_detail` | Khóa/mở khóa thật khi AI chạy |
| F-15 | Bảo vệ API Key | Đạt (code + test) | `secretStore.ts` (`safeStorage.encryptString/decryptString`, từ chối nếu không có mã hóa), `ProviderEditor.tsx` (che `••••••`), `buildProviderExport` không chứa khóa, `aiProviders.test.ts` | DPAPI thật trên máy User |
| F-16 | SQLite + thư mục dữ liệu | Đạt (code + test) | `db/migrations.ts`, `db/connection.ts`, `dataPathService.ts`, `dbRepo.test.ts` | Mở DB tại thư mục thật, migration trên dữ liệu cũ |
| F-17 | Web Search + Web Fetch | Đạt (code + test) | `webTools.ts` (`<untrusted_web_content>`, safeFetch), `providers/*` (web search gốc), `searchTrace.ts`, `safeFetch.test.ts`, `searchTrace.test.ts` | Search thật từng provider; OpenAI-compatible có thể bỏ qua `web_search_options` |
| F-18 | Chính sách lỗi/trung thực | Đạt (code + test) | `guard.ts` trả lỗi kèm channel, `AiError` phân loại, không có auto-swap model, `checkNewsService.ts` không báo "không có tin" khi lô lỗi, `newsCheck.test.ts` | Hiển thị lỗi thật trên UI |
| F-19 | AI engine | Đạt (code + test) | `providers/*`, `agentRunner.ts`, `tools.ts`, `aiTaskRunner.ts`, `agentRunner.test.ts`, `toolSchemas.test.ts` | Chạy từng adapter với API thật |

## Chi tiết theo tính năng

### F-01 — Khung ứng dụng và Sidebar
- Sidebar 5 tab: News, Event MMO, Airdrop, Scan Project, Doanh thu; Settings ở cuối (`Sidebar.tsx`).
- Nội dung bên phải do `App.tsx` điều phối; `AppShell.tsx` bọc Sidebar + LockBanner.
- **Chưa kiểm chứng**: bố cục, màu Dark Navy + Teal, hành vi responsive trong cửa sổ Electron thật.

### F-02 — Danh sách dự án
- Dùng chung `ProjectListPage` với prop `category`; dữ liệu tách theo `event_mmo` / `airdrop`.
- Mỗi dòng 5 nhóm: logo + tên, loại + nhiệm vụ, deadline + còn lại, trạng thái, nhãn chi phí (`ProjectRow.tsx`).
- Tìm kiếm không dấu (`normalizeNameKey`), lọc trạng thái/chi phí/deadline, sắp xếp dự án sắp hết hạn lên trước và đẩy quá hạn xuống cuối (`applyProjectFilters`, `sortByDeadline`).
- Test logic ngày: `tests/dateUtils.test.ts`; chuẩn hóa tên: `tests/normalize.test.ts`.
- **Chưa kiểm chứng**: thao tác click mở chi tiết và hiển thị thực tế.

### F-03 — Trang chi tiết dự án
- `ProjectDetailPage.tsx` có đủ: thông tin dự án (logo, tên, website, socials), nhiệm vụ (taskSummary/howToJoin), deadline (bắt đầu/kết thúc/còn lại), trạng thái, ghi chú lưu riêng.
- Ghi chú lưu qua `savePatch({ notes })`; đổi trạng thái qua `savePatch({ status })`.
- **Chưa kiểm chứng**: lưu thật và đọc lại sau khi mở lại app.

### F-04 — Thủ công + Import/Export
- Form thêm/sửa/xóa không cần AI (`ProjectFormDialog.tsx`); form mở sẽ báo LockManager là User đang chỉnh sửa.
- Import JSON: dán nội dung hoặc chọn file (`ProjectImportDialog.tsx`); `coerce.ts` chuẩn hóa dữ liệu lỏng; import theo từng item (item hỏng không chặn item hợp lệ).
- Export JSON/TXT mặc định `app.getPath('downloads')`, có tùy chọn chọn vị trí, toast hiện đường dẫn file; không tạo `exports/` (`exportService.ts`, `projectsIpc.ts`, `ProjectListPage.tsx`).
- Test: `projectService.test.ts` (thêm/sửa/xóa/import/row_version/logo), `coerce.test.ts` (chuẩn hóa + parse JSON có BOM).
- **Chưa kiểm chứng**: hộp thoại Save/Open của Electron và quyền ghi thư mục Downloads thật.

### F-05 — Nhãn chi phí
- `formatCost`: FREE / số USD / "Chưa xác minh"; không suy đoán khi thiếu số tiền.
- `CostBadge` dùng cùng logic; lọc `free | paid | unverified`.
- Test: `tests/normalize.test.ts` (nhãn chi phí).

### F-06 — Logo
- `fetchLogoForProject`: website (og:image/twitter:image/icon) → avatar X → null; `safeFetchImage` kiểm tra content-type + magic bytes + giới hạn dung lượng.
- User chọn ảnh bất kỳ: `captureLogoFromFile` sao chép vào `logos/<id>.<ext>`; dữ liệu lưu `logoPath`, ảnh gốc xóa không ảnh hưởng.
- Không có logo: `ProjectLogo` vẽ chữ cái đầu với màu theo tên.
- **Chưa kiểm chứng**: tải logo từ website/X thật; chọn file ảnh thật; xem offline.

### F-07 — Scan Project
- Tab riêng; nhận dán nội dung hoặc file TXT/MD/JSON ≤ 1 MB (`ScanPage.tsx`).
- `scanService.ts`: tách candidate, kiểm tra trùng theo name/domain, chạy agent có web search + `web_fetch`, validate `submit_scan_result`, lưu kết quả gần nhất.
- Kết quả nhóm Event MMO / Airdrop / Không đủ bằng chứng; checkbox từng dòng + All; nút Gửi mới thêm dự án đã chọn.
- Test: `toolSchemas.test.ts` (schema tool có `items/properties`), `coerce.test.ts`.
- **Chưa kiểm chứng**: Scan thật với API key; bảng 3 cột và trạng thái checkbox trên UI thật.

### F-08 — News + Check News
- `NewsPage.tsx`: 3 khung (Tin quan trọng mới; Deadline sắp hết, ≤3 ngày nhấn mạnh; Việc cần làm ngay); tin đã xác minh ở trên, chưa xác minh có nhóm riêng ở dưới; deadline quá hạn giữ trong `<details>` ("Đã qua hạn — giữ để tra cứu"), không tự xóa.
- Feed kiểu X: logo nhỏ, tên dự án, tóm tắt ngắn, thời gian, nguồn, link "Mở bài gốc".
- `checkNewsService.ts`: chia lô 3 dự án, retry 1 lần khi model không gọi `submit_news`, đếm `failedBatches`, kiểm nguồn bằng `safeFetch` (404/410 loại; lỗi khác → `unverified`), giới hạn `projectId` theo lô, cảnh báo khi không có dấu vết web search.
- Test: `newsCheck.test.ts` (projectId ngoài lô, 404/410, fetch lỗi → unverified, message không báo "không có tin" khi lô lỗi), `newsBatch.test.ts`, `searchTrace.test.ts`.
- **Chưa kiểm chứng**: Check News thật; hành vi X/Twitter thật (thường 403/login wall → `unverified`).

### F-09 — Chat Box
- FAB mở từ 5 tab (không có tab riêng); panel có 3 nút Thêm/Sửa/Xóa + ô nhập; chọn Provider/Model đã cấu hình ngay trong panel.
- Mọi thay đổi dữ liệu qua `propose_*` → PendingAction → OK/Cancel; không OK thì không ghi; sau OK đọc lại và báo kết quả; lỗi báo lỗi.
- Thêm dự án linh hoạt: JSON, bài viết, link, vài chữ; `chatAdd.ts` tách JSON, `enrichWithLinks` tải tối đa 3 link và bọc `<untrusted_web_content>`; thiếu trường do app liệt kê (`buildAddDetails`).
- Sửa dự án dùng `updateProjectWithChanges` để không mất trường khác.
- Test: `pendingActions.test.ts` (1 lần, TTL, row_version), `chatAdd.test.ts` (parse, missing fields, link, giới hạn web_fetch), `agentRunner.test.ts` (mọi tool_call đều có tool_result khi halt), `projectService.test.ts` (merge khi sửa).
- **Chưa kiểm chứng**: chat thật, bấm OK/Cancel thật, nút Dừng thật (không có test renderer).

### F-10 — Doanh thu
- 4 thẻ tổng: thực nhận / đang chờ / chi phí / lãi thực tế (`RevenuePage.tsx`).
- Danh sách theo dự án + lọc dự án/trạng thái claim/thời gian/từ khóa.
- Chi tiết: thưởng ước tính, thực nhận tiền/token, ngày nhận, Claim, chi phí tham gia + phí giao dịch, lãi/lỗ, Tx Hash, file bằng chứng (`RevenueDetailPage.tsx`).
- Điểm chưa quy đổi không tính USD (`revenue-calc.ts`, `revenueService.ts`).
- Test: `revenueCalc.test.ts`.

### F-11 — Settings AI
- 5 loại Provider: OpenAI, Anthropic, OpenCode, Google, Custom (`AiSettingsPanel.tsx`).
- Upload JSON (đọc/kiểm tra/tự nhận diện) hoặc nhập API Key + Add Model; Custom có tên/Base URL/Model ID/Headers; trường nâng cao ẩn mặc định.
- Nút Test: OK/Failed kèm nguyên nhân; có probe tool calling và probe web search thật (`webSearchProbe`: hoạt động / không phát hiện dấu vết).
- Nút Help cạnh Upload JSON mở `JsonHelpDialog` (cấu trúc, trường, JSON mẫu, lỗi thường gặp).
- Export cấu hình không xuất API Key.
- Test: `aiProviders.test.ts`, `ipcPayloads.test.ts`.

### F-12 — Data Path
- `DataPathPanel.tsx` hiện đường dẫn, chọn thư mục mới, tùy chọn sao chép, nút "Mở thư mục Data".
- `dataPathService.ts` tạo `database/`, `logos/`, `attachments/`; từ chối ghi đè nếu thư mục đích đã có `mmo-manager.db`; không xóa thư mục cũ.
- **Chưa kiểm chứng**: đổi thư mục và mở Explorer thật.

### F-13 — Appearance
- `AppearancePanel.tsx`: Font Family (danh sách an toàn), Font Size, Font Weight, Preview trực tiếp, Apply lưu, Reset mặc định.
- `AppearanceProvider.tsx` áp CSS variables.
- **Chưa kiểm chứng**: hiển thị font thật.

### F-14 — Phân quyền + khóa
- `lockManager.ts`: một chủ sở hữu tại một thời điểm; `beginUserEditing` chặn khi AI chạy; `assertUserCanMutate` chặn handler `mutating` khi AI chạy.
- `LOCK_POLICY.allowedWhileAiBusy = ['open_external_link', 'open_project_detail']` → khi AI chạy vẫn mở được link website và chi tiết dự án.
- AI chỉ chạy qua lệnh User (chat/scan/check news), tool whitelist, không có tool ghi trực tiếp.
- App vẫn dùng được khi AI lỗi/mất kết nối vì dữ liệu và form nằm ở main/SQLite, không phụ thuộc AI.
- Test: `lockManager.test.ts`.

### F-15 — API Key
- `secretStore.ts` dùng `safeStorage.encryptString` / `decryptString`; nếu `isEncryptionAvailable()` false thì từ chối lưu.
- UI che khóa sau khi lưu (`••••••`), chỉ hiện ô nhập khi đổi khóa.
- Upload JSON: khóa được tách và lưu qua `secretStore`, không nằm trong `settings.json`.
- Export cấu hình (`buildProviderExport`) chỉ gồm id/type/name/baseUrl/models.
- Test: `aiProviders.test.ts` (round-trip, export không khóa, thiếu mã hóa thì từ chối).

### F-16 — SQLite + dữ liệu
- `node:sqlite` `DatabaseSync`; migration theo `PRAGMA user_version`; `mmo-manager.db` trong `database/`.
- JSON chỉ dùng Import/Export và trao đổi với AI.
- Không tạo `exports/`.
- Test: `dbRepo.test.ts`.

### F-17 — Web research
- Web search gốc của provider bật qua `enableWebSearch`; `web_fetch` dùng `safeFetch`, bọc `<untrusted_web_content>`, cắt độ dài.
- `searchTrace.ts` nhận diện dấu vết thật: Anthropic `server_tool_use`/`web_search_tool_result`, OpenAI `url_citation`, Google `groundingMetadata`.
- Prompt cấm làm theo chỉ thị trong nội dung web; cấm bịa nguồn/ngày/phần thưởng.
- Test: `safeFetch.test.ts`, `searchTrace.test.ts`, `toolSchemas.test.ts`.
- **Chưa kiểm chứng**:
  - OpenAI-compatible/OpenCode/Custom có thể bỏ qua `web_search_options` (không có dấu vết → cảnh báo).
  - Gemini tuỳ model có thể không gộp được `google_search` với function declarations.
  - Chưa chạy search thật với bất kỳ provider nào.

### F-18 — Lỗi và trung thực
- `guard.ts` trả lỗi kèm tên channel + đường dẫn zod; `AiError` phân loại auth/quota/rate_limit/network/unsupported.
- Không có auto-swap/fallback model: chỉ dùng đúng `lastSelection` do User chọn; lỗi thì báo để User tự đổi.
- Check News không báo "Không có tin mới trong ngày" khi có lô lỗi (`buildNewsCheckMessage`).
- Chat báo lỗi khi tool/confirm thất bại; không báo thành công giả.
- Test: `newsCheck.test.ts`, `ipcPayloads.test.ts`.

### F-19 — AI engine
- 5 loại provider qua factory (`providers/index.ts`); adapter OpenAI-compatible/Anthropic/Google.
- `agentRunner.ts`: vòng lặp ≤ `LIMITS.aiMaxSteps = 30`, cắt kết quả tool, AbortSignal từng bước, trả lời mọi `tool_call` (kể cả khi halt).
- Tool whitelist theo tác vụ; không có tool ghi trực tiếp.
- Nút Hủy: `aiTaskRunner` acquire/release lock trong `finally`; IPC `ai:cancel` không `mutating`.
- API Key chỉ nằm ở main, không đưa vào prompt/renderer.
- Test: `agentRunner.test.ts`, `toolSchemas.test.ts`, `lockManager.test.ts`.

## Khác biệt / điểm cần biết

1. **`chatSubmitImport` là channel chết**: có trong `ipc-channels.ts` nhưng không có handler/preload. Không ảnh hưởng luồng hiện tại (chat dùng `propose_add_projects`), nhưng nên xóa hoặc nối dây ở lần dọn tiếp theo.
2. **`BATCH_SIZE = 3`** thay vì 5, vì Anthropic web search `max_uses: 5`; đây là lựa chọn an toàn đã ghi trong code.
3. **Trùng domain là cảnh báo**, trùng `name_key` cùng category mới chặn — theo lựa chọn của User.
4. **Test Provider web search** là probe thật, nhưng kết quả phụ thuộc model/quyền tài khoản; "không phát hiện dấu vết" không đồng nghĩa provider hỏng.
5. **Không có test renderer** (chưa cài jsdom/testing-library): các phần UI (nút Dừng, OK/Cancel, Preview font) chỉ được kiểm bằng typecheck + build, chưa kiểm hành vi.

## Checklist T2 — User tự chạy

Môi trường hiện tại không mở được cửa sổ Electron và không có API key thật, nên các mục sau **chưa kiểm chứng**:

1. `npm run dev` → cửa sổ mở, Sidebar đủ 5 tab + Settings, màu/font đúng Design Pack.
2. Thêm dự án bằng form; sửa một trường; xóa; mở chi tiết; lưu ghi chú; đổi trạng thái.
3. Import JSON (dán + chọn file); Export JSON/TXT (mặc định Downloads + chọn nơi khác); kiểm tra toast đường dẫn.
4. Đổi logo từ file bất kỳ; "Lấy logo tự động" với một website thật; xóa ảnh gốc rồi mở lại app.
5. Settings → Upload JSON provider mẫu (`zen.json`, `openrouter.json`) → Test từng model; xem badge Web search.
6. Chat: JSON hợp lệ; JSON có 1 item hỏng; câu văn tự do; dán link; OK; Cancel; sửa qua chat; xóa qua chat; lượt chat thứ hai; bấm Dừng khi đang chạy.
7. Scan Project với API key thật; chọn/bỏ chọn từng dòng và All; Gửi.
8. Check News với API key thật; kiểm tra tin có nguồn 404 bị loại, nguồn lỗi thành "Chưa xác minh", không có tin giả khi lô lỗi.
9. Doanh thu: thêm khoản tiền/token/points; đính kèm bằng chứng; kiểm tra 4 thẻ tổng và lãi/lỗ.
10. Data Path: đổi thư mục, chọn sao chép, mở thư mục Data; Appearance: Preview/Apply/Reset.
