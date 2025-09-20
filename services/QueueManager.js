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
    const priorityCountries = config.priority_countries;
    
    // Group subdivisions by country
    const countries = {};
    for (const item of countriesData) {
      if (!countries[item.country_name]) {
        countries[item.country_name] = [];
      }
      countries[item.country_name].push(item.subdivision_name);
    }
    
    const sortedCountries = Object.keys(countries).sort((a, b) => {
      const aIndex = priorityCountries.indexOf(a);
      const bIndex = priorityCountries.indexOf(b);
      
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });

    for (const country of sortedCountries) {
      const subdivisions = countries[country];
      
      for (const subdivision of subdivisions) {
        for (const queryTemplate of config.queries.primary) {
          const query = queryTemplate
            .replace('{subdivision}', subdivision)
            .replace('{country}', country);
          
          await this.addJob(country, subdivision, query);
        }
        
        if (priorityCountries.includes(country)) {
          for (const queryTemplate of config.queries.secondary) {
            const query = queryTemplate
              .replace('{subdivision}', subdivision)
              .replace('{country}', country);
            
            await this.addJob(country, subdivision, query);
          }
        }
      }
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