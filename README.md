# FortiesR - Strategy Lab

A comprehensive Freqtrade-based trading strategy discovery, validation, optimization, and export platform with a modern React frontend and Python FastAPI backend.

## Architecture

### Backend
- **Python 3.11+** with FastAPI and uvicorn
- **AutoQuant Pipeline**: Modular pipeline system for automated strategy discovery
- **Services Layer**: Consolidated service architecture with clear separation of concerns
- **API Layer**: RESTful endpoints with WebSocket support for real-time updates

### Frontend
- **React 19 + Vite 8** with Tailwind CSS 4 and daisyUI 5
- **Pure JSX** (no TypeScript) following project conventions
- **Custom Hooks**: Modular state management with dedicated hooks for different concerns
- **Component Architecture**: Extracted components from monolithic AutoQuantTab

## Key Features

### AutoQuant Pipeline
- Automated strategy discovery and validation
- 6-stage pipeline with pause/resume support
- Real-time progress updates via WebSocket
- Comprehensive reporting with metrics and visualizations

### Strategy Management
- Strategy generation with multiple templates
- Pair screening and selection
- Walk-forward optimization (WFO)
- Monte Carlo stress testing
- Robustness validation

### Testing Infrastructure
- **Backend**: Unit tests, integration tests, router tests
- **Frontend**: Unit tests for hooks and components, integration tests
- **E2E**: Playwright tests for critical user flows

## Development Setup

### Prerequisites
- Python 3.11+
- Node.js 18+
- Freqtrade

### Backend Setup
```bash
# Install TA-Lib system dependencies (required before pip install)
# Ubuntu/Debian
sudo apt-get install -y build-essential wget
wget http://prdownloads.sourceforge.net/ta-lib/ta-lib-0.4.0-src.tar.gz
tar -xzf ta-lib-0.4.0-src.tar.gz
cd ta-lib/
./configure --prefix=/usr
make
sudo make install
cd ..

# Install Python dependencies
pip install -r requirements.txt

# Start backend server
uvicorn server:app --reload --port 8000
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### Running Tests

**Backend Tests:**
```bash
# All backend tests
pytest backend/tests/

# Unit tests only
pytest backend/tests/test_*.py

# Integration tests
pytest backend/tests/integration/

# Router tests
pytest backend/tests/test_api.py
```

**Frontend Tests:**
```bash
cd frontend

# Unit tests
npm test

# Integration tests
npm test -- --testPathPatterns=integration

# E2E tests
npx playwright test
```

## Project Structure

```
fortiesr/
├── backend/
│   ├── api/
│   │   ├── app.py              # FastAPI application factory
│   │   └── routers/            # API route modules
│   ├── services/
│   │   ├── auto_quant/         # AutoQuant pipeline modules
│   │   │   ├── pipeline.py     # Pipeline facade
│   │   │   └── pipeline_modules/  # Pipeline stage implementations
│   │   └── execution/          # Execution services
│   ├── tests/                  # Backend tests
│   └── main.py                 # Application entrypoint
├── frontend/
│   ├── src/
│   │   ├── components/         # React components
│   │   │   └── autoquant/       # AutoQuant-specific components
│   │   ├── features/
│   │   │   └── autoquant/      # AutoQuant feature module
│   │   │       ├── hooks/      # Custom React hooks
│   │   │       ├── api.js      # Feature-specific API calls
│   │   │       └── constants.js # Feature constants
│   │   ├── services/
│   │   │   └── api.js          # Centralized API client
│   │   └── App.jsx             # Main application component
│   ├── e2e/                    # E2E tests
│   └── tests/                  # Frontend unit/integration tests
└── user_data/                  # Runtime data directory
```

## Refactoring Summary

### Backend Refactoring (Phases 1-3)
- Removed legacy AutoQuantService
- Consolidated pipeline modules
- Standardized router structure
- Improved service layer organization

### Frontend Refactoring (Phases 4-6)
- Extracted 13 components from AutoQuantTab
- Consolidated API layers into central service
- Created 5 custom hooks for state management
- Improved component modularity and reusability

### Testing Implementation (Phases 7-12)
- **Backend**: Created comprehensive unit, integration, and router tests
- **Frontend**: Created unit tests for hooks and components
- **Integration**: Created integration tests for hook interactions
- **E2E**: Created Playwright tests for critical user flows

## Custom Hooks

The frontend uses custom hooks for state management:

- `useAutoQuantForm`: Form state and options management
- `useAutoQuantUI`: UI toggle and notification state
- `useAutoQuantScreening`: Pair screening logic
- `useAutoQuantStrategyGen`: Strategy generation state
- `useAutoQuantPipeline`: Pipeline execution and WebSocket management
- `useAutoQuantState`: Pipeline state and run management

## API Endpoints

### AutoQuant Endpoints
- `GET /api/auto-quant/options` - Load user options
- `POST /api/auto-quant/options` - Save user options
- `GET /api/auto-quant/timeframe-thresholds/{tf}` - Get timeframe thresholds
- `POST /api/auto-quant/generate-template` - Generate strategy template
- `POST /api/auto-quant/screen-pairs` - Screen trading pairs
- `POST /api/auto-quant/start` - Start pipeline run
- `POST /api/auto-quant/cancel/{run_id}` - Cancel pipeline run
- `GET /api/auto-quant/status/{run_id}` - Get run status
- `GET /api/auto-quant/report/{run_id}` - Get run report
- `GET /api/auto-quant/runs` - List all runs
- `WS /api/auto-quant/ws/{run_id}` - WebSocket for live updates

## Configuration

Settings are persisted in `data/strategy_lab_settings.json` using Pydantic models for validation.

## Contributing

This project follows strict coding conventions:
- Frontend: Pure JSX (no TypeScript)
- Backend: Python 3.11+ with type hints
- Testing: Comprehensive test coverage required
- Documentation: Update docs for significant changes

## License

[Add your license information here]
