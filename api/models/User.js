const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

class User {
  constructor() {
    this.client = null;
    this.db = null;
    this.collection = null;
  }

  async init() {
    this.client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
    await this.client.connect();
    this.db = this.client.db('scraper_saas');
    this.collection = this.db.collection('users');
    
    // Create indexes
    await this.collection.createIndex({ email: 1 }, { unique: true });
    await this.collection.createIndex({ createdAt: 1 });
  }

  async create(userData) {
    const { email, password, name } = userData;
    
    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    const user = {
      email: email.toLowerCase(),
      password: hashedPassword,
      name,
      plan: 'free',
      usage: {
        currentMonth: 0,
        limit: 100,
        resetDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await this.collection.insertOne(user);
    delete user.password; // Don't return password
    return { ...user, _id: result.insertedId };
  }

  async findByEmail(email) {
    return await this.collection.findOne({ email: email.toLowerCase() });
  }

  async findById(id) {
    const { ObjectId } = require('mongodb');
    const user = await this.collection.findOne({ _id: new ObjectId(id) });
    if (user) delete user.password;
    return user;
  }

  async validatePassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  async updateUsage(userId, increment = 1) {
    const { ObjectId } = require('mongodb');
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Reset usage if new month
    await this.collection.updateOne(
      { 
        _id: new ObjectId(userId),
        'usage.resetDate': { $lt: firstOfMonth }
      },
      {
        $set: {
          'usage.currentMonth': 0,
          'usage.resetDate': new Date(now.getFullYear(), now.getMonth() + 1, 1)
        }
      }
    );

    // Increment usage
    return await this.collection.updateOne(
      { _id: new ObjectId(userId) },
      { 
        $inc: { 'usage.currentMonth': increment },
        $set: { updatedAt: new Date() }
      }
    );
  }

  async close() {
    if (this.client) {
      await this.client.close();
    }
  }
}

module.exports = User;