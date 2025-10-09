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
      return `- ${fieldKey}: ${field.description}`;
    }).join('\n');

    // Include business attributes if available
    let businessAttributesText = '';
    if (business.business_attributes && typeof business.business_attributes === 'object') {
      businessAttributesText = '\n- Business Attributes: ' + JSON.stringify(business.business_attributes);
    }

    // Include reviews if available as array
    let reviewsText = '';
    if (business.reviews && Array.isArray(business.reviews)) {
      reviewsText = '\n- Customer Reviews: ' + business.reviews.slice(0, 3).join(' | ');
    } else if (business.reviews_text) {
      reviewsText = '\n- Customer Reviews: ' + business.reviews_text;
    }

    return `You are a business directory content specialist. Create professional, user-friendly content for business directory listings based on the provided information.

Business Information:
- Name: ${business.name || 'N/A'}
- Address: ${business.address || 'N/A'}
- Phone: ${business.phone || 'N/A'}
- Website: ${business.website || 'N/A'}
- Rating: ${business.rating || 'N/A'} (${business.review_count || 0} reviews)
- Categories: ${business.categories || business.category || 'N/A'}
- Hours: ${business.hours || 'N/A'}${businessAttributesText}${reviewsText}

Create directory-friendly content for these fields in JSON format:
${fieldDescriptions}

Directory Content Guidelines:
1. Write for potential customers browsing a business directory
2. Focus on practical, useful information for visitors
3. Keep descriptions professional and concise (50-150 words)
4. Use "Not specified" for unavailable information
5. Base content on provided data - don't invent specific details
6. For price_range, use: Budget, Mid-range, or Premium
7. Make content helpful for someone deciding whether to visit

Return only valid JSON with the field keys exactly as specified above:`;
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

      case 'claude-3-haiku-20240307':
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