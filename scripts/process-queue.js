const Database = require('../config/database');
const DataCleaner = require('../scrapers/DataCleaner');

class DataProcessor {
  constructor() {
    this.database = new Database();
    this.db = null;
    this.processed = 0;
    this.duplicates = 0;
    this.invalid = 0;
  }

  async init() {
    await this.database.init();
    this.db = this.database.db;
  }

  async processRawData() {
    console.log('🔄 Starting data processing...');
    await this.init();
    
    while (true) {
      const batch = await this.database.getRawDataBatch(100);
      if (batch.length === 0) break;
      
      for (const rawData of batch) {
        try {
          await this.processMuseum(rawData);
        } catch (error) {
          console.error(`Error processing museum ${rawData._id}:`, error.message);
        }
      }
      
      console.log(`📊 Processed: ${this.processed}, Duplicates: ${this.duplicates}, Invalid: ${this.invalid}`);
    }
    
    console.log('✅ Data processing completed!');
    await this.database.close();
  }

  async processMuseum(rawData) {
    const cleanData = DataCleaner.cleanMuseumData(rawData);
    
    if (!DataCleaner.isValidMuseum(cleanData)) {
      this.invalid++;
      return;
    }
    
    if (await this.isDuplicate(cleanData)) {
      this.duplicates++;
      return;
    }
    
    await this.insertMuseum(cleanData, rawData._id);
    this.processed++;
  }

  async isDuplicate(data) {
    const query = {
      $or: [
        { name: data.name },
        {
          lat: { $exists: true, $ne: null },
          lng: { $exists: true, $ne: null },
          $expr: {
            $and: [
              { $lt: [{ $abs: { $subtract: ['$lat', data.lat] } }, 0.001] },
              { $lt: [{ $abs: { $subtract: ['$lng', data.lng] } }, 0.001] }
            ]
          }
        }
      ]
    };
    
    const existing = await this.db.collection('museums').findOne(query);
    return !!existing;
  }

  async insertMuseum(data, rawId) {
    const result = await this.db.collection('museums').insertOne({
      ...data,
      raw_id: rawId,
      created_at: new Date()
    });
    return result.insertedId;
  }
}

// Run processor
async function main() {
  const processor = new DataProcessor();
  await processor.processRawData();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = DataProcessor;