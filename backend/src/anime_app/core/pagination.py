"""Pagination primitives shared by the API and the application layer."""

from __future__ import annotations

from typing import Generic, TypeVar

from pydantic import BaseModel, Field, computed_field

__all__ = ["Page", "PageParams"]

T = TypeVar("T")

MAX_PAGE_SIZE = 100


class PageParams(BaseModel):
    """Validated ``page`` / ``page_size`` query parameters."""

    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=MAX_PAGE_SIZE)

    @property
    def offset(self) -> int:
        """Return the SQL offset for the current page."""
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        """Return the SQL limit for the current page."""
        return self.page_size


class Page(BaseModel, Generic[T]):
    """A single page of results."""

    items: list[T] = Field(default_factory=list)
    page: int = 1
    page_size: int = 20
    total: int | None = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def has_more(self) -> bool:
        """Whether more items are available after this page."""
        if self.total is None:
            return False
        return self.page * self.page_size < self.total

    @classmethod
    def create(
        cls,
        items: list[T],
        params: PageParams,
        *,
        total: int | None = None,
    ) -> Page[T]:
        """Build a page from already sliced items."""
        return cls(
            items=items,
            page=params.page,
            page_size=params.page_size,
            total=total,
        )
