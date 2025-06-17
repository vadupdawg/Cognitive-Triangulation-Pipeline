import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const analysisResultsApi = createApi({
  reducerPath: 'analysisResultsApi',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api',
  }),
  tagTypes: ['AnalysisResult'],
  endpoints: (builder) => ({
    getAnalysisResults: builder.query({
      query: () => 'analysis_results',
      providesTags: ['AnalysisResult'],
    }),
  }),
});

export const { useGetAnalysisResultsQuery } = analysisResultsApi;