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
Regression tests for SQL error response sanitization (Issue #75).

Verifies that failed chart query responses do not expose internal
table/schema names, raw SQL, or stack traces to the client.
"""

from unittest.mock import Mock, patch

import pandas as pd

from superset.common.db_query_status import QueryStatus
from superset.common.query_actions import _get_full


def _make_payload(
    error: str,
    query: str = "SELECT * FROM secret_schema.internal_table",
    stacktrace: str | None = "Traceback (most recent call last):\n  ...",
) -> dict[str, object]:
    return {
        "cache_key": "test_key",
        "cached_dttm": None,
        "queried_dttm": None,
        "cache_timeout": 300,
        "df": pd.DataFrame(),
        "applied_template_filters": [],
        "applied_filter_columns": [],
        "rejected_filter_columns": [],
        "annotation_data": {},
        "error": error,
        "is_cached": False,
        "query": query,
        "status": QueryStatus.FAILED,
        "stacktrace": stacktrace,
        "rowcount": 0,
        "sql_rowcount": 0,
        "from_dttm": None,
        "to_dttm": None,
        "label_map": {},
        "warning": None,
    }


@patch("superset.common.query_actions._get_datasource")
def test_failed_query_strips_raw_sql_from_response(mock_get_ds: Mock) -> None:
    """
    Regression: Issue #75 — raw SQL must not appear in failed query responses.

    When a chart query fails, the response payload must not contain the
    generated SQL query string which exposes internal table/schema names.
    """
    mock_datasource = Mock()
    mock_datasource.data = {"verbose_map": {}}
    mock_datasource.columns = []
    mock_get_ds.return_value = mock_datasource

    mock_query_context = Mock()
    mock_query_context.result_type = None
    mock_query_context.result_format = "json"
    mock_query_context.get_df_payload.return_value = _make_payload(
        error='relation "secret_schema.internal_table" does not exist',
        query="SELECT col1 FROM secret_schema.internal_table WHERE id = 1",
    )

    mock_query_obj = Mock()
    mock_query_obj.result_type = None
    mock_query_obj.applied_time_extras = {}
    mock_query_obj.datasource = None

    result = _get_full(mock_query_context, mock_query_obj, False)

    assert "query" not in result
    assert "stacktrace" not in result
    assert "secret_schema" not in str(result)
    assert "internal_table" not in str(result)
    assert "error occurred" in result["error"].lower()


@patch("superset.common.query_actions._get_datasource")
def test_failed_query_strips_stacktrace_from_response(mock_get_ds: Mock) -> None:
    """
    Regression: Issue #75 — stack traces must not appear in failed query responses.

    Python stack traces can reveal file paths, internal module structure,
    and partial SQL/query context.
    """
    mock_datasource = Mock()
    mock_datasource.data = {"verbose_map": {}}
    mock_datasource.columns = []
    mock_get_ds.return_value = mock_datasource

    mock_query_context = Mock()
    mock_query_context.result_type = None
    mock_query_context.result_format = "json"
    mock_query_context.get_df_payload.return_value = _make_payload(
        error="execution error",
        stacktrace="Traceback:\n  File superset/connectors/sqla/models.py\n  ...",
    )

    mock_query_obj = Mock()
    mock_query_obj.result_type = None
    mock_query_obj.applied_time_extras = {}
    mock_query_obj.datasource = None

    result = _get_full(mock_query_context, mock_query_obj, False)

    assert "stacktrace" not in result
    assert "Traceback" not in str(result)


@patch("superset.common.query_actions._get_datasource")
def test_successful_query_preserves_query_field(mock_get_ds: Mock) -> None:
    """
    Regression: Issue #75 — successful queries must still include the query field.

    The fix must not break the View Query feature for successful queries.
    """
    mock_datasource = Mock()
    mock_datasource.data = {"verbose_map": {}}
    mock_datasource.columns = []
    mock_get_ds.return_value = mock_datasource

    df = pd.DataFrame({"col1": [1, 2, 3]})

    mock_query_context = Mock()
    mock_query_context.result_type = None
    mock_query_context.result_format = "json"
    mock_query_context.get_df_payload.return_value = {
        "cache_key": "test_key",
        "cached_dttm": None,
        "queried_dttm": None,
        "cache_timeout": 300,
        "df": df,
        "applied_template_filters": [],
        "applied_filter_columns": [],
        "rejected_filter_columns": [],
        "annotation_data": {},
        "error": None,
        "is_cached": False,
        "query": "SELECT col1 FROM my_table",
        "status": QueryStatus.SUCCESS,
        "stacktrace": None,
        "rowcount": 3,
        "sql_rowcount": 3,
        "from_dttm": None,
        "to_dttm": None,
        "label_map": {},
        "warning": None,
    }
    mock_query_context.get_data.return_value = [{"col1": 1}, {"col1": 2}, {"col1": 3}]

    mock_query_obj = Mock()
    mock_query_obj.result_type = None
    mock_query_obj.applied_time_extras = {}
    mock_query_obj.datasource = None

    result = _get_full(mock_query_context, mock_query_obj, False)

    assert result["query"] == "SELECT col1 FROM my_table"
    assert result["status"] == QueryStatus.SUCCESS


@patch("superset.common.query_actions._get_datasource")
def test_failed_query_error_field_sanitized(mock_get_ds: Mock) -> None:
    """
    The error field is replaced with a generic message so that raw DB
    error details (which may contain table/schema names) are not leaked.
    """
    mock_datasource = Mock()
    mock_datasource.data = {"verbose_map": {}}
    mock_datasource.columns = []
    mock_get_ds.return_value = mock_datasource

    mock_query_context = Mock()
    mock_query_context.result_type = None
    mock_query_context.result_format = "json"
    mock_query_context.get_df_payload.return_value = _make_payload(
        error='column "nonexistent" does not exist',
        query="SELECT nonexistent FROM schema.table",
    )

    mock_query_obj = Mock()
    mock_query_obj.result_type = None
    mock_query_obj.applied_time_extras = {}
    mock_query_obj.datasource = None

    result = _get_full(mock_query_context, mock_query_obj, False)

    # error field is sanitized — no raw DB error details
    assert "nonexistent" not in result["error"]
    assert "schema.table" not in result["error"]
    assert "error occurred" in result["error"].lower()
    # query and stacktrace are stripped
    assert "query" not in result
    assert "stacktrace" not in result
