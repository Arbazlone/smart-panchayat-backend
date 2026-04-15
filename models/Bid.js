const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema({
    postId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post',
        required: true
    },
    providerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    message: {
        type: String,
        default: ''
    },
    timeline: {
        type: String,
        enum: ['immediate', 'today', 'tomorrow', 'this_week'],
        default: 'immediate'
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected', 'completed'],
        default: 'pending'
    },
    // ✅ ADD THIS SECTION
    rating: {
        score: {
            type: Number,
            min: 1,
            max: 5
        },
        review: String,
        createdAt: Date
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Bid', bidSchema);