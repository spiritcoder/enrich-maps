const express = require('express');
const { getAllCountries, getPopularCountries } = require('../../utils/countries-loader');

const router = express.Router();

// Get all countries with subdivisions
router.get('/', (req, res) => {
  try {
    const countries = getAllCountries();
    res.json({ countries });
  } catch (error) {
    console.error('Get countries error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get popular countries (for UI shortcuts)
router.get('/popular', (req, res) => {
  try {
    const countries = getPopularCountries();
    res.json({ countries });
  } catch (error) {
    console.error('Get popular countries error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;