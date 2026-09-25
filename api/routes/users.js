const express = require('express');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    res.json({ user: req.user });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user usage stats
router.get('/usage', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    const monthlyLimit = user.subscription?.monthlyLimit || 50;
    const remaining = Math.max(0, monthlyLimit - user.usage.currentMonth);
    
    res.json({
      usage: {
        currentMonth: user.usage.currentMonth,
        limit: monthlyLimit,
        resetDate: user.usage.resetDate,
        remaining,
        percentage: Math.round((user.usage.currentMonth / monthlyLimit) * 100),
        subscription: user.subscription,
        credits: user.credits
      }
    });
  } catch (error) {
    console.error('Get usage error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;