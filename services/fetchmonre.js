// fetchmonre.js
"use strict";
const axios = require('axios');
const db = require("../config/db"); 

const CONFIG = {
    USERNAME: process.env.MONRE_USERNAME,
    PASSWORD: process.env.MONRE_PASSWORD,
    PORTAL_URL: process.env.MONRE_PORTAL_URL,
    DATA_URL: process.env.MONRE_DATA_URL,
    SOURCE: "monre", 
    FETCH_INTERVAL_SECONDS: Number(process.env.MONRE_FETCH_INTERVAL_SECONDS) || 60
};

const PROJECT_FILTER = "(congtrinh='CAPNUOCCAMAU1' OR congtrinh='CONGTYCOPHANCAPNUOCC' OR congtrinh='NHAMAYCAPNUOCSO1' OR congtrinh='CAPNUOCCAMAUSO2')";
const PERMIT_MAPPING = {
    "393/gp-bnnmt 22/09/2025": ["NHAMAYCAPNUOCSO1"],
    "391/gp-bnnmt 19/09/2025": ["CONGTYCOPHANCAPNUOCC"],
    "35/gp-btnmt 15/01/2025": ["CAPNUOCCAMAU1"],
    "36/gp-btnmt 15/01/2025": ["CAPNUOCCAMAUSO2"]
};
const PARAMETER_MAP = {
    "MUCNUOC": "level", "H": "level", "LUULUONG": "flow", "Q": "flow", "TONGLUULUONG": "totalIndex", "V": "totalIndex",
    "PH": "ph", "TDS": "tds", "NO3": "no3", "NH4+": "nh4", "NH4": "nh4", "AMONI": "nh4"  
};

let cachedToken = null; let tokenExpiry = null;

function getCleanPermitNumber(projectName) {
    if (!projectName) return "UNKNOWN";
    const targetProject = projectName.trim().toUpperCase();
    for (const [permit, projects] of Object.entries(PERMIT_MAPPING)) {
        if (projects.some(p => p.trim().toUpperCase() === targetProject)) {
            const match = permit.split(' ')[0].match(/^(\d+)/);
            return match ? match[1] : "UNKNOWN";
        }
    }
    return "UNKNOWN";
}

function formatTimestampRounded(ts) {
    if (!ts) return null;
    const date = new Date(Number(ts));
    if (Number.isNaN(date.getTime())) return null;
    const pad = (v) => String(v).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

function getCurrentSystemTimeRounded() {
    const now = new Date(); const pad = (v) => String(v).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:00`;
}

function normalizeMetricValue(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return Number.isNaN(value) ? null : value;
    let cleaned = String(value).trim();
    if (cleaned === '' || cleaned === '-' || cleaned === '.') return 0;
    cleaned = cleaned.replace(/,/g, "");
    return Number.isNaN(Number(cleaned)) ? null : Number(cleaned);
}

async function getToken() {
    if (cachedToken && tokenExpiry && Date.now() < (tokenExpiry - 5 * 60 * 1000)) return cachedToken;
    try {
        console.log(`🔑 [MONRE][TOKEN] Đang gửi yêu cầu cấp Token mới tới Portal...`);
        const params = new URLSearchParams({ username: CONFIG.USERNAME, password: CONFIG.PASSWORD, referer: 'https://iot.monre.gov.vn', f: 'json', expiration: 60 });
        const response = await axios.post(CONFIG.PORTAL_URL, params.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 });
        if (response.data && response.data.token) {
            cachedToken = response.data.token;
            tokenExpiry = response.data.expires ? response.data.expires : (Date.now() + 60 * 60 * 1000);
            console.log(`🟢 [MONRE][TOKEN] Cấp Token bảo mật thành công! Hết hạn lúc: ${new Date(tokenExpiry).toLocaleTimeString()}`);
            return cachedToken;
        }
        throw new Error(response.data?.error?.message || 'Invalid token response');
    } catch (error) {
        console.error("❌ [MONRE][TOKEN] Thất bại khi thiết lập Token bảo mật:", error.message);
        throw error;
    }
}

async function fetchMonreData() {
    const startLogTime = Date.now();
    console.log(`\n☁️  [MONRE][FETCH] Khởi chạy chu kỳ quét API (${CONFIG.FETCH_INTERVAL_SECONDS}s)...`);
    let client;
    try {
        const token = await getToken();
        const currentFetchTs = getCurrentSystemTimeRounded(); 
        
        const params = { f: 'json', where: PROJECT_FILTER, outFields: '*', orderByFields: 'thoigiannhan DESC', resultRecordCount: 5000, token: token };
        const response = await axios.get(CONFIG.DATA_URL, { params, timeout: 25000 });
        if (response.data && response.data.error) throw new Error(response.data.error.message);

        const features = response.data.features || [];
        console.log(`📥 [MONRE][FETCH] Đã nhận được ${features.length} dòng dữ liệu thô từ Portal.`);
        if (features.length === 0) return;

        const rawLatestMap = {};
        features.forEach(f => {
            const attr = f.attributes;
            if (!attr || !attr.tram || !attr.chiso) return;
            if (!rawLatestMap[attr.tram]) rawLatestMap[attr.tram] = {};
            if (!rawLatestMap[attr.tram][attr.chiso]) rawLatestMap[attr.tram][attr.chiso] = attr;
        });

        const permitCounters = {}; const finalizedDataBatch = [];
        for (const rawStationName in rawLatestMap) {
            const firstParamKey = Object.keys(rawLatestMap[rawStationName])[0];
            const sampleAttr = rawLatestMap[rawStationName][firstParamKey];
            const cleanPermit = getCleanPermitNumber(sampleAttr.congtrinh);

            if (!permitCounters[cleanPermit]) permitCounters[cleanPermit] = 0;
            permitCounters[cleanPermit]++;

            const stationCode = String(permitCounters[cleanPermit]).padStart(2, '0');
            const mappedStationName = `${CONFIG.SOURCE}_${cleanPermit}_gs${stationCode}`;

            for (const paramName in rawLatestMap[rawStationName]) {
                const targetAttr = rawLatestMap[rawStationName][paramName];
                const standardParam = PARAMETER_MAP[targetAttr.chiso.toUpperCase().trim()];
                if (!standardParam) continue; 

                const parsedValue = normalizeMetricValue(targetAttr.giatri);
                if (parsedValue === null) continue;

                finalizedDataBatch.push({
                    stationId: mappedStationName, tagKey: standardParam,
                    dataTs: formatTimestampRounded(targetAttr.thoigiando), value: parsedValue
                });
            }
        }

        console.log(`⚙️  [MONRE][PROCESS] Phân tách thành công ${finalizedDataBatch.length} chỉ số đo hợp lệ.`);
        client = await db.connect();
        await client.query("BEGIN");

        const mappingRes = await client.query(`SELECT source_logger_id, source_tag_key, target_station_id FROM logger_tag_mappings`);
        const mappings = mappingRes.rows;

        const upsertLatestQuery = `INSERT INTO logger_latest (logger_id, tag_key, data_ts, value, current_ts) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (logger_id, tag_key) DO UPDATE SET data_ts = EXCLUDED.data_ts, value = EXCLUDED.value, current_ts = EXCLUDED.current_ts;`;
        const insertReadingsQuery = `INSERT INTO logger_readings (logger_id, tag_key, data_ts, data_save, value) VALUES ($1, $2, $3, $4, $5);`;

        let originalCount = 0; let matrixCount = 0;
        for (const record of finalizedDataBatch) {
            // Ghi dữ liệu trạm gốc
            await client.query(upsertLatestQuery, [record.stationId, record.tagKey, record.dataTs, record.value, currentFetchTs]);
            await client.query(insertReadingsQuery, [record.stationId, record.tagKey, record.dataTs, currentFetchTs, record.value]);
            originalCount++;

            await client.query(`INSERT INTO logger_stations (station_id, display_name, description) VALUES ($1, $2, $3) ON CONFLICT (station_id) DO NOTHING;`, [record.stationId, `Trạm ${record.stationId}`, 'Khởi tạo tự động từ luồng API MONRE']);

            // Xử lý ma trận chuyển tiếp ánh xạ
            const targetMaps = mappings.filter(m => m.source_logger_id === record.stationId && m.source_tag_key === record.tagKey);
            for (const mapItem of targetMaps) {
                await client.query(upsertLatestQuery, [mapItem.target_station_id, record.tagKey, record.dataTs, record.value, currentFetchTs]);
                await client.query(insertReadingsQuery, [mapItem.target_station_id, record.tagKey, record.dataTs, currentFetchTs, record.value]);
                matrixCount++;

                await client.query(`INSERT INTO logger_stations (station_id, display_name, description) VALUES ($1, $2, $3) ON CONFLICT (station_id) DO NOTHING;`, [mapItem.target_station_id, `Trạm ${mapItem.target_station_id}`, 'Khởi tạo tự động qua luồng ma trận']);
            }
        }

        await client.query("COMMIT");
        const duration = Date.now() - startLogTime;
        console.log(`💾 [MONRE][DB_SUCCESS] Đã ghi thành công! [Trạm gốc: +${originalCount} bản ghi] | [Ma trận ánh xạ: +${matrixCount} bản ghi]. Thời gian xử lý: ${duration}ms`);

    } catch (error) {
        if (client) await client.query("ROLLBACK");
        console.error('❌ [MONRE][DB_CRASH] Thất bại chu kỳ ghi đồng bộ:', error.message);
    } finally {
        if (client) client.release();
    }
}

setInterval(async () => { await fetchMonreData(); }, CONFIG.FETCH_INTERVAL_SECONDS * 1000);
module.exports = { fetchMonreData };