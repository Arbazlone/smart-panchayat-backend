const express = require('express');
const router = express.Router();
const Bid = require('../models/Bid');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// @route   GET /api/ratings/provider/:providerId
// @desc    Get all ratings for a provider
// @access  Private
router.get('/provider/:providerId', protect, async (req, res) => {
    try {
        const bids = await Bid.find({ 
            providerId: req.params.providerId, 
            status: 'completed',
            'rating.score': { $exists: true }
        })
        .populate('postId', 'title description')
        .sort({ 'rating.createdAt': -1 })
        .limit(20);
        
        const ratings = bids.map(bid => ({
            score: bid.rating.score,
            review: bid.rating.review,
            createdAt: bid.rating.createdAt,
            postTitle: bid.postId?.title || 'Service Request'
        }));
        
        res.json({ success: true, ratings });
    } catch (error) {
        console.error('Get ratings error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   GET /api/ratings/provider/:providerId/stats
// @desc    Get provider rating statistics
// @access  Private
router.get('/provider/:providerId/stats', protect, async (req, res) => {
    try {
        const bids = await Bid.find({ 
            providerId: req.params.providerId, 
            status: 'completed',
            'rating.score': { $exists: true }
        });
        
        const ratings = bids.map(b => b.rating.score);
        const avgRating = ratings.length > 0 
            ? ratings.reduce((a, b) => a + b, 0) / ratings.length 
            : 0;
        
        const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        ratings.forEach(r => distribution[r]++);
        
        res.json({
            success: true,
            stats: {
                average: avgRating,
                total: ratings.length,
                distribution
            }
        });
    } catch (error) {
        console.error('Get rating stats error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   POST /api/ratings/:bidId
// @desc    Submit a rating for a completed service
// @access  Private
router.post('/:bidId', protect, async (req, res) => {
    try {
        const { score, review } = req.body;
        
        if (!score || score < 1 || score > 5) {
            return res.status(400).json({ success: false, message: 'Rating must be 1-5' });
        }
        
        const bid = await Bid.findById(req.params.bidId);
        if (!bid) {
            return res.status(404).json({ success: false, message: 'Bid not found' });
        }
        
        if (bid.status !== 'completed') {
            return res.status(400).json({ success: false, message: 'Service must be completed first' });
        }
        
        if (bid.rating) {
            return res.status(400).json({ success: false, message: 'Already rated' });
        }
        
        bid.rating = { score, review, createdAt: new Date() };
        await bid.save();
        
        // Update provider's average rating
        const provider = await User.findById(bid.providerId);
        if (provider) {
            const allBids = await Bid.find({ providerId: bid.providerId, 'rating.score': { $exists: true } });
            const avg = allBids.reduce((sum, b) => sum + b.rating.score, 0) / allBids.length;
            
            if (!provider.providerDetails) provider.providerDetails = {};
            provider.providerDetails.rating = avg;
            provider.providerDetails.totalReviews = allBids.length;
            await provider.save();
        }
        
        res.json({ success: true, message: 'Rating submitted!' });
    } catch (error) {
        console.error('Submit rating error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;