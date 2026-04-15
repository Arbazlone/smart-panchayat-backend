const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    provider: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    serviceType: {
        type: String,
        enum: ['plumber', 'electrician', 'carpenter', 'painter', 'cleaner', 'tutor', 'doctor', 'other'],
        required: true
    },
    description: {
        type: String,
        required: true,
        maxlength: 500
    },
    budget: {
        type: Number,
        min: 0
    },
    timeline: {
        type: String,
        enum: ['immediate', 'today', 'this_week', 'flexible'],
        default: 'flexible'
    },
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number],
            required: true
        },
        address: String
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'in_progress', 'completed', 'cancelled'],
        default: 'pending'
    },
    bids: [{
        provider: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        amount: Number,
        message: String,
        status: {
            type: String,
            enum: ['pending', 'accepted', 'rejected'],
            default: 'pending'
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    acceptedBid: {
        type: mongoose.Schema.Types.ObjectId
    },
    completedAt: Date,
    cancelledAt: Date,
    cancellationReason: String,
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
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Index for geospatial queries
serviceSchema.index({ location: '2dsphere' });
serviceSchema.index({ status: 1, createdAt: -1 });
serviceSchema.index({ serviceType: 1, status: 1 });

// Update timestamp on save
serviceSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Service', serviceSchema);