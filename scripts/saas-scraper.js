const GenericGoogleMapsParser = require('../scrapers/GenericGoogleMapsParser');
const RateLimiter = require('../services/RateLimiter');

class SaaSScraper {
  constructor(projectId = null) {
    this.projectId = projectId;
    this.parsers = [];
    this.rateLimiter = new RateLimiter();
    this.jobQueue = [];
    this.jobIndex = 0;
    this.checkpointCollection = null;
    this.results = {
      found: 0,
      processed: 0,
      errors: 0
    };
  }

  async init() {
    const concurrentScrapers = process.env.CONCURRENT_SCRAPERS || 5;
    for (let i = 0; i < concurrentScrapers; i++) {
      const parser = new GenericGoogleMapsParser(this.rateLimiter);
      await parser.init();
      this.parsers.push(parser);
    }
    console.log(`🔧 Initialized ${this.parsers.length} concurrent scrapers`);
  }

  getNextJob() {
    if (this.jobIndex >= this.jobQueue.length) return null;
    return this.jobQueue[this.jobIndex++];
  }

  // New method for worker compatibility with progressive saving
  async scrapeBusinesses(rawCollection, query, country, subdivision, limit = 100, progressCallback = null, parser = null) {
    try {
      // Use provided parser or fall back to first parser
      const selectedParser = parser || this.parsers[0];
      if (!selectedParser) {
        await this.init();
        return await this.scrapeBusinesses(rawCollection, query, country, subdivision, limit, progressCallback, this.parsers[0]);
      }
      
      const savedCount = await this.extractAndSaveBusinesses(rawCollection, query, country, subdivision, limit, progressCallback, selectedParser);
      return savedCount;
      
    } catch (error) {
      console.error(`❌ SaaSScraper error:`, error.message);
      return 0;
    }
  }

  async scrapeWithLocationLimits(rawCollection, locations, searchTerm, businessLimit, businessesPerLocation = null, progressCallback = null) {
    if (!this.parsers.length) {
      await this.init();
    }

    // Initialize checkpoint collection
    this.checkpointCollection = rawCollection.s.db.collection('scraping_checkpoints');
    
    // Create job queue from locations
    this.jobQueue = [];
    this.jobIndex = 0;
    let remainingLimit = businessLimit;

    for (const location of locations) {
      if (remainingLimit <= 0) break;
      
      let locationLimit = businessesPerLocation || remainingLimit;
      locationLimit = Math.min(locationLimit, remainingLimit);
      
      const query = location.subdivision 
        ? `${searchTerm} in ${location.subdivision}, ${location.country}`
        : `${searchTerm} in ${location.country}`;
      
      this.jobQueue.push({
        id: `${location.country}_${location.subdivision || 'main'}`,
        query,
        country: location.country,
        subdivision: location.subdivision,
        limit: locationLimit,
        label: location.label
      });
      
      remainingLimit -= locationLimit;
    }

    // Resume from checkpoint
    await this.resumeFromCheckpoint();

    console.log(`🚀 Starting concurrent scraping with ${this.parsers.length} scrapers for ${this.jobQueue.length - this.jobIndex} remaining locations`);

    // Run concurrent workers
    const workers = this.parsers.map((parser, index) => 
      this.runConcurrentWorker(parser, index, rawCollection, progressCallback)
    );

    const results = await Promise.all(workers);
    const totalSaved = results.reduce((sum, count) => sum + count, 0);
    
    // Clear checkpoint on completion
    await this.clearCheckpoint();
    
    console.log(`✅ Concurrent scraping completed: ${totalSaved} total businesses saved`);
    return totalSaved;
  }

  async runConcurrentWorker(parser, workerId, rawCollection, progressCallback) {
    let workerSaved = 0;
    
    while (true) {
      const job = this.getNextJob();
      if (!job) break;
      
      console.log(`Worker ${workerId}: Processing ${job.query} (limit: ${job.limit})`);
      
      try {
        const savedCount = await this.scrapeBusinesses(
          rawCollection,
          job.query,
          job.country,
          job.subdivision,
          job.limit,
          progressCallback,
          parser
        );
        
        workerSaved += savedCount;
        console.log(`Worker ${workerId}: Completed ${job.label} - Saved ${savedCount} businesses`);
        
        // Save checkpoint after each completed location
        await this.saveCheckpoint(job.id, savedCount);
        
      } catch (error) {
        console.error(`Worker ${workerId} error on ${job.query}:`, error.message);
        // Still save checkpoint for failed jobs to skip them on retry
        await this.saveCheckpoint(job.id, 0, error.message);
      }
    }
    
    return workerSaved;
  }
  
  async extractAndSaveBusinesses(rawCollection, query, country, subdivision, limit, progressCallback = null, parser = null) {
    const selectedParser = parser || this.parsers[0];
    const page = await selectedParser.browser.newPage();
    let savedCount = 0;
    
    try {
      // Set up page
      const credentials = selectedParser.proxyManager.getCredentials();
      if (credentials) {
        await page.authenticate(credentials);
      }
      
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      await page.setViewport({ width: 1920, height: 1080 });
      
      await selectedParser.rateLimiter.wait();
      
      const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
      await page.goto(searchUrl, { waitUntil: 'networkidle0', timeout: 120000 });
      await page.waitForTimeout(5000);
      
      // Handle consent pages
      const pageContent = await page.content();
      const pageTitle = await page.title();
      
      if (selectedParser.isConsentPage(pageContent, pageTitle)) {
        console.log(`🔒 Handling consent page...`);
        await selectedParser.handleConsentPage(page);
        await page.waitForTimeout(3000);
      }
      
      // Improved scrolling to get all results
      await this.improvedScrollResults(page);
      const links = await selectedParser.extractBusinessLinks(page);
      
      console.log(`📊 Found ${links.length} business links`);
      
      const targetCount = Math.min(links.length, limit);
      
      for (let i = 0; i < targetCount; i++) {
        try {
          const details = await selectedParser.extractBusinessDetails(links[i]);
          
          if (details && details.name) {
            details.country = country;
            details.subdivision = subdivision;
            details.source_url = searchUrl;
            details.scraped_at = new Date();
            
            // Save immediately to database
            await rawCollection.insertOne(details);
            savedCount++;
            
            console.log(`✓ Saved ${savedCount}/${targetCount}: ${details.name}`);
            
            // Call progress callback if provided
            if (progressCallback) {
              await progressCallback(savedCount);
            }
          }
        } catch (error) {
          console.error(`Error extracting business ${i + 1}:`, error.message);
        }
        
        if (i < targetCount - 1) {
          await page.waitForTimeout(2000 + Math.random() * 3000);
        }
      }
      
    } catch (error) {
      console.error(`Error in extractAndSaveBusinesses:`, error.message);
    } finally {
      await page.close();
    }
    
    return savedCount;
  }

  async improvedScrollResults(page) {
    const config = require('../config/scraper');
    const feedSelectors = config.selectors.feed.split(', ');
    
    let feedElement = null;
    for (const selector of feedSelectors) {
      try {
        feedElement = await page.$(selector);
        if (feedElement) break;
      } catch (err) {
        continue;
      }
    }

    let previousHeight = 0;
    let stableCount = 0;
    const maxScrolls = 500; // Increased from 200
    const maxStableCount = 8; // Increased from 3
    
    
    for (let i = 0; i < maxScrolls; i++) {
      try {
        if (feedElement) {
          // Get current scroll height
          const currentHeight = await page.evaluate(el => el.scrollHeight, feedElement);
          
          // Scroll to bottom
          await page.evaluate(el => {
            el.scrollTop = el.scrollHeight;
          }, feedElement);
          
          // Check if new content loaded
          if (currentHeight === previousHeight) {
            stableCount++;
            if (stableCount >= maxStableCount) {
              break;
            }
          } else {
            stableCount = 0;
            previousHeight = currentHeight;
          }
        } else {
          await page.evaluate(() => {
            window.scrollBy(0, 1000);
          });
        }
        
        // Longer delays to let Google Maps load content
        const delay = 3000 + Math.random() * 2000; // 3-5 seconds
        await page.waitForTimeout(delay);
        
      } catch (err) {
        console.error(`Scroll error ${i + 1}:`, err.message);
      }
    } 
  }

  async saveCheckpoint(locationId, savedCount, error = null) {
    try {
      await this.checkpointCollection.updateOne(
        { 
          project_id: this.projectId,
          location_id: locationId
        },
        {
          $set: {
            project_id: this.projectId,
            location_id: locationId,
            completed: true,
            saved_count: savedCount,
            completed_at: new Date(),
            error: error
          }
        },
        { upsert: true }
      );
    } catch (err) {
      console.error('Failed to save checkpoint:', err.message);
    }
  }

  async resumeFromCheckpoint() {
    try {
      const completedLocations = await this.checkpointCollection
        .find({ project_id: this.projectId, completed: true })
        .toArray();
      
      const completedIds = new Set(completedLocations.map(loc => loc.location_id));
      
      // Filter out completed locations and update jobIndex
      const originalLength = this.jobQueue.length;
      this.jobQueue = this.jobQueue.filter(job => !completedIds.has(job.id));
      
      const skippedCount = originalLength - this.jobQueue.length;
      if (skippedCount > 0) {
        console.log(`🔄 Resumed from checkpoint: Skipping ${skippedCount} completed locations`);
        
        // Log completed locations for reference
        const totalSaved = completedLocations.reduce((sum, loc) => sum + (loc.saved_count || 0), 0);
        console.log(`📊 Previous progress: ${totalSaved} businesses already saved`);
      }
      
    } catch (err) {
      console.error('Failed to resume from checkpoint:', err.message);
      // Continue without checkpoint if there's an error
    }
  }

  async clearCheckpoint() {
    try {
      await this.checkpointCollection.deleteMany({ project_id: this.projectId });
      console.log(`🧹 Cleared checkpoints for project ${this.projectId}`);
    } catch (err) {
      console.error('Failed to clear checkpoint:', err.message);
    }
  }

  async getCheckpointProgress() {
    try {
      const checkpoints = await this.checkpointCollection
        .find({ project_id: this.projectId })
        .toArray();
      
      const totalSaved = checkpoints.reduce((sum, cp) => sum + (cp.saved_count || 0), 0);
      const completedCount = checkpoints.filter(cp => cp.completed).length;
      
      return {
        completed_locations: completedCount,
        total_saved: totalSaved,
        checkpoints: checkpoints
      };
    } catch (err) {
      console.error('Failed to get checkpoint progress:', err.message);
      return { completed_locations: 0, total_saved: 0, checkpoints: [] };
    }
  }

  async scrapeCountry(rawCollection, country, searchTerm, businessesPerLocation = null, progressCallback = null) {
    console.log(`🌍 Starting scraping for ${country.name}`);
    
    try {
      let countryResults = { found: 0, processed: 0 };

      // Process each subdivision
      for (const subdivision of country.subdivisions) {
        try {
          const query = `${searchTerm} in ${subdivision}, ${country.name}`;
          console.log(`📍 Scraping: ${query}`);
          
          const limit = businessesPerLocation || 100;
          const savedCount = await this.scrapeBusinesses(rawCollection, query, country.name, subdivision, limit, progressCallback);
          countryResults.found += savedCount;
          this.results.found += savedCount;

          console.log(`✅ Saved ${savedCount} businesses in ${subdivision}`);

        } catch (error) {
          console.error(`❌ Error scraping ${subdivision}:`, error.message);
          this.results.errors++;
        }
      }

      console.log(`🏁 ${country.name} complete: ${countryResults.found} saved`);
      return countryResults;

    } catch (error) {
      console.error(`❌ Error processing ${country.name}:`, error.message);
      this.results.errors++;
      return { found: 0, processed: 0 };
    }
  }

  async processRawData(db, businessLimit = null) {
    console.log('🔄 Processing raw data...');
    
    const rawCollection = db.collection('raw_data');
    const businessCollection = db.collection('businesses');
    
    let processed = 0;
    const query = businessLimit ? {} : {};
    const limit = businessLimit || 1000;
    
    const rawData = await rawCollection.find(query).limit(limit).toArray();
    console.log(`📊 Found ${rawData.length} raw records to process`);
    
    for (const business of rawData) {
      try {
        // Simple processing - clean and validate
        const cleanData = this.cleanBusinessData(business);
        
        if (this.isValidBusiness(cleanData)) {
          const isDuplicate = await this.checkDuplicate(businessCollection, cleanData);
          
          if (!isDuplicate) {
            await businessCollection.insertOne({
              ...cleanData,
              project_id: this.projectId,
              processed_at: new Date()
            });
            processed++;
          }
        }
        
      } catch (error) {
        console.error(`Error processing business ${business._id}:`, error.message);
      }
    }
    
    console.log(`✅ Processed ${processed} businesses`);
    return processed;
  }
  
  cleanBusinessData(data) {
    // Basic data cleaning
    const cleaned = { ...data };
    
    if (cleaned.phone) {
      cleaned.phone = cleaned.phone.replace(/[^\d\s\+\-\(\)]/g, '').trim();
    }
    
    if (cleaned.address) {
      cleaned.address = cleaned.address.replace(/[⊕⊗⊙]/g, '').trim();
      cleaned.normalized_address = cleaned.address.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    }
    
    return cleaned;
  }
  
  isValidBusiness(data) {
    // Basic validation
    return data.name && data.name.length > 0;
  }

  async processRawDataWithLimits(db, userId, businessLimit = null) {
    const User = require('../api/models/User');
    const userModel = new User();
    await userModel.init();
    
    const availableLimit = await userModel.getAvailableLimit(userId);
    const effectiveLimit = businessLimit ? Math.min(businessLimit, availableLimit) : availableLimit;
    
    if (effectiveLimit <= 0) {
      console.log(`⚠️ No processing limit available`);
      await userModel.close();
      return 0;
    }
    
    const processed = await this.processRawData(db, effectiveLimit);
    await userModel.close();
    
    console.log(`✅ Processed ${processed} businesses (within available limit)`);
    return processed;
  }

  async checkDuplicate(businessCollection, data) {
    // Address-based duplicate check
    if (data.normalized_address && data.country) {
      const existing = await businessCollection.findOne({
        normalized_address: data.normalized_address,
        country: data.country
      });
      
      if (existing) return true;
    }

    // Phone-based duplicate check
    if (data.phone && data.country) {
      const existing = await businessCollection.findOne({
        phone: data.phone,
        country: data.country
      });
      
      if (existing) return true;
    }

    return false;
  }

  async enrichBusinessData(db, enrichmentConfig, businessLimit = null, forceEnrich = false) {
    const AIEnrichmentService = require('../services/AIEnrichmentService');
        
    if (!enrichmentConfig.enabled || !enrichmentConfig.fields || enrichmentConfig.fields.length === 0) {
      console.log('⚠️ Enrichment not enabled or no fields selected');
      return 0;
    }
    
    const apiKey = process.env[`${enrichmentConfig.aiProvider.toUpperCase()}_API_KEY`];
    if (!apiKey) {
      console.log(`⚠️ No API key found for ${enrichmentConfig.aiProvider}`);
      return 0;
    }
    
    const aiService = new AIEnrichmentService(enrichmentConfig.aiProvider, apiKey);
    const businessCollection = db.collection('businesses');
    
    // Get businesses - different query based on context
    const query = forceEnrich 
      ? { project_id: this.projectId }  // All businesses for post-processing
      : { project_id: this.projectId, enriched: { $ne: true } };  // Only unenriched for regular enrichment
    
    const businesses = await businessCollection
      .find(query)
      .limit(businessLimit || 1000)
      .toArray();

    let enrichedCount = 0;
    
    for (const business of businesses) {
      try {        
        console.log(business.name)
        const enrichedData = await aiService.enrichBusiness(business, enrichmentConfig.fields);
        
        // Update business with enriched data
        const updateResult = await businessCollection.updateOne(
          { _id: business._id },
          {
            $set: {
              ...enrichedData,
              enriched: true,
              enriched_at: new Date(),
              enrichment_provider: enrichmentConfig.aiProvider,
              enrichment_fields: enrichmentConfig.fields
            }
          }
        );        
        enrichedCount++;
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Failed to enrich ${business.name}:`, error.message);
        
        // Mark as enrichment failed
        await businessCollection.updateOne(
          { _id: business._id },
          {
            $set: {
              enriched: false,
              enrichment_error: error.message,
              enriched_at: new Date()
            }
          }
        );
      }
    }
    
    console.log(`✅ Enrichment complete: ${enrichedCount}/${businesses.length} businesses enriched`);
    return enrichedCount;
  }

  async close() {
    for (const parser of this.parsers) {
      await parser.close();
    }
  }

  getResults() {
    return this.results;
  }
}

module.exports = SaaSScraper;