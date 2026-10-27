"""Add user role column and performance indexes.

Revision ID: 005
Revises: 004
Create Date: 2026-07-14 12:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add role column with server default
    op.add_column(
        "user",
        sa.Column(
            "role",
            sa.String(20),
            server_default="user",
            nullable=False,
        ),
    )

    # Backfill existing rows (server_default only applies on INSERT, not UPDATE)
    op.execute("UPDATE \"user\" SET role = 'user' WHERE role IS NULL")

    # Add composite indexes for analytics aggregation performance
    op.create_index(
        "ix_pipeline_run_created_at_status",
        "pipeline_run",
        ["created_at", "status"],
    )
    op.create_index(
        "ix_stored_job_scraped_at_portal_id",
        "stored_job",
        ["scraped_at", "portal_id"],
    )
    op.create_index(
        "ix_application_created_at",
        "application",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_application_created_at", table_name="application")
    op.drop_index("ix_stored_job_scraped_at_portal_id", table_name="stored_job")
    op.drop_index("ix_pipeline_run_created_at_status", table_name="pipeline_run")
    op.drop_column("user", "role")
