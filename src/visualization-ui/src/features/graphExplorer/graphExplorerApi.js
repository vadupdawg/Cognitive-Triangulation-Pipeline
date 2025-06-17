import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const graphExplorerApi = createApi({
  reducerPath: 'graphExplorerApi',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api/graph',
    prepareHeaders: (headers) => {
      headers.set('Content-Type', 'application/json');
      return headers;
    },
  }),
  tagTypes: ['GraphQuery'],
  endpoints: (builder) => ({
    executeGraphQuery: builder.mutation({
      query: (cypherQuery) => ({
        url: '/query',
        method: 'POST',
        body: { query: cypherQuery },
      }),
      transformResponse: (response) => {
        // Transform the Neo4j response into a format suitable for ReactFlow
        if (!response || !response.records) {
          return { nodes: [], edges: [] };
        }

        const nodes = new Map();
        const edges = [];

        response.records.forEach((record) => {
          // Process each record from Neo4j
          record._fields.forEach((field, index) => {
            const fieldName = record.keys[index];
            
            if (field && typeof field === 'object') {
              // Handle Node objects
              if (field.labels && field.properties && field.identity) {
                const nodeId = field.identity.toString();
                if (!nodes.has(nodeId)) {
                  nodes.set(nodeId, {
                    id: nodeId,
                    type: 'default',
                    position: { 
                      x: Math.random() * 500, 
                      y: Math.random() * 500 
                    },
                    data: {
                      label: field.properties.name || field.labels[0] || `Node ${nodeId}`,
                      properties: field.properties,
                      labels: field.labels,
                    },
                    style: {
                      background: '#ff6b6b',
                      color: '#fff',
                      border: '1px solid #ff5252',
                      borderRadius: '8px',
                      padding: '10px',
                    },
                  });
                }
              }
              
              // Handle Relationship objects
              if (field.type && field.start && field.end) {
                const edgeId = `${field.start}-${field.end}-${field.type}`;
                edges.push({
                  id: edgeId,
                  source: field.start.toString(),
                  target: field.end.toString(),
                  type: 'default',
                  label: field.type,
                  data: {
                    properties: field.properties || {},
                    type: field.type,
                  },
                  style: {
                    stroke: '#4ecdc4',
                    strokeWidth: 2,
                  },
                  labelStyle: {
                    fill: '#4ecdc4',
                    fontWeight: 600,
                  },
                });
              }
            }
          });
        });

        return {
          nodes: Array.from(nodes.values()),
          edges: edges,
          rawResponse: response,
        };
      },
      transformErrorResponse: (response) => {
        return {
          status: response.status,
          message: response.data?.message || 'Failed to execute graph query',
          error: response.data?.error || 'Unknown error occurred',
        };
      },
    }),
  }),
});

export const { useExecuteGraphQueryMutation } = graphExplorerApi;