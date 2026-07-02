// routes/alert.route.js
"use strict";
const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 1. API lấy cấu hình Telegram
router.get('/config', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM public.telegram_configs ORDER BY id DESC LIMIT 1;');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. API cập nhật cấu hình trạng thái, chu kỳ lặp và Timeout Sập Mạng chung
router.post('/config', async (req, res) => {
  const { bot_token, chat_id, alert_interval_minutes, global_offline_timeout_mins, enabled } = req.body;
  const intervalMins = parseInt(alert_interval_minutes, 10) || 30;
  const timeoutMins = parseInt(global_offline_timeout_mins, 10) || 5;
  const isEnabled = parseInt(enabled) === 0 ? 0 : 1;

  try {
    const checkExist = await db.query('SELECT id FROM public.telegram_configs LIMIT 1;');
    
    if (checkExist.rows.length === 0) {
      await db.query(
        `INSERT INTO public.telegram_configs (bot_token, chat_id, alert_interval_minutes, global_offline_timeout_mins, enabled) VALUES ($1, $2, $3, $4, $5);`,
        [bot_token, chat_id, intervalMins, timeoutMins, isEnabled]
      );
    } else {
      await db.query(
        `UPDATE public.telegram_configs 
         SET bot_token = $1, chat_id = $2, alert_interval_minutes = $3, global_offline_timeout_mins = $4, enabled = $5 
         WHERE id = (SELECT id FROM public.telegram_configs LIMIT 1);`,
        [bot_token, chat_id, intervalMins, timeoutMins, isEnabled]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error("❌ LỖI POST /config:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. API Test kết nối gửi tin nhắn thử nghiệm
router.post('/test-connection', async (req, res) => {
  const { bot_token, chat_id } = req.body;
  try {
    const url = `https://api.telegram.org/bot${bot_token}/sendMessage`;
    const message = `🔔 *KẾT NỐI THÀNH CÔNG*\n🤖 Đây là tin nhắn thử nghiệm từ hệ thống *Giám Sát IoT Scada*.\n✅ Cấu hình API Telegram hoạt động hoàn hảo!`;
    await axios.post(url, { chat_id, text: message, parse_mode: 'Markdown' });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;