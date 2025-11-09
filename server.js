const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./api/routes/auth');
const projectRoutes = require('./api/routes/projects');
const userRoutes = require('./api/routes/users');
const downloadRoutes = require('./api/routes/downloads');
const countryRoutes = require('./api/routes/countries');
const paymentRoutes = require('./api/routes/payments');
const enrichmentRoutes = require('./api/routes/enrichment');
const aiEnrichmentRoutes = require('./api/routes/ai-enrichment');
const validationRoutes = require('./api/routes/validation');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for rate limiting
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/users', userRoutes);
app.use('/api/countries', countryRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/enrichment', enrichmentRoutes);
app.use('/api/ai-enrichment', aiEnrichmentRoutes);
app.use('/api/downloads', downloadRoutes);
app.use('/api', validationRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

module.exports = app;