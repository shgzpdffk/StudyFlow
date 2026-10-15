from alembic import context
from app.database import Base, engine
from app import models

# Используем то же подключение, что и сервер.
migration_engine = context.config.attributes.get("connection", engine)
with migration_engine.connect() as connection:
    context.configure(connection=connection, target_metadata=Base.metadata, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()
