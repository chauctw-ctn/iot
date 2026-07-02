// services/alert_engine.js
"use strict";
const db = require('../config/db');
const axios = require('axios');

async function sendTelegramNotification(text) {
  try {
    const configRes = await db.query(`SELECT * FROM public.telegram_configs WHERE enabled = 1 LIMIT 1;`);
    if (configRes.rows.length === 0) return; 
    
    const config = configRes.rows[0];
    const url = `https://api.telegram.org/bot${config.bot_token}/sendMessage`;
    
    await axios.post(url, { chat_id: config.chat_id, text: text, parse_mode: 'HTML' });
  } catch (error) {
    console.error("❌ [ALERT_ENGINE] Lỗi gửi tín hiệu tới Telegram:", error.message);
  }
}

/**
 * 📡 TIẾN TRÌNH TỰ ĐỘNG QUÉT VÀ GỬI CẢNH BÁO MẤT KẾT NỐI (OFFLINE / ONLINE)
 * 🟢 ĐÃ ĐỒNG BỘ 100% THUẬT TOÁN KHOẢNG LỆCH (CURRENT_TS - DATA_TS) GIỐNG FRONTEND UI
 */
async function checkSystemOfflineAlert() {
  try {
    // 1. Đọc cấu hình dùng chung toàn cục
    const configRes = await db.query(`SELECT alert_interval_minutes, global_offline_timeout_mins, enabled FROM public.telegram_configs LIMIT 1;`);
    if (configRes.rows.length === 0 || configRes.rows[0].enabled === 0) {
      return; // Dừng tiến trình nếu hệ thống cảnh báo bị TẮT
    }
    
    const globalConfig = configRes.rows[0];
    const globalRepeatIntervalSecs = (globalConfig.alert_interval_minutes || 5) * 60; 
    const globalTimeoutMinutes = globalConfig.global_offline_timeout_mins || 5; 

    // 2. 🟢 SQL ĐỒNG BỘ TUYỆT ĐỐI: Gom nhóm mốc thời gian nhận tin (current_ts) và đo gốc (data_ts) từ logger_latest
    const queryStr = `
      WITH latest_metrics AS (
        SELECT 
          logger_id, 
          MAX(current_ts) as max_current_ts,
          MAX(data_ts) as max_data_ts
        FROM public.logger_latest
        GROUP BY logger_id
      )
      SELECT 
        s.station_id, 
        s.display_name, 
        s.last_known_status, 
        s.last_alerted_ts,
        l.max_current_ts,
        l.max_data_ts,
        CASE 
          WHEN l.max_current_ts IS NULL OR l.max_data_ts IS NULL THEN 999999
          ELSE EXTRACT(EPOCH FROM (l.max_current_ts - l.max_data_ts)) / 60
        END as delay_minutes
      FROM public.logger_stations s
      LEFT JOIN latest_metrics l ON s.station_id = l.logger_id;
    `;

    const checkedStations = await db.query(queryStr);

    for (let station of checkedStations.rows) {
      const delayMinutes = station.delay_minutes !== null ? Math.floor(station.delay_minutes) : 999999;
      
      // So sánh trực tiếp số phút trễ truyền nhận thực tế với ngưỡng Timeout Sập Mạng chung
      const isCurrentlyOffline = (station.max_current_ts === null || station.max_data_ts === null || delayMinutes > globalTimeoutMinutes);

      const stationIdClean = String(station.station_id).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const displayNameClean = String(station.display_name || 'Chưa đặt tên').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

      if (isCurrentlyOffline) {
        // --- LUỒNG TRẠM ĐANG BỊ OFFLINE ---
        const delayMinsStr = (delayMinutes < 99999) ? `${delayMinutes}` : 'vô hạn';
        const message = `🔴 <b>CẢNH BÁO: TRẠM MẤT KẾT NỐI (OFFLINE)</b>\n📌 Trạm: <b>${stationIdClean}</b> (${displayNameClean})\n⏱️ Thời gian thiết bị trễ: <code>${delayMinsStr}</code> phút.\n⚠️ Ngưỡng thiết lập hệ thống chung: ${globalTimeoutMinutes} phút.`;

        if (station.last_known_status !== 'OFFLINE') {
          // Trạng thái mạng thay đổi sang OFFLINE -> Bắn tin ngay lập tức
          await sendTelegramNotification(message);
          
          await db.query(`
            UPDATE public.logger_stations 
            SET last_known_status = 'OFFLINE', 
                status_changed_ts = NOW(), 
                last_alerted_ts = NOW() 
            WHERE station_id = $1;
          `, [station.station_id]);
        } else {
          // Xử lý nhắc nhở cảnh báo lặp lại sau một khoảng chu kỳ
          const lastAlerted = station.last_alerted_ts ? new Date(station.last_alerted_ts).getTime() : 0;
          const secondsSinceLastAlert = Math.floor((Date.now() - lastAlerted) / 1000);

          if (secondsSinceLastAlert >= globalRepeatIntervalSecs) {
            await sendTelegramNotification(message + `\n🔄 <i>(Nhắc lại cảnh báo mất kết nối định kỳ mỗi ${globalConfig.alert_interval_minutes} phút)</i>`);
            await db.query(`UPDATE public.logger_stations SET last_alerted_ts = NOW() WHERE station_id = $1;`, [station.station_id]);
          }
        }
      } else {
        // --- LUỒNG TRẠM ĐANG ONLINE BÌNH THƯỜNG ---
        if (station.last_known_status === 'OFFLINE') {
          // Phát hiện trạm từ sập mạng khôi phục thành công -> Bắn tin báo Online trở lại
          const recoveryMessage = `🟢 <b>TÍN HIỆU PHỤC HỒI (ONLINE)</b>\n📌 Trạm: <b>${stationIdClean}</b> (${displayNameClean})\n✅ Thiết bị đã kết nối lại và truyền dữ liệu bình thường về hệ thống.`;
          await sendTelegramNotification(recoveryMessage);
          
          await db.query(`
            UPDATE public.logger_stations 
            SET last_known_status = 'ONLINE', 
                status_changed_ts = NOW(), 
                last_alerted_ts = NOW() 
            WHERE station_id = $1;
          `, [station.station_id]);
        }
      }
    }
  } catch (err) {
    console.error("❌ [ALERT_ENGINE] Lỗi tiến trình quét tự động:", err.message);
  }
}

module.exports = { checkSystemOfflineAlert };