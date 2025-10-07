const axios = require('axios');
const { AI_PROVIDERS, ENRICHMENT_FIELDS } = require('../config/enrichment-config');

class AIEnrichmentService {
  constructor(provider, apiKey) {
    this.provider = AI_PROVIDERS[provider];
    this.apiKey = apiKey;
    
    if (!this.provider) {
      throw new Error(`Invalid AI provider: ${provider}`);
    }
  }

  async enrichBusiness(businessData, fields) {
    try {
      const prompt = this.buildEnrichmentPrompt(businessData, fields);
      const response = await this.callAI(prompt);
      return this.parseEnrichmentResponse(response, fields);
    } catch (error) {
      console.error('AI enrichment error:', error);
      return this.getEmptyEnrichment(fields);
    }
  }

  buildEnrichmentPrompt(business, fields) {
    const fieldDescriptions = fields.map(fieldKey => {
      const field = ENRICHMENT_FIELDS[fieldKey];
      return `- ${field.name}: ${field.description}`;
    }).join('\n');

    return `You are a business data enrichment AI. Based on the following business information, provide additional details for the requested fields.

Business Information:
- Name: ${business.name || 'N/A'}
- Address: ${business.address || 'N/A'}
- Phone: ${business.phone || 'N/A'}
- Website: ${business.website || 'N/A'}
- Rating: ${business.rating || 'N/A'}
- Reviews: ${business.reviews || 'N/A'}
- Category: ${business.category || 'N/A'}
- Description: ${business.description || 'N/A'}

Please provide the following information in JSON format:
${fieldDescriptions}

Rules:
1. Return only valid JSON
2. Use "N/A" for unavailable information
3. Keep descriptions concise (max 200 characters)
4. Base answers on the provided business information
5. Don't make up specific details like exact prices or menu items

JSON Response:`;
  }

  async callAI(prompt) {
    const headers = {
      'Content-Type': 'application/json'
    };

    let requestBody;

    switch (this.provider.model) {
      case 'deepseek-chat':
        headers['Authorization'] = `Bearer ${this.apiKey}`;
        requestBody = {
          model: this.provider.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 1000
        };
        break;

      case 'gpt-4':
      case 'gpt-5':
        headers['Authorization'] = `Bearer ${this.apiKey}`;
        requestBody = {
          model: this.provider.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 1000
        };
        break;

      case 'claude-3-sonnet-20240229':
        headers['x-api-key'] = this.apiKey;
        headers['anthropic-version'] = '2023-06-01';
        requestBody = {
          model: this.provider.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 1000
        };
        break;

      default:
        throw new Error(`Unsupported AI model: ${this.provider.model}`);
    }

    const response = await axios.post(this.provider.apiEndpoint, requestBody, { headers });
    
    // Extract content based on provider
    if (this.provider.model.includes('claude')) {
      return response.data.content[0].text;
    } else {
      return response.data.choices[0].message.content;
    }
  }

  parseEnrichmentResponse(response, fields) {
    try {
      // Clean response to extract JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const enrichment = {};

      // Map parsed data to requested fields
      fields.forEach(fieldKey => {
        const field = ENRICHMENT_FIELDS[fieldKey];
        enrichment[fieldKey] = parsed[field.name] || parsed[fieldKey] || 'N/A';
      });

      return enrichment;
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      return this.getEmptyEnrichment(fields);
    }
  }

  getEmptyEnrichment(fields) {
    const enrichment = {};
    fields.forEach(fieldKey => {
      enrichment[fieldKey] = 'N/A';
    });
    return enrichment;
  }
}

module.exports = AIEnrichmentService;