const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const { protect } = require('../middleware/auth');
const { createNotification } = require('./notifications');

// @route   GET /api/events
// @desc    Get all events
// @access  Private
router.get('/', protect, async (req, res) => {
    try {
        const { filter } = req.query;
        const query = {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (filter === 'upcoming') {
            query.date = { $gte: today };
        } else if (filter === 'past') {
            query.date = { $lt: today };
        } else if (filter && filter !== 'all') {
            query.type = filter;
        }
        
        const events = await Event.find(query)
            .populate('createdBy', 'name profilePic')
            .sort({ date: 1 });
        
        res.json({ success: true, events });
    } catch (error) {
        console.error('Get events error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   POST /api/events
// @desc    Create a new event
// @access  Private
router.post('/', protect, async (req, res) => {
    try {
        const { title, type, description, date, time, location, organizer, urgent } = req.body;
        
        if (!title || !type || !date || !time || !location) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }
        
        const event = await Event.create({
            title,
            type,
            description,
            date: new Date(date),
            time,
            location,
            organizer: organizer || 'Panchayat Office',
            urgent: urgent || false,
            createdBy: req.user.id
        });
        
        // Notify all users about new event
        // You can add notification logic here
        
        res.status(201).json({ success: true, message: 'Event created', event });
    } catch (error) {
        console.error('Create event error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   POST /api/events/:id/reminder
// @desc    Set reminder for an event
// @access  Private
router.post('/:id/reminder', protect, async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }
        
        const alreadyAttending = event.attendees.find(a => a.user.toString() === req.user.id);
        
        if (alreadyAttending) {
            alreadyAttending.reminder = true;
        } else {
            event.attendees.push({ user: req.user.id, reminder: true });
        }
        
        await event.save();
        
        res.json({ success: true, message: 'Reminder set!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   DELETE /api/events/:id
// @desc    Delete an event
// @access  Private
router.delete('/:id', protect, async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);
        
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }
        
        // Only creator or admin can delete
        if (event.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }
        
        await event.deleteOne();
        
        res.json({ success: true, message: 'Event deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;