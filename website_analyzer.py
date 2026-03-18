import httpx
from bs4 import BeautifulSoup
import json
import os
from dotenv import load_dotenv

load_dotenv()

PPLX_API_KEY = os.getenv("PPLX_API_KEY")
PPLX_BASE = "https://api.perplexity.ai"

async def scrape_website_content(url: str) -> str:
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True, headers=headers) as client:
        try:
            response = await client.get(url)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')
            for tag in soup(["script", "style", "nav", "footer"]):
                tag.decompose()
            blocks = []
            if soup.title:
                blocks.append(f"Title: {soup.title.string}")
            meta = soup.find("meta", attrs={"name": "description"})
            if meta:
                blocks.append(f"Description: {meta.get('content', '')}")
            for h in soup.find_all(['h1', 'h2', 'h3'])[:8]:
                t = h.get_text().strip()
                if t:
                    blocks.append(t)
            for p in soup.find_all('p')[:12]:
                t = p.get_text().strip()
                if t:
                    blocks.append(t)
            return "\n".join(blocks)[:3000]
        except Exception as e:
            print(f"Error scraping {url}: {e}")
            return f"Could not fetch {url}"

async def analyze_website(url: str):
    """Scrape website + use Perplexity with web search to generate rich ICP."""
    content = await scrape_website_content(url)

    prompt = f"""Analyze this company's website and use web search to find additional information about them.

Website URL: {url}
Website Content:
{content}

Based on this, generate a detailed B2B Ideal Customer Profile (ICP) — who are their best potential customers?

Return ONLY valid JSON with these exact keys:
{{
  "company_name": "name of the company at {url}",
  "industry": "the industry their ideal customers are in",
  "titles": ["Job Title 1", "Job Title 2", "Job Title 3"],
  "location": "target location/region (e.g. Germany, Berlin, DACH)",
  "company_size_min": 5,
  "company_size_max": 200,
  "pain_signals": ["pain point 1", "pain point 2", "pain point 3"],
  "description": "2-3 sentence summary of ideal customer profile"
}}"""

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{PPLX_BASE}/chat/completions",
                headers={
                    "Authorization": f"Bearer {PPLX_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "sonar",
                    "messages": [
                        {"role": "system", "content": "You are a B2B marketing strategist. Output ONLY valid JSON, no markdown."},
                        {"role": "user", "content": prompt}
                    ],
                    "max_tokens": 1024,
                    "temperature": 0.2
                }
            )
            response.raise_for_status()
            data = response.json()
            res_text = data["choices"][0]["message"]["content"].strip()

            # Strip markdown if present
            if "```" in res_text:
                res_text = res_text.split("```")[1]
                if res_text.startswith("json"):
                    res_text = res_text[4:]
                res_text = res_text.strip()

            icp_data = json.loads(res_text)
            icp_data['website_url'] = url
            print(f"[PPLX] ICP generated for {url}: {icp_data.get('company_name')}")
            return icp_data

    except Exception as e:
        print(f"[PPLX] Error generating ICP: {e}")
        return None
