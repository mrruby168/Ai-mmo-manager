# plan.md — Kế hoạch fix triệt để FIX 1–7 (AI MMO Manager)

Ngày lập: 07/11/2026. Căn cứ: repo `mrruby168/Ai-mmo-manager-check_fix`, commit `27bcebc` (Initial commit), trạng thái cuối trong `PROGRESS.md` là WI-16.
Đi kèm: `PROMPT-FIX-V2.md` (prompt dán cho AI sửa code). Tài liệu này là phần lý do, thiết kế và thứ tự làm. Prompt là phần lệnh.

Số dòng trích dẫn bên dưới là của commit `27bcebc`. Khi sửa, đối chiếu lại với code thật, nếu lệch thì tin code.

---

## 1. Baseline đã chạy thật

| Lệnh | Kết quả |
| --- | --- |
| `npm ci --ignore-scripts` | OK (361 gói) |
| `npm run typecheck` | Pass (node + web) |
| `npm test` | Pass: 23 file, 229 test |
| `npm run build` | Pass (renderer JS 786.90 kB, CSS 40.49 kB) |

Chưa chạy được ở môi trường lập kế hoạch: cửa sổ Electron (GUI), gọi AI thật, web search thật. Mọi kết luận về giao diện và hành vi với API thật bên dưới là suy ra từ code, đánh dấu **[chưa kiểm chứng GUI]** khi liên quan.

---

## 2. Nguyên nhân gốc theo từng FIX (đọc từ code)

### FIX 1 — UI tab News

| Mục | Hiện trạng | Nguyên nhân gốc |
| --- | --- | --- |
| 1.1 Tin quan trọng mới | `NewsPage.tsx:219-235` render toàn bộ `important`, mỗi tin 3 dòng (tên + giờ + badge, nội dung, nguồn), có nhóm "Chưa xác minh". | Chống trùng ở DB chỉ theo `project_id + source_url` (`newsService.ts:62`), nên một dự án có nhiều tin. UI không gom theo dự án. Không có trường nào lưu "mốc" (End/Snapshot…) nên không dựng được `GRASS – End 08/11/2026` một cách ổn định. |
| 1.2 Deadline sắp hết | `DeadlineRow` (`NewsPage.tsx:406-430`) hiện tên + ngày ISO + "Còn n ngày", không có logo. | `DeadlineItem` chỉ có `endDate` (`types.ts:120-127`). `computeDeadlines` (`tools.ts:656-681`) chỉ đọc `project.endDate`, bỏ dự án `completed`. Snapshot/Claim/Whitelist không có chỗ lưu nên không thể hiển thị. |
| 1.3 Việc cần làm ngay | `TodoRow` (`NewsPage.tsx:432-462`): checkbox đã đứng trước, nhưng body xếp 3 dòng (tên, nội dung, meta). | `.todo-item__summary` (`components.css:1643`) không giới hạn 1 dòng. Nội dung AI cho phép tới 280 ký tự (`schemas.ts:113`). |

### FIX 2 — Import News theo AI Mode

- `NewsPage.tsx:191-193` render nút Import News vô điều kiện. `isAiEnabled` đã có từ `useApp()` nhưng chỉ dùng cho `handleCheck` và EmptyState.
- `PROGRESS.md` (WI-16) ghi quyết định cũ "Import runs in both modes". Yêu cầu mới thay thế quyết định này.
- Chuyển mode cập nhật ngay: `AppContext.tsx:47-57` lấy lại settings mỗi khi `dataVersion` đổi. Nên ẩn bằng điều kiện render là đủ, không cần đổi IPC.
- Cần xử lý thêm: `importPreview` (modal xem trước, `NewsPage.tsx:321-368`) là state cục bộ. Nếu modal đang mở khi đổi mode thì phải đóng.

### FIX 3 — Check News trong AI Mode (phần nặng nhất)

| # | Phát hiện | Vị trí |
| --- | --- | --- |
| a | Check News bị chặn nếu model không có `supportsWebSearch`. Toàn bộ model OpenRouter (Gemma, Nemotron, North) và BeatAPI trong `providers-current.json` đều `false`, nên chạy là báo "không hỗ trợ Web Search". | `checkNewsService.ts:29-41` |
| b | Web search chỉ dựa vào tính năng gốc của provider: OpenAI-compatible gửi `web_search_options: {}`, Anthropic dùng `web_search_20250305` (`max_uses: 5`), Google dùng `google_search`. App **không có** tool `web_search` riêng. `web_fetch` chỉ tải một URL đã biết, không tìm kiếm được. | `openaiCompatible.ts:169-170`, `anthropic.ts:23-26`, `google.ts`, `tools.ts:253` |
| c | AI không tự lấy dữ liệu dự án. App nhét JSON 6 trường (`id, name, category, website, socials, endDate`) theo lô 3. `getNewsTools()` chỉ có `web_fetch` + `submit_news`, không có `list_projects`/`get_project`. | `checkNewsService.ts:80-91`, `tools.ts:629-631` |
| d | Lọc `status !== 'completed'` nên bỏ qua dự án đã hoàn thành dù còn Claim. | `checkNewsService.ts:47` |
| e | Chỉ nhận tin đăng **trong ngày**. End/Snapshot/Claim/Whitelist thường công bố trước đó nhiều ngày nên bị loại. No AI Mode lại dùng cửa sổ 7 ngày (`newsPrompt.ts:41`), hai chế độ không nhất quán. | `checkNewsService.ts:96,160`, `newsCheck.ts:46` |
| f | Kiểm chứng yếu. Lô không có dấu vết web search chỉ đổi dòng thông báo, tin vẫn được lưu với `verification` do model tự khai. `verifyNewsSources` chỉ kiểm tra trang có nhắc tên dự án, không kiểm tra ngày/mốc. Không kiểm tra `sourceUrl` có phải URL model thật sự đã thấy hay tự nghĩ ra. | `checkNewsService.ts:155-157`, `newsCheck.ts:97-139` |
| g | Prompt tin tức không nhắc End/Snapshot/Claim/Whitelist, schema tin không có trường mốc. | `prompts.ts:32-50`, `schemas.ts:110-123` |

### FIX 4 — Chat Box

- `CHAT_SYSTEM_PROMPT` (`prompts.ts:52-84`) mở đầu "Bạn chỉ có thể: đọc danh sách dự án, đề xuất THÊM/SỬA/XÓA…" nên AI bị kìm, trả lời cứng. Chat gọi với `enableWebSearch: false` (`chatService.ts:132`).
- **Có hai đường CRUD song song.** `tryDeterministicAdd` (`chatService.ts:74-101`, gọi ở `161-169`) tự tạo `PendingAction` bằng `createPendingAction`, trùng chức năng với tool `propose_add_projects` (`tools.ts:346-395`). Đây đúng là điều FIX 4 cấm.
- Nút nhanh Thêm/Sửa/Xóa chỉ điền sẵn câu vào ô nhập (`ChatPanel.tsx:277-285`). Giữ nguyên.

### FIX 5 — Dropdown Provider/Model và Chat Box

- **Dropdown mờ — nguyên nhân chính xác.** `ChatPanel.tsx:333-362` dùng `<select>` native (qua `Field.tsx:41`). `base.css:62-68` đặt `color: inherit` cho select nên `<option>` kế thừa chữ sáng `#e6edf7`, trong khi popup native của Chromium/Windows có nền trắng (không có `color-scheme: dark`, không có style cho `option`). Tương phản tính được: **1,18 : 1**. Chỉ dòng đang hover/chọn (nền xanh hệ thống) đọc được, khớp ảnh lỗi. Lỗi này ảnh hưởng **mọi** `<select>` trong app, không riêng Chat Box.
- `<option>` native không chứa được logo, nên muốn có logo Provider bắt buộc phải thay bằng listbox tự dựng.
- Chat Box hiện là popup 400×600 neo ở nút FAB góc phải (`components.css:757-774`). Hai select bị gộp trong một "pill" cao 32px nên tên "OpenRouter (Free)" bị cắt thành "OpenRouter (…". Mockup là dialog ở giữa (70% × 84%), có nhãn "Provider"/"Model" phía trên hai dropdown riêng, nút **New Chat** có icon +, ba nút nhanh trải full-width, tin nhắn có avatar + nhãn User/AI + giờ, khung PendingAction, composer có nút gửi bo góc vuông.
- Chưa có component logo Provider (chỉ có `ProjectLogo` cho dự án).

### FIX 6 — Icon tiêu đề

- `Sidebar.tsx:108-113`: chữ "M" nằm trong `<span class="sidebar__brand-mark">`, nền primary (`components.css:22-31`).
- Repo chưa có thư mục asset. `tsconfig.web.json` đặt `"types": []` nên import `.svg` sẽ lỗi typecheck nếu chưa khai báo kiểu.
- Cửa sổ Electron (`index.ts:80-92`) và `index.html` không có icon/favicon. Không thuộc FIX 6 (xem D9).

### FIX 7 — Màu Soft Royal Blue

- Teal chỉ nằm ở: `tokens.css:2-5, 15, 24` và hai chỗ hard-code trong `components.css`: dòng 1149 (`rgba(20, 184, 166, 0.18)`) và dòng 1172 (`rgba(45, 212, 191, 0.35)`). Không có hex Teal trong file `.tsx`.
- `--color-on-primary` (đang tối `#04141a`) được dùng ở `.btn--primary`, `.chat-message--user`, `.chat-fab`, `.sidebar__brand-mark`. Phải đổi thành trắng.
- `--color-primary` còn dùng làm chữ/viền (hover link dự án, `.chat-model-tier`, icon empty state…). Đổi token là đổi hết.
- `docs/design-pack/UI_SPEC.json`, `UI_PREVIEW.html` và bản trùng trong `readtobuild/` còn mô tả Teal. Không ảnh hưởng runtime nhưng sẽ lệch tài liệu.
- **Tương phản (đã tính):** chữ trắng trên `#5B8DEF` = **3,23 : 1**, trên hover `#709BF2` = **2,74 : 1**, trên active `#4779D0` = **4,27 : 1**. Thấp hơn mức AA 4,5 : 1 cho chữ thường. Xem D8.

---

## 3. Quyết định cần bạn xác nhận

Trả lời nhóm A trước khi code. Nhóm B có mặc định an toàn, có thể bỏ qua nếu đồng ý.

### Nhóm A — ảnh hưởng thiết kế

| # | Câu hỏi | Mặc định đã chọn | Nếu đổi |
| --- | --- | --- | --- |
| D1 | Lưu "mốc" End/Snapshot/Claim/Whitelist ở đâu? | Migration v2: thêm 2 cột nullable `milestone_kind`, `milestone_date` vào `news_items`. Chỉ thêm cột, không đổi bảng khác. Sao lưu file DB trước khi migrate. | Không đổi DB: trích mốc từ `summary` bằng regex. Không cần migration nhưng dễ sai, Deadline thiếu mốc. Prompt cũ cấm tự ý đổi DB, nhưng thay đổi này liên quan trực tiếp FIX 1 và FIX 3. |
| D2 | Web search cho Check News lấy từ đâu? | Tool `web_search` do app cung cấp qua một `SearchProvider` (Tavily, Brave Search hoặc SearXNG tự host), khóa API lưu bằng `secretStore`. Ưu tiên tính năng gốc của model nếu có. MCP để Phase mở rộng. | Chỉ dùng tính năng gốc của provider (giữ nguyên, nhưng nhóm model OpenRouter/BeatAPI không chạy được Check News). |
| D3 | Cửa sổ thời gian của tin | 7 ngày (UTC+7), giống No AI Mode. Phụ đề trang đổi thành "7 ngày gần nhất". | Giữ "chỉ hôm nay": Snapshot/End công bố trước sẽ bị loại. |
| D4 | Check News đọc những dự án nào? | Toàn bộ dự án (đúng chữ "toàn bộ" trong yêu cầu), dự án `completed` xếp sau và chỉ tìm Claim/Whitelist/Listing. No AI Mode giữ nguyên (chưa hoàn thành). | Giữ "chưa hoàn thành": ít tốn token hơn, nhưng bỏ sót Claim của dự án đã xong. |

### Nhóm B — có mặc định

| # | Nội dung | Mặc định |
| --- | --- | --- |
| D5 | Vị trí Chat Box | Theo mockup: dialog giữa màn hình, rộng `min(70vw, 960px)`, cao `84vh`, nền đặc. Nút FAB vẫn mở/đóng. Dưới 640px thì full-screen. |
| D6 | Nút kẹp giấy trong mockup | Không vẽ: app chưa có tính năng đính kèm, tránh nút chết. JSON cũng ghi "không thêm chức năng ngoài phạm vi". |
| D7 | Ảnh PNG và JSON mockup lệch nhau | Màu, bo góc, khoảng cách lấy từ **JSON**. Bố cục (avatar, nhãn, giờ, hàng full-width) lấy từ **PNG**. PNG dùng xanh đậm hơn và viền vàng cho PendingAction, JSON ghi `#5B8DEF`: theo JSON, giữ icon ⚠ màu cảnh báo. |
| D8 | Tương phản chữ trắng trên `#5B8DEF` (3,23 : 1) | Làm đúng spec. Bù bằng `font-weight: 600` và cỡ chữ tối thiểu 14px trên nút Primary. Ghi rủi ro vào báo cáo. Không tự đổi màu. Muốn đạt AA cần nền nút tối hơn. |
| D9 | Icon cửa sổ/taskbar/favicon | Ngoài phạm vi FIX 6. Nếu muốn: cần sinh PNG/ICO từ SVG và thêm cấu hình `electron-builder` (hiện chưa có khối `build`). |
| D10 | Đường nhanh khi dán JSON vào Chat | Giữ, nhưng gọi **cùng hàm dựng PendingAction** với tool `propose_add_projects`, không tạo PendingAction riêng. |
| D11 | Test cho React component | Không thêm dependency (repo dùng `environment: 'node'`, không có jsdom). Đặt logic vào hàm thuần trong `src/shared` để test, phần hiển thị kiểm bằng checklist GUI. |

---

## 4. Thiết kế

### 4.1 Mô hình mốc tin (D1) — nền cho FIX 1 và FIX 3

Thêm vào `src/shared/constants.ts`:

```ts
export const MILESTONE_KINDS = ['end', 'snapshot', 'claim', 'whitelist', 'tge', 'listing', 'other'] as const
export type MilestoneKind = (typeof MILESTONE_KINDS)[number]
```

- `schemas.ts` → `newsItemSchema` thêm `milestoneKind: z.enum(MILESTONE_KINDS).nullable().optional()` và `milestoneDate: dateOnly.nullable().optional()`. Cả hai tùy chọn để file import cũ và tin cũ vẫn hợp lệ. `newsPrompt.ts` sinh JSON Schema từ zod nên prompt No AI Mode tự có trường mới, cần cập nhật `tests/newsPrompt.test.ts` nếu so khớp.
- `migrations.ts`: hiện `runMigrations` thoát sớm khi `user_version >= 1` (dòng 90-92). Viết lại thành migrate từng bậc: `SCHEMA_V2` gồm hai lệnh `ALTER TABLE news_items ADD COLUMN …`, đặt `PRAGMA user_version = 2` trong cùng transaction. Trước khi migrate, `connection.ts` sao lưu file DB sang `*.bak-v1` (chỉ một lần).
- `newsRepo.ts` (`COLUMNS`, `NewsRow`, `NewsRecord`, `mapRow`, `insertNews`), `types.ts` (`NewsItem`), `newsService.ts` (`NewsBatchInput`, `saveNewsBatch`), `newsCheck.ts` (`VerifiedNewsItem`, `parseNewsSubmission`), `newsImportService.ts`, `tools.ts` (`NEWS_ITEM_PROPS`): truyền hai trường qua.
- `DeadlineItem` (`types.ts:120-127`): đổi `endDate` thành `date`, thêm `kind: MilestoneKind`, `verification`. Chỉ 3 nơi dùng (`tools.ts`, `newsService.ts`, `NewsPage.tsx`), không test nào tham chiếu. Chuyển `computeDeadlines` từ `tools.ts` sang `newsService.ts` (không tool nào dùng).

### 4.2 Hàm thuần `src/shared/newsView.ts` (để test không cần DOM)

| Hàm | Việc |
| --- | --- |
| `formatDmy('2026-11-08')` | → `08/11/2026` |
| `MILESTONE_LABEL` | `end → End`, `snapshot → Snapshot`, `claim → Claim`, `whitelist → Whitelist`, `tge → TGE`, `listing → Listing`, `other → Mốc khác` |
| `buildHeadline(item)` | Có `milestoneKind` + `milestoneDate` → `End 08/11/2026`. Thiếu → `extractMilestoneFromText(summary)`. Vẫn thiếu → rút gọn `summary` còn tối đa 60 ký tự. |
| `extractMilestoneFromText(text)` | Dự phòng cho tin cũ và tin No AI Mode: bắt từ khóa (end/ends/kết thúc, snapshot, claim, whitelist/WL, TGE, listing) cùng ngày dạng `yyyy-mm-dd`, `dd/mm/yyyy`, `dd/mm`, `Nov 8`, `8 tháng 11`. |
| `selectTopImportantPerProject(items, today)` | Mỗi dự án đúng 1 tin. Xếp hạng: verified trước; mốc sắp tới gần nhất (ngày ≥ hôm nay) trước; rồi thứ tự ưu tiên `end < snapshot < claim < whitelist < tge < listing < other`; cuối cùng `publishedAt` mới nhất. Tin bị ẩn vẫn nằm trong DB. |
| `buildDeadlineRows(projects, news, today)` | Gộp `project.endDate` (loại `completed`, như hiện tại) và mốc từ tin (mọi dự án, ngày chưa qua hoặc còn trong nhóm "đã qua hạn"). Trùng `(projectId, kind, date)` thì gộp một dòng. Cùng `(projectId, kind)` khác ngày: mốc từ tin **verified** thắng `project.endDate`; mốc **unverified** không ghi đè, hiển thị thành dòng riêng kèm badge "Chưa xác minh". Phân nhóm giữ nguyên `DEADLINE_WINDOWS` (≤3 ngày gấp, 4-14 sắp tới, <0 đã qua). |
| `oneLine(text, max)` | Gộp khoảng trắng, cắt, thêm `…`. |

### 4.3 Giao diện News (FIX 1)

- **1.1** Một danh sách, mỗi dự án một hàng một dòng: `[Logo 24px] **Tên dự án** – End 08/11/2026 … [badge nếu chưa xác minh] [↗]`. Dòng dùng `display:flex; white-space:nowrap; overflow:hidden; text-overflow:ellipsis` cho phần headline, `title` chứa nội dung đầy đủ. Bấm tên mở chi tiết dự án (như hiện tại). Biểu tượng ↗ mở bài gốc, `aria-label="Mở bài gốc"`. Bỏ nhóm "Chưa xác minh" riêng, tin chưa xác minh giữ viền cảnh báo hiện có (`.news-item--unverified`). Bộ đếm đổi thành số dự án.
- **1.2** Mỗi hàng: `[Logo 24px] Tên dự án: End 08/11/2026`, bên phải giữ chữ đếm ngược ("Còn 1 ngày") và màu theo tone hiện có. Một dự án có nhiều mốc thì có nhiều hàng.
- **1.3** Lưới `grid-template-columns: auto 1fr auto`. Hàng 1: checkbox, tên dự án (đậm), nút "Chi tiết". Hàng 2 thụt lề đúng bằng cột checkbox: nội dung task một dòng có dấu `…`. Hạn (`todoDeadline`) hiện thành chip nhỏ cùng hàng với tên. Cả hàng vẫn bấm để tích.
- Prompt Check News và No AI yêu cầu `summary` ≤ 120 ký tự (todo ≤ 90). Schema vẫn giữ tối đa 280 để tương thích.

### 4.4 FIX 2

```tsx
{!isAiEnabled ? (<Button variant="secondary" …>Import News</Button>) : null}
useEffect(() => { if (isAiEnabled) setImportPreview(null) }, [isAiEnabled])
```

`handleImportPreview` trả về sớm nếu `isAiEnabled`. Không đổi IPC (ẩn ở UI là đúng phạm vi yêu cầu, import tin không phải ranh giới bảo mật như khóa AI). Cập nhật câu EmptyState nếu còn nhắc Import ở chế độ AI.

### 4.5 FIX 3 — Check News thật sự tìm kiếm và xác minh

**A. `webSearchService.ts` (main)**
- Giao diện `SearchProvider.search(query, { signal, maxResults }) → { title, url, snippet, publishedAt? }[]`.
- Adapter: Tavily, Brave Search, SearXNG (người dùng nhập URL, cần bật định dạng JSON). **Hãy đọc tài liệu chính thức của từng dịch vụ lúc cài đặt** để xác nhận endpoint, header xác thực, giới hạn miễn phí. Plan này không khẳng định các chi tiết đó.
- Gọi từ tiến trình main bằng `fetch` riêng (CSP `connect-src` chỉ áp cho renderer). Không dùng `safeFetch` cho địa chỉ SearXNG nội bộ vì `safeFetch` chặn IP/localhost: dùng đường riêng chỉ cho URL do người dùng cấu hình, có timeout và giới hạn kích thước.
- Cấu hình: `settings.json` thêm `webSearch: { provider: 'none' | 'tavily' | 'brave' | 'searxng', baseUrl?: string }` (tùy chọn, file cũ mặc định `none`, giữ `schemaVersion: 1`). Khóa API lưu bằng `secretStore` với id `websearch:<provider>`. Kênh IPC mới: lưu cấu hình và thử kết nối. UI: một panel "Web Search" trong Settings, có nút Thử.
- Không dùng cách cào HTML công cụ tìm kiếm không chính thức làm mặc định (dễ bị chặn, rủi ro điều khoản).

**B. Tool `web_search` trong `tools.ts`**
- `{ query: string }` → danh sách kết quả bọc trong `<untrusted_web_content>`. Có hạn mức mỗi lô (đề xuất 8 lần), theo mẫu `createLimitedWebFetchTool` (`tools.ts:270-282`).
- `getNewsTools(options?)` giữ tương thích chữ ký hiện có: thêm `web_search` khi đã cấu hình, thêm `list_projects` và `get_project` (đã có sẵn trong `tools.ts`).

**C. `requireSelection` mới**
- Cho phép chạy khi: model hỗ trợ tool **và** (model có `supportsWebSearch` **hoặc** app đã cấu hình Web Search). Nếu cả hai đều không: báo lỗi nói rõ hai cách xử lý (chọn model có Web Search, hoặc cấu hình Web Search trong Settings).

**D. Dữ liệu dự án cho AI**
- App vẫn cắt lô và đưa **mọi** dự án trong phạm vi (D4) vào, vì cách này bảo đảm không bỏ sót dự án nào, chắc hơn việc trông chờ model tự gọi tool. Mở rộng payload mỗi dự án: `id, name, category, status, website, socials, startDate, endDate, taskSummary` (cắt 300 ký tự), tối đa 3 `sources`, và `knownMilestones` (từ `endDate` + tin đã lưu) để AI đối chiếu thay vì phát hiện lại.
- Vẫn cấp `list_projects`/`get_project` cho AI muốn đọc thêm. Tiến trình báo `Lô i/N`.

**E. Cửa sổ thời gian (D3)**: dùng `isWithinNewsWindow` cho cả `parseNewsSubmission` và `saveNewsBatch` (thay `isSameLocalDay`).

**F. Chống bịa tin**
1. Theo dõi bằng bộ ghi trong closure từng lô: số lần `web_search` thành công, các URL đã thấy (từ kết quả `web_search`, `web_fetch` và `webSearch.sources` của trace gốc).
2. Lô **không có bất kỳ bằng chứng nào** (không trace gốc `used`, không `web_search` thành công, không `web_fetch` thành công) → **loại cả lô**, đếm vào `noEvidenceBatches`, thông báo rõ. Không lưu tin tự khai.
3. Nếu tập URL đã thấy không rỗng: item có `sourceUrl` không thuộc tập đó → loại (URL do model tự nghĩ). Nếu provider không trả nguồn thì dựa vào bước 4.
4. Mở rộng `verifyNewsSources`: ngoài việc trang nhắc tên dự án, phải thấy ngày mốc (nhiều dạng: ISO, `dd/mm/yyyy`, `d/m`, `Nov 8`, `8 tháng 11`) và từ khóa của loại mốc. Thiếu → hạ `verification` thành `unverified`. Trang không đọc được (X/Twitter, tường đăng nhập) giữ hành vi hiện tại: giữ tin, hạ xuống `unverified`.
5. Lô lỗi không còn `continue` im lặng: thu lý do đầu tiên vào thông báo cuối.

**G. Prompt (`NEWS_SYSTEM_PROMPT`)**: nêu rõ End, Snapshot, Claim, Whitelist, TGE, Listing; bắt buộc điền `milestoneKind` + `milestoneDate` khi bài nêu ngày; tối đa **1** tin `important` mỗi dự án (tin quan trọng nhất), `todo` thì tùy; `summary` ngắn; cấm bịa ngày/nguồn; nội dung web vẫn là dữ liệu.

**H. MCP (không bắt buộc)**: giữ `SearchProvider` làm điểm cắm để sau này thêm adapter MCP (client stdio/HTTP). Chỉ làm khi bạn chọn MCP ở D2, vì cần thêm cơ chế khởi chạy tiến trình và cấp quyền trong môi trường sandbox.

### 4.6 FIX 4 — AI Chat

- Viết lại phần mở đầu `CHAT_SYSTEM_PROMPT`: bỏ "Bạn chỉ có thể…". Nội dung mới: trả lời tự nhiên mọi câu hỏi bằng hiểu biết của model (không ép chuyện dự án); khi người dùng muốn xem/thêm/sửa/xóa dự án thì **bắt buộc** dùng tool sẵn có (`list_projects`, `get_project`, `propose_*`, `ask_user_choice`); không nói "đã thêm/đã xóa" khi chưa có tool và chưa có OK. Giữ nguyên mọi luồng và quy tắc OK/Cancel hiện tại. Không sửa `CORE_RULES` dùng chung với Scan/News.
- Một cơ chế CRUD duy nhất: tách phần dựng `PendingAction` kiểu `add` trong `propose_add_projects` (`tools.ts:381-391`) thành hàm dùng chung (ví dụ `buildAddPendingAction(items, errors)`), cho cả tool và đường nhanh `tryDeterministicAdd`. Sau thay đổi, `chatService.ts` **không còn gọi** `createPendingAction` (hiện gọi ở dòng 84). Chỉ `tools.ts` dựng PendingAction: một chỗ cho `add` (trong hàm dùng chung), cộng `update` và `delete` như cũ.
- Giữ nguyên: nút nhanh, nút dừng, lựa chọn `ask_user_choice`, OK/Cancel, `enrichWithLinks`, giới hạn độ dài, luồng sửa/xóa (`updateProjectWithChanges`, `deleteProjectById`).

### 4.7 FIX 5 — Giao diện chọn Provider/Model và Chat Box

**Bước hotfix toàn cục (rẻ, rủi ro thấp):** thêm `:root { color-scheme: dark; }` và `select option { background: var(--color-surface); color: var(--color-text); }` trong `base.css`. Sửa ngay popup trắng chữ sáng ở mọi `<select>` còn lại của app (bộ lọc, Settings…). Kiểm tra lại thanh cuộn và ô ngày sau khi đổi `color-scheme`.

**Component `common/Listbox.tsx` (tự viết, không thêm thư viện):**
- Nút kích hoạt `role="combobox"` + `aria-haspopup="listbox"` + `aria-expanded`; danh sách `role="listbox"`, mục `role="option"` + `aria-selected`.
- Bàn phím: Enter/Space mở, ↑ ↓ Home End di chuyển, Enter chọn, Esc đóng, gõ chữ để nhảy mục. Bấm ra ngoài thì đóng.
- Popup dựng bằng portal ra `document.body`, `position: fixed` theo vị trí nút (vì `.chat-panel` có `overflow: hidden`, popup absolute sẽ bị cắt). `z-index` cao hơn chat (50) và FAB (60). Lật lên trên nếu thiếu chỗ dưới. Tối đa cao 280px, có cuộn.
- Nền đặc `#172235`, viền `#40516B`, chữ `#FFFFFF`, hover `#243A5A`; mục đang chọn có dấu ✓ màu `#5B8DEF` và nền nhấn nhẹ. Không dùng độ trong suốt.
- Mỗi mục: logo + tên + (tùy chọn) nhãn Free/Paid. Trạng thái disabled giữ tương phản đọc được.

**Component `common/ProviderLogo.tsx`:**
- SVG inline cho `openai`, `anthropic`, `opencode`, `google` và OpenRouter (nhận diện theo host `openrouter.ai` trong `baseUrl`, hoặc tên chứa "openrouter"). Provider tùy chỉnh khác dùng chữ cái đầu như `ProjectLogo` (tách bảng màu dùng chung).
- Không tải logo từ mạng (CSP chặn). Đây là nhãn hiệu của bên thứ ba: dùng bản vẽ đơn sắc đơn giản và kiểm tra điều khoản thương hiệu trước khi phát hành.

**Chat Box theo `ui-new-chatbox.json` + PNG (D5, D6, D7):**

| Phần | Yêu cầu |
| --- | --- |
| Khung | Giữa màn hình, rộng `min(70vw, 960px)`, cao `84vh`, nền `#111A2A`, viền 1px `#2D3B50`, bo 10, đổ bóng `0 16px 40px rgba(0,0,0,.35)`, padding 16. Lớp nền phía sau đặc màu tối. Dưới 640px thì full-screen. |
| Header | Icon robot/AI màu `#5B8DEF`, tiêu đề "AI Chat" (600), nút **New Chat** (Primary, icon +, giữ `handleNewChat`), nút đóng ✕. Đường kẻ dưới `#2D3B50`. |
| Provider/Model | Hai `Listbox` riêng, nhãn "Provider" và "Model" (`#7F8DA3`) ở trên, tỉ lệ khoảng 40/60. Model có icon tia sáng. Tên đầy đủ, chỉ cắt khi thật sự hết chỗ, `title` hiện tên đầy đủ. Giữ nhãn Free/Paid. |
| Nút nhanh | 3 ô trải đều, nền `#172235`, viền `#2D3B50`, chữ `#D6DEEA`. Icon + và ✎ màu `#5B8DEF`, icon xóa và chữ "Xóa dự án" màu `#FF8D9A`. Hover: viền `#5B8DEF`, nền `#243A5A`. |
| Tin nhắn | Hàng có avatar tròn, nhãn "User"/"AI" (xanh), giờ `HH:mm` bên phải, nội dung dưới. Nền user `#243A5A`, AI `#182638`, bo 8, padding 12. Thêm `at` vào `ChatMessage`. Người dùng căn phải (rộng tối đa ~88%), AI căn trái. |
| PendingAction | Nền `#202D41`, viền 1px `#5B8DEF`, bo 8; icon ⚠, nhãn "PendingAction", nội dung xác nhận; nút **OK** (Primary) và **Cancel** (Secondary) bên phải. Giữ khối Trước/Sau, danh sách `details`, dòng "hết hạn sau 30 phút". |
| Composer | Nền `#0F1827`, viền `#40516B`, bo 7, placeholder "Nhập tin nhắn…", ô nhập tự giãn đến ~8,5rem; nút gửi Primary vuông bo 5, icon trắng. Gửi `Ctrl+Enter` như hiện tại. Khi đang chạy: nút Dừng (danger) như hiện tại. |
| Giữ nguyên | FAB, trạng thái `isAiBusy`, banner lỗi, empty state, `ask_user_choice`, `aria-live`, `prefers-reduced-motion`, chọn Provider/Model và lưu `lastSelection`. |

Màu đặt thành biến có tiền tố `--chat-*` trong `tokens.css` (không đổi nền của các trang còn lại). Chỉ một màu nhấn `#5B8DEF`. Icon cùng một bộ nét vẽ (viewBox 24, stroke 1.7-1.9) như các icon hiện có trong `ChatPanel.tsx`. Xóa CSS `.chat-model-pill*` không còn dùng.

### 4.8 FIX 6

- Sao chép **nguyên bản** `new_icon.svg` vào `src/renderer/src/assets/new-icon.svg`, không chỉnh sửa.
- Tạo `src/renderer/src/vite-env.d.ts` có `/// <reference types="vite/client" />` (vì `tsconfig.web.json` đặt `types: []`), rồi `import appIcon from '../assets/new-icon.svg'` trong `Sidebar.tsx`.
- Thay `<span class="sidebar__brand-mark">M</span>` bằng `<img src={appIcon} alt="" aria-hidden="true" width={28} height={28} />`. Xóa nền, màu, chữ của `.sidebar__brand-mark` (SVG đã có sẵn nền bo góc xanh, giữ lại sẽ thành hai lớp). Ảnh nhỏ được Vite nhúng dạng `data:`, CSP `img-src 'self' data:` cho phép.
- Giữ nguyên chữ "MMO Manager". Kiểm tra cả khi sidebar thu gọn (≤1024px, chỉ còn icon).
- Phương án dự phòng nếu khai báo kiểu gây vướng: nhúng nguyên markup SVG vào một component, giữ nguyên các thẻ.

### 4.9 FIX 7

`tokens.css`:

```css
--color-primary: #5b8def;
--color-primary-hover: #709bf2;
--color-primary-active: #4779d0;
--color-on-primary: #ffffff;
--color-focus: #8cb0ff;
--color-primary-soft: rgba(91, 141, 239, 0.16);
--color-primary-ring: rgba(91, 141, 239, 0.18);        /* thay components.css:1149 */
--color-primary-ring-strong: rgba(91, 141, 239, 0.35); /* thay components.css:1172 */
```

- Không đổi `--color-danger-solid`, success/warning/error/info, nút Secondary/Ghost.
- Đảm bảo `.btn--primary` đặt `color: var(--color-on-primary)` cho cả icon (`currentColor`). Kiểm tra các nơi dùng `--color-on-primary` còn lại (`.chat-fab`, nút Primary trong modal).
- Cập nhật `docs/design-pack/UI_SPEC.json`, `UI_PREVIEW.html` và bản trong `readtobuild/` (hoặc ghi chú rõ đã lỗi thời).

---

## 5. Thứ tự thực hiện (mỗi bước một commit)

Sau **mỗi bước** chạy `npm run typecheck`, `npm test`, `npm run build`. Chỉ sang bước sau khi cả ba xanh.

| Bước | Nội dung | Vì sao đặt ở đây |
| --- | --- | --- |
| 1 | FIX 7: đổi token màu | Toàn cục, rẻ, các bước sau dùng chung token |
| 2 | FIX 6: icon tiêu đề | Độc lập, nhỏ |
| 3 | FIX 2: ẩn Import News ở AI Mode | Độc lập, nhỏ |
| 4 | FIX 5a: hotfix `color-scheme`/`option` toàn cục | Sửa ngay lỗi mờ ở mọi select |
| 5 | FIX 5b: `Listbox` + `ProviderLogo` | Cần trước khi dựng lại Chat Box |
| 6 | FIX 5c: dựng lại Chat Box | Dùng `Listbox`, token mới |
| 7 | FIX 1 phần dữ liệu: D1 (hằng số, schema, migration, repo, type) | Nền cho giao diện News và Check News |
| 8 | FIX 1 phần hiển thị: `newsView.ts` + giao diện 1.1/1.2/1.3 | Cần dữ liệu ở bước 7 |
| 9 | FIX 3: `webSearchService`, tool, `requireSelection`, chống bịa tin, prompt, panel Settings | Cần trường mốc từ bước 7 |
| 10 | FIX 4: prompt Chat, gộp cơ chế CRUD | Chạm cùng khu vực chat, làm sau khi giao diện ổn định |
| 11 | Quét cuối: toàn bộ checklist, cập nhật `PROGRESS.md`, `PROJECT_MAP.json` | |

### Chi tiết từng bước

**Bước 1 — FIX 7.** Sửa `tokens.css` và hai chỗ hard-code (mục 4.9). Test: `tests/themeTokens.test.ts` đọc `tokens.css`, khẳng định 5 giá trị màu mới, và quét `src/` không còn `14b8a6|2dd4bf|0f9f8f|04141a|20, ?184, ?166|45, ?212, ?191`. *Xong khi:* test xanh, quét GUI toàn bộ trang không còn Teal ở thành phần Primary.

**Bước 2 — FIX 6.** Theo 4.8. *Xong khi:* icon hiển thị sắc nét ở sidebar mở rộng và thu gọn, chữ "MMO Manager" còn nguyên, `typecheck` xanh.

**Bước 3 — FIX 2.** Theo 4.4. *Xong khi:* No AI Mode có nút Import News, chuyển sang AI Mode nút biến mất ngay (không cần tải lại), modal xem trước đóng nếu đang mở.

**Bước 4 — FIX 5a.** Thêm hai quy tắc CSS trong `base.css`. *Xong khi:* mở `<select>` bất kỳ (kể cả ở Settings) thấy nền tối, chữ sáng rõ.

**Bước 5 — FIX 5b.** `Listbox.tsx`, `ProviderLogo.tsx`, logic mở/đóng/vị trí tách thành hàm thuần nếu có thể (tính hướng mở, chỉ số kế tiếp khi bấm phím) và test. *Xong khi:* điều khiển được hoàn toàn bằng bàn phím, popup không bị cắt trong khung chat, hiện đủ logo của OpenRouter, OpenAI, Google, OpenCode.

**Bước 6 — FIX 5c.** Theo bảng 4.7. *Xong khi:* so với `ui-new-chatbox.png` khớp bố cục, màu khớp `ui-new-chatbox.json`; nút nhanh, gửi/dừng, OK/Cancel, chọn lựa chọn, đổi Provider/Model, Chat mới đều hoạt động như trước.

**Bước 7 — FIX 1 dữ liệu.** Theo 4.1. Test: `tests/migrations.test.ts` (DB v1 có dữ liệu → mở lại thì lên v2, dữ liệu cũ nguyên vẹn, `milestone_*` là NULL), `tests/schemas.test.ts` (tin có và không có mốc, mốc sai định dạng bị loại), `tests/dbRepo.test.ts` (ghi/đọc mốc), `tests/newsImport.test.ts` (file cũ vẫn nhập được). *Xong khi:* test xanh, DB cũ mở không mất dữ liệu.

**Bước 8 — FIX 1 hiển thị.** Theo 4.2, 4.3. Test thuần cho `newsView.ts`: `formatDmy`, `buildHeadline` (có mốc/không mốc/tin tiếng Việt và tiếng Anh), `selectTopImportantPerProject` (hai tin cùng dự án chỉ còn một; ưu tiên verified; ưu tiên mốc gần nhất), `buildDeadlineRows` (End + Snapshot cùng dự án ra hai hàng; trùng thì gộp; dự án `completed` vẫn hiện mốc Claim từ tin), `oneLine`. *Xong khi:* ba mục News đúng định dạng của yêu cầu, ví dụ `GRASS – End 08/11/2026`.

**Bước 9 — FIX 3.** Theo 4.5, làm theo thứ tự: `webSearchService` + test adapter bằng `fetch` giả (chuyển kết quả, lỗi 401/429, che khóa API) → tool `web_search` + test ràng buộc schema (đã có `toolSchemas.test.ts` quét mọi tool) → `requireSelection` mới → bộ ghi bằng chứng và loại lô/URL không có bằng chứng → mở rộng `verifyNewsSources` → prompt → panel Settings và IPC. Test thêm trong `tests/newsCheck.test.ts`: lô không bằng chứng bị loại, URL lạ bị loại, ngày mốc không có trong trang thì hạ `unverified`, cửa sổ 7 ngày nhận tin hôm kia và loại tin 8 ngày trước. *Xong khi:* test xanh. Chạy thật với khóa tìm kiếm và model thật rồi ghi kết quả vào báo cáo. Nếu không chạy được thì ghi **"chưa kiểm chứng với API thật"**, không báo là đã hoạt động.

**Bước 10 — FIX 4.** Theo 4.6. Test dùng `ModelClient` giả: câu chào và câu hỏi kiến thức → trả lời văn bản, không gọi tool; "xóa dự án X" → `propose_delete_projects` → có PendingAction; dán JSON → đi qua hàm dựng chung (kiểm bằng `grep -n "createPendingAction" src/main/ai/chatService.ts`, kỳ vọng không còn kết quả). Chạy lại `chatAdd`, `pendingActions`, `agentRunner` hiện có. *Xong khi:* test xanh, `chatService.ts` không còn tự dựng PendingAction.

**Bước 11 — Quét cuối.** Chạy checklist mục 7, cập nhật `PROGRESS.md` (thêm WI-17), `PROJECT_MAP.json`, tài liệu design.

---

## 6. Ma trận test

| Test (mới hoặc cập nhật) | Bảo vệ |
| --- | --- |
| `themeTokens.test.ts` (mới) | FIX 7: giá trị token, không còn Teal |
| `newsView.test.ts` (mới) | FIX 1: tiêu đề, một tin mỗi dự án, gộp mốc deadline, cắt một dòng |
| `migrations.test.ts` (mới) | D1: lên v2 giữ nguyên dữ liệu |
| `schemas.test.ts`, `dbRepo.test.ts`, `newsImport.test.ts`, `newsPrompt.test.ts` (cập nhật) | Trường mốc tùy chọn, tương thích tệp cũ |
| `webSearch.test.ts` (mới) | FIX 3: adapter, lỗi, che khóa |
| `newsCheck.test.ts`, `newsBatch.test.ts` (cập nhật) | FIX 3: bằng chứng, URL lạ, ngày mốc, cửa sổ 7 ngày |
| `toolSchemas.test.ts` (có sẵn) | Tool mới không có `array` thiếu `items`, `object` thiếu `properties` |
| `chatFlow.test.ts` (mới) | FIX 4: trả lời tự nhiên, dùng tool cho CRUD, một cơ chế dựng PendingAction |
| `listbox.test.ts` (mới, hàm thuần) | FIX 5: điều hướng bàn phím, hướng mở |

---

## 7. Checklist kiểm tay (GUI) — bắt buộc vì chưa chạy được Electron

1. Mọi trang (News, Event MMO, Airdrop, Scan Project, Doanh thu, Settings, chi tiết dự án, các hộp thoại): nút Primary nền `#5B8DEF`, chữ và icon trắng; hover/active/focus đúng màu; sidebar active, checkbox đúng màu; nút xóa và trạng thái thành công/cảnh báo/lỗi không đổi.
2. Sidebar mở rộng và thu gọn: icon mới rõ nét, không bị méo, chữ "MMO Manager" còn đó.
3. News: tin quan trọng mỗi dự án một dòng; Deadline ra End và Snapshot đúng định dạng; Việc cần làm: checkbox trước tên, nội dung một dòng có `…`.
4. Settings → đổi No AI ↔ AI: nút Import News xuất hiện/biến mất ngay trong tab News.
5. Chat Box: mở dropdown Provider và Model, đọc rõ mọi mục, mục đang chọn nổi bật, có logo, dùng được bàn phím; popup không bị cắt.
6. Chat Box: so với ảnh mẫu từng khu vực; thử gửi, dừng, New Chat, nút nhanh, OK/Cancel, lựa chọn nhanh.
7. Check News với model có search gốc và với model OpenRouter + `web_search` của app: có tin thật, có nguồn mở được, có mốc End/Snapshot; thử với model không có bằng chứng thì lô bị loại và thông báo rõ.
8. Chat: hỏi một câu kiến thức bất kỳ (trả lời tự nhiên), rồi "thêm/sửa/xóa dự án" (ra thẻ xác nhận), dán JSON dự án (ra thẻ xác nhận).

> **Trạng thái kiểm tra (2026-11-07): CHƯA KIỂM CHỨNG GUI.** Môi trường thực hiện không chạy được Electron, nên cả 8 mục trên chưa được kiểm tra bằng mắt. Kết quả trong báo cáo cuối chỉ đến từ `typecheck`, `test`, `build` và đọc code.

---

## 8. Rủi ro

| Rủi ro | Giảm thiểu |
| --- | --- |
| Migration DB không đảo ngược | Sao lưu `*.bak-v1` trước khi lên v2; test với DB v1 thật; chỉ `ADD COLUMN` nullable. |
| Dịch vụ tìm kiếm đổi API/giới hạn | Đọc tài liệu chính thức khi cài đặt; adapter tách biệt; lỗi 401/429 báo thẳng cho người dùng. |
| Cờ `supportsWebSearch` trong file provider là do người dùng tự khai, chưa kiểm chứng với gateway (ví dụ wusrouter) | Dựa vào bằng chứng thực tế (trace/`web_search` thành công), không dựa vào cờ. |
| Chữ trắng trên `#5B8DEF` dưới mức AA (D8) | Làm đúng spec, bù bằng đậm chữ; ghi rủi ro; chỉ đổi nếu bạn đồng ý. |
| Đổi `color-scheme` có thể làm đổi diện mạo ô ngày/thanh cuộn | Kiểm tay ở bước 4; nếu lệch thì chỉ giữ quy tắc `option`. |
| Listbox tự viết dễ sót trường hợp bàn phím/trỏ chuột | Test hàm thuần; checklist kiểm tay mục 5. |
| Lô quá nhiều khi lấy cả dự án `completed` (D4) | Xếp dự án chưa hoàn thành trước; thông báo tiến độ theo lô; có thể dừng giữa chừng (đã có). |
| Múi giờ: `todayDateOnly` theo máy, prompt No AI theo UTC+7 | Cùng múi giờ với bạn nên chưa lệch; ghi chú trong báo cáo, không sửa ngoài phạm vi. |

---

## 9. Điều kiện hoàn thành và mẫu báo cáo

Hoàn thành khi cả 7 FIX đạt "Xong khi", và `typecheck`, `test`, `build` xanh. Báo cáo theo mẫu:

```
FIX n — <tên>
- File đã đổi: …
- Test đã thêm/sửa: …
- Kết quả: typecheck ✔/✘ · test x/y · build ✔/✘
- Đã kiểm chứng: …
- CHƯA kiểm chứng: … (GUI, API thật…)
- Quyết định đã áp dụng (D1…D11): …
- Còn mở: …
```

Không viết "đã hoạt động" cho điều chưa chạy thật. Điều gì dựa trên suy luận từ code phải ghi rõ là suy luận.