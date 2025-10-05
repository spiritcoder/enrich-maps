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
    
    // Raw data collection indexes
    await this.db.collection(collections.raw).createIndex({ created_at: 1 });
    
    // Processed data collection indexes
    await this.db.collection(collections.processed).createIndex({ slug: 1 }, { unique: true });
    await this.db.collection(collections.processed).createIndex({ normalized_address: 1, country: 1 });
    await this.db.collection(collections.processed).createIndex({ phone: 1, country: 1 });
    await this.db.collection(collections.processed).createIndex({ website: 1, country: 1 });
    await this.db.collection(collections.processed).createIndex({ name: 1, country: 1, subdivision: 1 });
    
    // Jobs collection indexes
    await this.db.collection(collections.jobs).createIndex({ status: 1 });
    await this.db.collection(collections.jobs).createIndex({ created_at: 1 });
    
    // Processing status indexes
    await this.db.collection(collections.status).createIndex({ raw_id: 1 }, { unique: true });
  }

  async saveRawData(data) {
    const collections = this.niche.database.collections;
    return await this.db.collection(collections.raw).insertOne({
      ...data,
      created_at: new Date()
    });
  }

  async saveProcessedData(data) {
    const collections = this.niche.database.collections;
    return await this.db.collection(collections.processed).insertOne({
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