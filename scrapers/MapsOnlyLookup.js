const GenericGoogleMapsParser = require('./GenericGoogleMapsParser');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

class MapsOnlyLookup {
  constructor() {
    this.browser = null;
    this.mapsParser = null;
  }

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const dummyRateLimiter = {
      wait: async () => await new Promise(resolve => setTimeout(resolve, 1000))
    };
    
    const dummyNiche = {
      name: 'business_lookup',
      validation: { includeKeywords: [], excludeKeywords: [] },
      search: { maxPerSearch: 1 }
    };
    
    this.mapsParser = new GenericGoogleMapsParser(dummyRateLimiter, dummyNiche);
    this.mapsParser.browser = this.browser;
  }

  async lookupBusiness(businessName, subdivision = '', country = '') {
    try {
      const locationStr = [subdivision, country].filter(Boolean).join(', ');
      console.log(`🗺️ Maps lookup: ${businessName}${locationStr ? ` in ${locationStr}` : ''}`);
      
      // Try multiple query strategies for better results
      const queries = this.buildMultipleQueries(businessName, subdivision, country);
      
      let result = null;
      for (let i = 0; i < queries.length && !result; i++) {
        console.log(`🔍 Query ${i + 1}/${queries.length}: ${queries[i]}`);
        result = await this.searchGoogleMaps(queries[i]);
        
        if (result) {
          console.log(`✅ Found result with query ${i + 1}`);
          break;
        } else {
          console.log(`❌ No results with query ${i + 1}`);
          if (i < queries.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Brief delay between queries
          }
        }
      }
      
      if (result) {
        // Add metadata
        result.subdivision = subdivision || result.subdivision;
        result.country = country || result.country;
        result.source_url = `https://www.google.com/maps/search/${encodeURIComponent(queries[0])}`;
        result.scraped_at = new Date();
        result.sources = ['google_maps'];
        
        // Calculate confidence based on data completeness, location match, and result type
        result.confidence = this.calculateConfidence(result, businessName, subdivision, country);
        
        // Log what type of result we found
        const resultType = result.result_type || 'unknown';
        console.log(`📊 Result type: ${resultType} (${resultType === 'business' ? 'full business listing' : 'location pin'})`);
        
        console.log(`✅ Final result: ${result.name} in ${result.subdivision || 'unknown'}, ${result.country || 'unknown'} (confidence: ${result.confidence.toFixed(2)})`);
      } else {
        console.log(`❌ No Maps results found for: ${businessName} in ${locationStr}`);
      }
      
      return result;
      
    } catch (error) {
      console.error(`❌ Maps lookup error for ${businessName}:`, error.message);
      return null;
    }
  }

  buildMultipleQueries(businessName, subdivision, country) {
    const queries = [];
    const isLocation = this.isLocationSearch(businessName);
    
    // For locations/estates: use flexible queries without quotes
    if (isLocation) {
      if (subdivision && country) {
        queries.push(`${businessName} ${subdivision} ${country}`);
        queries.push(`${businessName} in ${subdivision} ${country}`);
      }
      if (country) {
        queries.push(`${businessName} ${country}`);
        queries.push(`${businessName} in ${country}`);
      }
      if (subdivision) {
        queries.push(`${businessName} ${subdivision}`);
      }
      queries.push(businessName);
    } else {
      // For businesses: use quoted queries for exact matching
      if (subdivision && country) {
        queries.push(`"${businessName}" ${subdivision} ${country}`);
        queries.push(`${businessName} in ${subdivision} ${country}`);
      }
      if (country) {
        queries.push(`"${businessName}" ${country}`);
        queries.push(`${businessName} in ${country}`);
      }
      if (subdivision) {
        queries.push(`"${businessName}" ${subdivision}`);
      }
      queries.push(`"${businessName}"`);
    }
    
    return [...new Set(queries)];
  }

  isLocationSearch(name) {
    const locationKeywords = ['estate', 'area', 'district', 'zone', 'street', 'road', 'avenue', 'close', 'crescent', 'plaza', 'market', 'mall', 'center', 'centre'];
    const nameLower = name.toLowerCase();
    return locationKeywords.some(keyword => nameLower.includes(keyword));
  }

  async searchGoogleMaps(query) {
    const page = await this.browser.newPage();
    
    try {
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/maps/'
      });

      const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
      console.log(`🗺️ Maps URL: ${searchUrl}`);
      
      await page.goto(searchUrl, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.waitForTimeout(3000);

      // Handle consent page
      const pageContent = await page.content();
      const pageTitle = await page.title();
      
      if (this.isConsentPage(pageContent, pageTitle)) {
        await this.handleConsentPage(page);
        await page.waitForTimeout(3000);
      }

      // Enhanced detection: Look for both business listings AND location pins
      const allLinks = await page.evaluate(() => {
        const links = [];
        
        // Business listings (preferred)
        const businessLinks = document.querySelectorAll('a[href*="/maps/place/"]');
        businessLinks.forEach(link => {
          if (link.href && link.href.includes('/maps/place/')) {
            links.push({ url: link.href, type: 'business' });
          }
        });
        
        // Location pins (fallback)
        if (links.length === 0) {
          const locationElements = document.querySelectorAll('[data-value], [jsaction*="pane"], .hfpxzc');
          locationElements.forEach(el => {
            const parent = el.closest('a');
            if (parent && parent.href && parent.href.includes('/maps/place/')) {
              links.push({ url: parent.href, type: 'location' });
            }
          });
        }
        
        // Alternative: Check for any /maps/place/ URLs in page
        if (links.length === 0) {
          const allAnchors = document.querySelectorAll('a[href]');
          allAnchors.forEach(anchor => {
            if (anchor.href.includes('/maps/place/') && !anchor.href.includes('search')) {
              links.push({ url: anchor.href, type: 'location' });
            }
          });
        }
        
        return links.slice(0, 3); // Get top 3 results
      });

      if (allLinks.length === 0) {
        console.log(`🗺️ No business or location links found for: ${query}`);
        return null;
      }

      console.log(`🗺️ Found ${allLinks.length} link(s): ${allLinks.map(l => l.type).join(', ')}`);
      
      // Try each link until we get good data
      for (const linkInfo of allLinks) {
        try {
          console.log(`🗺️ Extracting from ${linkInfo.type}: ${linkInfo.url}`);
          const details = await this.mapsParser.extractBusinessDetails(linkInfo.url);
          
          if (details && (details.name || details.address || details.lat)) {
            details.result_type = linkInfo.type;
            console.log(`✅ Successfully extracted ${linkInfo.type} data`);
            return details;
          }
        } catch (extractError) {
          console.log(`⚠️ Failed to extract from ${linkInfo.type}: ${extractError.message}`);
          continue;
        }
      }
      
      console.log(`🗺️ No usable data extracted from any links`);
      return null;
      
    } catch (error) {
      console.error(`🗺️ Maps search error:`, error.message);
      return null;
    } finally {
      await page.close();
    }
  }

  calculateConfidence(result, originalName, subdivision, country) {
    let confidence = 0;
    
    // Base confidence varies by result type
    if (result.result_type === 'business') {
      confidence += 0.3; // Higher base for business listings
    } else {
      confidence += 0.2; // Lower base for location pins
    }
    
    // Name similarity (higher weight)
    if (result.name && originalName) {
      const nameSimilarity = this.calculateNameSimilarity(result.name.toLowerCase(), originalName.toLowerCase());
      confidence += nameSimilarity * 0.4;
    }
    
    // Data completeness (business listings typically have more)
    if (result.phone) confidence += 0.1;
    if (result.website) confidence += 0.1;
    if (result.address) confidence += 0.1;
    if (result.rating && result.rating > 0) confidence += 0.05;
    if (result.categories && result.categories.length > 0) confidence += 0.05;
    
    // Coordinates are valuable for location pins
    if (result.lat && result.lng) {
      confidence += result.result_type === 'location' ? 0.1 : 0.05;
    }
    
    // Location matching (enhanced with country)
    if (result.address) {
      const addressLower = result.address.toLowerCase();
      
      // Subdivision match
      if (subdivision && addressLower.includes(subdivision.toLowerCase())) {
        confidence += 0.15;
      }
      
      // Country match
      if (country && addressLower.includes(country.toLowerCase())) {
        confidence += 0.1;
      }
    }
    
    return Math.min(confidence, 1.0);
  }

  calculateNameSimilarity(name1, name2) {
    // Simple similarity check
    const words1 = name1.split(/\s+/);
    const words2 = name2.split(/\s+/);
    
    let matches = 0;
    for (const word1 of words1) {
      for (const word2 of words2) {
        if (word1.includes(word2) || word2.includes(word1)) {
          matches++;
          break;
        }
      }
    }
    
    return matches / Math.max(words1.length, words2.length);
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

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

module.exports = MapsOnlyLookup;