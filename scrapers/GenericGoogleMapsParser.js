const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const UserAgent = require('user-agents');
const config = require('../config/scraper');
const ProxyManager = require('../services/ProxyManager');

puppeteer.use(StealthPlugin());

class GenericGoogleMapsParser {
  constructor(rateLimiter, niche = null) {
    // Default niche config for when no niche is provided
    this.niche = niche || {
      name: 'generic',
      search: { maxPerSearch: 100 },
      validation: {
        includeKeywords: [],
        excludeKeywords: []
      }
    };
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
      headless: "new",
      args,
      ignoreDefaultArgs: ['--enable-automation'],
      defaultViewport: null
    });
  }

  async scrapeBusinesses(query, country, subdivision, progressCallback = null) {
    const page = await this.browser.newPage();
    const userAgent = new UserAgent();
    
    try {
      const credentials = this.proxyManager.getCredentials();
      if (credentials) {
        await page.authenticate(credentials);
      }
      
      const viewports = [
        { width: 1920, height: 1080 },
        { width: 1366, height: 768 },
        { width: 1440, height: 900 },
        { width: 1536, height: 864 }
      ];
      const viewport = viewports[Math.floor(Math.random() * viewports.length)];
      
      await page.setUserAgent(userAgent.toString());
      await page.setViewport(viewport);
      
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
      
      await page.waitForTimeout(5000);
      
      const pageContent = await page.content();
      const pageTitle = await page.title();
      
      if (this.isConsentPage(pageContent, pageTitle)) {
        console.log(`🔒 Consent page detected, handling...`);
        const handled = await this.handleConsentPage(page);
        if (!handled) {
          console.log(`❌ Failed to handle consent page`);
          return 0;
        }
        await page.waitForTimeout(3000);
      } else if (this.isErrorPage(pageContent, pageTitle)) {
        console.log(`❌ Google error page detected for: ${query}`);
        return 0;
      }
      
      await page.waitForTimeout(3000 + Math.random() * 4000);
      await this.simulateHumanBehavior(page);
      await this.scrollResults(page);
      
      const links = await this.extractBusinessLinks(page);
      
      if (links.length === 0) {
        console.log(`No results found for: ${query}`);
        return 0;
      }
      
      console.log(`Found ${links.length} business links`);
      
      const maxBusinesses = this.niche.search.maxPerSearch || 100;
      const targetCount = Math.min(links.length, maxBusinesses);
      let savedCount = 0;
      
      for (let i = 0; i < targetCount; i++) {
        try {
          console.log(`Extracting business ${i + 1}/${targetCount}`);
          const details = await this.extractBusinessDetails(links[i]);
          
          if (details && details.name) {
            console.log(`Extracted: ${details.name}`);
            
            if (this.isValidBusiness(details.name, details.categories)) {
              details.country = country;
              details.subdivision = subdivision;
              details.source_url = searchUrl;
              details.scraped_at = new Date();
              
              try {
                const result = await this.saveBusiness(details);
                if (result) {
                  savedCount++;
                  console.log(`✓ Saved business ${savedCount}/${targetCount}: ${details.name}`);
                  
                  // Call progress callback if provided
                  if (progressCallback) {
                    await progressCallback(i + 1, targetCount);
                  }
                } else {
                  console.log(`↻ Duplicate skipped: ${details.name}`);
                }
              } catch (saveError) {
                console.error(`✗ Failed to save business ${details.name}:`, saveError.message);
              }
            } else {
              console.log(`✗ Not a valid ${this.niche.name}: ${details.name}`);
            }
          } else {
            console.log(`✗ Failed to extract name from business ${i + 1}`);
          }
        } catch (error) {
          console.error(`Error extracting business ${i + 1}:`, error.message);
        }
        
        if (i < targetCount - 1) {
          const delay = 8000 + Math.random() * 12000;
          console.log(`⏳ Waiting ${Math.round(delay/1000)}s before next business...`);
          await page.waitForTimeout(delay);
        }
      }
      
      return savedCount;
      
    } catch (error) {
      console.error(`Error scraping ${query}:`, error.message);
      return 0;
    } finally {
      await page.close();
    }
  }

  isValidBusiness(name, categories = []) {
    if (!name) return false;
    
    // If no validation keywords are set, accept all businesses
    if (!this.niche.validation.includeKeywords || this.niche.validation.includeKeywords.length === 0) {
      return true;
    }
    
    const nameLower = name.toLowerCase();
    
    // Check categories first
    if (categories && categories.length > 0) {
      const categoryText = categories.join(' ').toLowerCase();
      if (this.niche.validation.includeKeywords.some(keyword => categoryText.includes(keyword.toLowerCase()))) {
        return true;
      }
    }
    
    // Check exclude keywords
    if (this.niche.validation.excludeKeywords && this.niche.validation.excludeKeywords.some(keyword => nameLower.includes(keyword.toLowerCase()))) {
      return false;
    }
    
    // Check include keywords in name
    if (this.niche.validation.includeKeywords.some(keyword => nameLower.includes(keyword.toLowerCase()))) {
      return true;
    }
    
    // Trust Google's search results as fallback
    return true;
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
      await detailPage.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/maps/'
      });
      
      await detailPage.goto(link, { waitUntil: 'networkidle0', timeout: config.timeout });
      await detailPage.waitForTimeout(3000);
      
      const pageContent = await detailPage.content();
      const pageTitle = await detailPage.title();
      
      if (this.isConsentPage(pageContent, pageTitle)) {
        const handled = await this.handleConsentPage(detailPage);
        if (!handled) return null;
        await detailPage.waitForTimeout(3000);
      } else if (this.isErrorPage(pageContent, pageTitle)) {
        return null;
      }
      
      await detailPage.waitForTimeout(2000 + Math.random() * 3000);
      await this.simulateHumanBehavior(detailPage);
      
      // Extract name using Chrome extension selectors
      const nameSelectors = ['h1[data-attrid="title"]', '.DUwDvf.lfPIob', '.qBF1Pd.fontHeadlineSmall'];
      for (const selector of nameSelectors) {
        try {
          const nameEl = await detailPage.$(selector);
          if (nameEl) {
            details.name = (await detailPage.evaluate(el => el.textContent?.trim(), nameEl));
            if (details.name) break;
          }
        } catch (err) {
          continue;
        }
      }
      
      // Extract category using Chrome extension selectors
      const categorySelectors = ['.DkEaL', '.YhemCb'];
      for (const selector of categorySelectors) {
        try {
          const catEl = await detailPage.$(selector);
          if (catEl) {
            const categoryText = (await detailPage.evaluate(el => el.textContent?.trim(), catEl));
            if (categoryText && !categoryText.includes('directions') && !categoryText.includes('call')) {
              details.categories = [categoryText];
              break;
            }
          }
        } catch (err) {
          continue;
        }
      }
      
      // Extract rating using Chrome extension selectors
      const ratingSelectors = ['.MW4etd', '.ceNzKf'];
      for (const selector of ratingSelectors) {
        try {
          const ratingEl = await detailPage.$(selector);
          if (ratingEl) {
            const ratingText = (await detailPage.evaluate(el => el.textContent?.trim(), ratingEl));
            if (ratingText && /^\d+\.?\d*$/.test(ratingText)) {
              details.rating = parseFloat(ratingText);
              break;
            }
          }
        } catch (err) {
          continue;
        }
      }
      
      // Extract review count
      const reviewSelectors = config.selectors.reviews.split(', ');
      for (const selector of reviewSelectors) {
        try {
          const reviewEl = await detailPage.$(selector);
          if (reviewEl) {
            const reviewText = await detailPage.evaluate(el => {
              const text = el.innerText || el.textContent || el.getAttribute('aria-label') || '';
              const match = text.match(/([\d,]+)\s*reviews?/i);
              return match ? match[1] : null;
            }, reviewEl);
            
            if (reviewText) {
              details.review_count = parseInt(reviewText.replace(/,/g, ''));
              break;
            }
          }
        } catch (err) {
          continue;
        }
      }
      
      // Extract phone using Chrome extension selectors
      const phoneSelectors = ['[data-item-id^="phone"] .Io6YTe', '[data-value*="+"]'];
      for (const selector of phoneSelectors) {
        try {
          const phoneEl = await detailPage.$(selector);
          if (phoneEl) {
            let phoneText = await detailPage.evaluate(el => el.textContent?.trim(), phoneEl);
            if (phoneText) {
              details.phone = phoneText;
              break;
            }
          }
        } catch (err) {
          continue;
        }
      }
      
      // Extract website using Chrome extension selectors
      const websiteSelectors = ['[data-item-id="authority"] .Io6YTe a', 'a[href^="http"]:not([href*="google"])'];
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
      
      // Extract address using Chrome extension selectors
      const addressSelectors = ['[data-item-id="address"] .Io6YTe', '.LrzXr'];
      for (const selector of addressSelectors) {
        try {
          const addrEl = await detailPage.$(selector);
          if (addrEl) {
            let addressText = await detailPage.evaluate(el => el.textContent?.trim(), addrEl);
            if (addressText && addressText.length > 5) {
              details.address = addressText;
              break;
            }
          }
        } catch (err) {
          continue;
        }
      }
      
      // Extract detailed hours by day
      try {
        const hoursTable = await detailPage.$('.t39EBf.GUrTXd table.eK4R0e');
        if (hoursTable) {
          const hoursData = await detailPage.evaluate(table => {
            const rows = table.querySelectorAll('tr.y0skZc');
            const hours = {};
            const closedDays = [];
            
            rows.forEach(row => {
              const dayEl = row.querySelector('td.ylH6lf div');
              const hoursEl = row.querySelector('td.mxowUb .G8aQO') || row.querySelector('td.mxowUb');
              
              if (dayEl && hoursEl) {
                const day = dayEl.textContent.trim();
                let dayHours = hoursEl.textContent?.trim() || hoursEl.getAttribute('aria-label')?.trim();
                
                if (dayHours) {
                  // Clean hours text
                  dayHours = dayHours.replace(/\s+to\s+/g, '–').replace(/\s+/g, ' ');
                  hours[day] = dayHours;
                  
                  if (dayHours.toLowerCase().includes('closed')) {
                    closedDays.push(day);
                  }
                }
              }
            });
            
            return { hours, closedDays };
          }, hoursTable);
          
          if (Object.keys(hoursData.hours).length > 0) {
            details.hours_detailed = hoursData.hours;
            details.closed_days = hoursData.closedDays;
            details.is_open_sunday = hoursData.hours.Sunday && !hoursData.hours.Sunday.toLowerCase().includes('closed');
            
            // Create summary hours string
            const hoursSummary = Object.entries(hoursData.hours)
              .map(([day, hours]) => `${day}: ${hours}`)
              .join(', ');
            details.hours = hoursSummary;
          }
        }
      } catch (err) {
        // Fallback to simple hours extraction
        const hoursSelectors = ['[data-item-id="oh"] .Io6YTe', '.t39EBf .G8aQO', 'div[data-item-id="oh"]', '.t39EBf', '.OqCZI'];
        for (const selector of hoursSelectors) {
          try {
            const hoursEl = await detailPage.$(selector);
            if (hoursEl) {
              let hoursText = await detailPage.evaluate(el => {
                return el.textContent || el.innerText;
              }, hoursEl);
              
              if (hoursText && hoursText.trim().length > 3) {
                details.hours = hoursText.trim();
                break;
              }
            }
          } catch (err) {
            continue;
          }
        }
      }
      
      // Extract reviews as array using Chrome extension approach
      try {
        // Try to scroll to reviews section first
        await detailPage.evaluate(() => {
          const reviewsSection = document.querySelector('.jftiEf') || document.querySelector('[data-review-id]');
          if (reviewsSection) {
            reviewsSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        });
        await detailPage.waitForTimeout(2000);
        
        // Try multiple review selectors
        const reviewSelectors = ['.jftiEf .wiI7pd', '.MyEned .wiI7pd', '.gws-localreviews__google-review', '.ODSEW-ShBeI-text'];
        let reviewElements = [];
        
        for (const selector of reviewSelectors) {
          reviewElements = await detailPage.$$(selector);
          if (reviewElements.length > 0) break;
        }
        
        const reviews = [];
        const maxReviews = Math.min(10, reviewElements.length); // Increased to 10
        
        for (let i = 0; i < maxReviews; i++) {
          try {
            const reviewText = await detailPage.evaluate(el => el.textContent?.trim(), reviewElements[i]);
            if (reviewText && reviewText.length > 10) {
              reviews.push(reviewText);
            }
          } catch (err) {
            continue;
          }
        }
        
        if (reviews.length > 0) {
          details.reviews = reviews; // Store as array
          details.reviews_text = reviews.join(' | '); // Also keep joined version for compatibility
        }
      } catch (err) {
        console.log('Reviews extraction failed:', err.message);
      }
      
      // Extract coordinates from URL (multiple patterns)
      let coordMatch = link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (!coordMatch) {
        coordMatch = link.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
        if (coordMatch) {
          details.lat = parseFloat(coordMatch[1]);
          details.lng = parseFloat(coordMatch[2]);
        }
      } else {
        details.lat = parseFloat(coordMatch[1]);
        details.lng = parseFloat(coordMatch[2]);
      }
      
      // Fallback: extract coordinates from page content
      if (!details.lat || !details.lng) {
        try {
          const coords = await detailPage.evaluate(() => {
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
              const text = script.textContent || '';
              const match = text.match(/"(-?\d+\.\d+)","(-?\d+\.\d+)"/);
              if (match) {
                return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
              }
            }
            return null;
          });
          if (coords) {
            details.lat = coords.lat;
            details.lng = coords.lng;
          }
        } catch (err) {}
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
      
      // Extract about/description using better selectors
      const aboutSelectors = ['.PYvSYb', '.lMbq3e', '.WeS02d .fontBodyMedium', '[data-attrid="kc:/collection/knowledge_panels/local_business:business_description"]', '.rogA2c .fontBodyMedium'];
      for (const selector of aboutSelectors) {
        try {
          const aboutEl = await detailPage.$(selector);
          if (aboutEl) {
            const aboutText = (await detailPage.evaluate(el => el.textContent?.trim(), aboutEl));
            if (aboutText && aboutText.length > 10 && !aboutText.includes('Suggest an edit')) {
              details.about = aboutText;
              break;
            }
          }
        } catch (err) {
          continue;
        }
      }
      
      // Fallback: extract review count from about text if not found
      if (!details.review_count && details.about) {
        const aboutMatch = details.about.match(/\((\d+)\)/); // Match (197) pattern
        if (aboutMatch) {
          details.review_count = parseInt(aboutMatch[1]);
        }
      }
      
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

  isConsentPage(content, title = '') {
    const contentLower = content.toLowerCase();
    const titleLower = title.toLowerCase();
    
    const consentPatterns = [
      'before you continue to google',
      'before you use google',
      '繼續使用 google 之前',
      'privacy and terms'
    ];
    
    const hasConsentPattern = consentPatterns.some(pattern => 
      contentLower.includes(pattern) || titleLower.includes(pattern)
    );
    
    const hasConsentButtons = (contentLower.includes('accept') && contentLower.includes('reject')) ||
                             (contentLower.includes('agree') && contentLower.includes('disagree'));
    
    return hasConsentPattern && hasConsentButtons;
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

  isErrorPage(content, title = '') {
    const errorPatterns = [
      'verify you\'re human',
      'unusual traffic from your computer network',
      'our systems have detected unusual traffic',
      'please complete the security check',
      'solve this captcha',
      'access to this page has been denied',
      'suspicious activity'
    ];
    
    const titleLower = title.toLowerCase();
    if (titleLower.includes('access denied') || titleLower.includes('blocked') || titleLower.includes('captcha')) {
      return true;
    }
    
    const contentLower = content.toLowerCase();
    return errorPatterns.some(pattern => contentLower.includes(pattern));
  }

  async simulateHumanBehavior(page) {
    try {
      await page.evaluate(() => {
        window.scrollBy(0, Math.random() * 300 + 100);
      });
      
      await page.waitForTimeout(500 + Math.random() * 1000);
      
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

  async saveBusiness(businessData) {
    if (this.database) {
      return await this.database.insertRawData(businessData);
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

module.exports = GenericGoogleMapsParser;