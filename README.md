# PDF Processing with OpenAI

A monorepo containing a FastAPI backend and Next.js frontend for processing PDF files with OpenAI vision models.

## Structure

- `backend/` - FastAPI Python backend
- `frontend/` - Next.js TypeScript frontend

## Local Development

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Deployment

- **Frontend**: Deploy to Vercel
- **Backend**: Deploy to Render