import httpx
from bs4 import BeautifulSoup
import anthropic
import json
import os
import re
from urllib.parse import quote, urlparse
from dotenv import load_dotenv

load_dotenv()

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"

async def google_search(query: str, num_results: int = 5):
    encoded_query = quote(query)
    url = f"https://www.google.com/search?q={encoded_query}&num={num_results}"
    
    async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT}, timeout=10.0) as client:
        try:
            response = await client.get(url)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')
            
            results = []
            for g in soup.find_all('div', class_='g'):
                anchors = g.find_all('a')
                if anchors:
                    link = anchors[0]['href']
                    if link.startswith('http'):
                        results.append(link)
            return results
        except Exception as e:
            print(f"Error searching Google for query '{query}': {e}")
            return []

async def extract_lead_info(url: str):
    async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT}, timeout=10.0, follow_redirects=True) as client:
        try:
            response = await client.get(url)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')
            
            domain = urlparse(url).netloc
            company_name = domain.replace("www.", "").split(".")[0].capitalize()
            if soup.title:
                company_name = soup.title.string.split("|")[0].split("-")[0].strip()

            emails = list(set(re.findall(r"[a-z0-9\.\-+_]+@[a-z0-9\.\-+_]+\.[a-z]+", response.text.lower())))
            # Filter out some common non-personal emails
            emails = [e for e in emails if not e.endswith(('.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'))]

            phones = list(set(re.findall(r"[\+\(]?[1-9][0-9 .\-\(\)]{8,15}[0-9]", response.text)))
            
            # Simple heuristic for contact name
            contact_name = "Contact Person"
            role = "Management"
            
            # Try to find About/Team page
            about_links = soup.find_all('a', href=re.compile(r"about|team|uber-uns|team", re.I))
            
            # Extract some text for AI summary
            text_snippet = soup.get_text()[:2000].strip()

            return {
                "company_name": company_name,
                "contact_name": contact_name,
                "role": role,
                "email": emails[0] if emails else "N/A",
                "phone": phones[0] if phones else "N/A",
                "website": url,
                "snippet": text_snippet
            }
        except Exception as e:
            print(f"Error extracting info from {url}: {e}")
            return None

async def generate_lead_note(lead: dict, icp: dict):
    prompt = f"""
    Generate a 1-sentence note for a B2B lead. 
    Explain why this company ({lead['company_name']}) is a good prospect for our client ({icp.get('company_name', 'our client')}) based on their ICP.
    
    Lead Info: {lead['snippet'][:500]}
    ICP Info: {icp['description']}
    
    Output ONLY the one sentence.
    """
    
    try:
        response = client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=100,
            messages=[{"role": "user", "content": prompt}],
            system="You are a B2B sales development expert."
        )
        return response.content[0].text.strip()
    except Exception:
        return f"Potentially interested in {icp.get('industry', 'industry')} solutions."

async def find_leads(icp_data: dict):
    titles = icp_data.get('titles', [])
    industry = icp_data.get('industry', '')
    location = icp_data.get('location', '')
    pain_signals = icp_data.get('pain_signals', [])

    # Build queries
    queries = [
        f'"{titles[0]}" "{industry}" "{location}" email contact' if titles else f'"{industry}" "{location}" email contact',
        f'"{pain_signals[0]}" companies {location}' if pain_signals else f'{industry} companies {location}',
        f'site:linkedin.com/company "{industry}" "{location}"'
    ]

    all_urls = []
    for q in queries:
        urls = await google_search(q, num_results=5)
        all_urls.extend(urls)
    
    # Deduplicate and filter out LinkedIn links (for now, focus on company sites)
    unique_urls = []
    seen_domains = set()
    for url in all_urls:
        domain = urlparse(url).netloc
        if domain and domain not in seen_domains and "google.com" not in domain and "linkedin.com" not in domain:
            seen_domains.add(domain)
            unique_urls.append(url)

    leads = []
    for url in unique_urls[:10]: # Max 10 leads
        info = await extract_lead_info(url)
        if info:
            note = await generate_lead_note(info, icp_data)
            info['notes'] = note
            info['source'] = 'Google Search'
            leads.append(info)
            
    return leads
