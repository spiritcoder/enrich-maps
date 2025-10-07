const GenericGoogleMapsParser = require('../scrapers/GenericGoogleMapsParser');
const RateLimiter = require('../services/RateLimiter');

class SaaSScraper {
  constructor(projectId = null) {
    this.projectId = projectId;
    this.parser = new GenericGoogleMapsParser(new RateLimiter());
    this.results = {
      found: 0,
      processed: 0,
      errors: 0
    };
  }

  async init() {
    await this.parser.init();
    console.log(`🎯 SAAS: parser.init() completed`);
  }

  // New method for worker compatibility with progressive saving
  async scrapeBusinesses(rawCollection, query, country, subdivision, limit = 100, progressCallback = null) {
    try {
      if (!this.parser.browser) {
        await this.init();
      }
      
      const savedCount = await this.extractAndSaveBusinesses(rawCollection, query, country, subdivision, limit, progressCallback);
      console.log(`✅ SaaSScraper saved ${savedCount} businesses`);
      return savedCount;
      
    } catch (error) {
      console.error(`❌ SaaSScraper error:`, error.message);
      return 0;
    }
  }
  
  async extractAndSaveBusinesses(rawCollection, query, country, subdivision, limit, progressCallback = null) {
    const page = await this.parser.browser.newPage();
    let savedCount = 0;
    
    try {
      // Set up page
      const credentials = this.parser.proxyManager.getCredentials();
      if (credentials) {
        await page.authenticate(credentials);
      }
      
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      await page.setViewport({ width: 1920, height: 1080 });
      
      await this.parser.rateLimiter.wait();
      
      const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
      await page.goto(searchUrl, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.waitForTimeout(5000);
      
      // Handle consent pages
      const pageContent = await page.content();
      const pageTitle = await page.title();
      
      if (this.parser.isConsentPage(pageContent, pageTitle)) {
        console.log(`🔒 Handling consent page...`);
        await this.parser.handleConsentPage(page);
        await page.waitForTimeout(3000);
      }
      
      // Scroll and extract links
      await this.parser.scrollResults(page);
      const links = await this.parser.extractBusinessLinks(page);
      
      console.log(`📊 Found ${links.length} business links`);
      
      const targetCount = Math.min(links.length, limit);
      
      for (let i = 0; i < targetCount; i++) {
        try {
          const details = await this.parser.extractBusinessDetails(links[i]);
          
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

  async scrapeCountry(rawCollection, country, searchTerm, progressCallback = null) {
    console.log(`🌍 Starting scraping for ${country.name}`);
    
    try {
      let countryResults = { found: 0, processed: 0 };

      // Process each subdivision
      for (const subdivision of country.subdivisions) {
        try {
          const query = `${searchTerm} ${subdivision}, ${country.name}`;
          console.log(`📍 Scraping: ${query}`);
          
          const savedCount = await this.scrapeBusinesses(rawCollection, query, country.name, subdivision, 100, progressCallback);
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
    console.log(`🔄 Processing raw data with limit: ${effectiveLimit} (business: ${businessLimit}, available: ${availableLimit})`);
    
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

  async enrichBusinessData(db, enrichmentConfig, businessLimit = null) {
    const AIEnrichmentService = require('../services/AIEnrichmentService');
    
    console.log(`🔍 DEBUG: Enrichment config:`, enrichmentConfig);
    
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
    
    // Get businesses that need enrichment
    const query = { project_id: this.projectId, enriched: { $ne: true } };
    console.log(`🔍 DEBUG: Enrichment query:`, query);
    
    const businesses = await businessCollection
      .find(query)
      .limit(businessLimit || 1000)
      .toArray();
    
    console.log(`🤖 Enriching ${businesses.length} businesses with ${enrichmentConfig.aiProvider}`);
    console.log(`🔍 DEBUG: First business:`, businesses[0] ? { _id: businesses[0]._id, name: businesses[0].name, project_id: businesses[0].project_id } : 'None');
    
    let enrichedCount = 0;
    
    for (const business of businesses) {
      try {
        console.log(`🔄 Enriching: ${business.name}`);
        
        const enrichedData = await aiService.enrichBusiness(business, enrichmentConfig.fields);
        console.log(`🔍 DEBUG: Enriched data for ${business.name}:`, enrichedData);
        
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
        
        console.log(`🔍 DEBUG: Update result for ${business.name}:`, { matchedCount: updateResult.matchedCount, modifiedCount: updateResult.modifiedCount });
        
        enrichedCount++;
        console.log(`✨ Enriched ${enrichedCount}/${businesses.length}: ${business.name}`);
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Failed to enrich ${business.name}:`, error.message);
        console.error(`🔍 DEBUG: Enrichment error stack:`, error.stack);
        
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
    if (this.parser) {
      await this.parser.close();
    }
  }

  getResults() {
    return this.results;
  }
}

module.exports = SaaSScraper;