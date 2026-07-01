const db = require('../config/db');

exports.getLatestOverview = async (req, res) => {
  try {
    const query = `
      WITH combined_data AS (
        SELECT logger_id, tag_key, value, data_ts, current_ts, logger_id AS original_sender, 0 AS is_mapped FROM logger_latest
        UNION ALL
        SELECT m.target_station_id AS logger_id, m.source_tag_key AS tag_key, l.value, l.data_ts, l.current_ts, l.logger_id AS original_sender, 1 AS is_mapped
        FROM logger_latest l INNER JOIN logger_tag_mappings m ON l.logger_id = m.source_logger_id AND l.tag_key = m.source_tag_key
      ),
      aggregated_tags AS (
        SELECT c.logger_id, MAX(c.current_ts) as last_updated,
          jsonb_object_agg(c.tag_key, jsonb_build_object(
            'value', c.value, 'data_ts', c.data_ts, 'current_ts', c.current_ts, 'original_sender', c.original_sender, 'is_mapped', c.is_mapped,
            'min_value', t.min_value, 'max_value', t.max_value, 'threshold_enabled', CASE WHEN COALESCE(t.enabled, 0) = 1 THEN true ELSE false END
          )) as tags
        FROM combined_data c LEFT JOIN alert_thresholds t ON c.logger_id = t.station_id AND c.tag_key = t.tag_key GROUP BY c.logger_id
      )
      SELECT a.logger_id, a.last_updated, a.tags, s.display_name, s.lat, s.lng FROM aggregated_tags a LEFT JOIN logger_stations s ON a.logger_id = s.station_id ORDER BY a.logger_id ASC
    `;
    const { rows } = await db.query(query);
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

exports.getHistoryLog = async (req, res) => {
  const { station_id, tag_key, start_time, end_time } = req.query;
  if (!station_id || !tag_key) return res.status(400).json({ success: false, error: 'Thiếu tham số' });

  try {
    let rawStart = start_time, rawEnd = end_time;
    if (!rawStart || !rawEnd) {
      const now = new Date(), tz = now.getTimezoneOffset() * 60000, localNow = new Date(now.getTime() - tz);
      if (!rawEnd) rawEnd = localNow.toISOString().replace("T", " ").slice(0, 19);
      if (!rawStart) rawStart = new Date(localNow.getTime() - 86400000).toISOString().replace("T", " ").slice(0, 19);
    }

    const query = `SELECT value, data_ts FROM logger_readings WHERE logger_id = $1 AND tag_key = $2 AND data_ts::timestamp >= $3::timestamp AND data_ts::timestamp <= $4::timestamp ORDER BY data_ts ASC`;
    const { rows } = await db.query(query, [station_id, tag_key, rawStart, rawEnd]);
    return res.status(200).json({ success: true, data: rows.map(r => ({ value: parseFloat(r.value), timestamp: r.data_ts })) });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};