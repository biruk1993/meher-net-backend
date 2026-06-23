const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../config/database');

const dirs = ['uploads/images', 'uploads/videos', 'uploads/pdfs', 'uploads/documents'];
dirs.forEach(dir => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); });

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
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext);
  }
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// GET messages
router.get('/messages/:userId', async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const otherUserId = req.params.userId;

    const messages = await pool.query(
      `SELECT * FROM chat_messages
       WHERE (sender_id = $1 AND receiver_id = $2)
          OR (sender_id = $2 AND receiver_id = $1)
       ORDER BY created_at ASC LIMIT 200`,
      [currentUserId, otherUserId]
    );

    await pool.query(
      `UPDATE chat_messages SET is_read = TRUE 
       WHERE sender_id = $1 AND receiver_id = $2 AND is_read = FALSE`,
      [otherUserId, currentUserId]
    );

    res.json({ success: true, messages: messages.rows });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ success: false, message: 'Error loading messages' });
  }
});

// POST send message with file
router.post('/send', upload.single('file'), async (req, res) => {
  try {
    const { receiverId, messageType, messageContent, locationLat, locationLng } = req.body;
    const senderId = req.user.id;

    let fileUrl = null;
    let fileName = null;
    let fileSize = null;

    if (req.file) {
      // Build proper URL path - fix double slash
      let subFolder = '';
      if (req.file.destination.includes('uploads/')) {
        subFolder = req.file.destination.split('uploads/')[1];
      } else {
        subFolder = path.basename(req.file.destination);
      }
      subFolder = subFolder.replace(/\\/g, '/').replace(/\/\//g, '/');
      fileUrl = '/uploads/' + subFolder + '/' + req.file.filename;
      fileUrl = fileUrl.replace(/\/\//g, '/'); // Remove any double slashes
      fileName = req.file.originalname;
      fileSize = req.file.size;
    }

    const finalMessageType = req.file ? 'file' : (messageType || 'text');
    const finalContent = messageContent || '';

    const result = await pool.query(
      `INSERT INTO chat_messages 
       (sender_id, receiver_id, message_type, message_content, file_url, file_name, file_size, location_lat, location_lng)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [senderId, receiverId, finalMessageType, finalContent, 
       fileUrl, fileName, fileSize,
       locationLat || null, locationLng || null]
    );

    const message = result.rows[0];

    // Emit to receiver via socket (not sender - they already have it locally)
    const io = req.app.get('io');
    if (io) {
      io.to(receiverId).emit('new-message', message);
    }

    // Update thread
    const providerId = req.user.role === 'provider' ? senderId : receiverId;
    const adminId = req.user.role === 'admin' ? senderId : receiverId;
    
    let threadMsg = finalContent || '';
    if (req.file) threadMsg = '📎 ' + fileName;
    
    await pool.query(
      `INSERT INTO information_threads (info_provider_id, admin_id, last_message, last_message_time)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (info_provider_id) 
       DO UPDATE SET last_message = $3, last_message_time = CURRENT_TIMESTAMP`,
      [providerId, adminId, threadMsg]
    );

    res.json({ success: true, message });
  } catch (error) {
    console.error('Send error:', error);
    res.status(500).json({ success: false, message: 'Failed to send' });
  }
});

// Clear chat
router.delete('/clear/:userId', async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM chat_messages WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)`,
      [req.user.id, req.params.userId]
    );
    res.json({ success: true, message: 'Chat cleared' });
  } catch (error) {
    console.error('Clear chat error:', error);
    res.status(500).json({ success: false, message: 'Failed to clear' });
  }
});

module.exports = router;
