const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure directories exist
const dirs = ['uploads/images', 'uploads/videos', 'uploads/pdfs', 'uploads/documents', 'uploads/excel'];
dirs.forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = 'uploads/';
    if (file.mimetype.startsWith('image/')) folder += 'images/';
    else if (file.mimetype.startsWith('video/')) folder += 'videos/';
    else if (file.mimetype === 'application/pdf') folder += 'pdfs/';
    else folder += 'documents/';
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.bin';
    cb(null, Date.now() + '_' + Math.random().toString(36).substr(2, 5) + ext);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

router.post('/file', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  const fileUrl = '/uploads/' + path.basename(req.file.destination) + '/' + req.file.filename;
  
  res.json({
    success: true,
    fileUrl: fileUrl,
    fileName: req.file.originalname,
    fileSize: req.file.size,
    fileType: req.file.mimetype
  });
});

module.exports = router;
