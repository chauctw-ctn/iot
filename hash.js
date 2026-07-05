// Tạo chuỗi băm để chèn trực tiếp bằng SQL
const bcrypt = require('bcryptjs');
bcrypt.hash('123456@', 10).then(console.log); 
// Ví dụ đầu ra: $2a$10$X897asd...GjHkLKsdKJL