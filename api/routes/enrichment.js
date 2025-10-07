const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { AI_PROVIDERS, ENRICHMENT_FIELDS, FIELD_CATEGORIES } = require('../../config/enrichment-config');

const router = express.Router();

// Get AI providers
router.get('/providers', authenticateToken, (req, res) => {
  res.json({ providers: AI_PROVIDERS });
});

// Get enrichment fields
router.get('/fields', authenticateToken, (req, res) => {
  res.json({ 
    fields: ENRICHMENT_FIELDS,
    categories: FIELD_CATEGORIES
  });
});

// Calculate enrichment cost
router.post('/calculate-cost', authenticateToken, (req, res) => {
  try {
    const { businessCount, aiProvider, fields } = req.body;

    if (!businessCount || !aiProvider) {
      return res.status(400).json({ error: 'Business count and AI provider are required' });
    }

    const provider = AI_PROVIDERS[aiProvider];
    if (!provider) {
      return res.status(400).json({ error: 'Invalid AI provider' });
    }

    const baseCost = businessCount;
    const enrichmentCost = businessCount * provider.costPerBusiness;
    const totalCost = baseCost + enrichmentCost;

    res.json({
      breakdown: {
        businessCount,
        baseCost,
        enrichmentCost,
        totalCost
      },
      provider: {
        name: provider.name,
        costPerBusiness: provider.costPerBusiness
      },
      selectedFields: fields?.length || 0
    });

  } catch (error) {
    console.error('Cost calculation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;