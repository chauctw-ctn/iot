// gateways/mqtt_gateway.js
"use strict";
const mqtt = require("mqtt");
const db = require("../config/db"); 

const CONFIG = {
  host: process.env.MQTT_HOST || "14.225.252.85",
  port: Number(process.env.MQTT_PORT) || 1883,
  topic: process.env.MQTT_TOPIC || "telemetry/push"
};

function formatTimestampToICT(rawTs) {
  if (!rawTs) return null;
  const cleaned = String(rawTs).trim().replace("T", " ");
  return cleaned.includes("+") ? cleaned : `${cleaned}+07`;
}

async function handleMqttPush(payload) {
  const { station_id, display_name, timestamp, metrics } = payload;
  if (!station_id || !timestamp || !metrics || typeof metrics !== 'object') return;

  const cleanStationId = String(station_id).trim().toLowerCase();
  const formattedTs = formatTimestampToICT(timestamp);
  const currentSaveTs = new Date().toISOString();

  let dbClient;
  try {
    dbClient = await db.connect();

    // Tự động tạo danh mục trạm nếu chưa tồn tại
    const finalDisplayName = display_name ? String(display_name).trim() : `Trạm ${cleanStationId.toUpperCase()}`;
    await dbClient.query(`
      INSERT INTO public.logger_stations (station_id, display_name, description) 
      VALUES ($1, $2, $3) ON CONFLICT (station_id) DO NOTHING;
    `, [cleanStationId, finalDisplayName, 'Tự động tạo lập từ Cổng MQTT Gateway']);

    const upsertLatestQuery = `
      INSERT INTO public.logger_latest (logger_id, tag_key, data_ts, value, current_ts) 
      VALUES ($1, $2, $3::timestamptz, $4, $5::timestamptz) 
      ON CONFLICT (logger_id, tag_key) DO UPDATE SET data_ts = EXCLUDED.data_ts, value = EXCLUDED.value, current_ts = EXCLUDED.current_ts;
    `;
    const insertReadingsQuery = `
      INSERT INTO public.logger_readings (logger_id, tag_key, data_ts, data_save, value) 
      VALUES ($1, $2, $3::timestamptz, $4::timestamptz, $5) ON CONFLICT DO NOTHING;
    `;

    for (const [tagKey, rawValue] of Object.entries(metrics)) {
      if (rawValue === null || rawValue === undefined || isNaN(Number(rawValue))) continue;
      const cleanValue = parseFloat(rawValue);
      const cleanTagKey = tagKey.trim().toLowerCase();

      await dbClient.query(upsertLatestQuery, [cleanStationId, cleanTagKey, formattedTs, cleanValue, currentSaveTs]);
      await dbClient.query(insertReadingsQuery, [cleanStationId, cleanTagKey, formattedTs, currentSaveTs, cleanValue]);
    }
    console.log(`📥 [MQTT_GATEWAY] Tự động cập nhật trạm: '${cleanStationId}'`);
  } catch (error) {
    console.error("❌ [MQTT_GATEWAY][ERROR]", error.message);
  } finally {
    if (dbClient) dbClient.release();
  }
}

function startMqttGatewayListener() {
  const client = mqtt.connect(`mqtt://${CONFIG.host}:${CONFIG.port}`, { clean: true, connectTimeout: 10000, reconnectPeriod: 3000 });
  
  client.on("connect", () => { 
    console.log(`🟢 [MQTT_GATEWAY] Đang lắng nghe sự kiện đẩy dữ liệu tại topic: "${CONFIG.topic}"`);
    client.subscribe(CONFIG.topic); 
  });

  client.on("message", async (topic, message) => {
    try {
      const rawStr = message.toString("utf8").trim();
      if (!rawStr.startsWith("{")) return;
      await handleMqttPush(JSON.parse(rawStr));
    } catch (err) {
      // Bỏ qua tin nhắn lỗi định dạng JSON
    }
  });
}

module.exports = { startMqttGatewayListener };