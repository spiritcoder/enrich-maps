const { MongoClient } = require('mongodb');

class Database {
  constructor() {
    this.url = process.env.MONGODB_URL || 'mongodb://localhost:27017';
    this.dbName = 'museum_scraper';
    this.client = null;
    this.db = null;
  }

  async init() {
    this.client = new MongoClient(this.url);
    await this.client.connect();
    this.db = this.client.db(this.dbName);
    
    // Create indexes
    await this.db.collection('museums').createIndex({ name: 1 }, { unique: true });
    await this.db.collection('museums').createIndex({ slug: 1 }, { unique: true });
    await this.db.collection('museums').createIndex({ lat: 1, lng: 1 });
  }

  async insertRawData(data) {
    const result = await this.db.collection('raw_museum_data').insertOne({
      ...data,
      scraped_at: new Date()
    });
    return result.insertedId;
  }

  async getRawDataBatch(limit = 100) {
    const processedIds = await this.db.collection('museums')
      .distinct('raw_id', { raw_id: { $exists: true } });
    
    return await this.db.collection('raw_museum_data')
      .find({ _id: { $nin: processedIds } })
      .limit(limit)
      .toArray();
  }

  async close() {
    if (this.client) {
      await this.client.close();
    }
  }
}

module.exports = Database;