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