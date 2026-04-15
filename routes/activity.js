const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const Bid = require('../models/Bid');
const { protect } = require('../middleware/auth');

// @route   GET /api/activity/user/:userId
// @desc    Get user's recent activity
// @access  Private
router.get('/user/:userId', protect, async (req, res) => {
    try {
        const userId = req.params.userId;
        const activities = [];
        
        // Get user's recent posts
        const posts = await Post.find({ author: userId })
            .sort({ createdAt: -1 })
            .limit(10);
        
        posts.forEach(post => {
            activities.push({
                type: 'post',
                title: post.title || 'Untitled',
                description: post.description?.substring(0, 50),
                createdAt: post.createdAt,
                postId: post._id
            });
        });
        
        // Get user's recent bids/offers
        const bids = await Bid.find({ providerId: userId })
            .populate('postId', 'title')
            .sort({ createdAt: -1 })
            .limit(10);
        
        bids.forEach(bid => {
            activities.push({
                type: 'offer',
                description: `Offered ₹${bid.amount} for "${bid.postId?.title || 'service'}"`,
                createdAt: bid.createdAt,
                bidId: bid._id
            });
        });
        
        // Get completed services
        const completedBids = await Bid.find({ providerId: userId, status: 'completed' })
            .populate('postId', 'title')
            .sort({ updatedAt: -1 })
            .limit(5);
        
        completedBids.forEach(bid => {
            if (bid.rating) {
                activities.push({
                    type: 'rating',
                    rating: bid.rating.score,
                    review: bid.rating.review,
                    createdAt: bid.rating.createdAt,
                    badgeName: null
                });
            } else {
                activities.push({
                    type: 'service',
                    description: `Completed "${bid.postId?.title || 'service'}"`,
                    createdAt: bid.updatedAt
                });
            }
        });
        
        // Sort all activities by date
        activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        res.json({ 
            success: true, 
            activity: activities.slice(0, 20) 
        });
    } catch (error) {
        console.error('Get activity error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;