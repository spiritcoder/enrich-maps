const puppeteer = require('puppeteer');
const UserAgent = require('user-agents');
const config = require('../config/scraper');
const ProxyManager = require('../services/ProxyManager');

class GoogleMapsParser {
  constructor(rateLimiter) {
    this.proxyManager = new ProxyManager();
    this.rateLimiter = rateLimiter;
    this.browser = null;
  }

  async init() {
    await this.proxyManager.init();
    const proxyUrl = this.proxyManager.getProxyUrl();
    
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox', 
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--disable-default-apps'
    ];
    if (proxyUrl) {
      args.push(`--proxy-server=${proxyUrl}`);
    }

    this.browser = await puppeteer.launch({ 
      headless: true, 
      args,
      ignoreDefaultArgs: ['--enable-automation']
    });
  }

  async scrapeMuseums(query, country, subdivision) {
    const page = await this.browser.newPage();
    const userAgent = new UserAgent();
    
    try {
      // Authenticate if proxy is used
      const credentials = this.proxyManager.getCredentials();
      if (credentials) {
        await page.authenticate(credentials);
      }
      
      await page.setUserAgent(userAgent.toString());
      await page.setViewport({ width: 1366, height: 768 });
      
      // Remove webdriver property
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });
      
      await this.rateLimiter.wait();
      
      const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: config.timeout });
      
      // Wait for results to load with multiple selectors
      try {
        await page.waitForSelector(config.selectors.results, { timeout: 15000 });
      } catch (error) {
        // Try alternative approach - wait for any content
        await page.waitForTimeout(3000);
        console.log(`No results found for: ${query}`);
      }
      
      const museums = await page.evaluate((selectors) => {
        const isMuseum = (name) => {
          const museumKeywords = [
            'museum', 'gallery', 'exhibition', 'art center', 'cultural center',
            'heritage', 'history center', 'science center', 'planetarium',
            'aquarium', 'zoo', 'botanical garden'
          ];
          
          const excludeKeywords = [
            'restaurant', 'hotel', 'shop', 'store', 'mall', 'parking',
            'hospital', 'school', 'office', 'apartment'
          ];
          
          const nameLower = name.toLowerCase();
          
          if (excludeKeywords.some(keyword => nameLower.includes(keyword))) {
            return false;
          }
          
          return museumKeywords.some(keyword => nameLower.includes(keyword));
        };
        
        const extractCoordinates = (element) => {
          const link = element.querySelector('a[href*="/@"]');
          if (link) {
            const match = link.href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
            if (match) {
              return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
            }
          }
          return { lat: null, lng: null };
        };
        
        const extractCategories = (element) => {
          const spans = element.querySelectorAll('.W4Efsd span');
          const categories = [];
          spans.forEach(span => {
            const text = span.textContent.trim();
            if (text && !text.includes('·') && !text.includes('Open') && !text.includes('Closed')) {
              categories.push(text);
            }
          });
          return categories.slice(0, 3);
        };
        
        const results = [];
        const elements = document.querySelectorAll(selectors.results);
        
        elements.forEach((element, index) => {
          if (index >= 20) return;
          
          const nameEl = element.querySelector(selectors.name);
          const name = nameEl?.textContent?.trim();
          
          const addressSpans = element.querySelectorAll('.W4Efsd');
          let address = '';
          if (addressSpans.length > 1) {
            address = addressSpans[1]?.textContent?.trim() || '';
          }
          
          const phone = element.querySelector(selectors.phone)?.textContent?.trim();
          const website = element.querySelector(selectors.website)?.href;
          const rating = parseFloat(element.querySelector(selectors.rating)?.textContent?.trim());
          const reviewText = element.querySelector(selectors.reviews)?.textContent?.trim();
          const reviewCount = reviewText ? parseInt(reviewText.replace(/[^\d]/g, '')) : 0;
          
          const imageElements = element.querySelectorAll(selectors.images);
          const images = Array.from(imageElements).slice(0, 5).map(img => img.src || img.dataset.src).filter(Boolean);
          
          const coords = extractCoordinates(element);
          
          if (name && isMuseum(name)) {
            results.push({
              name,
              address: address || null,
              phone: phone || null,
              website: website || null,
              rating: isNaN(rating) ? null : rating,
              review_count: reviewCount,
              images,
              categories: extractCategories(element),
              lat: coords.lat,
              lng: coords.lng
            });
          }
        });
        
        return results;
      }, config.selectors);
      
      // Add metadata
      museums.forEach(museum => {
        museum.country = country;
        museum.subdivision = subdivision;
        museum.source_url = searchUrl;
        museum.scraped_at = new Date();
      });
      
      return museums;
      
    } catch (error) {
      console.error(`Error scraping ${query}:`, error.message);
      return [];
    } finally {
      await page.close();
    }
  }

  isMuseum(name) {
    const museumKeywords = [
      'museum', 'gallery', 'exhibition', 'art center', 'cultural center',
      'heritage', 'history center', 'science center', 'planetarium',
      'aquarium', 'zoo', 'botanical garden'
    ];
    
    const excludeKeywords = [
      'restaurant', 'hotel', 'shop', 'store', 'mall', 'parking',
      'hospital', 'school', 'office', 'apartment'
    ];
    
    const nameLower = name.toLowerCase();
    
    // Exclude non-museums
    if (excludeKeywords.some(keyword => nameLower.includes(keyword))) {
      return false;
    }
    
    // Include museums
    return museumKeywords.some(keyword => nameLower.includes(keyword));
  }

  extractCategories(element) {
    // Extract category information from the element
    const categoryElement = element.querySelector('[data-attrid*="category"]');
    return categoryElement ? [categoryElement.textContent.trim()] : [];
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
    await this.proxyManager.close();
  }
}

module.exports = GoogleMapsParser;