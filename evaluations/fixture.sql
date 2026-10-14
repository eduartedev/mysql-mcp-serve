CREATE TABLE customers (
  id INT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  city VARCHAR(40) NOT NULL,
  segment VARCHAR(20) NOT NULL
);

CREATE TABLE orders (
  id INT PRIMARY KEY,
  customer_id INT NOT NULL,
  status VARCHAR(20) NOT NULL,
  total_cents INT NOT NULL,
  created_on DATE NOT NULL
);

CREATE TABLE order_items (
  id INT PRIMARY KEY,
  order_id INT NOT NULL,
  sku VARCHAR(20) NOT NULL,
  qty INT NOT NULL,
  unit_cents INT NOT NULL
);

INSERT INTO customers (id, name, city, segment) VALUES
  (1, 'Ana Ruiz', 'León', 'retail'),
  (2, 'Bruno Díaz', 'León', 'wholesale'),
  (3, 'Clara Soto', 'Mérida', 'retail'),
  (4, 'Diego Paz', 'Puebla', 'wholesale'),
  (5, 'Elena Mar', 'León', 'retail');

INSERT INTO orders (id, customer_id, status, total_cents, created_on) VALUES
  (101, 1, 'paid', 15000, '2024-03-02'),
  (102, 1, 'paid', 8000, '2024-11-19'),
  (103, 2, 'paid', 42000, '2024-06-01'),
  (104, 3, 'void', 5000, '2024-01-15'),
  (105, 3, 'paid', 21000, '2024-08-08'),
  (106, 5, 'paid', 9000, '2023-12-20'),
  (107, 4, 'open', 11000, '2024-09-30');

INSERT INTO order_items (id, order_id, sku, qty, unit_cents) VALUES
  (1, 101, 'LAMP-A', 2, 5000),
  (2, 101, 'CORD-B', 1, 5000),
  (3, 102, 'LAMP-A', 1, 8000),
  (4, 103, 'BULK-C', 6, 7000),
  (5, 105, 'LAMP-A', 4, 5500),
  (6, 106, 'CORD-B', 3, 3000),
  (7, 107, 'LAMP-A', 1, 11000);
