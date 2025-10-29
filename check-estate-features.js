const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

async function checkEstateFeatures() {
  console.log('🔍 Checking available features for Abraham Adesanya Estate');
  
  const browser = await puppeteer.launch({
    headless: false, // Show browser
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
    await page.waitForTimeout(5000);
    
    // Check for images
    const images = await page.evaluate(() => {
      const imageElements = [];
      
      // Look for various image selectors
      const selectors = [
        'img[src*="googleusercontent"]',
        'img[src*="maps.gstatic"]',
        'img[src*="streetview"]',
        'img[data-src]',
        '[style*="background-image"]'
      ];
      
      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          let src = '';
          if (el.tagName === 'IMG') {
            src = el.src || el.dataset.src || '';
          } else {
            const style = el.style.backgroundImage || '';
            const match = style.match(/url\\(["']?([^"')]+)["']?\\)/);
            src = match ? match[1] : '';
          }
          
          if (src && src.length > 10 && !src.includes('data:image')) {
            imageElements.push({
              src,
              alt: el.alt || '',
              selector
            });
          }
        });
      });
      
      return imageElements;
    });
    
    console.log(`📸 Found ${images.length} images:`);
    images.forEach((img, index) => {
      console.log(`  ${index + 1}. ${img.src}`);
      console.log(`     Alt: "${img.alt}"`);
      console.log(`     Selector: ${img.selector}`);
    });
    
    // Check for additional text content that might contain more info
    const additionalInfo = await page.evaluate(() => {
      const info = {};
      
      // Look for rating/review info
      const ratingElements = document.querySelectorAll('[data-value], .section-star-display, .review-score');
      ratingElements.forEach(el => {
        const text = el.textContent?.trim();
        if (text && (text.includes('★') || text.match(/\\d+\\.\\d+/))) {
          info.rating = text;
        }
      });
      
      // Look for categories/types
      const categoryElements = document.querySelectorAll('.section-result-details, .section-result-location');
      categoryElements.forEach(el => {
        const text = el.textContent?.trim();
        if (text && text.length > 5) {
          info.category = text;
        }
      });
      
      // Look for phone numbers
      const phoneElements = document.querySelectorAll('[href^="tel:"], .section-result-phone-number');
      phoneElements.forEach(el => {
        const phone = el.href?.replace('tel:', '') || el.textContent?.trim();
        if (phone) {
          info.phone = phone;
        }
      });
      
      // Look for website links
      const websiteElements = document.querySelectorAll('[href^="http"]:not([href*="google.com"]):not([href*="maps"])');
      websiteElements.forEach(el => {
        if (el.href && !el.href.includes('google') && !el.href.includes('maps')) {
          info.website = el.href;
        }
      });
      
      // Look for hours information
      const hoursElements = document.querySelectorAll('.section-open-hours, .section-hours');
      hoursElements.forEach(el => {
        const text = el.textContent?.trim();
        if (text && (text.includes('Open') || text.includes('Closed') || text.includes('AM') || text.includes('PM'))) {
          info.hours = text;
        }
      });
      
      return info;
    });
    
    console.log('\\n📋 Additional Information Found:');
    Object.entries(additionalInfo).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });
    
    // Check if clicking on the result reveals more info
    console.log('\\n🖱️ Trying to click on the estate result...');
    
    const clicked = await page.evaluate(() => {
      const elements = document.querySelectorAll('[jsaction*="pane"]');
      for (const el of elements) {
        const text = el.textContent?.toLowerCase() || '';
        if (text.includes('abraham') && text.includes('adesanya')) {
          el.click();
          return true;
        }
      }
      return false;
    });
    
    if (clicked) {
      console.log('✅ Clicked on estate result, waiting for details...');
      await page.waitForTimeout(3000);
      
      // Check for more detailed information after clicking
      const detailedInfo = await page.evaluate(() => {
        const details = {};
        
        // Look for more images after clicking
        const moreImages = document.querySelectorAll('img[src*="googleusercontent"], img[src*="streetview"]');
        details.imageCount = moreImages.length;
        
        // Look for detailed address
        const addressElements = document.querySelectorAll('.section-result-location, [data-item-id*="address"]');
        addressElements.forEach(el => {
          const text = el.textContent?.trim();
          if (text && text.length > 10) {
            details.detailedAddress = text;
          }
        });
        
        // Look for any additional metadata
        const metaElements = document.querySelectorAll('[data-value], [data-item-id]');
        const metadata = [];
        metaElements.forEach(el => {
          if (el.dataset.value || el.dataset.itemId) {
            metadata.push({
              value: el.dataset.value || '',
              itemId: el.dataset.itemId || '',
              text: el.textContent?.trim() || ''
            });
          }
        });
        details.metadata = metadata.slice(0, 5); // First 5 items
        
        return details;
      });
      
      console.log('\\n📋 Detailed Information After Click:');
      console.log(`📸 Total images found: ${detailedInfo.imageCount}`);
      if (detailedInfo.detailedAddress) {
        console.log(`📍 Detailed address: ${detailedInfo.detailedAddress}`);
      }
      console.log('🏷️ Metadata found:');
      detailedInfo.metadata.forEach((meta, index) => {
        console.log(`  ${index + 1}. Value: ${meta.value}, ID: ${meta.itemId}, Text: ${meta.text}`);
      });
    }
    
    // Wait for manual inspection
    console.log('\\n⏸️ Browser will stay open for 30 seconds for manual inspection...');
    await page.waitForTimeout(30000);
    
  } catch (error) {
    console.error('❌ Check failed:', error.message);
  } finally {
    await browser.close();
  }
}

checkEstateFeatures().then(() => {
  console.log('🏁 Feature check completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Feature check crashed:', error);
  process.exit(1);
});