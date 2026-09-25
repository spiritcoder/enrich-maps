const express = require('express');
const Project = require('../models/Project');
const { authenticateToken } = require('../middleware/auth');


const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Create new project
router.post('/', async (req, res) => {
  try {
    const { projectName, searchTerm, locations, businessLimit, businessesPerLocation, enrichment } = req.body;

    // Validation
    if (!searchTerm || !locations || !Array.isArray(locations) || locations.length === 0 || !businessLimit) {
      return res.status(400).json({ error: 'Search term, locations, and business limit are required' });
    }

    if (businessLimit < 1 || businessLimit > 30000) {
      return res.status(400).json({ error: 'Business limit must be between 1 and 30,000' });
    }

    // Calculate exact costs
    const baseCost = businessLimit;
    let enrichmentCost = 0;
    
    if (enrichment?.enabled && enrichment.aiProvider) {
      const { AI_PROVIDERS } = require('../../config/enrichment-config');
      const provider = AI_PROVIDERS[enrichment.aiProvider];
      if (!provider) {
        return res.status(400).json({ error: 'Invalid AI provider' });
      }
      enrichmentCost = businessLimit * provider.costPerBusiness;
    }
    
    const totalCost = baseCost + enrichmentCost;
    const user = req.user;
    const availableCredits = (user.subscription?.monthlyLimit || 50) + (user.credits?.balance || 0) - user.usage.currentMonth;

    if (totalCost > availableCredits) {
      return res.status(400).json({ 
        error: 'Insufficient credits',
        required: totalCost,
        available: availableCredits,
        shortfall: totalCost - availableCredits,
        breakdown: {
          baseCost,
          enrichmentCost,
          totalCost
        }
      });
    }

    const projectModel = new Project();
    await projectModel.init();

    // Generate project name
    const generatedName = projectName?.trim() || `${searchTerm} - ${locations.length} location${locations.length > 1 ? 's' : ''}`;
    
    // Create project
    const projectData = {
      userId: user._id,
      name: generatedName,
      searchTerm,
      locations,
      businessLimit,
      businessesPerLocation: businessesPerLocation || null,
      enrichment: enrichment || { enabled: false },
      costs: {
        baseCost,
        enrichmentCost,
        totalCost
      }
    };

    const project = await projectModel.create(projectData);
    await projectModel.close();

    // Add to job queue
    const { createScrapingJob } = require('../../services/JobQueue');
    await createScrapingJob(project._id.toString(), {
      projectId: project._id.toString(),
      searchTerm,
      locations,
      businessLimit,
      businessesPerLocation,
      enrichment
    });

    res.status(201).json({
      message: 'Project created successfully',
      project
    });

  } catch (error) {
    console.error('Project creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's projects
router.get('/', async (req, res) => {
  try {
    const projectModel = new Project();
    await projectModel.init();

    const projects = await projectModel.findByUserId(req.user._id);
    await projectModel.close();

    res.json({ projects });

  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific project
router.get('/:id', async (req, res) => {
  try {
    const projectModel = new Project();
    await projectModel.init();

    const project = await projectModel.findById(req.params.id);
    await projectModel.close();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check ownership
    if (project.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ project });

  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Enrich completed project
router.post('/:id/enrich', async (req, res) => {
  try {
    const { aiProvider, fields } = req.body;
    const projectId = req.params.id;

    if (!aiProvider || !fields || !Array.isArray(fields) || fields.length === 0) {
      return res.status(400).json({ error: 'AI provider and enrichment fields are required' });
    }

    const projectModel = new Project();
    await projectModel.init();

    const project = await projectModel.findById(projectId);
    if (!project) {
      await projectModel.close();
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check ownership
    if (project.userId.toString() !== req.user._id.toString()) {
      await projectModel.close();
      return res.status(403).json({ error: 'Access denied' });
    }

    // Only allow enrichment of completed projects
    if (project.status !== 'completed') {
      await projectModel.close();
      return res.status(400).json({ error: 'Can only enrich completed projects' });
    }

    // Calculate enrichment cost
    const { AI_PROVIDERS } = require('../../config/enrichment-config');
    const provider = AI_PROVIDERS[aiProvider];
    if (!provider) {
      await projectModel.close();
      return res.status(400).json({ error: 'Invalid AI provider' });
    }

    const businessCount = project.results?.processed || 0;
    if (businessCount === 0) {
      await projectModel.close();
      return res.status(400).json({ error: 'No businesses found to enrich' });
    }

    const enrichmentCost = businessCount * provider.costPerBusiness;
    const user = req.user;
    const availableCredits = (user.subscription?.monthlyLimit || 50) + (user.credits?.balance || 0) - user.usage.currentMonth;

    if (enrichmentCost > availableCredits) {
      await projectModel.close();
      return res.status(400).json({ 
        error: 'Insufficient credits',
        required: enrichmentCost,
        available: availableCredits,
        businessCount
      });
    }

    // Update project status to processing
    await projectModel.updateStatus(projectId, 'processing');
    await projectModel.close();

    // Add enrichment job to queue
    const { createScrapingJob } = require('../../services/JobQueue');
    await createScrapingJob(projectId, {
      jobType: 'enrich-project',
      projectId,
      enrichment: {
        enabled: true,
        aiProvider,
        fields
      },
      businessCount,
      enrichmentCost
    });

    res.json({
      message: 'Enrichment job started',
      businessCount,
      enrichmentCost,
      provider: provider.name
    });

  } catch (error) {
    console.error('Enrichment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Data Enricher - Upload Excel for AI enrichment
router.post('/data-enricher', async (req, res) => {
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

      const { projectName, selectedFields, aiProvider } = req.body;
      const filePath = req.file.path;

      try {
        // Validate Excel file
        const DataEnricherService = require('../../services/DataEnricherService');
        const service = new DataEnricherService();
        const validation = service.validateExcelFile(filePath);

        if (!validation.valid) {
          return res.status(400).json({ error: validation.error });
        }

        // Parse selected fields
        const fields = Array.isArray(selectedFields) ? selectedFields : 
                      (typeof selectedFields === 'string' ? JSON.parse(selectedFields) : []);
        
        if (!fields || fields.length === 0) {
          return res.status(400).json({ error: 'No enrichment fields selected' });
        }

        // Calculate costs
        const locationCount = validation.rowCount;
        const { LOCATION_AI_PROVIDERS } = require('../../config/location-enrichment-config');
        const provider = LOCATION_AI_PROVIDERS[aiProvider || 'deepseek'];
        
        if (!provider) {
          return res.status(400).json({ error: 'Invalid AI provider' });
        }
        
        const totalCost = locationCount * provider.costPerLocation;
        const user = req.user;
        const availableCredits = (user.subscription?.monthlyLimit || 50) + (user.credits?.balance || 0) - user.usage.currentMonth;

        if (totalCost > availableCredits) {
          return res.status(400).json({ 
            error: 'Insufficient credits',
            required: totalCost,
            available: availableCredits,
            locationCount,
            fieldCount: fields.length,
            costPerLocation: provider.costPerLocation
          });
        }

        // Create project
        const projectModel = new Project();
        await projectModel.init();

        const generatedName = projectName?.trim() || `Data Enricher - ${locationCount} locations`;
        
        const projectData = {
          userId: user._id,
          name: generatedName,
          searchTerm: 'Data Enricher',
          locations: ['Excel Upload'],
          businessLimit: locationCount,
          type: 'data-enricher',
          costs: { totalCost },
          dataEnricher: {
            originalFile: req.file.originalname,
            path: filePath,
            rowCount: locationCount,
            columns: validation.columns,
            selectedFields: fields,
            aiProvider: aiProvider || 'deepseek'
          }
        };

        const project = await projectModel.create(projectData);
        await projectModel.close();

        // Add to job queue
        const { createScrapingJob } = require('../../services/JobQueue');
        await createScrapingJob(project._id.toString(), {
          jobType: 'data-enricher',
          projectId: project._id.toString(),
          excelFile: filePath,
          locationCount,
          selectedFields: fields,
          aiProvider: aiProvider || 'deepseek'
        });

        res.status(201).json({
          message: 'Data enricher project created successfully',
          project,
          validation: {
            rowCount: locationCount,
            columns: validation.columns,
            selectedFields: fields,
            totalCost
          }
        });

      } catch (error) {
        console.error('Data enricher processing error:', error);
        res.status(500).json({ error: 'Failed to process Excel file' });
      }
    });

  } catch (error) {
    console.error('Data enricher upload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload Excel for business lookup
router.post('/excel-lookup', async (req, res) => {
  try {
    const multer = require('multer');
    const upload = multer({ dest: 'uploads/' });
    
    // Handle file upload
    upload.single('excelFile')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: 'File upload failed' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No Excel file provided' });
      }

      const { projectName, enrichment } = req.body;
      const filePath = req.file.path;

      try {
        // Validate Excel file
        const ExcelLookupService = require('../../services/ExcelLookupService');
        const service = new ExcelLookupService();
        const validation = service.validateExcelFile(filePath);

        if (!validation.valid) {
          return res.status(400).json({ error: validation.error });
        }

        // Calculate costs
        const businessCount = validation.rowCount;
        const baseCost = businessCount;
        let enrichmentCost = 0;
        
        if (enrichment?.enabled && enrichment.aiProvider) {
          const { AI_PROVIDERS } = require('../../config/enrichment-config');
          const provider = AI_PROVIDERS[enrichment.aiProvider];
          if (!provider) {
            return res.status(400).json({ error: 'Invalid AI provider' });
          }
          enrichmentCost = businessCount * provider.costPerBusiness;
        }
        
        const totalCost = baseCost + enrichmentCost;
        const user = req.user;
        const availableCredits = (user.subscription?.monthlyLimit || 50) + (user.credits?.balance || 0) - user.usage.currentMonth;

        if (totalCost > availableCredits) {
          return res.status(400).json({ 
            error: 'Insufficient credits',
            required: totalCost,
            available: availableCredits,
            businessCount,
            breakdown: { baseCost, enrichmentCost, totalCost }
          });
        }

        // Create project
        const projectModel = new Project();
        await projectModel.init();

        const generatedName = projectName?.trim() || `Excel Lookup - ${businessCount} businesses`;
        
        const projectData = {
          userId: user._id,
          name: generatedName,
          searchTerm: 'Excel Business Lookup',
          locations: ['Excel Upload'],
          businessLimit: businessCount,
          enrichment: enrichment || { enabled: false },
          costs: { baseCost, enrichmentCost, totalCost },
          excelFile: {
            originalName: req.file.originalname,
            path: filePath,
            rowCount: businessCount,
            columns: validation.columns
          }
        };

        const project = await projectModel.create(projectData);
        await projectModel.close();

        // Add to job queue
        const { createScrapingJob } = require('../../services/JobQueue');
        await createScrapingJob(project._id.toString(), {
          jobType: 'excel-lookup',
          projectId: project._id.toString(),
          excelFile: filePath,
          businessCount,
          enrichment
        });

        res.status(201).json({
          message: 'Excel lookup project created successfully',
          project,
          validation: {
            rowCount: businessCount,
            columns: validation.columns,
            sampleData: validation.sampleData
          }
        });

      } catch (error) {
        console.error('Excel processing error:', error);
        res.status(500).json({ error: 'Failed to process Excel file' });
      }
    });

  } catch (error) {
    console.error('Excel upload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Recalculate results for completed Excel projects
router.post('/:id/recalculate-results', async (req, res) => {
  try {
    const projectId = req.params.id;

    const projectModel = new Project();
    await projectModel.init();

    const project = await projectModel.findById(projectId);
    if (!project) {
      await projectModel.close();
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check ownership
    if (project.userId.toString() !== req.user._id.toString()) {
      await projectModel.close();
      return res.status(403).json({ error: 'Access denied' });
    }

    // Only allow for completed Excel lookup projects
    if (project.status !== 'completed' || !project.excelFile) {
      await projectModel.close();
      return res.status(400).json({ error: 'Can only recalculate results for completed Excel lookup projects' });
    }

    // Count actual businesses in database
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db(`saas_${projectId}`);
    
    const totalCount = await db.collection('businesses').countDocuments({ project_id: projectId });
    const foundCount = await db.collection('businesses').countDocuments({ 
      project_id: projectId, 
      lookup_success: true 
    });
    
    await client.close();

    // Update project results
    await projectModel.updateResults(projectId, { 
      found: foundCount, 
      processed: totalCount 
    });
    
    await projectModel.close();

    res.json({
      message: 'Results recalculated successfully',
      found: foundCount,
      processed: totalCount
    });

  } catch (error) {
    console.error('Recalculate results error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Retry failed records for Excel lookup project
router.post('/:id/retry-failed', async (req, res) => {
  try {
    const projectId = req.params.id;

    const projectModel = new Project();
    await projectModel.init();

    const project = await projectModel.findById(projectId);
    if (!project) {
      await projectModel.close();
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check ownership
    if (project.userId.toString() !== req.user._id.toString()) {
      await projectModel.close();
      return res.status(403).json({ error: 'Access denied' });
    }

    // Only allow retry for completed Excel lookup projects
    if (project.status !== 'completed' || !project.excelFile) {
      await projectModel.close();
      return res.status(400).json({ error: 'Can only retry failed records for completed Excel lookup projects' });
    }

    // Check if there are failed records
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db(`saas_${projectId}`);
    
    const failedCount = await db.collection('businesses').countDocuments({
      project_id: projectId,
      lookup_success: false
    });
    
    await client.close();

    if (failedCount === 0) {
      await projectModel.close();
      return res.status(400).json({ error: 'No failed records found to retry' });
    }

    // Update project status to processing
    await projectModel.updateStatus(projectId, 'processing');
    await projectModel.close();

    // Add retry job to queue
    const { createScrapingJob } = require('../../services/JobQueue');
    await createScrapingJob(projectId, {
      jobType: 'excel-lookup-retry',
      projectId,
      excelFile: project.excelFile.path,
      failedCount,
      enrichment: project.enrichment
    });

    res.json({
      message: 'Retry job started',
      failedCount
    });

  } catch (error) {
    console.error('Retry failed error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Retry failed enrichments for data enricher project
router.post('/:id/retry-enrichment', async (req, res) => {
  try {
    const projectId = req.params.id;

    const projectModel = new Project();
    await projectModel.init();

    const project = await projectModel.findById(projectId);
    if (!project) {
      await projectModel.close();
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check ownership
    if (project.userId.toString() !== req.user._id.toString()) {
      await projectModel.close();
      return res.status(403).json({ error: 'Access denied' });
    }

    // Only allow retry for completed data enricher projects
    if (project.status !== 'completed' || project.type !== 'data-enricher') {
      await projectModel.close();
      return res.status(400).json({ error: 'Can only retry failed enrichments for completed data enricher projects' });
    }

    // Connect to project database
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db(`saas_${projectId}`);

    // Check if there are failed enrichments
    const DataEnricherService = require('../../services/DataEnricherService');
    const service = new DataEnricherService();
    const stats = await service.getEnrichmentStats(projectId, db);

    if (!stats.canRetry) {
      await client.close();
      await projectModel.close();
      return res.status(400).json({ error: 'No failed enrichments found to retry' });
    }

    // Update project status to processing
    await projectModel.updateStatus(projectId, 'processing');
    await projectModel.close();

    // Start retry process
    const retryResult = await service.retryFailedEnrichments(projectId, db);
    
    // Update project status back to completed
    const projectModel2 = new Project();
    await projectModel2.init();
    await projectModel2.updateStatus(projectId, 'completed', {
      lastRetryAt: new Date(),
      lastRetryResult: retryResult
    });
    await projectModel2.close();
    
    await client.close();

    res.json({
      message: 'Enrichment retry completed',
      retriedCount: retryResult.retriedCount,
      successCount: retryResult.successCount,
      stats
    });

  } catch (error) {
    console.error('Retry enrichment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get enrichment statistics
router.get('/:id/enrichment-stats', async (req, res) => {
  try {
    const projectId = req.params.id;

    const projectModel = new Project();
    await projectModel.init();

    const project = await projectModel.findById(projectId);
    if (!project) {
      await projectModel.close();
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check ownership
    if (project.userId.toString() !== req.user._id.toString()) {
      await projectModel.close();
      return res.status(403).json({ error: 'Access denied' });
    }

    await projectModel.close();

    if (project.type !== 'data-enricher') {
      return res.status(400).json({ error: 'Not a data enricher project' });
    }

    // Connect to project database
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db(`saas_${projectId}`);

    const DataEnricherService = require('../../services/DataEnricherService');
    const service = new DataEnricherService();
    const stats = await service.getEnrichmentStats(projectId, db);
    
    await client.close();

    res.json({ stats });

  } catch (error) {
    console.error('Get enrichment stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete project
router.delete('/:id', async (req, res) => {
  try {
    const projectModel = new Project();
    await projectModel.init();

    const project = await projectModel.findById(req.params.id);
    if (!project) {
      await projectModel.close();
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check ownership
    if (project.userId.toString() !== req.user._id.toString()) {
      await projectModel.close();
      return res.status(403).json({ error: 'Access denied' });
    }

    // Cancel active job if processing
    if (project.status === 'processing') {
      try {
        const { scrapingQueue } = require('../../services/JobQueue');
        const activeJobs = await scrapingQueue.getActive();
        const projectJob = activeJobs.find(job => job.data.projectId === req.params.id);
        
        if (projectJob) {
          await projectJob.remove();
          console.log(`🗑️ Cancelled job ${projectJob.id} for project ${req.params.id}`);
        }
      } catch (jobError) {
        console.log(`⚠️ Could not cancel job:`, jobError.message);
      }
    }

    // Delete project and cleanup
    const deleted = await projectModel.delete(req.params.id);
    await projectModel.close();

    if (deleted) {
      res.json({ message: 'Project deleted successfully' });
    } else {
      res.status(500).json({ error: 'Failed to delete project' });
    }

  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;