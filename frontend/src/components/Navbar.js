import React from 'react';
import { Link } from 'react-router-dom';

const Navbar = ({ user, onLogout }) => {
  const navStyle = {
    background: '#2563eb',
    color: 'white',
    padding: '1rem 2rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  };

  const linkStyle = {
    color: 'white',
    textDecoration: 'none',
    marginRight: '1rem',
    padding: '0.5rem 1rem',
    borderRadius: '4px',
    transition: 'background 0.2s'
  };

  const buttonStyle = {
    background: 'rgba(255,255,255,0.2)',
    border: 'none',
    color: 'white',
    padding: '0.5rem 1rem',
    borderRadius: '4px',
    cursor: 'pointer'
  };

  return (
    <nav style={navStyle}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <Link to="/dashboard" style={{ ...linkStyle, fontWeight: 'bold', fontSize: '1.2rem' }}>
          🚀 Business Scraper
        </Link>
        <Link to="/dashboard" style={linkStyle}>Dashboard</Link>
        <Link to="/create-project" style={linkStyle}>New Project</Link>
        <Link to="/billing" style={linkStyle}>Billing</Link>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ marginRight: '1rem' }}>
          👋 {user.name || user.email}
        </span>
        <button style={buttonStyle} onClick={onLogout}>
          Logout
        </button>
      </div>
    </nav>
  );
};

export default Navbar;