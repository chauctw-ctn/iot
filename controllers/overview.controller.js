// controllers/overview.controller.js
"use strict";

const db = require('../config/db');

/**
 * 1. Lấy dữ liệu ma trận tổng quan thời gian thực (Latest Overview)
 * API Endpoint: GET /api/overview/latest
 */
exports.getLatestOverview = async (req, res) => {
  try {
    const query = `
      WITH combined_data AS (
        SELECT logger_id, tag_key, value, data_ts, current_ts, logger_id AS original_sender, 0 AS is_mapped FROM logger_latest
        UNION ALL
        SELECT m.target_station_id AS logger_id, m.source_tag_key AS tag_key, l.value, l.data_ts, l.current_ts, l.logger_id AS original_sender, 1 AS is_mapped
        FROM logger_latest l 
        INNER JOIN logger_tag_mappings m ON l.logger_id = m.source_logger_id AND l.tag_key = m.source_tag_key
      ),
      aggregated_tags AS (
        SELECT 
          c.logger_id, 
          MAX(c.current_ts) as max_current_ts, -- 🟢 Mốc thời gian Server nhận tin gần nhất
          MAX(c.data_ts) as max_data_ts,       -- 🟢 Mốc thời gian thiết bị đo gần nhất
          jsonb_object_agg(c.tag_key, jsonb_build_object(
            'value', c.value, 'data_ts', c.data_ts, 'current_ts', c.current_ts, 'original_sender', c.original_sender, 'is_mapped', c.is_mapped,
            'min_value', t.min_value, 'max_value', t.max_value, 'threshold_enabled', CASE WHEN COALESCE(t.enabled, 0) = 1 THEN true ELSE false END
          )) as tags
        FROM combined_data c 
        LEFT JOIN alert_thresholds t ON c.logger_id = t.station_id AND c.tag_key = t.tag_key 
        GROUP BY c.logger_id
      )
      SELECT 
        a.logger_id, 
        a.max_current_ts AS last_updated, 
        a.max_current_ts AS current_ts, 
        a.max_data_ts AS data_ts, -- 🟢 Gửi thêm mốc thời gian gốc đo về cho UI
        a.tags, 
        s.display_name, 
        s.lat, 
        s.lng,
        COALESCE(s.offline_timeout_secs, 300) AS offline_timeout_secs
      FROM aggregated_tags a 
      LEFT JOIN logger_stations s ON a.logger_id = s.station_id 
      ORDER BY a.logger_id ASC
    `;
    
    const { rows } = await db.query(query);
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * 2. Truy vấn dữ liệu lịch sử phục vụ hiển thị đồ thị (History Chart)
 * API Endpoint: GET /api/overview/history-chart
 */
exports.getHistoryLog = async (req, res) => {
  const { station_id, tag_key, start_time, end_time } = req.query;
  if (!station_id || !tag_key) {
    return res.status(400).json({ success: false, error: 'Thiếu tham số bắt buộc (station_id, tag_key)' });
  }

  try {
    let rawStart = start_time;
    let rawEnd = end_time;
    
    if (!rawStart || !rawEnd) {
      const now = new Date();
      const tz = now.getTimezoneOffset() * 60000;
      const localNow = new Date(now.getTime() - tz);
      
      if (!rawEnd) rawEnd = localNow.toISOString().replace("T", " ").slice(0, 19);
      if (!rawStart) rawStart = new Date(localNow.getTime() - 86400000).toISOString().replace("T", " ").slice(0, 19);
    }

    const query = `
      SELECT value, data_ts 
      FROM logger_readings 
      WHERE logger_id = $1 
        AND tag_key = $2 
        AND data_ts::timestamp >= $3::timestamp 
        AND data_ts::timestamp <= $4::timestamp 
      ORDER BY data_ts ASC
    `;
    
    const { rows } = await db.query(query, [station_id, tag_key, rawStart, rawEnd]);
    
    return res.status(200).json({
      success: true,
      station_id,
      tag_key, 
      total_points: rows.length,
      data: rows.map(r => ({ value: parseFloat(r.value), timestamp: r.data_ts }))
    });
  } catch (error) {
    console.error("❌ [API][GET_HISTORY_LOG_ERROR]", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};