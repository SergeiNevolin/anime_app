"""Integration adapters for the ``anicli-api`` library.

Everything that is specific to ``anicli-api`` lives in this package.  The
application layer never imports ``anicli_api`` directly: it only talks to the
:class:`~anime_app.domain.providers.base.AnimeCatalogProvider` and
:class:`~anime_app.domain.providers.base.PlaybackProvider` interfaces.
"""

__all__: list[str] = []
