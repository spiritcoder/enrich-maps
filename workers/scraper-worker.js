const { scrapingQueue, getQueueHealth } = require('../services/JobQueue');
const Project = require('../api/models/Project');
const User = require('../api/models/User');
const SaaSScraper = require('../scripts/saas-scraper');
const { getCountriesForScraping } = require('../utils/countries-loader');


// Process scraping jobs
scrapingQueue.process('scrape-project', async (job) => {
  try {    
    const { projectId, searchTerm, locations, businessLimit, enrichment } = job.data;
    
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
    
    // Scrape each location with progressive saving
    console.log(`🔄 Starting scraping for ${expandedLocations.length} locations`);
    for (const location of expandedLocations) {
      if (totalFound >= businessLimit) break;

      const query = `${searchTerm} ${location.subdivision}, ${location.country}`;
      
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
      
      const savedCount = await scraper.scrapeBusinesses(
        rawCollection,
        query,
        location.country,
        location.subdivision,
        businessLimit - totalFound,
        progressCallback
      );
      
    }
    
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

console.log('✅ Worker ready for jobs');