const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Badge = require('../models/Badge');
const Post = require('../models/Post');
const Bid = require('../models/Bid');
const { protect } = require('../middleware/auth');

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

// Call on startup
initializeBadges().catch(console.error);

// @route   GET /api/badges
// @desc    Get all available badges
// @access  Private
router.get('/', protect, async (req, res) => {
    try {
        const badges = await Badge.find();
        res.json({ success: true, badges });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   GET /api/badges/user/:userId
// @desc    Get user's earned badges
// @access  Private
router.get('/user/:userId', protect, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).populate('badges');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const allBadges = await Badge.find();
        
        // Mark which badges are unlocked
        const badgesWithStatus = allBadges.map(badge => {
            const unlocked = user.badges?.some(b => b._id.equals(badge._id)) || false;
            return {
                ...badge.toObject(),
                unlocked
            };
        });
        
        res.json({ success: true, badges: badgesWithStatus });
    } catch (error) {
        console.error('Get user badges error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   POST /api/badges/check/:userId
// @desc    Check and award badges to user
// @access  Private
router.post('/check/:userId', protect, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const badges = await Badge.find();
        const awardedBadges = [];
        
        for (const badge of badges) {
            const alreadyUnlocked = user.badges?.includes(badge._id);
            if (alreadyUnlocked) continue;
            
            let userValue = 0;
            
            if (badge.requirement.type === 'posts') {
                userValue = await Post.countDocuments({ author: user._id });
            } else if (badge.requirement.type === 'helped') {
                userValue = await Bid.countDocuments({ providerId: user._id, status: 'completed' });
            } else if (badge.requirement.type === 'rating') {
                userValue = user.providerDetails?.rating || 0;
            } else if (badge.requirement.type === 'services_completed') {
                userValue = await Bid.countDocuments({ providerId: user._id, status: 'completed' });
            } else if (badge.requirement.type === 'emergency_responses') {
                userValue = await Post.countDocuments({ 'responders.user': user._id, type: 'emergency' });
            }
            
            if (userValue >= badge.requirement.count) {
                if (!user.badges) user.badges = [];
                user.badges.push(badge._id);
                awardedBadges.push(badge);
            }
        }
        
        if (awardedBadges.length > 0) {
            await user.save();
        }
        
        res.json({ success: true, awarded: awardedBadges });
    } catch (error) {
        console.error('Check badges error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;