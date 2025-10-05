const GenericDatabase = require('../config/database-generic');
const BusinessCleaner = require('../scrapers/BusinessCleaner');
const NicheLoader = require('../config/niche-loader');

class GenericDataProcessor {
  constructor(niche = null) {
    this.niche = niche || NicheLoader.getCurrentNiche();
    this.database = new GenericDatabase(this.niche);
    this.cleaner = new BusinessCleaner(this.niche);
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
    console.log(`🔄 Starting ${this.niche.name} data processing...`);
    await this.init();
    
    const collections = this.niche.database.collections;
    let batchCount = 0;
    
    while (true) {
      const batch = await this.getUnprocessedBatch(100);
      if (batch.length === 0) {
        console.log('No more records to process');
        break;
      }
      
      batchCount++;
      console.log(`Processing batch ${batchCount} with ${batch.length} records`);
      
      for (const rawData of batch) {
        try {
          const result = await this.processBusiness(rawData);
          await this.markAsProcessed(rawData._id, result);
        } catch (error) {
          console.error(`Error processing business ${rawData._id}:`, error.message);
          await this.markAsProcessed(rawData._id, 'failed');
          this.invalid++;
        }
      }
      
      if (batchCount % 10 === 0) {
        console.log(`📊 Batch ${batchCount}: Saved: ${this.processed}, Duplicates: ${this.duplicates}, Invalid: ${this.invalid}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('✅ Data processing completed!');
    await this.showFinalSummary();
    await this.database.close();
  }

  async getUnprocessedBatch(limit) {
    const collections = this.niche.database.collections;
    const processedIds = await this.db.collection(collections.status)
      .distinct('raw_id', {});
    
    return await this.db.collection(collections.raw)
      .find({ _id: { $nin: processedIds } })
      .limit(limit)
      .toArray();
  }

  async processBusiness(rawData) {
    const cleanData = this.cleaner.cleanBusinessData(rawData);
    
    const validationResult = this.validateBusiness(cleanData);
    if (!validationResult.isValid) {
      console.log(`❌ Invalid: ${cleanData.name || 'No name'} - ${validationResult.reason}`);
      this.invalid++;
      return 'invalid';
    }
    
    const duplicateResult = await this.checkDuplicate(cleanData);
    if (duplicateResult.isDuplicate) {
      console.log(`🔄 Duplicate: ${cleanData.name} - ${duplicateResult.reason}`);
      this.duplicates++;
      return 'duplicate';
    }
    
    const insertResult = await this.insertBusiness(cleanData, rawData._id);
    if (insertResult.success) {
      console.log(`✅ Processed: ${cleanData.name}`);
      this.processed++;
      return 'processed';
    }
    
    return 'failed';
  }

  validateBusiness(data) {
    if (!data.name || data.name.length < 2) {
      return { isValid: false, reason: 'Name too short or missing' };
    }
    
    if (this.niche.validation.requireContact && !data.phone && !data.website) {
      return { isValid: false, reason: 'No phone or website contact information' };
    }
    
    const nameLower = data.name.toLowerCase();
    
    if (this.niche.validation.overrideKeyword && nameLower.includes(this.niche.validation.overrideKeyword)) {
      return this.checkQualityThresholds(data);
    }
    
    const excludedKeyword = this.niche.validation.excludeKeywords.find(keyword => nameLower.includes(keyword));
    if (excludedKeyword) {
      return { isValid: false, reason: `Contains excluded keyword: ${excludedKeyword}` };
    }
    
    return this.checkQualityThresholds(data);
  }

  checkQualityThresholds(data) {
    if (data.rating !== null && data.rating < this.niche.validation.minRating) {
      return { isValid: false, reason: `Low rating: ${data.rating} (minimum ${this.niche.validation.minRating})` };
    }
    
    if (data.review_count !== null && data.review_count < this.niche.validation.minReviews) {
      return { isValid: false, reason: `Low review count: ${data.review_count} (minimum ${this.niche.validation.minReviews})` };
    }
    
    return { isValid: true };
  }

  async checkDuplicate(data) {
    const collections = this.niche.database.collections;
    
    if (data.normalized_address && data.normalized_address.trim() && data.country) {
      const existing = await this.db.collection(collections.processed).findOne({
        normalized_address: data.normalized_address,
        country: data.country
      });
      if (existing) {
        return { isDuplicate: true, reason: `Same address in ${data.country}` };
      }
    }
    
    if (data.phone && data.country) {
      const existing = await this.db.collection(collections.processed).findOne({
        phone: data.phone,
        country: data.country
      });
      if (existing) {
        return { isDuplicate: true, reason: `Same phone number in ${data.country}` };
      }
    }
    
    return { isDuplicate: false };
  }

  async insertBusiness(data, rawId) {
    const collections = this.niche.database.collections;
    try {
      const result = await this.db.collection(collections.processed).insertOne({
        ...data,
        raw_id: rawId,
        created_at: new Date()
      });
      return { success: true, insertedId: result.insertedId };
    } catch (error) {
      return { success: false, reason: error.message };
    }
  }

  async markAsProcessed(rawId, status) {
    const collections = this.niche.database.collections;
    await this.db.collection(collections.status).insertOne({
      raw_id: rawId,
      status: status,
      processed_at: new Date()
    });
  }

  async showFinalSummary() {
    const collections = this.niche.database.collections;
    console.log(`\n📊 Final Processing Summary for ${this.niche.name}:`);
    console.log('='.repeat(50));
    
    const totalRawData = await this.db.collection(collections.raw).countDocuments();
    const totalProcessed = await this.db.collection(collections.processed).countDocuments();
    
    console.log(`📁 Total raw data records: ${totalRawData}`);
    console.log(`🏢 ${this.niche.name} successfully saved: ${totalProcessed}`);
    console.log(`🔄 Duplicates found: ${this.duplicates}`);
    console.log(`❌ Invalid records: ${this.invalid}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const nicheName = args[0];
  
  if (!nicheName) {
    console.log('Usage: node scripts/process-niche.js <niche-name>');
    console.log('Available niches:', NicheLoader.listAvailableNiches().join(', '));
    process.exit(1);
  }
  
  try {
    const niche = NicheLoader.loadNiche(nicheName);
    const processor = new GenericDataProcessor(niche);
    await processor.processRawData();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = GenericDataProcessor;