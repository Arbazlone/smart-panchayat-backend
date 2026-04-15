const express = require('express');
const router = express.Router();
const Service = require('../models/Service');
const User = require('../models/User');
const Post = require('../models/Post');
const Bid = require('../models/Bid');
const { protect } = require('../middleware/auth');

// Helper function to calculate distance
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// @route   GET /api/services/nearby
// @desc    Get nearby service providers
// @access  Private
router.get('/nearby', protect, async (req, res) => {
    try {
        const { lat, lng } = req.query;
        
        if (!lat || !lng) {
            return res.status(400).json({
                success: false,
                message: 'Location required'
            });
        }
        
        const providers = await User.find({
            isProvider: true,
            'providerDetails.available': true,
            location: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [parseFloat(lng), parseFloat(lat)]
                    },
                    $maxDistance: 10000 // 10km
                }
            }
        })
        .select('name profilePic providerDetails location isVerified')
        .limit(10);
        
        const services = providers.map(provider => {
            const distance = calculateDistance(
                parseFloat(lat), 
                parseFloat(lng),
                provider.location.coordinates[1],
                provider.location.coordinates[0]
            );
            
            return {
                _id: provider._id,
                type: provider.providerDetails.category,
                provider: {
                    name: provider.name,
                    verified: provider.isVerified,
                    profilePic: provider.profilePic
                },
                distance: distance,
                hourlyRate: provider.providerDetails.hourlyRate,
                rating: provider.providerDetails.rating,
                description: provider.providerDetails.description
            };
        });
        
        res.json({
            success: true,
            services
        });
        
    } catch (error) {
        console.error('Nearby services error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   POST /api/services/request
// @desc    Create a service request
// @access  Private
router.post('/request', protect, async (req, res) => {
    try {
        const { serviceType, description, budget, timeline, lat, lng, address } = req.body;
        
        if (!serviceType || !description) {
            return res.status(400).json({
                success: false,
                message: 'Service type and description are required'
            });
        }
        
        const service = await Service.create({
            user: req.user.id,
            serviceType,
            description,
            budget: budget || null,
            timeline: timeline || 'flexible',
            location: {
                type: 'Point',
                coordinates: [parseFloat(lng) || 0, parseFloat(lat) || 0],
                address: address || ''
            },
            status: 'pending'
        });
        
        await service.populate('user', 'name phone');
        
        const io = req.app.get('io');
        if (io) {
            io.to('village-chat').emit('new-service-request', service);
        }
        
        res.status(201).json({
            success: true,
            message: 'Service request created successfully',
            service
        });
        
    } catch (error) {
        console.error('Service request error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   GET /api/services/my-requests
// @desc    Get user's service requests
// @access  Private
router.get('/my-requests', protect, async (req, res) => {
    try {
        const services = await Service.find({ user: req.user.id })
            .populate('provider', 'name profilePic phone')
            .populate('bids.provider', 'name profilePic providerDetails')
            .sort({ createdAt: -1 });
        
        res.json({
            success: true,
            services
        });
        
    } catch (error) {
        console.error('My services error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   GET /api/services/provider-requests
// @desc    Get service requests for provider
// @access  Private
router.get('/provider-requests', protect, async (req, res) => {
    try {
        if (!req.user.isProvider) {
            return res.status(403).json({
                success: false,
                message: 'You are not registered as a service provider'
            });
        }
        
        const services = await Service.find({
            serviceType: req.user.providerDetails.category,
            status: 'pending',
            location: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: req.user.location.coordinates
                    },
                    $maxDistance: (req.user.providerDetails.serviceRadius || 10) * 1000
                }
            }
        })
        .populate('user', 'name phone')
        .sort({ createdAt: -1 });
        
        res.json({
            success: true,
            services
        });
        
    } catch (error) {
        console.error('Provider requests error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   POST /api/services/:id/bid
// @desc    Place a bid on a service request
// @access  Private
router.post('/:id/bid', protect, async (req, res) => {
    try {
        const { amount, message } = req.body;
        
        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid bid amount'
            });
        }
        
        const service = await Service.findById(req.params.id);
        
        if (!service) {
            return res.status(404).json({
                success: false,
                message: 'Service request not found'
            });
        }
        
        if (service.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'This service request is no longer available'
            });
        }
        
        const existingBid = service.bids.find(
            bid => bid.provider.toString() === req.user.id
        );
        
        if (existingBid) {
            return res.status(400).json({
                success: false,
                message: 'You have already placed a bid on this request'
            });
        }
        
        service.bids.push({
            provider: req.user.id,
            amount,
            message: message || '',
            status: 'pending'
        });
        
        await service.save();
        
        res.json({
            success: true,
            message: 'Bid placed successfully'
        });
        
    } catch (error) {
        console.error('Place bid error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   POST /api/services/:id/accept-bid
// @desc    Accept a bid
// @access  Private
router.post('/:id/accept-bid', protect, async (req, res) => {
    try {
        const { bidId } = req.body;
        
        const service = await Service.findById(req.params.id);
        
        if (!service) {
            return res.status(404).json({
                success: false,
                message: 'Service request not found'
            });
        }
        
        if (service.user.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }
        
        const bid = service.bids.id(bidId);
        
        if (!bid) {
            return res.status(404).json({
                success: false,
                message: 'Bid not found'
            });
        }
        
        bid.status = 'accepted';
        service.acceptedBid = bidId;
        service.provider = bid.provider;
        service.status = 'accepted';
        
        await service.save();
        
        res.json({
            success: true,
            message: 'Bid accepted successfully'
        });
        
    } catch (error) {
        console.error('Accept bid error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   POST /api/services/:id/cancel
// @desc    Cancel a service request
// @access  Private
router.post('/:id/cancel', protect, async (req, res) => {
    try {
        const { reason } = req.body;
        
        const service = await Service.findById(req.params.id);
        
        if (!service) {
            return res.status(404).json({
                success: false,
                message: 'Service request not found'
            });
        }
        
        if (service.user.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }
        
        if (service.status === 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Cannot cancel a completed service'
            });
        }
        
        service.status = 'cancelled';
        service.cancelledAt = new Date();
        service.cancellationReason = reason || 'Cancelled by user';
        
        await service.save();
        
        res.json({
            success: true,
            message: 'Service request cancelled'
        });
        
    } catch (error) {
        console.error('Cancel service error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   GET /api/services/:id
// @desc    Get single service details
// @access  Private
router.get('/:id', protect, async (req, res) => {
    try {
        const service = await Service.findById(req.params.id)
            .populate('user', 'name phone profilePic')
            .populate('provider', 'name phone profilePic providerDetails')
            .populate('bids.provider', 'name profilePic providerDetails');
        
        if (!service) {
            return res.status(404).json({
                success: false,
                message: 'Service not found'
            });
        }
        
        res.json({
            success: true,
            service
        });
        
    } catch (error) {
        console.error('Get service error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   POST /api/services/:id/complete
// @desc    Mark a service post as completed (for dashboard posts)
// @access  Private
router.post('/:id/complete', protect, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        
        if (!post) {
            return res.status(404).json({ 
                success: false, 
                message: 'Service post not found' 
            });
        }
        
        // Check if user is the post author
        if (post.author.toString() !== req.user.id) {
            return res.status(403).json({ 
                success: false, 
                message: 'Not authorized' 
            });
        }
        
        // Update post status
        post.serviceStatus = 'completed';
        await post.save();
        
        // Find the accepted bid and mark it as completed
        const bid = await Bid.findOne({ postId: post._id, status: 'accepted' });
        
        if (bid) {
            bid.status = 'completed';
            await bid.save();
            
            // Update provider's helped count
            const provider = await User.findById(bid.providerId);
            if (provider && provider.providerDetails) {
                provider.providerDetails.totalCompleted = (provider.providerDetails.totalCompleted || 0) + 1;
                await provider.save();
            }
        }
        
        res.json({ 
            success: true, 
            message: 'Service marked as completed!',
            assignedProvider: post.assignedProvider
        });
        
    } catch (error) {
        console.error('Complete service error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

module.exports = router;