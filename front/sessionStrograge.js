// Example code to save order details in sessionStorage
const orderDetails = {
  orderNumber: '123456',
  orderDate: '2024-12-15',
  fullName: 'John Doe',
  email: 'johndoe@example.com',
  phone: '123-456-7890',
  address: '1234 Elm Street',
  city: 'Springfield',
  zip: '62704',
  country: 'USA',
  cardType: 'Visa',
  cardLast4: '1234',
  total: '69.98',
  products: [
    { name: 'Product 1', price: '29.99', quantity: 1 },
    { name: 'Product 2', price: '39.99', quantity: 1 }
  ]
};

sessionStorage.setItem('orderDetails', JSON.stringify(orderDetails));