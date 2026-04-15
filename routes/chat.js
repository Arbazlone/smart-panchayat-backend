const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// @route   GET /api/chat/conversations
// @desc    Get user's conversations
// @access  Private
router.get('/conversations', protect, async (req, res) => {
    try {
        const chats = await Chat.find({
            participants: req.user.id
        })
        .populate('participants', 'name profilePic isVerified')
        .populate('lastMessage')
        .sort({ updatedAt: -1 });
        
        const conversations = chats.map(chat => {
            const otherParticipant = chat.participants.find(
                p => p._id.toString() !== req.user.id
            );
            
            return {
                _id: chat._id,
                participant: otherParticipant || {
                    name: 'Village Community',
                    _id: 'village'
                },
                lastMessage: chat.lastMessage?.content || '',
                lastMessageTime: chat.lastMessage?.createdAt || chat.updatedAt,
                unreadCount: chat.unreadCount?.get(req.user.id) || 0
            };
        });
        
        res.json({
            success: true,
            conversations
        });
        
    } catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   GET /api/chat/village/messages
// @desc    Get village chat messages
// @access  Private
router.get('/village/messages', protect, async (req, res) => {
    try {
        const messages = await Message.find({ chatId: 'village' })
            .populate('sender', 'name profilePic')
            .sort({ createdAt: -1 })
            .limit(50);
        
        res.json({
            success: true,
            messages: messages.reverse()
        });
        
    } catch (error) {
        console.error('Get village messages error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   POST /api/chat/village/send
// @desc    Send message to village chat
// @access  Private
router.post('/village/send', protect, async (req, res) => {
    try {
        const { content, attachment } = req.body;
        
        const message = await Message.create({
            chatId: 'village',
            sender: req.user.id,
            content,
            attachment
        });
        
        await message.populate('sender', 'name profilePic');
        
        // Emit via socket
        const io = req.app.get('io');
        if (io) {
            io.to('village-chat').emit('new-message', message);
        }
        
        res.status(201).json({
            success: true,
            message
        });
        
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   GET /api/chat/:chatId/messages
// @desc    Get messages for a specific chat
// @access  Private
// @route   GET /api/chat/:chatId/messages
// @desc    Get messages for a specific chat
// @access  Private
router.get('/:chatId/messages', protect, async (req, res) => {
    try {
        const messages = await Message.find({ chatId: req.params.chatId })
            .populate('sender', 'name profilePic')
            .sort({ createdAt: 1 });
        
        res.json({
            success: true,
            messages
        });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   POST /api/chat/:chatId/send
// @desc    Send message to a chat
// @access  Private
router.post('/:chatId/send', protect, async (req, res) => {
    try {
        const { content } = req.body;
        const chatId = req.params.chatId;
        
        const message = await Message.create({
            chatId,
            sender: req.user.id,
            content
        });
        
        await message.populate('sender', 'name profilePic');
        
        res.status(201).json({
            success: true,
            message
        });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

module.exports = router;