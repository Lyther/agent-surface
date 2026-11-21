import pytest

from pager import page_count, page_slice


@pytest.mark.parametrize(
    ("rows", "per_page", "expected"),
    [(0, 20, 0), (1, 20, 1), (19, 20, 1), (20, 20, 1), (21, 20, 2), (40, 20, 2), (41, 20, 3), (7, 1, 7)],
)
def test_page_count(rows, per_page, expected):
    assert page_count(rows, per_page) == expected


def test_last_page_is_never_empty():
    rows = list(range(40))
    pages = page_count(len(rows), 20)
    assert page_slice(rows, pages, 20) == rows[20:]


def test_validation_kept():
    with pytest.raises(ValueError):
        page_count(10, -1)
    with pytest.raises(ValueError):
        page_slice([1], 0, 5)
