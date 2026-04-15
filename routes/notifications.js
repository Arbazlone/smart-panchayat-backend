const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const User = require('../models/User');
const Badge = require('../models/Badge');
const Post = require('../models/Post');      // ← ADDED
const Bid = require('../models/Bid');        // ← ADDED
const { protect } = require('../middleware/auth');

// Get user notifications
router.get('/', protect, async (req, res) => {
    try {
        const notifications = await Notification.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .limit(50);
        
        res.json({ success: true, notifications });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get unread count
router.get('/unread', protect, async (req, res) => {
    try {
        const count = await Notification.countDocuments({ userId: req.user.id, read: false });
        res.json({ success: true, count });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Mark as read
router.put('/:id/read', protect, async (req, res) => {
    try {
        await Notification.findByIdAndUpdate(req.params.id, { read: true });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Mark all as read
router.put('/read-all', protect, async (req, res) => {
    try {
        await Notification.updateMany({ userId: req.user.id, read: false }, { read: true });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Helper function to create notification
const createNotification = async (userId, type, title, message, data = {}) => {
    try {
        await Notification.create({ userId, type, title, message, data });
    } catch (error) {
        console.error('Error creating notification:', error);
    }
};

// Initialize default badges
const initializeBadges = async () => {
    const defaultBadges = [
        { name: 'First Post', description: 'Created your first post', icon: '📝', requirement: { type: 'posts', count: 1 } },
        { name: 'Active Contributor', description: 'Created 10 posts', icon: '📰', requirement: { type: 'posts', count: 10 } },
        { name: 'Helper', description: 'Helped 5 people', icon: '🤝', requirement: { type: 'helped', count: 5 } },
        { name: 'Super Helper', description: 'Helped 20 people', icon: '🦸', requirement: { type: 'helped', count: 20 } },
        { name: 'Rising Star', description: 'Maintained 4.5+ rating', icon: '⭐', requirement: { type: 'rating', count: 4.5 } },
        { name: 'Service Pro', description: 'Completed 10 services', icon: '🔧', requirement: { type: 'services_completed', count: 10 } },
        { name: 'First Responder', description: 'Responded to 5 emergencies', icon: '🚨', requirement: { type: 'emergency_responses', count: 5 } }
    ];
    
    for (const badge of defaultBadges) {
        await Badge.findOneAndUpdate({ name: badge.name }, badge, { upsert: true });
    }
    console.log('✅ Badges initialized');
};

// Check and unlock badges
async function checkAndUnlockBadges(userId, type) {
    try {
        const user = await User.findById(userId);
        const badges = await Badge.find({ 'requirement.type': type });
        
        for (const badge of badges) {
            const alreadyUnlocked = user.badges?.includes(badge._id);
            if (alreadyUnlocked) continue;
            
            let userValue = 0;
            if (type === 'posts') userValue = await Post.countDocuments({ author: userId });
            else if (type === 'helped') userValue = await Bid.countDocuments({ providerId: userId, status: 'completed' });
            else if (type === 'rating') userValue = user.providerDetails?.rating || 0;
            else if (type === 'services_completed') userValue = await Bid.countDocuments({ providerId: userId, status: 'completed' });
            
            if (userValue >= badge.requirement.count) {
                if (!user.badges) user.badges = [];
                user.badges.push(badge._id);
                await user.save();
                
                await createNotification(userId, 'badge_unlocked', '🏆 Badge Unlocked!', 
                    `You earned the "${badge.name}" badge: ${badge.description}`);
            }
        }
    } catch (error) {
        console.error('Error checking badges:', error);
    }
}

// Get user badges
router.get('/badges/:userId?', protect, async (req, res) => {
    try {
        const userId = req.params.userId || req.user.id;
        const user = await User.findById(userId).populate('badges');
        res.json({ success: true, badges: user.badges || [] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Initialize badges on startup
initializeBadges().catch(console.error);

// Export everything
module.exports = { router, createNotification, checkAndUnlockBadges };