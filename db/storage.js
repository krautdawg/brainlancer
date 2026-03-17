const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../vat.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS vat_settings (
    id INTEGER PRIMARY KEY,
    steuernummer TEXT,
    voranmeldezeitraum TEXT DEFAULT "quarterly",
    steuersatz TEXT DEFAULT "19",
    period_start TEXT,
    period_end TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    invoice_number TEXT,
    vendor_name TEXT,
    direction TEXT CHECK(direction IN ("in","out")),
    net_amount REAL,
    vat_rate REAL,
    vat_amount REAL,
    gross_amount REAL,
    source TEXT DEFAULT "email",
    email_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

const getSettings = () => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM vat_settings ORDER BY id DESC LIMIT 1', (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const saveSettings = (settings) => {
  return new Promise((resolve, reject) => {
    const { steuernummer, voranmeldezeitraum, steuersatz, period_start, period_end } = settings;
    db.run(
      'INSERT INTO vat_settings (steuernummer, voranmeldezeitraum, steuersatz, period_start, period_end) VALUES (?, ?, ?, ?, ?)',
      [steuernummer, voranmeldezeitraum, steuersatz, period_start, period_end],
      function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      }
    );
  });
};

const addInvoice = (invoice) => {
  return new Promise((resolve, reject) => {
    const { date, invoice_number, vendor_name, direction, net_amount, vat_rate, vat_amount, gross_amount, source, email_id } = invoice;
    db.run(
      'INSERT INTO invoices (date, invoice_number, vendor_name, direction, net_amount, vat_rate, vat_amount, gross_amount, source, email_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [date, invoice_number, vendor_name, direction, net_amount, vat_rate, vat_amount, gross_amount, source, email_id],
      function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      }
    );
  });
};

const getInvoices = (start, end) => {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM invoices WHERE date >= ? AND date <= ? ORDER BY date ASC',
      [start, end],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
};

const deleteInvoice = (id) => {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM invoices WHERE id = ?', [id], function(err) {
            if (err) reject(err);
            else resolve();
        });
    });
};

module.exports = {
  db,
  getSettings,
  saveSettings,
  addInvoice,
  getInvoices,
  deleteInvoice
};
