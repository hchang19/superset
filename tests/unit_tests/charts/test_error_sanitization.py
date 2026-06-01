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
from __future__ import annotations

import contextlib
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from superset.commands.chart.exceptions import ChartDataQueryFailedError
from superset.common.db_query_status import QueryStatus
from superset.utils import json


@pytest.fixture
def chart_data_api():
    """Create a ChartDataRestApi instance with mocked dependencies."""
    from superset.charts.data.api import ChartDataRestApi

    api = ChartDataRestApi.__new__(ChartDataRestApi)
    return api


@pytest.fixture
def mock_event_logger():
    """Patch event_logger with a proper context manager."""
    mock_el = MagicMock()
    mock_el.log_context.return_value = contextlib.nullcontext()
    with patch("superset.charts.data.api.event_logger", mock_el):
        yield mock_el


@pytest.fixture
def mock_security_manager():
    """Patch security_manager."""
    with patch("superset.charts.data.api.security_manager") as mock_sm:
        mock_sm.is_guest_user = MagicMock(return_value=False)
        yield mock_sm


def test_send_chart_response_strips_stacktrace_from_failed_queries(
    app_context: None,
    chart_data_api: Any,
    mock_event_logger: MagicMock,
    mock_security_manager: MagicMock,
) -> None:
    """
    Regression test: stacktrace must never appear in error responses.
    Internal Python tracebacks expose file paths and implementation details.
    """
    result = {
        "query_context": MagicMock(
            result_type="full",
            result_format="json",
        ),
        "queries": [
            {
                "status": QueryStatus.FAILED,
                "error": (
                    "(psycopg2.errors.UndefinedTable) relation "
                    '"secret_schema.users" does not exist\n'
                    "LINE 1: SELECT * FROM secret_schema.users"
                ),
                "query": "SELECT * FROM secret_schema.users WHERE id = 1",
                "stacktrace": (
                    "Traceback (most recent call last):\n"
                    '  File "/app/superset/models/helpers.py", line 1189...'
                ),
                "data": None,
                "rowcount": 0,
            }
        ],
    }

    response = chart_data_api._send_chart_response(result)

    response_data = json.loads(response.data)
    query_result = response_data["result"][0]

    assert "stacktrace" not in query_result
    assert "secret_schema" not in query_result.get("error", "")
    assert "users" not in query_result.get("error", "")
    assert "SELECT" not in query_result.get("error", "")
    assert "query" not in query_result


def test_send_chart_response_preserves_query_for_successful_results(
    app_context: None,
    chart_data_api: Any,
    mock_event_logger: MagicMock,
    mock_security_manager: MagicMock,
) -> None:
    """
    Successful queries should still include the SQL in the response
    (used by the View Query modal).
    """
    result = {
        "query_context": MagicMock(
            result_type="full",
            result_format="json",
        ),
        "queries": [
            {
                "status": QueryStatus.SUCCESS,
                "error": None,
                "query": "SELECT col1, COUNT(*) FROM my_table GROUP BY col1",
                "data": [{"col1": "a", "count": 10}],
                "rowcount": 1,
            }
        ],
    }

    response = chart_data_api._send_chart_response(result)

    response_data = json.loads(response.data)
    query_result = response_data["result"][0]

    assert query_result["query"] == "SELECT col1, COUNT(*) FROM my_table GROUP BY col1"
    assert "stacktrace" not in query_result
    assert query_result["status"] == QueryStatus.SUCCESS


def test_send_chart_response_strips_stacktrace_from_successful_queries(
    app_context: None,
    chart_data_api: Any,
    mock_event_logger: MagicMock,
    mock_security_manager: MagicMock,
) -> None:
    """
    Even successful queries should not have stacktrace in the response.
    """
    result = {
        "query_context": MagicMock(
            result_type="full",
            result_format="json",
        ),
        "queries": [
            {
                "status": QueryStatus.SUCCESS,
                "error": None,
                "query": "SELECT 1",
                "stacktrace": "some internal trace",
                "data": [{"1": 1}],
                "rowcount": 1,
            }
        ],
    }

    response = chart_data_api._send_chart_response(result)

    response_data = json.loads(response.data)
    query_result = response_data["result"][0]

    assert "stacktrace" not in query_result


def test_get_data_response_returns_generic_error_on_query_failure(
    app_context: None,
    chart_data_api: Any,
) -> None:
    """
    Regression test: when ChartDataQueryFailedError is raised, the API
    must return a generic message that does not leak internal table/schema
    names or raw SQL fragments.
    """
    raw_error = (
        'Error: (psycopg2.errors.UndefinedColumn) column "secret_col" '
        "does not exist\nLINE 1: SELECT secret_col FROM internal_schema.payments"
    )
    command = MagicMock()
    command.run.side_effect = ChartDataQueryFailedError(raw_error)

    with patch.object(chart_data_api, "response_400") as mock_response_400:
        mock_response_400.return_value = MagicMock()
        chart_data_api._get_data_response(command=command)

    call_kwargs = mock_response_400.call_args
    message = call_kwargs.kwargs.get("message") or call_kwargs[1].get("message")

    assert "secret_col" not in message
    assert "internal_schema" not in message
    assert "payments" not in message
    assert "SELECT" not in message
