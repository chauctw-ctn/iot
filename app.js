// app.js
"use strict";
require('dotenv').config();

const express = require('express');
const path = require('path');
const app = express();

const stationRoutes = require('./routes/station.route');
const overviewRoutes = require('./routes/overview.route');
const { handleHttpPush } = require('./gateways/http_gateway');
const { startMqttGatewayListener } = require('./gateways/mqtt_gateway');

// Các luồng fetch cũ của bạn (giữ nguyên)
const { fetchMonreData } = require('./services/fetchmonre');
const { fetchScadaData } = require('./services/fetchscada');
const { fetchTVAData } = require('./services/fetchtva');
const { connectMQTT } = require('./services/fetchmqtt');

// Cấu hình Middleware xử lý dữ liệu JSON và tĩnh
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Đăng ký các Endpoint API Gateways và Routes UI
app.post('/api/gateway/push', handleHttpPush);
app.use('/api/stations', stationRoutes);
app.use('/api/overview', overviewRoutes);

// Bẫy lỗi toàn cục để tránh việc App bị sập bất thình lình khi chạy ngầm trên Render
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ [PROCESS] Phát hiện lời hứa (Promise) chưa được xử lý lỗi:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('❌ [PROCESS] Phát hiện lỗi nghiêm trọng chưa được bắt:', error.message);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`====================================================================`);
  console.log(`🚀 API SERVER CHẠY TẠI PORT: http://localhost:${PORT}`);
  console.log(`Múi Giờ Cấu Hình Hệ Thống: ${process.env.TZ || 'Asia/Ho_Chi_Minh'}`);
  console.log(`====================================================================\n`);

  // 📡 1. Kích hoạt nhận dữ liệu qua cổng TCP 1885 độc lập (Mới)
  try {
    startMqttGatewayListener();
  } catch (err) {
    console.error("❌ [GATEWAY] Lỗi khởi động MQTT TCP Gateway mới:", err.message);
  }

  // 🔄 2. Khởi động các luồng fetch cào quét dữ liệu cũ của bạn
  try { 
    connectMQTT(); 
  } catch (err) {
    console.error("❌ [FETCH] Lỗi kết nối luồng MQTT Fetch cũ:", err.message);
  }
  
  fetchMonreData().catch(err => console.error("❌ [FETCH] Lỗi chu kỳ mồi MONRE:", err.message));
  fetchScadaData().catch(err => console.error("❌ [FETCH] Lỗi chu kỳ mồi SCADA:", err.message));
  fetchTVAData().catch(err => console.error("❌ [FETCH] Lỗi chu kỳ mồi TVA:", err.message));
});