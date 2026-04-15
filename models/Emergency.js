const mongoose = require('mongoose');

const emergencySchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['fire', 'medical', 'theft', 'other'],
        required: true
    },
    description: {
        type: String,
        required: true
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
        enum: ['active', 'responding', 'resolved', 'cancelled'],
        default: 'active'
    },
    shareLiveLocation: {
        type: Boolean,
        default: true
    },
    liveLocationUpdates: [{
        coordinates: [Number],
        timestamp: Date,
        accuracy: Number
    }],
    responders: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        status: {
            type: String,
            enum: ['responding', 'arrived', 'completed']
        },
        respondedAt: Date,
        arrivedAt: Date,
        completedAt: Date,
        location: {
            coordinates: [Number]
        }
    }],
    notifiedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    resolvedAt: Date,
    cancelledAt: Date,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Index for geospatial queries
emergencySchema.index({ location: '2dsphere' });
emergencySchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Emergency', emergencySchema);