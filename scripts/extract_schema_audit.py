import os
import re

backend_dir = 'backend'
files = []
for root, _, filenames in os.walk(backend_dir):
    for f in filenames:
        if f.endswith('.py'):
            files.append(os.path.join(root, f))
files.append('main.py')

pg_calls = {}
db_collections = set()
raw_sqls = []

for fpath in files:
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()

    # db.collection
    for m in re.finditer(r'db\.collection\((["\'])([^"\']+)\1\)', content):
        db_collections.add((m.group(2), fpath))

    # pg helpers
    for fn in ['pg_query_table', 'pg_fetch_one', 'pg_upsert_row', 'pg_update_row', 'pg_delete_rows']:
        for m in re.finditer(rf'{fn}\(\s*(["\'])([^"\']+)\1', content):
            pg_calls.setdefault(fn, set()).add((m.group(2), fpath))

    # pg_execute_raw
    for m in re.finditer(r'pg_execute_raw\(\s*(f?["\'][\s\S]*?["\'])', content):
        raw_sqls.append((m.group(1).strip()[:140].replace('\n', ' '), fpath))

print("=== DB COLLECTIONS (LINGERING FIRESTORE) ===")
for col, fpath in sorted(db_collections):
    print(f"  {col:30} in {fpath}")

print("\n=== PG HELPER TABLES BY FUNCTION ===")
for fn, tables in pg_calls.items():
    print(f"\n{fn}:")
    for tbl, fpath in sorted(tables):
        print(f"  {tbl:30} ({fpath})")

print(f"\n=== RAW SQL CALLS ({len(raw_sqls)} total) ===")
unique_tables_in_sql = set()
for sql, fpath in raw_sqls:
    m = re.search(r'(FROM|INTO|UPDATE|TABLE)\s+([a-zA-Z0-9_]+)', sql, re.IGNORECASE)
    if m:
        unique_tables_in_sql.add(m.group(2).lower())
    print(f"  [{fpath}] {sql}")

print("\n=== UNIQUE TABLES IDENTIFIED IN SQL ===")
for t in sorted(unique_tables_in_sql):
    print(f"  {t}")
