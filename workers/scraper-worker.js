const { scrapingQueue, getQueueHealth } = require('../services/JobQueue');
const Project = require('../api/models/Project');
const User = require('../api/models/User');
const SaaSScraper = require('../scripts/saas-scraper');
const PureAIEnrichmentService = require('../services/PureAIEnrichmentService');
const { getCountriesForScraping } = require('../utils/countries-loader');


// Process data enricher jobs
scrapingQueue.process('data-enricher', async (job) => {
  try {
    const { projectId, excelFile, locationCount, selectedFields, aiProvider } = job.data;
    
    const projectModel = new Project();
    await projectModel.init();
    await projectModel.updateStatus(projectId, 'processing');
    
    const project = await projectModel.findById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    
    const userModel = new User();
    await userModel.init();
    const user = await userModel.findById(project.userId);
    if (!user) {
      throw new Error(`User not found: ${project.userId}`);
    }
    
    // Validate credits
    const availableCredits = (user.subscription?.monthlyLimit || 50) + (user.credits?.balance || 0) - user.usage.currentMonth;
    if (project.costs.totalCost > availableCredits) {
      throw new Error(`Insufficient credits: need ${project.costs.totalCost}, have ${availableCredits}`);
    }
    
    console.log(`🤖 Processing data enricher: ${locationCount} locations, ${selectedFields.length} fields`);
    
    // Create database connection
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
    await client.connect();
    
    const dbName = `saas_${projectId}`;
    const db = client.db(dbName);
    
    // Process Excel file with AI enrichment and recovery
    const DataEnricherService = require('../services/DataEnricherService');
    const service = new DataEnricherService();
    
    let processedCount = 0;
    let enrichedCount = 0;
    
    const results = await service.processExcelFile(
      excelFile, 
      selectedFields, 
      aiProvider,
      async (current, total, enriched) => {
        processedCount = current;
        enrichedCount = enriched;
        
        const progressPercent = Math.min(Math.round((current / total) * 100), 99);
        await job.progress(progressPercent);
        
        // Update project progress
        await projectModel.updateResults(projectId, {
          found: enrichedCount,
          processed: processedCount
        });
      },
      projectId,
      db,
      false // isRetry = false for initial processing
    );
    
    console.log(`📊 Data enrichment completed: ${enrichedCount} locations enriched`);
    
    // Deduct credits
    await userModel.updateUsage(user._id, project.costs.totalCost);
    console.log(`💳 Deducted ${project.costs.totalCost} credits for data enrichment`);
    
    // Complete project
    await projectModel.updateStatus(projectId, 'completed', { completedAt: new Date() });
    await projectModel.updateResults(projectId, { found: enrichedCount, processed: processedCount });
    await projectModel.updateProgress(projectId, processedCount, locationCount, enrichedCount);
    
    // Close connections
    await client.close();
    await projectModel.close();
    await userModel.close();
    
    console.log(`✅ Data enricher job ${job.id} completed: ${enrichedCount} locations enriched`);
    return { success: true, totalEnriched: enrichedCount, totalProcessed: processedCount };
    
  } catch (error) {
    console.error(`❌ Data enricher job ${job.id} failed:`, error.message);
    
    try {
      const projectModel = new Project();
      await projectModel.init();
      await projectModel.updateStatus(job.data.projectId, 'failed', {
        error: error.message,
        failedAt: new Date()
      });
      await projectModel.close();
    } catch (updateError) {
      console.error('Failed to update project status:', updateError.message);
    }
    
    throw error;
  }
});

// Process enrichment jobs
scrapingQueue.process('enrich-project', async (job) => {
  try {
    const { projectId, enrichment, businessCount, enrichmentCost } = job.data;
    
    const projectModel = new Project();
    await projectModel.init();
    
    const project = await projectModel.findById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    
    const userModel = new User();
    await userModel.init();
    const user = await userModel.findById(project.userId);
    if (!user) {
      throw new Error(`User not found: ${project.userId}`);
    }
    
    // Connect to project database to get actual business count
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
    await client.connect();
    
    const db = client.db(`saas_${projectId}`);
    const businessCollection = db.collection('businesses');
    
    // Get actual business count from database
    const actualBusinessCount = await businessCollection.countDocuments({ project_id: projectId });
    
    if (actualBusinessCount === 0) {
      await client.close();
      throw new Error('No businesses found to enrich');
    }
    
    // Calculate actual enrichment cost
    const { AI_PROVIDERS } = require('../config/enrichment-config');
    const provider = AI_PROVIDERS[enrichment.aiProvider];
    const actualEnrichmentCost = actualBusinessCount * (provider?.costPerBusiness || 0);
    
    // Validate credits with actual cost
    const availableCredits = (user.subscription?.monthlyLimit || 50) + (user.credits?.balance || 0) - user.usage.currentMonth;
    if (actualEnrichmentCost > availableCredits) {
      await client.close();
      throw new Error(`Insufficient credits: need ${actualEnrichmentCost}, have ${availableCredits}`);
    }
    
    console.log(`💳 Starting enrichment: ${actualBusinessCount} businesses, ${actualEnrichmentCost} credits`);
    
    // Initialize SaaSScraper for enrichment
    const scraper = new SaaSScraper(projectId);
    
    // Enrich all businesses (force enrichment for post-processing)
    const enrichedCount = await scraper.enrichBusinessData(db, enrichment, actualBusinessCount, true);
    
    // Deduct credits based on actual enriched count
    const finalCost = enrichedCount * (provider?.costPerBusiness || 0);
    await userModel.updateUsage(user._id, finalCost);
    
    await client.close();
    
    // Complete enrichment
    await projectModel.updateStatus(projectId, 'completed', { 
      enrichedAt: new Date(),
      lastEnrichment: {
        provider: enrichment.aiProvider,
        fields: enrichment.fields,
        businessCount: enrichedCount,
        cost: finalCost
      }
    });
    
    await projectModel.updateProgress(projectId, actualBusinessCount, actualBusinessCount, enrichedCount);
    
    await projectModel.close();
    await userModel.close();
    
    console.log(`✅ Enrichment job ${job.id} completed: ${enrichedCount} businesses enriched`);
    return { success: true, enrichedCount, cost: finalCost };
    
  } catch (error) {
    console.error(`❌ Enrichment job ${job.id} failed:`, error.message);
    
    // Reset project status to completed (don't mark as failed for enrichment errors)
    try {
      const projectModel = new Project();
      await projectModel.init();
      await projectModel.updateStatus(job.data.projectId, 'completed', {
        enrichmentError: error.message,
        enrichmentFailedAt: new Date()
      });
      await projectModel.close();
    } catch (updateError) {
      console.error('Failed to update project status:', updateError.message);
    }
    
    throw error;
  }
});

// Process Excel lookup retry jobs
scrapingQueue.process('excel-lookup-retry', async (job) => {
  try {
    const { projectId, excelFile, failedCount, enrichment } = job.data;
    
    const projectModel = new Project();
    await projectModel.init();
    await projectModel.updateStatus(projectId, 'processing');
    
    const project = await projectModel.findById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    
    console.log(`🔄 Retrying ${failedCount} failed records for project ${projectId}`);
    
    // Create database connection
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
    await client.connect();
    
    const dbName = `saas_${projectId}`;
    const db = client.db(dbName);
    
    // Process Excel file in retry mode
    const ExcelLookupService = require('../services/ExcelLookupService');
    const service = new ExcelLookupService();
    
    let processedCount = 0;
    let foundCount = 0;
    
    const results = await service.processExcelFile(excelFile, async (current, total, found) => {
      processedCount = current;
      foundCount = found;
      
      const progressPercent = Math.min(Math.round((current / total) * 100), 99);
      await job.progress(progressPercent);
      
      // Update project progress in real-time
      await projectModel.updateResults(projectId, {
        found: project.results.found + foundCount,
        processed: project.results.processed
      });
    }, projectId, db, true); // retryFailed = true
    
    console.log(`📊 Retry completed: ${foundCount} previously failed records now found`);
    
    // Handle enrichment for newly found records if enabled
    let enrichedCount = 0;
    if (enrichment?.enabled && enrichment.fields?.length > 0 && foundCount > 0) {
      const { AI_PROVIDERS } = require('../config/enrichment-config');
      const enrichmentRate = AI_PROVIDERS[enrichment.aiProvider]?.costPerBusiness || 0;
      const enrichmentCost = foundCount * enrichmentRate;
      
      const userModel = new User();
      await userModel.init();
      const user = await userModel.findById(project.userId);
      const remainingCredits = (user.subscription?.monthlyLimit || 50) + (user.credits?.balance || 0) - user.usage.currentMonth;
      
      if (enrichmentCost <= remainingCredits) {
        const SaaSScraper = require('../scripts/saas-scraper');
        const scraper = new SaaSScraper(projectId);
        enrichedCount = await scraper.enrichBusinessData(db, enrichment, foundCount);
        
        const actualEnrichmentCost = enrichedCount * enrichmentRate;
        await userModel.updateUsage(user._id, actualEnrichmentCost);
      }
      
      await userModel.close();
    }
    
    // Complete project before closing connections
    await projectModel.updateStatus(projectId, 'completed', { 
      completedAt: new Date(),
      lastRetry: {
        retriedAt: new Date(),
        failedRecordsRetried: failedCount,
        newlyFound: foundCount
      }
    });
    
    // Close all connections after operations complete
    await client.close();
    await projectModel.close();
    
    console.log(`✅ Excel retry job ${job.id} completed: ${foundCount} new records found`);
    return { success: true, newlyFound: foundCount, retriedCount: failedCount };
    
  } catch (error) {
    console.error(`❌ Excel retry job ${job.id} failed:`, error.message);
    
    try {
      const projectModel = new Project();
      await projectModel.init();
      await projectModel.updateStatus(job.data.projectId, 'failed', {
        error: error.message,
        failedAt: new Date(),
        retryFailed: true
      });
      await projectModel.close();
    } catch (updateError) {
      console.error('Failed to update project status:', updateError.message);
    }
    
    throw error;
  }
});

// Process Excel lookup jobs
scrapingQueue.process('excel-lookup', async (job) => {
  try {
    const { projectId, excelFile, businessCount, enrichment } = job.data;
    
    const projectModel = new Project();
    await projectModel.init();
    await projectModel.updateStatus(projectId, 'processing');
    
    const project = await projectModel.findById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    
    const userModel = new User();
    await userModel.init();
    const user = await userModel.findById(project.userId);
    if (!user) {
      throw new Error(`User not found: ${project.userId}`);
    }
    
    // Validate credits
    const availableCredits = (user.subscription?.monthlyLimit || 50) + (user.credits?.balance || 0) - user.usage.currentMonth;
    if (project.costs.totalCost > availableCredits) {
      throw new Error(`Insufficient credits: need ${project.costs.totalCost}, have ${availableCredits}`);
    }
    
    console.log(`📊 Processing Excel file: ${businessCount} businesses`);
    
    // Create database connection
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
    await client.connect();
    
    const dbName = `saas_${projectId}`;
    const db = client.db(dbName);
    const businessCollection = db.collection('businesses');
    
    // Process Excel file with progressive saving
    const ExcelLookupService = require('../services/ExcelLookupService');
    const service = new ExcelLookupService();
    
    let processedCount = 0;
    let foundCount = 0;
    
    const results = await service.processExcelFile(excelFile, async (current, total, found) => {
      processedCount = current;
      foundCount = found;
      
      const progressPercent = Math.min(Math.round((current / total) * 100), 99);
      await job.progress(progressPercent);
      
      // Update project progress in real-time
      await projectModel.updateResults(projectId, {
        found: foundCount,
        processed: processedCount
      });
      
      // Update checkpoint for recovery
      await projectModel.updateCheckpoint(projectId, {
        last_processed_row: current - 1,
        processed_count: processedCount,
        found_count: foundCount,
        last_updated: new Date()
      });
    }, projectId, db);
    
    // Results are already saved progressively, no batch save needed
    console.log(`📊 Progressive saving completed: ${foundCount} businesses saved`);
    
    // Deduct base credits for found businesses only
    await userModel.updateUsage(user._id, foundCount);
    console.log(`💳 Deducted ${foundCount} credits for Excel lookup`);
    
    // Handle enrichment if enabled
    let enrichedCount = 0;
    if (enrichment?.enabled && enrichment.fields?.length > 0 && foundCount > 0) {
      const { AI_PROVIDERS } = require('../config/enrichment-config');
      const enrichmentRate = AI_PROVIDERS[enrichment.aiProvider]?.costPerBusiness || 0;
      const enrichmentCost = foundCount * enrichmentRate;
      
      const currentUser = await userModel.findById(user._id);
      const remainingCredits = (currentUser.subscription?.monthlyLimit || 50) + (currentUser.credits?.balance || 0) - currentUser.usage.currentMonth;
      
      if (enrichmentCost <= remainingCredits) {
        const SaaSScraper = require('../scripts/saas-scraper');
        const scraper = new SaaSScraper(projectId);
        enrichedCount = await scraper.enrichBusinessData(db, enrichment, foundCount);
        
        const actualEnrichmentCost = enrichedCount * enrichmentRate;
        await userModel.updateUsage(user._id, actualEnrichmentCost);
      }
    }
    
    // Complete project before closing connections
    await projectModel.updateStatus(projectId, 'completed', { completedAt: new Date() });
    await projectModel.updateResults(projectId, { found: foundCount, processed: processedCount });
    await projectModel.updateProgress(projectId, processedCount, businessCount, enrichedCount);
    
    // PHASE 2: Clear checkpoint on successful completion
    await projectModel.clearCheckpoint(projectId);
    
    // Close all connections after operations complete
    await client.close();
    await projectModel.close();
    await userModel.close();
    
    console.log(`✅ Excel lookup job ${job.id} completed: ${foundCount} businesses found`);
    return { success: true, totalFound: foundCount, totalProcessed: foundCount };
    
  } catch (error) {
    console.error(`❌ Excel lookup job ${job.id} failed:`, error.message);
    
    try {
      const projectModel = new Project();
      await projectModel.init();
      
      // PHASE 3: Enhanced error logging with recovery info
      const checkpoint = await projectModel.getCheckpoint(job.data.projectId);
      
      await projectModel.updateStatus(job.data.projectId, 'failed', {
        error: error.message,
        failedAt: new Date(),
        canRecover: !!checkpoint,
        lastProcessedRow: checkpoint?.last_processed_row || 0,
        recoveryInfo: {
          processedCount: checkpoint?.processed_count || 0,
          foundCount: checkpoint?.found_count || 0,
          lastUpdated: checkpoint?.last_updated
        }
      });
      
      await projectModel.close();
    } catch (updateError) {
      console.error('Failed to update project status:', updateError.message);
    }
    
    throw error;
  }
});

// Process scraping jobs
scrapingQueue.process('scrape-project', async (job) => {
  try {    
    const { projectId, searchTerm, locations, businessLimit, businessesPerLocation, enrichment } = job.data;
    
    // Step 2.1: Pre-Processing Credit Validation
    const projectModel = new Project();
    await projectModel.init();
    await projectModel.updateStatus(projectId, 'processing');
    
    const project = await projectModel.findById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    
    const userModel = new User();
    await userModel.init();
    const user = await userModel.findById(project.userId);
    if (!user) {
      throw new Error(`User not found: ${project.userId}`);
    }
    
    // Re-validate user has enough credits when job starts
    const availableCredits = (user.subscription?.monthlyLimit || 50) + (user.credits?.balance || 0) - user.usage.currentMonth;
    if (project.costs.totalCost > availableCredits) {
      throw new Error(`Insufficient credits: need ${project.costs.totalCost}, have ${availableCredits}`);
    }
    
    console.log(`💳 Credits available: ${availableCredits}, required: ${project.costs.totalCost}`);
    
    // Create database connection
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
    await client.connect();
    
    const dbName = `saas_${projectId}`;
    const db = client.db(dbName);
    const rawCollection = db.collection('raw_data');
    
    // Initialize SaaSScraper
    const scraper = new SaaSScraper(projectId);
    
    let totalFound = 0;
    let totalProcessed = 0;
    
    // Expand locations
    const expandedLocations = [];
    for (const location of locations) {
      if (!location.subdivision) {
        const countryData = getCountriesForScraping([location.country]);
        if (countryData.length > 0 && countryData[0].subdivisions) {
          countryData[0].subdivisions.forEach(subdivision => {
            expandedLocations.push({
              country: location.country,
              subdivision: subdivision,
              label: `${subdivision}, ${location.country}`
            });
          });
        }
      } else {
        expandedLocations.push(location);
      }
    }
    
    // Use new location-aware scraping method
    console.log(`🔄 Starting scraping for ${expandedLocations.length} locations`);
    console.log(`📊 Business limit: ${businessLimit}, Per location: ${businessesPerLocation || 'unlimited'}`);
    
    // Progress callback for real-time updates
    const progressCallback = async (savedCount) => {
      totalFound++;
      const progressPercent = Math.min(Math.round((totalFound / businessLimit) * 100), 99);
      await job.progress(progressPercent);
      
      await projectModel.updateResults(projectId, {
        found: totalFound,
        processed: totalProcessed
      });
    };
    
    totalFound = await scraper.scrapeWithLocationLimits(
      rawCollection,
      expandedLocations,
      searchTerm,
      businessLimit,
      businessesPerLocation,
      progressCallback
    );
    
    // Process raw data using SaaSScraper's methods
    totalProcessed = await scraper.processRawData(db, businessLimit);
    
    // Step 2.2: Scraping Phase Credit Management
    await userModel.updateUsage(user._id, totalProcessed);
    
    // Step 2.3: Enrichment Phase Credit Management
    let enrichedCount = 0;
    if (enrichment?.enabled && enrichment.fields?.length > 0) {
      const { AI_PROVIDERS } = require('../config/enrichment-config');
      const enrichmentRate = AI_PROVIDERS[enrichment.aiProvider]?.costPerBusiness || 0;
      const enrichmentCost = totalProcessed * enrichmentRate;
      
      // Check remaining credits before starting enrichment
      const currentUser = await userModel.findById(user._id);
      const remainingCredits = (currentUser.subscription?.monthlyLimit || 50) + (currentUser.credits?.balance || 0) - currentUser.usage.currentMonth;
      
      if (enrichmentCost > remainingCredits) {
        console.log(`⚠️ Insufficient credits for enrichment: need ${enrichmentCost}, have ${remainingCredits}`);
      } else {
        enrichedCount = await scraper.enrichBusinessData(db, enrichment, totalProcessed);
        
        // Deduct enrichment credits immediately after enrichment
        const actualEnrichmentCost = enrichedCount * enrichmentRate;
        await userModel.updateUsage(user._id, actualEnrichmentCost);
        console.log(`💳 Deducted ${actualEnrichmentCost} enrichment credits`);
      }
    }
    
    await client.close();
    
    // Complete project (no auto Excel generation)
    await projectModel.updateStatus(projectId, 'completed', { completedAt: new Date() });
    await projectModel.updateResults(projectId, { found: totalFound, processed: totalProcessed });
    await projectModel.updateProgress(projectId, totalProcessed, businessLimit, enrichedCount);
    
    await projectModel.close();
    await userModel.close();
    
    console.log(`✅ Job ${job.id} completed`);
    return { success: true, totalFound, totalProcessed };
    
  } catch (error) {
    console.error(`❌ Job ${job.id} failed:`, error.message);
    
    // Step 4.1: Error Handling - Mark project as failed
    try {
      const projectModel = new Project();
      await projectModel.init();
      await projectModel.updateStatus(job.data.projectId, 'failed', {
        error: error.message,
        failedAt: new Date()
      });
      await projectModel.close();
    } catch (updateError) {
      console.error('Failed to update project status:', updateError.message);
    }
    
    throw error;
  }
});

// Process AI-only enrichment jobs
scrapingQueue.process('ai-enrichment-only', async (job) => {
  try {
    const { projectId, excelFile, businessCount, selectedFields, aiProvider, enrichmentCost } = job.data;
    
    const projectModel = new Project();
    await projectModel.init();
    await projectModel.updateStatus(projectId, 'processing');
    
    const project = await projectModel.findById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    
    const userModel = new User();
    await userModel.init();
    const user = await userModel.findById(project.userId);
    if (!user) {
      throw new Error(`User not found: ${project.userId}`);
    }
    
    // Validate credits
    const availableCredits = (user.subscription?.monthlyLimit || 50) + (user.credits?.balance || 0) - user.usage.currentMonth;
    if (enrichmentCost > availableCredits) {
      throw new Error(`Insufficient credits: need ${enrichmentCost}, have ${availableCredits}`);
    }
    
    console.log(`🤖 Processing AI-only enrichment: ${businessCount} businesses`);
    
    // Create database connection
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
    await client.connect();
    
    const dbName = `saas_${projectId}`;
    const db = client.db(dbName);
    
    // Process Excel file with AI enrichment
    const service = new PureAIEnrichmentService();
    
    let processedCount = 0;
    let enrichedCount = 0;
    
    const results = await service.processExcelFileWithAI(
      excelFile,
      selectedFields,
      aiProvider,
      async (current, total, enriched) => {
        processedCount = current;
        enrichedCount = enriched;
        
        const progressPercent = Math.min(Math.round((current / total) * 100), 99);
        await job.progress(progressPercent);
        
        // Update project progress
        await projectModel.updateResults(projectId, {
          found: enrichedCount,
          processed: processedCount
        });
        
        await projectModel.updateProgress(projectId, processedCount, total, enrichedCount);
      },
      projectId,
      db
    );
    
    console.log(`📊 AI enrichment completed: ${results.enrichedCount} businesses enriched`);
    
    // Deduct credits based on actual enriched count
    const { AI_PROVIDERS } = require('../config/enrichment-config');
    const provider = AI_PROVIDERS[aiProvider];
    const actualCost = results.enrichedCount * (provider?.costPerBusiness || 0);
    
    await userModel.updateUsage(user._id, actualCost);
    console.log(`💳 Deducted ${actualCost} credits for AI enrichment`);
    
    // Complete project
    await projectModel.updateStatus(projectId, 'completed', { 
      completedAt: new Date(),
      enrichmentResults: {
        enriched: results.enrichedCount,
        failed: results.failedCount,
        totalProcessed: results.totalProcessed
      }
    });
    
    // Clear checkpoint on success
    await service.clearCheckpoint(projectId);
    
    // Close connections
    await client.close();
    await projectModel.close();
    await userModel.close();
    
    console.log(`✅ AI enrichment job ${job.id} completed: ${results.enrichedCount} businesses enriched`);
    return { success: true, ...results };
    
  } catch (error) {
    console.error(`❌ AI enrichment job ${job.id} failed:`, error.message);
    
    try {
      const projectModel = new Project();
      await projectModel.init();
      await projectModel.updateStatus(job.data.projectId, 'failed', {
        error: error.message,
        failedAt: new Date()
      });
      await projectModel.close();
    } catch (updateError) {
      console.error('Failed to update project status:', updateError.message);
    }
    
    throw error;
  }
});

// Process AI enrichment resume jobs
scrapingQueue.process('ai-enrichment-resume', async (job) => {
  try {
    const { projectId } = job.data;
    
    const projectModel = new Project();
    await projectModel.init();
    const project = await projectModel.findById(projectId);
    
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    
    console.log(`🔄 Resuming AI enrichment for project ${projectId}`);
    
    // Get checkpoint to find original file and settings
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
    await client.connect();
    
    const db = client.db(`saas_${projectId}`);
    const service = new PureAIEnrichmentService();
    const checkpoint = await service.getCheckpoint(projectId);
    
    if (!checkpoint) {
      throw new Error('No checkpoint found to resume from');
    }
    
    // Resume processing
    const results = await service.processExcelFileWithAI(
      checkpoint.checkpoint_data.filename,
      checkpoint.checkpoint_data.selected_fields,
      checkpoint.checkpoint_data.ai_provider,
      async (current, total, enriched) => {
        const progressPercent = Math.min(Math.round((current / total) * 100), 99);
        await job.progress(progressPercent);
        
        await projectModel.updateResults(projectId, {
          found: enriched,
          processed: current
        });
      },
      projectId,
      db
    );
    
    await projectModel.updateStatus(projectId, 'completed', { 
      completedAt: new Date(),
      resumedAt: new Date()
    });
    
    await client.close();
    await projectModel.close();
    
    console.log(`✅ AI enrichment resume job ${job.id} completed`);
    return { success: true, ...results };
    
  } catch (error) {
    console.error(`❌ AI enrichment resume job ${job.id} failed:`, error.message);
    throw error;
  }
});

// Process AI enrichment retry jobs
scrapingQueue.process('ai-enrichment-retry', async (job) => {
  try {
    const { projectId } = job.data;
    
    console.log(`🔄 Retrying failed AI enrichments for project ${projectId}`);
    
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
    await client.connect();
    
    const db = client.db(`saas_${projectId}`);
    const service = new PureAIEnrichmentService();
    const checkpoint = await service.getCheckpoint(projectId);
    
    if (!checkpoint) {
      throw new Error('No checkpoint found for retry');
    }
    
    // Retry with isRetry flag
    const results = await service.processExcelFileWithAI(
      checkpoint.checkpoint_data.filename,
      checkpoint.checkpoint_data.selected_fields,
      checkpoint.checkpoint_data.ai_provider,
      async (current, total, enriched) => {
        const progressPercent = Math.min(Math.round((current / total) * 100), 99);
        await job.progress(progressPercent);
      },
      projectId,
      db,
      true // isRetry = true
    );
    
    await client.close();
    
    console.log(`✅ AI enrichment retry job ${job.id} completed`);
    return { success: true, ...results };
    
  } catch (error) {
    console.error(`❌ AI enrichment retry job ${job.id} failed:`, error.message);
    throw error;
  }
});

console.log('✅ Worker ready for jobs');