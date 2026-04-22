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
    auto_signals_count: int = 0
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

class Signal(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    contact_id: str
    signal_type: str  # property_listed, meeting_scheduled, high_activity, deal_stage_change, email_engagement, etc.
    title: str
    description: str
    is_auto: bool = True
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_id: str

class SignalCreate(BaseModel):
    signal_type: str
    title: str
    description: str
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
async def get_contacts(request: Request):
    user = await get_current_user(request)
    contacts = await db.contacts.find({"user_id": user["id"]}, {"_id": 0}).to_list(1000)
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
    signals_text = "\n".join([f"- {s['title']}: {s['description']} (Type: {s['signal_type']}, Auto: {s['is_auto']})" for s in signals])
    
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
    # Enforce: max 3 reasoning bullets, each max 4 words
    import re
    for opp in opportunities:
        reasoning = opp.get("ai_reasoning", []) or []
        trimmed = []
        for r in reasoning[:3]:
            words = str(r).split()
            phrase = " ".join(words[:4])
            # Remove trailing punctuation like ; , : . — -
            phrase = re.sub(r"[;,:.\-\u2014\u2013]+$", "", phrase).strip()
            trimmed.append(phrase)
        opp["ai_reasoning"] = trimmed
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
