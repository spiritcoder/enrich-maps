const { scrapingQueue } = require('../services/JobQueue');
const Project = require('../api/models/Project');
const User = require('../api/models/User');
const SaaSScraper = require('../scripts/saas-scraper');
const { sendCompletionEmail } = require('../services/EmailService');
const { generateExportFile } = require('../services/FileExporter');
const { getCountriesForScraping } = require('../utils/countries-loader');

// Process scraping jobs
scrapingQueue.process('scrape-project', 1, async (job) => {
  const { projectId, keyword, locations, fields, filters } = job.data;
  
  console.log(`🚀 Starting scraping job for project ${projectId}`);
  
  try {
    // Update project status
    const projectModel = new Project();
    await projectModel.init();
    await projectModel.updateStatus(projectId, 'processing');
    
    // Test initial database update
    console.log(`🧪 Testing initial DB update for project ${projectId}`);
    const testUpdate = await projectModel.updateResults(projectId, {
      found: 0,
      processed: 0
    });
    console.log(`🧪 Initial DB test result:`, testUpdate.modifiedCount > 0 ? 'SUCCESS' : 'NO_CHANGE');
    
    // Get project and user info
    const project = await projectModel.findById(projectId);
    const userModel = new User();
    await userModel.init();
    const user = await userModel.findById(project.userId);
    
    let totalFound = 0;
    let totalProcessed = 0;
    
    // Create dynamic niche config for this job
    const dynamicNiche = {
      name: keyword.replace(/\s+/g, '_').toLowerCase(),
      database: {
        name: `saas_${projectId}`,
        collections: {
          raw: 'raw_data',
          processed: 'businesses',
          jobs: 'scraping_jobs'
        }
      },
      search: {
        terms: [`${keyword} in`],
        maxPerSearch: 50
      },
      validation: {
        includeKeywords: keyword.split(' '),
        excludeKeywords: ['museum', 'hotel', 'hospital', 'school'],
        minRating: filters.minRating || 4.0,
        minReviews: filters.minReviews || 5,
        requireContact: true
      },
      categories: {
        'General': keyword.split(' ')
      }
    };
    
    const scraper = new SaaSScraper(dynamicNiche, projectId);
    await scraper.init();
    
    // Count existing businesses from previous runs
    try {
      const existingRaw = await scraper.database.db.collection('raw_data').countDocuments({});
      const existingProcessed = await scraper.database.db.collection('businesses').countDocuments({});
      
      totalFound = existingRaw;
      totalProcessed = existingProcessed;
      
      console.log(`📊 Found existing data: ${totalFound} raw, ${totalProcessed} processed`);
      
      // Update UI with existing counts
      await projectModel.updateResults(projectId, {
        found: totalFound,
        processed: totalProcessed
      });
      
    } catch (countError) {
      console.log('⚠️ Could not count existing businesses:', countError.message);
    }
    
    // Expand locations - if "All of Country" is selected, get all subdivisions
    const expandedLocations = [];
    for (const location of locations) {
      if (!location.subdivision) {
        // "All of Country" - expand to all subdivisions
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
        // Specific subdivision
        expandedLocations.push(location);
      }
    }
    
    console.log(`📍 Expanded ${locations.length} locations to ${expandedLocations.length} specific searches`);
    
    // Start heartbeat to prevent job stalling
    const heartbeat = setInterval(async () => {
      try {
        const currentProgress = Math.round((totalFound / (expandedLocations.length * 50)) * 100);
        await job.progress(Math.min(currentProgress, 99));
      } catch (error) {
        // Ignore heartbeat errors
      }
    }, 30000); // Every 30 seconds
    
    try {
      // Process each expanded location
      for (let i = 0; i < expandedLocations.length; i++) {
        const location = expandedLocations[i];
        
        // Check if we're approaching the user's limit (refresh user data every 5 locations)
        if (i % 5 === 0) {
          const updatedUser = await userModel.findById(user._id);
          if (updatedUser) {
            user.usage = updatedUser.usage;
          }
        }
        
        const currentTotal = user.usage.currentMonth + totalFound;
        if (currentTotal >= user.usage.limit) {
          console.log(`⚠️ User limit reached (${currentTotal}/${user.usage.limit}), stopping scraping`);
          break;
        }
        
        console.log(`📍 Processing ${location.label} (${i + 1}/${expandedLocations.length})`);
        
        try {
          const query = `${keyword} in ${location.subdivision}, ${location.country}`;
          
          console.log(`🔍 Searching: ${query}`);
          
          const found = await scraper.parser.scrapeBusinesses(
            query,
            location.country,
            location.subdivision,
            // Pass callback for real-time updates
            async (currentBusiness, totalBusinesses) => {
              totalFound++;
              
              // Calculate overall progress: locations completed + current location progress
              const locationsCompleted = i;
              const currentLocationProgress = totalBusinesses > 0 ? (currentBusiness / totalBusinesses) : 0;
              const overallProgress = (locationsCompleted + currentLocationProgress) / expandedLocations.length;
              const progressPercent = Math.round(overallProgress * 100);
              
              try {
                // Update job progress and database
                await job.progress(progressPercent);
                
                console.log(`🔄 Updating DB: projectId=${projectId}, found=${totalFound}, processed=${totalProcessed}`);
                const updateResult = await projectModel.updateResults(projectId, {
                  found: totalFound,
                  processed: totalProcessed
                });
                console.log(`📊 DB Update Result:`, updateResult.modifiedCount > 0 ? 'SUCCESS' : 'NO_CHANGE');
                
                console.log(`📊 Progress: ${progressPercent}% | Found: ${totalFound} businesses | DB Updated`);
              } catch (updateError) {
                console.error(`❌ Failed to update progress:`, updateError.message);
                console.error(`❌ Update error details:`, updateError);
              }
            }
          );
          
          console.log(`✅ Found ${found} businesses in ${location.label}`);
          
        } catch (error) {
          console.error(`❌ Error scraping ${location.label}:`, error.message);
        }
      }
    } finally {
      // Stop heartbeat
      clearInterval(heartbeat);
    }
    
    // Process all raw data with usage limit checks
    console.log('🔄 Processing raw data...');
    const processed = await scraper.processRawDataWithLimits(user.usage.limit, user.usage.currentMonth);
    totalProcessed = processed;
    
    // Update user usage
    await userModel.updateUsage(user._id, totalProcessed);
    
    await scraper.close();
    
    // Generate export file
    const fileUrl = await generateExportFile(projectId, fields, keyword);
    
    // Update project completion
    await projectModel.updateStatus(projectId, 'completed', {
      completedAt: new Date()
    });
    
    await projectModel.updateResults(projectId, {
      found: totalFound,
      processed: totalProcessed,
      fileUrl
    });
    
    // Send completion email (disabled for testing)
    try {
      await sendCompletionEmail(user.email, {
        projectName: `${keyword} scraping`,
        totalFound,
        totalProcessed,
        downloadUrl: fileUrl
      });
    } catch (emailError) {
      console.log('⚠️ Email sending disabled or failed:', emailError.message);
    }
    
    await projectModel.close();
    await userModel.close();
    
    console.log(`✅ Completed scraping job for project ${projectId}`);
    console.log(`📊 Results: ${totalFound} found, ${totalProcessed} processed`);
    
    return {
      success: true,
      totalFound,
      totalProcessed,
      fileUrl
    };
    
  } catch (error) {
    console.error(`❌ Scraping job failed for project ${projectId}:`, error);
    
    // Update project status to failed
    const projectModel = new Project();
    await projectModel.init();
    await projectModel.updateStatus(projectId, 'failed', {
      error: error.message,
      failedAt: new Date()
    });
    await projectModel.close();
    
    throw error;
  }
});

// Recover stuck jobs on startup
async function recoverStuckJobs() {
  try {
    console.log('🔍 Checking for stuck jobs and projects...');
    
    const projectModel = new Project();
    await projectModel.init();
    
    // Check all project statuses for debugging
    const allProjects = await projectModel.collection.find({}).sort({ createdAt: -1 }).limit(10).toArray();
    console.log(`📊 Found ${allProjects.length} recent projects:`);
    allProjects.forEach(p => {
      console.log(`  - Project ${p._id}: ${p.status} (updated: ${p.updatedAt})`);
    });
    
    // Reset stuck projects in database
    const resetCount = await projectModel.resetStuckProjects();
    if (resetCount > 0) {
      console.log(`🔄 Reset ${resetCount} stuck projects in database`);
    }
    
    // Check queue states with error handling
    let waiting = [], active = [], completed = [], failed = [];
    try {
      waiting = await scrapingQueue.getWaiting();
      active = await scrapingQueue.getActive();
      completed = await scrapingQueue.getCompleted();
      failed = await scrapingQueue.getFailed();
      
      console.log(`📊 Queue status: ${waiting.length} waiting, ${active.length} active, ${completed.length} completed, ${failed.length} failed`);
    } catch (redisError) {
      console.log(`⚠️ Redis connection error:`, redisError.message);
      console.log(`🔄 Skipping queue checks, will only check database projects`);
    }
    
    // Check for genuinely stuck projects (processing status but no active job)
    const processingProjects = await projectModel.collection.find({ 
      status: 'processing',
      updatedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } // Only projects stuck for >5 minutes
    }).toArray();
    
    if (processingProjects.length > 0) {
      console.log(`📋 Found ${processingProjects.length} processing projects, checking for stuck ones...`);
      
      for (const project of processingProjects) {
        const hasActiveJob = [...waiting, ...active].some(job => 
          job.data.projectId === project._id.toString()
        );
        
        if (!hasActiveJob) {
          console.log(`🔄 Found stuck project ${project._id} - no active job found`);
          
          // Reset to pending and create new job
          await projectModel.updateStatus(project._id, 'pending');
          
          try {
            await scrapingQueue.add('scrape-project', {
              projectId: project._id.toString(),
              keyword: project.keyword,
              locations: project.locations,
              fields: project.fields,
              filters: project.filters || {}
            }, {
              attempts: 3,
              backoff: { type: 'exponential', delay: 60000 },
              removeOnComplete: 10,
              removeOnFail: 5
            });
            console.log(`✅ Recreated job for stuck project ${project._id}`);
          } catch (error) {
            console.error(`❌ Failed to recreate job for project ${project._id}:`, error.message);
          }
        }
      }
    }
    
    // Also check for pending projects without jobs
    const pendingProjects = await projectModel.collection.find({ status: 'pending' }).toArray();
    if (pendingProjects.length > 0) {
      console.log(`📋 Found ${pendingProjects.length} pending projects, checking if they need jobs...`);
      
      for (const project of pendingProjects) {
        const existingJobs = [...waiting, ...active].filter(job => job.data.projectId === project._id.toString());
        
        if (existingJobs.length === 0) {
          console.log(`🔄 Creating missing job for pending project ${project._id}`);
          
          try {
            await scrapingQueue.add('scrape-project', {
              projectId: project._id.toString(),
              keyword: project.keyword,
              locations: project.locations,
              fields: project.fields,
              filters: project.filters || {}
            }, {
              attempts: 3,
              backoff: { type: 'exponential', delay: 60000 },
              removeOnComplete: 10,
              removeOnFail: 5
            });
            console.log(`✅ Created job for pending project ${project._id}`);
          } catch (error) {
            console.error(`❌ Failed to create job for project ${project._id}:`, error.message);
          }
        }
      }
    }
    
    if (processingProjects.length === 0 && pendingProjects.length === 0) {
      console.log('✅ No stuck projects found');
    }
    
    await projectModel.close();
    
  } catch (error) {
    console.error('❌ Error during job recovery:', error.message);
  }
}

// Run recovery on startup
recoverStuckJobs();

console.log('🔄 Scraper worker started, waiting for jobs...');

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('📴 Shutting down scraper worker...');
  await scrapingQueue.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('📴 Shutting down scraper worker...');
  await scrapingQueue.close();
  process.exit(0);
});