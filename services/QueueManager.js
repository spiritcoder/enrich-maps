const Database = require('../config/database');
const config = require('../config/scraper');

class QueueManager {
  constructor() {
    this.database = new Database();
    this.db = null;
    this.queue = [];
    this.processing = false;
  }

  async init() {
    await this.database.init();
    this.db = this.database.db;
  }

  async generateJobs() {
    const countriesData = require('../countries_subdivisions.json');
    
    for (const item of countriesData) {
      const query = config.primary_query
        .replace('{subdivision}', item.subdivision_name)
        .replace('{country}', item.country_name);
      
      await this.addJob(item.country_name, item.subdivision_name, query);
    }
  }

  async addJob(country, subdivision, query) {
    const result = await this.db.collection('scraping_jobs').insertOne({
      country,
      subdivision,
      query,
      status: 'pending',
      results_count: 0,
      created_at: new Date()
    });
    return result.insertedId;
  }

  async claimNextJob(workerId) {
    const result = await this.db.collection('scraping_jobs')
      .findOneAndUpdate(
        { status: 'pending' },
        { 
          $set: { 
            status: 'processing',
            worker_id: workerId,
            started_at: new Date()
          }
        },
        { 
          returnDocument: 'after',
          sort: { created_at: 1 }
        }
      );
    
    return result ? result : null;
  }

  async getNextJobs(limit = 10) {
    return await this.db.collection('scraping_jobs')
      .find({ status: 'pending' })
      .limit(limit)
      .toArray();
  }

  async updateJobStatus(jobId, status, resultsCount = 0) {
    const updateData = { status };
    
    if (status === 'completed') {
      updateData.results_count = resultsCount;
      updateData.completed_at = new Date();
    } else if (status === 'processing') {
      updateData.started_at = new Date();
    }
    
    return await this.db.collection('scraping_jobs')
      .updateOne({ _id: jobId }, { $set: updateData });
  }

  async getProgress() {
    const pipeline = [
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          processing: { $sum: { $cond: [{ $eq: ['$status', 'processing'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
          total_museums: { $sum: '$results_count' }
        }
      }
    ];
    
    const result = await this.db.collection('scraping_jobs').aggregate(pipeline).toArray();
    return result[0] || { total: 0, completed: 0, processing: 0, failed: 0, total_museums: 0 };
  }
}

module.exports = QueueManager;