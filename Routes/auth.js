const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Admin Login
router.post('/admin/login', authController.adminLogin);

// Check Provider ID
router.get('/check-provider/:id', authController.checkProviderId);

// Provider Registration
router.post('/provider/register', authController.providerRegister);

// Provider Login
router.post('/provider/login', authController.providerLogin);

module.exports = router;