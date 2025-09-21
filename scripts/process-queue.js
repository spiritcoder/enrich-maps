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
      
      // Add some delay to avoid overwhelming the database
      if (this.processed % 50 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
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
    // Only check for exact name matches in same location
    if (!data.name || !data.country || !data.subdivision) {
      return false;
    }
    
    const query = {
      name: data.name,
      country: data.country,
      subdivision: data.subdivision
    };
    
    const existing = await this.db.collection('museums').findOne(query);
    return !!existing;
  }

  async insertMuseum(data, rawId) {
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        const result = await this.db.collection('museums').insertOne({
          ...data,
          raw_id: rawId,
          created_at: new Date()
        });
        return result.insertedId;
      } catch (error) {
        if (error.code === 11000 && error.message.includes('slug_1')) {
          // Duplicate slug, add random suffix
          data.slug = `${data.slug}-${Math.random().toString(36).substr(2, 6)}`;
          attempts++;
        } else {
          throw error;
        }
      }
    }
    
    throw new Error(`Failed to insert museum after ${maxAttempts} attempts`);
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