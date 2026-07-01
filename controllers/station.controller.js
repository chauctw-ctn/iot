const db = require('../config/db');

exports.saveTagMappings = async (req, res) => {
  const { source, source_logger_id, source_tags, target_station_id, display_name, lat, lng, alert_thresholds } = req.body;
  
  if (!target_station_id) {
    return res.status(400).json({ success: false, error: 'Thiếu target_station_id' });
  }

  try {
    const nameQuery = await db.query(`SELECT display_name FROM logger_stations WHERE station_id = $1`, [target_station_id]);
    const oldName = nameQuery.rows.length > 0 ? nameQuery.rows[0].display_name : `Trạm ${target_station_id}`;
    const finalDisplayName = display_name && String(display_name).trim() !== '' ? String(display_name).trim() : oldName;

    const finalLat = (lat !== null && lat !== undefined && String(lat).trim() !== '') ? parseFloat(lat) : null;
    const finalLng = (lng !== null && lng !== undefined && String(lng).trim() !== '') ? parseFloat(lng) : null;

    await db.query(`
      INSERT INTO logger_stations (station_id, display_name, lat, lng, description)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (station_id) DO UPDATE 
      SET display_name = EXCLUDED.display_name, lat = EXCLUDED.lat, lng = EXCLUDED.lng
    `, [target_station_id, finalDisplayName, isNaN(finalLat) ? null : finalLat, isNaN(finalLng) ? null : finalLng, 'Cập nhật từ ma trận bảng']);

    if (source_logger_id && source_logger_id !== target_station_id) {
      await db.query(`DELETE FROM logger_tag_mappings WHERE source_logger_id = $1 AND target_station_id = $2`, [source_logger_id, target_station_id]);
      if (source_tags && Array.isArray(source_tags) && source_tags.length > 0) {
        const insertQuery = `INSERT INTO logger_tag_mappings (source, source_logger_id, source_tag_key, target_station_id) VALUES ($1, $2, $3, $4)`;
        for (const tag of source_tags) {
          if (tag) await db.query(insertQuery, [source || 'WEB_MATRIX_CONFIG', source_logger_id, tag, target_station_id]);
        }
      }
    } else {
      await db.query(`DELETE FROM logger_tag_mappings WHERE target_station_id = $1`, [target_station_id]);
    }

    if (alert_thresholds && Array.isArray(alert_thresholds)) {
      for (const th of alert_thresholds) {
        if (!th.tag_key) continue;
        await db.query(`DELETE FROM alert_thresholds WHERE station_id = $1 AND tag_key = $2`, [target_station_id, th.tag_key]);
        
        const isEnabled = (th.enabled === true || th.enabled === 1 || th.enabled === 'true');
        const pMin = parseFloat(th.min_value);
        const pMax = parseFloat(th.max_value);
        
        const finalMin = (th.min_value !== null && String(th.min_value).trim() !== '' && !isNaN(pMin)) ? pMin : null;
        const finalMax = (th.max_value !== null && String(th.max_value).trim() !== '' && !isNaN(pMax)) ? pMax : null;

        await db.query(`
          INSERT INTO alert_thresholds (station_id, tag_key, min_value, max_value, enabled, last_alerted_ts)
          VALUES ($1, $2, $3, $4, $5, null)
        `, [target_station_id, th.tag_key, finalMin, finalMax, isEnabled ? 1 : 0]);
      }
    }

    return res.status(200).json({ success: true, message: 'Đồng bộ dữ liệu thành công!' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

exports.ingestLoggerData = async (req, res) => {
  const { logger_id, data_ts, tags } = req.body;
  if (!logger_id || !tags || !Array.isArray(tags) || tags.length === 0) {
    return res.status(400).json({ success: false, error: 'Dữ liệu không hợp lệ.' });
  }

  const finalDataTs = data_ts ? new Date(data_ts) : new Date();
  const currentTs = new Date();
  const client = await db.connect();
  
  try {
    await client.query('BEGIN');
    const upsertLatest = `INSERT INTO logger_latest (logger_id, tag_key, value, data_ts, current_ts) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (logger_id, tag_key) DO UPDATE SET value = EXCLUDED.value, data_ts = EXCLUDED.data_ts, current_ts = EXCLUDED.current_ts;`;
    const insertReadings = `INSERT INTO logger_readings (logger_id, tag_key, data_ts, data_save, value) VALUES ($1, $2, $3, $4, $5);`;

    for (const tag of tags) {
      if (!tag.tag_key || tag.value === undefined || tag.value === null) continue;
      const val = parseFloat(tag.value);
      if (isNaN(val)) continue;
      await client.query(upsertLatest, [logger_id, tag.tag_key, val, finalDataTs, currentTs]);
      await client.query(insertReadings, [logger_id, tag.tag_key, finalDataTs, currentTs, val]);
    }
    await client.query(`INSERT INTO logger_stations (station_id, display_name, description) VALUES ($1, $2, $3) ON CONFLICT (station_id) DO NOTHING;`, [logger_id, `Trạm ${logger_id}`, 'Khởi tạo tự động']);
    await client.query('COMMIT');
    return res.status(200).json({ success: true, message: 'Ghi log IoT thành công.' });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
};