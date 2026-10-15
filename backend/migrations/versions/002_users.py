from alembic import op
import sqlalchemy as sa

revision = "002_users"
down_revision = "001_subjects"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("users", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("telegram_id", sa.BigInteger(), nullable=False, unique=True), sa.Column("name", sa.String(100), nullable=False))
    with op.batch_alter_table("subjects") as batch:
        batch.add_column(sa.Column("user_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_subject_user", "users", ["user_id"], ["id"])
        batch.create_index("ix_subjects_user_id", ["user_id"])
    # Старые общие записи остаются без владельца. Автоматически присваивать
    # их первому вошедшему пользователю было бы небезопасно.


def downgrade():
    with op.batch_alter_table("subjects") as batch:
        batch.drop_index("ix_subjects_user_id")
        batch.drop_constraint("fk_subject_user", type_="foreignkey")
        batch.drop_column("user_id")
    op.drop_table("users")
