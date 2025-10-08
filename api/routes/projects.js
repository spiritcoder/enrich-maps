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

    if (businessLimit < 1 || businessLimit > 10000) {
      return res.status(400).json({ error: 'Business limit must be between 1 and 10,000' });
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