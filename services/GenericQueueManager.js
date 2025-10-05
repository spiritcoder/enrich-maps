const GenericDatabase = require('../config/database-generic');
const NicheLoader = require('../config/niche-loader');

class GenericQueueManager {
  constructor(niche = null) {
    this.niche = niche || NicheLoader.getCurrentNiche();
    this.database = new GenericDatabase(this.niche);
    this.db = null;
  }

  async init() {
    await this.database.init();
    this.db = this.database.db;
  }

  async generateJobs() {
    const countriesData = require('../countries_subdivisions.json');
    
    for (const item of countriesData) {
      for (const searchTerm of this.niche.search.terms) {
        const query = `${searchTerm} ${item.subdivision_name}, ${item.country_name}`;
        await this.addJob(item.country_name, item.subdivision_name, query);
      }
    }
  }

  async addJob(country, subdivision, query) {
    const collections = this.niche.database.collections;
    const result = await this.db.collection(collections.jobs).insertOne({
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
    const collections = this.niche.database.collections;
    const result = await this.db.collection(collections.jobs)
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

  async updateJobStatus(jobId, status, resultsCount = 0) {
    const collections = this.niche.database.collections;
    const updateData = { status };
    
    if (status === 'completed') {
      updateData.results_count = resultsCount;
      updateData.completed_at = new Date();
    } else if (status === 'processing') {
      updateData.started_at = new Date();
    }
    
    return await this.db.collection(collections.jobs)
      .updateOne({ _id: jobId }, { $set: updateData });
  }

  async getProgress() {
    const collections = this.niche.database.collections;
    const pipeline = [
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          processing: { $sum: { $cond: [{ $eq: ['$status', 'processing'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
          total_businesses: { $sum: '$results_count' }
        }
      }
    ];
    
    const result = await this.db.collection(collections.jobs).aggregate(pipeline).toArray();
    return result[0] || { total: 0, completed: 0, processing: 0, failed: 0, total_businesses: 0 };
  }
}

module.exports = GenericQueueManager;