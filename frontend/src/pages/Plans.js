import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { payments, user } from '../services/api';

const Plans = ({ onUserUpdate }) => {
  const [plans, setPlans] = useState({});
  const [currentPlan, setCurrentPlan] = useState('free');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [plansRes, usageRes] = await Promise.all([
        payments.getPlans(),
        user.getUsage()
      ]);
      
      setPlans(plansRes.data.plans);
      setCurrentPlan(usageRes.data.usage.subscription?.plan || 'free');
    } catch (error) {
      console.error('Error loading plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePlanSelect = async (planId) => {
    if (planId === currentPlan) return;

    try {
      await payments.updateSubscription({ plan: planId });
      alert(`Successfully upgraded to ${planId} plan!`);
      setCurrentPlan(planId);
      if (onUserUpdate) onUserUpdate(); // Refresh global user data
    } catch (error) {
      console.error('Error updating subscription:', error);
      alert('Failed to update subscription. Please try again.');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Loading plans...</div>
      </div>
    );
  }

  const containerStyle = {
    padding: '2rem',
    maxWidth: '1200px',
    margin: '0 auto'
  };

  const planCardStyle = (planId) => ({
    background: 'white',
    padding: '2rem',
    borderRadius: '12px',
    boxShadow: currentPlan === planId ? '0 8px 25px rgba(37, 99, 235, 0.15)' : '0 4px 6px rgba(0,0,0,0.1)',
    border: currentPlan === planId ? '2px solid #2563eb' : '1px solid #e5e7eb',
    position: 'relative',
    textAlign: 'center'
  });

  const buttonStyle = (planId) => ({
    background: currentPlan === planId ? '#6b7280' : '#2563eb',
    color: 'white',
    border: 'none',
    padding: '0.75rem 2rem',
    borderRadius: '6px',
    cursor: currentPlan === planId ? 'default' : 'pointer',
    fontSize: '1rem',
    fontWeight: 'bold',
    width: '100%',
    marginTop: '1rem'
  });

  return (
    <div style={containerStyle}>
      <div style={{ marginBottom: '2rem' }}>
        <Link to="/billing" style={{ color: '#2563eb', textDecoration: 'none' }}>
          ← Back to Billing
        </Link>
      </div>

      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1 style={{ marginBottom: '1rem' }}>🚀 Choose Your Plan</h1>
        <p style={{ color: '#6b7280', fontSize: '1.1rem' }}>
          Scale your business scraping with the perfect plan for your needs
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
        {Object.entries(plans).map(([planId, plan]) => (
          <div key={planId} style={planCardStyle(planId)}>
            {currentPlan === planId && (
              <div style={{
                position: 'absolute',
                top: '-10px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: '#2563eb',
                color: 'white',
                padding: '0.25rem 1rem',
                borderRadius: '12px',
                fontSize: '0.8rem',
                fontWeight: 'bold'
              }}>
                CURRENT PLAN
              </div>
            )}
            
            {planId === 'professional' && (
              <div style={{
                position: 'absolute',
                top: '-10px',
                right: '-10px',
                background: '#10b981',
                color: 'white',
                padding: '0.25rem 0.75rem',
                borderRadius: '12px',
                fontSize: '0.8rem',
                fontWeight: 'bold'
              }}>
                POPULAR
              </div>
            )}

            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem' }}>{plan.name}</h3>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <span style={{ fontSize: '3rem', fontWeight: 'bold', color: '#2563eb' }}>
                ${plan.price}
              </span>
              <span style={{ color: '#6b7280' }}>/month</span>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                {plan.monthlyLimit.toLocaleString()} businesses/month
              </div>
              <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                ${(plan.price / plan.monthlyLimit).toFixed(4)} per business
              </div>
            </div>

            <ul style={{ 
              listStyle: 'none', 
              padding: 0, 
              margin: '0 0 2rem 0',
              textAlign: 'left'
            }}>
              {plan.features.map((feature, index) => (
                <li key={index} style={{ 
                  padding: '0.5rem 0',
                  borderBottom: index < plan.features.length - 1 ? '1px solid #f3f4f6' : 'none'
                }}>
                  <span style={{ color: '#10b981', marginRight: '0.5rem' }}>✓</span>
                  {feature}
                </li>
              ))}
            </ul>

            <button
              onClick={() => handlePlanSelect(planId)}
              style={buttonStyle(planId)}
              disabled={currentPlan === planId}
            >
              {currentPlan === planId ? 'Current Plan' : 
               planId === 'free' ? 'Downgrade to Free' : 'Upgrade Now'}
            </button>
          </div>
        ))}
      </div>

      <div style={{ 
        textAlign: 'center', 
        marginTop: '3rem',
        padding: '2rem',
        background: '#f8fafc',
        borderRadius: '12px'
      }}>
        <h3 style={{ marginBottom: '1rem' }}>💡 Need More Flexibility?</h3>
        <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
          Purchase credits for occasional overages or one-time projects
        </p>
        <Link 
          to="/credits"
          style={{
            background: '#10b981',
            color: 'white',
            padding: '0.75rem 2rem',
            borderRadius: '6px',
            textDecoration: 'none',
            fontWeight: 'bold'
          }}
        >
          View Credit Packages
        </Link>
      </div>
    </div>
  );
};

export default Plans;