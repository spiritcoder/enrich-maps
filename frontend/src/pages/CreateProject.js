import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { projects, countries } from '../services/api';

const CreateProject = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    keyword: '',
    locations: [],
    fields: ['name', 'phone', 'website', 'address', 'rating'],
    filters: {
      minRating: 4.0,
      minReviews: 5
    }
  });
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedSubdivisions, setSelectedSubdivisions] = useState([]);
  const [showSubdivisions, setShowSubdivisions] = useState(false);
  const [availableCountries, setAvailableCountries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadCountries();
  }, []);

  const loadCountries = async () => {
    try {
      const response = await countries.getAll();
      setAvailableCountries(response.data.countries);
    } catch (error) {
      console.error('Error loading countries:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await projects.create(formData);
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
        {/* Keyword Section */}
        <div style={cardStyle}>
          <h3 style={{ marginBottom: '1rem' }}>🔍 What to Scrape</h3>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Business Type / Keyword
          </label>
          <input
            type="text"
            placeholder="e.g., tattoo shops, restaurants, dentists"
            value={formData.keyword}
            onChange={(e) => setFormData(prev => ({ ...prev, keyword: e.target.value }))}
            style={inputStyle}
            required
          />
          <p style={{ fontSize: '0.9rem', color: '#6b7280', marginTop: '0.5rem' }}>
            Enter the type of business you want to find
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

        {/* Fields Section */}
        <div style={cardStyle}>
          <h3 style={{ marginBottom: '1rem' }}>📋 Data Fields to Extract</h3>
          <div style={checkboxGridStyle}>
            {availableFields.map((field) => (
              <label 
                key={field.key} 
                style={{
                  ...checkboxStyle,
                  background: formData.fields.includes(field.key) ? '#eff6ff' : 'white',
                  borderColor: formData.fields.includes(field.key) ? '#2563eb' : '#e5e7eb'
                }}
              >
                <input
                  type="checkbox"
                  checked={formData.fields.includes(field.key)}
                  onChange={() => handleFieldChange(field.key)}
                  style={{ marginRight: '0.5rem' }}
                />
                {field.label}
              </label>
            ))}
          </div>
        </div>

        {/* Filters Section */}
        <div style={cardStyle}>
          <h3 style={{ marginBottom: '1rem' }}>⚙️ Quality Filters</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Minimum Rating
              </label>
              <input
                type="number"
                min="0"
                max="5"
                step="0.1"
                value={formData.filters.minRating}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  filters: { ...prev.filters, minRating: parseFloat(e.target.value) }
                }))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Minimum Reviews
              </label>
              <input
                type="number"
                min="0"
                value={formData.filters.minReviews}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  filters: { ...prev.filters, minReviews: parseInt(e.target.value) }
                }))}
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* Submit */}
        <div style={{ textAlign: 'center' }}>
          <button 
            type="submit" 
            style={buttonStyle} 
            disabled={loading || formData.locations.length === 0 || !formData.keyword}
          >
            {loading ? 'Creating Project...' : 'Start Scraping'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateProject;