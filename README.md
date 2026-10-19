# DataMind AI

The first working slice of DataMind AI is a lightweight analytics workspace for exploring business data, surfacing insights, and preparing for predictive workflows.

## What is working

- Analytics overview with KPI cards for revenue, customers, churn risk, and data quality.
- Responsive revenue trend visualization with actual and forecast states.
- AI insight feed covering trends, anomalies, and customer segments.
- Dataset library flow with CSV/XLS/XLSX upload and drag-and-drop feedback.
- Real FastAPI profiling endpoint that reads the upload with Pandas and returns row/column counts, quality score, missing values, duplicates, column summaries, and starter insights.
- Copilot drawer with natural-language prompts and demo answers for common analysis questions.
- Models and reports surfaces that establish the product architecture for the next backend slice.
- Static deployment-friendly structure: `index.html`, `styles.css`, and `app.js`.

## Run locally

Requires Python 3.10+ (available in this workspace).

```bash
python -m http.server 4173
```

Open <http://127.0.0.1:4173>.

The `npm start` and `npm run dev` scripts are aliases for the same zero-build static server, so the frontend can be previewed without installing dependencies.

## Run the profiling API

Install the Python dependencies once:

```bash
python -m pip install -r requirements.txt
```

Start the API in a second terminal:

```bash
uvicorn api.main:app --reload --port 8000
```

The frontend posts uploads to `/api/datasets/profile`. When the static server and API run on different ports, use a reverse proxy or serve the frontend from the same origin in deployment; the API already enables CORS for local development.

## Deploy to Vercel

This project is configured for Vercel: the static dashboard is served from the project root and `api/index.py` exposes the FastAPI application as a Python function. The `vercel.json` rewrite keeps both `/api/health` and `/api/datasets/profile` on the same FastAPI app.

From this folder, install the Vercel CLI if needed and deploy:

```bash
npx vercel login
npx vercel
```

For a production deployment:

```bash
npx vercel --prod
```

When prompted, use the current folder as the project root, keep the default build settings, and do not add a frontend framework preset. Vercel will install the Python packages from `requirements.txt` for the API function.

After deployment, verify:

```text
https://YOUR-VERCEL-DOMAIN.vercel.app/api/health
```

The browser upload flow automatically uses same-origin `/api` routes on Vercel. Note that Vercel functions are stateless, so uploaded datasets are profiled during the request and are not permanently stored yet.

## Next implementation slice

The next implementation slice is persistence: store dataset sessions, retain cleaned data, and expose EDA series for Plotly charts. The existing dashboard cards and insight objects are intentionally shaped so they can be replaced with API responses without redesigning the interface.
