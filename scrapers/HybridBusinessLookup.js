const GoogleSearchParser = require('./GoogleSearchParser');
const GenericGoogleMapsParser = require('./GenericGoogleMapsParser');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

class HybridBusinessLookup {
  constructor() {
    this.browser = null;
    this.searchParser = null;
    this.mapsParser = null;
  }

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    this.searchParser = new GoogleSearchParser(this.browser);
    
    // Create minimal rate limiter
    const dummyRateLimiter = {
      wait: async () => await new Promise(resolve => setTimeout(resolve, 1000))
    };
    
    // Create minimal niche config for maps parser
    const dummyNiche = {
      name: 'business_lookup',
      validation: { includeKeywords: [], excludeKeywords: [] },
      search: { maxPerSearch: 1 }
    };
    
    this.mapsParser = new GenericGoogleMapsParser(dummyRateLimiter, dummyNiche);
    this.mapsParser.browser = this.browser; // Set browser directly
  }

  async lookupBusiness(businessName, location = '') {
    try {
      console.log(`🔍 Looking up: ${businessName}${location ? ` in ${location}` : ''}`);
      
      // Step 1: Google Search
      console.log(`🔍 Step 1: Google Search for ${businessName}`);
      const searchResults = await this.searchParser.searchBusiness(businessName, location);
      console.log(`📊 Search results: ${searchResults ? searchResults.length : 0} found`);
      if (searchResults && searchResults.length > 0) {
        console.log(`📄 First search result:`, {
          type: searchResults[0].type,
          title: searchResults[0].title || searchResults[0].name,
          hasPhone: !!searchResults[0].phone,
          hasWebsite: !!searchResults[0].website
        });
      }
      
      // Step 2: Google Maps search as backup
      console.log(`🔍 Step 2: Google Maps search for ${businessName}`);
      const mapsQuery = location ? `${businessName} ${location}` : businessName;
      let mapsResults = null;
      
      try {
        const tempResults = await this.searchGoogleMaps(mapsQuery);
        mapsResults = tempResults.length > 0 ? tempResults[0] : null;
        console.log(`🗺 Maps results: ${mapsResults ? 'Found business' : 'No results'}`);
        if (mapsResults) {
          console.log(`📄 Maps result:`, {
            name: mapsResults.name,
            hasPhone: !!mapsResults.phone,
            hasWebsite: !!mapsResults.website,
            hasAddress: !!mapsResults.address,
            rating: mapsResults.rating
          });
        }
      } catch (error) {
        console.log(`❌ Maps search failed for ${businessName}:`, error.message);
      }

      // Step 3: Merge and score results
      console.log(`🔍 Step 3: Merging results for ${businessName}`);
      const mergedResult = this.mergeResults(businessName, searchResults, mapsResults);
      
      console.log(`📊 Final result for ${businessName}:`, {
        confidence: mergedResult.confidence,
        sources: mergedResult.sources,
        hasPhone: !!mergedResult.phone,
        hasWebsite: !!mergedResult.website,
        hasEmail: !!mergedResult.email,
        hasAddress: !!mergedResult.address
      });
      
      return mergedResult;
      
    } catch (error) {
      console.error(`❌ Lookup error for ${businessName}:`, error.message);
      return null;
    }
  }

  async searchGoogleMaps(query) {
    const page = await this.browser.newPage();
    
    try {
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/maps/'
      });

      // Enhanced query for better Maps results
      const enhancedQuery = location && !location.toLowerCase().includes('nigeria') ? 
        `${query} Nigeria` : query;
      
      const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(enhancedQuery)}`;
      console.log(`🗺 Maps search URL: ${searchUrl}`);
      
      await page.goto(searchUrl, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.waitForTimeout(3000);

      // Handle consent page if present
      const pageContent = await page.content();
      const pageTitle = await page.title();
      
      if (this.isConsentPage(pageContent, pageTitle)) {
        await this.handleConsentPage(page);
        await page.waitForTimeout(3000);
      }

      // Get first business link
      const links = await page.$$eval('a[href*="/maps/place/"]', els => 
        els.slice(0, 1).map(el => el.href)
      );

      if (links.length === 0) return [];

      // Extract full details from first result using the complete parser
      const details = await this.mapsParser.extractBusinessDetails(links[0]);
      
      if (details) {
        // Add search metadata
        details.source_url = searchUrl;
        details.scraped_at = new Date();
      }
      
      return details ? [details] : [];
      
    } catch (error) {
      console.error(`Maps search error:`, error.message);
      return [];
    } finally {
      await page.close();
    }
  }

  isConsentPage(content, title = '') {
    const contentLower = content.toLowerCase();
    const titleLower = title.toLowerCase();
    
    const consentPatterns = [
      'before you continue to google',
      'before you use google',
      'privacy and terms'
    ];
    
    return consentPatterns.some(pattern => 
      contentLower.includes(pattern) || titleLower.includes(pattern)
    );
  }

  async handleConsentPage(page) {
    try {
      const buttonIds = ['L2AGLb', 'W0wltc'];
      for (const id of buttonIds) {
        const button = await page.$(`#${id}`);
        if (button) {
          await button.click();
          await page.waitForTimeout(2000);
          return true;
        }
      }
      
      const buttons = await page.$$('button, div[role="button"]');
      for (const button of buttons) {
        const text = await page.evaluate(el => (el.textContent || '').toLowerCase(), button);
        if (text.includes('accept all') || text.includes('i agree')) {
          await button.click();
          await page.waitForTimeout(2000);
          return true;
        }
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  mergeResults(businessName, searchResults, mapsResult) {
    const merged = {
      name: businessName,
      phone: null,
      website: null,
      email: null,
      address: null,
      rating: null,
      review_count: 0,
      reviews: null,
      reviews_text: null,
      categories: [],
      hours: null,
      hours_detailed: null,
      closed_days: [],
      is_open_sunday: null,
      lat: null,
      lng: null,
      images: [],
      business_attributes: null,
      country: null,
      subdivision: null,
      source_url: null,
      scraped_at: new Date(),
      confidence: 0,
      sources: []
    };

    // Process search results
    if (searchResults && searchResults.length > 0) {
      const bestSearch = searchResults[0];
      merged.sources.push('google_search');
      
      if (bestSearch.type === 'knowledge_panel') {
        merged.name = bestSearch.name || businessName;
        merged.phone = bestSearch.phone;
        merged.website = bestSearch.website;
        merged.address = bestSearch.address;
        merged.confidence += 0.4;
      }
      
      // Extract contact info from search snippets
      for (const result of searchResults) {
        if (result.phone && !merged.phone) merged.phone = result.phone;
        if (result.email && !merged.email) merged.email = result.email;
        if (result.url && !merged.website && this.isBusinessWebsite(result.url)) {
          merged.website = result.url;
        }
      }
      
      merged.confidence += 0.2;
    }

    // Process maps result
    if (mapsResult) {
      merged.sources.push('google_maps');
      
      if (!merged.name || merged.name === businessName) {
        merged.name = mapsResult.name || businessName;
      }
      
      // Basic contact info
      if (!merged.phone && mapsResult.phone) merged.phone = mapsResult.phone;
      if (!merged.website && mapsResult.website) merged.website = mapsResult.website;
      if (!merged.address && mapsResult.address) merged.address = mapsResult.address;
      
      // Ratings and reviews
      merged.rating = mapsResult.rating;
      merged.review_count = mapsResult.review_count || 0;
      merged.reviews = mapsResult.reviews;
      merged.reviews_text = mapsResult.reviews_text;
      
      // Categories
      merged.categories = mapsResult.categories || [];
      
      // Hours information
      merged.hours = mapsResult.hours;
      merged.hours_detailed = mapsResult.hours_detailed;
      merged.closed_days = mapsResult.closed_days || [];
      merged.is_open_sunday = mapsResult.is_open_sunday;
      
      // Location data
      merged.lat = mapsResult.lat;
      merged.lng = mapsResult.lng;
      
      // Images
      merged.images = mapsResult.images || [];
      
      // Business attributes
      merged.business_attributes = mapsResult.business_attributes;
      
      // Location metadata
      merged.country = mapsResult.country;
      merged.subdivision = mapsResult.subdivision;
      merged.source_url = mapsResult.source_url;
      
      merged.confidence += 0.3;
    }

    // Validate result quality
    if (merged.phone || merged.website || merged.email) {
      merged.confidence += 0.1;
    }

    return merged;
  }

  isBusinessWebsite(url) {
    const excludeDomains = ['facebook.com', 'linkedin.com', 'twitter.com', 'instagram.com', 
                           'yelp.com', 'yellowpages.com', 'google.com', 'wikipedia.org'];
    
    try {
      const domain = new URL(url).hostname.toLowerCase();
      return !excludeDomains.some(excluded => domain.includes(excluded));
    } catch {
      return false;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

module.exports = HybridBusinessLookup;