import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { projects, countries, enrichment } from '../services/api';

const CreateProject = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    projectName: '',
    searchTerm: '',
    businessLimit: '100',
    businessesPerLocation: '',
    locations: [],
    fields: ['name', 'phone', 'website', 'address', 'rating'],
    enrichment: {
      enabled: false,
      aiProvider: 'deepseek',
      fields: ['business_description', 'specialties_services', 'price_range', 'target_audience', 'customer_reviews_summary', 'accessibility_features', 'best_times_to_visit', 'parking_availability', 'payment_methods']
    }
  });
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedSubdivisions, setSelectedSubdivisions] = useState([]);
  const [showSubdivisions, setShowSubdivisions] = useState(false);
  const [availableCountries, setAvailableCountries] = useState([]);
  const [aiProviders, setAiProviders] = useState({});
  const [enrichmentFields, setEnrichmentFields] = useState({});
  const [fieldCategories, setFieldCategories] = useState({});
  const [costBreakdown, setCostBreakdown] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadCountries();
    loadEnrichmentData();
  }, []);

  useEffect(() => {
    calculateCost();
  }, [formData.businessLimit, formData.enrichment]);

  const loadCountries = async () => {
    try {
      const response = await countries.getAll();
      setAvailableCountries(response.data.countries);
    } catch (error) {
      console.error('Error loading countries:', error);
    }
  };

  const loadEnrichmentData = async () => {
    try {
      const [providersRes, fieldsRes] = await Promise.all([
        enrichment.getProviders(),
        enrichment.getFields()
      ]);
      setAiProviders(providersRes.data.providers);
      setEnrichmentFields(fieldsRes.data.fields);
      setFieldCategories(fieldsRes.data.categories);
    } catch (error) {
      console.error('Error loading enrichment data:', error);
    }
  };

  const calculateCost = async () => {
    const businessCount = parseInt(formData.businessLimit);
    if (!businessCount || businessCount < 1) return;
    
    try {
      const response = await enrichment.calculateCost({
        businessCount,
        aiProvider: formData.enrichment.enabled ? formData.enrichment.aiProvider : null,
        fields: formData.enrichment.fields
      });
      setCostBreakdown(response.data.breakdown);
    } catch (error) {
      console.error('Error calculating cost:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Validate business limit
    const businessLimit = parseInt(formData.businessLimit);
    if (!businessLimit || businessLimit < 1 || businessLimit > 10000) {
      setError('Business limit must be a number between 1 and 10,000');
      setLoading(false);
      return;
    }

    // Validate per location limit if provided
    const businessesPerLocation = formData.businessesPerLocation ? parseInt(formData.businessesPerLocation) : null;
    if (businessesPerLocation && (businessesPerLocation < 1 || businessesPerLocation > 1000)) {
      setError('Per location limit must be between 1 and 1,000');
      setLoading(false);
      return;
    }

    try {
      const submitData = {
        ...formData,
        businessLimit, // Convert to number for submission
        businessesPerLocation: businessesPerLocation || null
      };
      const response = await projects.create(submitData);
      navigate(`/project/${response.data.project._id}`);
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const addLocations = () => {
    if (!selectedCountry) return;
    
    const newLocations = [];
    
    if (selectedSubdivisions.length === 0) {
      // Add entire country
      const locationKey = selectedCountry;
      const locationLabel = `All of ${selectedCountry}`;
      
      if (!formData.locations.find(loc => loc.key === locationKey)) {
        newLocations.push({
          key: locationKey,
          country: selectedCountry,
          subdivision: null,
          label: locationLabel
        });
      }
    } else {
      // Add selected subdivisions
      selectedSubdivisions.forEach(subdivision => {
        const locationKey = `${selectedCountry}:${subdivision}`;
        const locationLabel = `${subdivision}, ${selectedCountry}`;
        
        if (!formData.locations.find(loc => loc.key === locationKey)) {
          newLocations.push({
            key: locationKey,
            country: selectedCountry,
            subdivision: subdivision,
            label: locationLabel
          });
        }
      });
    }
    
    if (newLocations.length > 0) {
      setFormData(prev => ({
        ...prev,
        locations: [...prev.locations, ...newLocations]
      }));
    }
    
    // Reset selections
    setSelectedCountry('');
    setSelectedSubdivisions([]);
    setShowSubdivisions(false);
  };
  
  const handleSubdivisionChange = (subdivision) => {
    setSelectedSubdivisions(prev => 
      prev.includes(subdivision)
        ? prev.filter(s => s !== subdivision)
        : [...prev, subdivision]
    );
  };
  
  const removeLocation = (locationKey) => {
    setFormData(prev => ({
      ...prev,
      locations: prev.locations.filter(loc => loc.key !== locationKey)
    }));
  };
  
  const getAvailableSubdivisions = () => {
    if (!selectedCountry) return [];
    const country = availableCountries.find(c => c.name === selectedCountry);
    return country ? country.subdivisions : [];
  };

  const handleFieldChange = (field) => {
    setFormData(prev => ({
      ...prev,
      fields: prev.fields.includes(field)
        ? prev.fields.filter(f => f !== field)
        : [...prev.fields, field]
    }));
  };

  const containerStyle = {
    padding: '2rem',
    maxWidth: '800px',
    margin: '0 auto'
  };

  const cardStyle = {
    background: 'white',
    padding: '2rem',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    marginBottom: '2rem'
  };

  const inputStyle = {
    width: '100%',
    padding: '0.75rem',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '1rem'
  };

  const checkboxGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '0.5rem',
    marginTop: '0.5rem'
  };

  const checkboxStyle = {
    display: 'flex',
    alignItems: 'center',
    padding: '0.5rem',
    border: '1px solid #e5e7eb',
    borderRadius: '4px',
    cursor: 'pointer'
  };

  const buttonStyle = {
    background: '#2563eb',
    color: 'white',
    border: 'none',
    padding: '0.75rem 2rem',
    borderRadius: '6px',
    fontSize: '1rem',
    cursor: 'pointer',
    opacity: loading ? 0.7 : 1
  };

  const availableFields = [
    { key: 'name', label: 'Business Name' },
    { key: 'phone', label: 'Phone Number' },
    { key: 'website', label: 'Website' },
    { key: 'address', label: 'Address' },
    { key: 'rating', label: 'Rating' },
    { key: 'reviews', label: 'Review Count' },
    { key: 'hours', label: 'Business Hours' },
    { key: 'category', label: 'Category' },
    { key: 'coordinates', label: 'Coordinates' },
    { key: 'images', label: 'Images' }
  ];

  return (
    <div style={containerStyle}>
      <h1 style={{ marginBottom: '2rem' }}>🚀 Create New Project</h1>

      {error && (
        <div style={{ 
          background: '#fee', 
          color: '#c33', 
          padding: '1rem', 
          borderRadius: '4px', 
          marginBottom: '2rem' 
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Project Name Section */}
        <div style={cardStyle}>
          <h3 style={{ marginBottom: '1rem' }}>🏷️ Project Name</h3>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Project Name (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g., NYC Pizza Research, Q1 Market Analysis"
              value={formData.projectName}
              onChange={(e) => setFormData(prev => ({ ...prev, projectName: e.target.value }))}
              style={inputStyle}
            />
            <p style={{ fontSize: '0.9rem', color: '#6b7280', marginTop: '0.5rem' }}>
              Give your project a memorable name. If left empty, we'll generate one based on your search.
            </p>
          </div>
        </div>

        {/* Niche & Business Limit Section */}
        <div style={cardStyle}>
          <h3 style={{ marginBottom: '1rem' }}>🔍 What to Scrape</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                What business are you looking for?
              </label>
              <input
                type="text"
                placeholder="e.g.pizza restaurant, dentist"
                value={formData.searchTerm}
                onChange={(e) => setFormData(prev => ({ ...prev, searchTerm: e.target.value }))}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Total Business Limit
              </label>
              <input
                type="text"
                placeholder="Enter number (1-10,000)"
                value={formData.businessLimit}
                onChange={(e) => {
                  const value = e.target.value;
                  // Allow empty or numbers only
                  if (value === '' || /^\d+$/.test(value)) {
                    setFormData(prev => ({ ...prev, businessLimit: value }));
                  }
                }}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Per Location Limit
              </label>
              <input
                type="text"
                placeholder="Optional (1-1000)"
                value={formData.businessesPerLocation || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  // Allow empty or numbers only
                  if (value === '' || /^\d+$/.test(value)) {
                    setFormData(prev => ({ ...prev, businessesPerLocation: value }));
                  }
                }}
                style={inputStyle}
              />
            </div>
          </div>
          <p style={{ fontSize: '0.9rem', color: '#6b7280', marginTop: '0.5rem' }}>
            <strong>Total:</strong> Maximum businesses across all locations (1-10,000)<br/>
            <strong>Per Location:</strong> Optional limit per location for better distribution
          </p>
        </div>

        {/* Locations Section */}
        <div style={cardStyle}>
          <h3 style={{ marginBottom: '1rem' }}>🌍 Add Locations</h3>
          
          {/* Location Selector */}
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'end', marginBottom: '1.5rem' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Country</label>
              <select
                value={selectedCountry}
                onChange={(e) => {
                  setSelectedCountry(e.target.value);
                  setSelectedSubdivisions([]);
                  setShowSubdivisions(false);
                }}
                style={{
                  ...inputStyle,
                  cursor: 'pointer'
                }}
              >
                <option value="">Select Country</option>
                {availableCountries.map(country => (
                  <option key={country.name} value={country.name}>
                    {country.name}
                  </option>
                ))}
              </select>
            </div>
            
            <div style={{ flex: 2 }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>State/Province</label>
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => selectedCountry && setShowSubdivisions(!showSubdivisions)}
                  disabled={!selectedCountry}
                  style={{
                    ...inputStyle,
                    cursor: selectedCountry ? 'pointer' : 'not-allowed',
                    opacity: selectedCountry ? 1 : 0.6,
                    background: 'white',
                    textAlign: 'left',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <span>
                    {selectedSubdivisions.length === 0 
                      ? `All of ${selectedCountry || 'Country'}` 
                      : `${selectedSubdivisions.length} selected`
                    }
                  </span>
                  <span>{showSubdivisions ? '▲' : '▼'}</span>
                </button>
                
                {showSubdivisions && selectedCountry && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: 'white',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    zIndex: 10,
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                  }}>
                    <div style={{ padding: '0.5rem' }}>
                      <label style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        padding: '0.5rem',
                        cursor: 'pointer',
                        borderRadius: '3px',
                        background: selectedSubdivisions.length === 0 ? '#eff6ff' : 'transparent'
                      }}>
                        <input
                          type="radio"
                          checked={selectedSubdivisions.length === 0}
                          onChange={() => setSelectedSubdivisions([])}
                          style={{ marginRight: '0.5rem' }}
                        />
                        <strong>All of {selectedCountry}</strong>
                      </label>
                      <hr style={{ margin: '0.5rem 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />
                      {getAvailableSubdivisions().map(subdivision => (
                        <label 
                          key={subdivision}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0.5rem',
                            cursor: 'pointer',
                            borderRadius: '3px',
                            background: selectedSubdivisions.includes(subdivision) ? '#eff6ff' : 'transparent'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedSubdivisions.includes(subdivision)}
                            onChange={() => handleSubdivisionChange(subdivision)}
                            style={{ marginRight: '0.5rem' }}
                          />
                          {subdivision}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <button
              type="button"
              onClick={addLocations}
              disabled={!selectedCountry}
              style={{
                background: selectedCountry ? '#2563eb' : '#9ca3af',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '6px',
                cursor: selectedCountry ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap'
              }}
            >
              Add Locations
            </button>
          </div>
          
          {/* Selected Locations */}
          <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '6px' }}>
            <h4 style={{ margin: '0 0 0.75rem 0' }}>📍 Selected Locations ({formData.locations.length}):</h4>
            {formData.locations.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: '0.9rem', margin: 0 }}>No locations selected</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {formData.locations.map((location) => (
                  <span 
                    key={location.key}
                    style={{
                      background: '#2563eb',
                      color: 'white',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '20px',
                      fontSize: '0.9rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    {location.label}
                    <button
                      type="button"
                      onClick={() => removeLocation(location.key)}
                      style={{
                        background: 'rgba(255,255,255,0.3)',
                        border: 'none',
                        color: 'white',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        cursor: 'pointer',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Default Fields Section */}
        <div style={cardStyle}>
          <h3 style={{ marginBottom: '1rem' }}>📊 Default Data Fields</h3>
          <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '1rem' }}>
            Standard business fields you can include in your export:
          </p>
          <div style={checkboxGridStyle}>
            {[
              { key: 'name', label: 'Business Name', description: 'Name of the business' },
              { key: 'phone', label: 'Phone Number', description: 'Contact phone number' },
              { key: 'website', label: 'Website', description: 'Business website URL' },
              { key: 'address', label: 'Address', description: 'Physical address' },
              { key: 'rating', label: 'Rating', description: 'Google Maps rating' },
              { key: 'review_count', label: 'Review Count', description: 'Number of reviews' },
              { key: 'hours', label: 'Business Hours', description: 'Operating hours by day' },
              { key: 'categories', label: 'Categories', description: 'Business categories' },
              { key: 'coordinates', label: 'Coordinates', description: 'Latitude and longitude' },
              { key: 'images', label: 'Images', description: 'Business photos' },
              { key: 'reviews', label: 'Customer Reviews', description: 'Individual customer reviews' },
              { key: 'business_attributes', label: 'Business Attributes', description: 'Structured business features from About tab' }
            ].map(field => (
              <label 
                key={field.key}
                style={{
                  ...checkboxStyle,
                  background: formData.fields?.includes(field.key) ? '#eff6ff' : 'white',
                  borderColor: formData.fields?.includes(field.key) ? '#2563eb' : '#e5e7eb'
                }}
              >
                <input
                  type="checkbox"
                  checked={formData.fields?.includes(field.key) || false}
                  onChange={(e) => {
                    const fields = e.target.checked 
                      ? [...(formData.fields || []), field.key]
                      : (formData.fields || []).filter(f => f !== field.key);
                    setFormData(prev => ({ ...prev, fields }));
                  }}
                  style={{ marginRight: '0.5rem' }}
                />
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: '500' }}>{field.label}</div>
                  <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>{field.description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* AI Enrichment Section */}
        <div style={cardStyle}>
          <h3 style={{ marginBottom: '1rem' }}>🤖 AI Data Enrichment (Optional)</h3>
          
          <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '1rem' }}>
            Enhance your data with AI-powered directory content. <strong>All 9 directory fields are selected by default</strong> for comprehensive business listings:
          </p>
          <label style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={formData.enrichment.enabled}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                enrichment: { ...prev.enrichment, enabled: e.target.checked }
              }))}
              style={{ marginRight: '0.5rem' }}
            />
            <strong>Enable AI Enrichment (+additional credits)</strong>
          </label>
          
          {formData.enrichment.enabled && (
            <>
              {/* AI Provider Selection */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  AI Provider
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem' }}>
                  {Object.entries(aiProviders).map(([key, provider]) => (
                    <label 
                      key={key}
                      style={{
                        ...checkboxStyle,
                        background: formData.enrichment.aiProvider === key ? '#eff6ff' : 'white',
                        borderColor: formData.enrichment.aiProvider === key ? '#2563eb' : '#e5e7eb'
                      }}
                    >
                      <input
                        type="radio"
                        name="aiProvider"
                        value={key}
                        checked={formData.enrichment.aiProvider === key}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          enrichment: { ...prev.enrichment, aiProvider: e.target.value }
                        }))}
                        style={{ marginRight: '0.5rem' }}
                      />
                      <div>
                        <div>{provider.icon} {provider.name}</div>
                        <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>+{provider.costPerBusiness} credits/business</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              
              {/* Enrichment Fields */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Enrichment Fields
                </label>
                {Object.entries(fieldCategories).map(([categoryKey, category]) => (
                  <div key={categoryKey} style={{ marginBottom: '1rem' }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: '#374151' }}>{category.name}</h4>
                    <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0 0 0.5rem 0' }}>{category.description}</p>
                    <div style={checkboxGridStyle}>
                      {Object.entries(enrichmentFields)
                        .filter(([_, field]) => field.category === categoryKey)
                        .map(([fieldKey, field]) => (
                          <label 
                            key={fieldKey}
                            style={{
                              ...checkboxStyle,
                              background: formData.enrichment.fields.includes(fieldKey) ? '#eff6ff' : 'white',
                              borderColor: formData.enrichment.fields.includes(fieldKey) ? '#2563eb' : '#e5e7eb'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={formData.enrichment.fields.includes(fieldKey)}
                              onChange={(e) => {
                                const fields = e.target.checked 
                                  ? [...formData.enrichment.fields, fieldKey]
                                  : formData.enrichment.fields.filter(f => f !== fieldKey);
                                setFormData(prev => ({
                                  ...prev,
                                  enrichment: { ...prev.enrichment, fields }
                                }));
                              }}
                              style={{ marginRight: '0.5rem' }}
                            />
                            <div>
                              <div style={{ fontSize: '0.9rem' }}>{field.name}</div>
                              <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>{field.description}</div>
                            </div>
                          </label>
                        ))
                      }
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        
        {/* Cost Breakdown */}
        {costBreakdown && (
          <div style={cardStyle}>
            <h3 style={{ marginBottom: '1rem' }}>💰 Cost Breakdown</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
              <div style={{ textAlign: 'center', padding: '1rem', background: '#f8fafc', borderRadius: '6px' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2563eb' }}>
                  {costBreakdown.baseCost}
                </div>
                <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>Base Scraping</div>
              </div>
              {formData.enrichment.enabled && (
                <div style={{ textAlign: 'center', padding: '1rem', background: '#f8fafc', borderRadius: '6px' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>
                    {costBreakdown.enrichmentCost}
                  </div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>AI Enrichment</div>
                </div>
              )}
              <div style={{ textAlign: 'center', padding: '1rem', background: '#fef3c7', borderRadius: '6px' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#d97706' }}>
                  {costBreakdown.totalCost}
                </div>
                <div style={{ fontSize: '0.9rem', color: '#92400e' }}>Total Credits</div>
              </div>
            </div>
          </div>
        )}

        {/* Submit */}
        <div style={{ textAlign: 'center' }}>
          <button 
            type="submit" 
            style={buttonStyle} 
            disabled={loading || formData.locations.length === 0 || !formData.searchTerm || !formData.businessLimit || parseInt(formData.businessLimit) < 1}
          >
            {loading ? 'Creating Project...' : 'Start Scraping'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateProject;