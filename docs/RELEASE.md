# Hướng dẫn phát hành bản mới

Tính năng "thông báo và cập nhật app" được bắt đầu từ bản có `electron-updater`. Bản v0.1.0 hiện có **không** có tính năng này → phải cài tay một lần bản có tính năng cập nhật mới.

## Quy trình phát hành

1. Tăng `version` trong `package.json` (ví dụ `0.1.1 → 0.1.2`).
2. Cập nhật `package-lock.json` tương ứng (`npm install`).
3. Commit thay đổi (`chore(release): vX.Y.Z`).
4. Tạo tag `vX.Y.Z` **đúng bằng** số version, đẩy tag lên `origin`.
5. GitHub Actions workflow `Build Windows Exe` sẽ chạy, build NSIS setup + portable, sinh `latest.yml` và `.blockmap`, rồi tạo GitHub Release (không draft, không pre-release).
6. Chỉ phát hành theo thứ tự phiên bản tăng dần.

## Lưu ý

- Bản chưa ký số có thể hiện cảnh báo Windows SmartScreen khi cài lần đầu.
- Bản đã cài trước khi có tính năng này (v0.1.0 và trước) phải **cài tay một lần** bản mới có tính năng cập nhật; từ bản đó trở về sau, app sẽ tự dò và thông báo bản mới sau 1 phút khởi động.
- Bản NSIS (setup) hỗ trợ tải và cài đè tự động; bản portable chỉ hiện thông báo và mở trang Release.
- Bảo vệ tài khoản GitHub bằng xác thực hai lớp trước khi đẩy tag.
- Trước lần cập nhật đầu tiên trên máy sản xuất, hãy sao lưu thư mục dữ liệu người dùng.
