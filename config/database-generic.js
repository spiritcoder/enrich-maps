const { MongoClient } = require('mongodb');
const NicheLoader = require('./niche-loader');

class GenericDatabase {
  constructor(niche = null) {
    this.niche = niche || NicheLoader.getCurrentNiche();
    this.client = null;
    this.db = null;
  }

  async init() {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
    this.client = new MongoClient(uri);
    await this.client.connect();
    this.db = this.client.db(this.niche.database.name);
    
    await this.createIndexes();
    console.log(`📊 Connected to ${this.niche.database.name} database`);
  }

  async createIndexes() {
    const collections = this.niche.database.collections;
    
    // Get collection names with defaults
    const rawCollection = collections.raw || 'raw_data';
    const processedCollection = collections.processed || 'businesses';
    const jobsCollection = collections.jobs || 'scraping_jobs';
    const statusCollection = 'processing_status'; // Always use this name
    
    try {
      // Raw data collection indexes
      await this.db.collection(rawCollection).createIndex({ created_at: 1 });
      
      // Processed data collection indexes
      await this.db.collection(processedCollection).createIndex({ normalized_address: 1, country: 1 });
      await this.db.collection(processedCollection).createIndex({ phone: 1, country: 1 });
      await this.db.collection(processedCollection).createIndex({ name: 1, country: 1, subdivision: 1 });
      
      // Jobs collection indexes
      await this.db.collection(jobsCollection).createIndex({ status: 1 });
      await this.db.collection(jobsCollection).createIndex({ created_at: 1 });
      
      // Processing status indexes
      await this.db.collection(statusCollection).createIndex({ raw_id: 1 }, { unique: true });
      
      console.log('✅ Database indexes created successfully');
    } catch (error) {
      console.log('⚠️ Some indexes may already exist:', error.message);
    }
  }

  async saveRawData(data) {
    const collections = this.niche.database.collections;
    const rawCollection = collections.raw || 'raw_data';
    return await this.db.collection(rawCollection).insertOne({
      ...data,
      created_at: new Date()
    });
  }

  async saveProcessedData(data) {
    const collections = this.niche.database.collections;
    const processedCollection = collections.processed || 'businesses';
    return await this.db.collection(processedCollection).insertOne({
      ...data,
      created_at: new Date()
    });
  }

  async insertRawData(data) {
    return await this.saveRawData(data);
  }

  async close() {
    if (this.client) {
      await this.client.close();
    }
  }
}

module.exports = GenericDatabase;