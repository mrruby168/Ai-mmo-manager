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
- Bản đã cài trước khi có tính năng này (v0.1.0 và trước) phải **cài tay một lần** bản mới có tính năng cập nhật; từ bản đó trở về sau, app sẽ tự dò và thông báo bản mới sau 10 giây khởi động (chỉ bản đóng gói, không dò ở chế độ dev).
- Bản NSIS (setup) hỗ trợ tải và cài đè tự động; bản portable chỉ hiện thông báo và mở trang Release.
- Luồng cập nhật mới: app tự dò sau 10 giây (chỉ bản đóng gói), hiện nút vàng ở cuối sidebar và hộp thoại "Có phiên bản mới!" tự mở một lần mỗi phiên bản. App chặn khởi động lại để cài khi AI đang chạy hoặc người dùng đang chỉnh sửa dữ liệu và hiện lý do trong hộp thoại.
- Cùng một số phiên bản sẽ không tự cập nhật: máy đang chạy bản lỗi phải cài tay bản mới (hoặc phát hành phiên bản cao hơn, ví dụ 0.1.4).
- Bảo vệ tài khoản GitHub bằng xác thực hai lớp trước khi đẩy tag.
- Trước lần cập nhật đầu tiên trên máy sản xuất, hãy sao lưu thư mục dữ liệu người dùng.

## Ghi chú phát hành

### v0.1.4 — Daily Scan / Full Scan cho Check News

- **Lưu ý cập nhật quan trọng:** v0.1.4 là bản đầu tiên có luồng cập nhật đã sửa. Bản 0.1.2 và 0.1.3 đã phát hành chứa lỗi trắng màn hình khi thấy bản cập nhật, nên người dùng các bản đó **phải tải và cài tay v0.1.4 một lần**; từ v0.1.4 trở đi app mới tự cập nhật đúng.
- Check News có hai chế độ (chỉ ở AI Mode):
  - **Daily Scan**: quét nhanh tin trong 2–3 ngày gần nhất, bỏ qua dự án vừa quét trong 3/12/24 giờ nếu link dự án không đổi.
  - **Full Scan**: quét sâu 7 ngày như các bản trước, kiểm tra lại mọi dự án chưa có trong cache.
- Trang News có hai nút **Daily Scan** và **Full Scan**; nút của chế độ mặc định được tô nổi. Tab News ở sidebar hiện chấm đỏ khi có tin mới, nút Daily hiện `+N` tin vừa thêm.
- Settings → Web Search có khối **Chế độ quét Check News** bên dưới phần chọn Provider (chỉ ở AI Mode): chọn chế độ mặc định, và khi chọn Daily hiện hai ô đặt khoảng nghỉ Daily (3/12/24 giờ) và cửa sổ tin (48/72 giờ).
- Vòng 2 tìm sâu (`snapshot / TGE / claim / "airdrop ends" / "season ends"`, lô 3 dự án) chỉ chạy ở Full Scan, chỉ cho dự án chưa có tin quan trọng ở vòng 1, tiêu tối đa 30% ngân sách tìm kiếm của lần chạy.
- Giới hạn chi phí mỗi lần chạy: ngân sách lượt tìm kiếm (Full `clamp(3×n, 40, 120)`, Daily `clamp(ceil(1.25n), 5, 20)`), trần lượt mở bài (Full 6/dự án, tối đa 30/lô, 150/lần chạy; Daily 3/dự án, 60/lần chạy), `agentMaxSteps` (Full 24, Daily 10).
- Daily chỉ nhận tin `important`; mọi `todo` do AI nộp đều bị lọc và đếm riêng (`todoDropped`), không tính là lỗi.
- Cache Daily dùng khóa riêng `ai_cache:newsd:<projectId>` trong bảng `meta`, không đổi schema SQLite và không đổi `news_items`. `settings.json` cũ tự nhận mặc định Full / 12 giờ / 3 ngày nên hành vi của người dùng cũ không đổi.
- Tin trong bảng News có nhãn nhanh suy ra từ `milestoneKind`/ngày (không lưu thêm): **Sắp đến hạn** (mốc/todo trong 0–3 ngày), **Claim mở** (mốc claim còn mở), **Đã kết thúc** (mốc end đã tới).
- Không thay đổi: schema/migration, `news_items`, danh sách `NEWS_KINDS`/`MILESTONE_KINDS`, nguyên tắc "không bịa tin", PendingAction, Scan Project, Chat và luồng cập nhật của v0.1.3.
- Đã kiểm chứng: `npm run typecheck`, `npm test`, `npm run build`. Kiểm thử tay với provider thật + Web Search thật được ghi trong báo cáo của PR.
