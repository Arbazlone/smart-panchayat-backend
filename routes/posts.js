const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/posts/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// @route   GET /api/posts
// @desc    Get all posts with filters (My Issues, My Services, Nearby, Emergency)
// @access  Private
router.get('/', protect, async (req, res) => {
    try {
        const { filter = 'all', type, author, page = 1, limit = 10, lat, lng } = req.query;
        
        const query = {};
        
        // Filter by author (for My Issues / My Services)
        if (author) {
            query.author = author;
        }
        
        // Filter by type
        if (type) {
            query.type = type;
        } else if (filter === 'issues') {
            query.type = 'issue';
        } else if (filter === 'services') {
            query.type = 'service';
        } else if (filter === 'emergency') {
            query.type = 'emergency';
        }
        
        // Nearby filter
        if (filter === 'nearby' && lat && lng) {
            query['location.coordinates'] = {
                $near: {
                    $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
                    $maxDistance: 10000 // 10km
                }
            };
        }
        
        const posts = await Post.find(query)
            .populate('author', 'name profilePic isVerified')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));
        
        const total = await Post.countDocuments(query);
        
        // Check if user liked each post
        const postsWithUserActions = posts.map(post => {
            const postObj = post.toObject();
            postObj.userLiked = post.likes?.includes(req.user.id) || false;
            postObj.userSaved = post.savedBy?.includes(req.user.id) || false;
            return postObj;
        });
        
        res.json({
            success: true,
            posts: postsWithUserActions,
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            total,
            hasMore: parseInt(page) * parseInt(limit) < total
        });
        
    } catch (error) {
        console.error('Get posts error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   POST /api/posts
// @desc    Create a new post
// @access  Private
router.post('/', protect, upload.array('images', 5), async (req, res) => {
    try {
        const { type, title, description, lat, lng, address, isAnonymous, issueCategory, priority, serviceType, budget } = req.body;
        
        if (!description) {
            return res.status(400).json({
                success: false,
                message: 'Description is required'
            });
        }
        
        const images = req.files ? req.files.map(file => `/uploads/posts/${file.filename}`) : [];
        
        const postData = {
            author: req.user.id,
            type: type || 'general',
            title: title || '',
            description,
            images,
            location: {
                type: 'Point',
                coordinates: [parseFloat(lng) || 77.2090, parseFloat(lat) || 28.6139],
                address: address || ''
            },
            isAnonymous: isAnonymous === 'true' || isAnonymous === true
        };
        
        if (type === 'issue') {
            postData.issueCategory = issueCategory || 'other';
            postData.priority = priority || 'medium';
        } else if (type === 'service') {
            postData.serviceType = serviceType || 'other';
            postData.budget = budget ? parseFloat(budget) : null;
            postData.serviceStatus = 'open';  // ← ADD THIS LINE
        }
        
        const post = await Post.create(postData);
        await post.populate('author', 'name profilePic isVerified');
        
        if (type === 'emergency') {
            const io = req.app.get('io');
            if (io) io.to('village-chat').emit('new-emergency', post);
        }
        
        res.status(201).json({
            success: true,
            message: 'Post created successfully',
            post
        });
        
    } catch (error) {
        console.error('Create post error:', error.message);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error'
        });
    }
});

// @route   GET /api/posts/:id/likes
// @desc    Get users who liked a post
// @access  Private
router.get('/:id/likes', protect, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id)
            .populate('likes', 'name phone profilePic isVerified');
        
        if (!post) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }
        
        res.json({ success: true, users: post.likes || [] });
        
    } catch (error) {
        console.error('Get likes error:', error.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});
// @route   POST /api/posts/:id/like
// @desc    Like a post
// @access  Private
router.post('/:id/like', protect, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        
        if (!post) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }
        
        if (!post.likes) post.likes = [];
        
        const likeIndex = post.likes.indexOf(req.user.id);
        
        if (likeIndex === -1) {
            post.likes.push(req.user.id);
        } else {
            post.likes.splice(likeIndex, 1);
        }
        
        await post.save();
        
        res.json({
            success: true,
            likes: post.likes.length,
            userLiked: likeIndex === -1
        });
        
    } catch (error) {
        console.error('Like post error:', error.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   POST /api/posts/:id/save
// @desc    Save a post
// @access  Private
router.post('/:id/save', protect, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        
        if (!post) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }
        
        if (!post.savedBy) post.savedBy = [];
        
        const saveIndex = post.savedBy.indexOf(req.user.id);
        
        if (saveIndex === -1) {
            post.savedBy.push(req.user.id);
        } else {
            post.savedBy.splice(saveIndex, 1);
        }
        
        await post.save();
        
        res.json({
            success: true,
            userSaved: saveIndex === -1
        });
        
    } catch (error) {
        console.error('Save post error:', error.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   GET /api/posts/:id
// @desc    Get single post
// @access  Private
router.get('/:id', protect, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id)
            .populate('author', 'name profilePic isVerified')
            .populate('comments.user', 'name profilePic');  // ← ADD THIS LINE
        
        if (!post) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }
        
        post.views = (post.views || 0) + 1;
        await post.save();
        
        const postObj = post.toObject();
        postObj.userLiked = post.likes?.includes(req.user.id) || false;
        postObj.userSaved = post.savedBy?.includes(req.user.id) || false;
        
        res.json({ success: true, post: postObj });
        
    } catch (error) {
        console.error('Get post error:', error.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   GET /api/posts/:id/comments
// @desc    Get comments for a post
// @access  Private
router.get('/:id/comments', protect, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id)
            .populate('comments.user', 'name profilePic');
        
        if (!post) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }
        
        res.json({ success: true, comments: post.comments || [] });
        
    } catch (error) {
        console.error('Get comments error:', error.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});
// @route   POST /api/posts/:id/comments
// @desc    Add comment to post
// @access  Private
router.post('/:id/comments', protect, async (req, res) => {
    try {
        const { text } = req.body;
        
        if (!text || text.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Comment text is required' });
        }
        
        const post = await Post.findById(req.params.id);
        
        if (!post) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }
        
        if (!post.comments) post.comments = [];
        
        const comment = {
            user: req.user.id,
            text: text.trim(),
            createdAt: new Date()
        };
        
        post.comments.push(comment);
        await post.save();
        
        res.status(201).json({
            success: true,
            comment: {
                ...comment,
                user: { _id: req.user.id, name: req.user.name }
            }
        });
        
    } catch (error) {
        console.error('Add comment error:', error.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   DELETE /api/posts/:id
// @desc    Delete a post
// @access  Private
router.delete('/:id', protect, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        
        if (!post) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }
        
        if (post.author.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }
        
        await post.deleteOne();
        
        res.json({ success: true, message: 'Post deleted successfully' });
        
    } catch (error) {
        console.error('Delete post error:', error.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});
// @route   DELETE /api/posts/:id
// @desc    Delete post (Admin only)
// @access  Private
router.delete('/:id', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                message: 'Access denied' 
            });
        }

        const post = await Post.findById(req.params.id);

        if (!post) {
            return res.status(404).json({ 
                success: false, 
                message: 'Post not found' 
            });
        }

        await Post.findByIdAndDelete(req.params.id);

        res.json({ success: true, message: 'Post deleted' });

    } catch (err) {
        res.status(500).json({ success: false });
    }
});

module.exports = router;