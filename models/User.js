const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        minlength: [3, 'Name must be at least 3 characters']
    },
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        unique: true,
        match: [/^[0-9]{10}$/, 'Please enter a valid 10-digit phone number']
    },
    email: {
        type: String,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email'],
        sparse: true,
        default: ''
    },
    alternatePhone: {
        type: String,
        default: ''
    },
    address: {
        type: String,
        default: ''
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters']
    },
    occupation: {
        type: String,
        enum: ['farmer', 'teacher', 'business', 'student', 'service', 'other'],
        default: 'other'
    },
    profilePic: {
        type: String,
        default: null
    },
    bio: {
        type: String,
        maxlength: [500, 'Bio cannot exceed 500 characters'],
        default: ''
    },
    
    badges: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Badge' }],

    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number],
            default: [0, 0]
        },
        address: {
            type: String,
            default: ''
        }
    },
    role: {
        type: String,
        enum: ['user', 'provider', 'admin'],
        default: 'user'
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    isProvider: {
        type: Boolean,
        default: false
    },
    providerDetails: {
        category: String,
        experience: Number,
        hourlyRate: Number,
        description: String,
        serviceRadius: Number,
        available: Boolean,
        rating: {
            type: Number,
            default: 0
        },
        totalReviews: {
            type: Number,
            default: 0
        }
    },
    otp: {
        code: String,
        expiresAt: Date
    },
    deviceTokens: [String],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Index for geospatial queries
userSchema.index({ location: '2dsphere' });

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Generate OTP
userSchema.methods.generateOTP = function() {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    this.otp = {
        code: otp,
        expiresAt: new Date(Date.now() + 2 * 60 * 1000) // 2 minutes
    };
    return otp;
};

// Verify OTP
userSchema.methods.verifyOTP = function(code) {
    if (!this.otp || !this.otp.code || !this.otp.expiresAt) {
        return false;
    }
    
    if (new Date() > this.otp.expiresAt) {
        return false;
    }
    
    return this.otp.code === code;
};

// Clear OTP
userSchema.methods.clearOTP = function() {
    this.otp = undefined;
};

module.exports = mongoose.model('User', userSchema);