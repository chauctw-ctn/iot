const db = require('./config/db');

async function initAndCleanDatabase() {
  console.log('🚀 Khởi động luồng dọn dẹp dữ liệu và tối ưu hóa PostgreSQL...');
  
  try {
    // 1. 🟢 BỔ SUNG: Xóa sạch dữ liệu ở toàn bộ các bảng liên quan
    // RESTART IDENTITY: Reset các cột ID tự tăng (SERIAL/BIGSERIAL) về lại số 1
    // CASCADE: Tự động xử lý xóa theo đúng thứ tự ràng buộc khóa ngoại (Foreign Key)
    console.log('🧹 Đang xóa trắng toàn bộ dữ liệu cũ...');
    await db.query(`
      TRUNCATE TABLE 
        public.logger_readings, 
        public.logger_latest, 
        public.logger_tag_mappings, 
        public.alert_thresholds, 
        public.logger_stations 
      RESTART IDENTITY CASCADE;
    `);
    console.log('✨ Đã xóa trắng dữ liệu thành công!');

    // 2. Tạo Composite Index tăng tốc độ truy vấn cho hệ thống
    console.log('📊 Đang thiết lập các chỉ mục (Indexes) hiệu năng cao...');
    await db.query(`CREATE INDEX IF NOT EXISTS idx_readings_perf ON public.logger_readings (logger_id, tag_key, data_ts DESC);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_latest_perf ON public.logger_latest (logger_id, tag_key);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_mappings_perf ON public.logger_tag_mappings (target_station_id);`);
    console.log('⚡ Đã cấu trúc xong các chỉ mục tối ưu!');

    // 3. Tối ưu dung lượng đĩa cứng vật lý và cập nhật lại bộ đếm thống kê cho Postgres
    console.log('🗜️ Đang chạy VACUUM ANALYZE thu hồi tài nguyên ổ đĩa...');
    await db.query('VACUUM ANALYZE public.logger_readings;');
    await db.query('VACUUM ANALYZE public.logger_latest;');
    
    console.log('✅ HOÀN THÀNH: Database đã trắng tinh khôi và tối ưu 100%!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi trong quá trình khởi tạo/dọn dẹp:', error.message);
    process.exit(1);
  }
}

initAndCleanDatabase();