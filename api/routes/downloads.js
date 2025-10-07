const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { authenticateToken } = require('../middleware/auth');
const Project = require('../models/Project');

const router = express.Router();

// Serve download files
router.get('/:filename', authenticateToken, async (req, res) => {
  try {
    const { filename } = req.params;
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const filepath = path.join(uploadDir, filename);

    // Extract project ID from filename (format: keyword_projectId_timestamp.xlsx)
    const projectId = filename.split('_')[1];
    
    if (!projectId) {
      return res.status(400).json({ error: 'Invalid filename format' });
    }

    // Verify user owns this project
    const projectModel = new Project();
    await projectModel.init();
    const project = await projectModel.findById(projectId);
    await projectModel.close();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if file exists
    try {
      await fs.access(filepath);
    } catch (error) {
      return res.status(404).json({ error: 'File not found or expired' });
    }

    // Set headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    // Stream file
    res.sendFile(path.resolve(filepath));

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;