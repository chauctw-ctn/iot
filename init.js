const db = require('./config/db');

async function initAndCleanDatabase() {
  console.log('🚀 Đang tối ưu hóa cấu trúc chỉ mục database...');
  try {
    // Tự động dọn rác cấu hình thừa và tạo Composite Index tăng tốc độ tải đồ thị
    await db.query(`CREATE INDEX IF NOT EXISTS idx_readings_perf ON public.logger_readings (logger_id, tag_key, data_ts DESC);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_latest_perf ON public.logger_latest (logger_id, tag_key);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_mappings_perf ON public.logger_tag_mappings (target_station_id);`);
    await db.query('VACUUM ANALYZE public.logger_readings;');
    await db.query('VACUUM ANALYZE public.logger_latest;');
    console.log('✅ Đã tối ưu hóa PostgreSQL thành công!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi khởi tạo tối ưu:', error.message);
    process.exit(1);
  }
}
initAndCleanDatabase();