const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const adminController = require('../controllers/adminController');

// Configure multer for Excel uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/excel/');
  },
  filename: (req, file, cb) => {
    cb(null, `excel_${Date.now()}.xlsx`);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.includes('spreadsheet') || file.mimetype.includes('excel')) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed'), false);
    }
  }
});

// Dashboard
router.get('/dashboard', adminController.getDashboard);

// Providers
router.get('/providers/pending', adminController.getPendingProviders);
router.get('/providers/registered', adminController.getRegisteredProviders);
router.post('/providers/add-manual', adminController.addProviderManual);
router.post('/providers/upload-excel', upload.single('excelFile'), adminController.uploadExcel);
router.delete('/providers/pending/:id', adminController.deletePendingProvider);

// Admins
router.get('/admins', adminController.getAdmins);
router.post('/add-admin', adminController.addAdmin);

module.exports = router;
