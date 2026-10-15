from alembic import op
import sqlalchemy as sa

revision = "001_subjects"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Поддерживаем и чистую базу, и таблицу из предыдущей учебной версии.
    if not sa.inspect(op.get_bind()).has_table("subjects"):
        op.create_table("subjects", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("name", sa.String(80), nullable=False))


def downgrade():
    op.drop_table("subjects")
