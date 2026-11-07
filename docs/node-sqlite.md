# node:sqlite (replaces better-sqlite3)

## Lý do chọn `node:sqlite`

- Electron 45.2.3 bundles Node 24.22.2, có `node:sqlite` bản dựng sẵn (`DatabaseSync`) — không cần build native, không phụ thuộc Visual Studio / `node-gyp`.
- `better-sqlite3` gây lỗi postinstall: `Could not find any Visual Studio installation to use` trên máy không có C++ build tools.
- Quyết định đã được user phê duyệt: dùng `node:sqlite`, gỡ `better-sqlite3`, bỏ postinstall khỏi `package.json`, cài với `npm install --ignore-scripts`.

## Cách dùng trong app

- `src/main/db/connection.ts`: mở DB bằng `new DatabaseSync(dataPath)` trong `withTransaction(fn)` — mọi ghi được bao bọc trong transaction; `DatabaseSync` instance không import `dataPathService` (phụ thuộc một chiều).
- Tất cả SQL là **parameterized 100%** (`?.run(sql, params)`, `?.prepare(sql).get(param)`) — không ghép chuỗi vào truy vấn.
- Migration v1 đã tạo bảng: `projects`, `scan_latest`, `news_items`, `revenue_entries`, `settings`, `secrets`, `locks`.
- Repo layer: `projectsRepo.ts`, `scanRepo.ts`, `newsRepo.ts`, `revenueRepo.ts` chỉ đọc/ghi SQL thuần, không chứa nghiệp vụ.

## Ràng buộc bảo đảm

- Không có SDK AI, không có `better-sqlite3` trong `node_modules` (đã gỡ).
- `db/connection.ts` nhận đường dẫn làm tham số, `dataPathService` gọi `connection` để mở lại DB khi đổi đường dẫn — không vòng phụ thuộc.
- Test T3 (vitest/Node) kiểm logic thuần (`src/shared`) không đụch DB; DB kiểm bằng T2 trong Electron.
