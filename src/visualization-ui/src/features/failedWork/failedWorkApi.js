import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

// Create the failed work API slice using RTK Query
export const failedWorkApi = createApi({
  reducerPath: 'failedWorkApi',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api',
  }),
  tagTypes: ['FailedWorkItem'],
  endpoints: (builder) => ({
    // Fetch all failed work items
    getFailedWork: builder.query({
      query: () => 'failed_work',
      providesTags: ['FailedWorkItem'],
    }),
    // Fetch a specific failed work item by ID
    getFailedWorkItem: builder.query({
      query: (id) => `failed_work/${id}`,
      providesTags: (result, error, id) => [{ type: 'FailedWorkItem', id }],
    }),
  }),
});

// Export hooks for usage in functional components
export const {
  useGetFailedWorkQuery,
  useGetFailedWorkItemQuery,
} = failedWorkApi;