# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
"""
Regression tests for issue #88: SQL error responses must not expose
internal table names, raw SQL fragments, or stacktraces.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pandas as pd

from superset.common.db_query_status import QueryStatus
from superset.common.query_actions import _get_full, _sanitize_failed_payload


def _make_query_context(
    result_type: str = "full",
) -> MagicMock:
    """Build a mock QueryContext that returns a failed df payload."""
    qc = MagicMock()
    qc.result_format = "json"
    qc.result_type = result_type
    return qc


def _failed_payload(
    error_msg: str = "(psycopg2.errors.UndefinedTable) "
    'relation "secret_schema.internal_table" does not exist',
    query_sql: str = "SELECT col FROM secret_schema.internal_table WHERE id = 1",
    stacktrace: str = "Traceback (most recent call last):\n  File ...",
) -> dict[str, Any]:
    return {
        "cache_key": "abc123",
        "cached_dttm": None,
        "queried_dttm": None,
        "cache_timeout": 300,
        "df": pd.DataFrame(),
        "applied_template_filters": [],
        "applied_filter_columns": [],
        "rejected_filter_columns": [],
        "annotation_data": {},
        "error": error_msg,
        "is_cached": False,
        "query": query_sql,
        "status": QueryStatus.FAILED,
        "stacktrace": stacktrace,
        "rowcount": 0,
        "sql_rowcount": 0,
        "from_dttm": None,
        "to_dttm": None,
        "label_map": {},
        "warning": None,
    }


def test_sanitize_failed_payload_replaces_error() -> None:
    """Raw error message is replaced with a generic user-facing message."""
    payload = _failed_payload()
    _sanitize_failed_payload(payload)

    assert "secret_schema" not in payload["error"]
    assert "internal_table" not in payload["error"]
    assert "psycopg2" not in payload["error"]
    assert payload["error"]  # non-empty generic message


def test_sanitize_failed_payload_clears_query() -> None:
    """Raw SQL query string is removed from the payload."""
    payload = _failed_payload()
    _sanitize_failed_payload(payload)

    assert payload["query"] is None


def test_sanitize_failed_payload_clears_stacktrace() -> None:
    """Stacktrace is removed from the payload."""
    payload = _failed_payload()
    _sanitize_failed_payload(payload)

    assert payload["stacktrace"] is None


def test_get_full_sanitizes_failed_query(app_context: None) -> None:
    """
    End-to-end: _get_full returns a sanitized payload for a failed chart
    query — no raw SQL, no table names, no stacktrace.
    """
    raw_error = (
        '(psycopg2.errors.UndefinedColumn) column "revenue" '
        'of relation "finance.transactions" does not exist'
    )
    raw_sql = "SELECT revenue FROM finance.transactions"
    raw_stacktrace = "Traceback (most recent call last):\n  File ..."

    qc = _make_query_context()
    qc.get_df_payload.return_value = _failed_payload(
        error_msg=raw_error,
        query_sql=raw_sql,
        stacktrace=raw_stacktrace,
    )

    query_obj = MagicMock()
    query_obj.result_type = None
    query_obj.applied_time_extras = {}
    query_obj.datasource = None

    datasource = MagicMock()
    datasource.get_time_columns.return_value = []

    result = _get_full(qc, query_obj)

    # Must not contain any raw SQL or internal identifiers
    assert "finance" not in str(result)
    assert "transactions" not in str(result)
    assert "revenue" not in str(result)
    assert "psycopg2" not in str(result)
    assert "Traceback" not in str(result)

    # Must still have a non-empty generic error
    assert result.get("error")
    assert result["query"] is None
    assert result["stacktrace"] is None
    assert result["status"] == QueryStatus.FAILED


def test_get_full_preserves_successful_payload(app_context: None) -> None:
    """Successful queries are not modified by the sanitization logic."""
    qc = _make_query_context()
    raw_sql = "SELECT name FROM users"
    qc.get_df_payload.return_value = {
        "cache_key": "key1",
        "cached_dttm": None,
        "queried_dttm": None,
        "cache_timeout": 300,
        "df": pd.DataFrame({"name": ["Alice"]}),
        "applied_template_filters": [],
        "applied_filter_columns": [],
        "rejected_filter_columns": [],
        "annotation_data": {},
        "error": None,
        "is_cached": False,
        "query": raw_sql,
        "status": QueryStatus.SUCCESS,
        "stacktrace": None,
        "rowcount": 1,
        "sql_rowcount": 1,
        "from_dttm": None,
        "to_dttm": None,
        "label_map": {},
        "warning": None,
    }
    qc.get_data.return_value = [{"name": "Alice"}]

    query_obj = MagicMock()
    query_obj.result_type = None
    query_obj.applied_time_extras = {}
    query_obj.datasource = None

    datasource = MagicMock()
    datasource.get_time_columns.return_value = []

    result = _get_full(qc, query_obj)

    # Query field preserved for successful responses
    assert result["query"] == raw_sql
    assert result["status"] == QueryStatus.SUCCESS
