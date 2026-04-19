const Bid = require('../models/Bid');
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Post = require('../models/Post');
const { protect } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');

// Configure multer for profile pictures - USE MEMORY STORAGE
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        console.log('📸 File upload attempt:', file.originalname, file.mimetype);
        const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            console.log('❌ Rejected file type:', file.mimetype);
            cb(new Error('Only image files (JPEG, PNG, GIF, WEBP) are allowed'), false);
        }
    }
});
// @route   GET /api/users/directory
// @desc    Get all users for directory
// @access  Private
router.get('/directory', protect, async (req, res) => {
    try {
        const users = await User.find()
            .select('name phone email role isProvider isVerified profilePic location providerDetails createdAt')
            .lean();
        
        // Add stats for each user
        for (let user of users) {
            user.stats = {
                posts: await Post.countDocuments({ author: user._id }),
                helped: await Bid.countDocuments({ providerId: user._id, status: 'completed' })
            };
            user.online = Math.random() > 0.5; // Replace with real online status
        }
        
        res.json({ success: true, users });
    } catch (error) {
        console.error('Directory error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   GET /api/users/profile
// @desc    Get current user profile
// @access  Private
router.get('/profile', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .select('-password -otp');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        // Get user stats
        const postsCount = await Post.countDocuments({ author: req.user.id });
        const helpedCount = await Post.countDocuments({ 
            'responders.user': req.user.id 
        });
        
        const profile = user.toObject();
        profile.stats = {
            posts: postsCount,
            helped: helpedCount,
            rating: user.providerDetails?.rating || 0,
            reviews: user.providerDetails?.totalReviews || 0
        };
        profile.memberSince = user.createdAt.toLocaleDateString('en-US', { 
            month: 'long', 
            year: 'numeric' 
        });
        
        res.json(profile);
        
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});
// @route   GET /api/users/profile/:userId
// @desc    Get user profile by ID (public view)
// @access  Private
router.get('/profile/:userId', protect, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId)
            .select('-password -otp');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        // Get user stats
        const postsCount = await Post.countDocuments({ author: user._id });
        const helpedCount = await Bid.countDocuments({ providerId: user._id, status: 'completed' });
        
        const profile = user.toObject();
        profile.stats = {
            posts: postsCount,
            helped: helpedCount,
            rating: user.providerDetails?.rating || 0,
            reviews: user.providerDetails?.totalReviews || 0
        };
        profile.memberSince = user.createdAt.toLocaleDateString('en-US', { 
            month: 'long', 
            year: 'numeric' 
        });
        
        res.json(profile);
        
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', protect, async (req, res) => {
    try {
        const { name, email, bio } = req.body;
        
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        if (name) user.name = name;
        if (email !== undefined) user.email = email;
        if (bio !== undefined) user.bio = bio;
        
        await user.save();
        
        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                bio: user.bio,
                phone: user.phone,
                profilePic: user.profilePic
            }
        });
        
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   POST /api/users/avatar
// @desc    Upload profile picture (Base64 storage)
// @access  Private
router.post('/avatar', protect, upload.single('avatar'), async (req, res) => {
    try {
        console.log('📸 Avatar upload request received');
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No image uploaded'
            });
        }
        
        // Convert buffer to base64
        const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        
        const user = await User.findById(req.user.id);
        user.profilePic = base64Image; // Store base64 directly in database
        await user.save();
        
        console.log('✅ Profile picture saved to database');
        
        res.json({
            success: true,
            message: 'Profile picture updated',
            profilePic: base64Image
        });
        
    } catch (error) {
        console.error('❌ Avatar upload error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error'
        });
    }
});

// @route   PUT /api/users/bio
// @desc    Update user bio
// @access  Private
router.put('/bio', protect, async (req, res) => {
    try {
        const { bio } = req.body;
        
        if (bio && bio.length > 500) {
            return res.status(400).json({
                success: false,
                message: 'Bio cannot exceed 500 characters'
            });
        }
        
        const user = await User.findById(req.user.id);
        user.bio = bio;
        await user.save();
        
        res.json({
            success: true,
            message: 'Bio updated successfully'
        });
        
    } catch (error) {
        console.error('Update bio error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   POST /api/users/change-password
// @desc    Change user password
// @access  Private
router.post('/change-password', protect, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Please provide current and new password'
            });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters'
            });
        }
        
        const user = await User.findById(req.user.id);
        
        const isMatch = await user.comparePassword(currentPassword);
        
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }
        
        user.password = newPassword;
        await user.save();
        
        res.json({
            success: true,
            message: 'Password changed successfully'
        });
        
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   GET /api/users/stats
// @desc    Get user stats
// @access  Private
router.get('/stats', protect, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Count posts
        const postsCount = await Post.countDocuments({ author: userId });
        
        // Count people helped (completed services as provider)
        const Bid = require('../models/Bid');
        const helpedCount = await Bid.countDocuments({ 
            providerId: userId, 
            status: 'completed' 
        });
        
        // Get user rating
        const user = await User.findById(userId);
        const rating = user.providerDetails?.rating || 0;
        const totalReviews = user.providerDetails?.totalReviews || 0;
        
        res.json({
            success: true,
            posts: postsCount,
            helped: helpedCount,
            rating: rating,
            reviews: totalReviews
        });
        
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   POST /api/users/become-provider
// @desc    Register as service provider
// @access  Private
router.post('/become-provider', protect, async (req, res) => {
    try {
        const { category, experience, hourlyRate, description, radius, available } = req.body;
        
        if (!category || !description) {
            return res.status(400).json({
                success: false,
                message: 'Category and description are required'
            });
        }
        
        const user = await User.findById(req.user.id);
        
        user.isProvider = true;
        user.role = 'provider';
        user.providerDetails = {
            category,
            experience: experience || 0,
            hourlyRate: hourlyRate || 0,
            description,
            serviceRadius: radius || 10,
            available: available || false,
            rating: user.providerDetails?.rating || 0,
            totalReviews: user.providerDetails?.totalReviews || 0
        };
        
        await user.save();
        
        res.json({
            success: true,
            message: 'Successfully registered as service provider',
            providerDetails: user.providerDetails
        });
        
    } catch (error) {
        console.error('Become provider error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   POST /api/users/remove-provider
// @desc    Remove service provider status
// @access  Private
router.post('/remove-provider', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        user.isProvider = false;
        user.role = 'user';
        
        await user.save();
        
        res.json({
            success: true,
            message: 'Service provider status removed'
        });
        
    } catch (error) {
        console.error('Remove provider error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   GET /api/users/posts
// @desc    Get user's posts
// @access  Private
router.get('/posts', protect, async (req, res) => {
    try {
        const posts = await Post.find({ author: req.user.id })
            .sort({ createdAt: -1 });
        
        res.json({
            success: true,
            posts
        });
        
    } catch (error) {
        console.error('Get user posts error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   GET /api/users/services
// @desc    Get user's service requests
// @access  Private
router.get('/services', protect, async (req, res) => {
    try {
        const Service = require('../models/Service');
        
        const services = await Service.find({ user: req.user.id })
            .populate('provider', 'name profilePic')
            .sort({ createdAt: -1 });
        
        res.json({
            success: true,
            services
        });
        
    } catch (error) {
        console.error('Get user services error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   GET /api/users/search
// @desc    Search users by name or phone
// @access  Private
router.get('/search', protect, async (req, res) => {
    try {
        const { q } = req.query;
        
        if (!q || q.length < 2) {
            return res.json({ success: true, users: [] });
        }
        
        const users = await User.find({
            $and: [
                { _id: { $ne: req.user.id } },
                {
                    $or: [
                        { name: { $regex: q, $options: 'i' } },
                        { phone: { $regex: q, $options: 'i' } }
                    ]
                }
            ]
        })
        .select('name phone profilePic isVerified')
        .limit(10);
        
        res.json({
            success: true,
            users
        });
        
    } catch (error) {
        console.error('Search users error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});
// @route   PUT /api/users/contact
// @desc    Update user contact information
// @access  Private
router.put('/contact', protect, async (req, res) => {
    try {
        const { alternatePhone, email, address } = req.body;
        
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        if (email !== undefined) user.email = email;
        if (alternatePhone !== undefined) user.alternatePhone = alternatePhone;
        if (address !== undefined) user.address = address;
        
        await user.save();
        
        res.json({ 
            success: true, 
            message: 'Contact information updated',
            user: {
                email: user.email,
                alternatePhone: user.alternatePhone,
                address: user.address
            }
        });
    } catch (error) {
        console.error('Update contact error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});
// @route   DELETE /api/users/:id
// @desc    Delete user (Admin only)
// @access  Private
router.delete('/:id', protect, async (req, res) => {
    try {
        // 🔐 ADMIN CHECK
        if (req.user.role !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                message: 'Access denied' 
            });
        }

        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        // ❌ Prevent deleting yourself (optional safety)
        if (user._id.toString() === req.user.id) {
            return res.status(400).json({ 
                success: false, 
                message: 'You cannot delete yourself' 
            });
        }

        await User.findByIdAndDelete(req.params.id);

        res.json({ 
            success: true, 
            message: 'User deleted successfully' 
        });

    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

module.exports = router;