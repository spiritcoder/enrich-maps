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
      headless: "new",
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
        console.log(`🗺️ No business links found, trying direct search results extraction`);
        
        // Try to extract data directly from search results page
        const directResult = await this.extractFromSearchResults(page, query);
        if (directResult) {
          console.log(`✅ Successfully extracted from search results`);
          return directResult;
        }
        
        console.log(`🗺️ No data found in search results for: ${query}`);
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
      
      // If links failed, try direct extraction as fallback
      console.log(`🗺️ Link extraction failed, trying direct search results extraction`);
      const directResult = await this.extractFromSearchResults(page, query);
      if (directResult) {
        console.log(`✅ Successfully extracted from search results as fallback`);
        return directResult;
      }
      
      console.log(`🗺️ No usable data extracted from any method`);
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

  async extractFromSearchResults(page, query) {
    try {
      // Extract data directly from search results page
      const searchData = await page.evaluate(() => {
        const results = [];
        
        // Look for search result elements
        const selectors = [
          '[jsaction*="pane"]',
          '.hfpxzc',
          '[data-result-index]',
          '[data-value]',
          '.section-result'
        ];
        
        selectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            const text = el.textContent?.trim() || '';
            if (text.length > 10) { // Skip empty or very short elements
              results.push({
                selector,
                text,
                innerHTML: el.innerHTML
              });
            }
          });
        });
        
        return results;
      });
      
      if (searchData.length === 0) {
        return null;
      }
      
      // Find the most relevant result
      const bestResult = this.findBestSearchResult(searchData, query);
      if (!bestResult) {
        return null;
      }
      
      // Parse the result text to extract structured data
      const parsedData = this.parseSearchResultText(bestResult.text);
      if (!parsedData.name) {
        return null;
      }
      
      // Try to get coordinates from URL or page
      const coordinates = await this.extractCoordinates(page);
      
      // Extract images from the search results page
      const images = await this.extractImages(page);
      
      return {
        name: parsedData.name,
        address: parsedData.address,
        subdivision: parsedData.subdivision,
        country: parsedData.country,
        lat: coordinates?.lat || null,
        lng: coordinates?.lng || null,
        phone: null,
        website: null,
        email: null,
        rating: null,
        review_count: 0,
        reviews: null,
        categories: [],
        hours: null,
        images: images || [],
        business_attributes: null,
        result_type: 'search_result',
        extraction_method: 'direct_search_results'
      };
      
    } catch (error) {
      console.log(`⚠️ Search results extraction error: ${error.message}`);
      return null;
    }
  }
  
  findBestSearchResult(results, query) {
    const queryWords = query.toLowerCase().split(/\s+/);
    let bestResult = null;
    let bestScore = 0;
    
    for (const result of results) {
      const text = result.text.toLowerCase();
      let score = 0;
      
      // Score based on query word matches
      queryWords.forEach(word => {
        if (text.includes(word)) {
          score += 1;
        }
      });
      
      // Bonus for longer, more detailed results
      if (result.text.length > 50) {
        score += 0.5;
      }
      
      // Prefer results with address-like content
      if (text.includes('lagos') || text.includes('nigeria') || text.includes('lekki')) {
        score += 1;
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestResult = result;
      }
    }
    
    return bestScore > 0 ? bestResult : null;
  }
  
  parseSearchResultText(text) {
    // Aggressive cleaning to remove ALL Google Maps UI noise
    let cleanText = text
      // Remove common UI elements
      .replace(/See photos/gi, '')
      .replace(/Photos & videos/gi, '')
      .replace(/Add photos & videos/gi, '')
      .replace(/Questions and answers/gi, '')
      .replace(/Review summary/gi, '')
      .replace(/Write a review/gi, '')
      .replace(/More reviews/gi, '')
      .replace(/People also search for/gi, '')
      .replace(/Web results/gi, '')
      .replace(/About this data/gi, '')
      .replace(/Collapse side panel/gi, '')
      .replace(/DirectionsSaveNearbySend to phoneShare/gi, '')
      .replace(/OverviewReviewsAbout/gi, '')
      .replace(/Directions/gi, '')
      .replace(/Save/gi, '')
      .replace(/Nearby/gi, '')
      .replace(/Send to phone/gi, '')
      .replace(/Share/gi, '')
      .replace(/Claim this business/gi, '')
      .replace(/Suggest an edit/gi, '')
      .replace(/Add missing information/gi, '')
      .replace(/Add place's phone number/gi, '')
      .replace(/Add website/gi, '')
      .replace(/Updates from customers/gi, '')
      .replace(/From visitors/gi, '')
      .replace(/Street View & 360°/gi, '')
      .replace(/Ask the community/gi, '')
      .replace(/Search reviews/gi, '')
      .replace(/Sort/gi, '')
      .replace(/Like Share/gi, '')
      .replace(/Local Guide/gi, '')
      
      // Remove ratings and review counts
      .replace(/\d+\.\d+\(\d+\)/g, '') // "4.3(88)"
      .replace(/\d+ reviews?/gi, '')
      .replace(/\d+ photos?/gi, '')
      
      // Remove business type indicators
      .replace(/Housing development·/gi, '')
      .replace(/Housing complex·/gi, '')
      .replace(/Apartment building·/gi, '')
      .replace(/Apartment complex·/gi, '')
      
      // Remove hours information
      .replace(/Open \d+ hours/gi, '')
      .replace(/Open 24 hours/gi, '')
      .replace(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)Open \d+ hours/gi, '')
      .replace(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/gi, '')
      .replace(/Suggest new hours/gi, '')
      
      // Remove coordinate references
      .replace(/[A-Z0-9]{4}\+[A-Z0-9]{2} [A-Za-z]+/g, '') // "XFX9+73 Abuja"
      
      // Remove special characters and normalize spaces
      .replace(/·/g, ' ')
      .replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, ' ') // Various bullet points
      .replace(/\s+/g, ' ')
      .trim();
    
    // Extract name and address more intelligently
    let name = '';
    let address = '';
    let subdivision = '';
    let country = '';
    
    // Now extract name and address from the cleaned text
    // Look for common patterns in the cleaned text
    const patterns = [
      // Pattern 1: "Name Estate/Housing, address" or "Name Estate address"
      /^([A-Za-z\s]+(?:Estate|Housing|Complex|Plaza|Mall|Center|Centre|Market|Court|Gardens|Towers|Heights))(?:[,\s]+(.+))?$/i,
      // Pattern 2: "Name, postal code + location"
      /^([^,\d]+?)(?:[,\s]+(\d{5,6}.*))?$/i,
      // Pattern 3: "Name + Nigerian location"
      /^([^,]+?)(?:[,\s]+(.*(?:Lagos|Abuja|Kano|Ibadan|Nigeria|Federal Capital Territory|Constitution|Avenue|Street|Road).*))?$/i,
      // Pattern 4: Split at first significant number
      /^([A-Za-z\s]+?)(?:\s+(\d{2,}.*))?$/i
    ];
    
    let matched = false;
    for (const pattern of patterns) {
      const match = cleanText.match(pattern);
      if (match && match[1] && match[1].trim().length >= 3) {
        name = match[1].trim();
        address = match[2] ? match[2].trim() : '';
        matched = true;
        break;
      }
    }
    
    // Fallback: split roughly in half
    if (!matched || !name) {
      const words = cleanText.split(/\s+/);
      if (words.length > 1) {
        const splitPoint = Math.min(4, Math.ceil(words.length / 2));
        name = words.slice(0, splitPoint).join(' ');
        address = words.slice(splitPoint).join(' ');
      } else {
        name = cleanText;
        address = '';
      }
    }
    
    // Parse location from address
    if (address) {
      const addressLower = address.toLowerCase();
      
      // Nigerian cities and states (check both name and address)
      const fullText = (name + ' ' + address).toLowerCase();
      const nigerianLocations = {
        'lagos': { subdivision: 'Lagos', country: 'Nigeria' },
        'abuja': { subdivision: 'Abuja', country: 'Nigeria' },
        'kano': { subdivision: 'Kano', country: 'Nigeria' },
        'port harcourt': { subdivision: 'Rivers', country: 'Nigeria' },
        'ibadan': { subdivision: 'Oyo', country: 'Nigeria' },
        'kaduna': { subdivision: 'Kaduna', country: 'Nigeria' },
        'benin': { subdivision: 'Edo', country: 'Nigeria' },
        'jos': { subdivision: 'Plateau', country: 'Nigeria' },
        'ilorin': { subdivision: 'Kwara', country: 'Nigeria' },
        'enugu': { subdivision: 'Enugu', country: 'Nigeria' },
        'owerri': { subdivision: 'Imo', country: 'Nigeria' },
        'calabar': { subdivision: 'Cross River', country: 'Nigeria' },
        'maiduguri': { subdivision: 'Borno', country: 'Nigeria' },
        'zaria': { subdivision: 'Kaduna', country: 'Nigeria' },
        'aba': { subdivision: 'Abia', country: 'Nigeria' },
        'federal capital territory': { subdivision: 'Abuja', country: 'Nigeria' }
      };
      
      for (const [location, info] of Object.entries(nigerianLocations)) {
        if (fullText.includes(location)) {
          subdivision = info.subdivision;
          country = info.country;
          break;
        }
      }
      
      // If Nigeria is mentioned but no specific location found
      if (!subdivision && fullText.includes('nigeria')) {
        country = 'Nigeria';
      }
    }
    
    // Clean up the extracted name and address
    name = name.replace(/[^a-zA-Z0-9\s\-'&.]/g, ' ').replace(/\s+/g, ' ').trim();
    address = address.replace(/\s+/g, ' ').trim();
    
    // Additional cleaning for name
    name = name
      .replace(/\s+(Lagos|Abuja|Nigeria|Federal Capital Territory).*$/i, '')
      .replace(/\s+\d{5,6}.*$/i, '')
      .replace(/\s+(Avenue|Street|Road|Constitution).*$/i, '')
      .replace(/\s+(Eti-Osa|Lekki).*$/i, '') // Remove area names from name
      .replace(/\s+gaduwa estate/gi, '') // Remove duplicate estate names
      .trim();
    
    // Clean up address
    address = address
      .replace(/WednesdayThursdayFridaySaturdaySundayMondayTuesday/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Final validation
    if (name.length > 50) {
      const words = name.split(/\s+/);
      name = words.slice(0, 4).join(' ');
    }
    
    if (name.length < 3 || name.match(/^\d+$/)) {
      // Extract from original query if name is too short
      const firstWords = cleanText.split(/\s+/).slice(0, 3);
      name = firstWords.join(' ');
    }
    
    return {
      name: name || null,
      address: address || null,
      subdivision: subdivision || null,
      country: country || null
    };
  }
  
  async extractImages(page) {
    try {
      const images = await page.evaluate(() => {
        const imageUrls = [];
        
        // Look for Google Street View and satellite images
        const selectors = [
          'img[src*="googleusercontent"]',
          'img[src*="maps.gstatic"]',
          'img[src*="streetview"]'
        ];
        
        selectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            const src = el.src || el.dataset.src || '';
            if (src && src.length > 10 && !src.includes('data:image')) {
              imageUrls.push(src);
            }
          });
        });
        
        // Remove duplicates and return first 5 images
        return [...new Set(imageUrls)].slice(0, 5);
      });
      
      console.log(`📸 Extracted ${images.length} images from search results`);
      return images;
      
    } catch (error) {
      console.log(`⚠️ Image extraction error: ${error.message}`);
      return [];
    }
  }
  
  async extractCoordinates(page) {
    try {
      // Try to get coordinates from URL
      const url = page.url();
      const coordMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      
      if (coordMatch) {
        return {
          lat: parseFloat(coordMatch[1]),
          lng: parseFloat(coordMatch[2])
        };
      }
      
      // Try to get coordinates from page data
      const coords = await page.evaluate(() => {
        // Look for coordinate data in various places
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
          const content = script.textContent || '';
          const match = content.match(/\[(-?\d+\.\d+),(-?\d+\.\d+)\]/);
          if (match) {
            return {
              lat: parseFloat(match[1]),
              lng: parseFloat(match[2])
            };
          }
        }
        return null;
      });
      
      return coords;
      
    } catch (error) {
      console.log(`⚠️ Coordinate extraction error: ${error.message}`);
      return null;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

module.exports = MapsOnlyLookup;