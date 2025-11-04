const express = require('express');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Validate Excel file for data enricher
router.post('/validate-excel', async (req, res) => {
  try {
    const multer = require('multer');
    const upload = multer({ dest: 'uploads/' });
    
    upload.single('excelFile')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: 'File upload failed' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No Excel file provided' });
      }

      const filePath = req.file.path;

      try {
        // Validate Excel file using DataEnricherService
        const DataEnricherService = require('../../services/DataEnricherService');
        const service = new DataEnricherService();
        const validation = service.validateExcelFile(filePath);

        if (!validation.valid) {
          return res.status(400).json({ error: validation.error });
        }

        res.json({ validation });

      } catch (error) {
        console.error('Excel validation error:', error);
        res.status(500).json({ error: 'Failed to validate Excel file' });
      }
    });

  } catch (error) {
    console.error('Validation endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;