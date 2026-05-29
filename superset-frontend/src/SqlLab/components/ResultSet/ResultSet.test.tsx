/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { type ReactChild } from 'react';
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from 'spec/helpers/testing-library';
import configureStore from 'redux-mock-store';
import { Store } from 'redux';
import thunk from 'redux-thunk';
import fetchMock from 'fetch-mock';
import { setupAGGridModules } from '@superset-ui/core/components/ThemedAgGridReact';
import ResultSet from 'src/SqlLab/components/ResultSet';
import * as getBootstrapData from 'src/utils/getBootstrapData';
import {
  cachedQuery,
  failedQueryWithErrors,
  queries,
  stoppedQuery,
  initialState,
  user,
  queryWithNoQueryLimit,
  failedQueryWithFrontendTimeoutErrors,
} from 'src/SqlLab/fixtures';
import { FeatureFlag, isFeatureEnabled } from '@superset-ui/core';
import { ViewLocations } from 'src/SqlLab/contributions';
import {
  registerToolbarAction,
  cleanupExtensions,
} from 'spec/helpers/extensionTestHelpers';

jest.mock('@superset-ui/core', () => ({
  ...jest.requireActual('@superset-ui/core'),
  isFeatureEnabled: jest.fn().mockReturnValue(false),
}));

const mockIsFeatureEnabled = isFeatureEnabled as jest.Mock;

jest.mock('src/components/ErrorMessage', () => ({
  ErrorMessageWithStackTrace: () => <div data-test="error-message">Error</div>,
}));

const mockDownloadResultsAsCsv = jest.fn();
jest.mock('src/utils/common', () => ({
  ...jest.requireActual('src/utils/common'),
  downloadResultsAsCsv: (...args: unknown[]) =>
    mockDownloadResultsAsCsv(...args),
}));

jest.mock(
  'react-virtualized-auto-sizer',
  () =>
    ({ children }: { children: (params: { height: number }) => ReactChild }) =>
      children({ height: 500 }),
);
const applicationRootMock = jest.spyOn(getBootstrapData, 'applicationRoot');

const mockedProps = {
  cache: true,
  queryId: queries[0].id,
  height: 140,
  database: { allows_virtual_table_explore: true },
  displayLimit: 1000,
  defaultQueryLimit: 1000,
};
const stoppedQueryState = {
  ...initialState,
  sqlLab: {
    ...initialState.sqlLab,
    queries: {
      [stoppedQuery.id]: stoppedQuery,
    },
  },
};
const cachedQueryState = {
  ...initialState,
  sqlLab: {
    ...initialState.sqlLab,
    queries: {
      [cachedQuery.id]: cachedQuery,
    },
  },
};
const failedQueryWithErrorsState = {
  ...initialState,
  sqlLab: {
    ...initialState.sqlLab,
    queries: {
      [failedQueryWithErrors.id]: failedQueryWithErrors,
    },
  },
};
const failedQueryWithTimeoutState = {
  ...initialState,
  sqlLab: {
    ...initialState.sqlLab,
    queries: {
      [failedQueryWithFrontendTimeoutErrors.id]:
        failedQueryWithFrontendTimeoutErrors,
    },
  },
};

const newProps = {
  displayLimit: 1001,
};
const asyncQueryProps = {
  ...mockedProps,
  database: { allow_run_async: true },
};

const reRunQueryEndpoint = 'glob:*/api/v1/sqllab/execute/';
fetchMock.get('glob:*/api/v1/dataset/?*', { result: [] });
fetchMock.post(reRunQueryEndpoint, { result: [] });
fetchMock.get('glob:*/api/v1/sqllab/results/*', { result: [] });

beforeEach(() => {
  fetchMock.clearHistory();
});

const middlewares = [thunk];
const mockStore = configureStore(middlewares);
const setup = (props?: any, store?: Store) =>
  render(<ResultSet {...props} />, {
    useRedux: true,
    ...(store && { store }),
  });

// eslint-disable-next-line no-restricted-globals -- TODO: Migrate from describe blocks
describe('ResultSet', () => {
  beforeAll(() => {
    setupAGGridModules();
  });

  beforeEach(() => {
    applicationRootMock.mockReturnValue('');
    mockDownloadResultsAsCsv.mockClear();
  });

  // Add cleanup after each test
  afterEach(async () => {
    fetchMock.clearHistory();
    cleanupExtensions();
    // Wait for any pending effects to complete
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  test('renders a Table', async () => {
    const { getByTestId } = setup(
      mockedProps,
      mockStore({
        ...initialState,
        user,
        sqlLab: {
          ...initialState.sqlLab,
          queries: {
            [queries[0].id]: queries[0],
          },
        },
      }),
    );
    await waitFor(() => {
      const table = getByTestId('table-container');
      expect(table).toBeInTheDocument();
    });
  });

  test('should render success query', async () => {
    const query = queries[0];
    const { queryAllByText, getByTestId } = setup(
      mockedProps,
      mockStore({
        ...initialState,
        user,
        sqlLab: {
          ...initialState.sqlLab,
          queries: {
            [query.id]: query,
          },
        },
      }),
    );

    const table = getByTestId('table-container');
    expect(table).toBeInTheDocument();

    const firstColumn = queryAllByText(
      query.results?.columns[0].column_name ?? '',
    )[0];
    const secondColumn = queryAllByText(
      query.results?.columns[1].column_name ?? '',
    )[0];
    expect(firstColumn).toBeInTheDocument();
    expect(secondColumn).toBeInTheDocument();

    const exploreButton = getByTestId('explore-results-button');
    expect(exploreButton).toBeInTheDocument();
  });

  test('should render empty results', async () => {
    const query = {
      ...queries[0],
      results: { data: [] },
    };
    await waitFor(() => {
      setup(
        mockedProps,
        mockStore({
          ...initialState,
          user,
          sqlLab: {
            ...initialState.sqlLab,
            queries: {
              [query.id]: query,
            },
          },
        }),
      );
    });

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent('The query returned no data');
  });

  test('should call reRunQuery if timed out', async () => {
    const query = {
      ...queries[0],
      errorMessage: 'Your session timed out',
    };
    const store = mockStore({
      ...initialState,
      user,
      sqlLab: {
        ...initialState.sqlLab,
        queries: {
          [query.id]: query,
        },
      },
    });

    expect(fetchMock.callHistory.calls(reRunQueryEndpoint)).toHaveLength(0);
    setup(mockedProps, store);
    expect(store.getActions()).toHaveLength(1);
    expect(store.getActions()[0].query.errorMessage).toEqual(
      'Your session timed out',
    );
    expect(store.getActions()[0].type).toEqual('START_QUERY');
    await waitFor(() =>
      expect(fetchMock.callHistory.calls(reRunQueryEndpoint)).toHaveLength(1),
    );
  });

  test('should not call reRunQuery if no error', async () => {
    const query = queries[0];
    const store = mockStore({
      ...initialState,
      user,
      sqlLab: {
        ...initialState.sqlLab,
        queries: {
          [query.id]: query,
        },
      },
    });
    setup(mockedProps, store);
    expect(store.getActions()).toEqual([]);
    expect(fetchMock.callHistory.calls(reRunQueryEndpoint)).toHaveLength(0);
  });

  test('should render cached query', async () => {
    const store = mockStore(cachedQueryState);
    const { rerender } = setup(
      { ...mockedProps, queryId: cachedQuery.id },
      store,
    );

    rerender(<ResultSet {...mockedProps} {...newProps} />);
    expect(store.getActions()).toHaveLength(1);
    expect(store.getActions()[0].query.results).toEqual(cachedQuery.results);
    expect(store.getActions()[0].type).toEqual('CLEAR_QUERY_RESULTS');
  });

  test('should render stopped query', async () => {
    await waitFor(() => {
      setup(
        { ...mockedProps, queryId: stoppedQuery.id },
        mockStore(stoppedQueryState),
      );
    });

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
  });

  test('should render a failed query with an errors object', async () => {
    const { errors } = failedQueryWithErrors;

    await waitFor(() => {
      setup(
        { ...mockedProps, queryId: failedQueryWithErrors.id },
        mockStore(failedQueryWithErrorsState),
      );
    });
    const errorMessages = screen.getAllByTestId('error-message');
    expect(errorMessages).toHaveLength(errors.length);
  });

  test('should render a timeout error with a retrial button', async () => {
    await waitFor(() => {
      setup(
        { ...mockedProps, queryId: failedQueryWithFrontendTimeoutErrors.id },
        mockStore(failedQueryWithTimeoutState),
      );
    });
    expect(
      screen.getByRole('button', { name: /Retry fetching results/i }),
    ).toBeInTheDocument();
  });

  test('renders if there is no limit in query.results but has queryLimit', async () => {
    const query = {
      ...queries[0],
    };
    await waitFor(() => {
      setup(
        mockedProps,
        mockStore({
          ...initialState,
          user,
          sqlLab: {
            ...initialState.sqlLab,
            queries: {
              [query.id]: query,
            },
          },
        }),
      );
    });
    const { getByRole } = setup(mockedProps, mockStore(initialState));
    expect(getByRole('grid')).toBeInTheDocument();
  });

  test('renders if there is a limit in query.results but not queryLimit', async () => {
    const props = { ...mockedProps, queryId: queryWithNoQueryLimit.id };
    const { getByRole } = setup(
      props,
      mockStore({
        ...initialState,
        user,
        sqlLab: {
          ...initialState.sqlLab,
          queries: {
            [queryWithNoQueryLimit.id]: queryWithNoQueryLimit,
          },
        },
      }),
    );
    expect(getByRole('grid')).toBeInTheDocument();
  });

  test('Async queries - renders "Fetch data preview" button when data preview has no results', () => {
    const asyncRefetchDataPreviewQuery = {
      ...queries[0],
      state: 'success',
      results: undefined,
      isDataPreview: true,
    };
    setup(
      { ...asyncQueryProps, queryId: asyncRefetchDataPreviewQuery.id },
      mockStore({
        ...initialState,
        user,
        sqlLab: {
          ...initialState.sqlLab,
          queries: {
            [asyncRefetchDataPreviewQuery.id]: asyncRefetchDataPreviewQuery,
          },
        },
      }),
    );
    expect(
      screen.getByRole('button', {
        name: /fetch data preview/i,
      }),
    ).toBeVisible();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  test('Async queries - renders "Refetch results" button when a query has no results', () => {
    const asyncRefetchResultsTableQuery = {
      ...queries[0],
      state: 'success',
      results: undefined,
      resultsKey: 'async results key',
    };

    setup(
      { ...asyncQueryProps, queryId: asyncRefetchResultsTableQuery.id },
      mockStore({
        ...initialState,
        user,
        sqlLab: {
          ...initialState.sqlLab,
          queries: {
            [asyncRefetchResultsTableQuery.id]: asyncRefetchResultsTableQuery,
          },
        },
      }),
    );
    expect(
      screen.getByRole('button', {
        name: /refetch results/i,
      }),
    ).toBeVisible();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  test('Async queries - renders on the first call', () => {
    const query = {
      ...queries[0],
    };
    setup(
      { ...asyncQueryProps, queryId: query.id },
      mockStore({
        ...initialState,
        user,
        sqlLab: {
          ...initialState.sqlLab,
          queries: {
            [query.id]: query,
          },
        },
      }),
    );
    expect(screen.getByRole('grid')).toBeVisible();
    expect(
      screen.queryByRole('button', {
        name: /fetch data preview/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: /refetch results/i,
      }),
    ).not.toBeInTheDocument();
  });

  test('should trigger client-side CSV download when user has permission and clicks button', async () => {
    const { getByTestId } = setup(
      mockedProps,
      mockStore({
        ...initialState,
        user: {
          ...user,
          roles: {
            sql_lab: [['can_export_csv', 'SQLLab']],
          },
        },
        sqlLab: {
          ...initialState.sqlLab,
          queries: {
            [queries[0].id]: queries[0],
          },
        },
      }),
    );
    const csvButton = getByTestId('export-csv-button');
    expect(csvButton).toBeInTheDocument();
    expect(csvButton).toBeEnabled();

    fireEvent.click(csvButton);
    expect(mockDownloadResultsAsCsv).toHaveBeenCalledTimes(1);
    const { results } = queries[0];
    expect(mockDownloadResultsAsCsv).toHaveBeenCalledWith(
      results.data,
      results.columns.map((c: { column_name: string }) => c.column_name),
      expect.stringContaining('.csv'),
    );
  });

  test('should display a popup message when the CSV content is limited to the dropdown limit', async () => {
    const queryLimit = 2;
    const { getByTestId, findByRole } = setup(
      mockedProps,
      mockStore({
        ...initialState,
        user: {
          ...user,
          roles: {
            sql_lab: [['can_export_csv', 'SQLLab']],
          },
        },
        sqlLab: {
          ...initialState.sqlLab,
          queries: {
            [queries[0].id]: {
              ...queries[0],
              limitingFactor: 'DROPDOWN',
              queryLimit,
            },
          },
        },
      }),
    );

    await waitFor(() => {
      const downloadButton = getByTestId('export-csv-button');
      expect(downloadButton).toBeInTheDocument();
    });

    const downloadButton = getByTestId('export-csv-button');
    await waitFor(() => fireEvent.click(downloadButton));

    const warningModal = await findByRole('dialog');
    await waitFor(() => {
      expect(
        within(warningModal).getByText(`Download is on the way`),
      ).toBeInTheDocument();
    });
  });

  test('should not allow download as CSV when user does not have permission to export data', async () => {
    const { queryByTestId } = setup(
      mockedProps,
      mockStore({
        ...initialState,
        user,
        sqlLab: {
          ...initialState.sqlLab,
          queries: {
            [queries[0].id]: queries[0],
          },
        },
      }),
    );
    const csvButton = queryByTestId('export-csv-button');
    expect(csvButton).toBeInTheDocument();
    expect(csvButton).toBeDisabled();
  });

  test('should allow copy to clipboard when user has permission to export data', async () => {
    const { queryByTestId } = setup(
      mockedProps,
      mockStore({
        ...initialState,
        user: {
          ...user,
          roles: {
            sql_lab: [['can_export_csv', 'SQLLab']],
          },
        },
        sqlLab: {
          ...initialState.sqlLab,
          queries: {
            [queries[0].id]: queries[0],
          },
        },
      }),
    );
    expect(queryByTestId('copy-to-clipboard-button')).toBeInTheDocument();
  });

  test('should not allow copy to clipboard when user does not have permission to export data', async () => {
    const { queryByTestId } = setup(
      mockedProps,
      mockStore({
        ...initialState,
        user,
        sqlLab: {
          ...initialState.sqlLab,
          queries: {
            [queries[0].id]: queries[0],
          },
        },
      }),
    );
    const clipboardButton = queryByTestId('copy-to-clipboard-button');
    expect(clipboardButton).toBeInTheDocument();
    expect(clipboardButton).toBeDisabled();
  });

  test('should include sqlEditorImmutableId in query object when fetching results', async () => {
    const queryWithResultsKey = {
      ...queries[0],
      resultsKey: 'test-results-key',
      sqlEditorImmutableId: 'test-immutable-id-123',
    };

    const store = mockStore({
      ...initialState,
      user,
      sqlLab: {
        ...initialState.sqlLab,
        queries: {
          [queryWithResultsKey.id]: queryWithResultsKey,
        },
      },
    });

    setup({ ...mockedProps, queryId: queryWithResultsKey.id }, store);

    await waitFor(() => {
      // Check that REQUEST_QUERY_RESULTS action was dispatched
      const actions = store.getActions();
      const requestAction = actions.find(
        action => action.type === 'REQUEST_QUERY_RESULTS',
      );
      expect(requestAction).toBeDefined();
      // Verify sqlEditorImmutableId is present in the query object
      expect(requestAction?.query?.sqlEditorImmutableId).toBe(
        'test-immutable-id-123',
      );
    });

    // Verify the API was called
    const resultsCalls = fetchMock.callHistory.calls(
      'glob:*/api/v1/sqllab/results/*',
    );
    expect(resultsCalls).toHaveLength(1);
  });

  test('should not trigger download when user lacks export permission', async () => {
    const { getByTestId } = setup(
      mockedProps,
      mockStore({
        ...initialState,
        user,
        sqlLab: {
          ...initialState.sqlLab,
          queries: {
            [queries[0].id]: queries[0],
          },
        },
      }),
    );
    const csvButton = getByTestId('export-csv-button');
    expect(csvButton).toBeDisabled();

    fireEvent.click(csvButton);
    expect(mockDownloadResultsAsCsv).not.toHaveBeenCalled();
  });

  test('should show CSV button with granular can_export_data permission when flag is ON', async () => {
    mockIsFeatureEnabled.mockImplementation(
      (flag: FeatureFlag) => flag === FeatureFlag.GranularExportControls,
    );
    const { queryByTestId } = setup(
      mockedProps,
      mockStore({
        ...initialState,
        user: {
          ...user,
          roles: {
            sql_lab: [['can_export_data', 'Superset']],
          },
        },
        sqlLab: {
          ...initialState.sqlLab,
          queries: {
            [queries[0].id]: queries[0],
          },
        },
      }),
    );
    const csvButton = queryByTestId('export-csv-button');
    expect(csvButton).toBeInTheDocument();
    expect(csvButton).toBeEnabled();
    mockIsFeatureEnabled.mockReset();
  });

  test('should disable CSV button when granular flag is ON and user lacks can_export_data', async () => {
    mockIsFeatureEnabled.mockImplementation(
      (flag: FeatureFlag) => flag === FeatureFlag.GranularExportControls,
    );
    const { queryByTestId } = setup(
      mockedProps,
      mockStore({
        ...initialState,
        user: {
          ...user,
          roles: {
            sql_lab: [],
          },
        },
        sqlLab: {
          ...initialState.sqlLab,
          queries: {
            [queries[0].id]: queries[0],
          },
        },
      }),
    );
    const csvButton = queryByTestId('export-csv-button');
    expect(csvButton).toBeInTheDocument();
    expect(csvButton).toBeDisabled();
    mockIsFeatureEnabled.mockReset();
  });

  test('should show clipboard button with granular can_copy_clipboard permission when flag is ON', async () => {
    mockIsFeatureEnabled.mockImplementation(
      (flag: FeatureFlag) => flag === FeatureFlag.GranularExportControls,
    );
    const { queryByTestId } = setup(
      mockedProps,
      mockStore({
        ...initialState,
        user: {
          ...user,
          roles: {
            sql_lab: [['can_copy_clipboard', 'Superset']],
          },
        },
        sqlLab: {
          ...initialState.sqlLab,
          queries: {
            [queries[0].id]: queries[0],
          },
        },
      }),
    );
    const clipboardButton = queryByTestId('copy-to-clipboard-button');
    expect(clipboardButton).toBeInTheDocument();
    expect(clipboardButton).toBeEnabled();
    mockIsFeatureEnabled.mockReset();
  });

  test('should disable clipboard button when granular flag is ON and user lacks can_copy_clipboard', async () => {
    mockIsFeatureEnabled.mockImplementation(
      (flag: FeatureFlag) => flag === FeatureFlag.GranularExportControls,
    );
    const { queryByTestId } = setup(
      mockedProps,
      mockStore({
        ...initialState,
        user: {
          ...user,
          roles: {
            sql_lab: [['can_export_data', 'Superset']],
          },
        },
        sqlLab: {
          ...initialState.sqlLab,
          queries: {
            [queries[0].id]: queries[0],
          },
        },
      }),
    );
    const clipboardButton = queryByTestId('copy-to-clipboard-button');
    expect(clipboardButton).toBeInTheDocument();
    expect(clipboardButton).toBeDisabled();
    mockIsFeatureEnabled.mockReset();
  });

  test('should use legacy can_export_csv for both CSV and clipboard when granular flag is OFF', async () => {
    mockIsFeatureEnabled.mockReturnValue(false);
    const { queryByTestId } = setup(
      mockedProps,
      mockStore({
        ...initialState,
        user: {
          ...user,
          roles: {
            sql_lab: [['can_export_csv', 'SQLLab']],
          },
        },
        sqlLab: {
          ...initialState.sqlLab,
          queries: {
            [queries[0].id]: queries[0],
          },
        },
      }),
    );
    const csvButton = queryByTestId('export-csv-button');
    const clipboardButton = queryByTestId('copy-to-clipboard-button');
    expect(csvButton).toBeInTheDocument();
    expect(csvButton).toBeEnabled();
    expect(clipboardButton).toBeInTheDocument();
    expect(clipboardButton).toBeEnabled();
    mockIsFeatureEnabled.mockReset();
  });

  test('disabled CSV button should show permission tooltip when granular flag is ON', async () => {
    mockIsFeatureEnabled.mockImplementation(
      (flag: FeatureFlag) => flag === FeatureFlag.GranularExportControls,
    );
    const { getByTestId } = setup(
      mockedProps,
      mockStore({
        ...initialState,
        user: {
          ...user,
          roles: {
            sql_lab: [['can_copy_clipboard', 'Superset']],
          },
        },
        sqlLab: {
          ...initialState.sqlLab,
          queries: {
            [queries[0].id]: queries[0],
          },
        },
      }),
    );
    const csvButton = getByTestId('export-csv-button');
    expect(csvButton).toBeDisabled();
    fireEvent.mouseOver(csvButton.parentElement ?? csvButton);
    await waitFor(() => {
      expect(
        screen.getByText("You don't have permission to export data"),
      ).toBeInTheDocument();
    });
    mockIsFeatureEnabled.mockReset();
  });

  test('disabled clipboard button should show permission tooltip when granular flag is ON', async () => {
    mockIsFeatureEnabled.mockImplementation(
      (flag: FeatureFlag) => flag === FeatureFlag.GranularExportControls,
    );
    const { getByTestId } = setup(
      mockedProps,
      mockStore({
        ...initialState,
        user: {
          ...user,
          roles: {
            sql_lab: [['can_export_data', 'Superset']],
          },
        },
        sqlLab: {
          ...initialState.sqlLab,
          queries: {
            [queries[0].id]: queries[0],
          },
        },
      }),
    );
    const clipboardButton = getByTestId('copy-to-clipboard-button');
    expect(clipboardButton).toBeDisabled();
    fireEvent.mouseOver(clipboardButton.parentElement ?? clipboardButton);
    await waitFor(() => {
      expect(
        screen.getByText("You don't have permission to copy to clipboard"),
      ).toBeInTheDocument();
    });
    mockIsFeatureEnabled.mockReset();
  });

  test('renders contributed toolbar action in results slot', async () => {
    registerToolbarAction(
      ViewLocations.sqllab.results,
      'test-results-action',
      'Results Action',
      jest.fn(),
    );

    const { getByTestId } = setup(
      mockedProps,
      mockStore({
        ...initialState,
        user,
        sqlLab: {
          ...initialState.sqlLab,
          queries: {
            [queries[0].id]: queries[0],
          },
        },
      }),
    );

    await waitFor(() => {
      expect(getByTestId('table-container')).toBeInTheDocument();
    });

    expect(
      screen.getByRole('button', { name: 'Results Action' }),
    ).toBeInTheDocument();
  });
});
