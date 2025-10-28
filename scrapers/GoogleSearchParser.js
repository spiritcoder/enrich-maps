const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const config = require('../config/scraper');

puppeteer.use(StealthPlugin());

class GoogleSearchParser {
  constructor(browser) {
    this.browser = browser;
  }

  async searchBusiness(businessName, location = '') {
    const page = await this.browser.newPage();
    
    try {
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      });

      // Enhanced query construction with better location context
      let query;
      if (location) {
        // Add country context for better results
        const locationContext = location.toLowerCase().includes('nigeria') ? location : `${location} Nigeria`;
        query = `"${businessName}" ${locationContext} contact phone website address`;
      } else {
        query = `"${businessName}" contact phone website address business`;
      }
      
      console.log(`🔍 Google Search query: ${query}`);
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      
      console.log(`🔗 Search URL: ${searchUrl}`);
      await page.goto(searchUrl, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.waitForTimeout(2000 + Math.random() * 3000);

      const results = await this.extractSearchResults(page);
      return results;
      
    } catch (error) {
      console.error(`Search error for ${businessName}:`, error.message);
      return null;
    } finally {
      await page.close();
    }
  }

  async extractSearchResults(page) {
    return await page.evaluate(() => {
      const results = [];
      
      // Extract knowledge panel info with enhanced selectors
      const knowledgePanelSelectors = [
        '[data-attrid="kc:/business/business:phone"]',
        '[data-attrid="kc:/business/business:website"]',
        '[data-attrid="kc:/location/location:address"]',
        '.kp-wholepage',
        '.knowledge-panel'
      ];
      
      let knowledgePanel = null;
      for (const selector of knowledgePanelSelectors) {
        knowledgePanel = document.querySelector(selector);
        if (knowledgePanel) break;
      }
      
      if (knowledgePanel) {
        const panel = knowledgePanel.closest('[data-md]') || knowledgePanel.closest('.kp-wholepage') || knowledgePanel;
        if (panel) {
          const result = {
            type: 'knowledge_panel',
            name: panel.querySelector('h2')?.textContent?.trim() || 
                  panel.querySelector('h1')?.textContent?.trim() ||
                  panel.querySelector('.qrShPb')?.textContent?.trim(),
            phone: panel.querySelector('[data-attrid="kc:/business/business:phone"] span')?.textContent?.trim() ||
                   panel.querySelector('[data-attrid*="phone"]')?.textContent?.trim(),
            website: panel.querySelector('[data-attrid="kc:/business/business:website"] a')?.href ||
                     panel.querySelector('a[href^="http"]:not([href*="google"])')?.href,
            address: panel.querySelector('[data-attrid="kc:/business/business:address"]')?.textContent?.trim() ||
                     panel.querySelector('[data-attrid*="address"]')?.textContent?.trim(),
            confidence: 0.9
          };
          
          // Only add if we found some useful data
          if (result.name || result.phone || result.website || result.address) {
            results.push(result);
          }
        }
      }

      // Extract regular search results with enhanced patterns
      const searchResultSelectors = ['[data-ved] h3', '.g h3', '.rc h3'];
      let searchResults = [];
      
      for (const selector of searchResultSelectors) {
        searchResults = document.querySelectorAll(selector);
        if (searchResults.length > 0) break;
      }
      
      searchResults.forEach((titleEl, index) => {
        if (index < 5) { // Top 5 results only
          const container = titleEl.closest('[data-ved]') || titleEl.closest('.g') || titleEl.closest('.rc');
          const link = titleEl.closest('a')?.href;
          const snippet = container?.querySelector('[data-sncf]')?.textContent?.trim() ||
                         container?.querySelector('.VwiC3b')?.textContent?.trim() ||
                         container?.querySelector('.s')?.textContent?.trim();
          
          if (link && snippet) {
            // Enhanced phone pattern matching for Nigerian numbers
            const phonePatterns = [
              /(\+234[0-9]{10})/,  // Nigerian international format
              /(0[789][01][0-9]{8})/,  // Nigerian mobile format
              /(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/,  // General format
              /(\d{4}[-.\s]?\d{3}[-.\s]?\d{4})/ // Alternative format
            ];
            
            let phoneMatch = null;
            for (const pattern of phonePatterns) {
              phoneMatch = snippet.match(pattern);
              if (phoneMatch) break;
            }
            
            const emailMatch = snippet.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
            
            results.push({
              type: 'search_result',
              title: titleEl.textContent?.trim(),
              url: link,
              snippet: snippet,
              phone: phoneMatch ? phoneMatch[1] : null,
              email: emailMatch ? emailMatch[1] : null,
              confidence: 0.7 - (index * 0.1)
            });
          }
        }
      });

      return results;
    });
  }
}

module.exports = GoogleSearchParser;