// fetchmqtt.js
"use strict";
const mqtt = require("mqtt");
const db = require("../config/db"); 

const DEFAULT_CONFIG = {
  host: process.env.MQTT_HOST,
  port: process.env.MQTT_PORT,
  topic: process.env.MQTT_TOPIC,
  source: process.env.MQTT_SOURCE || "mqtt",
  tzOffsetMinutes: 0, // 🟢 FIX: Đã bổ sung thuộc tính này vào cấu hình hệ thống
  FETCH_INTERVAL_SECONDS: Number(process.env.MQTT_FETCH_INTERVAL_SECONDS) || 60
};

const TAG_PARAMETER_MAP = { MUCNUOC: "level", LUULUONG: "flow", TONGLUULUONG: "totalIndex" };
let messageQueue = [];

function buildStationId(source, rawId) { return `${source}_${String(rawId).toLowerCase()}`; }
function normalizeMetricValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  return Number.isNaN(Number(String(value).replace(/,/g, "").trim())) ? null : Number(String(value).replace(/,/g, "").trim());
}

function formatTimestampWithOffsetRounded(ts, offsetMinutes) {
  if (!ts) return null;
  const parsed = new Date(String(ts).trim().replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  if (Number.isNaN(parsed.getTime())) return null;
  const adjusted = new Date(parsed.getTime() + (Number(offsetMinutes) || 0) * 60 * 1000);
  const pad = (v) => String(v).padStart(2, "0");
  return `${adjusted.getFullYear()}-${pad(adjusted.getMonth() + 1)}-${pad(adjusted.getDate())} ${pad(adjusted.getHours())}:${pad(adjusted.getMinutes())}:00`;
}

function getCurrentSystemTimeRounded() {
  const now = new Date(); const pad = (v) => String(v).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:00`;
}

function parsePayloadTextSecure(text) {
  try {
    if (!text || typeof text !== "string") return null;
    const trimmed = text.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
    let cleanedMessage = trimmed
      .replace(/:\s*-?nan\b/gi, ':0').replace(/:\s*-?inf\b/gi, ':0')          
      .replace(/:\s*-\s*([,}\]])/g, ':0$1').replace(/:\s*-\s*$/g, ':0')             
      .replace(/:\s*\.\s*([,}\]])/g, ':0$1').replace(/:\s*-\.\s*([,}\]])/g, ':0$1'); 
    return JSON.parse(cleanedMessage);
  } catch (_) { return null; }
}

setInterval(async () => {
  if (messageQueue.length === 0) return;
  const startLogTime = Date.now();
  const processingBatch = [...messageQueue]; messageQueue = []; 

  console.log(`\n📡 [MQTT][BATCH] Khởi động chu kỳ xử lý. Đang giải mã ${processingBatch.length} gói tin trong Queue...`);
  let client;
  try {
    client = await db.connect();
    const currentFetchTs = getCurrentSystemTimeRounded(); 
    await client.query("BEGIN");

    const mappingRes = await client.query(`SELECT source_logger_id, source_tag_key, target_station_id FROM logger_tag_mappings`);
    const activeMappings = mappingRes.rows;

    const upsertLatestQuery = `INSERT INTO logger_latest (logger_id, tag_key, data_ts, value, current_ts) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (logger_id, tag_key) DO UPDATE SET data_ts = EXCLUDED.data_ts, value = EXCLUDED.value, current_ts = EXCLUDED.current_ts;`;
    const insertReadingsQuery = `INSERT INTO logger_readings (logger_id, tag_key, data_ts, data_save, value) VALUES ($1, $2, $3, $4, $5);`;

    let originalCount = 0; let matrixCount = 0;
    for (const payload of processingBatch) {
      if (!payload || !Array.isArray(payload.d)) continue;
      
      // 🟢 FIX: Truyền biến từ thuộc tính đã khai báo chuẩn ở đầu file cấu hình
      const formattedDataTs = formatTimestampWithOffsetRounded(payload.ts, DEFAULT_CONFIG.tzOffsetMinutes) || payload.ts;

      for (const item of payload.d) {
        let value = item.value;
        if (!item || !item.tag || value === undefined || value === null) continue;

        if (typeof value === 'string') {
          if (value.trim() === '' || value.trim() === '-' || value.trim() === '.') value = 0;
          else { const parsed = parseFloat(value); if (!isNaN(parsed) && isFinite(parsed)) value = parsed; }
        }
        const parsedValue = normalizeMetricValue(value);
        if (parsedValue === null) continue;

        const parts = String(item.tag).trim().split('_'); if (parts.length < 2) continue;
        let deviceCode = parts[0]; let parameterTypeRaw = parts.slice(1).join('_');
        if (parts.length > 2 && (parts[0] === 'GS1' || parts[0] === 'GS2' || parts[0] === 'QT1' || parts[0] === 'QT2')) {
          deviceCode = parts[0] + '_' + parts[1]; parameterTypeRaw = parts.slice(2).join('_');
        }

        const parameter = TAG_PARAMETER_MAP[parameterTypeRaw.toUpperCase()]; if (!parameter) continue;

        const rawId = deviceCode.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
        const stationId = buildStationId(DEFAULT_CONFIG.source, rawId);

        // Lưu dữ liệu gốc MQTT
        await client.query(upsertLatestQuery, [stationId, parameter, formattedDataTs, parsedValue, currentFetchTs]);
        await client.query(insertReadingsQuery, [stationId, parameter, formattedDataTs, currentFetchTs, parsedValue]);
        originalCount++;

        await client.query(`INSERT INTO public.logger_stations (station_id, display_name, description) VALUES ($1, $2, $3) ON CONFLICT (station_id) DO NOTHING;`, [stationId, `Trạm ${stationId}`, 'Tự động từ MQTT']);

        // Ánh xạ chuyển tiếp ma trận
        const relatedMaps = activeMappings.filter(m => m.source_logger_id === stationId && m.source_tag_key === parameter);
        for (const mapItem of relatedMaps) {
          await client.query(upsertLatestQuery, [mapItem.target_station_id, parameter, formattedDataTs, parsedValue, currentFetchTs]);
          await client.query(insertReadingsQuery, [mapItem.target_station_id, parameter, formattedDataTs, currentFetchTs, parsedValue]);
          matrixCount++;

          await client.query(`INSERT INTO public.logger_stations (station_id, display_name, description) VALUES ($1, $2, $3) ON CONFLICT (station_id) DO NOTHING;`, [mapItem.target_station_id, `Trạm ${mapItem.target_station_id}`, 'Tự động qua ma trận MQTT']);
        }
      }
    }

    await client.query("COMMIT");
    const duration = Date.now() - startLogTime;
    console.log(`💾 [MQTT][DB_SUCCESS] Thực thi Transaction hoàn tất! [Gốc: +${originalCount}] | [Ma trận: +${matrixCount}]. Thời gian lưu: ${duration}ms`);
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("❌ [MQTT][DB_CRASH] Thất bại luồng ghi dữ liệu thiết bị:", error.message); 
  } finally { 
    if (client) client.release(); 
  }
}, DEFAULT_CONFIG.FETCH_INTERVAL_SECONDS * 1000);

function connectMQTT() {
  const client = mqtt.connect(`mqtt://${DEFAULT_CONFIG.host}:${DEFAULT_CONFIG.port}`, { clean: true, connectTimeout: 10000, reconnectPeriod: 3000 });
  client.on("connect", () => { 
    console.log(`🟢 [MQTT][CONNECT] Kết nối thành công tới Broker [${DEFAULT_CONFIG.host}:${DEFAULT_CONFIG.port}]. Đang Subscribe topic: "${DEFAULT_CONFIG.topic}"`);
    client.subscribe(DEFAULT_CONFIG.topic); 
  });
  client.on("message", (topic, payload) => {
    const rawStr = payload.toString("utf8");
    const parsed = parsePayloadTextSecure(rawStr);
    if (parsed) { messageQueue.push(parsed); }
    else { console.warn(`⚠️  [MQTT][WARN] Nhận gói tin sai định dạng JSON thô từ topic "${topic}". Bỏ qua.`); }
  });
  return client;
}

module.exports = { connectMQTT };