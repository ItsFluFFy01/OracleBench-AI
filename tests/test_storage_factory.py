import pytest

from backend.storage import ParquetRoundStore
from backend.storage_factory import create_store
from backend.storage_sql import SqlRoundStore, normalize_url


def test_default_backend_is_parquet(tmp_path, monkeypatch):
    monkeypatch.delenv("STORAGE_BACKEND", raising=False)
    assert isinstance(create_store(root=str(tmp_path), run_id="a"), ParquetRoundStore)


def test_backend_selected_by_environment(tmp_path, monkeypatch):
    monkeypatch.setenv("STORAGE_BACKEND", "postgres")
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(tmp_path / 'e.db').as_posix()}")
    assert isinstance(create_store(run_id="a"), SqlRoundStore)


def test_postgres_without_url_raises(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(ValueError, match="DATABASE_URL"):
        create_store("postgres")


def test_unknown_backend_raises():
    with pytest.raises(ValueError):
        create_store("mongodb")


def test_normalize_url_variants():
    assert normalize_url("postgres://u:p@h:5432/d") == "postgresql+psycopg://u:p@h:5432/d"
    assert normalize_url("postgresql://u:p@h/d") == "postgresql+psycopg://u:p@h/d"
    assert normalize_url("postgresql+psycopg://u:p@h/d") == "postgresql+psycopg://u:p@h/d"
    assert normalize_url("sqlite:///x.db") == "sqlite:///x.db"


def test_store_is_usable_through_the_factory(tmp_path):
    s = create_store("parquet", run_id="f", root=str(tmp_path))
    assert s.count() == 0 and s.latest_round_id() is None