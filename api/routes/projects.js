const express = require('express');
const Project = require('../models/Project');
const { authenticateToken } = require('../middleware/auth');
const { createScrapingJob } = require('../../services/JobQueue');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Create new project
router.post('/', async (req, res) => {
  try {
    const { keyword, locations, fields, filters } = req.body;

    // Validation
    if (!keyword || !locations || !Array.isArray(locations) || locations.length === 0) {
      return res.status(400).json({ error: 'Keyword and locations are required' });
    }

    // Check user usage limits with estimation
    const user = req.user;
    const estimatedBusinesses = locations.length * 20; // Conservative estimate
    
    const userModel = new User();
    await userModel.init();
    const availableLimit = await userModel.getAvailableLimit(user._id);
    await userModel.close();
    
    if (availableLimit <= 0) {
      return res.status(403).json({ 
        error: 'No available credits or subscription limit remaining',
        availableLimit: 0
      });
    }
    
    if (estimatedBusinesses > availableLimit) {
      return res.status(403).json({ 
        error: `Estimated ${estimatedBusinesses} businesses exceeds your available limit of ${availableLimit}`,
        availableLimit,
        estimated: estimatedBusinesses
      });
    }

    const projectModel = new Project();
    await projectModel.init();

    // Create project
    const projectData = {
      userId: user._id,
      keyword,
      locations,
      fields: fields || ['name', 'phone', 'website', 'address', 'rating'],
      filters: filters || { minRating: 4.0, minReviews: 5 },
      estimatedCount: locations.length * 50 // Rough estimate per location
    };

    const project = await projectModel.create(projectData);
    await projectModel.close();

    // Add to job queue
    await createScrapingJob(project._id.toString(), projectData);

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