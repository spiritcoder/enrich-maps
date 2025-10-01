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
          const result = await this.processMuseum(rawData);
          // Mark as processed regardless of outcome
          await this.markAsProcessed(rawData._id, result);
        } catch (error) {
          console.error(`Error processing museum ${rawData._id}:`, error.message);
          await this.markAsProcessed(rawData._id, 'failed');
          this.invalid++;
        }
      }
      
      // Show progress every 10 batches to reduce log spam
      if (batchCount % 10 === 0) {
        console.log(`📊 Batch ${batchCount}: Saved: ${this.processed}, Duplicates: ${this.duplicates}, Invalid: ${this.invalid}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('✅ Data processing completed!');
    await this.showFinalSummary();
    await this.database.close();
  }

  async showFinalSummary() {
    console.log('\n📊 Final Processing Summary:');
    console.log('=' .repeat(50));
    
    // Get actual counts from database
    const totalRawData = await this.db.collection('raw_museum_data').countDocuments();
    const totalMuseums = await this.db.collection('museums').countDocuments();
    const totalProcessingStatus = await this.db.collection('processing_status').countDocuments();
    
    console.log(`📁 Total raw data records: ${totalRawData}`);
    console.log(`🏛️ Museums successfully saved: ${totalMuseums}`);
    console.log(`🔄 Duplicates found: ${this.duplicates}`);
    console.log(`❌ Invalid records: ${this.invalid}`);
    console.log(`📋 Records processed: ${totalProcessingStatus}`);
    
    const calculatedTotal = totalMuseums + this.duplicates + this.invalid;
    console.log('\nVerification:');
    console.log(`Museums + Duplicates + Invalid = ${calculatedTotal}`);
    console.log(`Total raw data = ${totalRawData}`);
    console.log(`Match: ${calculatedTotal === totalRawData ? '✅ YES' : '❌ NO'}`);
    
    if (calculatedTotal !== totalRawData) {
      const difference = totalRawData - calculatedTotal;
      console.log(`⚠️ Difference: ${difference} records`);
    }
  }

  async getUnprocessedBatch(limit) {
    const processedIds = await this.db.collection('processing_status')
      .distinct('raw_id', {});
    
    return await this.db.collection('raw_museum_data')
      .find({ _id: { $nin: processedIds } })
      .limit(limit)
      .toArray();
  }

  async markAsProcessed(rawId, status) {
    await this.db.collection('processing_status').insertOne({
      raw_id: rawId,
      status: status,
      processed_at: new Date()
    });
  }

  async processMuseum(rawData) {
    const cleanData = DataCleaner.cleanMuseumData(rawData);
    
    const validationResult = this.validateMuseum(cleanData);
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
    
    const insertResult = await this.insertMuseum(cleanData, rawData._id);
    if (insertResult.success) {
      console.log(`✅ Processed: ${cleanData.name}`);
      this.processed++;
      return 'processed';
    } else if (insertResult.isDuplicate) {
      console.log(`🔄 Database duplicate: ${cleanData.name} - ${insertResult.reason}`);
      this.duplicates++;
      return 'duplicate';
    }
    
    return 'failed';
  }

  validateMuseum(data) {
    // Check name length
    if (!data.name || data.name.length < 2) {
      return { isValid: false, reason: 'Name too short or missing' };
    }
    
    // Require at least phone or website
    if (!data.phone && !data.website) {
      return { isValid: false, reason: 'No phone or website contact information' };
    }
    
    const nameLower = data.name.toLowerCase();
    
    // Museum keyword override - if name contains "museum", skip exclusion checks
    if (nameLower.includes('museum')) {
      return this.checkQualityThresholds(data);
    }
    
    // Check for excluded keywords (only if no "museum" in name)
    const excludeKeywords = [
      'restaurant', 'hotel', 'shop', 'store', 'mall', 'parking',
      'hospital', 'school', 'office', 'apartment', 'gas station', 'park'
    ];
    
    const excludedKeyword = excludeKeywords.find(keyword => nameLower.includes(keyword));
    if (excludedKeyword) {
      return { isValid: false, reason: `Contains excluded keyword: ${excludedKeyword}` };
    }
    
    return this.checkQualityThresholds(data);
  }

  checkQualityThresholds(data) {
    // Quality filter: Rating and review thresholds
    if (data.rating !== null && data.rating < 4.3) {
      return { isValid: false, reason: `Low rating: ${data.rating} (minimum 4.0)` };
    }
    
    if (data.review_count !== null && data.review_count < 10) {
      return { isValid: false, reason: `Low review count: ${data.review_count} (minimum 10)` };
    }
    
    return { isValid: true };
  }

  async checkDuplicate(data) {
    // Method 1: Address-based duplicates (most accurate)
    if (data.normalized_address && data.normalized_address.trim() && data.country) {
      const addressQuery = {
        normalized_address: data.normalized_address,
        country: data.country
      };
      
      const existingByAddress = await this.db.collection('museums').findOne(addressQuery);
      if (existingByAddress) {
        return { 
          isDuplicate: true, 
          reason: `Same address in ${data.country}: "${data.address}"` 
        };
      }
    }
    
    // Method 2: Phone number matching (very reliable)
    if (data.phone && data.country) {
      const phoneQuery = {
        phone: data.phone,
        country: data.country
      };
      
      const existingByPhone = await this.db.collection('museums').findOne(phoneQuery);
      if (existingByPhone) {
        return { 
          isDuplicate: true, 
          reason: `Same phone number in ${data.country}: ${data.phone}` 
        };
      }
    }
    
    // Method 3: Website matching (reliable)
    if (data.website && data.country) {
      const websiteQuery = {
        website: data.website,
        country: data.country
      };
      
      const existingByWebsite = await this.db.collection('museums').findOne(websiteQuery);
      if (existingByWebsite) {
        return { 
          isDuplicate: true, 
          reason: `Same website in ${data.country}: ${data.website}` 
        };
      }
    }
    
    // Method 4: Enhanced fuzzy name matching
    const fuzzyResult = await this.checkFuzzyNameDuplicate(data);
    if (fuzzyResult.isDuplicate) {
      return fuzzyResult;
    }
    
    // Method 5: Exact name matching (fallback)
    if (data.name && data.country && data.subdivision) {
      const exactNameQuery = {
        name: data.name,
        country: data.country,
        subdivision: data.subdivision
      };
      
      const existingByExactName = await this.db.collection('museums').findOne(exactNameQuery);
      if (existingByExactName) {
        return { 
          isDuplicate: true, 
          reason: `Exact name match in ${data.subdivision}, ${data.country}` 
        };
      }
    }
    
    return { isDuplicate: false };
  }

  async checkFuzzyNameDuplicate(data) {
    if (!data.name || !data.country || !data.subdivision) {
      return { isDuplicate: false };
    }
    
    // Get museums in same subdivision for comparison
    const sameAreaMuseums = await this.db.collection('museums').find({
      country: data.country,
      subdivision: data.subdivision
    }).toArray();
    
    const normalizedName = this.normalizeName(data.name);
    
    for (const existing of sameAreaMuseums) {
      const existingNormalized = this.normalizeName(existing.name);
      
      // Check for fuzzy matches
      if (this.isFuzzyMatch(normalizedName, existingNormalized)) {
        return {
          isDuplicate: true,
          reason: `Fuzzy name match: "${data.name}" ≈ "${existing.name}" in ${data.subdivision}`
        };
      }
    }
    
    return { isDuplicate: false };
  }

  normalizeName(name) {
    if (!name) return '';
    return name.toLowerCase()
      .replace(/\b(the|a|an)\b/g, '') // Remove articles
      .replace(/\b(museum|gallery|center|centre)\b/g, '') // Remove common words
      .replace(/[^a-z0-9\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();
  }

  isFuzzyMatch(name1, name2) {
    if (!name1 || !name2) return false;
    
    // Exact match after normalization
    if (name1 === name2) return true;
    
    // Check if one name contains the other (for "National Gallery" vs "Gallery")
    if (name1.includes(name2) || name2.includes(name1)) {
      return Math.min(name1.length, name2.length) > 5; // Avoid matching very short names
    }
    
    return false;
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
        return { success: true, insertedId: result.insertedId };
      } catch (error) {
        if (error.code === 11000) {
          if (error.message.includes('slug_1')) {
            // Duplicate slug, add random suffix
            data.slug = `${data.slug}-${Math.random().toString(36).substr(2, 6)}`;
            attempts++;
          } else {
            // Any other duplicate key error - return as duplicate
            return { 
              success: false, 
              isDuplicate: true, 
              reason: error.message.split('dup key:')[0].trim() 
            };
          }
        } else {
          throw error;
        }
      }
    }
    
    return { success: false, isDuplicate: false, reason: 'Max attempts exceeded' };
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