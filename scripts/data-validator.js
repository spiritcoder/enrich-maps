const Database = require('../config/database');

class DataValidator {
  constructor() {
    this.database = new Database();
    this.db = null;
  }

  async init() {
    await this.database.init();
    this.db = this.database.db;
  }

  async validateData() {
    console.log('📊 Starting data validation...');
    await this.init();

    const stats = await this.getStats();
    console.log('\n=== SCRAPING PROGRESS ===');
    console.log(`Total Jobs: ${stats.jobs.total}`);
    console.log(`Completed: ${stats.jobs.completed} (${((stats.jobs.completed/stats.jobs.total)*100).toFixed(1)}%)`);
    console.log(`Processing: ${stats.jobs.processing}`);
    console.log(`Failed: ${stats.jobs.failed}`);
    
    console.log('\n=== DATA QUALITY ===');
    console.log(`Raw Museums: ${stats.raw}`);
    console.log(`Processed Museums: ${stats.processed}`);
    console.log(`Processing Rate: ${((stats.processed/stats.raw)*100).toFixed(1)}%`);

    const issues = await this.findIssues();
    console.log('\n=== QUALITY ISSUES ===');
    console.log(`Missing Coordinates: ${issues.missingCoords}`);
    console.log(`Missing Contact Info: ${issues.missingContact}`);
    console.log(`Potential Duplicates: ${issues.duplicates}`);

    await this.database.close();
  }

  async getStats() {
    const jobsPipeline = [
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          processing: { $sum: { $cond: [{ $eq: ['$status', 'processing'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } }
        }
      }
    ];

    const jobsResult = await this.db.collection('scraping_jobs').aggregate(jobsPipeline).toArray();
    const rawCount = await this.db.collection('raw_museum_data').countDocuments();
    const processedCount = await this.db.collection('museums').countDocuments();

    return {
      jobs: jobsResult[0] || { total: 0, completed: 0, processing: 0, failed: 0 },
      raw: rawCount,
      processed: processedCount
    };
  }

  async findIssues() {
    const missingCoords = await this.db.collection('museums').countDocuments({
      $or: [{ lat: null }, { lng: null }, { lat: { $exists: false } }, { lng: { $exists: false } }]
    });

    const missingContact = await this.db.collection('museums').countDocuments({
      $and: [
        { $or: [{ phone: null }, { phone: { $exists: false } }] },
        { $or: [{ website: null }, { website: { $exists: false } }] }
      ]
    });

    const duplicates = await this.db.collection('museums').aggregate([
      { $group: { _id: '$name', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $count: 'total' }
    ]).toArray();

    return {
      missingCoords,
      missingContact,
      duplicates: duplicates[0]?.total || 0
    };
  }
}

async function main() {
  const validator = new DataValidator();
  await validator.validateData();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = DataValidator;