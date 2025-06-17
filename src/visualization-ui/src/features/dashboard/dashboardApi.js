import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

// Create the dashboard API slice using RTK Query
export const dashboardApi = createApi({
  reducerPath: 'dashboardApi',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api/stats',
  }),
  tagTypes: ['DashboardStats'],
  endpoints: (builder) => ({
    // Fetch pending work queue count
    getPendingWorkQueueCount: builder.query({
      query: () => 'work_queue/pending',
      providesTags: ['DashboardStats'],
    }),
    // Fetch processing work queue count
    getProcessingWorkQueueCount: builder.query({
      query: () => 'work_queue/processing',
      providesTags: ['DashboardStats'],
    }),
    // Fetch pending ingestion analysis results count
    getPendingIngestionCount: builder.query({
      query: () => 'analysis_results/pending_ingestion',
      providesTags: ['DashboardStats'],
    }),
    // Fetch failed work count
    getFailedWorkCount: builder.query({
      query: () => 'failed_work/count',
      providesTags: ['DashboardStats'],
    }),
  }),
});

// Export hooks for usage in functional components
export const {
  useGetPendingWorkQueueCountQuery,
  useGetProcessingWorkQueueCountQuery,
  useGetPendingIngestionCountQuery,
  useGetFailedWorkCountQuery,
} = dashboardApi;