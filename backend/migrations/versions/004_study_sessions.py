from alembic import op
import sqlalchemy as sa

revision = "004_study_sessions"
down_revision = "003_deadlines"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "study_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("subject_id", sa.Integer(), sa.ForeignKey("subjects.id"), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("ended_at IS NULL OR ended_at >= started_at", name="ck_session_time_order"),
    )
    op.create_index("ix_study_sessions_user_id", "study_sessions", ["user_id"])
    op.create_index("ix_study_sessions_subject_id", "study_sessions", ["subject_id"])
    op.create_index("uq_active_session_per_user", "study_sessions", ["user_id"], unique=True,
                    sqlite_where=sa.text("ended_at IS NULL"))


def downgrade():
    op.drop_index("uq_active_session_per_user", table_name="study_sessions")
    op.drop_index("ix_study_sessions_subject_id", table_name="study_sessions")
    op.drop_index("ix_study_sessions_user_id", table_name="study_sessions")
    op.drop_table("study_sessions")
