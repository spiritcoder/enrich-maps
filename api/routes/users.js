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
    const usage = req.user.usage;
    const remaining = Math.max(0, usage.limit - usage.currentMonth);
    
    res.json({
      usage: {
        ...usage,
        remaining,
        percentage: Math.round((usage.currentMonth / usage.limit) * 100)
      }
    });
  } catch (error) {
    console.error('Get usage error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;