# Business Scraper SaaS

A complete SaaS platform for scraping business data from Google Maps with user authentication, job queues, and automated email delivery.

## 🚀 Quick Start

### Prerequisites
- Node.js 16+
- MongoDB
- Redis

### Installation

1. **Install dependencies**
```bash
npm install
```

2. **Set up environment**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Start services**
```bash
# Start Redis
redis-server

# Start MongoDB
mongod

# Start API server
npm run dev

# Start worker (in another terminal)
npm run worker
```

## 📋 API Endpoints

### Authentication
```bash
POST /api/auth/register - Create account
POST /api/auth/login - Login
```

### Projects
```bash
POST /api/projects - Create scraping job
GET /api/projects - List user's projects
GET /api/projects/:id - Get specific project
```

### Users
```bash
GET /api/users/profile - Get user profile
GET /api/users/usage - Check usage limits
```

### Countries
```bash
GET /api/countries - Get all countries with subdivisions
GET /api/countries/popular - Get popular countries
```

### Downloads
```bash
GET /downloads/:filename - Download export file (authenticated)
```

## 🔧 Configuration

### Environment Variables
```bash
# Database
MONGODB_URI=mongodb://localhost:27017

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your-secret-key

# Email
EMAIL_SERVICE=sendgrid
SENDGRID_API_KEY=your-key
FROM_EMAIL=noreply@yourapp.com

# Server
PORT=3000
BASE_URL=http://localhost:3000
```

## 📊 Usage Example

### 1. Register User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "name": "John Doe"
  }'
```

### 2. Create Scraping Project
```bash
curl -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "keyword": "tattoo shops",
    "countries": ["United States", "Canada"],
    "fields": ["name", "phone", "website", "address", "rating"],
    "filters": {
      "minRating": 4.0,
      "minReviews": 5
    }
  }'
```

### 3. Monitor Progress
```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3000/api/projects/PROJECT_ID
```

## 🏗️ Architecture

### Components
- **API Server** (`server.js`) - Express REST API
- **Worker Process** (`workers/scraper-worker.js`) - Background job processing
- **Job Queue** (`services/JobQueue.js`) - Redis-based queue management
- **Email Service** (`services/EmailService.js`) - Automated notifications
- **File Exporter** (`services/FileExporter.js`) - Excel generation

### Database Schema
- **Users** - Authentication, usage tracking, plans
- **Projects** - Scraping jobs, progress, results
- **Per-Project DBs** - Raw and processed business data

### Job Flow
1. User creates project via API
2. Job added to Redis queue
3. Worker picks up job
4. Scraper processes locations
5. Data cleaned and exported
6. Email sent with download link

## 📈 Scaling

### Single Server
- API + Worker on same machine
- Local Redis + MongoDB
- File storage on disk

### Multi-Server
- Separate API and worker servers
- Shared Redis/MongoDB
- Cloud file storage (S3)

### Production
- Load balancer for API
- Multiple worker instances
- Managed databases
- CDN for file delivery

## 🔒 Security

- JWT authentication
- Rate limiting (100 req/15min)
- User-specific file access
- Input validation
- SQL injection prevention

## 💰 Monetization

### Plans
- **Free**: 100 businesses/month
- **Starter**: 1,000 businesses/month - $29
- **Pro**: 10,000 businesses/month - $99
- **Enterprise**: Unlimited - $299

### Usage Tracking
- Monthly limits enforced
- Automatic reset on 1st of month
- Real-time usage monitoring

## 📧 Email Templates

### Welcome Email
- Sent on registration
- Plan details and limits
- Getting started guide

### Completion Email
- Sent when scraping finishes
- Results summary
- Download link (7-day expiry)

## 🛠️ Development

### Running Tests
```bash
npm test
```

### Adding New Features
1. Add API endpoints in `api/routes/`
2. Update models in `api/models/`
3. Modify worker logic in `workers/`
4. Update email templates in `services/`

### Monitoring
- Job queue dashboard: Redis Commander
- Database: MongoDB Compass
- Logs: Console output (use PM2 in production)

## 🚀 Deployment

### VPS Deployment
```bash
# Install PM2
npm install -g pm2

# Start services
pm2 start server.js --name "api"
pm2 start workers/scraper-worker.js --name "worker"

# Setup nginx reverse proxy
# Configure SSL with Let's Encrypt
```

### Docker Deployment
```bash
# Build and run
docker-compose up -d
```

## 📞 Support

- Check logs for errors
- Monitor Redis queue status
- Verify MongoDB connections
- Test email delivery

Ready to launch your business scraping SaaS! 🎉