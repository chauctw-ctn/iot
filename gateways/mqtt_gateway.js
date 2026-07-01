// gateways/mqtt_gateway.js
"use strict";
const mqtt = require("mqtt");
const db = require("../config/db"); 

const CONFIG = {
  // 🟢 TỰ ĐỘNG LẤY DOMAIN RENDER HOẶC LOCALHOST (Chuyển sang giao thức ws/wss chuyên dụng cho Web Host)
  host: process.env.RENDER_EXTERNAL_URL || "ws://localhost:3000",
  topic: process.env.MQTT_TOPIC_GATEWAY || "telemetry/push" 
};

function formatTimestampToICT(rawTs) {
  if (!rawTs) return null;
  const cleaned = String(rawTs).trim().replace("T", " ");
  return cleaned.includes("+") ? cleaned : `${cleaned}+07`;
}

async function handleMqttGatewayPush(payload) {
  const { station_id, display_name, timestamp, metrics } = payload;
  
  if (!station_id || !timestamp || !metrics || typeof metrics !== 'object') {
    console.warn("⚠️  [MQTT_GATEWAY][WARN] Gói tin sai cấu trúc Gateway mới. Bỏ qua.");
    return;
  }

  const cleanStationId = String(station_id).trim().toLowerCase();
  const formattedTs = formatTimestampToICT(timestamp);
  const currentSaveTs = new Date().toISOString();

  let dbClient;
  try {
    dbClient = await db.connect();

    const finalDisplayName = display_name ? String(display_name).trim() : `Trạm ${cleanStationId.toUpperCase()}`;
    await dbClient.query(`
      INSERT INTO public.logger_stations (station_id, display_name, description) 
      VALUES ($1, $2, $3) 
      ON CONFLICT (station_id) DO UPDATE SET display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), public.logger_stations.display_name);
    `, [cleanStationId, finalDisplayName, 'Tự động tạo từ Gateway MQTT Render Host']);

    const upsertLatestQuery = `
      INSERT INTO public.logger_latest (logger_id, tag_key, data_ts, value, current_ts) 
      VALUES ($1, $2, $3::timestamptz, $4, $5::timestamptz) 
      ON CONFLICT (logger_id, tag_key) DO UPDATE SET data_ts = EXCLUDED.data_ts, value = EXCLUDED.value, current_ts = EXCLUDED.current_ts;
    `;
    
    const insertReadingsQuery = `
      INSERT INTO public.logger_readings (logger_id, tag_key, data_ts, data_save, value) 
      VALUES ($1::text, $2::text, $3::timestamptz, $4::timestamptz, $5) 
      ON CONFLICT DO NOTHING;
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
    
    console.log(`📥 [MQTT_GATEWAY_RENDER] Đã đồng bộ trạm qua host Render: '${cleanStationId}' (+${processedCount} chỉ số)`);
  } catch (error) {
    console.error("❌ [MQTT_GATEWAY_RENDER][ERROR]", error.message);
  } finally {
    if (dbClient) dbClient.release();
  }
}

function startMqttGatewayListener() {
  // 🟢 Tối ưu đường dẫn kết nối: Nếu chạy trên Render sẽ tự chuyển thành wss:// (Websocket Secure) qua cổng 443
  let brokerUrl = CONFIG.host;
  if (brokerUrl.startsWith("http")) {
    brokerUrl = brokerUrl.replace(/^http/, "ws");
  }

  console.log(`📡 [MQTT_GATEWAY_RENDER] Đang khởi tạo kết nối độc lập tới Host: ${brokerUrl}`);

  const client = mqtt.connect(brokerUrl, { 
    clean: true, 
    connectTimeout: 10000, 
    reconnectPeriod: 3000,
    clientId: `gateway_render_${Math.random().toString(16).substr(2, 8)}`
  });
  
  client.on("connect", () => { 
    console.log(`🟢 [MQTT_GATEWAY_RENDER] Đã kết nối độc lập qua Websocket! Đang trực Topic: "${CONFIG.topic}"`);
    client.subscribe(CONFIG.topic); 
  });

  client.on("message", async (topic, message) => {
    try {
      const rawStr = message.toString("utf8").trim();
      if (!rawStr.startsWith("{")) return;
      await handleMqttGatewayPush(JSON.parse(rawStr));
    } catch (err) {
      // Khử log rác
    }
  });
}

module.exports = { startMqttGatewayListener };