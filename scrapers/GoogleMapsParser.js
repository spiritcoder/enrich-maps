const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const UserAgent = require('user-agents');
const config = require('../config/scraper');
const ProxyManager = require('../services/ProxyManager');

puppeteer.use(StealthPlugin());

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
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-plugins',
      '--disable-images',
      '--disable-javascript-harmony-shipping',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ];
    if (proxyUrl) {
      args.push(`--proxy-server=${proxyUrl}`);
    }

    this.browser = await puppeteer.launch({ 
      headless: true,
      args,
      ignoreDefaultArgs: ['--enable-automation'],
      defaultViewport: null
    });
  }

  async scrapeMuseums(query, country, subdivision) {
    const page = await this.browser.newPage();
    const userAgent = new UserAgent();
    
    try {
      const credentials = this.proxyManager.getCredentials();
      if (credentials) {
        await page.authenticate(credentials);
      }
      
      // Set realistic user agent and viewport
      const viewports = [
        { width: 1920, height: 1080 },
        { width: 1366, height: 768 },
        { width: 1440, height: 900 },
        { width: 1536, height: 864 }
      ];
      const viewport = viewports[Math.floor(Math.random() * viewports.length)];
      
      await page.setUserAgent(userAgent.toString());
      await page.setViewport(viewport);
      
      // Set realistic headers
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1'
      });
      
      await this.rateLimiter.wait();
      
      const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
      await page.goto(searchUrl, { waitUntil: 'networkidle0', timeout: config.timeout });
      
      // Wait for page to fully load before checking for errors
      await page.waitForTimeout(5000);
      
      // Check for Google error pages only after full load
      const pageContent = await page.content();
      const pageTitle = await page.title();
      
      if (this.isErrorPage(pageContent, pageTitle)) {
        const timestamp = Date.now();
        const screenshotPath = `screenshots/error_search_${timestamp}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        
        console.log(`❌ Google error page detected for: ${query}`);
        console.log(`📸 Screenshot saved: ${screenshotPath}`);
        console.log(`📄 Page title: ${pageTitle}`);
        console.log(`🔗 URL: ${page.url()}`);
        
        return [];
      }
      
      // Human-like behavior
      await page.waitForTimeout(3000 + Math.random() * 4000);
      await this.simulateHumanBehavior(page);
      
      // Scroll to load more results
      await this.scrollResults(page);
      
      // Extract business links
      const links = await this.extractBusinessLinks(page);
      
      if (links.length === 0) {
        console.log(`No results found for: ${query}`);
        return [];
      }
      
      console.log(`Found ${links.length} business links`);
      
      // Extract details from each business with progressive saving
      const maxMuseums = config.max_museums_per_search;
      const targetCount = Math.min(links.length, maxMuseums);
      let savedCount = 0;
      
      for (let i = 0; i < targetCount; i++) {
        try {
          console.log(`Extracting business ${i + 1}/${targetCount}`);
          const details = await this.extractBusinessDetails(links[i]);
          
          if (details && details.name) {
            console.log(`Extracted: ${details.name}`);
            
            if (this.isMuseum(details.name, details.categories)) {
              details.country = country;
              details.subdivision = subdivision;
              details.source_url = searchUrl;
              details.scraped_at = new Date();
              
              // Progressive saving - save immediately
              try {
                const result = await this.saveMuseum(details);
                savedCount++;
                console.log(`✓ Saved museum ${savedCount}/${targetCount}: ${details.name} (ID: ${result})`);
              } catch (saveError) {
                console.error(`✗ Failed to save museum ${details.name}:`, saveError.message);
              }
            } else {
              console.log(`✗ Not a museum: ${details.name}`);
            }
          } else {
            console.log(`✗ Failed to extract name from business ${i + 1}`);
          }
        } catch (error) {
          console.error(`Error extracting business ${i + 1}:`, error.message);
        }
        
        // Human-like delay between requests
        if (i < targetCount - 1) {
          const delay = 8000 + Math.random() * 12000; // 8-20 seconds
          console.log(`⏳ Waiting ${Math.round(delay/1000)}s before next museum...`);
          await page.waitForTimeout(delay);
        }
      }
      
      return savedCount;
      
    } catch (error) {
      console.error(`Error scraping ${query}:`, error.message);
      return [];
    } finally {
      await page.close();
    }
  }

  async scrollResults(page) {
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

    for (let i = 0; i < 3; i++) {
      try {
        if (feedElement) {
          await page.evaluate(el => {
            el.scrollTop = el.scrollHeight;
          }, feedElement);
        } else {
          await page.evaluate(() => {
            window.scrollBy(0, 1000);
          });
        }
        
        await page.waitForTimeout(2000 + Math.random() * 1000);
      } catch (err) {
        console.error(`Scroll error ${i + 1}:`, err.message);
      }
    }
  }

  async extractBusinessLinks(page) {
    const linkSelectors = config.selectors.results.split(', ');
    
    let links = [];
    for (const selector of linkSelectors) {
      try {
        const foundLinks = await page.$$eval(selector, els => 
          els.map(el => el.href).filter(href => href && href.includes('/maps/place/'))
        );
        if (foundLinks.length > 0) {
          links = foundLinks;
          break;
        }
      } catch (err) {
        continue;
      }
    }
    
    return [...new Set(links)];
  }

  async extractBusinessDetails(link) {
    const detailPage = await this.browser.newPage();
    const details = {};
    
    try {
      // Set headers for detail page
      await detailPage.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/maps/'
      });
      
      await detailPage.goto(link, { waitUntil: 'networkidle0', timeout: config.timeout });
      
      // Wait for page to fully load before checking for errors
      await detailPage.waitForTimeout(3000);
      
      // Check for error pages only after full load
      const pageContent = await detailPage.content();
      const pageTitle = await detailPage.title();
      
      if (this.isErrorPage(pageContent, pageTitle)) {
        const timestamp = Date.now();
        const screenshotPath = `screenshots/error_detail_${timestamp}.png`;
        await detailPage.screenshot({ path: screenshotPath, fullPage: true });
        
        console.log(`❌ Error page detected on detail page`);
        console.log(`📸 Screenshot saved: ${screenshotPath}`);
        console.log(`📄 Page title: ${pageTitle}`);
        console.log(`🔗 URL: ${detailPage.url()}`);
        
        return null;
      }
      
      await detailPage.waitForTimeout(2000 + Math.random() * 3000);
      await this.simulateHumanBehavior(detailPage);
      
      // Extract name
      const nameSelectors = config.selectors.name.split(', ');
      for (const selector of nameSelectors) {
        try {
          const nameEl = await detailPage.$(selector);
          if (nameEl) {
            details.name = (await detailPage.evaluate(el => el.innerText, nameEl)).trim();
            break;
          }
        } catch (err) {
          continue;
        }
      }
      
      // Extract category
      const categorySelectors = config.selectors.category.split(', ');
      for (const selector of categorySelectors) {
        try {
          const catEl = await detailPage.$(selector);
          if (catEl) {
            const categoryText = (await detailPage.evaluate(el => el.innerText, catEl)).trim();
            if (categoryText && !categoryText.includes('directions') && !categoryText.includes('call')) {
              details.categories = [categoryText];
              break;
            }
          }
        } catch (err) {
          continue;
        }
      }
      
      // Extract rating
      const ratingSelectors = config.selectors.rating.split(', ');
      for (const selector of ratingSelectors) {
        try {
          const ratingEl = await detailPage.$(selector);
          if (ratingEl) {
            const ratingText = (await detailPage.evaluate(el => el.innerText, ratingEl)).trim();
            if (ratingText && /^\d+\.?\d*$/.test(ratingText)) {
              details.rating = parseFloat(ratingText);
              break;
            }
          }
        } catch (err) {
          continue;
        }
      }
      
      // Extract review count - try multiple approaches
      details.review_count = 0;
      
      // Method 1: Look for review count in rating area
      try {
        const reviewText = await detailPage.evaluate(() => {
          const ratingArea = document.querySelector('.jANrlb, .ceNzKf')?.parentElement;
          if (ratingArea) {
            const text = ratingArea.textContent || '';
            const match = text.match(/([\d,]+)\s*reviews?/i);
            return match ? match[1] : null;
          }
          return null;
        });
        
        if (reviewText) {
          details.review_count = parseInt(reviewText.replace(/,/g, ''));
        }
      } catch (err) {}
      
      // Method 2: Search entire page for review count if not found
      if (details.review_count === 0) {
        try {
          const reviewCount = await detailPage.evaluate(() => {
            const allText = document.body.textContent || '';
            const matches = allText.match(/([\d,]+)\s*reviews?/gi);
            if (matches && matches.length > 0) {
              const numbers = matches.map(m => {
                const num = m.match(/([\d,]+)/)[1];
                return parseInt(num.replace(/,/g, ''));
              });
              return Math.max(...numbers);
            }
            return 0;
          });
          
          details.review_count = reviewCount;
        } catch (err) {}
      }
      
      // Extract phone
      const phoneSelectors = config.selectors.phone.split(', ');
      for (const selector of phoneSelectors) {
        try {
          const phoneEl = await detailPage.$(selector);
          if (phoneEl) {
            let phoneText = await detailPage.evaluate(el => el.innerText || el.getAttribute('href'), phoneEl);
            if (phoneText) {
              if (phoneText.startsWith('tel:')) {
                phoneText = phoneText.replace('tel:', '');
              }
              details.phone = phoneText.trim();
              break;
            }
          }
        } catch (err) {
          continue;
        }
      }
      
      // Extract website
      const websiteSelectors = config.selectors.website.split(', ');
      for (const selector of websiteSelectors) {
        try {
          const websiteEl = await detailPage.$(selector);
          if (websiteEl) {
            const href = await detailPage.evaluate(el => el.href, websiteEl);
            if (href && href.startsWith('http') && !href.includes('google.com')) {
              details.website = href;
              break;
            }
          }
        } catch (err) {
          continue;
        }
      }
      
      // Extract address
      const addressSelectors = config.selectors.address.split(', ');
      for (const selector of addressSelectors) {
        try {
          const addrEl = await detailPage.$(selector);
          if (addrEl) {
            details.address = (await detailPage.evaluate(el => el.innerText, addrEl)).trim();
            break;
          }
        } catch (err) {
          continue;
        }
      }
      
      // Extract coordinates from URL
      const match = link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (match) {
        details.lat = parseFloat(match[1]);
        details.lng = parseFloat(match[2]);
      }
      
      // Extract images
      const imageSelectors = config.selectors.images.split(', ');
      const images = [];
      for (const selector of imageSelectors) {
        try {
          const imageEls = await detailPage.$$(selector);
          for (const imgEl of imageEls.slice(0, 5)) {
            const src = await detailPage.evaluate(el => el.src || el.dataset.src, imgEl);
            if (src && src.includes('googleusercontent') && !images.includes(src)) {
              images.push(src);
            }
          }
          if (images.length > 0) break;
        } catch (err) {
          continue;
        }
      }
      details.images = images;
      
      if (!details.review_count) {
        details.review_count = 0;
      }
      
      return details;
      
    } catch (error) {
      console.error(`Error extracting details from ${link}:`, error.message);
      return null;
    } finally {
      await detailPage.close();
    }
  }

  isMuseum(name, categories = []) {
    if (!name) return false;
    
    // Step 1: Check categories first (most reliable)
    const museumCategories = [
      'museum', 'art museum', 'history museum', 'science museum', 'natural history museum',
      'gallery', 'art gallery', 'exhibition', 'cultural center', 'heritage center',
      'planetarium', 'aquarium', 'zoo', 'botanical garden', 'art center'
    ];
    
    if (categories && categories.length > 0) {
      const categoryText = categories.join(' ').toLowerCase();
      if (museumCategories.some(cat => categoryText.includes(cat))) {
        return true;
      }
    }
    
    // Step 2: Multi-language name keywords
    const museumKeywords = [
      // English
      'museum', 'gallery', 'exhibition', 'art center', 'cultural center',
      'heritage', 'history center', 'science center', 'planetarium',
      'aquarium', 'zoo', 'botanical garden',
      // French
      'musée', 'galerie', 'exposition', 'centre culturel',
      // German
      'museum', 'galerie', 'ausstellung', 'kulturzentrum',
      // Spanish
      'museo', 'galería', 'exposición', 'centro cultural',
      // Italian
      'museo', 'galleria', 'mostra', 'centro culturale',
      // Portuguese
      'museu', 'galeria', 'centro cultural',
      // Dutch
      'museum', 'galerij', 'tentoonstelling',
      // Japanese
      '博物館', '美術館', 'ギャラリー',
      // Chinese
      '博物馆', '美术馆', '画廊'
    ];
    
    // Step 3: Exclude non-museums
    const excludeKeywords = [
      'restaurant', 'hotel', 'shop', 'store', 'mall', 'parking',
      'hospital', 'school', 'office', 'apartment', 'bank', 'pharmacy'
    ];
    
    const nameLower = name.toLowerCase();
    
    if (excludeKeywords.some(keyword => nameLower.includes(keyword))) {
      return false;
    }
    
    // Step 4: Check name against multi-language keywords
    if (museumKeywords.some(keyword => nameLower.includes(keyword))) {
      return true;
    }
    
    // Step 5: Trust Google's search results (fallback)
    // Since we're searching for "museums in [location]", accept anything that passes exclusion
    return true;
  }

  isErrorPage(content, title = '') {
    // More specific error patterns to avoid false positives
    const errorPatterns = [
      'before you continue to google',
      'verify you\'re human',
      'unusual traffic from your computer network',
      'our systems have detected unusual traffic',
      'please complete the security check',
      'solve this captcha',
      'access to this page has been denied'
    ];
    
    // Check title for obvious error pages
    const titleLower = title.toLowerCase();
    if (titleLower.includes('access denied') || titleLower.includes('blocked') || titleLower.includes('captcha')) {
      console.log(`🔍 Error detected in title: "${title}"`);
      return true;
    }
    
    const contentLower = content.toLowerCase();
    const matchedPattern = errorPatterns.find(pattern => contentLower.includes(pattern));
    
    if (matchedPattern) {
      console.log(`🔍 Error pattern matched: "${matchedPattern}"`);
      return true;
    }
    
    return false;
  }

  async simulateHumanBehavior(page) {
    try {
      // Random scroll
      await page.evaluate(() => {
        window.scrollBy(0, Math.random() * 300 + 100);
      });
      
      await page.waitForTimeout(500 + Math.random() * 1000);
      
      // Random mouse movement
      const viewport = page.viewport();
      await page.mouse.move(
        Math.random() * viewport.width,
        Math.random() * viewport.height
      );
      
      await page.waitForTimeout(300 + Math.random() * 700);
    } catch (error) {
      // Ignore errors in human simulation
    }
  }

  async saveMuseum(museumData) {
    // This will be injected by the master scraper
    if (this.database) {
      return await this.database.insertRawData(museumData);
    }
    throw new Error('Database not available for saving');
  }

  setDatabase(database) {
    this.database = database;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
    await this.proxyManager.close();
  }
}

module.exports = GoogleMapsParser;