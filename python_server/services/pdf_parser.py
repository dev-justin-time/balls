"""
=====================================================================
@domain:    ai
@concern:   PDF Table Extraction & Dimension Parsing
@created:   2026-06-24T15:30:00Z
@track:     9a0b1c2d-3e4f-5a6b-7c8d-9e0f1a2b3c4d
@version:   1.0.0
@security:  Server-Side (Thick Backend)
=====================================================================

PDF Parser Service

Extracts structured tabular data from multi-page PDFs using pdfplumber.
Handles merged cells via fill-down logic, parses dimension strings
into floats, and returns clean JSON for consumption by the JS frontend.

Capabilities:
  - Multi-page table detection and extraction
  - Fill-down logic for merged/empty cells
  - Dimension string parsing ("9W x 34-1/2H x 24D" -> floats)
  - Fraction handling (1/2, 3/4, mixed numbers like 34-1/2)
  - Pandas-based cleaning pipeline
  - Visual debugging (debug_tablefinder) for irregular tables

Integration:
  - Called by main.py POST /api/parse-pdf endpoint
  - Returns structured JSON with page, table, row, column metadata
  - Used by the 3D Workshop wireframe import workflow
"""

import io
import re
import logging
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Dimension Parsing
# ---------------------------------------------------------------------------

# Regex pattern for dimension components (W, H, D with optional fractions)
_DIM_PATTERN_W = r'(\d+(?:\s*[-–]\s*\d+)?(?:\s*/\s*\d+)?)\s*[Ww](?:idth)?'
_DIM_PATTERN_H = r'(\d+(?:\s*[-–]\s*\d+)?(?:\s*/\s*\d+)?)\s*[Hh](?:eight)?'
_DIM_PATTERN_D = r'(\d+(?:\s*[-–]\s*\d+)?(?:\s*/\s*\d+)?)\s*[Dd](?:epth)?'

# Combined pattern to find dimensions anywhere in a string
_DIM_COMBINED = re.compile(
    rf'(?:{_DIM_PATTERN_W})|(?:{_DIM_PATTERN_H})|(?:{_DIM_PATTERN_D})'
)


def _fraction_to_float(s: str) -> float:
    """
    Convert a dimension string to a float.

    Handles formats:
      - "34"         -> 34.0
      - "1/2"        -> 0.5
      - "34-1/2"     -> 34.5
      - "34 - 1/2"   -> 34.5 (with spaces around dash)
      - "34–1/2"     -> 34.5 (en-dash)
    """
    s = str(s).strip()

    # Handle "34-1/2" or "34 - 1/2" or "34–1/2" format
    dash_match = re.match(r'^(\d+)\s*[-–]\s*(\d+)\s*/\s*(\d+)$', s)
    if dash_match:
        whole = float(dash_match.group(1))
        numerator = float(dash_match.group(2))
        denominator = float(dash_match.group(3))
        if denominator != 0:
            return whole + numerator / denominator
        return whole

    # Handle "1/2" format
    frac_match = re.match(r'^(\d+)\s*/\s*(\d+)$', s)
    if frac_match:
        numerator = float(frac_match.group(1))
        denominator = float(frac_match.group(2))
        if denominator != 0:
            return numerator / denominator
        return 0.0

    # Handle plain number
    try:
        return float(s)
    except ValueError:
        return 0.0


def parse_dimensions(dim_str: str) -> Dict[str, Any]:
    """
    Parse a dimension string like "9W x 34-1/2H x 24D" into floats.

    Args:
        dim_str: Raw dimension string from PDF cell

    Returns:
        Dict with 'width', 'height', 'depth' floats and 'raw' original string.
        Missing dimensions are omitted from the dict.
    """
    dim_str = str(dim_str).strip()
    if not dim_str:
        return {"raw": dim_str}

    result: Dict[str, Any] = {"raw": dim_str}

    # Try each dimension pattern
    w_match = re.search(r'(\d+(?:\s*[-–]\s*\d+)?(?:\s*/\s*\d+)?)\s*[Ww]', dim_str)
    h_match = re.search(r'(\d+(?:\s*[-–]\s*\d+)?(?:\s*/\s*\d+)?)\s*[Hh]', dim_str)
    d_match = re.search(r'(\d+(?:\s*[-–]\s*\d+)?(?:\s*/\s*\d+)?)\s*[Dd]', dim_str)

    if w_match:
        result['width'] = _fraction_to_float(w_match.group(1))
    if h_match:
        result['height'] = _fraction_to_float(h_match.group(1))
    if d_match:
        result['depth'] = _fraction_to_float(d_match.group(1))

    # If no labeled dimensions found, try to parse as raw numbers separated by x/X
    if len(result) <= 1:  # Only 'raw' key
        # Try "W x H x D" pattern without labels
        number_pattern = r'(\d+(?:\s*[-–]\s*\d+)?(?:\s*/\s*\d+)?)'
        number_matches = re.findall(number_pattern, dim_str)
        if len(number_matches) >= 3:
            result['width'] = _fraction_to_float(number_matches[0])
            result['height'] = _fraction_to_float(number_matches[1])
            result['depth'] = _fraction_to_float(number_matches[2])

    return result


# ---------------------------------------------------------------------------
# Fill-Down Logic
# ---------------------------------------------------------------------------

def apply_fill_down(table_rows: List[List[Optional[str]]]) -> List[List[str]]:
    """
    Fill-down logic for merged cells in PDF tables.

    If a cell is empty, None, or whitespace-only, inherit the value
    from the cell directly above it. This handles vertical merged cells
    common in technical PDFs.

    Args:
        table_rows: List of rows, each a list of cell values (may contain None)

    Returns:
        List of rows with merged cells filled down
    """
    if not table_rows:
        return []

    result: List[List[str]] = []
    previous_row: Optional[List[str]] = None

    for row_idx, row in enumerate(table_rows):
        cleaned_row: List[str] = []
        for col_idx, cell in enumerate(row):
            # Convert None to empty string and strip whitespace
            cell_str = str(cell).strip() if cell is not None else ""
            cell_str = cell_str.replace('\n', ' ').strip()

            if cell_str in ("", "None", "nan", "-"):
                # Fill down from above if available
                if previous_row and col_idx < len(previous_row):
                    cleaned_row.append(previous_row[col_idx])
                else:
                    cleaned_row.append("")
            else:
                cleaned_row.append(cell_str)

        result.append(cleaned_row)
        previous_row = cleaned_row

    return result


# ---------------------------------------------------------------------------
# Table Cleaning Pipeline
# ---------------------------------------------------------------------------

def clean_table(table_rows: List[List[Optional[str]]]) -> List[List[str]]:
    """
    Complete table cleaning pipeline.

    1. Apply fill-down for merged cells
    2. Strip whitespace and normalize
    3. Remove completely empty rows
    4. Attempt to parse dimension strings

    Args:
        table_rows: Raw output from pdfplumber.extract_table()

    Returns:
        Cleaned list of rows with dimension data parsed
    """
    if not table_rows:
        return []

    # Step 1: Fill down merged cells
    filled = apply_fill_down(table_rows)

    # Step 2: Strip and normalize
    cleaned: List[List[str]] = []
    for row in filled:
        normalized_row = [
            cell.replace('\n', ' ').replace('\r', '').strip()
            for cell in row
        ]
        # Skip completely empty rows
        if any(cell for cell in normalized_row):
            cleaned.append(normalized_row)

    return cleaned


def apply_pandas_ffill(table_rows: List[List[str]]) -> List[List[str]]:
    """
    Alternative fill-down using pandas forward-fill.
    Used as a secondary pass for complex merged cells that
    the simple fill-down might miss.

    Args:
        table_rows: List of rows with string values

    Returns:
        Rows with pandas ffill applied
    """
    try:
        import pandas as pd
        df = pd.DataFrame(table_rows)
        df = df.replace('', pd.NA).ffill(axis=0)
        return df.fillna('').values.tolist()
    except ImportError:
        # Pandas not available — fall back to manual fill-down
        return apply_fill_down(table_rows)


# ---------------------------------------------------------------------------
# Full PDF Extraction
# ---------------------------------------------------------------------------

def extract_tables_from_pdf(
    pdf_bytes: bytes,
    page_numbers: Optional[List[int]] = None,
    table_settings: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """
    Extract all tables from a PDF.

    Args:
        pdf_bytes: Raw PDF file bytes
        page_numbers: Optional list of page indices (0-based) to extract.
                      If None, processes all pages.
        table_settings: Optional dict of pdfplumber table extraction settings.
                        Default: uses lines strategy with text fallback.

    Returns:
        List of table dicts, each with:
          - page: 1-based page number
          - rows: row count
          - columns: column count
          - data: cleaned 2D array of cell values
          - dimensions: parsed dimension data where applicable
    """
    try:
        import pdfplumber
    except ImportError:
        raise ImportError(
            "pdfplumber is required. Install: pip install pdfplumber"
        )

    default_settings = {
        "vertical_strategy": "lines",
        "horizontal_strategy": "lines",
        "snap_x_tolerance": 5,
        "snap_y_tolerance": 5,
    }
    if table_settings:
        default_settings.update(table_settings)

    all_tables: List[Dict[str, Any]] = []

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        pages_to_process = (
            [pdf.pages[i] for i in page_numbers if i < len(pdf.pages)]
            if page_numbers is not None
            else pdf.pages
        )

        for page_num, page in enumerate(pages_to_process):
            actual_page_num = (
                page_numbers[page_num] + 1
                if page_numbers
                else page.page_number
            )

            # Extract tables from this page
            tables = page.extract_tables(table_settings=default_settings)

            for table in tables:
                if not table or len(table) < 2:  # Skip empty/single-row tables
                    continue

                # Clean the table
                cleaned = clean_table(table)

                # Parse dimensions in the first data row (or detect header)
                dimension_rows: List[List[Dict[str, Any]]] = []
                for row in cleaned:
                    parsed_row = []
                    for cell in row:
                        dims = parse_dimensions(cell)
                        parsed_row.append(dims)
                    dimension_rows.append(parsed_row)

                all_tables.append({
                    "page": actual_page_num,
                    "rows": len(cleaned),
                    "columns": len(cleaned[0]) if cleaned else 0,
                    "data": cleaned,
                    "dimensions": dimension_rows,
                    "headers": cleaned[0] if cleaned else [],
                })

    return all_tables


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

def get_pdf_metadata(pdf_bytes: bytes) -> Dict[str, Any]:
    """
    Extract metadata from a PDF without full table parsing.
    Useful for quick checks before committing to full extraction.

    Args:
        pdf_bytes: Raw PDF file bytes

    Returns:
        Dict with page_count, title, author, etc.
    """
    try:
        import pdfplumber
    except ImportError:
        return {"error": "pdfplumber not installed"}

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            metadata = pdf.metadata or {}
            return {
                "page_count": len(pdf.pages),
                "title": metadata.get("Title", ""),
                "author": metadata.get("Author", ""),
                "subject": metadata.get("Subject", ""),
                "keywords": metadata.get("Keywords", ""),
                "file_size_bytes": len(pdf_bytes),
            }
    except Exception as e:
        return {"error": str(e)}
