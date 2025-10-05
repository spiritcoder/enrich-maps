const GenericDatabase = require('../config/database-generic');
const NicheLoader = require('../config/niche-loader');

class GenericValidator {
  constructor(nicheName) {
    this.niche = NicheLoader.loadNiche(nicheName);
    this.database = new GenericDatabase(this.niche);
    this.db = null;
  }

  async init() {
    await this.database.init();
    this.db = this.database.db;
  }

  async validateData() {
    console.log(`📊 Starting ${this.niche.name} data validation...`);
    await this.init();

    const stats = await this.getStats();
    console.log('\n=== SCRAPING PROGRESS ===');
    console.log(`Total Jobs: ${stats.jobs.total}`);
    console.log(`Completed: ${stats.jobs.completed} (${((stats.jobs.completed/stats.jobs.total)*100).toFixed(1)}%)`);
    console.log(`Processing: ${stats.jobs.processing}`);
    console.log(`Failed: ${stats.jobs.failed}`);
    
    console.log('\n=== DATA QUALITY ===');
    console.log(`Raw Records: ${stats.raw}`);
    console.log(`Processed Records: ${stats.processed}`);
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

    const jobsResult = await this.db.collection(this.niche.database.collections.jobs).aggregate(jobsPipeline).toArray();
    const rawCount = await this.db.collection(this.niche.database.collections.raw).countDocuments();
    const processedCount = await this.db.collection(this.niche.database.collections.processed).countDocuments();

    return {
      jobs: jobsResult[0] || { total: 0, completed: 0, processing: 0, failed: 0 },
      raw: rawCount,
      processed: processedCount
    };
  }

  async findIssues() {
    const missingCoords = await this.db.collection(this.niche.database.collections.processed).countDocuments({
      $or: [{ lat: null }, { lng: null }, { lat: { $exists: false } }, { lng: { $exists: false } }]
    });

    const missingContact = await this.db.collection(this.niche.database.collections.processed).countDocuments({
      $and: [
        { $or: [{ phone: null }, { phone: { $exists: false } }] },
        { $or: [{ website: null }, { website: { $exists: false } }] }
      ]
    });

    const duplicates = await this.db.collection(this.niche.database.collections.processed).aggregate([
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
  const nicheName = process.argv[2];
  if (!nicheName) {
    console.error('Usage: node validate-niche.js <niche-name>');
    process.exit(1);
  }

  const validator = new GenericValidator(nicheName);
  await validator.validateData();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = GenericValidator;