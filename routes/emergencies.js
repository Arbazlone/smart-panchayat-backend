const express = require('express');
const router = express.Router();
const Emergency = require('../models/Emergency');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// @route   GET /api/emergencies/active
// @desc    Get active emergencies nearby
// @access  Private
router.get('/active', protect, async (req, res) => {
    try {
        const { lat, lng } = req.query;
        
        const query = { status: 'active' };
        
        if (lat && lng) {
            query.location = {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [parseFloat(lng), parseFloat(lat)]
                    },
                    $maxDistance: 5000 // 5km
                }
            };
        }
        
        const emergencies = await Emergency.find(query)
            .populate('user', 'name phone')
            .sort({ createdAt: -1 })
            .limit(10);
        
        // Calculate distance for each
        const emergenciesWithDistance = emergencies.map(emergency => {
            const emergencyObj = emergency.toObject();
            if (lat && lng && emergency.location) {
                emergencyObj.distance = calculateDistance(
                    parseFloat(lat),
                    parseFloat(lng),
                    emergency.location.coordinates[1],
                    emergency.location.coordinates[0]
                );
            }
            return emergencyObj;
        });
        
        res.json({
            success: true,
            emergencies: emergenciesWithDistance
        });
        
    } catch (error) {
        console.error('Active emergencies error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Helper function
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

// @route   POST /api/emergencies
// @desc    Create emergency alert
// @access  Private
router.post('/', protect, async (req, res) => {
    try {
        const { type, description, location, shareLiveLocation } = req.body;
        
        const emergency = await Emergency.create({
            user: req.user.id,
            type,
            description: description || getDefaultMessage(type),
            location: {
                type: 'Point',
                coordinates: [location.longitude, location.latitude],
                address: location.address
            },
            shareLiveLocation,
            status: 'active'
        });
        
        // Notify nearby users via socket
        const io = req.app.get('io');
        if (io) {
            io.to('village-chat').emit('new-emergency', {
                _id: emergency._id,
                type: emergency.type,
                description: emergency.description,
                location: emergency.location
            });
        }
        
        res.status(201).json({
            success: true,
            message: 'Emergency alert sent!',
            emergency
        });
        
    } catch (error) {
        console.error('Create emergency error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   POST /api/emergencies/quick
// @desc    Quick emergency (shake/volume button)
// @access  Private
router.post('/quick', protect, async (req, res) => {
    try {
        const { location } = req.body;
        
        const emergency = await Emergency.create({
            user: req.user.id,
            type: 'other',
            description: 'QUICK EMERGENCY - User needs immediate assistance!',
            location: {
                type: 'Point',
                coordinates: [location.longitude, location.latitude]
            },
            shareLiveLocation: true,
            status: 'active'
        });
        
        const io = req.app.get('io');
        if (io) {
            io.to('village-chat').emit('new-emergency', emergency);
        }
        
        res.status(201).json({
            success: true,
            message: 'Quick emergency sent!',
            emergency
        });
        
    } catch (error) {
        console.error('Quick emergency error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   PUT /api/emergencies/:id/location
// @desc    Update live location
// @access  Private
router.put('/:id/location', protect, async (req, res) => {
    try {
        const { location } = req.body;
        
        const emergency = await Emergency.findOne({
            _id: req.params.id,
            user: req.user.id
        });
        
        if (!emergency) {
            return res.status(404).json({
                success: false,
                message: 'Emergency not found'
            });
        }
        
        emergency.liveLocationUpdates.push({
            coordinates: [location.longitude, location.latitude],
            timestamp: new Date(),
            accuracy: location.accuracy
        });
        
        await emergency.save();
        
        res.json({
            success: true,
            message: 'Location updated'
        });
        
    } catch (error) {
        console.error('Update location error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   PUT /api/emergencies/:id/cancel
// @desc    Cancel emergency
// @access  Private
router.put('/:id/cancel', protect, async (req, res) => {
    try {
        const emergency = await Emergency.findOne({
            _id: req.params.id,
            user: req.user.id
        });
        
        if (!emergency) {
            return res.status(404).json({
                success: false,
                message: 'Emergency not found'
            });
        }
        
        emergency.status = 'cancelled';
        emergency.cancelledAt = new Date();
        await emergency.save();
        
        res.json({
            success: true,
            message: 'Emergency cancelled'
        });
        
    } catch (error) {
        console.error('Cancel emergency error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   GET /api/emergencies/:id/responders
// @desc    Get responders for an emergency
// @access  Private
router.get('/:id/responders', protect, async (req, res) => {
    try {
        const emergency = await Emergency.findById(req.params.id)
            .populate('responders.user', 'name phone profilePic');
        
        if (!emergency) {
            return res.status(404).json({
                success: false,
                message: 'Emergency not found'
            });
        }
        
        res.json({
            success: true,
            responders: emergency.responders
        });
        
    } catch (error) {
        console.error('Get responders error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

function getDefaultMessage(type) {
    const messages = {
        fire: 'FIRE EMERGENCY! Immediate assistance required!',
        medical: 'MEDICAL EMERGENCY! Need immediate medical attention!',
        theft: 'SECURITY ALERT! Suspicious activity reported!',
        other: 'EMERGENCY! User needs immediate assistance!'
    };
    return messages[type] || messages.other;
}

module.exports = router;