// test_connection.js
"use strict";

const db = require('./config/db');

async function checkPostgresConnection() {
  console.log('====================================================================');
  console.log('⏳ Thử nghiệm kết nối tới Cơ sở dữ liệu Supabase Postgres...');
  console.log('====================================================================');
  
  const startTime = Date.now();
  try {
    // 1. Kiểm tra lệnh truy vấn cơ bản thông qua hàm query()
    console.log('📡 Đang gửi truy vấn kiểm tra hệ thống...');
    const res = await db.query('SELECT NOW() AS system_time, current_database() AS db_name, version();');
    
    console.log('\n✅ KẾT NỐI THÀNH CÔNG!');
    console.log(`⏱️  Thời gian phản hồi: ${Date.now() - startTime}ms`);
    console.log(`📦 Tên cơ sở dữ liệu: ${res.rows[0].db_name}`);
    console.log(`⏰ Giờ hệ thống DB: ${res.rows[0].system_time}`);
    console.log(`ℹ️  Phiên bản Postgres: ${res.rows[0].version.split(',')[0]}`);
    
    // 2. Kiểm tra khả năng mở Pool Connection Client thực tế
    console.log('\n🔒 Đang kiểm tra luồng kết nối Pool Client...');
    const client = await db.connect();
    console.log('✅ Pool Client hoạt động ổn định!');
    client.release(); // Giải phóng client ngay lập tức
    
  } catch (error) {
    console.error('\n❌ KẾT NỐI THẤT BẠI!');
    console.error('--------------------------------------------------------------------');
    console.error(`🔴 Mã lỗi: ${error.code || 'N/A'}`);
    console.error(`📝 Chi tiết lỗi: ${error.message}`);
    console.error('--------------------------------------------------------------------');
    console.error('💡 Gợi ý kiểm tra:');
    console.error('   1. Hãy chắc chắn rằng chuỗi DATABASE_URL trong file .env đã chính xác.');
    console.error('   2. Kiểm tra mật khẩu (ký tự đặc biệt `@` của bạn đã được mã hóa thành `%40` -> Chính xác).');
    console.error('   3. Kiểm tra mạng hoặc tường lửa (Firewall) có chặn cổng 6543 hay không.');
  } finally {
    // Đóng toàn bộ Pool để giải phóng Terminal
    // Lưu ý: Đoạn mã cấu hình db của bạn sử dụng `pool` nội bộ, nếu db export pool, ta có thể đóng. 
    // Để script tự kết thúc, ta dùng process.exit
    setTimeout(() => {
        process.exit(0);
    }, 500);
  }
}

checkPostgresConnection();