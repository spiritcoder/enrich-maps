# Museum Scraper System

Global museum scraping system designed to collect comprehensive museum data from Google Maps for SEO and directory purposes.

## Architecture Overview

```
museum-scraper/
├── config/           # Configuration files
├── scrapers/         # Core scraping logic
├── services/         # Supporting services
├── models/           # Data models
├── utils/            # Utility functions
└── scripts/          # Main execution scripts
```

## Quick Start

1. **Install Dependencies**
```bash
npm install
```

2. **Start Scraping**
```bash
npm start
```

3. **Process Raw Data**
```bash
npm run process
```

4. **Monitor Progress**
```bash
npm run validate
```

## Key Features

- **Multi-threaded Scraping**: 5 concurrent scrapers
- **Smart Rate Limiting**: 2-8 second delays between requests
- **Museum Detection**: AI-powered filtering of non-museums
- **Duplicate Prevention**: Location and name-based deduplication
- **Data Cleaning**: Standardization and validation
- **Progress Tracking**: Real-time monitoring dashboard

## Expected Results

- **Volume**: 50,000-100,000 museums globally
- **Speed**: 500-1,000 museums per day
- **Timeline**: 3-4 months for complete coverage
- **Quality**: 95%+ accuracy with manual validation triggers

## Database Schema

### Raw Data Table
- Stores unprocessed scraped data
- Includes source URLs and timestamps
- No validation at this stage

### Museums Table
- Clean, validated museum data
- SEO-optimized slugs
- Categorized by museum type
- Geocoded coordinates

### Jobs Table
- Tracks scraping progress
- Manages queue and retries
- Performance monitoring

## Configuration

Edit `config/scraper.js` to adjust:
- Concurrent scraper count
- Request delays
- Search queries
- Country priorities

## Legal Compliance

- Respects rate limits
- Reasonable request delays
- No server overloading
- Attribution where required

## Monitoring

The system provides real-time progress updates:
- Jobs completed/remaining
- Museums found per country
- Error rates and retries
- Estimated completion time

## Data Quality

Automated validation includes:
- Coordinate validation
- Phone number formatting
- Website accessibility
- Image quality checks
- Duplicate detection

Manual review triggers for:
- Museums without contact info
- Unusual coordinate locations
- Special character names
- Flagged duplicates