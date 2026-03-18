import httpx
from bs4 import BeautifulSoup
import json
import os
import re
import asyncio
from urllib.parse import urlparse, urljoin
from dotenv import load_dotenv

load_dotenv()

PPLX_API_KEY = os.getenv("PPLX_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
PPLX_BASE = "https://api.perplexity.ai"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
}

# German Impressum / contact page paths to try
IMPRESSUM_PATHS = [
    "/impressum", "/impressum.html", "/impressum.php",
    "/kontakt", "/kontakt.html", "/contact", "/contact.html",
    "/ueber-uns", "/about", "/uber-uns",
]

EMAIL_RE = re.compile(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}')
PHONE_RE = re.compile(r'(?:\+49|0049|0)[\s\-/]?(\d{2,5})[\s\-/]?(\d{3,}[\d\s\-/]*)')
NAME_RE  = re.compile(
    r'(?:Geschäftsführer(?:in)?|Inhaber(?:in)?|CEO|Managing Director|Gründer(?:in)?|Founder)[:\s]+([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+){1,3})',
    re.IGNORECASE
)


def clean_phone(raw: str) -> str:
    digits = re.sub(r'[^\d+]', '', raw)
    if digits.startswith('0049'):
        digits = '+49' + digits[4:]
    elif digits.startswith('00'):
        digits = '+' + digits[2:]
    return digits


async def scrape_impressum(website: str, client: httpx.AsyncClient) -> dict:
    """Try to scrape Impressum/contact page and extract name, email, phone."""
    base = website.rstrip('/')
    parsed = urlparse(base)
    if not parsed.scheme:
        base = 'https://' + base

    found = {"email": None, "phone": None, "contact_name": None, "impressum_url": None}

    for path in IMPRESSUM_PATHS:
        url = base + path
        try:
            r = await client.get(url, headers=HEADERS, timeout=8.0, follow_redirects=True)
            if r.status_code != 200:
                continue

            text = r.text
            soup = BeautifulSoup(text, 'html.parser')

            # Remove script/style noise
            for tag in soup(['script', 'style', 'nav', 'footer', 'header']):
                tag.decompose()
            body = soup.get_text(separator='\n')

            # Extract email
            emails = EMAIL_RE.findall(body)
            # Filter out common non-contact emails
            ignored = {'noreply', 'no-reply', 'mailer', 'postmaster', 'webmaster', 'support'}
            real_emails = [e for e in emails if not any(x in e.lower() for x in ignored)]
            if real_emails and not found["email"]:
                found["email"] = real_emails[0]

            # Extract phone
            phones = PHONE_RE.findall(body)
            if phones and not found["phone"]:
                raw = phones[0][0] + phones[0][1]
                found["phone"] = clean_phone('0' + raw)

            # Extract contact name
            names = NAME_RE.findall(body)
            if names and not found["contact_name"]:
                found["contact_name"] = names[0].strip()

            if found["email"] or found["phone"]:
                found["impressum_url"] = url
                print(f"[Impressum] ✓ {base}{path} → email={found['email']} phone={found['phone']} name={found['contact_name']}")
                break  # found enough, stop trying paths

        except Exception as e:
            print(f"[Impressum] ✗ {url}: {e}")
            continue

    return found


async def enrich_lead_with_impressum(lead: dict, client: httpx.AsyncClient) -> dict:
    """Enrich a single lead with Impressum contact data."""
    website = lead.get('website', '')
    if not website or website == 'N/A':
        return lead

    data = await scrape_impressum(website, client)

    # Only overwrite if we found something better
    if data["email"] and lead.get("email") in (None, "N/A", ""):
        lead["email"] = data["email"]
    if data["phone"] and lead.get("phone") in (None, "N/A", ""):
        lead["phone"] = data["phone"]
    if data["contact_name"] and lead.get("contact_name") in (None, "N/A", "Geschäftsführung", ""):
        lead["contact_name"] = data["contact_name"]
    if data["impressum_url"]:
        lead["impressum_url"] = data["impressum_url"]

    return lead


async def perplexity_search_leads(icp_data: dict) -> list[dict]:
    """Use Perplexity web search to find real B2B leads matching the ICP."""
    industry = icp_data.get('industry', '')
    location = icp_data.get('location', '')
    titles = icp_data.get('titles', ['CEO', 'Geschäftsführer'])
    company_size_min = icp_data.get('company_size_min', 5)
    company_size_max = icp_data.get('company_size_max', 200)
    pain_signals = icp_data.get('pain_signals', [])
    description = icp_data.get('description', '')

    title_str = ", ".join(titles[:3])
    pain_str  = ", ".join(pain_signals[:3]) if pain_signals else industry

    prompt = f"""Find 10 real B2B companies that match this Ideal Customer Profile:

Industry: {industry}
Location: {location}
Decision-maker titles: {title_str}
Company size: {company_size_min}–{company_size_max} employees
Key pain points / signals: {pain_str}
ICP summary: {description}

Search the web and return 10 real, specific companies with their actual websites.

Return ONLY a JSON array with 10 objects, each with:
{{
  "company_name": "Real Company GmbH",
  "website": "https://example.de",
  "contact_name": "Name if findable, else 'Geschäftsführung'",
  "role": "Job title of best contact",
  "email": "N/A",
  "phone": "N/A",
  "notes": "1 sentence on why this is a good fit for the ICP"
}}

Only real companies with real websites. No placeholders. Leave email/phone as N/A — they will be scraped separately."""

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(
                f"{PPLX_BASE}/chat/completions",
                headers={
                    "Authorization": f"Bearer {PPLX_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "sonar",
                    "messages": [
                        {"role": "system", "content": "You are a B2B sales researcher. Find real companies. Return ONLY valid JSON array, no markdown, no explanation."},
                        {"role": "user", "content": prompt}
                    ],
                    "max_tokens": 2048,
                    "temperature": 0.1
                }
            )
            response.raise_for_status()
            data = response.json()
            res_text = data["choices"][0]["message"]["content"].strip()

            # Strip markdown fences
            if "```" in res_text:
                for part in res_text.split("```"):
                    part = part.strip().lstrip("json").strip()
                    if part.startswith("["):
                        res_text = part
                        break

            match = re.search(r'\[.*\]', res_text, re.DOTALL)
            if match:
                res_text = match.group(0)

            leads = json.loads(res_text)
            print(f"[PPLX] Found {len(leads)} companies")

            for lead in leads:
                lead['source'] = 'Perplexity + Impressum'
                lead.setdefault('email', 'N/A')
                lead.setdefault('phone', 'N/A')
                lead.setdefault('contact_name', 'Geschäftsführung')
                lead.setdefault('role', 'Management')
                lead.setdefault('notes', f"ICP match: {industry} in {location}")

            return leads[:10]

    except Exception as e:
        print(f"[PPLX] Lead search error: {e}")
        return []


async def find_leads(icp_data: dict):
    """Main entry point: Perplexity finds companies → Impressum scraper enriches contact data."""

    # Step 1: Get companies from Perplexity
    leads = await perplexity_search_leads(icp_data)
    if not leads:
        return []

    # Step 2: Enrich all leads in parallel via Impressum scraping
    print(f"[Impressum] Enriching {len(leads)} leads...")
    async with httpx.AsyncClient() as client:
        tasks = [enrich_lead_with_impressum(lead, client) for lead in leads]
        leads = await asyncio.gather(*tasks)

    enriched = sum(1 for l in leads if l.get('email') not in (None, 'N/A'))
    print(f"[Impressum] Enriched {enriched}/{len(leads)} leads with real contact data")

    return list(leads)
