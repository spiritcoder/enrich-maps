const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { scrapingQueue } = require('../../services/JobQueue');
const Project = require('../models/Project');
const User = require('../models/User');
const { authenticateToken: auth } = require('../middleware/auth');
const { AI_PROVIDERS, ENRICHMENT_FIELDS } = require('../../config/enrichment-config');
const PureAIEnrichmentService = require('../../services/PureAIEnrichmentService');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.xlsx', '.xls'];
    const fileExt = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Upload Excel file for AI enrichment
router.post('/upload', auth, upload.single('excelFile'), async (req, res) => {
  try {
    const { selectedFields, aiProvider, projectName } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No Excel file uploaded' });
    }
    
    if (!selectedFields || !Array.isArray(JSON.parse(selectedFields))) {
      return res.status(400).json({ error: 'Selected fields are required' });
    }
    
    if (!aiProvider || !AI_PROVIDERS[aiProvider]) {
      return res.status(400).json({ error: 'Valid AI provider is required' });
    }
    
    const parsedFields = JSON.parse(selectedFields);
    const provider = AI_PROVIDERS[aiProvider];
    
    // Read Excel file to count rows
    const XLSX = require('xlsx');
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    const businessCount = data.length;
    const enrichmentCost = businessCount * provider.costPerBusiness;
    
    // Check user credits
    const userModel = new User();
    await userModel.init();
    const userId = req.user._id || req.user.userId;
    const user = await userModel.findById(userId);
    
    if (!user) {
      fs.unlinkSync(req.file.path);
      await userModel.close();
      return res.status(404).json({ error: 'User not found' });
    }
    
    const availableCredits = (user.subscription?.monthlyLimit || 50) + (user.credits?.balance || 0) - (user.usage?.currentMonth || 0);
    
    if (enrichmentCost > availableCredits) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      await userModel.close();
      return res.status(400).json({ 
        error: 'Insufficient credits',
        required: enrichmentCost,
        available: availableCredits
      });
    }
    
    // Create project
    const projectModel = new Project();
    await projectModel.init();
    
    const project = await projectModel.create({
      userId: req.user._id || req.user.userId,
      name: projectName || `AI Enrichment - ${new Date().toLocaleDateString()}`,
      type: 'ai_enrichment_only',
      status: 'pending',
      searchTerm: 'AI Enrichment',
      locations: [{ country: 'Excel File', subdivision: 'N/A', label: 'Excel Data' }],
      businessLimit: businessCount,
      costs: {
        totalCost: enrichmentCost,
        breakdown: {
          enrichment: enrichmentCost
        }
      },
      enrichment: {
        enabled: true,
        fields: parsedFields,
        aiProvider: aiProvider
      },
      results: {
        found: 0,
        processed: 0
      },
      progress: {
        percentage: 0,
        current: 0,
        total: businessCount,
        enriched: 0
      }
    });
    
    // Add job to queue
    await scrapingQueue.add('ai-enrichment-only', {
      projectId: project._id.toString(),
      excelFile: req.file.path,
      businessCount: businessCount,
      selectedFields: parsedFields,
      aiProvider: aiProvider,
      enrichmentCost: enrichmentCost
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      }
    });
    
    await projectModel.close();
    await userModel.close();
    
    res.json({
      success: true,
      projectId: project._id.toString(),
      businessCount: businessCount,
      estimatedCost: enrichmentCost,
      message: 'AI enrichment job queued successfully'
    });
    
  } catch (error) {
    console.error('AI enrichment upload error:', error);
    
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Get enrichment progress
router.get('/progress/:projectId', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    // Get project details
    const projectModel = new Project();
    await projectModel.init();
    const project = await projectModel.findById(projectId);
    
    if (!project || project.userId !== (req.user._id || req.user.userId)) {
      await projectModel.close();
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Get checkpoint progress
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
    await client.connect();
    
    const db = client.db(`saas_${projectId}`);
    const service = new PureAIEnrichmentService();
    const progress = await service.getProgress(projectId);
    
    await client.close();
    await projectModel.close();
    
    res.json({
      project: {
        id: project._id,
        name: project.name,
        status: project.status,
        type: project.type
      },
      progress: progress
    });
    
  } catch (error) {
    console.error('Progress check error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Resume AI enrichment
router.post('/resume/:projectId', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const projectModel = new Project();
    await projectModel.init();
    const project = await projectModel.findById(projectId);
    
    if (!project || project.userId !== (req.user._id || req.user.userId)) {
      await projectModel.close();
      return res.status(404).json({ error: 'Project not found' });
    }
    
    if (project.status === 'completed') {
      await projectModel.close();
      return res.status(400).json({ error: 'Project already completed' });
    }
    
    // Add resume job to queue
    await scrapingQueue.add('ai-enrichment-resume', {
      projectId: projectId,
      isResume: true
    });
    
    await projectModel.updateStatus(projectId, 'processing');
    await projectModel.close();
    
    res.json({ success: true, message: 'AI enrichment resumed' });
    
  } catch (error) {
    console.error('Resume error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Retry failed rows
router.post('/retry-failed/:projectId', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const projectModel = new Project();
    await projectModel.init();
    const project = await projectModel.findById(projectId);
    
    if (!project || project.userId !== (req.user._id || req.user.userId)) {
      await projectModel.close();
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Add retry job to queue
    await scrapingQueue.add('ai-enrichment-retry', {
      projectId: projectId,
      isRetry: true
    });
    
    await projectModel.close();
    
    res.json({ success: true, message: 'Retrying failed enrichments' });
    
  } catch (error) {
    console.error('Retry error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get available AI providers and fields (public route)
router.get('/config', (req, res) => {
  res.json({
    aiProviders: AI_PROVIDERS,
    enrichmentFields: ENRICHMENT_FIELDS
  });
});

module.exports = router;