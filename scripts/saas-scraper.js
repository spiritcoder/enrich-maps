const GenericDatabase = require('../config/database-generic');
const GenericGoogleMapsParser = require('../scrapers/GenericGoogleMapsParser');
const BusinessCleaner = require('../scrapers/BusinessCleaner');
const RateLimiter = require('../services/RateLimiter');

class SaaSScraper {
  constructor(niche, projectId) {
    this.niche = niche;
    this.projectId = projectId;
    this.database = new GenericDatabase(niche);
    this.parser = new GenericGoogleMapsParser(new RateLimiter(), niche);
    this.cleaner = new BusinessCleaner(niche);
    this.results = {
      found: 0,
      processed: 0,
      errors: 0
    };
  }

  async init() {
    await this.database.init();
    await this.parser.init();
    this.parser.setDatabase(this.database);
  }

  async scrapeCountry(country) {
    console.log(`🌍 Starting scraping for ${country.name}`);
    
    try {
      // Create jobs for each subdivision
      const jobs = country.subdivisions.map(subdivision => ({
        country: country.name,
        subdivision: subdivision,
        query: `${this.niche.search.terms[0]} ${subdivision}, ${country.name}`,
        status: 'pending'
      }));

      let countryResults = { found: 0, processed: 0 };

      // Process each subdivision
      for (const job of jobs) {
        try {
          console.log(`📍 Scraping: ${job.query}`);
          
          const found = await this.parser.scrapeBusinesses(
            job.query,
            job.country,
            job.subdivision
          );

          countryResults.found += found;
          this.results.found += found;

          console.log(`✅ Found ${found} businesses in ${job.subdivision}`);

        } catch (error) {
          console.error(`❌ Error scraping ${job.subdivision}:`, error.message);
          this.results.errors++;
        }
      }

      // Process raw data
      const processed = await this.processRawData();
      countryResults.processed = processed;
      this.results.processed += processed;

      console.log(`🏁 ${country.name} complete: ${countryResults.found} found, ${countryResults.processed} processed`);
      
      return countryResults;

    } catch (error) {
      console.error(`❌ Error processing ${country.name}:`, error.message);
      this.results.errors++;
      return { found: 0, processed: 0 };
    }
  }

  async processRawData() {
    console.log('🔄 Processing raw data...');
    
    let processed = 0;
    let batchCount = 0;
    
    while (true) {
      const batch = await this.getUnprocessedBatch(50);
      if (batch.length === 0) break;
      
      batchCount++;
      console.log(`Processing batch ${batchCount} with ${batch.length} records`);
      
      for (const rawData of batch) {
        try {
          const cleanData = this.cleaner.cleanBusinessData(rawData);
          
          if (this.cleaner.isValidBusiness(cleanData)) {
            const isDuplicate = await this.checkDuplicate(cleanData);
            
            if (!isDuplicate) {
              await this.insertBusiness(cleanData, rawData._id);
              processed++;
            }
          }
          
          await this.markAsProcessed(rawData._id);
          
        } catch (error) {
          console.error(`Error processing business ${rawData._id}:`, error.message);
          await this.markAsProcessed(rawData._id, 'failed');
        }
      }
    }
    
    console.log(`✅ Processed ${processed} businesses`);
    return processed;
  }

  async processRawDataWithLimits(userId) {
    const User = require('../api/models/User');
    const userModel = new User();
    await userModel.init();
    
    const availableLimit = await userModel.getAvailableLimit(userId);
    console.log(`🔄 Processing raw data with available limit: ${availableLimit}`);
    
    let processed = 0;
    let batchCount = 0;
    
    if (availableLimit <= 0) {
      console.log(`⚠️ User has no available credits or subscription limit, skipping processing`);
      await userModel.close();
      return 0;
    }
    
    while (true) {
      const batch = await this.getUnprocessedBatch(50);
      if (batch.length === 0) break;
      
      batchCount++;
      console.log(`Processing batch ${batchCount} with ${batch.length} records`);
      
      for (const rawData of batch) {
        // Check if we've reached the user's limit
        const currentAvailable = await userModel.getAvailableLimit(userId);
        if (currentAvailable <= 0) {
          console.log(`⚠️ User has no more available credits or subscription limit, stopping processing`);
          await userModel.close();
          return processed;
        }
        
        try {
          const cleanData = this.cleaner.cleanBusinessData(rawData);
          
          if (this.cleaner.isValidBusiness(cleanData)) {
            const isDuplicate = await this.checkDuplicate(cleanData);
            
            if (!isDuplicate) {
              await this.insertBusiness(cleanData, rawData._id);
              processed++;
              console.log(`📊 Processed ${processed} businesses (credit system)`);
            }
          }
          
          await this.markAsProcessed(rawData._id);
          
        } catch (error) {
          console.error(`Error processing business ${rawData._id}:`, error.message);
          await this.markAsProcessed(rawData._id, 'failed');
        }
      }
    }
    
    await userModel.close();
    console.log(`✅ Processed ${processed} businesses (within available limit)`);
    return processed;
  }

  async getUnprocessedBatch(limit) {
    const processedIds = await this.database.db
      .collection('processing_status')
      .distinct('raw_id', {});
    
    const rawCollection = this.niche.database.collections.raw || 'raw_data';
    return await this.database.db
      .collection(rawCollection)
      .find({ _id: { $nin: processedIds } })
      .limit(limit)
      .toArray();
  }

  async markAsProcessed(rawId, status = 'processed') {
    await this.database.db.collection('processing_status').insertOne({
      raw_id: rawId,
      status: status,
      processed_at: new Date()
    });
  }

  async checkDuplicate(data) {
    const processedCollection = this.niche.database.collections.processed || 'businesses';
    
    // Address-based duplicate check
    if (data.normalized_address && data.country) {
      const existing = await this.database.db
        .collection(processedCollection)
        .findOne({
          normalized_address: data.normalized_address,
          country: data.country
        });
      
      if (existing) return true;
    }

    // Phone-based duplicate check
    if (data.phone && data.country) {
      const existing = await this.database.db
        .collection(processedCollection)
        .findOne({
          phone: data.phone,
          country: data.country
        });
      
      if (existing) return true;
    }

    return false;
  }

  async insertBusiness(data, rawId) {
    const processedCollection = this.niche.database.collections.processed || 'businesses';
    await this.database.db
      .collection(processedCollection)
      .insertOne({
        ...data,
        raw_id: rawId,
        project_id: this.projectId,
        created_at: new Date()
      });
  }

  async close() {
    await this.parser.close();
    await this.database.close();
  }

  getResults() {
    return this.results;
  }
}

module.exports = SaaSScraper;