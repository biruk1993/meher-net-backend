const { pool } = require('../config/database');
const validators = require('../utils/validators');

const chatController = {

  // Get Messages Between Users
  getMessages: async (req, res) => {
    try {
      const currentUserId = req.user.id;
      const otherUserId = req.params.userId;

      // Validate user ID
      const validation = validators.validateAdminId(otherUserId);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user ID'
        });
      }

      // Get messages with limit
      const messages = await pool.query(
        `SELECT * FROM chat_messages
         WHERE (sender_id = $1 AND receiver_id = $2)
            OR (sender_id = $2 AND receiver_id = $1)
         ORDER BY created_at ASC
         LIMIT 200`,
        [currentUserId, otherUserId]
      );

      // Mark messages as read
      await pool.query(
        `UPDATE chat_messages 
         SET is_read = TRUE 
         WHERE sender_id = $1 AND receiver_id = $2 AND is_read = FALSE`,
        [otherUserId, currentUserId]
      );

      // Get or create thread
      let thread = await pool.query(
        'SELECT * FROM information_threads WHERE info_provider_id = $1',
        [req.user.role === 'provider' ? currentUserId : otherUserId]
      );

      if (thread.rows.length === 0) {
        thread = await pool.query(
          `INSERT INTO information_threads (info_provider_id, admin_id)
           VALUES ($1, $2) 
           ON CONFLICT DO NOTHING 
           RETURNING *`,
          [
            req.user.role === 'provider' ? currentUserId : otherUserId,
            req.user.role === 'admin' ? currentUserId : otherUserId
          ]
        );
      }

      res.json({
        success: true,
        messages: messages.rows,
        thread: thread.rows[0] || null
      });

    } catch (error) {
      console.error('Get messages error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to load messages'
      });
    }
  },

  // Send Message
  sendMessage: async (req, res) => {
    try {
      const { 
        receiverId, 
        messageType = 'text', 
        messageContent = '', 
        locationLat, 
        locationLng 
      } = req.body;
      
      const senderId = req.user.id;

      // Validate receiver ID
      const validation = validators.validateAdminId(receiverId);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: 'Invalid receiver ID'
        });
      }

      // Validate message content
      if (!messageContent && !req.file) {
        return res.status(400).json({
          success: false,
          message: 'Message content or file is required'
        });
      }

      let fileUrl = null;
      let fileName = null;
      let fileSize = null;

      // Handle file upload
      if (req.file) {
        fileUrl = `/uploads/${req.file.filename}`;
        fileName = validators.sanitizeInput(req.file.originalname);
        fileSize = req.file.size;
      }

      // Sanitize message content
      const sanitizedContent = validators.sanitizeInput(messageContent);

      // Insert message
      const result = await pool.query(
        `INSERT INTO chat_messages 
         (sender_id, receiver_id, message_type, message_content, 
          file_url, file_name, file_size, location_lat, location_lng)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          senderId, 
          receiverId, 
          messageType, 
          sanitizedContent, 
          fileUrl, 
          fileName, 
          fileSize,
          locationLat || null,
          locationLng || null
        ]
      );

      const message = result.rows[0];

      // Update thread
      await pool.query(
        `UPDATE information_threads 
         SET last_message = $1, 
             last_message_time = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE (info_provider_id = $2 AND admin_id = $3)
            OR (info_provider_id = $3 AND admin_id = $2)`,
        [sanitizedContent || 'File attached', senderId, receiverId]
      );

      // Emit via Socket.IO
      const io = req.app.get('io');
      if (io) {
        io.to(receiverId).emit('new-message', message);
        io.to(senderId).emit('message-sent', message);
      }

      res.json({
        success: true,
        message
      });

    } catch (error) {
      console.error('Send message error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send message'
      });
    }
  },

  // Clear Chat
  clearChat: async (req, res) => {
    const client = await pool.connect();

    try {
      const currentUserId = req.user.id;
      const otherUserId = req.params.userId;

      // Validate user ID
      const validation = validators.validateAdminId(otherUserId);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user ID'
        });
      }

      await client.query('BEGIN');

      // Delete messages
      await client.query(
        `DELETE FROM chat_messages
         WHERE (sender_id = $1 AND receiver_id = $2)
            OR (sender_id = $2 AND receiver_id = $1)`,
        [currentUserId, otherUserId]
      );

      // Update thread
      await client.query(
        `UPDATE information_threads 
         SET last_message = 'Chat cleared',
             last_message_time = CURRENT_TIMESTAMP
         WHERE (info_provider_id = $1 AND admin_id = $2)
            OR (info_provider_id = $2 AND admin_id = $1)`,
        [currentUserId, otherUserId]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Chat cleared successfully'
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Clear chat error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to clear chat'
      });
    } finally {
      client.release();
    }
  },

  // Mark Message as Read
  markAsRead: async (req, res) => {
    try {
      const { messageId } = req.params;

      await pool.query(
        'UPDATE chat_messages SET is_read = TRUE WHERE id = $1',
        [messageId]
      );

      res.json({
        success: true,
        message: 'Message marked as read'
      });

    } catch (error) {
      console.error('Mark as read error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark message as read'
      });
    }
  }
};

module.exports = chatController;