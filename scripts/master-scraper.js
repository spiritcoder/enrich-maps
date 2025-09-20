const GoogleMapsParser = require('../scrapers/GoogleMapsParser');
const RateLimiter = require('../services/RateLimiter');
const QueueManager = require('../services/QueueManager');
const Database = require('../config/database');
const config = require('../config/scraper');

class MasterScraper {
  constructor() {
    this.db = new Database();
    this.queueManager = new QueueManager();
    this.rateLimiter = new RateLimiter();
    this.scrapers = [];
    this.isRunning = false;
  }

  async init() {
    console.log('🚀 Initializing Museum Scraper...');
    
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

    for (let i = 0; i < config.concurrent_scrapers; i++) {
      const scraper = new GoogleMapsParser(this.rateLimiter);
      await scraper.init();
      this.scrapers.push(scraper);
    }

    console.log(`🔧 Initialized ${this.scrapers.length} concurrent scrapers`);
  }

  async start() {
    this.isRunning = true;
    console.log('🏃 Starting museum scraping...');
    
    const workers = this.scrapers.map((scraper, index) => 
      this.runWorker(scraper, index)
    );

    // Progress monitoring
    this.startProgressMonitoring();

    await Promise.all(workers);
    console.log('✅ All scraping completed!');
  }

  async runWorker(scraper, workerId) {
    while (this.isRunning) {
      try {
        const jobs = await this.queueManager.getNextJobs(1);
        if (jobs.length === 0) {
          console.log(`Worker ${workerId}: No more jobs, waiting...`);
          await new Promise(resolve => setTimeout(resolve, 10000));
          continue;
        }

        const job = jobs[0];
        console.log(`Worker ${workerId}: Processing ${job.query}`);
        
        await this.queueManager.updateJobStatus(job._id, 'processing');
        
        const museums = await scraper.scrapeMuseums(job.query, job.country, job.subdivision);
        
        // Save raw data
        console.log(`Saving ${museums.length} museums to database...`);
        for (const museum of museums) {
          try {
            const result = await this.db.insertRawData(museum);
            console.log(`Saved museum: ${museum.name} with ID: ${result}`);
          } catch (error) {
            console.error(`Error saving museum ${museum.name}:`, error.message);
          }
        }

        await this.queueManager.updateJobStatus(job._id, 'completed', museums.length);
        console.log(`Worker ${workerId}: Completed ${job.query} - Found ${museums.length} museums`);

      } catch (error) {
        console.error(`Worker ${workerId} error:`, error.message);
        if (jobs && jobs[0]) {
          await this.queueManager.updateJobStatus(jobs[0]._id, 'failed');
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
        
        console.log(`📊 Progress: ${progress.completed}/${progress.total} (${percentage}%) - Museums found: ${progress.total_museums}`);
        
        if (progress.completed === progress.total) {
          console.log('🎉 All scraping jobs completed!');
          this.isRunning = false;
        }
      } catch (error) {
        console.error('Progress monitoring error:', error.message);
      }
    }, 30000); // Every 30 seconds
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

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  if (global.masterScraper) {
    await global.masterScraper.stop();
  }
  process.exit(0);
});

// Start the scraper
async function main() {
  const masterScraper = new MasterScraper();
  global.masterScraper = masterScraper;
  
  try {
    await masterScraper.init();
    await masterScraper.start();
  } catch (error) {
    console.error('Fatal error:', error);
    await masterScraper.stop();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = MasterScraper;