const express = require('express');
const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const { sendWelcomeEmail } = require('../../services/EmailService');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Validation
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const userModel = new User();
    await userModel.init();

    // Check if user exists
    const existingUser = await userModel.findByEmail(email);
    if (existingUser) {
      await userModel.close();
      return res.status(400).json({ error: 'User already exists' });
    }

    // Create user
    const user = await userModel.create({ email, password, name });
    await userModel.close();

    // Generate token
    const token = generateToken(user._id);

    // Send welcome email (don't wait for it)
    sendWelcomeEmail(user.email, user.name).catch(console.error);

    res.status(201).json({
      message: 'User created successfully',
      user,
      token
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const userModel = new User();
    await userModel.init();

    // Find user
    const user = await userModel.findByEmail(email);
    if (!user) {
      await userModel.close();
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Validate password
    const isValidPassword = await userModel.validatePassword(password, user.password);
    if (!isValidPassword) {
      await userModel.close();
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await userModel.close();

    // Remove password from response
    delete user.password;

    // Generate token
    const token = generateToken(user._id);

    res.json({
      message: 'Login successful',
      user,
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;