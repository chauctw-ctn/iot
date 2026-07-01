// fetchscada.js
"use strict";
const axios = require("axios");
const cheerio = require("cheerio");
const db = require("../config/db"); 

const DEFAULT_CONFIG = {
  baseUrl: process.env.SCADA_URL, loginUrl: process.env.SCADA_LOGIN_URL,
  username: process.env.SCADA_USERNAME, password: process.env.SCADA_PASSWORD,
  viewId: Number(process.env.SCADA_VIEW_ID) || 16, timeoutMs: Number(process.env.SCADA_TIMEOUT_MS) || 15000,
  maxRetries: Number(process.env.SCADA_MAX_RETRIES) || 3, retryDelayMs: Number(process.env.SCADA_RETRY_DELAY_MS) || 5000,
  source: "scada", FETCH_INTERVAL_SECONDS: Number(process.env.SCADA_FETCH_INTERVAL_SECONDS) || 60
};

const cnlMapping = {
  2902: ["gs4nm2", "level"], 2904: ["gs4nm2", "flow"], 2905: ["gs4nm2", "totalIndex"],
  2907: ["gs5nm1", "level"], 2909: ["gs5nm1", "flow"], 2910: ["gs5nm1", "totalIndex"],
  2912: ["gs4nm1", "level"], 2914: ["gs4nm1", "flow"], 2915: ["gs4nm1", "totalIndex"],
  2917: ["tb1", "level"],    2919: ["tb1", "flow"],    2920: ["tb1", "totalIndex"],
  2922: ["tb24", "amino"],   2923: ["tb24", "level"],   2925: ["tb24", "nitrat"], 2926: ["tb24", "pH"], 2927: ["tb24", "TDS"],
  2928: ["gs5nm1", "amino"], 2929: ["gs5nm1", "nitrat"], 2930: ["gs5nm1", "pH"], 2931: ["gs5nm1", "TDS"],
  2932: ["gs4nm2", "amino"], 2933: ["gs4nm2", "nitrat"], 2934: ["gs4nm2", "pH"], 2935: ["gs4nm2", "TDS"]
};

function buildStationId(source, rawId) { return `${source}_${String(rawId).toLowerCase()}`; }
function mapCnlToStationAndParameter(cnlNum) {
  const mapped = cnlMapping[cnlNum];
  return mapped ? { station: mapped[0], parameter: mapped[1] } : { station: null, parameter: null };
}

function createHttpClient(config) {
  return axios.create({ timeout: config.timeoutMs, maxRedirects: 5, headers: { "User-Agent": "Mozilla/5.0" } });
}

function collectCookies(existing, next) {
  return Array.from(new Set([...existing, ...next].map((c) => c.split(";")[0]))).join("; ");
}

function parseScadaValue(textValue) {
  if (textValue === null || textValue === undefined) return null;
  let cleaned = String(textValue).trim();
  if (cleaned === "" || cleaned === "-" || cleaned.toLowerCase() === "nan") return null;
  if (cleaned.includes(".") && cleaned.includes(",")) cleaned = cleaned.replace(/\./g, "").replace(/,/g, ".");
  else if (cleaned.includes(",")) cleaned = cleaned.replace(/,/g, ".");
  return Number.isNaN(Number(cleaned)) ? null : Number(cleaned);
}

async function loginScada(config) {
  console.log(`🔒 [SCADA][AUTH] Đang gửi yêu cầu xác thực phiên đăng nhập tới hệ thống nhà máy...`);
  const client = createHttpClient(config); const loginPage = await client.get(config.loginUrl);
  const initialCookies = loginPage.headers["set-cookie"] || []; const initialHeader = collectCookies([], initialCookies);
  const $ = cheerio.load(loginPage.data);
  const loginData = new URLSearchParams({
    __VIEWSTATE: $("input[name='__VIEWSTATE']").val(), __VIEWSTATEGENERATOR: $("input[name='__VIEWSTATEGENERATOR']").val() || "",
    __EVENTVALIDATION: $("input[name='__EVENTVALIDATION']").val() || "", txtUsername: config.username, txtPassword: config.password, btnLogin: "Login"
  });
  const loginResponse = await client.post(config.loginUrl, loginData.toString(), { 
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: initialHeader, Referer: config.loginUrl } 
  });
  console.log(`🟢 [SCADA][AUTH] Đăng nhập SCADA Web thành công. Đã thiết lập Session Cookie.`);
  return { client, sessionCookie: collectCookies(initialCookies, loginResponse.headers["set-cookie"] || []) };
}

function getFormattedTimestampRounded() {
  const now = new Date(); const pad = (v) => String(v).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:00`;
}

async function fetchScadaData() {
  const startLogTime = Date.now();
  console.log(`\n⚙️  [SCADA][FETCH] Khởi chạy chu kỳ cào dữ liệu Scada (${DEFAULT_CONFIG.FETCH_INTERVAL_SECONDS}s)...`);
  const config = DEFAULT_CONFIG; const source = config.source;
  const { client, sessionCookie } = await loginScada(config);
  let rawData = []; const timestamp = Date.now();
  const apiUrl = `${config.baseUrl}/Scada/ClientApiSvc.svc/GetCurCnlDataExt`;

  try {
    const response = await client.get(apiUrl, { params: { cnlNums: '', viewIDs: '', viewID: config.viewId, _: timestamp }, headers: { 'Cookie': sessionCookie } });
    if (response.data && response.data.d) { const parsedRes = JSON.parse(response.data.d); if (parsedRes.Success) rawData = parsedRes.Data; }
  } catch (err) {
    console.log(`⚠️  [SCADA][FETCH_WARN] Khung hiển thị trống. Chuyển sang quét mảng danh mục cnlNums thủ công...`);
    const channelNums = Object.keys(cnlMapping).map(k => parseInt(k, 10));
    const response = await client.get(apiUrl, { params: { cnlNums: JSON.stringify(channelNums), viewIDs: '[]', _: timestamp }, headers: { 'Cookie': sessionCookie } });
    if (response.data && response.data.d) { const parsedRes = JSON.parse(response.data.d); if (parsedRes.Success) rawData = parsedRes.Data; }
  }

  console.log(`📥 [SCADA][FETCH] Đã cào được ${rawData ? rawData.length : 0} điểm dữ liệu từ API SCADA.`);
  if (!rawData || rawData.length === 0) return;

  const currentFetchTs = getFormattedTimestampRounded(); 
  let dbClient;

  try {
    dbClient = await db.connect();
    await dbClient.query("BEGIN");

    const mappingRes = await dbClient.query(`SELECT source_logger_id, source_tag_key, target_station_id FROM logger_tag_mappings`);
    const activeMappings = mappingRes.rows;

    const upsertLatestQuery = `INSERT INTO logger_latest (logger_id, tag_key, data_ts, value, current_ts) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (logger_id, tag_key) DO UPDATE SET data_ts = EXCLUDED.data_ts, value = EXCLUDED.value, current_ts = EXCLUDED.current_ts;`;
    const insertReadingsQuery = `INSERT INTO logger_readings (logger_id, tag_key, data_ts, data_save, value) VALUES ($1, $2, $3, $4, $5);`;

    let originalCount = 0; let matrixCount = 0;
    for (const item of rawData) {
      const { station, parameter } = mapCnlToStationAndParameter(item.CnlNum);
      if (!station || !parameter) continue;

      const stationId = buildStationId(source, String(station).toLowerCase());
      const parsedValue = item.Text ? parseScadaValue(item.Text) : null;
      if (parsedValue === null) continue;

      await dbClient.query(upsertLatestQuery, [stationId, parameter, currentFetchTs, parsedValue, currentFetchTs]);
      await dbClient.query(insertReadingsQuery, [stationId, parameter, currentFetchTs, currentFetchTs, parsedValue]);
      originalCount++;

      await dbClient.query(`INSERT INTO public.logger_stations (station_id, display_name, description) VALUES ($1, $2, $3) ON CONFLICT (station_id) DO NOTHING;`, [stationId, `Trạm ${stationId}`, 'Khởi tạo từ SCADA']);

      const relatedMaps = activeMappings.filter(m => m.source_logger_id === stationId && m.source_tag_key === parameter);
      for (const mapItem of relatedMaps) {
        await dbClient.query(upsertLatestQuery, [mapItem.target_station_id, parameter, currentFetchTs, parsedValue, currentFetchTs]);
        await dbClient.query(insertReadingsQuery, [mapItem.target_station_id, parameter, currentFetchTs, currentFetchTs, parsedValue]);
        matrixCount++;

        await dbClient.query(`INSERT INTO public.logger_stations (station_id, display_name, description) VALUES ($1, $2, $3) ON CONFLICT (station_id) DO NOTHING;`, [mapItem.target_station_id, `Trạm ${mapItem.target_station_id}`, 'Ánh xạ qua SCADA']);
      }
    }

    await dbClient.query("COMMIT");
    const duration = Date.now() - startLogTime;
    console.log(`💾 [SCADA][DB_SUCCESS] Đã commit đồng bộ dữ liệu nhà máy thành công! [Gốc: +${originalCount}] | [Ma trận: +${matrixCount}]. Tổng thời gian: ${duration}ms`);

  } catch (err) {
    if (dbClient) await dbClient.query("ROLLBACK");
    console.error("❌ [SCADA][DB_CRASH] Thất bại chu kỳ ghi dữ liệu cào Scada:", err.message); 
  } finally { 
    if (dbClient) dbClient.release(); 
  }
}

let inFlight = false;
setInterval(async () => {
  if (inFlight) return; inFlight = true;
  for (let attempt = 1; attempt <= DEFAULT_CONFIG.maxRetries; attempt++) {
    try { await fetchScadaData(); break; } catch (e) { 
      console.warn(`⚠️  [SCADA][RETRY] Quét thất bại. Thử lại lần thứ ${attempt}/${DEFAULT_CONFIG.maxRetries} sau ${DEFAULT_CONFIG.retryDelayMs}ms...`);
      if (attempt < DEFAULT_CONFIG.maxRetries) await new Promise(r => setTimeout(r, DEFAULT_CONFIG.retryDelayMs)); 
    }
  }
  inFlight = false;
}, DEFAULT_CONFIG.FETCH_INTERVAL_SECONDS * 1000);

module.exports = { fetchScadaData };