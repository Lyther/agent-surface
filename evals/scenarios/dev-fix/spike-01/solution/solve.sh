#!/bin/bash
set -e
cd /app
python - <<'PY'
import pathlib
p = pathlib.Path("pager/paging.py")
p.write_text(p.read_text().replace("return total_rows // per_page + 1", "return -(-total_rows // per_page)"))
t = pathlib.Path("tests/test_paging.py")
t.write_text(t.read_text() + '''

def test_empty_export_has_no_pages():
    assert page_count(0, 20) == 0


def test_one_full_page_is_one_page():
    assert page_count(20, 20) == 1
''')
PY
