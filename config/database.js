const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false
  }
});

async function initializeDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('Checking database...');

    await client.query(`
      -- Admins table
      CREATE TABLE IF NOT EXISTS admins (
        id VARCHAR(8) PRIMARY KEY,
        full_name VARCHAR(100) NOT NULL,
        phone_number VARCHAR(13),
        email VARCHAR(100),
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP
      );

      -- Pending info providers
      CREATE TABLE IF NOT EXISTS info_providers_pending (
        id VARCHAR(8) PRIMARY KEY,
        added_by_admin_id VARCHAR(8),
        added_method VARCHAR(20) NOT NULL,
        batch_upload_id UUID,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Registered info providers
      CREATE TABLE IF NOT EXISTS info_providers (
        id VARCHAR(8) PRIMARY KEY,
        full_name VARCHAR(100) NOT NULL,
        phone_number VARCHAR(13) UNIQUE,
        unit_department VARCHAR(100),
        password_hash VARCHAR(255) NOT NULL,
        registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP,
        status VARCHAR(20) DEFAULT 'active'
      );

      -- Chat messages
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sender_id VARCHAR(8) NOT NULL,
        receiver_id VARCHAR(8) NOT NULL,
        message_type VARCHAR(20) DEFAULT 'text',
        message_content TEXT,
        file_url TEXT,
        file_name VARCHAR(255),
        file_size BIGINT,
        location_lat DECIMAL(10, 8),
        location_lng DECIMAL(11, 8),
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Information threads
      CREATE TABLE IF NOT EXISTS information_threads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        info_provider_id VARCHAR(8) NOT NULL,
        admin_id VARCHAR(8),
        status VARCHAR(20) DEFAULT 'open',
        last_message TEXT,
        last_message_time TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Excel upload history
      CREATE TABLE IF NOT EXISTS batch_uploads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_id VARCHAR(8),
        file_name VARCHAR(255),
        total_records INTEGER DEFAULT 0,
        successful_records INTEGER DEFAULT 0,
        failed_records INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Tables ready!');

    // Check if admins already exist
    const adminCheck = await client.query('SELECT COUNT(*) FROM admins');
    
    if (parseInt(adminCheck.rows[0].count) === 0) {
      console.log('Creating default admins...');
      
      const bcrypt = require('bcryptjs');
      const salt = await bcrypt.genSalt(10);
      
      // Fixed passwords
      const password1 = await bcrypt.hash('Admin@123', salt);
      const password2 = await bcrypt.hash('Admin@456', salt);
      const password3 = await bcrypt.hash('Admin@789', salt);
      
      await client.query(
        `INSERT INTO admins (id, full_name, phone_number, password_hash) VALUES 
         ('20809915', 'Primary Admin', '0916641280', $1),
         ('00000001', 'System Admin 1', NULL, $2),
         ('00000002', 'System Admin 2', NULL, $3)`,
        [password1, password2, password3]
      );
      
      console.log('Default admins created!');
    } else {
      console.log('Admins already exist, skipping creation.');
    }

    console.log('Admin IDs: 20809915, 00000001, 00000002');
    console.log('Passwords: Admin@123, Admin@456, Admin@789');
    
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { pool, initializeDatabase };