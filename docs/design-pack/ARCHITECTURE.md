# ARCHITECTURE — MMO Manager

Trạng thái: **Planned (Design Pack, chưa duyệt)** · Scale: **Medium** · Ngôn ngữ tài liệu: tiếng Việt · Ngày: 2026-11-05
Chuỗi thiết kế: REQUIREMENTS → UI_SPEC → WORKFLOW → ARCHITECTURE → CODE STRUCTURE.
Mã nguồn: identifier/comment/key JSON bằng tiếng Anh, chuỗi hiển thị cho User bằng tiếng Việt.

---

## 1. Tổng quan

MMO Manager là app desktop Windows (Electron) để một User cá nhân quản lý dự án **Event MMO** và **Airdrop**: danh sách, deadline, trạng thái, chi phí, doanh thu thực nhận; thêm AI hỗ trợ ở ba việc cố định: **Scan Project**, **Check News**, **Chat Box quản lý dự án**.

Hai nguyên lý chi phối toàn bộ thiết kế:

1. **App độc lập với AI.** Mọi tính năng không phải ba việc trên chạy hoàn toàn offline, không cần token. AI hết token/mất mạng chỉ làm ba việc đó báo lỗi rõ ràng.
2. **AI là khách bị giới hạn, không phải chủ nhà.** AI không có đường ghi dữ liệu trực tiếp. Nó chỉ *đề xuất* qua tool whitelist; code của app mới thực thi, và chỉ sau lệnh/OK của User, trong lúc User bị khóa (A.2).

Công nghệ nền (E.1, đã chốt): Electron, React, TypeScript, electron-vite, CSS, Node.js (main), SQLite, JSON.

## 2. Quy tắc bất biến → cơ chế kỹ thuật bảo đảm

| Quy tắc (nguồn) | Cơ chế trong code |
|---|---|
| User/AI không thao tác đồng thời (A.2) | `LockManager` ở main là nguồn sự thật duy nhất. Handler ghi qua `guard.ts` gọi `assertUserCanMutate()`; tác vụ AI chạy qua `aiTaskRunner` (acquire/release trong `finally`). Renderer chỉ phản chiếu qua `lock:changed`. |
| Ngoại lệ khi AI chạy: click link website, mở chi tiết (A.3) | Hằng `LOCK_POLICY.allowedWhileAiBusy = ['open_external_link','open_project_detail']` trong `shared/constants.ts`. UI gắn `data-lock-allow` đúng hai chỗ này; main chỉ cho hai IPC đó khi AI bận. |
| AI chỉ thao tác trong chức năng lập trình sẵn (A.4) | `ai/tools.ts` là whitelist theo tác vụ. Không tool shell, không tool file, không tool Settings, không tool ghi DB. |
| AI chỉ chạy khi User ra lệnh (A.5) | Điểm vào AI duy nhất là IPC từ hành động User (Scan, Gửi, Check News, gửi tin Chat, OK). Không timer, không watcher, không polling (core §10). |
| Không làm sai lệch dữ liệu (A.6), kiểm tra lại sau ghi (B.3) | Mọi ghi do AI đi qua `projectService` → transaction → **đọc lại từ DB so khớp**; lệch thì trả lỗi, không báo thành công. |
| Không có OK thì không thực thi (B.3.6) | `pendingActions`: hành động chỉ được tạo bởi tool `propose_*`; chỉ `chat:confirm(actionId)` do User bấm OK mới thực thi; một lần, có hạn dùng, kiểm tra snapshot `row_version`. |
| Chỉ xóa/sửa đúng dự án User chỉ định, không tự đoán (B.3.4) | Khớp đối tượng do **app** làm (id/tên chuẩn hóa chính xác). Mơ hồ → trả danh sách ứng viên để User bấm chọn. Mô hình AI không được tự chọn đối tượng xóa. |
| Không Auto Swap, không tự chuyển model trả phí (C.5) | Không có code chọn model thay thế. Lỗi → `AiError` hiển thị nguyên nhân; User mở `ModelPicker` để chọn lại. |
| Cấu hình AI chỉ ở Settings (C.4) | `providerService` chỉ được gọi từ `settingsIpc`. Chat IPC chỉ nhận `{providerId, modelId}` đã cấu hình. |
| API Key không ở dạng thuần (E.2.1) | `secretStore` dùng `safeStorage`; ciphertext ở `userData/secrets.json` (ngoài thư mục Data). Renderer không bao giờ nhận lại khóa; chỉ nhận `hasKey: true`. |
| Không tự suy đoán dữ liệu chưa xác minh (B.1.7, D.6) | Schema kết quả AI có trường `verification` + `sources[]`; chi phí/deadline/reward cho phép `null`/`unverified`. App từ chối item không có nguồn (news) và không điền giá trị mặc định đoán. |
| Deadline không tự xóa (B.2) | Khung Deadline **tính trực tiếp từ bảng projects**; không có tác vụ dọn dẹp tin hết hạn. |
| Logo hiển thị offline (D.2.3) | Logo sao chép vào `logos/`, lưu đường dẫn tương đối, phục vụ qua protocol `mmo-logo://`. |

## 3. Mô hình tiến trình và bảo mật Electron

```
Renderer (React, sandbox, không Node, không network)
   │  window.api (contextBridge, chỉ channel trong ipc-channels.ts)
Preload
   │  ipcRenderer.invoke / on
Main (đặc quyền: DB, file, network, AI, secret, khóa)
   ├─ SQLite (better-sqlite3)        ├─ settings.json + secrets.json (userData)
   ├─ MMO-APP-DATA/ (db, logos, attachments)
   └─ HTTPS ra ngoài: LLM API, web fetch, tải logo (đều qua safeFetch hoặc adapter)
```

Cấu hình cửa sổ (bắt buộc): `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity` mặc định. CSP trong `index.html` đặt `default-src 'self'`; `connect-src 'none'`; `img-src 'self' mmo-logo: data:`; `style-src 'self' 'unsafe-inline'` chỉ nếu bắt buộc. Chặn `will-navigate` và `setWindowOpenHandler` (deny); mở link ngoài chỉ qua IPC `app:openExternal` sau khi kiểm tra scheme `http`/`https`. Mọi network đi từ main; renderer không có đường ra mạng.

## 4. Layer và module

| Layer | Thư mục | Trách nhiệm | Được phụ thuộc |
|---|---|---|---|
| Shared | `src/shared` | Kiểu, hằng, schema zod, hàm thuần (ngày, chuẩn hóa, định dạng, tính doanh thu). Không import Electron/Node/DOM. | — |
| Data | `src/main/db` | Kết nối, migration, truy vấn tham số hóa. Không chứa nghiệp vụ. | shared |
| Services | `src/main/services` | Nghiệp vụ không-AI: dự án, logo, doanh thu, news, export, đường dẫn Data, settings, secret, khóa, safeFetch, logger. | shared, db |
| AI | `src/main/ai` | Adapter Provider, vòng lặp agent, tool whitelist, prompt, hành động chờ, ba dịch vụ AI (Scan, Check News, Chat), quản lý Provider. | shared, db (chỉ đọc qua repo trong tool), services |
| IPC | `src/main/ipc` | Validate payload, kiểm tra khóa, gọi service, chuẩn hóa lỗi. Không chứa nghiệp vụ. | services, ai |
| Preload | `src/preload` | Cầu nối typed. | shared |
| Renderer | `src/renderer/src` | UI React. Chỉ gọi `window.api`. | shared (kiểu và hàm thuần) |

Quy tắc phụ thuộc một chiều: Renderer → (IPC) → Services/AI → Data → Shared. Không vòng (đã kiểm tra trên `PROJECT_MAP.json`). `db/connection.ts` nhận đường dẫn làm tham số, **không** import `dataPathService`; `dataPathService` gọi `connection` để mở lại DB khi đổi đường dẫn.

## 5. Workflow chính

### 5.1 Khóa độc quyền (A)
- Trạng thái `LockState = { owner: 'none' | 'ai', taskId?, label?, startedAt?, userEditing: boolean }`.
- **AI bắt đầu:** `tryAcquireAi(taskId, label)` thất bại nếu `owner==='ai'` hoặc `userEditing===true` → báo "Bạn đang chỉnh sửa, hãy hoàn tất rồi thử lại".
- **User bắt đầu chỉnh sửa** (mở form thêm/sửa dự án, form doanh thu, nhập ghi chú, Settings): renderer gọi `lock:userBegin`; thất bại nếu AI đang chạy.
- **Khi `owner==='ai'`:** handler ghi của User bị `guard.ts` từ chối (phòng thủ chiều sâu, kể cả khi UI lỗi). UI hiện `LockBanner` + nút **Hủy AI** (cần để User không bị kẹt; ghi trong OQ-2).
- AI chờ User bấm OK (hành động chờ) **không** giữ khóa; khi OK, khóa được acquire lại rồi mới thực thi. Snapshot `row_version` lệch (User đã sửa trong lúc chờ) → hủy, báo User yêu cầu lại.

### 5.2 Scan Project (B.1, D.6)
1. User dán nội dung/đính kèm TXT/MD/JSON (≤ 1 MB) → bấm Scan → `aiTaskRunner` giữ khóa.
2. App tách sơ bộ danh sách ứng viên (JSON → đọc trực tiếp; TXT/MD → để AI tách), chuẩn hóa `name_key`/`domain_key`, **tự đánh dấu trùng** với DB và trong input.
3. Agent chạy theo lô (mặc định 5 dự án/lô): với mỗi dự án gọi web search + `web_fetch` trang chính thức/tài liệu, đối chiếu input với web.
4. AI trả kết quả qua tool `submit_scan_result` (schema zod). App validate; item sai schema bị loại và liệt kê lỗi; không sửa im lặng.
5. Hiển thị 2 nhóm Event MMO/Airdrop (+ nhóm "Không đủ bằng chứng", không chọn được), bảng 3 cột, checkbox, Chọn tất cả. Kết quả lưu vào `scan_latest` (ghi đè lần trước).
6. User chọn → **Gửi** → `scanService.submit(ids)` thêm qua `projectService.addProjects` (origin `scan`), đọc lại, báo kết quả từng dự án (thêm/trùng/lỗi), lấy logo.

### 5.3 Check News (B.2, D.4)
1. User bấm Check News → khóa → app xuất JSON dự án **chưa Hoàn thành** (`id, name, category, website, socials, end_date`).
2. Agent theo lô tìm tin mới **trong ngày** (ưu tiên X) bằng web search + `web_fetch`; trả qua `submit_news`.
3. `newsService` kiểm tra mỗi item: có `project_id` hợp lệ, `source_url` http(s), `published_at` rơi vào hôm nay (giờ máy), tóm tắt ≤ 280 ký tự, `verification` hợp lệ; tính `dedupe_hash = sha256(project_id + '|' + canonicalUrl)`; trùng thì bỏ. Item thiếu nguồn/ngày bị loại và đếm vào báo cáo.
4. Khung Deadline không lấy từ AI mà tính trực tiếp (xem 6). Khung "Việc cần làm ngay" lưu `kind='todo'`.
5. Sắp xếp: đã xác minh trên, chưa xác minh dưới (có nhãn riêng), mỗi nhóm theo `published_at` giảm dần.

### 5.4 Chat Box (B.3)
- Nút nổi mở panel từ 5 tab. Ba nút gợi ý + khung nhập. Phiên chat **chỉ trong bộ nhớ** (không lưu lịch sử).
- **Thêm:** nút Thêm dự án → dán JSON/tải file → app validate bằng `ProjectImportV1` trước; phần không khớp schema được AI ánh xạ (có hiển thị kết quả ánh xạ) → tạo `PendingAction{type:'add'}` → thẻ xác nhận "Bạn có chắc chắn muốn thêm dự án này không?" + danh sách → OK/Cancel.
- **Xóa:** nút Xóa dự án → User nhập/dán tên → app tra cứu chính xác; nhiều ứng viên hoặc không thấy → hiện nút chọn; có kết quả → danh sách + cảnh báo "Khoản doanh thu liên quan được giữ lại (không gắn dự án)" → OK/Cancel.
- **Sửa:** User nêu tên + thay đổi → AI trích `changes` (tool `propose_update_project`) → app tính **trước/sau từ DB** (không lấy từ AI) → OK/Cancel. Đổi tên đơn giản cũng phải OK.
- OK → `chat:confirm` → acquire khóa → kiểm snapshot → `projectService` ghi → đọc lại so khớp → thông báo; lỗi thì thông báo lỗi.
- Mọi câu trả lời cần lựa chọn dùng nút Options (`ask_user_choice`), hạn chế bắt User gõ.

### 5.5 Thêm dự án thủ công (không AI)
Form → `projects:create` → `projectService` (chống trùng `UNIQUE(category,name_key)`) → ghi → đọc lại → lấy logo bất đồng bộ (thất bại không làm hỏng việc thêm, chỉ báo "không lấy được logo", dùng chữ cái đầu).

## 6. Data flow

```
User action ─IPC─► guard (zod + lock) ─► service ─► repo ─► SQLite
                                              └──► logoService ─► safeFetch ─► web
AI task: IPC ─► aiTaskRunner(lock) ─► agentRunner ─► ModelClient(fetch LLM)
                    │                        └─► tools(whitelist) ─► web_fetch / read repo / propose_*
                    └─► kết quả đã validate ─► (scan_latest | newsService | pendingActions)
Ghi dữ liệu thật chỉ xảy ra ở: projectService / newsService / revenueService, sau lệnh hoặc OK của User.
Renderer nhận sự kiện: lock:changed, ai:progress, data:changed (làm mới danh sách).
```

Khung Deadline: `deadlines = projects WHERE status != 'completed' AND end_date IS NOT NULL`, nhóm theo `daysRemaining(end_date, today)`: `≤3` (nhấn mạnh; đặc biệt `=3`), `4..14` (sắp tới), `<0` (nhóm "Đã qua hạn — giữ để tra cứu"). Không xóa, không phụ thuộc AI/mạng.

## 7. Mô hình dữ liệu

### 7.1 Thư mục Data (E.1) — mặc định `Documents\MMO-APP-DATA`
```
MMO-APP-DATA/
├── database/mmo-manager.db
├── logos/PRJ-001.<png|jpg|webp>
└── attachments/<revenueId>_<tên-an-toàn>.<ext>   (bằng chứng doanh thu)
```
Không tạo `exports/`. Đường dẫn Data được lưu trong `userData/settings.json` (không lưu trong DB để mở được DB). `logo_path` lưu **đường dẫn tương đối** (`logos/PRJ-001.png`) để đổi thư mục Data không hỏng logo.

### 7.2 Ngoài thư mục Data (`app.getPath('userData')`)
- `settings.json`: `{ schemaVersion, dataPath, appearance{fontFamily,fontSize,fontWeight}, ai{ providers[{id,type,name,baseUrl?,models[{id,label,supportsWebSearch,supportsTools,costTier}]}], lastSelection{providerId,modelId} } }` — không chứa khóa.
- `secrets.json`: `{ [providerId]: { apiKey: <base64 ciphertext>, headers?: <base64 ciphertext> } }`.
- `logs/app.log`: log kỹ thuật, tự xoay vòng khi > 2 MB, không ghi khóa/nội dung prompt.

### 7.3 SQLite schema v1 (`PRAGMA user_version = 1`, `foreign_keys = ON`)

```sql
meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)          -- next_project_seq

projects(
  id TEXT PRIMARY KEY,                                   -- 'PRJ-001'
  category TEXT NOT NULL CHECK(category IN ('event_mmo','airdrop')),
  name TEXT NOT NULL, name_key TEXT NOT NULL, domain_key TEXT,
  website TEXT, socials_json TEXT NOT NULL DEFAULT '{}',
  task_summary TEXT NOT NULL DEFAULT '', how_to_join TEXT NOT NULL DEFAULT '',
  start_date TEXT, end_date TEXT,                        -- 'YYYY-MM-DD' giờ máy, null = chưa rõ
  cost_type TEXT NOT NULL DEFAULT 'unverified' CHECK(cost_type IN ('free','paid','unverified')),
  cost_amount_usd REAL,                                  -- bắt buộc khi paid
  status TEXT NOT NULL DEFAULT 'not_joined' CHECK(status IN ('not_joined','in_progress','completed')),
  verification TEXT NOT NULL DEFAULT 'unverified' CHECK(verification IN ('verified','unverified')),
  sources_json TEXT NOT NULL DEFAULT '[]',
  logo_path TEXT, notes TEXT NOT NULL DEFAULT '',
  origin TEXT NOT NULL CHECK(origin IN ('manual','scan','chat','import')),
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(category, name_key)
)
-- index: (category,status), (category,end_date), domain_key

revenue_entries(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  project_name_snapshot TEXT NOT NULL,
  reward_kind TEXT NOT NULL CHECK(reward_kind IN ('cash','token','points')),
  reward_symbol TEXT NOT NULL,                           -- USDT, ETH, tên token, 'points'
  estimated_amount REAL, estimated_usd REAL,
  received_amount REAL, received_usd REAL, received_at TEXT,  -- received_usd do User nhập
  claim_status TEXT NOT NULL DEFAULT 'pending' CHECK(claim_status IN ('pending','claimable','claimed')),
  participation_cost_usd REAL NOT NULL DEFAULT 0, tx_fee_usd REAL NOT NULL DEFAULT 0,
  tx_hash TEXT, evidence_note TEXT, evidence_file TEXT, note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
)

news_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('important','todo')),
  summary TEXT NOT NULL, verification TEXT NOT NULL CHECK(verification IN ('verified','unverified')),
  source_url TEXT NOT NULL, source_name TEXT, published_at TEXT NOT NULL, fetched_at TEXT NOT NULL,
  todo_deadline TEXT, is_done INTEGER NOT NULL DEFAULT 0,
  dedupe_hash TEXT NOT NULL UNIQUE
)

scan_latest(id INTEGER PRIMARY KEY CHECK(id=1), result_json TEXT NOT NULL, created_at TEXT NOT NULL)
```

Quyết định liên quan: xóa dự án **không** xóa doanh thu (`SET NULL` + snapshot tên) vì đó là tiền thật; xóa dự án xóa tin của dự án (`CASCADE`) và file logo của dự án.

### 7.4 Công thức Doanh thu (`shared/revenue-calc.ts`, hàm thuần)
- `realizedUsd = Σ received_usd` với `claim_status='claimed'`, `reward_kind ∈ {cash, token}`, `received_usd` không null.
- `unconverted` = các khoản `claimed` mà `received_usd` null hoặc `reward_kind='points'` → hiển thị riêng theo `reward_symbol`, **không** vào `realizedUsd`.
- `pendingUsd = Σ estimated_usd` với `claim_status ∈ {pending, claimable}`, kind ≠ points, `estimated_usd` không null.
- `totalCostUsd = Σ (participation_cost_usd + tx_fee_usd)` mọi khoản.
- `netProfitUsd = realizedUsd − totalCostUsd`. Lãi/lỗ từng khoản = `(received_usd nếu claimed và có) − chi phí − phí`; hiển thị "Chưa quy đổi" nếu đã nhận nhưng chưa có giá trị USD.
- Không có chỗ nào app tự lấy giá token hay tự ước lượng giá trị.

## 8. Hợp đồng IPC (tên channel trong `shared/ipc-channels.ts`)

| Nhóm | Channel | Ghi dữ liệu | Cho phép khi AI bận |
|---|---|---|---|
| Projects | `projects:list`, `projects:get` | Không | `projects:get` có |
| | `projects:create`, `projects:update`, `projects:delete`, `projects:setLogo`, `projects:import` | Có | Không |
| | `projects:export` | Ghi file ra Downloads/nơi chọn | Không |
| Revenue | `revenue:list`, `revenue:get`, `revenue:summary` | Không | Không (UI khóa) |
| | `revenue:save`, `revenue:delete`, `revenue:attachEvidence` | Có | Không |
| News | `news:list`, `news:deadlines`, `news:todos` | Không | Không |
| | `news:toggleTodo` | Có | Không |
| | `news:check` | AI → news_items | — (khởi chạy AI) |
| Scan | `scan:start`, `scan:submit` | AI / thêm dự án | — |
| | `scan:getLatest`, `scan:cancel` | Không | `scan:cancel` có |
| Chat | `chat:send`, `chat:submitImport`, `chat:confirm`, `chat:cancelAction` | Qua OK | — |
| | `ai:cancel` | Không | Có |
| Settings | `settings:get`, `settings:setAppearance`, `settings:setDataPath`, `settings:openDataFolder` | Có | Không |
| | `providers:list/save/delete`, `providers:parseJson`, `providers:test`, `providers:exportConfig` | Có | Không |
| Lock | `lock:get`, `lock:userBegin`, `lock:userEnd` | Không | `lock:get` có |
| App | `app:openExternal` | Không | Có |

Sự kiện main→renderer: `lock:changed`, `ai:progress {taskId, step, done, total, message}`, `data:changed {entity}`. Mọi payload validate bằng zod ở `guard.ts`; lỗi trả về `{ok:false, error:{code, message}}`, không ném stack ra renderer.

## 9. AI engine

### 9.1 Adapter Provider
`ModelClient.complete({ system, messages, tools, signal, maxTokens }) → { text, toolCalls[], usage? }`.
Ba adapter: `openaiCompatible` (OpenAI, OpenCode, Custom), `anthropic`, `google`. Gọi API bằng `fetch` ở main; **không dùng SDK** (ít dependency, kiểm soát lỗi). Không streaming ở v1 (đơn giản; tác vụ có thanh tiến độ theo bước).

> **[ASSUMED] — phải xác minh bằng tài liệu chính thức trước khi viết adapter (core §3, cấm bịa API):** endpoint, tên trường tool calling, định dạng lỗi của từng Provider; việc OpenCode có dùng được như OpenAI-compatible với Base URL cố định hay không; cách bật web search gốc của mỗi Provider và việc kết hợp với function calling.

Ánh xạ lỗi sang `AiError.kind`: `auth` (401/403), `rate_limit` (429), `quota`, `model_not_found`, `network`, `timeout`, `bad_request`, `unsupported` (model thiếu tool calling/web search), `unknown`. Thông báo cho User gồm nguyên nhân dễ hiểu + chi tiết kỹ thuật đã che khóa. **Không retry ngầm, không đổi model.**

### 9.2 Vòng lặp agent
`agentRunner.run({ system, user, tools, maxSteps = 30, signal, onProgress })`: gọi model → nếu có tool call thì validate đối số bằng zod, thực thi handler whitelist, cắt kết quả ≤ 20.000 ký tự, nối lại → lặp đến khi model trả kết quả cuối hoặc hết bước (hết bước = lỗi, không coi là xong). `AbortSignal` từ nút Hủy AI.

### 9.3 Tool whitelist theo tác vụ
| Tác vụ | Tool được cấp |
|---|---|
| Scan | `web_search` (gốc Provider), `web_fetch`, `list_existing_projects` (đọc, chỉ name/domain), `submit_scan_result` |
| Check News | `web_search`, `web_fetch`, `submit_news` |
| Chat | `list_projects`, `get_project` (đọc), `propose_add_projects`, `propose_update_project`, `propose_delete_projects`, `ask_user_choice` |
Không có tool nào ghi trực tiếp, đọc file, chạy lệnh, hay đụng Settings/khóa. `propose_*` chỉ tạo `PendingAction`.

### 9.4 Web research (F-17)
- `web_fetch(url)`: chỉ http/https; phân giải DNS rồi chặn IP loopback, private, link-local, metadata; kiểm tra lại sau mỗi redirect (tối đa 5); timeout 15 giây; ≤ 2 MB; chỉ nhận `text/html`, `text/plain`, `text/markdown`, `application/json`; HTML → văn bản bằng hàm tự viết (bỏ script/style/thẻ). Kết quả bọc `<untrusted_web_content source="...">` và system prompt ghi rõ đó là dữ liệu, không phải chỉ thị.
- `web_search`: dùng chức năng search gốc của Provider nếu model có cờ `supportsWebSearch`. **Model không có web search → Scan/Check News bị chặn với thông báo rõ** (OQ-1); không trả kết quả giả.
- Nguồn chỉ từ X/mạng xã hội mà không có xác nhận từ website/tài liệu chính thức → `verification: 'unverified'`. Truy cập X có thể bị hạn chế; đây là hạn chế đã biết, không được che.
- Quy tắc xác minh trong prompt: `verified` chỉ khi có ≥ 1 nguồn chính thức (website, docs, tài khoản chính thức) xác nhận; không dự đoán phần thưởng khi thiếu bằng chứng.

### 9.5 Test (nút Test ở Settings)
Hai yêu cầu nhỏ: (1) hỏi đáp ngắn xác nhận kết nối; (2) thử gọi tool giả `ping`. Kết quả `OK` kèm huy hiệu khả năng (tool calling, web search) hoặc `Failed` + nguyên nhân. Model không có tool calling vẫn lưu được nhưng bị chặn khỏi Scan/Check News/Chat với thông báo rõ.

## 10. Dependency và lý do

| Gói | Loại | Lý do |
|---|---|---|
| electron, react, react-dom, typescript, electron-vite, vite, @vitejs/plugin-react | runtime/dev | Nền tảng đã chốt ở E.1. |
| better-sqlite3 | runtime | SQLite đồng bộ cho main; cần rebuild theo ABI Electron. |
| zod | runtime | Validate ở biên: IPC, JSON import, kết quả AI, JSON cấu hình. |
| electron-builder | dev | Đóng gói installer Windows khi release. |
| vitest | dev | Test T3 cho logic thuần. |
| @types/react, @types/react-dom, @types/node, @types/better-sqlite3 | dev | Kiểu TypeScript. |

Cố ý **không** dùng: SDK AI, thư viện router, state management, UI kit, thư viện parse HTML/Markdown, thư viện log, thư viện ảnh (core §9: ưu tiên tự viết phần nhỏ). Thêm dependency ngoài bảng này phải cập nhật tài liệu này và `PROJECT_MAP.json` cùng thay đổi và hỏi User (core §9).

## 11. Cấu trúc thư mục / file

```text
mmo-manager/
├── src/
│   ├── main/
│   │   ├── ai/
│   │   │   ├── providers/
│   │   │   │   ├── anthropic.ts
│   │   │   │   ├── google.ts
│   │   │   │   ├── index.ts
│   │   │   │   └── openaiCompatible.ts
│   │   │   ├── agentRunner.ts
│   │   │   ├── aiTaskRunner.ts
│   │   │   ├── chatService.ts
│   │   │   ├── checkNewsService.ts
│   │   │   ├── pendingActions.ts
│   │   │   ├── prompts.ts
│   │   │   ├── providerService.ts
│   │   │   ├── scanService.ts
│   │   │   ├── tools.ts
│   │   │   ├── types.ts
│   │   │   └── webTools.ts
│   │   ├── db/
│   │   │   ├── connection.ts
│   │   │   ├── migrations.ts
│   │   │   ├── newsRepo.ts
│   │   │   ├── projectsRepo.ts
│   │   │   ├── revenueRepo.ts
│   │   │   └── scanRepo.ts
│   │   ├── ipc/
│   │   │   ├── chatIpc.ts
│   │   │   ├── guard.ts
│   │   │   ├── index.ts
│   │   │   ├── lockIpc.ts
│   │   │   ├── newsIpc.ts
│   │   │   ├── projectsIpc.ts
│   │   │   ├── revenueIpc.ts
│   │   │   ├── scanIpc.ts
│   │   │   └── settingsIpc.ts
│   │   ├── services/
│   │   │   ├── dataPathService.ts
│   │   │   ├── exportService.ts
│   │   │   ├── lockManager.ts
│   │   │   ├── logger.ts
│   │   │   ├── logoService.ts
│   │   │   ├── newsService.ts
│   │   │   ├── projectService.ts
│   │   │   ├── revenueService.ts
│   │   │   ├── safeFetch.ts
│   │   │   ├── secretStore.ts
│   │   │   └── settingsStore.ts
│   │   └── index.ts
│   ├── preload/
│   │   └── index.ts
│   ├── renderer/
│   │   ├── src/
│   │   │   ├── common/
│   │   │   │   ├── Badge.tsx
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── EmptyState.tsx
│   │   │   │   ├── Field.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   └── ProjectLogo.tsx
│   │   │   ├── features/
│   │   │   │   ├── chat/
│   │   │   │   │   ├── ChatFab.tsx
│   │   │   │   │   ├── ChatMessage.tsx
│   │   │   │   │   ├── ChatPanel.tsx
│   │   │   │   │   └── ModelPicker.tsx
│   │   │   │   ├── news/
│   │   │   │   │   ├── DeadlinePanel.tsx
│   │   │   │   │   ├── NewsFeed.tsx
│   │   │   │   │   ├── NewsPage.tsx
│   │   │   │   │   └── TodoPanel.tsx
│   │   │   │   ├── projects/
│   │   │   │   │   ├── ProjectDetailPage.tsx
│   │   │   │   │   ├── ProjectFilters.tsx
│   │   │   │   │   ├── ProjectFormDialog.tsx
│   │   │   │   │   ├── ProjectImportDialog.tsx
│   │   │   │   │   ├── ProjectListPage.tsx
│   │   │   │   │   └── ProjectRow.tsx
│   │   │   │   ├── revenue/
│   │   │   │   │   ├── RevenueDetailPage.tsx
│   │   │   │   │   ├── RevenueFormDialog.tsx
│   │   │   │   │   ├── RevenuePage.tsx
│   │   │   │   │   └── RevenueSummary.tsx
│   │   │   │   ├── scan/
│   │   │   │   │   ├── ScanPage.tsx
│   │   │   │   │   └── ScanResultTable.tsx
│   │   │   │   └── settings/
│   │   │   │       ├── AiSettingsPanel.tsx
│   │   │   │       ├── AppearancePanel.tsx
│   │   │   │       ├── DataPathPanel.tsx
│   │   │   │       ├── JsonHelpDialog.tsx
│   │   │   │       ├── ProviderEditor.tsx
│   │   │   │       └── SettingsPage.tsx
│   │   │   ├── layout/
│   │   │   │   ├── AppShell.tsx
│   │   │   │   ├── LockBanner.tsx
│   │   │   │   └── Sidebar.tsx
│   │   │   ├── state/
│   │   │   │   ├── AppContext.tsx
│   │   │   │   ├── AppearanceProvider.tsx
│   │   │   │   ├── LockContext.tsx
│   │   │   │   └── ToastContext.tsx
│   │   │   ├── styles/
│   │   │   │   ├── base.css
│   │   │   │   ├── components.css
│   │   │   │   └── tokens.css
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   └── index.html
│   └── shared/
│       ├── constants.ts
│       ├── date-utils.ts
│       ├── format.ts
│       ├── ipc-channels.ts
│       ├── normalize.ts
│       ├── revenue-calc.ts
│       ├── schemas.ts
│       └── types.ts
├── tests/
│   ├── dateUtils.test.ts
│   ├── lockManager.test.ts
│   ├── normalize.test.ts
│   ├── pendingActions.test.ts
│   ├── revenueCalc.test.ts
│   ├── safeFetch.test.ts
│   └── schemas.test.ts
├── .gitignore
├── electron-builder.yml
├── electron.vite.config.ts
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
└── vitest.config.ts
```

## 12. Entry point
- `src/main/index.ts` — tiến trình main: khởi tạo logger → settingsStore → dataPathService → mở DB → đăng ký protocol `mmo-logo` → đăng ký IPC → tạo cửa sổ.
- `src/preload/index.ts` — phơi bày `window.api`.
- `src/renderer/index.html` → `src/renderer/src/main.tsx` — khởi chạy React.
- Scripts dự kiến (`package.json`): `dev`, `build`, `typecheck`, `test`, `dist`. Tên script thật phải đọc từ file sau khi tạo, không đoán (core §5).

## 13. Quyết định kỹ thuật

| ID | Quyết định | Lý do / đánh đổi |
|---|---|---|
| TD-1 | Tool whitelist + `propose_*` + `PendingAction`, AI không có tool ghi | Biến "không có OK thì không thực thi" thành bảo đảm cấu trúc, không dựa vào việc model tự giác. |
| TD-2 | Khóa đặt ở main, UI chỉ phản chiếu | UI lỗi hay bị bypass cũng không phá được A.2. |
| TD-3 | Danh sách Deadline tính trực tiếp từ `projects` | Đúng B.2 (không tự xóa), chạy offline, không cần AI, luôn khớp dữ liệu. |
| TD-4 | Cấu hình AI + khóa ngoài thư mục Data | Đổi/sao chép/chia sẻ thư mục Data không làm lộ khóa. |
| TD-5 | Không SDK AI, `fetch` trực tiếp 3 adapter | Ít dependency; đánh đổi: phải tự bảo trì khác biệt giữa Provider. |
| TD-6 | Không streaming ở v1 | Đơn giản; tiến độ theo bước. Có thể thêm sau nếu User duyệt. |
| TD-7 | Xóa dự án giữ doanh thu (`SET NULL` + snapshot tên) | Tránh mất dữ liệu tiền thật khi dọn danh sách. |
| TD-8 | Logo giữ định dạng gốc (png/jpg/webp), kiểm magic bytes, ≤ 2 MB, không nhận SVG từ web | Tránh thêm thư viện ảnh; tránh SVG độc hại. |
| TD-9 | Journal mode mặc định (không WAL) | Sao chép file DB khi đổi đường dẫn đơn giản, không còn file `-wal`. |
| TD-10 | Kết quả Scan gần nhất lưu 1 dòng | Không mất kết quả đã tốn token khi lỡ đóng app, không thêm quản lý lịch sử. |
| TD-11 | Đổi đường dẫn Data: đóng DB → sao chép (tùy chọn) → kiểm tra → mở DB mới → ghi settings; không xóa thư mục cũ, không ghi đè DB có sẵn | High-Risk (core §17): không phá khả năng rollback. |
| TD-12 | Ghi settings/secrets bằng ghi nguyên tử (ghi tệp tạm cùng thư mục rồi đổi tên) | Tránh hỏng file khi tắt máy giữa chừng. |

## 14. Quy tắc tổ chức code
- Một module một trách nhiệm; IPC handler mỏng; nghiệp vụ nằm ở service; SQL chỉ ở `db/`; không SQL nối chuỗi (luôn tham số hóa).
- Hàm thuần đặt ở `shared/` để test T3 bằng Node thường (không cần Electron).
- Không `catch` rỗng; lỗi lan lên biên (`guard.ts`, UI) rồi báo rõ; log kỹ thuật, thông báo User không lộ khóa/đường dẫn nhạy cảm.
- Renderer không import từ `src/main`; chỉ import `src/shared`.
- Text UI tiếng Việt tập trung, tránh rải chuỗi khó sửa; mọi nhãn trạng thái có chữ (không chỉ màu).
- Không code chết, không mock/dữ liệu mẫu cứng, không `STUB` còn lại khi hoàn tất (core §8).

## 15. Rủi ro và điểm phải xác minh khi build

| ID | Rủi ro | Cách xử lý |
|---|---|---|
| R-1 | `better-sqlite3` là native module: lỗi rebuild theo ABI Electron trên Windows; test Node thường không nạp được bản build Electron. | WI-1 thử cài và build; logic thuần để ở `shared/` cho vitest; lớp DB kiểm bằng T2 trong Electron. Nếu không rebuild được, hỏi User về `node:sqlite` (xác minh hỗ trợ ở phiên bản Electron đã chọn trước khi đổi). |
| R-2 | API Provider (tool calling, web search, lỗi) khác nhau và có thể đã đổi. | Đọc tài liệu chính thức bằng WebFetch (qua quyền) trước khi viết từng adapter; ghi nguồn trong report. |
| R-3 | Một số model miễn phí không có tool calling hoặc web search. | Cờ khả năng + nút Test; chặn có thông báo (OQ-1); không Auto Swap. |
| R-4 | X chặn truy cập không đăng nhập. | Tin chỉ từ X mà chưa xác nhận → `unverified`; không giả vờ đã đọc được. |
| R-5 | Prompt injection từ trang web. | Bọc nội dung không tin cậy; tool whitelist không có tool ghi/lệnh; `propose_*` vẫn cần OK. |
| R-6 | `safeStorage` có thể không khả dụng (Linux/môi trường đặc biệt); API async/sync khác nhau theo phiên bản Electron. | Nếu không khả dụng: từ chối lưu khóa và báo rõ, không bao giờ lưu thuần. Kiểm tra tài liệu của đúng phiên bản Electron đang dùng; ưu tiên bản async nếu có. |
| R-7 | Token tốn nhiều khi danh sách dự án dài. | Chạy theo lô, hiển thị tiến độ, nút Hủy, kết quả từng lô được giữ khi hủy giữa chừng (Scan). |
| R-8 | Hết hạn "trong ngày" phụ thuộc múi giờ/độ chính xác ngày đăng. | So ngày theo giờ máy; item không xác định được ngày bị loại và đếm vào báo cáo. |
