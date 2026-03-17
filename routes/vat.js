const express = require('express');
const router = express.Router();
const multer = require('multer');
const { getAuthUrl, getTokens, getGmailClient } = require('../lib/gmail-client');
const { processPDF, processImage } = require('../lib/pdf-extractor');
const { calculateSummary } = require('../lib/tax-calculator');
const { getSettings, saveSettings, addInvoice, getInvoices, deleteInvoice } = require('../db/storage');

const upload = multer({ storage: multer.memoryStorage() });

// Auth routes
router.get('/auth/google', (req, res) => {
  const url = getAuthUrl();
  res.redirect(url);
});

router.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const tokens = await getTokens(code);
    req.session.tokens = tokens;
    res.redirect('/?tab=vat');
  } catch (err) {
    console.error('Error exchanging code:', err);
    res.status(500).send('Authentication failed');
  }
});

// API routes
router.post('/api/vat/settings', async (req, res) => {
  try {
    const result = await saveSettings(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/vat/scan', async (req, res) => {
  if (!req.session.tokens) {
    return res.status(401).json({ error: 'Not authenticated with Google' });
  }

  try {
    const settings = await getSettings();
    if (!settings) {
        return res.status(400).json({ error: 'No settings found. Please configure tax settings first.' });
    }
    const { period_start, period_end } = settings;
    const gmail = getGmailClient(req.session.tokens);

    const senders = ['stripe.com', 'paypal.de', 'lexoffice.de', 'sevdesk.de', 'fastbill.com', 'amazon.com'];
    const senderQuery = senders.map(s => `from:${s}`).join(' OR ');
    const query = `(Rechnung OR Invoice OR Receipt OR Quittung OR filename:pdf) after:${period_start} before:${period_end} (${senderQuery})`;

    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
    });

    const messages = response.data.messages || [];
    const results = [];

    for (const msg of messages) {
      const message = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
      });

      const parts = message.data.payload.parts || [];
      for (const part of parts) {
        if (part.filename && part.filename.toLowerCase().endsWith('.pdf')) {
          const attachment = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: msg.id,
            id: part.body.attachmentId,
          });

          const buffer = Buffer.from(attachment.data.data, 'base64');
          try {
            const extracted = await processPDF(buffer);
            extracted.source = 'email';
            extracted.email_id = msg.id;
            
            // Map extracted to DB format
            const invoice = {
                date: extracted.date,
                invoice_number: extracted.invoice_number,
                vendor_name: extracted.vendor_name,
                direction: extracted.direction,
                net_amount: extracted.total_net,
                vat_rate: extracted.items && extracted.items.length > 0 ? extracted.items[0].vat_rate : 19,
                vat_amount: extracted.total_vat,
                gross_amount: extracted.total_gross,
                source: 'email',
                email_id: msg.id
            };

            const saved = await addInvoice(invoice);
            results.push({ ...invoice, id: saved.id });
          } catch (err) {
            console.error(`Failed to process attachment in message ${msg.id}:`, err);
          }
        }
      }
    }

    res.json(results);
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/vat/upload', upload.single('invoice'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    let extracted;
    if (req.file.mimetype === 'application/pdf') {
      extracted = await processPDF(req.file.buffer);
    } else if (req.file.mimetype.startsWith('image/')) {
      extracted = await processImage(req.file.buffer, req.file.mimetype);
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    const invoice = {
        date: extracted.date,
        invoice_number: extracted.invoice_number,
        vendor_name: extracted.vendor_name,
        direction: extracted.direction,
        net_amount: extracted.total_net,
        vat_rate: extracted.items && extracted.items.length > 0 ? extracted.items[0].vat_rate : 19,
        vat_amount: extracted.total_vat,
        gross_amount: extracted.total_gross,
        source: 'upload'
    };

    const saved = await addInvoice(invoice);
    res.json({ ...invoice, id: saved.id });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/vat/summary', async (req, res) => {
  try {
    const settings = await getSettings();
    if (!settings) {
        return res.status(400).json({ error: 'No settings found' });
    }
    const invoices = await getInvoices(settings.period_start, settings.period_end);
    const summary = calculateSummary(invoices, settings);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/vat/invoices', async (req, res) => {
    try {
        const settings = await getSettings();
        if (!settings) return res.json([]);
        const invoices = await getInvoices(settings.period_start, settings.period_end);
        res.json(invoices);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/api/vat/invoices/:id', async (req, res) => {
    try {
        await deleteInvoice(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/api/vat/export', async (req, res) => {
    try {
        const settings = await getSettings();
        const invoices = await getInvoices(settings.period_start, settings.period_end);
        
        let csv = 'Date,Vendor,Direction,Net,VAT,Gross\n';
        invoices.forEach(inv => {
            csv += `${inv.date},${inv.vendor_name},${inv.direction},${inv.net_amount},${inv.vat_amount},${inv.gross_amount}\n`;
        });
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=vat_export.csv');
        res.send(csv);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

module.exports = router;
