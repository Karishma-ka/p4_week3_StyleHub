const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
 // Use Stripe secret key from environment variables
const nodemailer = require('nodemailer');
require('dotenv').config(); // Load environment variables from .env file

// Initialize Express
const app = express();
const port =3000; // Use PORT from environment variables

// Middleware
app.use(cors());
app.use(bodyParser.json());

// MongoDB Connection
const mongoUri ='mongodb://localhost:27017/ecomm';
mongoose.connect(mongoUri)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Define a route for the root URL
app.get('/', (req, res) => {
  res.send('Welcome to Style Hub!');
});

// User Schema & Model
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

const User = mongoose.model('User', userSchema);

// Product Schema & Model
const productSchema = new mongoose.Schema({
  name: String,
  description: String,
  price: Number,
  imageUrl: String,
});
const Product = mongoose.model('Product', productSchema);

// Order Schema & Model
const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  products: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      quantity: { type: Number, required: true },
    },
  ],
  total: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});
const Order = mongoose.model('Order', orderSchema);

// Nodemailer Configuration
const transporter = nodemailer.createTransport({
  service: 'gmail', // Change if needed
  auth: {
    user: process.env.EMAIL_USER, // Use email from environment variables
    pass: process.env.EMAIL_PASS, // Use email password from environment variables
  },
});

// Authentication Middleware
const authenticate = (req, res, next) => {
  const token = req.header('Authorization');
  if (!token) return res.status(401).json({ message: 'Access denied' });
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => { // Use JWT secret from environment variables
    if (err) return res.status(400).json({ message: 'Invalid token' });
    req.userId = decoded.userId;
    next();
  });
};

// User Registration
app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;

  // Check for missing fields
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  // Validate email format
  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: 'Invalid email format.' });
  }

  try {
    // Check if the email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already in use.' });
    }

    // Create a new user
    const user = new User({ email, password });
    await user.save();
    res.status(201).json({ message: 'User registered successfully!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error registering user: ' + err.message });
  }
});

// Login Log Schema & Model
const loginLogSchema = new mongoose.Schema({
  email: { type: String, required: true },
  loginTime: { type: Date, default: Date.now },
  status: { type: String, enum: ['Success', 'Failure'], required: true },
});
const LoginLog = mongoose.model('LoginLog', loginLogSchema);

// User Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      // Log failed attempt
      await new LoginLog({ email, status: 'Failure' }).save();
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      // Log failed attempt
      await new LoginLog({ email, status: 'Failure' }).save();
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' }); // Use JWT secret from environment variables

    // Log successful attempt
    await new LoginLog({ email, status: 'Success' }).save();

    res.status(200).json({ token });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add Product (Admin Only)
app.post('/api/products', authenticate, async (req, res) => {
  const { name, description, price, imageUrl } = req.body;
  try {
    const product = new Product({ name, description, price, imageUrl });
    await product.save();
    res.status(201).json({ message: 'Product added' });
  } catch (err) {
    res.status(400).json({ message: 'Error adding product: ' + err.message });
  }
});

// Get Products
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find();
    res.status(200).json(products);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching products: ' + err.message });
  }
});


// Place Order
app.post('/api/orders', authenticate, async (req, res) => {
  const { products, total } = req.body;
  try {
    const order = new Order({ userId: req.userId, products, total });
    await order.save();

    // Send Email Confirmation
    const user = await User.findById(req.userId);
    const mailOptions = {
      from: process.env.EMAIL_USER, // Use email from environment variables
      to: user.email,
      subject: 'Order Confirmation',
      text: `Thank you for your order! Order total: $${total / 100}.`,
    };
    await transporter.sendMail(mailOptions);

    res.status(201).json({ message: 'Order placed and confirmation email sent' });
  } catch (err) {
    res.status(400).json({ message: 'Error placing order: ' + err.message });
  }
});

// Get Orders for User
app.get('/api/orders', authenticate, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.userId });
    res.status(200).json(orders);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching orders: ' + err.message });
  }
});

// Endpoint to handle contact form submission
app.post('/api/contact', async (req, res) => {
  const { name, email, message } = req.body;

  try {
    // Create a new contact document
    const contact = new mongoose.model('Contact', new mongoose.Schema({
      name: { type: String, required: true },
      email: { type: String, required: true },
      message: { type: String, required: true },
    }))({ name, email, message });
    
    // Save the document to the database
    await contact.save();

    console.log('Contact form submission saved:', contact);

    // Send email notification
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: 'New Contact Form Submission',
      text: `You have a new contact form submission:
            Name: ${name}
            Email: ${email}
            Message: ${message}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        return console.error('Error sending email:', error);
      }
      console.log('Email sent:', info.response);
    });

    res.status(200).json({ message: 'Message received successfully!' });
  } catch (err) {
    console.error('Error saving contact form submission:', err.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

const checkoutSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  products: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      quantity: { type: Number, required: true },
    },
  ],
  shippingAddress: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zip: { type: String, required: true },
    country: { type: String, required: true },
  },
  paymentInfo: {
    cardNumber: { type: String, required: true },
    expiryDate: { type: String, required: true },
    cvv: { type: String, required: true },
  },
  orderNumber: { type: String, required: true, unique: true },
  orderDate: { type: Date, required: true },
  total: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

const Checkout = mongoose.model('Checkout', checkoutSchema);
module.exports = Checkout;

const orderConfirmationSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true, unique: true },
  orderDate: { type: Date, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  products: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      quantity: { type: Number, required: true },
      price: { type: Number, required: true },
    },
  ],
  total: { type: Number, required: true },
  shippingAddress: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zip: { type: String, required: true },
    country: { type: String, required: true },
  },
  contact: {
    fullName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
  },
  paymentInfo: {
    cardType: { type: String, required: true },
    last4Digits: { type: String, required: true },
  },
  createdAt: { type: Date, default: Date.now },
});

const OrderConfirmation = mongoose.model('OrderConfirmation', orderConfirmationSchema);
module.exports = OrderConfirmation;
// Start the Server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});