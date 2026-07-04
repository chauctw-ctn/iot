$h=@{"Content-Type"="application/json"};$b=@{station_id="gw_http_tram_test";display_name="Trạm Đẩy HTTP Gateway";timestamp="2026-07-01 19:45:00";metrics=@{level=4.52;flow=118.4;totalIndex=541200}} | ConvertTo-Json -Compress; Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/gateway/push" -Headers $h -Body $b | Format-List


node -e "const m = require('mqtt'); const c = m.connect('mqtt://14.225.252.85:1883'); c.on('connect', () => { const p = { station_id: 'gw_final_test', display_name: 'Trạm Kết Nối Chuẩn', timestamp: '2026-07-01 19:46:00', metrics: { level: 6.28, flow: 124.5 } }; c.publish('telemetry/push', JSON.stringify(p), { qos: 0 }, () => { console.log('🟢 [TEST] Da day du lieu qua Broker thanh cong!'); c.end(); }); });"


function Show-Tree {
    param(
        [string]$Path = ".",
        [string]$Indent = ""
    )

    Get-ChildItem $Path | Where-Object { $_.Name -ne "node_modules" } | ForEach-Object {
        Write-Output "$Indent|-- $($_.Name)"
        if ($_.PSIsContainer) {
            Show-Tree $_.FullName ($Indent + "|   ")
        }
    }
}

Show-Tree | Out-File structure.txt -Encoding utf8


TVA: 19 trạm
DHG: 05 trạm
TLI: 13 trạm
Tổng 37 trạm




http://localhost:3000/api/kpi/flow-summary?station_ids=tva_tb24,tva_tb25,tva_tb27&tag_key=flow&interval_mins=30
http://localhost:3000/api/kpi/volume-consumption?station_ids=mqtt_gtacvan,mqtt_g31b,mqtt_g30a&tag_key=totalIndex



const SCADA_STATION_COORDINATES = {    
    'G4_NM1': { lat: 9.1794, lng: 105.1528 },
    'G4_NM2': { lat: 9.1801, lng: 105.1532 },
    'G5_NM1': { lat: 9.1785, lng: 105.1535 },
    'TRAM_1': { lat: 9.1770, lng: 105.1520 },
    'TRAM_24': { lat: 9.1805, lng: 105.1545 },
};
const MQTT_STATION_COORDINATES = {
    'QT1_NM2': { lat: 9.205658, lng: 105.12963 },
    'QT2_NM2': { lat: 9.203337, lng: 105.129712 },
    'QT2M': { lat: 9.179219, lng: 105.139376 },
    'QT5': { lat: 9.17864, lng: 105.15427 },
    'GS1_NM2': { lat: 9.205104, lng: 105.131994 },
    'GS2_NM1': { lat: 9.173416, lng: 105.209793 },
    'G15': { lat: 9.1835, lng: 105.152611 },
    'G18': { lat: 9.175669, lng: 105.170509 },
    'G31B': { lat: 9.20642, lng: 105.16646 },
    'GTACVAN': { lat: 9.16336, lng: 105.25151 },
    'G29A': { lat: 9.14649, lng: 105.139282 },
    'G30A': { lat: 9.165363, lng: 105.157047 },
    'QT2': { lat: 9.179219, lng: 105.139376 },  // Same as QT2M    
};
const TVA_STATION_COORDINATES = {
    'NHÀ MÁY SỐ 1 - GIẾNG SỐ 1': { lat: 9.205068, lng: 105.133103 },
    'NHÀ MÁY SỐ 2 - GIẾNG SỐ 3': { lat: 9.173283, lng: 105.209918 },
    'TRẠM BƠM 22': { lat: 9.130936, lng: 105.135063 },
    'TRẠM BƠM 26': { lat: 9.092956, lng: 105.133219 },
    'TRẠM BƠM 4': { lat: 9.231647, lng: 105.157951 },
    'TRẠM BƠM 16': { lat: 9.181186, lng: 105.088219 },
    'TRẠM BƠM 20': { lat: 9.152653, lng: 105.157631 },
    'TRẠM BƠM 23': { lat: 9.119739, lng: 105.141647 },
    'TRẠM BƠM 12': { lat: 9.196925, lng: 105.160156 },
    'TRẠM BƠM 21': { lat: 9.141861, lng: 105.138564 },
    'QT3': { lat: 9.178764, lng: 105.162811 },
    'QT1-NM1': { lat: 9.173508, lng: 105.209793 },
    'QT2-NM1': { lat: 9.205197, lng: 105.133057 },
    'TRẠM BƠM 2': { lat: 9.241708, lng: 105.134453 },
    'TRẠM BƠM 27': { lat: 9.081444, lng: 105.132731 },
    'NHÀ MÁY SỐ 1 - GIẾNG SỐ 3': { lat: 9.205121, lng: 105.132026 },
    'NHÀ MÁY SỐ 2 - GIẾNG SỐ 2': { lat: 9.173416, lng: 105.209793 },
    'TRẠM BƠM 24': { lat: 9.108739, lng: 105.136789 },
    'TRẠM BƠM 25': { lat: 9.100839, lng: 105.133297 }
};




Trạm không sử dụng TVA: 'QT1 (182/GP-BTNMT)': { lat: 9.179311, lng: 105.139264 },
Trạm không sử dụng MQTT: QT4


LAT      | LNG      | MONRE                  | MQTT                     | TVA            | SCADA
---------+----------+------------------------+--------------------------+----------------+------------
9.2057   | 105.1296 | QT1NM2                 | NM2-QT1(203/GP-BTNMT)    |                |
9.2033   | 105.1297 | QT2NM2                 | NM2-QT2(203/GP-BTNMT)    |                |
9.2052   | 105.1331 | QT2NM1                 |                          | QT2-NM1        |
9.2051   | 105.1331 | GS1NM1                 |                          | NM1-GS1        |
9.2051   | 105.1320 | GS1NM2                 | NM2-GS1(203/GP-BTNMT)    | NM1-GS3        |
9.1735   | 105.2098 | QT1NM1                 |                          | QT1-NM1        |
9.1734   | 105.2098 | GS2NM2, GS2NM1         | NM1-GS2(201/GP-BTNMT)    | NM2-GS2        |
9.1733   | 105.2099 | GS3NM2                 |                          | NM2-GS3        |
9.2064   | 105.1665 |                        | G31B(16/GP-UBND)         |                |
9.1634   | 105.2515 |                        | GTACVAN(25/GP-UBND)      |                |
9.1654   | 105.1570 |                        | G30A(16/GP-UBND)         |                |
9.1465   | 105.1393 |                        | G29A(31/GP-UBND)         |                |
9.2417   | 105.1345 | G2                     |                          | TRẠM BƠM 2     |
9.2316   | 105.1580 | G4                     |                          | TRẠM BƠM 4     |
9.1969   | 105.1602 | G12                    |                          | TRẠM BƠM 12    |
9.1835   | 105.1526 | G15                    | G15(35/GP-BTNMT)         |                |
9.1812   | 105.0882 |                        |                          | TRẠM BƠM 16    |
9.1794   | 105.1528 | GS4NM1                 |                          |                | NM1-GS4
9.1801   | 105.1532 | GS4NM2                 |                          |                | NM2-GS4
9.1785   | 105.1535 | GS5NM1, CLNGS5NM1      |                          |                | NM1-GS5
9.1805   | 105.1545 | QT4, CLNQT4            |                          |                | CLN TB24
9.1792   | 105.1394 | QT2M                   | QT2M(36/GP-BTNMT)        |                |
9.1788   | 105.1628 | QT3                    |                          | QT3            |
9.1786   | 105.1543 | QT5                    | QT5(35/GP-BTNMT)         |                |
9.1770   | 105.1520 |                        |                          |                | TRẠM BƠM 1
9.1757   | 105.1705 | G18                    | G18(35/GP-BTNMT)         |                |
9.1527   | 105.1576 | G20                    |                          | TRẠM BƠM 20    |
9.1419   | 105.1386 | G21                    |                          | TRẠM BƠM 21    |
9.1309   | 105.1351 | G22                    |                          | TRẠM BƠM 22    |
9.1197   | 105.1416 | G23                    |                          | TRẠM BƠM 23    |
9.1087   | 105.1368 | G24                    |                          | TRẠM BƠM 24    |
9.1008   | 105.1333 | G25                    |                          | TRẠM BƠM 25    |
9.0930   | 105.1332 | G26                    |                          | TRẠM BƠM 26    |
9.0814   | 105.1327 | G27                    |                          | TRẠM BƠM 27    |



[
  // ===== SCADA =====
  { station_id: "scada_gs4nm1", name: "NM1-GS4", lat: 9.1794, lng: 105.1528 },
  { station_id: "scada_gs4nm2", name: "NM2-GS4", lat: 9.1801, lng: 105.1532 },
  { station_id: "scada_gs5nm1", name: "NM1-GS5", lat: 9.1785, lng: 105.1535 },
  { station_id: "scada_tb1", name: "TRẠM BƠM 1", lat: 9.1770, lng: 105.1520 },
  { station_id: "scada_tb24", name: "CLN TB24", lat: 9.1805, lng: 105.1545 },

  // ===== MQTT =====
  { station_id: "mqtt_qt1nm2", name: "NM2-QT1(203/GP-BTNMT)", lat: 9.2057, lng: 105.1296 },
  { station_id: "mqtt_qt2nm2", name: "NM2-QT2(203/GP-BTNMT)", lat: 9.2033, lng: 105.1297 },
  { station_id: "mqtt_qt2", name: "QT2M(36/GP-BTNMT)", lat: 9.1792, lng: 105.1394 },
  { station_id: "mqtt_qt5", name: "QT5(35/GP-BTNMT)", lat: 9.1786, lng: 105.1543 },
  { station_id: "mqtt_gs1nm2", name: "NM2-GS1(203/GP-BTNMT)", lat: 9.2051, lng: 105.1320 },
  { station_id: "mqtt_gs2nm1", name: "NM1-GS2(201/GP-BTNMT)", lat: 9.1734, lng: 105.2098 },
  { station_id: "mqtt_g15", name: "G15(35/GP-BTNMT)", lat: 9.1835, lng: 105.1526 },
  { station_id: "mqtt_g18", name: "G18(35/GP-BTNMT)", lat: 9.1757, lng: 105.1705 },
  { station_id: "mqtt_g29a", name: "G29A(31/GP-UBND)", lat: 9.1465, lng: 105.1393 },
  { station_id: "mqtt_g30a", name: "G30A(16/GP-UBND)", lat: 9.1654, lng: 105.1570 },
  { station_id: "mqtt_g31b", name: "G31B(16/GP-UBND)", lat: 9.2064, lng: 105.1665 },
  { station_id: "mqtt_gtacvan", name: "GTACVAN(25/GP-UBND)", lat: 9.1634, lng: 105.2515 },

  // ===== TVA =====
  { station_id: "tva_gs1nm1", name: "NM1-GS1", lat: 9.2051, lng: 105.1331 },
  { station_id: "tva_gs2nm2", name: "NM2-GS2", lat: 9.1734, lng: 105.2098 },
  { station_id: "tva_gs3nm1", name: "NM1-GS3", lat: 9.2051, lng: 105.1320 },
  { station_id: "tva_gs3nm2", name: "NM2-GS3", lat: 9.1733, lng: 105.2099 },
  { station_id: "tva_qt1nm1", name: "QT1-NM1", lat: 9.1735, lng: 105.2098 },
  { station_id: "tva_qt2nm1", name: "QT2-NM1", lat: 9.2052, lng: 105.1331 },
  { station_id: "tva_qt3", name: "QT3", lat: 9.1788, lng: 105.1628 },
  { station_id: "tva_tb2", name: "TRẠM BƠM 2", lat: 9.2417, lng: 105.1345 },
  { station_id: "tva_tb4", name: "TRẠM BƠM 4", lat: 9.2316, lng: 105.1580 },
  { station_id: "tva_tb12", name: "TRẠM BƠM 12", lat: 9.1969, lng: 105.1602 },
  { station_id: "tva_tb16", name: "TRẠM BƠM 16", lat: 9.1812, lng: 105.0882 },
  { station_id: "tva_tb20", name: "TRẠM BƠM 20", lat: 9.1527, lng: 105.1576 },
  { station_id: "tva_tb21", name: "TRẠM BƠM 21", lat: 9.1419, lng: 105.1386 },
  { station_id: "tva_tb22", name: "TRẠM BƠM 22", lat: 9.1309, lng: 105.1351 },
  { station_id: "tva_tb23", name: "TRẠM BƠM 23", lat: 9.1197, lng: 105.1416 },
  { station_id: "tva_tb24", name: "TRẠM BƠM 24", lat: 9.1087, lng: 105.1368 },
  { station_id: "tva_tb25", name: "TRẠM BƠM 25", lat: 9.1008, lng: 105.1333 },
  { station_id: "tva_tb26", name: "TRẠM BƠM 26", lat: 9.0930, lng: 105.1332 },
  { station_id: "tva_tb27", name: "TRẠM BƠM 27", lat: 9.0814, lng: 105.1327 },

  // ===== MONRE =====
  { station_id: "monre_35_g2", name: "G2", lat: 9.2417, lng: 105.1345 },
  { station_id: "monre_35_g4", name: "G4", lat: 9.2316, lng: 105.1580 },
  { station_id: "monre_35_g12", name: "G12", lat: 9.1969, lng: 105.1602 },
  { station_id: "monre_35_g15", name: "G15", lat: 9.1835, lng: 105.1526 },
  { station_id: "monre_35_g18", name: "G18", lat: 9.1757, lng: 105.1705 },
  { station_id: "monre_35_g20", name: "G20", lat: 9.1527, lng: 105.1576 },
  { station_id: "monre_35_g22", name: "G22", lat: 9.1309, lng: 105.1351 },
  { station_id: "monre_35_g23", name: "G23", lat: 9.1197, lng: 105.1416 },
  { station_id: "monre_35_g24", name: "G24", lat: 9.1087, lng: 105.1368 },
  { station_id: "monre_35_g25", name: "G25", lat: 9.1008, lng: 105.1333 },
  { station_id: "monre_35_g27", name: "G27", lat: 9.0814, lng: 105.1327 },
  { station_id: "monre_35_qt3", name: "QT3", lat: 9.1788, lng: 105.1628 },
  { station_id: "monre_35_qt4", name: "QT4", lat: 9.1805, lng: 105.1545 },
  { station_id: "monre_35_qt5", name: "QT5", lat: 9.1786, lng: 105.1543 },
  { station_id: "monre_35_clnqt4", name: "CLNQT4", lat: 9.1805, lng: 105.1545 },

  { station_id: "monre_36_gs1nm2", name: "GS1NM2", lat: 9.2051, lng: 105.1320 },
  { station_id: "monre_36_gs2nm2", name: "GS2NM2", lat: 9.1734, lng: 105.2098 },
  { station_id: "monre_36_gs3nm2", name: "GS3NM2", lat: 9.1733, lng: 105.2099 },
  { station_id: "monre_36_gs4nm2", name: "GS4NM2", lat: 9.1801, lng: 105.1532 },
  { station_id: "monre_36_qt1nm2", name: "QT1NM2", lat: 9.2057, lng: 105.1296 },
  { station_id: "monre_36_qt2nm2", name: "QT2NM2", lat: 9.2033, lng: 105.1297 },
  { station_id: "monre_391_g21", name: "G21", lat: 9.1419, lng: 105.1386 },
  { station_id: "monre_391_g26", name: "G26", lat: 9.0930, lng: 105.1332 },
  { station_id: "monre_391_qt2m", name: "QT2M", lat: 9.1792, lng: 105.1394 },

  { station_id: "monre_393_gs1nm1", name: "GS1NM1", lat: 9.2051, lng: 105.1331 },
  { station_id: "monre_393_gs2nm1", name: "GS2NM1", lat: 9.1734, lng: 105.2098 },
  { station_id: "monre_393_gs3nm1", name: "GS3NM1", lat: 9.2051, lng: 105.1320 },
  { station_id: "monre_393_gs4nm1", name: "GS4NM1", lat: 9.1794, lng: 105.1528 },
  { station_id: "monre_393_gs5nm1", name: "GS5NM1", lat: 9.1785, lng: 105.1535 },
  { station_id: "monre_393_qt1nm1", name: "QT1NM1", lat: 9.1735, lng: 105.2098 },
  { station_id: "monre_393_qt2nm1", name: "QT2NM1", lat: 9.2052, lng: 105.1331 },
  { station_id: "monre_393_clngs5nm1", name: "CLNGS5NM1", lat: 9.1785, lng: 105.1535 }
]




// Google Maps API Key
const GOOGLE_MAPS_API_KEY = 'AIzaSyAyK0kR6vJbz16MxVEkYat34RKSALeLGrw_';

    const cartoDBVoyager = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    });
    
    const esriWorldImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 19
    });
    
    const openTopoMap = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
        maxZoom: 17
    });
    
    const esriWorldStreetMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri',
        maxZoom: 19
    });
    
    // Google Maps tile layers
    const googleRoadmap = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key=' + GOOGLE_MAPS_API_KEY, {
        attribution: '&copy; <a href="https://www.google.com/maps">Google Maps</a>',
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    });
    
    const googleSatellite = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}&key=' + GOOGLE_MAPS_API_KEY, {
        attribution: '&copy; <a href="https://www.google.com/maps">Google Maps</a>',
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    });
    
    const googleHybrid = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&key=' + GOOGLE_MAPS_API_KEY, {
        attribution: '&copy; <a href="https://www.google.com/maps">Google Maps</a>',
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    });
    
    const googleTerrain = L.tileLayer('https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}&key=' + GOOGLE_MAPS_API_KEY, {
        attribution: '&copy; <a href="https://www.google.com/maps">Google Maps</a>',
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    });
    
