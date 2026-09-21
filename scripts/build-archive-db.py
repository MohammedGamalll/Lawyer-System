#!/usr/bin/env python3
"""Build resources/archive.db from original WinCases MAS files.

Drop/regenerate the output at:
  resources/archive.db
before packaging. The Electron app reads this file read-only from extraResources.
It is never merged into lawoffice.db or synced to Supabase.

CASES1 text fields use pad-shift so names/venues/subjects are readable Arabic.
Hex columns stay raw on disk. Do NOT apply
  CaseID = int(Hex,16) - Fix(1000*Sqr(RecNo)) - 13
and do not JOIN tables.
"""
from __future__ import annotations

import csv
import re
import sqlite3
from collections import Counter, OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "resources" / "archive.db"
WIN = Path(r"C:\Users\medom\Downloads\Sal_Jas\WinCases")
CSV_DIR = Path(r"C:\Users\medom\Downloads\CSV_Data")
OFFICES = ("Mas001", "Mas002", "Mas003", "Mas004")
REC1, REC2 = 1120, 160

CASES1_FIELDS = [
    ("نوع القضية", 0, 20),
    ("وردت للمكتب", 20, 30),
    ("تاريخ الرفع", 30, 40),
    ("ترقيم أول", 40, 52),
    ("ترقيم ثاني", 52, 64),
    ("ترقيم ثالث", 64, 76),
    ("الجهة_الموكل", 76, 126),
    ("إسم الخصم", 126, 176),
    ("موضوع الدعوى", 176, 276),
    ("مطلوب", 276, 290),
    ("محصل", 290, 304),
    ("محامي أول", 304, 334),
    ("محامي ثاني", 334, 364),
    ("صفة أولى", 364, 384),
    ("صفةالإستئناف", 384, 404),
    ("صفةالنقض", 404, 424),
    ("رقم أول درجة", 424, 438),
    ("رقم الإستئناف", 438, 452),
    ("رقم النقض", 452, 466),
    ("رقم1", 466, 480),
    ("رقم2", 480, 494),
    ("المحكمة", 494, 524),
    ("طابق", 524, 530),
    ("قاعة", 530, 536),
    ("وضع الملف", 536, 546),
    ("منفذ خارجي", 546, 552),
    ("رقم التوكيل", 552, 564),
    ("اسم الخبير", 564, 594),
    ("بيانات الجهة", 594, 694),
    ("بيانات الخصم", 694, 794),
    ("قبل الإسم", 794, 814),
    ("بعد الإسم", 814, 834),
    ("ملاحظات", 834, 984),
    ("الاتفاق", 984, 1120),
]


def dec(rec: bytes) -> bytes:
    pad = Counter(rec).most_common(1)[0][0]
    return bytes((b + (0x20 - pad)) & 0xFF for b in rec)


def field(buf: bytes) -> str:
    s = buf.decode("cp1256", "replace")
    s = re.sub(r"[\x00-\x1f]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def qident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def create_table(con: sqlite3.Connection, name: str, cols: list[str]) -> None:
    specs = ", ".join(f"{qident(c)} TEXT" for c in cols)
    con.execute(f"DROP TABLE IF EXISTS {qident(name)}")
    con.execute(f"CREATE TABLE {qident(name)} ({specs})")


def insert_rows(con: sqlite3.Connection, name: str, cols: list[str], rows: list[tuple]) -> None:
    if not rows:
        create_table(con, name, cols)
        return
    create_table(con, name, cols)
    ph = ",".join("?" * len(cols))
    con.executemany(f"INSERT INTO {qident(name)} VALUES ({ph})", rows)
    print(f"  {name}: {len(rows)}")


def find_mas(office: str, *names: str) -> Path | None:
    folder = WIN / office
    if not folder.is_dir():
        return None
    lower = {f.name.lower(): f for f in folder.iterdir()}
    for n in names:
        hit = lower.get(n.lower())
        if hit and hit.stat().st_size:
            return hit
    return None


def load_cases1() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for office in OFFICES:
        path = find_mas(office, "CASES1.MAS")
        if not path:
            continue
        data = path.read_bytes()
        n = len(data) // REC1
        print(f"CASES1 {office} records={n}")
        for i in range(n):
            p = dec(data[i * REC1 : (i + 1) * REC1])
            row = {"المكتب": office, "رقم_السجل": str(i + 1)}
            for name, a, b in CASES1_FIELDS:
                row[name] = field(p[a:b])
            rows.append(row)
    return rows


def rec160_rows(office: str, names: tuple[str, ...], kind: str) -> list[tuple]:
    path = find_mas(office, *names)
    if not path:
        return []
    data = path.read_bytes()
    n = len(data) // REC2
    print(f"{kind} {office} records={n}")
    out: list[tuple] = []
    for i in range(n):
        rec = data[i * REC2 : (i + 1) * REC2]
        if kind == "fees":
            out.append(
                (
                    office,
                    str(i + 1),
                    field(rec[0:2]),
                    field(rec[2:16]),
                    field(rec[16:136]),
                    field(rec[136:138]),
                    field(rec[138:148]),
                    field(rec[148:160]),
                )
            )
        else:
            out.append(
                (
                    office,
                    str(i + 1),
                    field(rec[0:10]),
                    field(rec[10:130]),
                    field(rec[130:132]),
                    field(rec[132:140]),
                )
            )
    return out


def import_csv(con: sqlite3.Connection, table: str, path: Path) -> None:
    if not path.exists() or path.stat().st_size < 8:
        return
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        cols = [c.strip() or f"col{i}" for i, c in enumerate(reader.fieldnames or [])]
        rows = [tuple((row.get(c) or "").strip() for c in (reader.fieldnames or [])) for row in reader]
    insert_rows(con, table, cols, rows)


def main() -> None:
    if not WIN.is_dir():
        raise SystemExit(f"WinCases folder not found: {WIN}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.with_name("archive.db.tmp")
    if tmp.exists():
        tmp.unlink()

    con = sqlite3.connect(str(tmp))
    con.execute("PRAGMA journal_mode = OFF")
    con.execute("PRAGMA synchronous = OFF")

    cases = load_cases1()
    case_cols = ["المكتب", "رقم_السجل"] + [n for n, _, _ in CASES1_FIELDS]
    insert_rows(con, "القضايا", case_cols, [tuple(r.get(c, "") for c in case_cols) for r in cases])

    clients: OrderedDict[str, dict[str, str]] = OrderedDict()
    for r in cases:
        name = (r.get("الجهة_الموكل") or "").strip()
        if not name:
            continue
        if name not in clients:
            clients[name] = {
                "اسم_الموكل": name,
                "بيانات_الجهة": r.get("بيانات الجهة") or "",
                "قبل_الاسم": r.get("قبل الإسم") or "",
                "بعد_الاسم": r.get("بعد الإسم") or "",
                "عدد_القضايا": 0,
                "اول_مكتب": r.get("المكتب") or "",
                "اول_رقم_سجل": r.get("رقم_السجل") or "",
                "اول_رقم_اول_درجة": r.get("رقم أول درجة") or "",
            }
        clients[name]["عدد_القضايا"] = str(int(clients[name]["عدد_القضايا"] or 0) + 1)
    ccols = [
        "اسم_الموكل",
        "بيانات_الجهة",
        "قبل_الاسم",
        "بعد_الاسم",
        "عدد_القضايا",
        "اول_مكتب",
        "اول_رقم_سجل",
        "اول_رقم_اول_درجة",
    ]
    insert_rows(con, "الموكلين", ccols, [tuple(c[k] for k in ccols) for c in clients.values()])

    hearings: list[tuple] = []
    for office in OFFICES:
        hearings.extend(rec160_rows(office, ("Cases2.mas", "CASES2.MAS"), "hearings"))
    insert_rows(
        con,
        "الجلسات",
        ["المكتب", "رقم_السجل", "تاريخ_الجلسة", "بيان_الجلسة", "نوع_الجلسة", "Hex"],
        hearings,
    )

    acts: list[tuple] = []
    for office in OFFICES:
        acts.extend(rec160_rows(office, ("CASES4.MAS",), "acts"))
    insert_rows(
        con,
        "الإجراءات",
        ["المكتب", "رقم_السجل", "تاريخ_إداري", "بيان_إداري", "نوع_العمل", "Hex"],
        acts,
    )

    hasr: list[tuple] = []
    for office in OFFICES:
        hasr.extend(rec160_rows(office, ("CASES5.MAS",), "hasr"))
    insert_rows(
        con,
        "الحصر",
        ["المكتب", "رقم_السجل", "التاريخ", "البيان", "النوع", "Hex"],
        hasr,
    )

    fees: list[tuple] = []
    for office in OFFICES:
        fees.extend(rec160_rows(office, ("CASES6.MAS",), "fees"))
    insert_rows(
        con,
        "المصاريف",
        ["المكتب", "رقم_السجل", "نوع_المبلغ", "المبلغ", "البيان", "تصنيف", "تاريخ_المبلغ", "Hex"],
        fees,
    )

    poa: list[tuple] = []
    for office in OFFICES:
        poa.extend(rec160_rows(office, ("CASES9.MAS",), "poa"))
    insert_rows(
        con,
        "التوكيلات_القديمة",
        ["المكتب", "رقم_السجل", "التاريخ", "البيان", "النوع", "Hex"],
        poa,
    )

    import_csv(con, "الفهارس", CSV_DIR / "INDEXES.csv")
    import_csv(con, "الحراسة", CSV_DIR / "Remind_Custody_Mas.csv")

    con.commit()
    con.execute("VACUUM")
    con.close()
    try:
        if OUT.exists():
            OUT.unlink()
        tmp.replace(OUT)
    except OSError:
        import shutil

        shutil.copyfile(tmp, OUT)
        tmp.unlink(missing_ok=True)
    print("wrote", OUT, "bytes", OUT.stat().st_size)


if __name__ == "__main__":
    main()
