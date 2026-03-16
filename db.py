import sqlite3
import os
import uuid
from datetime import datetime

DB_PATH = "brainlancer.db"

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                scrapes_remaining INTEGER DEFAULT 10
            );

            CREATE TABLE IF NOT EXISTS icps (
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

            CREATE TABLE IF NOT EXISTS leads (
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
        """)

def create_session():
    session_id = str(uuid.uuid4())
    with get_db() as conn:
        conn.execute("INSERT INTO sessions (id) VALUES (?)", (session_id,))
    return session_id

def get_session(session_id):
    with get_db() as conn:
        return conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()

def update_scrapes(session_id, remaining):
    with get_db() as conn:
        conn.execute("UPDATE sessions SET scrapes_remaining = ? WHERE id = ?", (remaining, session_id))

def save_icp(session_id, data):
    with get_db() as conn:
        cursor = conn.execute("""
            INSERT INTO icps (
                session_id, website_url, company_name, industry, titles, 
                location, company_size_min, company_size_max, pain_signals, 
                description, raw_ai_output
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            session_id, data.get('website_url'), data.get('company_name'), 
            data.get('industry'), ",".join(data.get('titles', [])), 
            data.get('location'), data.get('company_size_min'), 
            data.get('company_size_max'), ",".join(data.get('pain_signals', [])), 
            data.get('description'), data.get('raw_ai_output')
        ))
        return cursor.lastrowid

def save_leads(session_id, icp_id, leads_list):
    with get_db() as conn:
        for lead in leads_list:
            conn.execute("""
                INSERT INTO leads (
                    session_id, icp_id, company_name, contact_name, role, 
                    email, phone, website, notes, source
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                session_id, icp_id, lead.get('company_name'), 
                lead.get('contact_name'), lead.get('role'), 
                lead.get('email'), lead.get('phone'), 
                lead.get('website'), lead.get('notes'), lead.get('source')
            ))

def get_leads_for_session(session_id):
    with get_db() as conn:
        return conn.execute("SELECT * FROM leads WHERE session_id = ? ORDER BY created_at DESC", (session_id,)).fetchall()

# Always ensure tables exist
init_db()
