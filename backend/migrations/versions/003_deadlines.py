from alembic import op
import sqlalchemy as sa

revision = "003_deadlines"
down_revision = "002_users"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "deadlines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("subject_id", sa.Integer(), sa.ForeignKey("subjects.id"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("due_at", sa.DateTime(), nullable=False),
        sa.Column("done", sa.Boolean(), nullable=False),
    )
    op.create_index("ix_deadlines_subject_id", "deadlines", ["subject_id"])
    op.create_index("ix_deadlines_due_at", "deadlines", ["due_at"])


def downgrade():
    op.drop_index("ix_deadlines_due_at", table_name="deadlines")
    op.drop_index("ix_deadlines_subject_id", table_name="deadlines")
    op.drop_table("deadlines")
