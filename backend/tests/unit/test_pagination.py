"""Unit tests of the pagination helpers."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from anime_app.core.pagination import Page, PageParams


def test_page_params_defaults() -> None:
    """The default page parameters are sane."""
    params = PageParams()

    assert params.page == 1
    assert params.page_size == 20
    assert params.offset == 0
    assert params.limit == 20


def test_page_params_offset() -> None:
    """The offset is derived from the page and the page size."""
    params = PageParams(page=3, page_size=10)

    assert params.offset == 20
    assert params.limit == 10


@pytest.mark.parametrize(
    ("kwargs", "message"),
    [
        ({"page": 0}, "page"),
        ({"page_size": 0}, "page_size"),
        ({"page_size": 101}, "page_size"),
    ],
)
def test_page_params_validation(kwargs: dict[str, int], message: str) -> None:
    """Invalid pagination parameters are rejected."""
    with pytest.raises(ValidationError, match=message):
        PageParams(**kwargs)


def test_page_reports_more_items() -> None:
    """A page in the middle of the result set reports that more items exist."""
    page = Page.create([1, 2, 3], PageParams(page=1, page_size=3), total=10)

    assert page.has_more is True
    assert page.total == 10
    assert page.items == [1, 2, 3]


def test_page_without_total_has_no_more_items() -> None:
    """A page without a total never reports more items."""
    page = Page.create([1, 2], PageParams(page=1, page_size=2))

    assert page.has_more is False
    assert page.total is None


def test_page_on_the_last_page() -> None:
    """The last page does not report more items."""
    page = Page.create([1], PageParams(page=3, page_size=3), total=7)

    assert page.has_more is False
