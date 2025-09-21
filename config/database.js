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
    await this.db.collection('museums').createIndex({ slug: 1 }, { unique: true });
    await this.db.collection('museums').createIndex({ lat: 1, lng: 1 });
    // Compound unique index for duplicate prevention
    await this.db.collection('raw_museum_data').createIndex(
      { name: 1, subdivision: 1, country: 1 }, 
      { unique: true }
    );
  }

  async insertRawData(data) {
    // Normalize name for better duplicate detection
    const normalizedName = data.name ? data.name.trim() : '';
    
    // Remove scraped_at from data to avoid conflict
    const { scraped_at, ...dataWithoutScrapedAt } = data;
    
    const result = await this.db.collection('raw_museum_data').updateOne(
      { 
        name: normalizedName,
        subdivision: data.subdivision,
        country: data.country
      },
      {
        $set: {
          ...dataWithoutScrapedAt,
          name: normalizedName,
          updated_at: new Date()
        },
        $setOnInsert: {
          scraped_at: new Date()
        }
      },
      { upsert: true }
    );
    
    return result.upsertedId || result.matchedCount;
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