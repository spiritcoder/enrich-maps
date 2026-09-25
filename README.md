# TerminalScraper

> **A scalable, production-ready Google Maps scraping, Excel reverse lookup, and multi-model AI data enrichment platform.**

[![Node.js](https://img.shields.io/badge/Node.js-18.x+-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18.x-blue.svg)](https://react.dev/)
[![Puppeteer](https://img.shields.io/badge/Puppeteer-Stealth-orange.svg)](https://github.com/berstend/puppeteer-extra)
[![MongoDB](https://img.shields.io/badge/MongoDB-6.x-brightgreen.svg)](https://www.mongodb.com/)
[![Redis](https://img.shields.io/badge/Redis-Queue%20(Bull)-red.svg)](https://redis.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Overview

**TerminalScraper** is a high-performance business intelligence and lead-generation system. It bridges the gap between raw web scraping and AI intelligence:

1. **Anti-Detect Google Maps Scraping**: Extracts verified business data (names, phones, websites, addresses, categories, coordinates, ratings, review counts, hours, and photos) at scale without getting blocked.
2. **Bulk Excel Lookup**: Upload any spreadsheet of place or business names to reverse-lookup and extract matching Google Maps profiles.
3. **Multi-Model AI Enrichment**: Enriches raw listings using **DeepSeek**, **OpenAI (GPT-4/GPT-5)**, or **Anthropic (Claude)** across 16 categorized intelligence fields (real estate profiles, location context, demographics, amenities).
4. **Dual Operation Modes**:
   - **CLI Pipeline**: Run automated, config-driven niche scraping jobs directly from your terminal.
   - **Full-Stack SaaS Platform**: Web dashboard built with React 18, Express REST API, JWT authentication, user credits/billing, and asynchronous Bull/Redis job queues.

---

## Architecture

```mermaid
flowchart TD
    subgraph UI ["User Interfaces"]
        CLI["CLI Commands\n(npm run scrape / process)"]
        WEB["React 18 SPA\n(Dashboard, Wizards, Billing)"]
    end

    subgraph Core ["API & Queue Layer"]
        API["Express REST API\n(Port 3000)"]
        REDIS[("Redis Server\nJob Queue (Bull)")]
    end

    subgraph Execution ["Worker & Engine"]
        WORKER["Scraper Worker\n(workers/scraper-worker.js)"]
        PUPPETEER["Puppeteer Extra (Stealth)\n+ Proxy Manager & Rotating UA"]
        PARSER["Cheerio & Maps Parser\n+ Business Data Cleaner"]
        AI_SVC["AI Enrichment Service\n(DeepSeek / OpenAI / Claude)"]
    end

    subgraph Storage ["Databases & Output"]
        MONGO[("MongoDB\nGlobal + saas_projectId isolation")]
        EXPORTS["File Exporter\n(.xlsx / .csv downloads)"]
    end

    WEB -->|REST API & Auth| API
    CLI -->|Direct execution| PUPPETEER
    API -->|Enqueue Jobs| REDIS
    REDIS -->|Process Jobs| WORKER
    WORKER --> PUPPETEER
    WORKER --> AI_SVC
    PUPPETEER --> PARSER
    PARSER --> MONGO
    AI_SVC --> MONGO
    MONGO --> EXPORTS
    EXPORTS -->|File download| WEB
```

---

## Key Features

### 1. Advanced Google Maps Scraping
- **Stealth Automation**: Built with `puppeteer-extra-plugin-stealth`, randomized viewports, humanized interaction delays, and proxy rotation.
- **Geographic Granularity**: Automatically expands target countries into states/subdivisions (e.g., Nigerian states, US states, global subdivisions) to maximize harvest yield.
- **Smart Data Sanitization**: `BusinessCleaner` strips unicode artefacts, normalizes addresses, standardizes phone numbers, categorizes business types, and validates lat/lng coordinates.

### 2. Bulk Excel Lookup & Smart Reverse Geocoding
- Upload `.xlsx` or `.xls` spreadsheets containing lists of locations or businesses.
- Automatic column detection for variations such as `Name`, `Business Name`, `Company`, `Location`, `Address`.
- Interactive file validation preview before queueing execution.
- Real-time progress updates with checkpoint saving and targeted retry for failed rows.

### 3. AI-Powered Data Enrichment
Enrich locations or business entities with DeepSeek, GPT-4, or Claude into 4 distinct categories:
- **Location Intelligence**: Detailed description, classification, key features/amenities, historical background, accessibility.
- **Real Estate & Development**: Property types available, price range analysis, developer info, development status.
- **Area Context**: Neighborhood profile, nearby landmarks, infrastructure quality, growth potential.
- **Demographics & Lifestyle**: Target resident persona, lifestyle benefits, community features.

### 4. Fault-Tolerant Asynchronous Job Queue
- Powered by **Bull** and **Redis**.
- **Progressive DB Persistence**: Businesses and enrichments are written row-by-row into project-isolated MongoDB databases (`saas_<projectId>`).
- **Resumable Operations**: Interrupted jobs can resume from stored checkpoints (`last_processed_row`).
- **Targeted Retries**: Retry only the unmapped or failed entries without re-running successfully scraped items.

### 5. Complete SaaS Platform & Management
- User signup and login with secure bcrypt password hashing and JWT authentication.
- Credit-based usage metering and subscription tiers (Starter, Pro, Enterprise).
- Interactive dashboard to monitor live job progress, results count, and project logs.
- Export datasets to structured Excel (`.xlsx`) or CSV files at any time.

---

## Repository Structure

```text
├── api/                        # Express API backend
│   ├── middleware/             # JWT auth & credit rate limiters
│   ├── models/                 # MongoDB models (User, Project, CreditTransaction)
│   └── routes/                 # API route handlers (auth, projects, enrichment, downloads)
├── config/                     # Configuration modules
│   ├── database-generic.js     # MongoDB connection manager
│   ├── enrichment-config.js    # AI provider rates & field schemas
│   ├── location-enrichment-config.js # 16 location intelligence field prompts
│   ├── niche-loader.js         # JSON niche specification loader
│   └── scraper.js              # Scraping defaults & timing configs
├── frontend/                   # React 18 frontend application
│   ├── public/                 # Static web assets
│   └── src/                    # Components, pages, and API client
├── niches/                     # Config-driven niche templates (museums, restaurants, tattoo, etc.)
├── scrapers/                   # Core scraping & parsing engines
│   ├── BusinessCleaner.js      # Data normalization & unicode cleaner
│   ├── GenericGoogleMapsParser.js # Puppeteer stealth scraper
│   ├── GoogleSearchParser.js   # Fallback Google search extractor
│   ├── HybridBusinessLookup.js # Combined Maps + Search lookup
│   └── MapsOnlyLookup.js       # Fast Google Maps direct search parser
├── scripts/                    # CLI scripts & batch processing utilities
│   ├── export-niche.js         # Export MongoDB collection to Excel
│   ├── generic-master-scraper.js # Master CLI scraper runner
│   ├── process-niche.js        # Data cleaner & deduplicator
│   ├── saas-scraper.js         # Core scraping engine used by workers
│   ├── scrape-niche.js         # CLI entry point to scrape by niche
│   └── validate-niche.js       # CLI validation against niche rules
├── services/                   # Business logic services
│   ├── AIEnrichmentService.js  # DeepSeek / LLM prompt execution
│   ├── DataEnricherService.js  # Excel parsing + AI enrichment
│   ├── ExcelLookupService.js   # Excel row iterator with Puppeteer lookup
│   ├── FileExporter.js         # XLSX / CSV export builder
│   ├── JobQueue.js             # Bull Redis queue definition
│   ├── ProxyManager.js         # Proxy parsing and rotation
│   └── PureAIEnrichmentService.js # Checkpointed AI processor
├── utils/                      # Helper libraries (countries loader, rate limiters)
├── workers/                    # Distributed Bull queue workers
│   └── scraper-worker.js       # Main worker processing all background jobs
├── server.js                   # Express server entry point
├── package.json                # Project dependencies & scripts
└── .env.example                # Template for environment configuration
```

---

## Prerequisites

Before running the application, make sure you have installed:
- **Node.js**: v18.0.0 or higher
- **MongoDB**: v5.0 or higher (running locally or MongoDB Atlas)
- **Redis**: v6.0 or higher (running locally or cloud Redis)
- **Chrome / Chromium Dependencies**: Puppeteer will download Chromium automatically, but ensure standard OS font/graphics libraries are installed if deploying to Linux (e.g. `libnss3`, `libatk1.0-0`, etc.).

---

## Installation & Setup

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/terminalscraper.git
cd terminalscraper
```

### 2. Install Dependencies
Install root backend dependencies:
```bash
npm install
```

Install frontend dependencies:
```bash
cd frontend
npm install
cd ..
```

### 3. Environment Configuration
Copy `.env.example` to `.env` in the root directory:
```bash
cp .env.example .env
```

Edit `.env` and provide your configuration:
```env
# Database
MONGODB_URI=mongodb://localhost:27017

# Redis (for Bull job queue)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT Authentication
JWT_SECRET=replace-with-a-secure-random-secret

# Server
PORT=3000
NODE_ENV=development

# AI Enrichment API Keys
DEEPSEEK_API_KEY=your-deepseek-api-key
GPT4_API_KEY=your-openai-api-key
CLAUDE_API_KEY=your-anthropic-api-key

# Proxy Configuration (Optional - for high-volume scraping)
PROXY_STRING=http://username:password@proxy-host:port

# File Uploads
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=50MB
```

---

## Running the Application

### Option A: Running the Full SaaS Platform

To run the complete platform, start the three core processes in separate terminal windows:

#### 1. Start the API Server
```bash
npm run dev
# Server running at http://localhost:3000
# Health check: http://localhost:3000/health
```

#### 2. Start the Background Queue Worker
```bash
npm run worker
# Ready to process scraping, Excel lookups, and AI enrichment jobs
```

#### 3. Start the React Frontend
```bash
cd frontend
npm start
# Client running at http://localhost:3000 (proxied) or http://localhost:3001
```

---

### Option B: Running the Standalone CLI Pipeline

TerminalScraper can also be used as a standalone, headless CLI tool without running the web UI or user auth.

#### 1. Run a Niche Scraper
```bash
# Scrape businesses matching a preconfigured niche (e.g., museums, restaurants, tattoo)
npm run scrape museums
```

#### 2. Clean and Process Scraped Data
```bash
# Cleans addresses, validates phones/websites, classifies types, and dedupes records
npm run process museums
```

#### 3. Validate Results Against Niche Rules
```bash
# Validates ratings, review thresholds, and required contact information
npm run validate museums
```

#### 4. Export to Excel
```bash
node scripts/export-niche.js museums
# Generates: museums_export_YYYY-MM-DD.xlsx
```

---

## Creating Custom Niches (CLI Mode)

To define a new scraping niche, add a `.json` file under `niches/<your-niche>.json`:

```json
{
  "name": "cafes",
  "database": {
    "name": "cafe_scraper",
    "collections": {
      "raw": "raw_cafe_data",
      "processed": "cafes",
      "jobs": "scraping_jobs",
      "status": "processing_status"
    }
  },
  "search": {
    "terms": ["coffee shop in", "cafe in", "espresso bar in"],
    "maxPerSearch": 100
  },
  "validation": {
    "includeKeywords": ["coffee", "cafe", "espresso", "roastery"],
    "excludeKeywords": ["gas station", "car wash", "supermarket"],
    "overrideKeyword": "coffee",
    "requireContact": true,
    "minRating": 4.0,
    "minReviews": 5
  },
  "categories": {
    "Specialty Coffee": ["roaster", "specialty", "artisan"],
    "Bakery Cafe": ["bakery", "pastry", "croissant"]
  }
}
```

Now you can immediately run:
```bash
npm run scrape cafes
```

---

## API Endpoints Reference

| Method | Endpoint | Description | Auth Required |
|:-------|:---------|:------------|:-------------:|
| `GET` | `/health` | Server health check | No |
| `POST` | `/api/auth/register` | Register a new user | No |
| `POST` | `/api/auth/login` | Login and obtain JWT token | No |
| `GET` | `/api/auth/me` | Fetch authenticated user profile & credit balance | Yes |
| `GET` | `/api/projects` | List all projects for authenticated user | Yes |
| `POST` | `/api/projects` | Create a new Google Maps scraping project | Yes |
| `POST` | `/api/projects/excel-lookup` | Upload Excel file for Google Maps reverse lookup | Yes |
| `POST` | `/api/projects/data-enricher` | Upload Excel file for AI-only data enrichment | Yes |
| `POST` | `/api/validate-excel` | Validate uploaded Excel file & get sample preview | Yes |
| `POST` | `/api/projects/:id/retry` | Retry failed rows from an Excel lookup project | Yes |
| `GET` | `/api/downloads/:id/excel` | Export project data as `.xlsx` file | Yes |
| `GET` | `/api/downloads/:id/csv` | Export project data as `.csv` file | Yes |

---

## Testing & Verification

TerminalScraper provides built-in validation and recovery tools:

```bash
# Validate scraped data against niche rules and rating/contact thresholds
npm run validate <niche-name>

# Validate database integrity and inspect/recover stuck jobs
node scripts/recovery-manager.js

# Verify API server health
curl http://localhost:3000/health
```

---

## Anti-Scraping Best Practices

- **Proxies**: When running high-volume scraping jobs, always configure `PROXY_STRING` in `.env` to route requests through residential or datacenter proxy pools.
- **Rate Limiting**: Adjust delay parameters in `config/scraper.js` if Google Maps displays CAPTCHA checkpoints.
- **Headless Flag**: By default, Puppeteer runs in `headless: "new"` mode with `--disable-blink-features=AutomationControlled`.

---

## Contributing

Contributions, issues, and feature requests are welcome!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

