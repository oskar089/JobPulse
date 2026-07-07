"""Audit fix: add missing FKs, updated_at columns, and fix profile nullable JSON.

- Add updated_at to scrape_session and pipeline_run
- Add FK scrape_session.user_id → user.id (was missing)
- Add FK pipeline_run.portal_id → portal.id (was missing)
- Change profile.skills / education / work_experience from nullable to NOT NULL

Revision ID: 004
Revises: 003
Create Date: 2026-07-07 21:03:08.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Add missing updated_at columns ---
    op.add_column(
        "scrape_session",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.add_column(
        "pipeline_run",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # --- Add missing foreign key: scrape_session.user_id → user.id ---
    op.create_foreign_key(
        "fk_scrape_session_user",
        "scrape_session",
        "user",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # --- Add missing foreign key: pipeline_run.portal_id → portal.id ---
    op.create_foreign_key(
        "fk_pipeline_run_portal",
        "pipeline_run",
        "portal",
        ["portal_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # --- Fix profile JSON columns: NULL → NOT NULL ---
    # Existing rows may have NULL; set to '[]' first, then add NOT NULL
    op.execute("UPDATE profile SET skills = '[]'::json WHERE skills IS NULL")
    op.execute("UPDATE profile SET education = '[]'::json WHERE education IS NULL")
    op.execute("UPDATE profile SET work_experience = '[]'::json WHERE work_experience IS NULL")
    op.alter_column("profile", "skills", nullable=False, server_default=sa.text("'[]'::json"))
    op.alter_column("profile", "education", nullable=False, server_default=sa.text("'[]'::json"))
    op.alter_column("profile", "work_experience", nullable=False, server_default=sa.text("'[]'::json"))


def downgrade() -> None:
    # Revert profile JSON columns
    op.alter_column("profile", "work_experience", nullable=True, server_default=None)
    op.alter_column("profile", "education", nullable=True, server_default=None)
    op.alter_column("profile", "skills", nullable=True, server_default=None)

    # Drop foreign keys
    op.drop_constraint("fk_pipeline_run_portal", "pipeline_run", type_="foreignkey")
    op.drop_constraint("fk_scrape_session_user", "scrape_session", type_="foreignkey")

    # Drop added columns
    op.drop_column("pipeline_run", "updated_at")
    op.drop_column("scrape_session", "updated_at")
