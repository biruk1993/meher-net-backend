const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const chatController = require('../controllers/chatController');

// Configure multer for chat file uploads
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
    cb(null, `${Date.now()}_${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Get messages
router.get('/messages/:userId', chatController.getMessages);

// Send message
router.post('/send', upload.single('file'), chatController.sendMessage);

// Clear chat
router.delete('/clear/:userId', chatController.clearChat);

// Mark message as read
router.put('/read/:messageId', chatController.markAsRead);

module.exports = router;
