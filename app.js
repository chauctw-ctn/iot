// app.js
"use strict";

// Tải biến môi trường .env lên đầu hệ thống
require('dotenv').config();

const express = require('express');
const path = require('path');
const http = require('http'); // 🟢 THÊM MỚI: Thư viện HTTP lõi của Node.js

const app = express();
const server = http.createServer(app); // 🟢 THÊM MỚI: Bọc Express app vào HTTP Server để dùng chung cổng cho WebSocket

// 1. Nhúng các Tuyến đường API phục vụ giao diện (UI)
const stationRoutes = require('./routes/station.route');
const overviewRoutes = require('./routes/overview.route');

// 2. Nhúng 2 phân hệ cổng Gateway nhận dữ liệu đẩy về
const { handleHttpPush } = require('./gateways/http_gateway');
const { attachMqttOverWebsheet } = require('./gateways/mqtt_gateway'); // 🟢 THAY ĐỔI: Nhúng hàm đính kèm WebSocket thay vì hàm cũ

// 3. Nhúng 4 phân hệ cào dữ liệu tự động chạy ngầm (Luồng Fetch cũ của bạn)
const { fetchMonreData } = require('./services/fetchmonre');
const { fetchScadaData } = require('./services/fetchscada');
const { fetchTVAData } = require('./services/fetchtva');
const { connectMQTT } = require('./services/fetchmqtt'); // MQTT client cũ

// Cấu hình Middleware phân tích cú pháp dữ liệu JSON đầu vào
app.use(express.json());

// Cấu hình thư mục chứa mã giao diện Frontend tĩnh công khai
app.use(express.static(path.join(__dirname, 'public')));

// Chặn log rác favicon của trình duyệt
app.get('/favicon.ico', (req, res) => res.status(204).end());


// ====================================================================
// ĐĂNG KÝ CÁC ĐƯỜNG DẪN API (ROUTES)
// ====================================================================

// 🟢 CỔNG MỚI: Đăng ký Endpoint nhận dữ liệu HTTP POST từ bên ngoài đẩy về
app.post('/api/gateway/push', handleHttpPush);

// CỔNG CŨ: Các endpoint phục vụ biểu đồ, danh sách và cài đặt trên UI
app.use('/api/stations', stationRoutes);
app.use('/api/overview', overviewRoutes);


// ====================================================================
// KHỞI ĐỘNG SERVER LẮNG NGHE VÀ KHỞI CHẠY SONG HÀNH CÁC CONFIG
// ====================================================================
const PORT = process.env.PORT || 3000;

// 🟢 THAY ĐỔI: Sử dụng server.listen thay vì app.listen để mở cổng cho cả HTTP và WebSockets
server.listen(PORT, () => {
  console.log(`====================================================================`);
  console.log(`🚀 HYBRID DATA SERVER VẬN HÀNH THÀNH CÔNG TẠI PORT: ${PORT}`);
  console.log(`Múi Giờ Hệ Thống: ${process.env.TZ || 'Asia/Ho_Chi_Minh'}`);
  console.log(`--------------------------------------------------------------------`);
  console.log(`[CORE] Các luồng FETCH cào quét dữ liệu cũ vẫn đang hoạt động ngầm.`);
  console.log(`[GATEWAY] 2 Cổng đẩy dữ liệu mới (HTTP/MQTT WS) đang online độc lập!`);
  console.log(`====================================================================\n`);

  // 📡 A. KÍCH HOẠT KÊNH GATEWAY NHẬN DỮ LIỆU IoT QUA WEBSOCKET (Đính kèm vào server hiện tại)
  try {
    attachMqttOverWebsheet(server);
  } catch (err) {
    console.error("❌ [GATEWAY] Không thể khởi động MQTT WebSocket Gateway:", err.message);
  }

  // 🔄 B. KÍCH HOẠT LẠI TOÀN BỘ CÁC MODULE FETCH DỮ LIỆU CŨ (HOÀN TOÀN KHÔNG BỊ ẢNH HƯỞNG)
  try {
    connectMQTT(); // MQTT Client cào dữ liệu cũ
  } catch (err) {
    console.error("❌ [FETCH] Không thể mở luồng nhận tin MQTT cũ:", err.message);
  }

  fetchMonreData().catch(err => console.error("❌ [FETCH] Lỗi kích hoạt cào Cục MONRE:", err.message));
  fetchScadaData().catch(err => console.error("❌ [FETCH] Lỗi kích hoạt cào Scada nhà máy:", err.message));
  fetchTVAData().catch(err => console.error("❌ [FETCH] Lỗi kích hoạt cào Web Sở TVA:", err.message));
});