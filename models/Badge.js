const mongoose = require('mongoose');

const badgeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    description: String,
    icon: String,
    requirement: {
        type: {
            type: String,
            enum: ['posts', 'helped', 'rating', 'services_completed', 'emergency_responses'],
            required: true
        },
        count: { type: Number, required: true }
    }
});

module.exports = mongoose.model('Badge', badgeSchema);