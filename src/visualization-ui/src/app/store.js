import { configureStore } from '@reduxjs/toolkit';
import { workQueueApi } from '../features/workQueue/workQueueApi';
import { analysisResultsApi } from '../features/analysisResults/analysisResultsApi';

export const store = configureStore({
  reducer: {
    [workQueueApi.reducerPath]: workQueueApi.reducer,
    [analysisResultsApi.reducerPath]: analysisResultsApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      workQueueApi.middleware,
      analysisResultsApi.middleware
    ),
});