"""DataMind AI dataset profiling API."""

from __future__ import annotations

import io
import math
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware


MAX_UPLOAD_BYTES = 10 * 1024 * 1024
SUPPORTED_EXTENSIONS = {".csv", ".xls", ".xlsx"}

app = FastAPI(title="DataMind AI API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def _json_value(value: Any) -> Any:
    """Convert pandas/numpy values into JSON-safe primitive values."""
    if value is None or value is pd.NA:
        return None
    if isinstance(value, (float,)) and (math.isnan(value) or math.isinf(value)):
        return None
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, (pd.Timestamp, pd.Timedelta)):
        return str(value)
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _read_dataset(filename: str, payload: bytes) -> pd.DataFrame:
    extension = Path(filename).suffix.lower()
    stream = io.BytesIO(payload)
    if extension == ".csv":
        return pd.read_csv(stream)
    if extension in {".xls", ".xlsx"}:
        return pd.read_excel(stream)
    raise HTTPException(
        status_code=415,
        detail="Unsupported file type. Upload a CSV, XLS, or XLSX file.",
    )


def _column_summary(frame: pd.DataFrame, name: str) -> dict[str, Any]:
    series = frame[name]
    is_datetime = str(series.dtype).startswith("datetime")
    missing_count = int(series.isna().sum())
    unique_count = int(series.nunique(dropna=True))
    summary: dict[str, Any] = {
        "name": str(name),
        "dtype": str(series.dtype),
        "role": "datetime" if is_datetime else "numeric" if pd.api.types.is_numeric_dtype(series) else "categorical",
        "missing_count": missing_count,
        "missing_percent": round((missing_count / len(frame)) * 100, 2) if len(frame) else 0,
        "unique_count": unique_count,
        "sample_values": [_json_value(value) for value in series.dropna().head(3).tolist()],
    }
    if is_datetime:
        summary["statistics"] = {
            "min": _json_value(series.min()),
            "max": _json_value(series.max()),
        }
    elif pd.api.types.is_numeric_dtype(series):
        summary["statistics"] = {
            "min": _json_value(series.min()),
            "max": _json_value(series.max()),
            "mean": _json_value(series.mean()),
            "median": _json_value(series.median()),
        }
    else:
        counts = series.dropna().astype(str).value_counts().head(3)
        summary["top_values"] = [
            {"value": str(value), "count": int(count)} for value, count in counts.items()
        ]
    return summary


def _coerce_datetime_columns(frame: pd.DataFrame) -> list[str]:
    """Convert columns that are overwhelmingly date-like into datetimes."""
    datetime_columns: list[str] = []
    for name in frame.columns:
        series = frame[name]
        if pd.api.types.is_numeric_dtype(series):
            continue
        if pd.api.types.is_datetime64_any_dtype(series):
            datetime_columns.append(str(name))
            continue
        parsed = pd.to_datetime(series, errors="coerce", format="mixed")
        non_empty = series.notna().sum()
        if non_empty and (parsed.notna().sum() / non_empty) >= 0.8:
            frame[name] = parsed
            datetime_columns.append(str(name))
    return datetime_columns


def _name_score(name: str, keywords: tuple[str, ...]) -> int:
    normalized = "".join(character.lower() if character.isalnum() else " " for character in name)
    return sum(2 if keyword in normalized.replace(" ", "") else 0 for keyword in keywords)


def _eda_profile(
    frame: pd.DataFrame,
    datetime_columns: list[str],
    numeric_columns: list[str],
) -> tuple[dict[str, Any] | None, list[str]]:
    """Build a monthly value series when the dataset has time and measure fields."""
    if not datetime_columns or not numeric_columns:
        return None, []

    date_column = max(
        datetime_columns,
        key=lambda name: (_name_score(name, ("saledate", "date", "datetime", "timestamp", "time")), -datetime_columns.index(name)),
    )
    value_column = max(
        numeric_columns,
        key=lambda name: (_name_score(name, ("saleamount", "sales", "revenue", "amount", "total", "value", "price")), -numeric_columns.index(name)),
    )

    usable = frame[[date_column, value_column]].dropna()
    if usable.empty:
        return None, []
    monthly = usable.groupby(usable[date_column].dt.to_period("M"))[value_column].sum().sort_index()
    if monthly.empty:
        return None, []

    series = [
        {"label": period.strftime("%Y-%m"), "value": round(float(value), 2)}
        for period, value in monthly.items()
    ]
    total = float(monthly.sum())
    peak_period = monthly.idxmax()
    peak_value = float(monthly.max())
    trend = "upward" if len(monthly) > 1 and monthly.iloc[-1] > monthly.iloc[0] else "downward" if len(monthly) > 1 and monthly.iloc[-1] < monthly.iloc[0] else "flat"
    insights = [
        f"Total {value_column} across the detected period is {total:,.2f}.",
        f"Peak monthly {value_column} was {peak_value:,.2f} in {peak_period.strftime('%B %Y')}.",
        f"The monthly {value_column} trend is {trend} from {monthly.index[0].strftime('%B %Y')} to {monthly.index[-1].strftime('%B %Y')}.",
    ]
    return {"time_column": date_column, "value_column": value_column, "series": series}, insights


def _insights(
    frame: pd.DataFrame,
    numeric_columns: list[str],
    categorical_columns: list[str],
    duplicate_count: int,
    missing_cells: int,
) -> list[str]:
    insights: list[str] = []
    total_cells = max(frame.shape[0] * frame.shape[1], 1)
    missing_percent = (missing_cells / total_cells) * 100
    if missing_cells:
        insights.append(f"{missing_percent:.1f}% of cells are missing; review fields with the highest gaps before modeling.")
    else:
        insights.append("No missing values were detected, so the dataset is ready for exploratory analysis.")
    if duplicate_count:
        insights.append(f"{duplicate_count:,} duplicate rows were found and may be candidates for deduplication.")
    else:
        insights.append("No duplicate rows were detected.")
    if numeric_columns:
        insights.append(f"{len(numeric_columns)} numeric column(s) are available for aggregations and trend analysis.")
    if categorical_columns:
        insights.append(f"{len(categorical_columns)} categorical column(s) can support segmentation and grouping.")
    return insights[:4]


@app.get("/api/health")
@app.get("/health")
@app.get("/")
@app.get("/{path:path}")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/datasets/profile")
@app.post("/datasets/profile")
@app.post("/")
@app.post("/{path:path}")
async def profile_dataset(file: UploadFile = File(...)) -> dict[str, Any]:
    filename = file.filename or "dataset"
    extension = Path(filename).suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Unsupported file type. Upload a CSV, XLS, or XLSX file.")

    payload = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 10 MiB upload limit.")
    if not payload:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    try:
        frame = _read_dataset(filename, payload)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read dataset: {exc}") from exc

    if frame.shape[1] == 0:
        raise HTTPException(status_code=400, detail="The dataset has no columns.")

    # Keep response keys stable even when a spreadsheet has numeric headers.
    frame.columns = [str(column) for column in frame.columns]
    datetime_columns = _coerce_datetime_columns(frame)

    row_count, column_count = frame.shape
    numeric_columns = [str(column) for column in frame.select_dtypes(include="number").columns]
    categorical_columns = [
        str(column) for column in frame.columns
        if str(column) not in numeric_columns and str(column) not in datetime_columns
    ]
    missing_cells = int(frame.isna().sum().sum())
    duplicate_count = int(frame.duplicated().sum())
    total_cells = max(row_count * column_count, 1)
    quality_score = max(
        0.0,
        round(100 - (missing_cells / total_cells * 70) - (duplicate_count / max(row_count, 1) * 30), 1),
    )
    eda, eda_insights = _eda_profile(frame, datetime_columns, numeric_columns)
    insights = _insights(frame, numeric_columns, categorical_columns, duplicate_count, missing_cells)
    if eda_insights:
        # Put the data-driven findings first so clients can show them prominently.
        insights = (eda_insights + insights)[:4]

    response: dict[str, Any] = {
        "dataset_name": filename,
        "row_count": row_count,
        "column_count": column_count,
        "quality_score": quality_score,
        "preprocessing": {
            "missing_values": {str(column): int(count) for column, count in frame.isna().sum().items()},
            "duplicate_count": duplicate_count,
            "numeric_columns": numeric_columns,
            "categorical_columns": categorical_columns,
            "datetime_columns": datetime_columns,
        },
        "column_summaries": [_column_summary(frame, str(column)) for column in frame.columns],
        "insights": insights,
    }
    if eda is not None:
        response["eda"] = eda
    return response
