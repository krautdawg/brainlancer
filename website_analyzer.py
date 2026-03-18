import httpx
from bs4 import BeautifulSoup
import anthropic
import json
import os
from dotenv import load_dotenv

load_dotenv()

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

async def scrape_website_content(url: str) -> str:
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        try:
            response = await client.get(url)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Remove script and style elements
            for script_or_style in soup(["script", "style"]):
                script_or_style.decompose()

            # Extract meaningful text
            text_blocks = []
            
            # Title & Meta Description
            if soup.title:
                text_blocks.append(f"Title: {soup.title.string}")
            
            meta_desc = soup.find("meta", attrs={"name": "description"})
            if meta_desc:
                text_blocks.append(f"Meta Description: {meta_desc.get('content')}")

            # Headings
            for h in soup.find_all(['h1', 'h2', 'h3']):
                text_blocks.append(h.get_text().strip())

            # Paragraphs (limit to first few to avoid bloat)
            for p in soup.find_all('p')[:10]:
                text_blocks.append(p.get_text().strip())

            return "\n".join([b for b in text_blocks if b])
        except Exception as e:
            print(f"Error scraping {url}: {e}")
            return f"Error: Could not fetch website content for {url}"

async def generate_icp(url: str, content: str):
    prompt = f"""
    Analyze this B2B company's website content. Generate an Ideal Customer Profile (ICP) for who their best customers would be.
    Return JSON with: company_name, industry, titles (array of job titles to target), location (their operating region), company_size_min, company_size_max, pain_signals (array of keywords/phrases their ideal customers would search for), description (2-3 sentence ICP summary).

    Website Content:
    {content}
    """
    
    try:
        response = client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=1024,
            messages=[
                {"role": "user", "content": prompt}
            ],
            system="You are an expert B2B marketing strategist. Output ONLY valid JSON."
        )
        
        # Extract JSON from response
        res_text = response.content[0].text
        # Clean up in case Claude adds markdown
        if "```json" in res_text:
            res_text = res_text.split("```json")[1].split("```")[0].strip()
        
        icp_data = json.loads(res_text)
        icp_data['website_url'] = url
        icp_data['raw_ai_output'] = res_text
        return icp_data
    except Exception as e:
        print(f"Error generating ICP: {e}")
        return None

async def analyze_website(url: str):
    content = await scrape_website_content(url)
    return await generate_icp(url, content)
