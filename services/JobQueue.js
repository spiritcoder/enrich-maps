const Queue = require('bull');
const redis = require('redis');

// Redis configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined
};

// Create Redis client for manual operations
const redisClient = redis.createClient(redisConfig);

// Connect Redis client and add event listeners
redisClient.on('connect', () => {
  console.log('🔗 Redis client connected');
});

// Create job queue with same Redis config
const scrapingQueue = new Queue('scraping jobs', {
  redis: {
    ...redisConfig,
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    connectTimeout: 10000,
    lazyConnect: false  // Changed to false to connect immediately
  },
  settings: {
    stalledInterval: 30 * 1000,    // Check every 30s
    maxStalledCount: 3,            // Allow 3 stalls for web scraping
    stallTimeout: 20 * 60 * 1000   // 20 minutes before stall
  }
});


// Job creation
const createScrapingJob = async (projectId, jobData) => {
  try {
    // Determine job type from jobData
    const jobType = jobData.jobType || 'scrape-project';
    
    const job = await scrapingQueue.add(jobType, {
      projectId,
      ...jobData
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 60000 // 1 minute
      },
      removeOnComplete: 10,
      removeOnFail: 5
    });

    return job;

  } catch (error) {
    console.error('🎯 QUEUE: Error creating job:', error);
    console.error('Error creating job:', error);
    throw error;
  }
};

// Job progress tracking
const updateJobProgress = async (jobId, progress) => {
  try {
    const job = await scrapingQueue.getJob(jobId);
    if (job) {
      await job.progress(progress);
    }
  } catch (error) {
    console.error('Error updating job progress:', error);
  }
};

// Get job status
const getJobStatus = async (jobId) => {
  try {
    const job = await scrapingQueue.getJob(jobId);
    if (!job) return null;

    return {
      id: job.id,
      progress: job.progress(),
      state: await job.getState(),
      data: job.data,
      createdAt: new Date(job.timestamp),
      processedOn: job.processedOn ? new Date(job.processedOn) : null,
      finishedOn: job.finishedOn ? new Date(job.finishedOn) : null
    };
  } catch (error) {
    console.error('Error getting job status:', error);
    return null;
  }
};

// Queue monitoring
scrapingQueue.on('completed', (job, result) => {
  console.log(`✅ Job ${job.id} completed successfully`);
});

scrapingQueue.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err.message);
});

// Queue health check function
const getQueueHealth = async () => {
  try {
    const waiting = await scrapingQueue.getWaiting();
    const active = await scrapingQueue.getActive();
    const completed = await scrapingQueue.getCompleted();
    const failed = await scrapingQueue.getFailed();
    
    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length
    };
  } catch (error) {
    console.error('Error getting queue health:', error.message);
    return null;
  }
};

module.exports = {
  scrapingQueue,
  createScrapingJob,
  updateJobProgress,
  getJobStatus,
  getQueueHealth,
  redisClient
};