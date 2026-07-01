// gateways/mqtt_gateway.js
"use strict";
const aedes = require("aedes")();
const websocketStream = require("websocket-stream");
const db = require("../config/db"); 

const TOPIC_GATEWAY = process.env.MQTT_TOPIC_GATEWAY || "telemetry/push";

function formatTimestampToICT(rawTs) {
  if (!rawTs) return null;
  const cleaned = String(rawTs).trim().replace("T", " ");
  return cleaned.includes("+") ? cleaned : `${cleaned}+07`;
}

// Lõi xử lý ghi Postgres khi nhận được gói tin
async function handleMqttGatewayPush(payload) {
  const { station_id, display_name, timestamp, metrics } = payload;
  if (!station_id || !timestamp || !metrics || typeof metrics !== 'object') return;

  const cleanStationId = String(station_id).trim().toLowerCase();
  const formattedTs = formatTimestampToICT(timestamp);
  const currentSaveTs = new Date().toISOString();

  let dbClient;
  try {
    dbClient = await db.connect();

    const finalDisplayName = display_name ? String(display_name).trim() : `Trạm ${cleanStationId.toUpperCase()}`;
    await dbClient.query(`
      INSERT INTO public.logger_stations (station_id, display_name, description) 
      VALUES ($1, $2, $3) ON CONFLICT (station_id) DO NOTHING;
    `, [cleanStationId, finalDisplayName, 'Tự động tạo từ Gateway MQTT WebSocket']);

    const upsertLatestQuery = `
      INSERT INTO public.logger_latest (logger_id, tag_key, data_ts, value, current_ts) 
      VALUES ($1, $2, $3::timestamptz, $4, $5::timestamptz) 
      ON CONFLICT (logger_id, tag_key) DO UPDATE SET data_ts = EXCLUDED.data_ts, value = EXCLUDED.value, current_ts = EXCLUDED.current_ts;
    `;
    const insertReadingsQuery = `
      INSERT INTO public.logger_readings (logger_id, tag_key, data_ts, data_save, value) 
      VALUES ($1::text, $2::text, $3::timestamptz, $4::timestamptz, $5) ON CONFLICT DO NOTHING;
    `;

    let processedCount = 0;
    for (const [tagKey, rawValue] of Object.entries(metrics)) {
      if (rawValue === null || rawValue === undefined || isNaN(Number(rawValue))) continue;
      const cleanValue = parseFloat(rawValue);
      const cleanTagKey = tagKey.trim().toLowerCase();

      await dbClient.query(upsertLatestQuery, [cleanStationId, cleanTagKey, formattedTs, cleanValue, currentSaveTs]);
      await dbClient.query(insertReadingsQuery, [cleanStationId, cleanTagKey, formattedTs, currentSaveTs, cleanValue]);
      processedCount++;
    }
    console.log(`📥 [MQTT_WS_GATEWAY] Tự động đồng bộ trạm thành công: '${cleanStationId}' (+${processedCount} thông số)`);
  } catch (error) {
    console.error("❌ [MQTT_WS_GATEWAY][ERROR]", error.message);
  } finally {
    if (dbClient) dbClient.release();
  }
}

// Lắng nghe sự kiện bốc gói tin từ Broker nhúng nội bộ
aedes.on("publish", async (packet, client) => {
  if (packet.topic === TOPIC_GATEWAY) {
    try {
      const rawStr = packet.payload.toString("utf8").trim();
      if (rawStr.startsWith("{")) {
        await handleMqttGatewayPush(JSON.parse(rawStr));
      }
    } catch (err) {
      // Khử lỗi cú pháp JSON
    }
  }
});

/**
 * 🟢 KÍCH HOẠT TÍCH HỢP ĐỘC LẬP VÀO HTTP SERVER CỦA APP.JS
 */
function attachMqttOverWebsheet(server) {
  websocketStream.createServer({ server: server }, aedes.handle);
  console.log(`📡 [MQTT_WS_GATEWAY] Bộ chuyển đổi MQTT over WebSockets đã chèn vào Express thành công!`);
}

module.exports = { attachMqttOverWebsheet };