import os
import csv
import io
from fastapi import FastAPI, Request, HTTPException, Depends, Form, Cookie
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from itsdangerous import URLSafeSerializer
import db
import website_analyzer
import lead_scraper
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="BrainLancer")
templates = Jinja2Templates(directory="templates")

@app.on_event("startup")
async def startup():
    db.init_db()

# Security
SECRET_KEY = os.getenv("SECRET_KEY", "brainlancer-secret-2026")
DEMO_PASSWORD = os.getenv("BRAINLANCER_DEMO_PASSWORD", "brainlancer2026")
serializer = URLSafeSerializer(SECRET_KEY)

# Session Helper
def get_session_id(request: Request):
    session_cookie = request.cookies.get("session_id")
    if not session_cookie:
        return None
    try:
        return serializer.loads(session_cookie)
    except:
        return None

def set_session_cookie(response: JSONResponse, session_id: str):
    token = serializer.dumps(session_id)
    response.set_cookie(key="session_id", value=token, httponly=True)

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    session_id = get_session_id(request)
    is_logged_in = False
    scrapes_remaining = 0
    if session_id:
        session = db.get_session(session_id)
        if session:
            is_logged_in = True
            scrapes_remaining = session['scrapes_remaining']
    
    return templates.TemplateResponse("index.html", {
        "request": request,
        "is_logged_in": is_logged_in,
        "scrapes_remaining": scrapes_remaining
    })

@app.post("/api/login")
async def login(data: dict):
    password = data.get("password")
    if password == DEMO_PASSWORD:
        session_id = db.create_session()
        response = JSONResponse({"ok": True})
        set_session_cookie(response, session_id)
        return response
    raise HTTPException(status_code=401, detail="Invalid password")

@app.post("/api/analyze")
async def analyze(request: Request, data: dict):
    session_id = get_session_id(request)
    if not session_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    url = data.get("url")
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    
    icp_data = await website_analyzer.analyze_website(url)
    if not icp_data:
        raise HTTPException(status_code=500, detail="Failed to analyze website")
    
    return icp_data

@app.post("/api/scrape")
async def scrape(request: Request, icp_data: dict):
    session_id = get_session_id(request)
    if not session_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session = db.get_session(session_id)
    if not session or session['scrapes_remaining'] <= 0:
        raise HTTPException(status_code=403, detail="No scrapes remaining")
    
    # Save ICP
    icp_id = db.save_icp(session_id, icp_data)
    
    # Run Scraper
    leads = await lead_scraper.find_leads(icp_data)
    
    # Save Leads
    db.save_leads(session_id, icp_id, leads)
    
    # Update Scrapes
    new_remaining = session['scrapes_remaining'] - 1
    db.update_scrapes(session_id, new_remaining)
    
    return {"leads": leads, "scrapes_remaining": new_remaining}

@app.get("/api/leads")
async def get_leads(request: Request):
    session_id = get_session_id(request)
    if not session_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    leads = db.get_leads_for_session(session_id)
    return [dict(l) for l in leads]

@app.get("/api/leads/csv")
async def get_leads_csv(request: Request):
    session_id = get_session_id(request)
    if not session_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    leads = db.get_leads_for_session(session_id)
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Company Name", "Contact Name", "Role", "Email", "Phone", "Website", "Notes"])
    
    for lead in leads:
        writer.writerow([
            lead['company_name'], lead['contact_name'], lead['role'],
            lead['email'], lead['phone'], lead['website'], lead['notes']
        ])
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leads.csv"}
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
