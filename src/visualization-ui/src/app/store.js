import { configureStore } from '@reduxjs/toolkit';
import { workQueueApi } from '../features/workQueue/workQueueApi';
import { analysisResultsApi } from '../features/analysisResults/analysisResultsApi';
import { failedWorkApi } from '../features/failedWork/failedWorkApi';
import { dashboardApi } from '../features/dashboard/dashboardApi';
import { graphExplorerApi } from '../features/graphExplorer/graphExplorerApi';

export const store = configureStore({
  reducer: {
    [workQueueApi.reducerPath]: workQueueApi.reducer,
    [analysisResultsApi.reducerPath]: analysisResultsApi.reducer,
    [failedWorkApi.reducerPath]: failedWorkApi.reducer,
    [dashboardApi.reducerPath]: dashboardApi.reducer,
    [graphExplorerApi.reducerPath]: graphExplorerApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      workQueueApi.middleware,
      analysisResultsApi.middleware,
      failedWorkApi.middleware,
      dashboardApi.middleware,
      graphExplorerApi.middleware
    ),
});