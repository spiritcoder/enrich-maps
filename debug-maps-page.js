const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

async function debugMapsPage() {
  console.log('🔍 Debugging Google Maps page for: abraham adesanya estate lekki');
  
  const browser = await puppeteer.launch({
    headless: false, // Show browser to see what's happening
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  const page = await browser.newPage();
  
  try {
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.google.com/maps/'
    });

    const query = 'abraham adesanya estate lekki';
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    
    console.log(`🗺️ Navigating to: ${searchUrl}`);
    
    await page.goto(searchUrl, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForTimeout(5000); // Wait for page to fully load
    
    // Check page title and content
    const title = await page.title();
    console.log(`📄 Page title: ${title}`);
    
    // Check if consent page appeared
    const pageContent = await page.content();
    if (pageContent.toLowerCase().includes('before you continue')) {
      console.log('🚫 Consent page detected - this might be blocking results');
    }
    
    // Look for any links containing /maps/place/
    const allLinks = await page.evaluate(() => {
      const links = [];
      const anchors = document.querySelectorAll('a[href]');
      
      anchors.forEach(anchor => {
        if (anchor.href.includes('/maps/place/')) {
          links.push({
            href: anchor.href,
            text: anchor.textContent?.trim() || '',
            className: anchor.className || ''
          });
        }
      });
      
      return links;
    });
    
    console.log(`🔗 Found ${allLinks.length} /maps/place/ links:`);
    allLinks.forEach((link, index) => {
      console.log(`  ${index + 1}. ${link.href}`);
      console.log(`     Text: "${link.text}"`);
      console.log(`     Class: "${link.className}"`);
    });
    
    // Check for any elements that might contain the estate
    const searchResults = await page.evaluate(() => {
      const results = [];
      
      // Look for common Google Maps result selectors
      const selectors = [
        '[data-result-index]',
        '.hfpxzc',
        '[jsaction*="pane"]',
        '[data-value]',
        '.section-result',
        '.place-result'
      ];
      
      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach((el, index) => {
          const text = el.textContent?.trim() || '';
          if (text.toLowerCase().includes('abraham') || text.toLowerCase().includes('adesanya')) {
            results.push({
              selector,
              index,
              text: text.substring(0, 200),
              hasLink: !!el.querySelector('a[href*="/maps/place/"]')
            });
          }
        });
      });
      
      return results;
    });
    
    console.log(`\n🎯 Found ${searchResults.length} potential estate results:`);
    searchResults.forEach((result, index) => {
      console.log(`  ${index + 1}. Selector: ${result.selector}`);
      console.log(`     Text: "${result.text}"`);
      console.log(`     Has Link: ${result.hasLink}`);
    });
    
    // Wait for user to inspect
    console.log('\n⏸️ Browser will stay open for 30 seconds for manual inspection...');
    await page.waitForTimeout(30000);
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  } finally {
    await browser.close();
  }
}

debugMapsPage().then(() => {
  console.log('🏁 Debug completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Debug crashed:', error);
  process.exit(1);
});