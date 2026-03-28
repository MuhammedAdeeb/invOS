const express = require('express');
const mysql   = require('mysql2');
const cors    = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const db = mysql.createConnection({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port:     process.env.DB_PORT || 4000,
  ssl:      { minVersion: 'TLSv1.2', rejectUnauthorized: true } // Required by TiDB
});

db.connect(err => {
  if (err) throw err;
  console.log('MySQL connected ✓');
});

// GET all products with supplier + stock (JOIN)
app.get('/api/products', (req, res) => {
  db.query('SELECT * FROM vw_supplier_products', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// GET low stock view
app.get('/api/low-stock', (req, res) => {
  db.query('SELECT * FROM vw_low_stock', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// GET all alerts
app.get('/api/alerts', (req, res) => {
  db.query('SELECT * FROM stock_alerts ORDER BY triggered_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// GET all suppliers
app.get('/api/suppliers', (req, res) => {
  db.query('SELECT * FROM suppliers', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// POST add product
app.post('/api/products', (req, res) => {
  const { supplier_id, product_name, sku, category, unit_price, reorder_level, description } = req.body;
  db.query(
    'INSERT INTO products (supplier_id, product_name, sku, category, unit_price, reorder_level, description) VALUES (?,?,?,?,?,?,?)',
    [supplier_id, product_name, sku, category, unit_price, reorder_level, description],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ product_id: result.insertId });
    }
  );
});

// PUT update stock (this fires your MySQL TRIGGER automatically)
app.put('/api/stock/:productId', (req, res) => {
  const { quantity } = req.body;
  db.query(
    'UPDATE stock SET quantity = ?, last_restocked = NOW() WHERE product_id = ?',
    [quantity, req.params.productId],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// DELETE product
app.delete('/api/products/:id', (req, res) => {
  db.query('DELETE FROM products WHERE product_id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.listen(3000, () => console.log('API running at http://localhost:3000'));