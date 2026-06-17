CREATE TABLE customers (
  customer_id INTEGER PRIMARY KEY,
  name TEXT, email TEXT, city TEXT, country TEXT, signup_date TEXT
);
CREATE TABLE products (
  product_id INTEGER PRIMARY KEY,
  name TEXT, category TEXT, price REAL, stock_quantity INTEGER
);
CREATE TABLE orders (
  order_id INTEGER PRIMARY KEY,
  customer_id INTEGER, order_date TEXT, status TEXT, payment_method TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);
CREATE TABLE order_items (
  item_id INTEGER PRIMARY KEY,
  order_id INTEGER, product_id INTEGER, quantity INTEGER, unit_price REAL,
  FOREIGN KEY (order_id) REFERENCES orders(order_id),
  FOREIGN KEY (product_id) REFERENCES products(product_id)
);
CREATE TABLE reviews (
  review_id INTEGER PRIMARY KEY,
  customer_id INTEGER, product_id INTEGER, rating INTEGER, review_date TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
  FOREIGN KEY (product_id) REFERENCES products(product_id)
);
