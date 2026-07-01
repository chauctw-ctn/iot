// app.js
"use strict";

// Tải cấu hình biến môi trường từ file .env
require('dotenv').config();

const express = require('express');
const path = require('path');

// Import các tuyến định tuyến (Routes)
const stationRoutes = require('./routes/station.route');
const overviewRoutes = require('./routes/overview.route');

// Import các module dịch vụ Fetch/Lắng nghe dữ liệu
const { connectMQTT } = require('./services/fetchmqtt');
const { fetchMonreData } = require('./services/fetchmonre');
const { fetchScadaData } = require('./services/fetchscada');
const { fetchTVAData } = require('./services/fetchtva');

const app = express();

// Middleware cấu hình phân tích dữ liệu JSON và phục vụ file tĩnh
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Bỏ qua yêu cầu favicon tránh spam log hệ thống
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Cấu hình các Endpoint API cho giao diện điều khiển
app.use('/api/stations', stationRoutes);
app.use('/api/overview', overviewRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`====================================================================`);
  console.log(`🚀 Hệ thống quản lý dữ liệu đang chạy tại: http://localhost:${PORT}`);
  console.log(`====================================================================\n`);

  // 1️⃣ Kích hoạt luồng lắng nghe sự kiện Broker MQTT (Luồng chạy ngầm liên tục)
  try {
    console.log(`📡 [SYSTEM] Đang khởi tạo luồng kết nối MQTT...`);
    connectMQTT();
  } catch (err) {
    console.error("❌ [SYSTEM][ERROR] Lỗi kích hoạt kết nối MQTT:", err.message);
  }

  // 2️⃣ Kích hoạt chu kỳ quét tự động lập tức cho module API MONRE (Cục)
  try {
    console.log(`☁️  [SYSTEM] Đang kích hoạt luồng tự động quét API MONRE...`);
    // Chạy kích hoạt lần đầu ngay khi start app không cần đợi hết chu kỳ setInterval
    await fetchMonreData().catch(err => console.error("❌ Lỗi chu kỳ đầu MONRE:", err.message));
  } catch (err) {
    console.error("❌ [SYSTEM][ERROR] Lỗi khởi chạy quét MONRE:", err.message);
  }

  // 3️⃣ Kích hoạt chu kỳ quét tự động lập tức cho module Web SCADA (Nhà máy)
  try {
    console.log(`⚙️  [SYSTEM] Đang kích hoạt luồng cào dữ liệu Web SCADA Nhà máy...`);
    await fetchScadaData().catch(err => console.error("❌ Lỗi chu kỳ đầu SCADA:", err.message));
  } catch (err) {
    console.error("❌ [SYSTEM][ERROR] Lỗi khởi chạy quét SCADA:", err.message);
  }

  // 4️⃣ Kích hoạt chu kỳ quét tự động lập tức cho module Web TVA (Sở)
  try {
    console.log(`🌊  [SYSTEM] Đang kích hoạt luồng cào dữ liệu Web TVA Tỉnh...`);
    await fetchTVAData().catch(err => console.error("❌ Lỗi chu kỳ đầu TVA:", err.message));
  } catch (err) {
    console.error("❌ [SYSTEM][ERROR] Lỗi khởi chạy quét TVA:", err.message);
  }

  console.log(`\n✅ [SYSTEM] Toàn bộ 4 core-module dịch vụ đã được kích hoạt đồng bộ thành công!`);
});