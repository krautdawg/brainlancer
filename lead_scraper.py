import httpx
from bs4 import BeautifulSoup
import json
import os
import re
from urllib.parse import urlparse
from dotenv import load_dotenv

load_dotenv()

PPLX_API_KEY = os.getenv("PPLX_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
PPLX_BASE = "https://api.perplexity.ai"

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"


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
    pain_str = ", ".join(pain_signals[:3]) if pain_signals else industry

    prompt = f"""Find 10 real B2B companies that match this Ideal Customer Profile:

Industry: {industry}
Location: {location}
Decision-maker titles: {title_str}
Company size: {company_size_min}–{company_size_max} employees
Key pain points / signals: {pain_str}
ICP summary: {description}

Search the web and return 10 real, specific companies with their actual details.

Return ONLY a JSON array with 10 objects, each with:
{{
  "company_name": "Real Company GmbH",
  "website": "https://example.de",
  "contact_name": "Name if findable, else 'Geschäftsführung'",
  "role": "Job title of best contact",
  "email": "email if publicly findable, else 'N/A'",
  "phone": "phone if publicly findable, else 'N/A'",
  "notes": "1 sentence on why this is a good fit for the ICP"
}}

Only include real companies with real websites. No placeholders."""

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
                        {"role": "system", "content": "You are a B2B sales researcher. Find real companies, return ONLY valid JSON array, no markdown."},
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
                parts = res_text.split("```")
                for part in parts:
                    part = part.strip()
                    if part.startswith("json"):
                        part = part[4:].strip()
                    if part.startswith("["):
                        res_text = part
                        break

            # Find JSON array in response
            match = re.search(r'\[.*\]', res_text, re.DOTALL)
            if match:
                res_text = match.group(0)

            leads = json.loads(res_text)
            print(f"[PPLX] Found {len(leads)} leads")

            # Add source field
            for lead in leads:
                lead['source'] = 'Perplexity Search'
                lead.setdefault('email', 'N/A')
                lead.setdefault('phone', 'N/A')
                lead.setdefault('contact_name', 'Geschäftsführung')
                lead.setdefault('role', 'Management')
                lead.setdefault('notes', f"Matches ICP for {industry} in {location}")

            return leads[:10]

    except Exception as e:
        print(f"[PPLX] Lead search error: {e}")
        return []


async def find_leads(icp_data: dict):
    """Main entry point — use Perplexity to find leads."""
    leads = await perplexity_search_leads(icp_data)

    if not leads:
        print("[PPLX] No leads returned, returning empty list")
        return []

    return leads
