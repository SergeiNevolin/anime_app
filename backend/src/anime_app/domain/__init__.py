"""Domain layer: entities, value objects and provider ports.

The domain layer does not depend on FastAPI, SQLAlchemy, Redis or on any
external content library.  It only depends on Pydantic, which is used as a
pure data-validation library.
"""

__all__ = ["__version__"]

__version__ = "0.1.0"
