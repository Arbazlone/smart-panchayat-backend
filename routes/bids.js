const express = require('express');
const router = express.Router();
const Bid = require('../models/Bid');
const Post = require('../models/Post');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { createNotification, checkAndUnlockBadges } = require('./notifications');

// @route   POST /api/bids
// @desc    Submit a bid/offer on a post
// @access  Private (Providers only)
router.post('/', protect, async (req, res) => {
    try {
        const { postId, amount, message, timeline } = req.body;
        
        if (!req.user.isProvider) {
            return res.status(403).json({
                success: false,
                message: 'Only service providers can submit offers'
            });
        }
        
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }
        
        if (post.type !== 'service') {
            return res.status(400).json({ success: false, message: 'Can only bid on service requests' });
        }
        
        const existingBid = await Bid.findOne({ postId, providerId: req.user.id });
        if (existingBid) {
            return res.status(400).json({ success: false, message: 'You have already submitted an offer' });
        }
        
        const bid = await Bid.create({ postId, providerId: req.user.id, amount, message, timeline });
        await bid.populate('providerId', 'name phone profilePic providerDetails');
        
        // NOTIFY POST AUTHOR
        await createNotification(
            post.author,
            'offer_received',
            '📬 New Offer Received!',
            `${req.user.name} offered ₹${amount} for your service request.`,
            { postId, bidId: bid._id }
        );
        
        res.status(201).json({ success: true, message: 'Offer submitted successfully', bid });
        
    } catch (error) {
        console.error('Submit bid error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   PUT /api/bids/:bidId/accept
// @desc    Accept a bid (post author only)
// @access  Private
router.put('/:bidId/accept', protect, async (req, res) => {
    try {
        const bid = await Bid.findById(req.params.bidId);
        if (!bid) {
            return res.status(404).json({ success: false, message: 'Offer not found' });
        }
        
        const post = await Post.findById(bid.postId);
        if (post.author.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Only post author can accept offers' });
        }
        
        // Reject other bids
        await Bid.updateMany({ postId: bid.postId, _id: { $ne: bid._id } }, { status: 'rejected' });
        
        // Accept this bid
        bid.status = 'accepted';
        await bid.save();
        
        post.assignedProvider = bid.providerId;
        post.serviceStatus = 'assigned';
        await post.save();
        
        // ✅ NOTIFY ACCEPTED PROVIDER
        await createNotification(
            bid.providerId,
            'offer_accepted',
            '🎉 Offer Accepted!',
            `Your offer of ₹${bid.amount} was accepted! Contact the customer.`,
            { postId: bid.postId, bidId: bid._id }
        );
        
        // ✅ NOTIFY REJECTED PROVIDERS
        const otherBids = await Bid.find({ postId: bid.postId, _id: { $ne: bid._id } });
        for (const otherBid of otherBids) {
            await createNotification(
                otherBid.providerId,
                'offer_rejected',
                'Offer Not Selected',
                `Your offer of ₹${otherBid.amount} was not selected this time.`
            );
        }
        
        res.json({ success: true, message: 'Offer accepted successfully', bid });
        
    } catch (error) {
        console.error('Accept bid error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   PUT /api/bids/:bidId/complete
// @desc    Mark service as completed (post author only)
// @access  Private
router.put('/:bidId/complete', protect, async (req, res) => {
    try {
        const bid = await Bid.findById(req.params.bidId);
        if (!bid) {
            return res.status(404).json({ success: false, message: 'Offer not found' });
        }
        
        const post = await Post.findById(bid.postId);
        if (post.author.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Only post author can complete' });
        }
        
        if (bid.status !== 'accepted') {
            return res.status(400).json({ success: false, message: 'Offer must be accepted first' });
        }
        
        bid.status = 'completed';
        await bid.save();
        
        post.serviceStatus = 'completed';
        await post.save();
        
        // Notify provider
        await createNotification(
            bid.providerId,
            'service_completed',
            '✅ Service Completed!',
            `The service has been marked as completed. You can now receive a rating!`,
            { postId: bid.postId, bidId: bid._id }
        );
        
        res.json({ success: true, message: 'Service marked as completed!' });
        
    } catch (error) {
        console.error('Complete bid error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   POST /api/bids/:bidId/rate
// @desc    Rate a completed service
// @access  Private
router.post('/:bidId/rate', protect, async (req, res) => {
    try {
        const { rating, review } = req.body;
        
        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, message: 'Rating must be between 1-5' });
        }
        
        const bid = await Bid.findById(req.params.bidId);
        if (!bid) {
            return res.status(404).json({ success: false, message: 'Offer not found' });
        }
        
        const post = await Post.findById(bid.postId);
        if (post.author.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Only post author can rate' });
        }
        
        if (bid.status !== 'completed') {
            return res.status(400).json({ success: false, message: 'Service must be completed first' });
        }
        
        if (bid.rating) {
            return res.status(400).json({ success: false, message: 'Already rated' });
        }
        
        const provider = await User.findById(bid.providerId);
        if (!provider.providerDetails) {
            provider.providerDetails = { rating: 0, totalReviews: 0 };
        }
        
        const currentRating = provider.providerDetails.rating || 0;
        const currentReviews = provider.providerDetails.totalReviews || 0;
        
        provider.providerDetails.rating = ((currentRating * currentReviews) + rating) / (currentReviews + 1);
        provider.providerDetails.totalReviews = currentReviews + 1;
        await provider.save();
        
        bid.rating = { score: rating, review, createdAt: new Date() };
        await bid.save();
        
        // Check for badge unlock
        await checkAndUnlockBadges(provider._id, 'services_completed');
        await checkAndUnlockBadges(provider._id, 'rating');
        
        // Notify provider
        await createNotification(
            bid.providerId,
            'new_rating',
            '⭐ New Rating Received!',
            `You received a ${rating}⭐ rating for your service!`,
            { rating, review }
        );
        
        res.json({ success: true, message: 'Rating submitted!' });
        
    } catch (error) {
        console.error('Rate bid error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   GET /api/bids/post/:postId
// @desc    Get all bids for a post
// @access  Private
router.get('/post/:postId', protect, async (req, res) => {
    try {
        const post = await Post.findById(req.params.postId);
        if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
        
        if (post.author.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Only post author can view offers' });
        }
        
        const bids = await Bid.find({ postId: req.params.postId })
            .populate('providerId', 'name phone profilePic providerDetails')
            .sort({ createdAt: -1 });
        
        res.json({ success: true, bids });
        
    } catch (error) {
        console.error('Get bids error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   GET /api/bids/my-offers
// @desc    Get provider's offers
// @access  Private
router.get('/my-offers', protect, async (req, res) => {
    try {
        const bids = await Bid.find({ providerId: req.user.id })
            .populate('postId', 'title description budget serviceType location author')
            .sort({ createdAt: -1 });
        
        res.json({ success: true, bids });
        
    } catch (error) {
        console.error('Get my offers error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   GET /api/bids/check/:postId
// @desc    Check if user has bid on a post
// @access  Private
router.get('/check/:postId', protect, async (req, res) => {
    try {
        const bid = await Bid.findOne({ postId: req.params.postId, providerId: req.user.id });
        res.json({ success: true, hasBid: !!bid, bid });
    } catch (error) {
        console.error('Check bid error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;