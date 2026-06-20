const bcrypt = require('bcryptjs');
const xlsx = require('xlsx');
const { pool } = require('../config/database');
const validators = require('../utils/validators');

const adminController = {

  // Get Dashboard Data
  getDashboard: async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT 
          it.*,
          ip.full_name as provider_name,
          ip.unit_department,
          ip.phone_number,
          (SELECT COUNT(*) FROM chat_messages cm 
           WHERE cm.sender_id = ip.id OR cm.receiver_id = ip.id) as message_count
        FROM information_threads it
        JOIN info_providers ip ON it.info_provider_id = ip.id
        ORDER BY 
          CASE 
            WHEN it.last_message_time IS NULL THEN it.created_at
            ELSE it.last_message_time 
          END DESC
      `);

      res.json({
        success: true,
        threads: result.rows
      });

    } catch (error) {
      console.error('Get dashboard error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to load dashboard data'
      });
    }
  },

  // Get Pending Providers
  getPendingProviders: async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT * FROM info_providers_pending 
         ORDER BY created_at DESC`
      );

      res.json({
        success: true,
        providers: result.rows
      });

    } catch (error) {
      console.error('Get pending providers error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to load pending providers'
      });
    }
  },

  // Get Registered Providers
  getRegisteredProviders: async (req, res) => {
    try {
      const { search } = req.query;
      let query = 'SELECT * FROM info_providers WHERE 1=1';
      const params = [];

      if (search) {
        params.push(`%${validators.sanitizeInput(search)}%`);
        query += ` AND (id LIKE $1 OR full_name LIKE $1 OR unit_department LIKE $1)`;
      }

      query += ' ORDER BY registered_at DESC';

      const result = await pool.query(query, params);

      res.json({
        success: true,
        providers: result.rows
      });

    } catch (error) {
      console.error('Get registered providers error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to load registered providers'
      });
    }
  },

  // Add Provider Manually
  addProviderManual: async (req, res) => {
    try {
      const { providerId } = req.body;
      const adminId = req.user.id;

      // Validate ID
      const validation = validators.validateAdminId(providerId);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.message
        });
      }

      // Check if already exists
      const checkResult = await pool.query(
        `SELECT id FROM info_providers_pending WHERE id = $1
         UNION
         SELECT id FROM info_providers WHERE id = $1`,
        [providerId]
      );

      if (checkResult.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'This ID already exists in the system.'
        });
      }

      // Add to pending list
      await pool.query(
        `INSERT INTO info_providers_pending (id, added_by_admin_id, added_method)
         VALUES ($1, $2, 'manual')`,
        [providerId, adminId]
      );

      res.json({
        success: true,
        message: 'Information provider added successfully.'
      });

    } catch (error) {
      console.error('Add provider manual error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to add provider'
      });
    }
  },

  // Upload Excel File
  uploadExcel: async (req, res) => {
    const client = await pool.connect();

    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded. Please select an Excel file.'
        });
      }

      const adminId = req.user.id;

      // Read Excel file
      const workbook = xlsx.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(worksheet);

      if (!data || data.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Excel file is empty.'
        });
      }

      let successful = 0;
      let failed = 0;
      const failedIds = [];

      await client.query('BEGIN');

      // Create batch upload record
      const batchResult = await client.query(
        `INSERT INTO batch_uploads (admin_id, file_name, total_records)
         VALUES ($1, $2, $3) RETURNING id`,
        [adminId, req.file.originalname, data.length]
      );
      const batchId = batchResult.rows[0].id;

      // Process each row
      for (const row of data) {
        // Get ID from row (try different column names)
        let providerId = row.id || row.ID || row.Id || row['ID'];
        
        if (!providerId) {
          failed++;
          failedIds.push({ reason: 'No ID found' });
          continue;
        }

        // Format ID
        providerId = String(providerId).trim().padStart(8, '0');

        // Validate ID
        const validation = validators.validateAdminId(providerId);
        if (!validation.valid) {
          failed++;
          failedIds.push({ id: providerId, reason: validation.message });
          continue;
        }

        try {
          // Check if already exists
          const exists = await client.query(
            `SELECT id FROM info_providers_pending WHERE id = $1
             UNION
             SELECT id FROM info_providers WHERE id = $1`,
            [providerId]
          );

          if (exists.rows.length === 0) {
            // Add to pending list
            await client.query(
              `INSERT INTO info_providers_pending (id, added_by_admin_id, added_method, batch_upload_id)
               VALUES ($1, $2, 'excel_upload', $3)`,
              [providerId, adminId, batchId]
            );
            successful++;
          } else {
            failed++;
            failedIds.push({ id: providerId, reason: 'Already exists' });
          }
        } catch (err) {
          failed++;
          failedIds.push({ id: providerId, reason: err.message });
        }
      }

      // Update batch record
      await client.query(
        `UPDATE batch_uploads 
         SET successful_records = $1, failed_records = $2 
         WHERE id = $3`,
        [successful, failed, batchId]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: `Upload completed. ${successful} added successfully, ${failed} failed.`,
        stats: {
          total: data.length,
          successful,
          failed,
          failedIds: failedIds.slice(0, 10) // Show first 10 failures
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Excel upload error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process Excel file. Please check the file format.'
      });
    } finally {
      client.release();
    }
  },

  // Get Admins List
  getAdmins: async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, full_name, phone_number, email, created_at, last_login 
         FROM admins 
         ORDER BY created_at DESC`
      );

      res.json({
        success: true,
        admins: result.rows
      });

    } catch (error) {
      console.error('Get admins error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to load admin list'
      });
    }
  },

  // Add Admin
  addAdmin: async (req, res) => {
    try {
      const { adminId, fullName, phoneNumber } = req.body;

      // Validate inputs
      const idValidation = validators.validateAdminId(adminId);
      if (!idValidation.valid) {
        return res.status(400).json({
          success: false,
          message: idValidation.message
        });
      }

      const nameValidation = validators.validateFullName(fullName);
      if (!nameValidation.valid) {
        return res.status(400).json({
          success: false,
          message: nameValidation.message
        });
      }

      // Check if admin already exists
      const exists = await pool.query(
        'SELECT id FROM admins WHERE id = $1',
        [adminId]
      );

      if (exists.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Admin with this ID already exists.'
        });
      }

      // Create admin with default password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash('Admin@123', salt);

      await pool.query(
        `INSERT INTO admins (id, full_name, phone_number, password_hash)
         VALUES ($1, $2, $3, $4)`,
        [adminId, fullName, phoneNumber, passwordHash]
      );

      res.json({
        success: true,
        message: 'Admin added successfully. Default password is: Admin@123'
      });

    } catch (error) {
      console.error('Add admin error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to add admin'
      });
    }
  },

  // Delete Pending Provider
  deletePendingProvider: async (req, res) => {
    try {
      const { id } = req.params;

      const result = await pool.query(
        'DELETE FROM info_providers_pending WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Provider not found in pending list.'
        });
      }

      res.json({
        success: true,
        message: 'Provider removed from pending list.'
      });

    } catch (error) {
      console.error('Delete pending provider error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to remove provider'
      });
    }
  }
};

module.exports = adminController;