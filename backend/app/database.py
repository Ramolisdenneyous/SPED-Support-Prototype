import os
from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./sped_support_demo.db",
)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, echo=False, pool_pre_ping=True, connect_args=connect_args)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
