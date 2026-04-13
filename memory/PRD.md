# Earna Flow - Product Requirements Document

## Overview
Earna Flow is an AI-powered Relationship Intelligence mobile application that helps professionals identify referral opportunities by analyzing signals from their contacts.

## App Type
- React Native Expo mobile app
- Full-stack with FastAPI backend and MongoDB database

## Core Features

### 1. Authentication
- JWT-based email/password authentication
- Login, Register, Logout flows
- Protected routes

### 2. Contacts Management
- View list of contacts with key details (name, role, company, location)
- Contact cards showing auto-detected signals count
- Demo data seeding functionality

### 3. Signals Tracking
- **Auto-detected signals:** Property Listed, Meeting Scheduled, High Activity, Deal Stage Change, Email Engagement
- **Manual signal types:** Meeting Recorded, Life Event, Property Activity, Deal Activity, Vehicle Purchase, Business Event
- Add signals via bottom sheet modal

### 4. AI-Powered Opportunity Detection
- Analyze contact signals using GPT-5.2 (via Emergent LLM key)
- Generate referral opportunity recommendations
- Match percentages (e.g., 92% match)
- AI reasoning with bullet points
- Triggered-by signal identification
- "Introduce" CTA buttons

### 5. UI/UX Design
- Based on Figma designs matching "Earna Flow" branding
- Three-panel concept adapted for mobile (Contacts, Signals, Flow AI Engine)
- Swiss/High-Contrast design archetype
- Green accent for success/AI states (#059669)
- Blue brand color (#002FA7)

## Tech Stack
- **Frontend:** React Native Expo with Expo Router
- **Backend:** FastAPI
- **Database:** MongoDB
- **AI:** OpenAI GPT-5.2 via Emergent LLM key
- **Auth:** JWT tokens

## Screens
1. Login Screen
2. Register Screen
3. Contacts List (Home)
4. Contact Detail (with Signals and AI Engine panels)
5. Add Signal Modal
6. Profile Screen

## API Endpoints
- `/api/auth/*` - Authentication
- `/api/contacts` - Contacts CRUD
- `/api/contacts/{id}/signals` - Signals
- `/api/contacts/{id}/analyze` - AI Analysis
- `/api/contacts/{id}/opportunities` - Opportunities
- `/api/seed` - Demo data

## Business Enhancement Ideas
- Premium tier with unlimited AI analyses
- Team collaboration features for referral tracking
- Integration with CRM systems
- Analytics dashboard for conversion tracking
