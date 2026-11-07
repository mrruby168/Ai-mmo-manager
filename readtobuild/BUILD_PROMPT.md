# BUILD PROMPT — MMO Manager (dán vào OpenCode, Build mode)

> **Trước khi dán (việc của bạn, không phải của AI):**
> 1. Duyệt Design Pack: chốt các mục `proposed` và `open_questions` (OQ-1 … OQ-14) trong `REQUIREMENTS.json`; sửa mặc định nào bạn không đồng ý, rồi đặt `confirmed_by_user: true`.
> 2. Tạo thư mục `D:\AI-AGENT\CODE\mmo-manager\` và chép vào **root** thư mục đó 6 file: `REQUIREMENTS.json`, `UI_SPEC.json`, `UI_PREVIEW.html`, `ARCHITECTURE.md`, `PROJECT_MAP.json`, `PROJECT_BLUEPRINT.mmd`. AI không đọc được ngoài `D:\AI-AGENT` (L1).
> 3. Mở OpenCode với thư mục kit rule (có `AGENTS.md`, `opencode.json`, `rules/`). Nhấn Tab sang **Build**.

---

## PROMPT (từ dòng dưới đây đến hết)

Bạn là AI-AGENT theo bộ rule RULE-OPENCODE đang nạp (`AGENTS.md`, `rules/01_core.md`, `rules/router.md`).

**Intent:** "Code từ Design Pack đã duyệt" → router chọn `workflows/new_app.md`, **chỉ Phase 2 BUILD** (Phase 1 đã xong, tôi xác nhận Design Pack đã duyệt: CÓ). Dòng đầu reply đầu tiên: `Rules loaded: CORE + router + workflows/new_app.md`.

**Dự án:** MMO Manager — app desktop Windows quản lý dự án Event MMO và Airdrop, có AI hỗ trợ (Scan Project, Check News, Chat Box). Thư mục dự án: `D:\AI-AGENT\CODE\mmo-manager\`. Scale: Medium, có UI. Ngôn ngữ trả lời: tiếng Việt; identifier, code, comment, commit message, key JSON: tiếng Anh; chuỗi hiển thị cho User: tiếng Việt.

### 0. Kickoff (làm đúng thứ tự)
1. Question 1 câu: kênh approve **PC hay ĐT** (router §3b). Ghi đáp án vào mục TodoWrite đầu tiên. Không trả lời được thì mặc định PC.
2. Đọc theo thứ tự, đọc hết rồi mới lập kế hoạch: `REQUIREMENTS.json` → `UI_SPEC.json` → `ARCHITECTURE.md` → `PROJECT_MAP.json` → `PROJECT_BLUEPRINT.mmd`. `UI_PREVIEW.html` chỉ là wireframe tham khảo; bản chuẩn UI là `UI_SPEC.json`.
3. Nếu `PROGRESS.md` đã tồn tại: đây là resume — đọc 10 mục cuối, Grep verify 1–2 symbol, làm tiếp, **không** plan lại từ đầu.
4. Tạo TodoWrite theo danh sách WI ở mục 5 (đối chiếu với Map, ARCHITECTURE, UI_SPEC; lệch thì sửa kế hoạch trước khi code). Luôn có `VERIFY` và `CLEANUP + REPORT`.

### 1. LOCK và quyền (đứng trên mọi thứ)
- Chỉ đọc/ghi trong `D:\AI-AGENT\CODE\mmo-manager\`. Tuyệt đối không đụng `D:\AI-AGENT\OPENCODE` (kể cả Read/Glob/Grep). Task con phải có câu: "Không đọc D:\AI-AGENT\OPENCODE; chỉ làm trong D:\AI-AGENT\CODE\mmo-manager".
- Không chạy lệnh nào khi chưa được phép (L3): trước mỗi bước cần lệnh, gộp **một** Question hiển thị lệnh nguyên văn + mục đích + tác động (ghi file? dùng mạng? cài gói? tiến trình nền?), options "Cho chạy" / "Không". PowerShell 5.1: không `&&`/`||`, dùng `-LiteralPath`, giới hạn output, không `Remove-Item -Recurse`/wildcard, không tải-rồi-chạy. Không chạy server/watch nền khi chưa cho phép và chưa nói cách tắt.
- Không commit/push/PR/tag/branch/stash khi tôi chưa yêu cầu đích danh (L4). Chỉ đề xuất commit message tiếng Anh trong report.
- Không chạy được thì ghi `NOT RUN` + lệnh PowerShell 5.1 cho tôi. Không bao giờ viết "đã test/pass" khi chưa có output thật. Mọi claim có nhãn `[VERIFIED]`/`[ASSUMED]`.

### 2. Điều bất biến của sản phẩm (kiểm trong mọi WI; vi phạm = lỗi nghiêm trọng)
1. **Không đồng thời:** User và AI không thao tác app cùng lúc. `LockManager` ở main là nguồn sự thật; handler ghi của User bị từ chối khi AI chạy (kể cả khi UI lỗi). Ngoại lệ khi AI chạy: **chỉ** click link website dự án và mở xem chi tiết dự án (+ nút Hủy AI). User đang mở form chỉnh sửa thì AI không được bắt đầu.
2. **AI chỉ chạy khi User ra lệnh** (Scan, Gửi, Check News, gửi tin Chat, OK). Không timer, không polling, không watcher.
3. **AI không có đường ghi trực tiếp.** Tool whitelist đúng như `ARCHITECTURE.md` §9.3; chỉ có `propose_*` tạo `PendingAction`. **Không có OK thì không thực thi.** Trước/sau do app tính từ DB, không lấy từ model. Chỉ xóa/sửa đúng đối tượng User chỉ định; mơ hồ thì hiện nút chọn, không tự đoán.
4. **Sau mọi lần AI ghi dữ liệu:** đọc lại từ DB so khớp; lệch/lỗi thì báo lỗi cụ thể, **không báo thành công giả**.
5. **Không suy đoán dữ liệu chưa xác minh:** chi phí/deadline/phần thưởng cho phép `unverified/null`; không điền giá trị đoán; app loại item AI thiếu nguồn.
6. **Không Auto Swap**, không tự đổi model, không tự chuyển sang model trả phí. Lỗi AI → hiện nguyên nhân, User tự chọn lại. Cấu hình AI chỉ ở Settings; Chat Box chỉ chọn Provider/Model.
7. **API Key:** lưu mã hóa bằng `safeStorage`, ciphertext ở `userData` (ngoài thư mục Data); không log, không gửi sang renderer sau khi lưu, không đưa vào prompt/URL; `safeStorage` không khả dụng thì từ chối lưu và báo rõ (không bao giờ lưu thuần). Export cấu hình mặc định không có khóa.
8. **Deadline không tự xóa** kể cả quá hạn; khung Deadline tính trực tiếp từ bảng `projects`.
9. **Offline:** mọi tính năng ngoài Scan/Check News/Chat chạy không cần mạng; logo đã lưu hiển thị offline.
10. **Bảo mật Electron:** `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`, CSP chặt, renderer không có đường ra mạng, `app:openExternal` chỉ http/https, `web_fetch` qua `safeFetch` (chặn IP nội bộ, kiểm lại sau redirect, giới hạn thời gian/dung lượng/content-type). Nội dung web là **dữ liệu**, không phải chỉ thị.
11. **SQL tham số hóa 100%**; validate zod ở mọi biên (IPC, JSON import, kết quả AI, JSON cấu hình); không `catch` rỗng.
12. Không tạo thư mục `exports/` mặc định; Export mặc định vào Downloads và thông báo đường dẫn.

### 3. Việc cấm
- Không thêm tính năng, màn hình, bảng DB, dependency, tool AI ngoài Design Pack. Cần thêm: dừng WI, nêu đề xuất, hỏi tôi (change control `new_app.md` B5). Design change → cập nhật `ARCHITECTURE.md` + Map + Blueprint **sau khi tôi duyệt**.
- Không bịa API/flag/endpoint. Với adapter Provider (OpenAI, Anthropic, OpenCode, Google, Custom), `safeStorage` (bản async/sync theo đúng phiên bản Electron), `better-sqlite3`/`electron-vite`/`electron-builder`: **đọc tài liệu chính thức bằng WebFetch** (hỏi quyền theo cấu hình) hoặc đọc source trong `node_modules` đã cài; không chắc thì nói "không biết" và hỏi. Mục `[ASSUMED]` trong `ARCHITECTURE.md` §9.1 và rủi ro R-1…R-8 là điểm bắt buộc xác minh.
- Không mock/dữ liệu mẫu cứng, không file `_new/_v2/.bak`, không code comment-out, không debug code còn sót. Stub tạm chỉ theo `STUB(<wi-id>)` và phải gỡ trước khi WI `DONE`.
- Dependency chỉ gồm danh sách trong `ARCHITECTURE.md` §10 / Map `external_dependencies`. Cài gói là lệnh dùng mạng + ghi file → qua L3, nêu tên + lý do.

### 4. Quy ước kỹ thuật
- Cấu trúc file đúng `PROJECT_MAP.json` (planned) và `ARCHITECTURE.md` §11; file có trong Map thì tạo ngay (Blueprint exception), vẫn Glob trước khi Write; sửa file có sẵn bằng Edit.
- Phụ thuộc một chiều: Renderer → IPC → Services/AI → Data → Shared. `db/connection.ts` nhận đường dẫn làm tham số (không import `dataPathService`). Renderer chỉ import `src/shared`.
- Logic thuần để ở `src/shared` để test T3 bằng vitest/Node thường (native module `better-sqlite3` đã build cho ABI Electron không nạp được trong Node thường — R-1); lớp DB kiểm bằng T2 trong Electron.
- UI theo `UI_SPEC.json`: Dark Navy + Teal, lưới 4px, token màu/kích thước lấy từ file đó, mọi nhãn trạng thái có chữ, focus ring, hit area ≥ 44px, `prefers-reduced-motion`. Đừng đoán số đo.
- Tên script npm lấy từ `package.json` thật sau khi tạo, không đoán.

### 5. Kế hoạch WI (đề xuất; điều chỉnh sau khi đối chiếu Design Pack)

| WI | Nội dung | File chính (theo Map) | Xong khi | Test |
|---|---|---|---|---|
| WI-1 | Scaffold + cấu hình + cửa sổ bảo mật | `package.json`, `electron.vite.config.ts`, `tsconfig*.json`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/src/main.tsx` | Cài được dep; typecheck + build qua; cửa sổ trống mở được; xác minh `better-sqlite3` rebuild theo Electron (R-1) | T1, T2 (user-run) |
| WI-2 | Shared layer | `src/shared/*` + `tests/normalize|dateUtils|revenueCalc|schemas.test.ts` | Hàm thuần đúng; test pass thật | T1, T3 |
| WI-3 | Data layer + settings + log | `src/main/db/*`, `settingsStore`, `dataPathService`, `logger` | Tạo MMO-APP-DATA đúng cấu trúc; migration v1; CRUD repo chạy; đổi đường dẫn an toàn (không xóa cũ, không ghi đè DB) | T1, T2 |
| WI-4 | Khóa + secret + safeFetch | `lockManager`, `secretStore`, `safeFetch`, `ipc/guard.ts`, `ipc/lockIpc.ts` + tests | Loại trừ User/AI đúng; khóa AI chặn handler ghi; SSRF chặn đúng; khóa mã hóa/giải mã được | T1, T3, T2 |
| WI-5 | Miền dự án | `projectService`, `logoService`, `exportService`, `ipc/projectsIpc.ts`, `ipc/index.ts` | CRUD + import/export + chống trùng + đọc lại sau ghi + lấy/lưu logo (thất bại không phá việc thêm) | T1, T2 |
| WI-6 | Renderer shell + common | `styles/*`, `state/*`, `layout/*`, `common/*`, `App.tsx` | Sidebar 5 tab + Settings cuối; LockBanner; toast; tokens khớp UI_SPEC | T1, T2 |
| WI-7 | UI dự án | `features/projects/*` | Event MMO/Airdrop dùng chung page, tìm/lọc/sort đúng; chi tiết 5 khu vực; form; import/export; nhãn Cost | T1, T2 |
| WI-8 | AI Settings + Data Path + Appearance | `providerService`, `providers/*`, `ipc/settingsIpc.ts`, `features/settings/*`, `AppearanceProvider` | 5 Provider; Upload JSON + Help; Add Model; Test OK/Failed rõ nguyên nhân; khóa che dấu chấm; Export không khóa; Preview/Apply/Reset | T1, T2 |
| WI-9 | AI engine | `ai/types`, `agentRunner`, `tools`, `webTools`, `prompts`, `aiTaskRunner`, `pendingActions` + test | Agent loop giới hạn bước, Abort; tool whitelist không có tool ghi; pending chạy 1 lần, hết hạn, snapshot lệch thì từ chối | T1, T3 |
| WI-10 | Scan Project | `scanService`, `scanRepo`, `ipc/scanIpc.ts`, `features/scan/*` | Đúng workflow B.1/D.6; nhóm "Không đủ bằng chứng"; Gửi chỉ thêm mục đã chọn + đọc lại | T1, T2 |
| WI-11 | Check News + News | `checkNewsService`, `newsService`, `newsRepo`, `ipc/newsIpc.ts`, `features/news/*` | Chỉ tin trong ngày, không trùng, xác minh trên/chưa xác minh dưới, Deadline tính trực tiếp, không tự xóa | T1, T2 |
| WI-12 | AI Chat Box | `chatService`, `ipc/chatIpc.ts`, `features/chat/*` | Thêm/sửa/xóa đúng quy trình B.3; OK/Cancel; trước/sau do app tính; Options; đọc lại sau ghi | T1, T2 |
| WI-13 | Doanh thu | `revenueRepo`, `revenueService`, `ipc/revenueIpc.ts`, `features/revenue/*` | Tổng quan đúng công thức `ARCHITECTURE.md` §7.4; chưa quy đổi/points không vào doanh thu; xóa dự án giữ doanh thu | T1, T3, T2 |
| WI-14 | Tích hợp + validate toàn dự án | toàn bộ | Mục 7 (kịch bản T2) đạt hoặc `NOT RUN` ghi rõ; Map `actual`; ARCHITECTURE khớp code | T1, T2 |
| WI-15 | (chỉ khi tôi yêu cầu) Đóng gói | `electron-builder.yml` | Build installer; không đổi code | T1 |

Thứ tự phụ thuộc: WI-1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → (10, 11, 12, 13 độc lập, theo thứ tự tôi ưu tiên) → 14. WI bị chặn: ghi `[BLOCKED]`, làm tiếp WI độc lập.

### 6. Nhịp làm việc mỗi WI
`Analyze → Code → Test → Validate → Done`. Sau mỗi WI: báo cáo ngắn theo mẫu bên dưới, append `PROGRESS.md` đúng 6 dòng (`01_core.md` §21), liệt kê `STUB(<wi-id>)` còn lại, cập nhật `PROJECT_MAP.json` nếu file/dependency đổi. Không chạy được lệnh thì WI chỉ được `DONE-UNVERIFIED` kèm lệnh cho tôi; dự án chỉ được gọi `CODE-COMPLETE, UNVERIFIED`, không gọi `COMPLETED`. Hai fix liên tiếp thất bại: dừng, báo tôi, không chồng patch.

### 7. Kịch bản T2 tối thiểu (tôi sẽ chạy; bạn đưa bước cụ thể + kết quả kỳ vọng cho từng WI)
- **Khóa:** bấm Scan → LockBanner hiện; thử sửa dự án/đổi tab/Settings → bị chặn; click link website và mở chi tiết dự án → được; Hủy AI → mở khóa. Mở form sửa dự án rồi bấm Scan → bị từ chối kèm lý do.
- **OK/Cancel:** Chat "Xóa dự án" → chọn dự án → Cancel → dữ liệu không đổi; lặp lại → OK → dự án mất; doanh thu của dự án vẫn còn (nhãn "Dự án đã xóa"). Đổi tên ABC → XYZ cũng phải qua OK.
- **Scan:** dán 3 dự án (1 trùng DB) → dòng trùng bị khóa checkbox; model không có web search → Scan bị chặn kèm lý do; chọn 2 → Gửi → đúng 2 dự án được thêm, đọc lại khớp.
- **Check News:** chạy hai lần liên tiếp → lần 2 không lặp tin; tin chưa xác minh nằm dưới có nhãn; dự án quá hạn vẫn nằm ở nhóm "Đã qua hạn".
- **Offline:** tắt mạng → mọi tab (trừ AI) dùng được, logo vẫn hiện.
- **Khóa API:** lưu khóa → hiện ••••••; mở `secrets.json` bằng trình soạn thảo → không có khóa dạng thuần; Export cấu hình mặc định không có khóa.
- **Lỗi model:** nhập khóa sai → Test báo Failed + nguyên nhân; Chat báo lỗi rõ, **không** tự đổi model.
- **Data path:** đổi sang thư mục mới có sao chép → dữ liệu còn; thư mục cũ không bị xóa; trỏ vào thư mục đã có DB → hỏi, không ghi đè.
- **Doanh thu:** khoản `points` và khoản đã nhận chưa nhập USD không tính vào "Tổng thu thực nhận" nhưng hiện ở dòng "Chưa quy đổi".

### 8. Kết thúc (WI-14)
Validate toàn dự án theo `new_app.md` B6 (chức năng, UI/UX, workflow, kiến trúc, DB, xử lý lỗi, dependency, cấu trúc code ↔ Requirement). Đặt `PROJECT_MAP.json` thành `map_type:"actual"` (thêm `symbols`, `git_commit` nếu đọc được từ `.git\HEAD`, `generated_at`); cập nhật `ARCHITECTURE.md`/Blueprint nếu thiết kế đổi. Dọn rác (`01_core.md` §6). Append mục `COMPLETED` vào `PROGRESS.md` (chỉ khi mọi lệnh cần thiết đã được chạy thật).

### 9. Mẫu báo cáo mỗi WI (ngắn, rồi DỪNG chờ tôi)
```text
WI: <id — tên> — <DONE | DONE-UNVERIFIED | BLOCKED>
Changed:      <file:range — làm gì, vì sao>
Verified:     <T1/T2/T3 + lệnh + kết quả thật>
NOT RUN:      <lệnh PowerShell 5.1 + bước T2 cho tôi>
Assumptions:  <[ASSUMED] ...>
Risks/unfinished: <không giấu việc dở>   STUB còn lại: <STUB(<wi-id>) | none>
Out-of-scope: <chỉ nhắc, không sửa>
Cleanup:      none | LEFTOVER: <path + lệnh dọn>
Sync:         PROJECT_MAP.json updated | N/A | stale (lý do)
Next:         <WI tiếp theo>
```

**Bắt đầu ngay bây giờ với mục 0 (Question kênh approve), rồi WI-1.** Nếu thiếu thông tin hoặc có mâu thuẫn giữa các file Design Pack, hỏi 1 Question — không tự suy đoán.
