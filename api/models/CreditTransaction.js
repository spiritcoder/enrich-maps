const { MongoClient, ObjectId } = require('mongodb');

class CreditTransaction {
  constructor() {
    this.client = null;
    this.db = null;
    this.collection = null;
  }

  async init() {
    this.client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
    await this.client.connect();
    this.db = this.client.db('scraper_saas');
    this.collection = this.db.collection('credit_transactions');
    
    // Create indexes
    await this.collection.createIndex({ userId: 1 });
    await this.collection.createIndex({ createdAt: -1 });
    await this.collection.createIndex({ type: 1 });
  }

  async create(transactionData) {
    const transaction = {
      ...transactionData,
      createdAt: new Date()
    };

    const result = await this.collection.insertOne(transaction);
    return { ...transaction, _id: result.insertedId };
  }

  async findByUserId(userId, limit = 50) {
    return await this.collection
      .find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  async close() {
    if (this.client) {
      await this.client.close();
    }
  }
}

module.exports = CreditTransaction;