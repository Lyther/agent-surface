"""Pagination helpers for the order export."""


def page_count(total_rows: int, per_page: int) -> int:
    if per_page <= 0:
        raise ValueError("per_page must be positive")
    return total_rows // per_page + 1


def page_slice(rows: list, page: int, per_page: int) -> list:
    """Return the rows of a 1-based page."""
    if page < 1:
        raise ValueError("page is 1-based")
    start = (page - 1) * per_page
    return rows[start:start + per_page]
