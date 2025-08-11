## SumViz – Local Setup

### 1) Prerequisites
- Node 18+ and npm

### 2) Install dependencies
```bash
npm install
```

### 3) Environment variables
Create a `.env.local` in the project root using this template:
```env
# NextAuth
AUTH_SECRET=replace-with-random-string
AUTH_GOOGLE_ID=your-google-oauth-client-id
AUTH_GOOGLE_SECRET=your-google-oauth-client-secret

# OpenAI
OPENAI_API_KEY=sk-...

# Prisma/SQLite
DATABASE_URL="file:./prisma/dev.db"
```

Notes:
- Generate `AUTH_SECRET` with `openssl rand -base64 32` or an online random string generator.
- For Google OAuth, set Authorized redirect URI to `http://localhost:3000/api/auth/callback/google`.

### 4) Database
```bash
npx prisma migrate deploy
# or, to reset locally:
npx prisma migrate reset --force
```

### 5) Run the dev server
```bash
npm run dev
```
Visit `http://localhost:3000`.

### 6) Usage
- Sign in with Google on the Dashboard.
- Upload a CSV. Then click “Generate insights”.

### Tech
- Next.js App Router, NextAuth with Prisma Adapter (SQLite), OpenAI API
