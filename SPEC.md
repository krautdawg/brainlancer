# BrainLancer — Build Spec

## What to Build
A single-page B2B lead generation web app. Python FastAPI backend + single HTML frontend.

## Project Structure
```
brainlancer/
├── app.py                 # FastAPI main (routes, auth, API endpoints)
├── website_analyzer.py    # Scrape client URL → Claude Haiku → ICP JSON
├── lead_scraper.py        # Google search + public directory scraping → leads
├── db.py                  # SQLite (sessions, ICPs, leads)
├── templates/
│   └── index.html         # Single page app (Tailwind + Alpine.js)
├── static/
│   └── (empty for now)
├── requirements.txt
└── Dockerfile
```

## Branding (KI Katapult Style Guide)
- Primary BG: #132A3E (Deep Navy)
- Accent: #00B3FF (Sky Blue — buttons, links, interactive elements)
- Highlight: #00FFC5 (Electric Mint — accents, success states)
- White text on dark backgrounds, #333333 text on light
- Light section backgrounds: #FFFFFF / #F5F5F5
- Font: Inter (Google Fonts) weights 400, 600, 700
- Vibe: Clean, professional, forward-thinking, modern tech

## User Flow (Single Page with Steps)

### Step 0: Login
- Simple password input field
- Server-side check against env var BRAINLANCER_DEMO_PASSWORD
- Sets session cookie on success
- Clean, centered login card on dark navy background

### Step 1: Enter Website URL
- Input field for client's website URL
- "Analyze" button
- Loading state with spinner while AI analyzes
- On success, transitions to Step 2

### Step 2: Review & Edit ICP
- Form with editable fields pre-filled by AI analysis:
  - Company Name (from website)
  - Industry (text input)
  - Target Titles (tag-style input or comma-separated)
  - Location / Region (text input)
  - Company Size Range (min-max number inputs)
  - Pain Signals / Keywords (tag-style or comma-separated)
  - Description (textarea — brief ICP description)
- "Find Leads" button
- Loading state while scraping

### Step 3: CRM / Lead Results
- Table at bottom showing found leads:
  - Company Name
  - Contact Name
  - Role / Title
  - Email
  - Phone
  - Website
  - Notes (AI-generated short summary of what the company does)
- "Export CSV" button
- Credits counter: "Scrapes: X/10 remaining"
- When credits exhausted: "Credits used up — contact us for more"

## Backend API Endpoints

### POST /api/login
- Body: {"password": "..."}
- Sets session cookie
- Returns {"ok": true} or 401

### POST /api/analyze
- Body: {"url": "https://example.com"}
- Requires auth
- Scrapes the URL, sends to Claude Haiku for ICP generation
- Returns ICP JSON:
```json
{
  "company_name": "...",
  "industry": "...",
  "titles": ["CEO", "CTO", ...],
  "location": "...",
  "company_size_min": 10,
  "company_size_max": 200,
  "pain_signals": ["...", "..."],
  "description": "..."
}
```

### POST /api/scrape
- Body: ICP JSON (possibly edited by user)
- Requires auth
- Checks remaining credits
- Runs lead scraper (Google + directories)
- Returns up to 10 leads:
```json
{
  "leads": [
    {
      "company_name": "...",
      "contact_name": "...",
      "role": "...",
      "email": "...",
      "phone": "...",
      "website": "...",
      "notes": "..."
    }
  ],
  "scrapes_remaining": 7
}
```

### GET /api/leads
- Returns all leads for current session

### GET /api/leads/csv
- Returns CSV download of all leads

## Technical Details

### website_analyzer.py
1. Fetch URL with requests + BeautifulSoup
2. Extract: title, meta description, h1-h3 headings, about/services text, location hints
3. Send extracted text to Claude Haiku (anthropic SDK) with prompt:
   "Analyze this B2B company's website content. Generate an Ideal Customer Profile (ICP) for who their best customers would be. Return JSON with: company_name, industry, titles (array of job titles to target), location (their operating region), company_size_min, company_size_max, pain_signals (array of keywords/phrases their ideal customers would search for), description (2-3 sentence ICP summary)."
4. Parse Claude's JSON response, return structured ICP

### lead_scraper.py
1. Build Google search queries from ICP:
   - "{title}" "{industry}" "{location}" email kontakt
   - "{pain_signal}" companies "{location}"
   - site:linkedin.com/company "{industry}" "{location}"
2. Use requests + BeautifulSoup to parse Google results (with user-agent rotation)
3. For each result URL, try to extract:
   - Company name (from title/meta)
   - Contact info from /impressum, /kontakt, /about, /team pages
   - Email addresses (regex pattern matching)
   - Phone numbers
4. Also try known directories:
   - gelbeseiten.de search results
   - wlw.de (Wer liefert was)
5. Use Claude Haiku to generate a brief "notes" summary for each lead
6. Deduplicate by domain
7. Return max 10 leads per scrape

### db.py (SQLite)
```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    scrapes_remaining INTEGER DEFAULT 10
);

CREATE TABLE icps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT REFERENCES sessions(id),
    website_url TEXT,
    company_name TEXT,
    industry TEXT,
    titles TEXT,
    location TEXT,
    company_size_min INTEGER,
    company_size_max INTEGER,
    pain_signals TEXT,
    description TEXT,
    raw_ai_output TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT REFERENCES sessions(id),
    icp_id INTEGER REFERENCES icps(id),
    company_name TEXT,
    contact_name TEXT,
    role TEXT,
    email TEXT,
    phone TEXT,
    website TEXT,
    notes TEXT,
    source TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Auth
- Password from env var: BRAINLANCER_DEMO_PASSWORD (default: "brainlancer2026")
- Session stored in signed cookie (FastAPI SessionMiddleware)
- Session ID = UUID, stored in sessions table

### Frontend (index.html)
- Single page, no framework build step
- Tailwind CSS via CDN
- Alpine.js for reactivity (CDN)
- Step-by-step wizard UI
- Clean modern design following KI Katapult brand
- Responsive (mobile-friendly)
- Smooth transitions between steps
- Loading spinners during API calls
- Toast notifications for errors
- The page should look STUNNING — this is a demo to impress potential clients

### Dockerfile
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
```

### requirements.txt
```
fastapi
uvicorn[standard]
httpx
beautifulsoup4
anthropic
itsdangerous
jinja2
python-multipart
```

## IMPORTANT DESIGN NOTES
- The page MUST look professional and polished — like a real SaaS product
- Use subtle animations (fade-in for steps, loading spinners)
- The CRM table should be clean with hover states
- Mobile responsive
- Dark navy hero section at top, white/light gray sections below
- Gradient accents using the brand colors
- Icons from Heroicons (inline SVG) or similar
- The "BrainLancer" logo text should use the brand font with a subtle brain/rocket emoji or icon
