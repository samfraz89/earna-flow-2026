from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import secrets

# AI Integration
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_ALGORITHM = "HS256"

def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]

# Create the main app
app = FastAPI(title="Earna Flow API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============= MODELS =============

class UserBase(BaseModel):
    email: EmailStr
    name: str

class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    created_at: datetime

class Contact(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    role: str
    company: str
    location: str
    email: Optional[str] = None
    phone: Optional[str] = None
    avatar_emoji: str = "👤"
    avatar_url: Optional[str] = None
    auto_signals_count: int = 0
    is_archived: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_id: str

class ContactCreate(BaseModel):
    name: str
    role: str
    company: str
    location: str
    email: Optional[str] = None
    phone: Optional[str] = None
    avatar_emoji: str = "👤"
    avatar_url: Optional[str] = None

class Signal(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    contact_id: str
    signal_type: str  # category id, e.g. life_event, property_activity, meeting_recorded, deal_activity, vehicle_purchase, business_event
    title: str
    description: str
    sub_signal: Optional[str] = None  # specific sub-category, e.g. "New baby", "Buying house", "Quote sent"
    is_auto: bool = True
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_id: str

class SignalCreate(BaseModel):
    signal_type: str
    title: str
    description: str
    sub_signal: Optional[str] = None
    is_auto: bool = False

class Opportunity(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    contact_id: str
    title: str
    description: str
    match_percentage: int
    partner_name: str
    triggered_by: str
    ai_reasoning: List[str]
    is_archived: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_id: str

class AnalyzeResponse(BaseModel):
    status: str
    opportunities: List[dict]
    powered_by: str = "Flow AI"

# ============= AUTH HELPERS =============

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=60),
        "type": "access"
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh"
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return {
            "id": str(user["_id"]),
            "email": user["email"],
            "name": user["name"],
            "role": user.get("role", "user"),
            "created_at": user.get("created_at", datetime.now(timezone.utc))
        }
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ============= AUTH ENDPOINTS =============

@api_router.post("/auth/register")
async def register(user_data: UserCreate, response: Response):
    email = user_data.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed = hash_password(user_data.password)
    user_doc = {
        "email": email,
        "name": user_data.name,
        "password_hash": hashed,
        "role": "user",
        "created_at": datetime.now(timezone.utc)
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    
    return {
        "id": user_id,
        "email": email,
        "name": user_data.name,
        "role": "user",
        "access_token": access_token
    }

@api_router.post("/auth/login")
async def login(user_data: UserLogin, response: Response):
    email = user_data.email.lower()
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not verify_password(user_data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    user_id = str(user["_id"])
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    
    return {
        "id": user_id,
        "email": email,
        "name": user["name"],
        "role": user.get("role", "user"),
        "access_token": access_token
    }

@api_router.get("/auth/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    return user

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out successfully"}

# ============= CONTACTS ENDPOINTS =============

@api_router.get("/contacts")
async def get_contacts(request: Request, include_archived: bool = False):
    user = await get_current_user(request)
    query = {"user_id": user["id"]}
    if not include_archived:
        query["is_archived"] = {"$ne": True}
    contacts = await db.contacts.find(query, {"_id": 0}).to_list(1000)
    return contacts

@api_router.post("/contacts")
async def create_contact(contact_data: ContactCreate, request: Request):
    user = await get_current_user(request)
    contact = Contact(
        **contact_data.dict(),
        user_id=user["id"]
    )
    await db.contacts.insert_one(contact.dict())
    return contact.dict()


@api_router.patch("/contacts/{contact_id}/archive")
async def set_contact_archive(contact_id: str, payload: dict, request: Request):
    user = await get_current_user(request)
    is_archived = bool(payload.get("is_archived", True))
    result = await db.contacts.update_one(
        {"id": contact_id, "user_id": user["id"]},
        {"$set": {"is_archived": is_archived}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"status": "ok", "contact_id": contact_id, "is_archived": is_archived}

# ============= PHONEBOOK (DEMO) =============

PHONEBOOK = [
    {"id": "pb-1", "name": "Olivia Parker", "role": "Mortgage Broker", "company": "Harbour Finance", "location": "Auckland, NZ", "email": "olivia@harbourfinance.co.nz", "phone": "+64 21 555 0101", "avatar_url": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face"},
    {"id": "pb-2", "name": "Liam Nakamura", "role": "Commercial Lawyer", "company": "Kensington Legal", "location": "Wellington, NZ", "email": "liam@kensingtonlegal.co.nz", "phone": "+64 21 555 0102", "avatar_url": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face"},
    {"id": "pb-3", "name": "Sophia Patel", "role": "Family GP", "company": "City Medical Clinic", "location": "Christchurch, NZ", "email": "sophia@citymedical.co.nz", "phone": "+64 21 555 0103", "avatar_url": "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop&crop=face"},
    {"id": "pb-4", "name": "Marcus O'Brien", "role": "Residential Builder", "company": "Kiwi Build Co", "location": "Hamilton, NZ", "email": "marcus@kiwibuild.co.nz", "phone": "+64 21 555 0104", "avatar_url": "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop&crop=face"},
    {"id": "pb-5", "name": "Chloe Wilson", "role": "High School Teacher", "company": "Westside College", "location": "Auckland, NZ", "email": "chloe@westsidecollege.ac.nz", "phone": "+64 21 555 0105", "avatar_url": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop&crop=face"},
    {"id": "pb-6", "name": "Ethan Ramirez", "role": "Senior Accountant", "company": "Ledger & Co", "location": "Wellington, NZ", "email": "ethan@ledger.co.nz", "phone": "+64 21 555 0106", "avatar_url": "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=200&h=200&fit=crop&crop=face"},
    {"id": "pb-7", "name": "Ava Thompson", "role": "Real Estate Agent", "company": "Coastal Realty", "location": "Tauranga, NZ", "email": "ava@coastalrealty.co.nz", "phone": "+64 21 555 0107", "avatar_url": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop&crop=face"},
    {"id": "pb-8", "name": "Noah Kimura", "role": "Insurance Adviser", "company": "ShieldLife NZ", "location": "Auckland, NZ", "email": "noah@shieldlife.co.nz", "phone": "+64 21 555 0108", "avatar_url": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&crop=face"},
    {"id": "pb-9", "name": "Isabella Martinez", "role": "Digital Marketing Lead", "company": "BrightWave Agency", "location": "Queenstown, NZ", "email": "isabella@brightwave.co.nz", "phone": "+64 21 555 0109", "avatar_url": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&h=200&fit=crop&crop=face"},
    {"id": "pb-10", "name": "Jackson Lee", "role": "Startup Founder & CEO", "company": "Orbit Tech", "location": "Auckland, NZ", "email": "jackson@orbittech.co.nz", "phone": "+64 21 555 0110", "avatar_url": "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=200&h=200&fit=crop&crop=face"},
    {"id": "pb-11", "name": "Grace Foster", "role": "Interior Designer", "company": "Haven Studios", "location": "Queenstown, NZ", "email": "grace@havenstudios.co.nz", "phone": "+64 21 555 0111", "avatar_url": "https://images.unsplash.com/photo-1489424731084-a5d8b219a5bb?w=200&h=200&fit=crop&crop=face"},
    {"id": "pb-12", "name": "Daniel Kim", "role": "Financial Planner", "company": "NorthBridge Advisory", "location": "Wellington, NZ", "email": "daniel@northbridge.co.nz", "phone": "+64 21 555 0112", "avatar_url": "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&h=200&fit=crop&crop=face"},
    {"id": "pb-13", "name": "Maya Singh", "role": "Paediatrician", "company": "Children's First", "location": "Christchurch, NZ", "email": "maya@childrensfirst.co.nz", "phone": "+64 21 555 0113", "avatar_url": "https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=200&h=200&fit=crop&crop=face"},
    {"id": "pb-14", "name": "Oscar Bennett", "role": "Civil Engineer", "company": "BuildRight Group", "location": "Dunedin, NZ", "email": "oscar@buildright.co.nz", "phone": "+64 21 555 0114", "avatar_url": "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&h=200&fit=crop&crop=face"},
    {"id": "pb-15", "name": "Hannah Clarke", "role": "Wedding Planner", "company": "Eternal Moments", "location": "Auckland, NZ", "email": "hannah@eternalmoments.co.nz", "phone": "+64 21 555 0115", "avatar_url": "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=200&h=200&fit=crop&crop=face"},
    {"id": "pb-16", "name": "Thomas Reed", "role": "Business Consultant", "company": "Elevate Partners", "location": "Wellington, NZ", "email": "thomas@elevate.co.nz", "phone": "+64 21 555 0116", "avatar_url": "https://images.unsplash.com/photo-1463453091185-61582044d556?w=200&h=200&fit=crop&crop=face"},
    {"id": "pb-17", "name": "Zara Hussain", "role": "Digital Content Creator", "company": "Pixel Collective", "location": "Auckland, NZ", "email": "zara@pixelcollective.co.nz", "phone": "+64 21 555 0117", "avatar_url": "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=200&h=200&fit=crop&crop=face"},
    {"id": "pb-18", "name": "Benjamin Taylor", "role": "Veterinarian", "company": "PetCare Plus", "location": "Hamilton, NZ", "email": "benjamin@petcareplus.co.nz", "phone": "+64 21 555 0118", "avatar_url": "https://images.unsplash.com/photo-1519244703995-f4e0f30006d5?w=200&h=200&fit=crop&crop=face"},
    {"id": "pb-19", "name": "Amelia Scott", "role": "HR Director", "company": "PeopleFirst Group", "location": "Wellington, NZ", "email": "amelia@peoplefirst.co.nz", "phone": "+64 21 555 0119", "avatar_url": "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200&h=200&fit=crop&crop=face"},
    {"id": "pb-20", "name": "Lucas Harris", "role": "Personal Trainer", "company": "FitLife Gym", "location": "Tauranga, NZ", "email": "lucas@fitlife.co.nz", "phone": "+64 21 555 0120", "avatar_url": "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=200&h=200&fit=crop&crop=face"},
    {"id": "pb-21", "name": "Zoe Anderson", "role": "Graphic Designer", "company": "Studio Spark", "location": "Wellington, NZ", "email": "zoe@studiospark.co.nz", "phone": "+64 21 555 0121", "avatar_url": "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&h=200&fit=crop&crop=face"},
    {"id": "pb-22", "name": "Kai Fujimoto", "role": "Architect", "company": "Urban Form Studio", "location": "Auckland, NZ", "email": "kai@urbanform.co.nz", "phone": "+64 21 555 0122", "avatar_url": "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=200&h=200&fit=crop&crop=face&sat=-100"},
    {"id": "pb-23", "name": "Ruby Walsh", "role": "Event Manager", "company": "Elegant Events", "location": "Auckland, NZ", "email": "ruby@elegantevents.co.nz", "phone": "+64 21 555 0123", "avatar_url": "https://images.unsplash.com/photo-1524502397800-2eeaad7c3fe5?w=200&h=200&fit=crop&crop=face"},
    {"id": "pb-24", "name": "Caleb Morgan", "role": "Sales Director", "company": "Apex Industries", "location": "Christchurch, NZ", "email": "caleb@apexindustries.co.nz", "phone": "+64 21 555 0124", "avatar_url": "https://images.unsplash.com/photo-1552058544-f2b08422138a?w=200&h=200&fit=crop&crop=face"},
    {"id": "pb-25", "name": "Nina Petrov", "role": "Translator", "company": "LinguaBridge", "location": "Wellington, NZ", "email": "nina@linguabridge.co.nz", "phone": "+64 21 555 0125", "avatar_url": "https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=200&h=200&fit=crop&crop=face"},
    {"id": "pb-26", "name": "Ryan Murphy", "role": "Solar Installer", "company": "SunPower NZ", "location": "Auckland, NZ", "email": "ryan@sunpower.co.nz", "phone": "+64 21 555 0126", "avatar_url": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&crop=face&sat=-100"},
    {"id": "pb-27", "name": "Layla Hassan", "role": "Dentist", "company": "Smile Dental", "location": "Hamilton, NZ", "email": "layla@smiledental.co.nz", "phone": "+64 21 555 0127", "avatar_url": "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=200&h=200&fit=crop&crop=face"},
    {"id": "pb-28", "name": "Finn O'Connor", "role": "Videographer", "company": "StoryFrame Media", "location": "Queenstown, NZ", "email": "finn@storyframe.co.nz", "phone": "+64 21 555 0128", "avatar_url": "https://images.unsplash.com/photo-1502378735452-bc7d86632805?w=200&h=200&fit=crop&crop=face"},
    {"id": "pb-29", "name": "Elena Rossi", "role": "Chef & Restaurant Owner", "company": "Bella Cucina", "location": "Auckland, NZ", "email": "elena@bellacucina.co.nz", "phone": "+64 21 555 0129", "avatar_url": "https://images.unsplash.com/photo-1619946794135-5bc917a27793?w=200&h=200&fit=crop&crop=face"},
    {"id": "pb-30", "name": "Chen Wang", "role": "Tax Consultant", "company": "TaxSmart NZ", "location": "Auckland, NZ", "email": "chen@taxsmart.co.nz", "phone": "+64 21 555 0130", "avatar_url": "https://images.unsplash.com/photo-1504593811423-6dd665756598?w=200&h=200&fit=crop&crop=face"},
]


@api_router.get("/phonebook")
async def get_phonebook(request: Request):
    user = await get_current_user(request)
    # Return phonebook entries that are NOT already in the user's contacts (match by name)
    existing = await db.contacts.find({"user_id": user["id"]}, {"_id": 0, "name": 1}).to_list(1000)
    existing_names = {c.get("name", "").strip().lower() for c in existing}
    available = [p for p in PHONEBOOK if p["name"].strip().lower() not in existing_names]
    return available

@api_router.get("/contacts/{contact_id}")
async def get_contact(contact_id: str, request: Request):
    user = await get_current_user(request)
    contact = await db.contacts.find_one({"id": contact_id, "user_id": user["id"]}, {"_id": 0})
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact

# ============= SIGNALS ENDPOINTS =============

@api_router.get("/contacts/{contact_id}/signals")
async def get_signals(contact_id: str, request: Request):
    user = await get_current_user(request)
    signals = await db.signals.find({"contact_id": contact_id, "user_id": user["id"]}, {"_id": 0}).sort("timestamp", -1).to_list(100)
    return signals


@api_router.delete("/contacts/{contact_id}/signals/{signal_id}")
async def delete_signal(contact_id: str, signal_id: str, request: Request):
    user = await get_current_user(request)
    signal = await db.signals.find_one({"id": signal_id, "contact_id": contact_id, "user_id": user["id"]})
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    await db.signals.delete_one({"id": signal_id, "contact_id": contact_id, "user_id": user["id"]})
    if signal.get("is_auto"):
        await db.contacts.update_one(
            {"id": contact_id, "user_id": user["id"]},
            {"$inc": {"auto_signals_count": -1}}
        )
    return {"status": "deleted", "signal_id": signal_id}

@api_router.post("/contacts/{contact_id}/signals")
async def create_signal(contact_id: str, signal_data: SignalCreate, request: Request):
    user = await get_current_user(request)
    # Verify contact exists
    contact = await db.contacts.find_one({"id": contact_id, "user_id": user["id"]})
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    signal = Signal(
        **signal_data.dict(),
        contact_id=contact_id,
        user_id=user["id"]
    )
    await db.signals.insert_one(signal.dict())
    
    # Update contact's auto_signals_count
    if signal_data.is_auto:
        await db.contacts.update_one(
            {"id": contact_id},
            {"$inc": {"auto_signals_count": 1}}
        )
    
    return signal.dict()

# ============= AI ANALYSIS ENDPOINT =============

@api_router.post("/contacts/{contact_id}/analyze")
async def analyze_contact(contact_id: str, request: Request):
    user = await get_current_user(request)
    
    # Get contact
    contact = await db.contacts.find_one({"id": contact_id, "user_id": user["id"]}, {"_id": 0})
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    # Get signals
    signals = await db.signals.find({"contact_id": contact_id, "user_id": user["id"]}, {"_id": 0}).to_list(100)
    
    # If no signals, return empty
    if not signals:
        return {
            "status": "ready",
            "opportunities": [],
            "powered_by": "Flow AI"
        }
    
    # Build context for AI
    signals_text = "\n".join([
        f"- [{s['signal_type']}] {s['title']}"
        + (f" — Sub-signal: {s['sub_signal']}" if s.get('sub_signal') else "")
        + f" | Detail: {s.get('description', '')}"
        + f" (Auto: {s.get('is_auto', False)})"
        for s in signals
    ])
    
    prompt = f"""You are an AI relationship intelligence system that detects referral opportunities.

Contact: {contact['name']}
Role: {contact['role']}
Company: {contact['company']}
Location: {contact['location']}

Recent Signals:
{signals_text}

Based on these signals, identify 1-2 referral opportunities. For each opportunity:
1. Suggest a partner type (e.g., Mortgage Broker, Insurance Adviser, Accountant, Real Estate Agent)
2. Provide a match percentage (75-95%)
3. Give a brief description (1 sentence max)
4. List EXACTLY 3 ai_reasoning bullet points. Each bullet MUST be a maximum of 4 words (very concise punchy phrases, no full sentences)

Respond in this exact JSON format:
{{
  "opportunities": [
    {{
      "title": "Opportunity Title",
      "description": "Brief one-sentence description",
      "match_percentage": 92,
      "partner_name": "Partner Company Name",
      "triggered_by": "Signal that triggered this",
      "ai_reasoning": ["Max 4 words", "Max 4 words", "Max 4 words"]
    }}
  ]
}}

Only respond with valid JSON, no other text."""

    try:
        # Use Emergent LLM
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        chat = LlmChat(
            api_key=api_key,
            session_id=f"analyze-{contact_id}-{uuid.uuid4()}",
            system_message="You are an AI that analyzes relationship signals and detects referral opportunities. Always respond with valid JSON only."
        ).with_model("openai", "gpt-5.2")
        
        user_message = UserMessage(text=prompt)
        response_text = await chat.send_message(user_message)
        
        # Parse JSON response
        import json
        # Clean response - remove markdown code blocks if present
        clean_response = response_text.strip()
        if clean_response.startswith("```"):
            clean_response = clean_response.split("```")[1]
            if clean_response.startswith("json"):
                clean_response = clean_response[4:]
        clean_response = clean_response.strip()
        
        ai_response = json.loads(clean_response)
        opportunities = ai_response.get("opportunities", [])
        
        # Archive previous opportunities before storing new ones
        await db.opportunities.update_many(
            {"contact_id": contact_id, "user_id": user["id"], "is_archived": {"$ne": True}},
            {"$set": {"is_archived": True}}
        )
        
        # Store opportunities
        for opp in opportunities:
            opportunity = Opportunity(
                contact_id=contact_id,
                title=opp.get("title", "Opportunity"),
                description=opp.get("description", ""),
                match_percentage=opp.get("match_percentage", 85),
                partner_name=opp.get("partner_name", "Partner"),
                triggered_by=opp.get("triggered_by", "Signal"),
                ai_reasoning=opp.get("ai_reasoning", []),
                user_id=user["id"]
            )
            await db.opportunities.insert_one(opportunity.dict())
        
        return {
            "status": "ready",
            "opportunities": opportunities,
            "powered_by": "Flow AI"
        }
    except Exception as e:
        logger.error(f"AI analysis error: {str(e)}")
        # Return mock data on error
        return {
            "status": "ready",
            "opportunities": [
                {
                    "title": "Insurance Cross-Sell",
                    "description": "Client activity suggests insurance needs",
                    "match_percentage": 89,
                    "partner_name": "Shield Insurance Partners",
                    "triggered_by": signals[0]["title"] if signals else "Recent Activity",
                    "ai_reasoning": [
                        "High client engagement detected",
                        "Activity pattern matches insurance timing",
                        "Strong conversion potential"
                    ]
                }
            ],
            "powered_by": "Flow AI"
        }

# ============= OPPORTUNITIES ENDPOINTS =============

@api_router.get("/contacts/{contact_id}/opportunities")
async def get_opportunities(contact_id: str, request: Request):
    user = await get_current_user(request)
    opportunities = await db.opportunities.find({"contact_id": contact_id, "user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    # Enforce: max 3 reasoning bullets, each max 4 words; triggered_by max 4 words
    import re
    def _short(text, max_words=4):
        words = str(text or "").split()
        phrase = " ".join(words[:max_words])
        phrase = re.sub(r"[;,:.\-\u2014\u2013]+$", "", phrase).strip()
        return phrase
    for opp in opportunities:
        reasoning = opp.get("ai_reasoning", []) or []
        trimmed = [_short(r) for r in reasoning[:3]]
        opp["ai_reasoning"] = trimmed
        opp["triggered_by"] = _short(opp.get("triggered_by", ""))
    return opportunities

# ============= SEED DATA ENDPOINT =============

@api_router.post("/seed")
async def seed_demo_data(request: Request):
    user = await get_current_user(request)
    user_id = user["id"]
    
    # Check if already seeded
    existing = await db.contacts.find_one({"user_id": user_id})
    if existing:
        return {"message": "Demo data already exists"}
    
    # Create demo contacts with exact emojis from Figma design
    demo_contacts = [
        {
            "id": str(uuid.uuid4()),
            "name": "Sarah Mitchell",
            "role": "Real Estate Agent",
            "company": "Premier Properties",
            "location": "Auckland, NZ",
            "email": "sarah@premierproperties.co.nz",
            "phone": "+64 21 123 4567",
            "avatar_emoji": "👩‍💼",
            "auto_signals_count": 3,
            "created_at": datetime.now(timezone.utc),
            "user_id": user_id
        },
        {
            "id": str(uuid.uuid4()),
            "name": "James Chen",
            "role": "Mortgage Adviser",
            "company": "Finance First",
            "location": "Wellington, NZ",
            "email": "james@financefirst.co.nz",
            "phone": "+64 21 234 5678",
            "avatar_emoji": "👨‍💻",
            "auto_signals_count": 2,
            "created_at": datetime.now(timezone.utc),
            "user_id": user_id
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Emma Rodriguez",
            "role": "Senior Accountant",
            "company": "Numbers Pro",
            "location": "Christchurch, NZ",
            "email": "emma@numberspro.co.nz",
            "phone": "+64 21 345 6789",
            "avatar_emoji": "👩‍💼",
            "auto_signals_count": 2,
            "created_at": datetime.now(timezone.utc),
            "user_id": user_id
        }
    ]
    
    await db.contacts.insert_many(demo_contacts)
    
    # Create demo signals for Sarah
    sarah_id = demo_contacts[0]["id"]
    sarah_signals = [
        {
            "id": str(uuid.uuid4()),
            "contact_id": sarah_id,
            "signal_type": "property_listed",
            "title": "Property Listed",
            "description": "Client listing property at $1.2M",
            "is_auto": True,
            "timestamp": datetime.now(timezone.utc) - timedelta(hours=2),
            "user_id": user_id
        },
        {
            "id": str(uuid.uuid4()),
            "contact_id": sarah_id,
            "signal_type": "meeting_scheduled",
            "title": "Meeting Scheduled",
            "description": "Property inspection tomorrow 10am",
            "is_auto": True,
            "timestamp": datetime.now(timezone.utc) - timedelta(days=1),
            "user_id": user_id
        },
        {
            "id": str(uuid.uuid4()),
            "contact_id": sarah_id,
            "signal_type": "high_activity",
            "title": "High Activity",
            "description": "Multiple client interactions this week",
            "is_auto": True,
            "timestamp": datetime.now(timezone.utc) - timedelta(days=3),
            "user_id": user_id
        }
    ]
    
    # Create demo signals for James
    james_id = demo_contacts[1]["id"]
    james_signals = [
        {
            "id": str(uuid.uuid4()),
            "contact_id": james_id,
            "signal_type": "deal_stage_change",
            "title": "Deal Stage Change",
            "description": "Pre-approval completed for $850K",
            "is_auto": True,
            "timestamp": datetime.now(timezone.utc) - timedelta(hours=4),
            "user_id": user_id
        },
        {
            "id": str(uuid.uuid4()),
            "contact_id": james_id,
            "signal_type": "email_engagement",
            "title": "Email Engagement",
            "description": "Client opened insurance inquiry email",
            "is_auto": True,
            "timestamp": datetime.now(timezone.utc) - timedelta(days=1),
            "user_id": user_id
        }
    ]
    
    await db.signals.insert_many(sarah_signals + james_signals)
    
    return {"message": "Demo data seeded successfully", "contacts": len(demo_contacts), "signals": len(sarah_signals) + len(james_signals)}

# ============= STARTUP EVENTS =============

@app.on_event("startup")
async def startup_event():
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.contacts.create_index([("user_id", 1), ("id", 1)])
    await db.signals.create_index([("contact_id", 1), ("user_id", 1)])
    await db.opportunities.create_index([("contact_id", 1), ("user_id", 1)])
    
    # Seed admin user
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@earnaflow.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        hashed = hash_password(admin_password)
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hashed,
            "name": "Admin",
            "role": "admin",
            "created_at": datetime.now(timezone.utc)
        })
        logger.info(f"Admin user created: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}}
        )
        logger.info(f"Admin password updated for: {admin_email}")

# Include the router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
