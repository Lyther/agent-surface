import pytest

from pager import page_count, page_slice


def test_partial_last_page():
    assert page_count(45, 20) == 3


def test_exact_multiple_has_no_empty_page():
    assert page_count(40, 20) == 2


def test_slice_second_page():
    assert page_slice(list(range(10)), 2, 4) == [4, 5, 6, 7]


def test_rejects_zero_page_size():
    with pytest.raises(ValueError):
        page_count(10, 0)
