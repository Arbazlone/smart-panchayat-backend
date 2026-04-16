const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['general', 'issue', 'service', 'emergency'],
        default: 'general'
    },
    title: {
        type: String,
        default: ''
    },
    description: {
        type: String,
        required: [true, 'Description is required']
    },
    images: [{
        type: String
    }],
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number],
            default: [77.2090, 28.6139]
        },
        address: {
            type: String,
            default: ''
        }
    },
    issueCategory: {
        type: String,
        default: 'other'
    },
    priority: {
        type: String,
        default: 'medium'
    },
    serviceType: {
        type: String,
        default: 'other'
    },
    budget: {
        type: Number,
        default: null
    },
    serviceStatus: {
    type: String,
    enum: ['open', 'assigned', 'completed'],
    default: 'open'
},
    isAnonymous: {
        type: Boolean,
        default: false
    },
    likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    savedBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    comments: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        text: String,
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    views: {
        type: Number,
        default: 0
    },
    
    isPinned: {
    type: Boolean,
    default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// 2dsphere index for geospatial queries
postSchema.index({ 'location': '2dsphere' });

// Index for sorting by date
postSchema.index({ createdAt: -1 });

const Post = mongoose.model('Post', postSchema);
module.exports = Post;