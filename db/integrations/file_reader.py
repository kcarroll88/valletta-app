"""
file_reader.py — Extract readable text from various file types.
Used to inject document content into team member chat context.
"""

import zipfile
import re
from pathlib import Path


def extract_text(filepath: Path, max_chars: int = 8000) -> str | None:
    """
    Extract text from a file. Returns None if the file can't be read as text.
    Truncates to max_chars.
    """
    suffix = filepath.suffix.lower()

    if suffix == ".pdf":
        return _read_pdf(filepath, max_chars)
    if suffix in (".docx",):
        return _read_docx(filepath, max_chars)
    if suffix == ".pages":
        return _read_pages(filepath, max_chars)
    if suffix in (".txt", ".md", ".rtf"):
        return _read_text(filepath, max_chars)
    return None


def _read_pdf(filepath: Path, max_chars: int) -> str | None:
    try:
        from pypdf import PdfReader
        reader = PdfReader(str(filepath))
        chunks = []
        total = 0
        for page in reader.pages:
            text = page.extract_text() or ""
            chunks.append(text)
            total += len(text)
            if total >= max_chars:
                break
        result = "\n".join(chunks)
        return _clean(result[:max_chars])
    except Exception:
        return None


def _read_docx(filepath: Path, max_chars: int) -> str | None:
    try:
        from docx import Document
        doc = Document(str(filepath))
        text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        return _clean(text[:max_chars])
    except Exception:
        return None


def _read_pages(filepath: Path, max_chars: int) -> str | None:
    """
    .pages files are ZIP archives. Older format has index.xml with readable text;
    newer format uses binary .iwa protobuf (not parseable without Apple SDK).
    We attempt XML extraction and fall back gracefully.
    """
    try:
        with zipfile.ZipFile(str(filepath), "r") as z:
            names = z.namelist()
            # Older Pages format
            if "index.xml" in names:
                with z.open("index.xml") as f:
                    xml = f.read().decode("utf-8", errors="ignore")
                # Strip XML tags
                text = re.sub(r"<[^>]+>", " ", xml)
                text = re.sub(r"\s+", " ", text).strip()
                return _clean(text[:max_chars]) if text else None
            # Newer Pages format — extract any text-like content from non-binary files
            text_parts = []
            for name in names:
                if name.endswith(".xml") or name.endswith(".json"):
                    try:
                        with z.open(name) as f:
                            content = f.read().decode("utf-8", errors="ignore")
                            # Pull strings that look like actual text (>20 chars, not markup-heavy)
                            strings = re.findall(r'(?<=>)[^<]{20,}(?=<)', content)
                            text_parts.extend(strings)
                    except Exception:
                        continue
            if text_parts:
                result = " ".join(text_parts)
                return _clean(result[:max_chars])
        return None
    except Exception:
        return None


def _read_text(filepath: Path, max_chars: int) -> str | None:
    try:
        text = filepath.read_text(encoding="utf-8", errors="ignore")
        return _clean(text[:max_chars])
    except Exception:
        return None


def _clean(text: str) -> str:
    # Collapse whitespace, remove null bytes
    text = text.replace("\x00", "")
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" {3,}", " ", text)
    return text.strip()
