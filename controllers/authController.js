const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const validators = require('../utils/validators');

const authController = {
  
  // Admin Login
  adminLogin: async (req, res) => {
    try {
      const { id, password } = req.body;

      // Validate input
      const validation = validators.validateLoginData({ id, password });
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.message
        });
      }

      // Check if admin exists
      const result = await pool.query(
        'SELECT * FROM admins WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'You are not assigned as admin. Please contact your superior or try on the mobile app as information provider.'
        });
      }

      const admin = result.rows[0];

      // Verify password
      const validPassword = await bcrypt.compare(password, admin.password_hash);
      if (!validPassword) {
        return res.status(401).json({
          success: false,
          message: 'Invalid password'
        });
      }

      // Update last login
      await pool.query(
        'UPDATE admins SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
        [id]
      );

      // Generate token
      const token = jwt.sign(
        { id: admin.id, role: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        success: true,
        token,
        admin: {
          id: admin.id,
          fullName: admin.full_name,
          phoneNumber: admin.phone_number
        }
      });

    } catch (error) {
      console.error('Admin login error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  },

  // Check Provider ID
  checkProviderId: async (req, res) => {
    try {
      const { id } = req.params;

      const validation = validators.validateAdminId(id);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.message
        });
      }

      // Check in pending list
      const pendingResult = await pool.query(
        'SELECT * FROM info_providers_pending WHERE id = $1',
        [id]
      );

      if (pendingResult.rows.length === 0) {
        return res.json({
          exists: false,
          message: 'You are not in the list of information providers. Please contact the admin at 0916641280.'
        });
      }

      // Check if already registered
      const registeredResult = await pool.query(
        'SELECT * FROM info_providers WHERE id = $1',
        [id]
      );

      if (registeredResult.rows.length > 0) {
        return res.json({
          exists: false,
          message: 'This ID is already registered.'
        });
      }

      res.json({
        exists: true,
        message: 'ID verified. You can proceed with registration.'
      });

    } catch (error) {
      console.error('Check provider error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  },

  // Provider Registration
  providerRegister: async (req, res) => {
    const client = await pool.connect();

    try {
      const { id, fullName, phoneNumber, unitDepartment, password } = req.body;

      // Validate all fields
      const validation = validators.validateRegistrationData(req.body);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.message
        });
      }

      // Check if ID is in pending list
      const pendingCheck = await client.query(
        'SELECT * FROM info_providers_pending WHERE id = $1',
        [id]
      );

      if (pendingCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'You are not in the list of information providers. Please contact the admin at 0916641280.'
        });
      }

      // Check phone number uniqueness
      const phoneCheck = await client.query(
        'SELECT * FROM info_providers WHERE phone_number = $1',
        [phoneNumber]
      );

      if (phoneCheck.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'This phone number is already registered.'
        });
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // Start transaction
      await client.query('BEGIN');

      // Register provider
      await client.query(
        `INSERT INTO info_providers 
         (id, full_name, phone_number, unit_department, password_hash)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, fullName, phoneNumber, unitDepartment, passwordHash]
      );

      // Remove from pending list
      await client.query(
        'DELETE FROM info_providers_pending WHERE id = $1',
        [id]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Registration successful! Please login to continue.'
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Registration failed. Please try again.'
      });
    } finally {
      client.release();
    }
  },

  // Provider Login
  providerLogin: async (req, res) => {
    try {
      const { id, password } = req.body;

      // Validate input
      const validation = validators.validateLoginData({ id, password });
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.message
        });
      }

      // Find provider
      const result = await pool.query(
        'SELECT * FROM info_providers WHERE id = $1 AND status = $2',
        [id, 'active']
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials or account is inactive.'
        });
      }

      const provider = result.rows[0];

      // Verify password
      const validPassword = await bcrypt.compare(password, provider.password_hash);
      if (!validPassword) {
        return res.status(401).json({
          success: false,
          message: 'Invalid password.'
        });
      }

      // Update last login
      await pool.query(
        'UPDATE info_providers SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
        [id]
      );

      // Generate token
      const token = jwt.sign(
        { id: provider.id, role: 'provider' },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        success: true,
        token,
        provider: {
          id: provider.id,
          fullName: provider.full_name,
          phoneNumber: provider.phone_number,
          unitDepartment: provider.unit_department
        }
      });

    } catch (error) {
      console.error('Provider login error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
};

module.exports = authController;