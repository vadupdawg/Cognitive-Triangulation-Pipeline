import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

// Create the work queue API slice using RTK Query
export const workQueueApi = createApi({
  reducerPath: 'workQueueApi',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api',
  }),
  tagTypes: ['WorkQueueItem'],
  endpoints: (builder) => ({
    // Fetch all work queue items
    getWorkQueue: builder.query({
      query: () => 'work_queue',
      providesTags: ['WorkQueueItem'],
    }),
    // Fetch a specific work queue item by ID
    getWorkQueueItem: builder.query({
      query: (id) => `work_queue/${id}`,
      providesTags: (result, error, id) => [{ type: 'WorkQueueItem', id }],
    }),
  }),
});

// Export hooks for usage in functional components
export const {
  useGetWorkQueueQuery,
  useGetWorkQueueItemQuery,
} = workQueueApi;