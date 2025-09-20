const puppeteer = require('puppeteer');
const config = require('../config/scraper');

async function debugSelectors() {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  
  await page.goto('https://www.google.com/maps/search/museums%20in%20Alaska%2C%20United%20States');
  await page.waitForTimeout(5000);
  
  const html = await page.evaluate(() => {
    const results = document.querySelectorAll('[role="article"]');
    if (results.length > 0) {
      return results[0].outerHTML;
    }
    return 'No results found';
  });
  
  console.log('First result HTML:');
  console.log(html);
  
  await browser.close();
}

debugSelectors().catch(console.error);