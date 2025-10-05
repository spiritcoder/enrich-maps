const GenericGoogleMapsParser = require('../scrapers/GenericGoogleMapsParser');
const RateLimiter = require('../services/RateLimiter');
const GenericQueueManager = require('../services/GenericQueueManager');
const GenericDatabase = require('../config/database-generic');
const NicheLoader = require('../config/niche-loader');

class GenericMasterScraper {
  constructor(niche = null) {
    this.niche = niche || NicheLoader.getCurrentNiche();
    this.db = new GenericDatabase(this.niche);
    this.queueManager = new GenericQueueManager(this.niche);
    this.rateLimiter = new RateLimiter();
    this.scrapers = [];
    this.isRunning = false;
  }

  async init() {
    console.log(`🚀 Initializing ${this.niche.name} scraper...`);
    
    console.log('📊 Connecting to MongoDB...');
    await this.db.init();
    console.log('✅ MongoDB connected');
    
    console.log('📋 Initializing queue manager...');
    await this.queueManager.init();
    console.log('✅ Queue manager ready');
    
    const progress = await this.queueManager.getProgress();
    if (progress.total === 0) {
      console.log('📋 Generating scraping jobs...');
      await this.queueManager.generateJobs();
      console.log(`✅ Generated ${(await this.queueManager.getProgress()).total} scraping jobs`);
    }

    const concurrentScrapers = process.env.CONCURRENT_SCRAPERS || 5;
    for (let i = 0; i < concurrentScrapers; i++) {
      const scraper = new GenericGoogleMapsParser(this.rateLimiter, this.niche);
      scraper.setDatabase(this.db);
      await scraper.init();
      this.scrapers.push(scraper);
    }

    console.log(`🔧 Initialized ${this.scrapers.length} concurrent scrapers`);
  }

  async start() {
    this.isRunning = true;
    console.log(`🏃 Starting ${this.niche.name} scraping...`);
    
    const workers = this.scrapers.map((scraper, index) => 
      this.runWorker(scraper, index)
    );

    this.startProgressMonitoring();
    await Promise.all(workers);
    console.log('✅ All scraping completed!');
  }

  async runWorker(scraper, workerId) {
    while (this.isRunning) {
      try {
        const job = await this.queueManager.claimNextJob(workerId);
        if (!job) {
          console.log(`Worker ${workerId}: No more jobs, waiting...`);
          await new Promise(resolve => setTimeout(resolve, 10000));
          continue;
        }

        console.log(`Worker ${workerId}: Processing ${job.query}`);
        
        const savedCount = await scraper.scrapeBusinesses(job.query, job.country, job.subdivision);
        
        await this.queueManager.updateJobStatus(job._id, 'completed', savedCount);
        console.log(`Worker ${workerId}: Completed ${job.query} - Saved ${savedCount} businesses`);

      } catch (error) {
        console.error(`Worker ${workerId} error:`, error.message);
        if (job) {
          await this.queueManager.updateJobStatus(job._id, 'failed');
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  async startProgressMonitoring() {
    setInterval(async () => {
      try {
        const progress = await this.queueManager.getProgress();
        const percentage = ((progress.completed / progress.total) * 100).toFixed(1);
        
        console.log(`📊 Progress: ${progress.completed}/${progress.total} (${percentage}%) - ${this.niche.name} found: ${progress.total_businesses}`);
        
        if (progress.completed === progress.total) {
          console.log('🎉 All scraping jobs completed!');
          this.isRunning = false;
        }
      } catch (error) {
        console.error('Progress monitoring error:', error.message);
      }
    }, 30000);
  }

  async stop() {
    console.log('🛑 Stopping scrapers...');
    this.isRunning = false;
    
    for (const scraper of this.scrapers) {
      await scraper.close();
    }
    
    await this.db.close();
  }
}

module.exports = GenericMasterScraper;