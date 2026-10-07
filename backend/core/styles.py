# Professional OpenPyXL Border & Style Helpers
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

EXCEL_NAVY_HEADER_FILL = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
EXCEL_WHITE_BOLD_FONT = Font(name="Calibri", size=10, bold=True, color="FFFFFF")

EXCEL_THIN_BORDER = Border(
    left=Side(style='thin', color='CBD5E1'),
    right=Side(style='thin', color='CBD5E1'),
    top=Side(style='thin', color='CBD5E1'),
    bottom=Side(style='thin', color='CBD5E1')
)

EXCEL_HEADER_BORDER = Border(
    left=Side(style='thin', color='94A3B8'),
    right=Side(style='thin', color='94A3B8'),
    top=Side(style='medium', color='1E293B'),
    bottom=Side(style='medium', color='1E293B')
)

EXCEL_TOTAL_ROW_BORDER = Border(
    left=Side(style='thin', color='CBD5E1'),
    right=Side(style='thin', color='CBD5E1'),
    top=Side(style='medium', color='1E293B'),
    bottom=Side(style='double', color='1E293B')
)

EXCEL_CLUSTER_DIVIDER = Border(
    left=Side(style='thin', color='CBD5E1'),
    right=Side(style='medium', color='64748B'),
    top=Side(style='thin', color='CBD5E1'),
    bottom=Side(style='thin', color='CBD5E1')
)

def style_excel_worksheet(ws, header_fill_color="4F46E5"):
    for cell in ws[1]:
        cell.font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color=header_fill_color, end_color=header_fill_color, fill_type="solid")
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = EXCEL_HEADER_BORDER
        
    for row in ws.iter_rows(min_row=2, max_row=ws.max_row, min_col=1, max_col=ws.max_column):
        for cell in row:
            cell.border = EXCEL_THIN_BORDER
            cell.font = Font(name="Calibri", size=10)
            if isinstance(cell.value, (int, float)):
                cell.alignment = Alignment(horizontal="center", vertical="center")
            else:
                cell.alignment = Alignment(horizontal="left", vertical="center")
                
    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

import re
import io
from fastapi.responses import StreamingResponse

def safe_filename(district: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", district.strip())
    return cleaned.strip("_") or "UNKNOWN"

class ExcelStreamingResponse(StreamingResponse):
    """StreamingResponse subclass that retains body bytes for testability, background streaming, and caching."""
    def __init__(self, content_bytes: bytes, *args, **kwargs):
        self.body = content_bytes
        super().__init__(io.BytesIO(content_bytes), *args, **kwargs)

