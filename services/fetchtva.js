// fetchtva.js
"use strict";
const axios = require("axios");
const cheerio = require("cheerio");
const db = require("../config/db"); 

const DEFAULT_TVA_CONFIG = {
  baseUrl: process.env.TVA_URL, loginUrl: process.env.TVA_LOGIN_URL,
  username: process.env.TVA_USERNAME, password: process.env.TVA_PASSWORD,
  loginPath: process.env.TVA_LOGIN_PATH || "/dang-nhap/", timeoutMs: Number(process.env.TVA_TIMEOUT_MS) || 15000,
  maxRetries: Number(process.env.TVA_MAX_RETRIES) || 3, retryDelayMs: Number(process.env.TVA_RETRY_DELAY_MS) || 5000,
  source: "tva", FETCH_INTERVAL_SECONDS: Number(process.env.TVA_FETCH_INTERVAL_SECONDS) || 60
};

const TVA_PARAMETER_MAP = { mucnuoc: "level", luuluong: "flow", tongluuluong: "totalIndex" };

function buildStationId(source, rawId) { return `${source}_${String(rawId).toLowerCase()}`; }
function createHttpClient(config) { return axios.create({ timeout: config.timeoutMs, headers: { "User-Agent": "Mozilla/5.0" } }); }

function buildCookieHeader(cookies) {
  const cookieMap = {};
  cookies.forEach((cookie) => {
    const [nameValue] = cookie.split(";"); const [name, value] = nameValue.split("=");
    if (name && value) cookieMap[name.trim()] = value.trim();
  });
  return Object.entries(cookieMap).map(([name, value]) => `${name}=${value}`).join("; ");
}

function normalizeNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  let cleaned = String(value).trim(); if (cleaned === "" || cleaned === "-" || cleaned.toLowerCase() === "nan") return null;
  if (cleaned.includes(".") && cleaned.includes(",")) cleaned = cleaned.replace(/\./g, "").replace(/,/g, ".");
  else if (cleaned.includes(",")) cleaned = cleaned.replace(/,/g, ".");
  return Number.isNaN(Number(cleaned)) ? null : Number(cleaned);
}

function parseUpdateTimeRounded(value) {
  if (!value) return null;
  const cleaned = String(value).trim();
  const match = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;
  const [, day, month, year, hours = "0", minutes = "0"] = match;
  const pad = (v) => String(v).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)} ${pad(hours)}:${pad(minutes)}:00`;
}

function getCurrentSystemTimeRounded(date = new Date()) {
  const pad = (v) => String(v).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

function normalizeStationId(name) {
  const normalized = String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const explicitOverrides = { qt3182gpbtnmt: "qt3", qt1nm12186gpbtnmt: "qt1nm1", qt2nm12186gpbtnmt: "qt2nm1" };
  if (explicitOverrides[normalized.replace(/[^a-z0-9]+/g, "")]) return explicitOverrides[normalized.replace(/[^a-z0-9]+/g, "")];
  const compact = normalized.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const tramBomMatch = compact.match(/^tram_bom_(\d+)$/); if (tramBomMatch) return `tb${tramBomMatch[1]}`;
  const nhaMayMatch = compact.match(/^nha_may_so_(\d+)_gieng_so_(\d+)$/); if (nhaMayMatch) return `gs${nhaMayMatch[2]}nm${nhaMayMatch[1]}`;
  return compact.replace(/_/g, "");
}

async function loginTVA(config) {
  console.log(`🔒 [TVA][AUTH] Khởi tạo phiên kết nối đăng nhập tới cổng thông tin giám sát TVA...`);
  const client = createHttpClient(config); const loginPageRes = await client.get(config.baseUrl);
  let cookies = loginPageRes.headers["set-cookie"] || [];
  const loginData = new URLSearchParams({ "fields[email]": config.username, "fields[password]": config.password, remember_account: "on", is_dtool_form: cheerio.load(loginPageRes.data)("input[name='is_dtool_form']").val() || "" });
  const loginRes = await client.post(`${config.baseUrl}${config.loginPath}`, loginData.toString(), { headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: buildCookieHeader(cookies) } });
  if (loginRes.headers["set-cookie"]) cookies = [...cookies, ...loginRes.headers["set-cookie"]];
  console.log(`🟢 [TVA][AUTH] Phiên đăng nhập Web TVA đã được thiết lập thành công.`);
  return { client, cookieHeader: buildCookieHeader(cookies) };
}

async function fetchTVAData() {
  const startLogTime = Date.now();
  console.log(`\n🌊  [TVA][FETCH] Khởi chạy chu kỳ quét dữ liệu Web TVA (${DEFAULT_TVA_CONFIG.FETCH_INTERVAL_SECONDS}s)...`);
  const config = DEFAULT_TVA_CONFIG; const source = config.source;
  const { client, cookieHeader } = await loginTVA(config);
  const res = await client.get(config.baseUrl, { headers: { Cookie: cookieHeader } });
  const $ = cheerio.load(res.data);
  
  const currentFetchTs = getCurrentSystemTimeRounded(); 
  const segments = $(".segmentData").toArray();
  console.log(`📥 [TVA][FETCH] Đã quét thấy ${segments.length} khối công trình (Trạm) trên giao diện.`);
  let dbClient;

  try {
    dbClient = await db.connect();
    await dbClient.query("BEGIN");

    const mappingRes = await dbClient.query(`SELECT source_logger_id, source_tag_key, target_station_id FROM logger_tag_mappings`);
    const activeMappings = mappingRes.rows;

    const upsertLatestQuery = `INSERT INTO logger_latest (logger_id, tag_key, data_ts, value, current_ts) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (logger_id, tag_key) DO UPDATE SET data_ts = EXCLUDED.data_ts, value = EXCLUDED.value, current_ts = EXCLUDED.current_ts;`;
    const insertReadingsQuery = `INSERT INTO logger_readings (logger_id, tag_key, data_ts, data_save, value) VALUES ($1, $2, $3, $4, $5);`;

    let originalCount = 0; let matrixCount = 0;
    for (const segment of segments) {
      const stationName = $(segment).find(".headerChart").first().text().trim();
      const updateTime = $(segment).find(".headerNow").first().text().replace(/Thoi\s*diem:|Thời\s*điểm:/gi, "").trim();

      const stationId = buildStationId(source, normalizeStationId(stationName));
      const ts = parseUpdateTimeRounded(updateTime) || currentFetchTs;

      const rows = $(segment).find(".left .table .row").toArray();
      for (const row of rows) {
        if ($(row).hasClass("header")) continue;
        const cols = $(row).find(".col"); if (cols.length < 4) continue;

        const parameter = TVA_PARAMETER_MAP[normalizeStationId($(cols[1]).text().trim())];
        const parsedValue = normalizeNumber($(cols[3]).text().trim());
        if (!parameter || parsedValue === null) continue;

        // Lưu trạm gốc
        await dbClient.query(upsertLatestQuery, [stationId, parameter, ts, parsedValue, currentFetchTs]);
        await dbClient.query(insertReadingsQuery, [stationId, parameter, ts, currentFetchTs, parsedValue]);
        originalCount++;

        await dbClient.query(`INSERT INTO public.logger_stations (station_id, display_name, description) VALUES ($1, $2, $3) ON CONFLICT (station_id) DO NOTHING;`, [stationId, `Trạm ${stationName}`, 'Tự động từ Web TVA']);

        // Ánh xạ ma trận
        const relatedMaps = activeMappings.filter(m => m.source_logger_id === stationId && m.source_tag_key === parameter);
        for (const mapItem of relatedMaps) {
          await dbClient.query(upsertLatestQuery, [mapItem.target_station_id, parameter, ts, parsedValue, currentFetchTs]);
          await dbClient.query(insertReadingsQuery, [mapItem.target_station_id, parameter, ts, currentFetchTs, parsedValue]);
          matrixCount++;

          await dbClient.query(`INSERT INTO public.logger_stations (station_id, display_name, description) VALUES ($1, $2, $3) ON CONFLICT (station_id) DO NOTHING;`, [mapItem.target_station_id, `Trạm ${mapItem.target_station_id}`, 'Ánh xạ từ TVA']);
        }
      }
    }

    await dbClient.query("COMMIT");
    const duration = Date.now() - startLogTime;
    console.log(`💾 [TVA][DB_SUCCESS] Đã commit dữ liệu tài nguyên nước thành công! [Gốc: +${originalCount}] | [Ma trận: +${matrixCount}]. Thời gian lưu: ${duration}ms`);

  } catch (err) {
    if (dbClient) await dbClient.query("ROLLBACK");
    console.error("❌ [TVA][DB_CRASH] Thất bại chu kỳ lưu đồng bộ dữ liệu TVA:", err.message);
  } finally {
    if (dbClient) dbClient.release();
  }
}

let inFlight = false;
setInterval(async () => {
  if (inFlight) return; inFlight = true;
  for (let attempt = 1; attempt <= DEFAULT_TVA_CONFIG.maxRetries; attempt++) {
    try { await fetchTVAData(); break; } catch (error) { 
      console.warn(`⚠️  [TVA][RETRY] Cào dữ liệu thất bại. Thử lại lần ${attempt}/${DEFAULT_TVA_CONFIG.maxRetries}...`);
      if (attempt < DEFAULT_TVA_CONFIG.maxRetries) await new Promise(r => setTimeout(r, DEFAULT_TVA_CONFIG.retryDelayMs)); 
    }
  }
  inFlight = false;
}, DEFAULT_TVA_CONFIG.FETCH_INTERVAL_SECONDS * 1000);

module.exports = { fetchTVAData };