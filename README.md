# Local Lead Engine MVP

AI-Powered B2B Lead Generation Demo - Built for KI Katapult

## Features

- 🎯 **ICP Analysis**: Define your ideal customer profile
- 🔍 **Lead Discovery**: AI-powered scanning across multiple sources
- 📧 **Lead Enrichment**: Personalized email drafts and follow-up timelines
- 📊 **CRM Dashboard**: Track pipeline and performance metrics
- 🔐 **Password Protection**: Secure demo access
- 🐳 **Docker Ready**: Easy deployment

## Quick Start

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open browser to `http://localhost:3000`

4. Login with password: `brainlancer2026`

### Docker Deployment

1. Build the image:
```bash
docker build -t local-lead-engine .
```

2. Run the container:
```bash
docker run -p 3000:3000 -e APP_PASSWORD=brainlancer2026 local-lead-engine
```

3. Access at `http://localhost:3000`

## Environment Variables

- `PORT`: Server port (default: 3000)
- `APP_PASSWORD`: Login password (default: brainlancer2026)
- `SESSION_SECRET`: Session encryption key (auto-generated if not set)
- `NODE_ENV`: Environment mode (production/development)

## Tech Stack

- **Backend**: Node.js + Express
- **Frontend**: HTML5 + Tailwind CSS
- **Fonts**: Inter + Lexend (Google Fonts)
- **Session**: express-session with cookie-parser

## Demo Data

All lead data is hardcoded for demo purposes, featuring German B2B companies from:
- Potsdam, Brandenburg
- Berlin
- Werder (Havel)
- Falkensee

## Security

- Session-based authentication
- Password-protected access
- HTTP-only cookies
- Express security best practices

## License

MIT License - Built by KI Katapult

---

**Powered by KI Katapult** 🚀
