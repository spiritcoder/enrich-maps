const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const Project = require('../models/Project');
const { MongoClient } = require('mongodb');
const ExcelJS = require('exceljs');
const { sanitizeFilename } = require('../../utils/filename-sanitizer');

const router = express.Router();

// Generate and stream Excel file on-demand
router.get('/:projectId', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    // Verify user owns this project
    const projectModel = new Project();
    await projectModel.init();
    const project = await projectModel.findById(projectId);
    
    if (!project) {
      await projectModel.close();
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.userId.toString() !== req.user._id.toString()) {
      await projectModel.close();
      return res.status(403).json({ error: 'Access denied' });
    }

    // Connect to project database
    const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
    await client.connect();
    const db = client.db(`saas_${projectId}`);
    const businessCollection = db.collection('businesses');
    
    // Get all businesses for this project
    const businesses = await businessCollection.find({ project_id: projectId }).toArray();
    
    if (businesses.length === 0) {
      await client.close();
      await projectModel.close();
      return res.status(404).json({ error: 'No data found for this project' });
    }

    // Create Excel workbook in memory
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Businesses');
    
    // Get all unique fields from businesses (default + enriched)
    const allFields = new Set(['name', 'phone', 'website', 'address', 'rating', 'review_count', 'country', 'subdivision']);
    businesses.forEach(business => {
      Object.keys(business).forEach(key => {
        if (!key.startsWith('_') && !['project_id', 'processed_at', 'enriched', 'enriched_at', 'enrichment_provider', 'enrichment_fields', 'enrichment_error'].includes(key)) {
          allFields.add(key);
        }
      });
    });
    
    const columns = Array.from(allFields);
    
    // Set up columns
    worksheet.columns = columns.map(field => ({
      header: field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, ' '),
      key: field,
      width: 20
    }));
    
    // Add data rows
    businesses.forEach(business => {
      const row = {};
      columns.forEach(field => {
        row[field] = business[field] || '';
      });
      worksheet.addRow(row);
    });
    
    // Style the header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
    
    await client.close();
    await projectModel.close();
    
    // Set response headers for download
    const sanitizedName = sanitizeFilename(project.name || project.searchTerm || 'businesses');
    const filename = `${sanitizedName}_${projectId.slice(-8)}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    // Stream Excel file directly to response
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;