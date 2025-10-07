const Queue = require('bull');
const redis = require('redis');

// Create Redis connection
const redisClient = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined
});

// Create job queue
const scrapingQueue = new Queue('scraping jobs', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    connectTimeout: 10000,
    lazyConnect: true
  },
  settings: {
    stalledInterval: 30 * 1000,    // Check every 30s
    maxStalledCount: 1,            // Max stalled jobs
    stallTimeout: 15 * 60 * 1000   // 15 minutes before stall
  }
});

// Job creation
const createScrapingJob = async (projectId, jobData) => {
  try {
    const job = await scrapingQueue.add('scrape-project', {
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

    console.log(`📋 Created scraping job ${job.id} for project ${projectId}`);
    return job;

  } catch (error) {
    console.error('Error creating scraping job:', error);
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

scrapingQueue.on('progress', (job, progress) => {
  console.log(`📊 Job ${job.id} progress: ${progress}%`);
});

module.exports = {
  scrapingQueue,
  createScrapingJob,
  updateJobProgress,
  getJobStatus,
  redisClient
};