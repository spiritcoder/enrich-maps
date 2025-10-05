# Generic Business Scraper System

Universal business scraping framework designed to collect comprehensive business data from Google Maps for any niche (museums, restaurants, tattoo shops, etc.).

## Architecture Overview

```
terminal-scraper/
├── config/           # Generic configuration system
├── niches/           # Business type configurations
├── scrapers/         # Core scraping logic
├── services/         # Supporting services
└── scripts/          # Main execution scripts
```

## Quick Start

1. **Install Dependencies**
```bash
npm install
```

2. **Start Scraping** (specify niche)
```bash
node scripts/scrape-niche.js museums
node scripts/scrape-niche.js tattoo
node scripts/scrape-niche.js restaurants
```

3. **Process Raw Data**
```bash
node scripts/process-niche.js museums
```

4. **Export to Excel**
```bash
node scripts/export-niche.js museums
```

5. **Monitor Progress**
```bash
node scripts/validate-niche.js museums
```

## Key Features

- **Multi-Niche Support**: Museums, restaurants, tattoo shops, or any business type
- **Configuration-Based**: Add new business types with simple JSON configs
- **Multi-threaded Scraping**: 5 concurrent scrapers
- **Smart Rate Limiting**: 12-25 second delays between requests
- **Business Validation**: Niche-specific filtering and validation rules
- **Duplicate Prevention**: Address, phone, and name-based deduplication
- **Data Cleaning**: Unicode normalization and standardization
- **Quality Filtering**: Rating and review thresholds per niche

## Supported Business Types

- **Museums**: Art, history, science, cultural institutions
- **Restaurants**: All cuisine types and dining establishments  
- **Tattoo Shops**: Tattoo studios and body art businesses
- **Custom**: Add any business type with JSON configuration

## Database Schema

Each niche uses separate MongoDB databases:

### Raw Data Collection
- Stores unprocessed scraped data
- Includes source URLs and timestamps
- No validation at this stage

### Processed Business Collection
- Clean, validated business data
- SEO-optimized slugs
- Categorized by business type
- Geocoded coordinates
- Contact information

### Jobs Collection
- Tracks scraping progress by country/subdivision
- Manages queue and retries
- Performance monitoring

## Adding New Business Types

Create a new JSON file in `niches/` directory:

```json
{
  "name": "your_niche",
  "database": {
    "name": "your_niche_scraper",
    "collections": {
      "raw": "raw_data",
      "processed": "businesses",
      "jobs": "scraping_jobs"
    }
  },
  "search": {
    "terms": ["your business type in"],
    "maxPerSearch": 100
  },
  "validation": {
    "includeKeywords": ["relevant", "keywords"],
    "excludeKeywords": ["exclude", "these"],
    "minRating": 4.0,
    "minReviews": 5
  },
  "categories": {
    "Type1": ["keyword1", "keyword2"],
    "Type2": ["keyword3", "keyword4"]
  }
}
```

## Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
NICHE=museums                    # Default niche to use
MAX_MUSEUMS_PER_SEARCH=100      # Businesses per search
PROXY_STRING=user:pass:host:port # Optional proxy
MONGODB_URI=mongodb://localhost:27017
```

## Available Commands

```bash
# Scrape businesses for a niche
node scripts/scrape-niche.js <niche-name>

# Process raw data into clean records
node scripts/process-niche.js <niche-name>

# Export to Excel spreadsheet
node scripts/export-niche.js <niche-name>

# Validate data quality and progress
node scripts/validate-niche.js <niche-name>
```

## Example Usage

```bash
# Scrape tattoo shops
node scripts/scrape-niche.js tattoo

# Process the raw tattoo data
node scripts/process-niche.js tattoo

# Export tattoo shops to Excel
node scripts/export-niche.js tattoo

# Check tattoo scraping progress
node scripts/validate-niche.js tattoo
```

## Legal Compliance

- Respects rate limits (12-25 second delays)
- Reasonable request patterns
- No server overloading
- Stealth measures to avoid detection

## Data Quality

Automated validation per niche:
- Business type validation using keywords
- Rating and review thresholds
- Contact information requirements
- Coordinate validation
- Unicode character cleaning
- Address-based duplicate detection

## Monitoring

Real-time progress tracking:
- Jobs completed/remaining per country
- Businesses found and processed
- Validation pass/fail rates
- Duplicate detection statistics