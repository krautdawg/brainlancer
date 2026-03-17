const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const vatRouter = require('./routes/vat');

const app = express();
const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.APP_PASSWORD || 'brainlancer2026';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Trust reverse proxy (Coolify/Caddy)
app.set('trust proxy', 1);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'ki-katapult-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session.authenticated) {
    next();
  } else {
    res.redirect('/login');
  }
};

// Mount VAT router with protection for API routes
app.use('/', (req, res, next) => {
    if (req.path.startsWith('/auth/') || req.path.startsWith('/api/vat/')) {
        return requireAuth(req, res, next);
    }
    next();
}, vatRouter);

// Login page
app.get('/login', (req, res) => {
  if (req.session.authenticated) {
    return res.redirect('/');
  }

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login - Local Lead Engine</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lexend:wght@600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; }
    h1, h2, h3 { font-family: 'Lexend', sans-serif; }
  </style>
</head>
<body class="bg-slate-900 min-h-screen flex items-center justify-center p-4">
  <div class="max-w-md w-full">
    <div class="bg-slate-800 rounded-2xl shadow-2xl p-8 border border-slate-700">
      <div class="text-center mb-8">
        <div class="inline-block bg-green-500/10 rounded-full p-3 mb-4">
          <svg class="w-12 h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
          </svg>
        </div>
        <h1 class="text-3xl font-bold text-white mb-2">Local Lead Engine</h1>
        <p class="text-slate-400">Enter password to continue</p>
      </div>

      ${req.query.error ? '<div class="bg-red-500/10 border border-red-500/50 rounded-lg p-3 mb-4 text-red-400 text-sm text-center">Invalid password</div>' : ''}

      <form method="POST" action="/login" class="space-y-4">
        <div>
          <label for="password" class="block text-sm font-medium text-slate-300 mb-2">Password</label>
          <input
            type="password"
            id="password"
            name="password"
            required
            autofocus
            class="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
            placeholder="Enter password"
          />
        </div>

        <button
          type="submit"
          class="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-6 rounded-lg transition duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
        >
          Access Dashboard
        </button>
      </form>

      <div class="mt-8 pt-6 border-t border-slate-700 text-center">
        <p class="text-xs text-slate-500">Powered by <span class="text-green-500 font-semibold">KI Katapult</span></p>
      </div>
    </div>
  </div>

  <script>
    // Auto-focus password field
    document.getElementById('password').focus();
  </script>
</body>
</html>
  `);
});

// Login handler
app.post('/login', (req, res) => {
  const { password } = req.body;

  if (password === PASSWORD) {
    req.session.authenticated = true;
    res.redirect('/');
  } else {
    res.redirect('/login?error=1');
  }
});

// Logout handler
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Serve static files (protected)
app.use(express.static('public', {
  setHeaders: (res, path) => {
    if (!path.endsWith('.html')) return;
  }
}));

// Protected main app route
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Helper: Scrape Website
async function scrapeWebsite(url) {
  try {
    const targetUrl = url || 'https://ki-katapult.de';
    const response = await axios.get(targetUrl, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const $ = cheerio.load(response.data);
    
    return {
      title: $('title').text(),
      metaDescription: $('meta[name="description"]').attr('content') || '',
      h1: $('h1').map((i, el) => $(el).text()).get().join(' | '),
      h2: $('h2').map((i, el) => $(el).text()).get().join(' | '),
      body: $('body').text().replace(/\s+/g, ' ').substring(0, 2000)
    };
  } catch (error) {
    console.error('Scraping error:', error.message);
    return null;
  }
}

// Helper: Scrape WLW
async function scrapeWLW(industry, location) {
  try {
    const url = `https://www.wlw.de/de/suche?q=${encodeURIComponent(industry)}&location=${encodeURIComponent(location)}`;
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(response.data);
    const companies = [];
    
    $('.company-card').each((i, el) => {
      if (i >= 10) return;
      const name = $(el).find('.company-card__name').text().trim();
      const website = $(el).find('a[data-event-label="Website"]').attr('href');
      const desc = $(el).find('.company-card__description').text().trim();
      if (name) companies.push({ name, website, description: desc, source: 'wlw' });
    });
    
    return companies;
  } catch (error) {
    return [];
  }
}

// Helper: Scrape Kompass
async function scrapeKompass(industry) {
  try {
    const url = `https://www.kompass.com/a/search.html?text=${encodeURIComponent(industry)}&country=DE`;
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(response.data);
    const companies = [];
    
    $('.product-list-item').each((i, el) => {
      if (i >= 10) return;
      const name = $(el).find('h2').text().trim();
      const website = $(el).find('.website-link').attr('href');
      const desc = $(el).find('.description').text().trim();
      if (name) companies.push({ name, website, description: desc, source: 'kompass' });
    });
    
    return companies;
  } catch (error) {
    return [];
  }
}

// Helper: Scrape NorthData
async function scrapeNorthData(industry, location) {
  try {
    const url = `https://www.northdata.de/suche?query=${encodeURIComponent(industry + ' ' + location)}`;
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(response.data);
    const companies = [];
    
    $('.result-row').each((i, el) => {
      if (i >= 10) return;
      const name = $(el).find('.name').text().trim();
      const website = null; // NorthData often doesn't show direct website in search results
      const desc = $(el).find('.activity').text().trim();
      if (name) companies.push({ name, website, description: desc, source: 'northdata' });
    });
    
    return companies;
  } catch (error) {
    return [];
  }
}

// API endpoint for real analysis
app.post('/api/analyze-icp', requireAuth, async (req, res) => {
  const { website, industry, location } = req.body;

  try {
    if (!ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Server misconfiguration: ANTHROPIC_API_KEY is not set.' });
    }

    // Step A: Scrape submitted website
    const scrapedWebsite = await scrapeWebsite(website);

    // Step B: Scrape B2B directories
    const [wlwResults, kompassResults, northDataResults] = await Promise.all([
      scrapeWLW(industry, location),
      scrapeKompass(industry),
      scrapeNorthData(industry, location)
    ]);

    const allCompanies = [...wlwResults, ...kompassResults, ...northDataResults];

    // Step C: AI Analysis with Mistral
    const systemPrompt = `You are an expert B2B Sales Strategist. 
Analyze the provided company website content and a list of potentially matching leads.
Your goal is to define the Ideal Customer Profile (ICP) for the company and rank the leads based on fit.
Filter out any B2C companies (no retail shops, restaurants, consumers). Focus on B2B.

Return ONLY a valid JSON object with this exact structure:
{
  "profile": {
    "idealCustomer": "string",
    "targetCompanySize": "string",
    "decisionMakers": "string",
    "keyPainPoints": ["string"],
    "recommendedIndustries": ["string"]
  },
  "companies": [
    {
      "name": "string",
      "website": "string",
      "location": "string",
      "score": number,
      "hook": "string",
      "reason": "string"
    }
  ]
}`;

    const userPrompt = `
COMPANY WEBSITE CONTENT:
${JSON.stringify(scrapedWebsite)}

TARGET INDUSTRY: ${industry}
TARGET LOCATION: ${location}

POTENTIAL LEADS FOUND VIA SCRAPING:
${JSON.stringify(allCompanies)}

Generate the ICP and analyze the companies found. 
IMPORTANT: If the list of leads found via scraping is empty or contains fewer than 5 high-quality B2B matches, use your internal knowledge to suggest the most relevant B2B companies in ${location} for the ${industry} industry that would be a perfect fit for the ICP.
Provide personalized outreach hooks for the top 5 matches (either from the scraped list or your suggestions).
If website scraping failed, base your analysis on the industry and location provided.
`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text();
      throw new Error(`Anthropic API error: ${anthropicRes.statusText} — ${errBody}`);
    }

    const anthropicData = await anthropicRes.json();
    const rawContent = anthropicData.content[0].text;
    // Extract JSON object from response (handles code fences, trailing text, etc.)
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object found in AI response');
    const result = JSON.parse(jsonMatch[0]);

    res.json(result);

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Failed to perform analysis. ' + error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Local Lead Engine running on http://localhost:${PORT}`);
  console.log(`🔐 Password: ${PASSWORD}`);
});
