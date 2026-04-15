const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// Import routes
const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');
const userRoutes = require('./routes/users');
const serviceRoutes = require('./routes/services');
const emergencyRoutes = require('./routes/emergencies');
const chatRoutes = require('./routes/chat');
const bidRoutes = require('./routes/bids');
const { router: notificationRoutes } = require('./routes/notifications');
const badgesRoutes = require('./routes/badges');
const ratingsRoutes = require('./routes/ratings');
const activityRoutes = require('./routes/activity');
const eventRoutes = require('./routes/events');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Make io accessible
app.set('io', io);

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/smart-panchayat')
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => console.error('❌ MongoDB Error:', err));

// Socket.io
io.on('connection', (socket) => {
    console.log('✅ User connected:', socket.id);
    
    socket.on('join-village', () => {
        socket.join('village-chat');
    });
    
    socket.on('send-message', (data) => {
        io.to(data.chatId || 'village-chat').emit('new-message', data);
    });
    
    socket.on('disconnect', () => {
        console.log('❌ User disconnected:', socket.id);
    });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/users', userRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/emergencies', emergencyRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/bids', bidRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/badges', badgesRoutes);
app.use('/api/ratings', ratingsRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/events', eventRoutes);

// Test Route
app.get('/api/test', (req, res) => {
    res.json({ message: 'Smart Panchayat API is running!' });
});

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});