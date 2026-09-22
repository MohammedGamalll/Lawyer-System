#!/usr/bin/env python3
"""Print the Arabic backup/restore HTML guide to PDF via Chrome/Edge."""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "docs" / "دليل-النسخ-الاحتياطي-والاستعادة.html"
PDF = ROOT / "docs" / "دليل-النسخ-الاحتياطي-والاستعادة.pdf"
RES = ROOT / "resources" / "docs"


def chrome() -> str | None:
    cands = [
        Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
        Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
        Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
        Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    ]
    for p in cands:
        if p.exists():
            return str(p)
    return None


def main() -> None:
    if not HTML.exists():
        raise SystemExit(f"missing {HTML}")
    exe = chrome()
    if not exe:
        raise SystemExit("Chrome/Edge not found")
    PDF.parent.mkdir(parents=True, exist_ok=True)
    if PDF.exists():
        PDF.unlink()
    uri = HTML.resolve().as_uri()
    cmd = [
        exe,
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        f"--print-to-pdf={PDF}",
        uri,
    ]
    subprocess.run(cmd, check=True)
    if not PDF.exists() or PDF.stat().st_size < 1000:
        raise SystemExit("pdf was not created")
    RES.mkdir(parents=True, exist_ok=True)
    shutil.copy2(HTML, RES / HTML.name)
    shutil.copy2(PDF, RES / PDF.name)
    shutil.copy2(HTML, RES / "backup-restore-guide-ar.html")
    shutil.copy2(PDF, RES / "backup-restore-guide-ar.pdf")
    shutil.copy2(HTML, HTML.parent / "backup-restore-guide-ar.html")
    shutil.copy2(PDF, PDF.parent / "backup-restore-guide-ar.pdf")
    print(f"wrote pdf ({PDF.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
