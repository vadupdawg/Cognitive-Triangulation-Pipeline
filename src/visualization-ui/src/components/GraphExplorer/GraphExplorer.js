import React, { useState, useCallback } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Paper,
  Alert,
  CircularProgress,
  Divider,
  Grid,
} from '@mui/material';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useExecuteGraphQueryMutation } from '../../features/graphExplorer/graphExplorerApi';

const GraphExplorer = () => {
  const [cypherQuery, setCypherQuery] = useState('MATCH (n) RETURN n LIMIT 25');
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [rawResults, setRawResults] = useState(null);
  
  const [executeGraphQuery, { 
    isLoading, 
    error, 
    data: queryResult 
  }] = useExecuteGraphQueryMutation();

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const handleExecuteQuery = async () => {
    if (!cypherQuery.trim()) {
      return;
    }

    try {
      const result = await executeGraphQuery(cypherQuery).unwrap();
      
      // Update the graph visualization
      setNodes(result.nodes || []);
      setEdges(result.edges || []);
      setRawResults(result.rawResponse);
      
    } catch (err) {
      console.error('Failed to execute query:', err);
      // Error is handled by RTK Query and displayed in the UI
    }
  };

  const handleKeyPress = (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      handleExecuteQuery();
    }
  };

  const defaultViewport = { x: 0, y: 0, zoom: 1 };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h5" gutterBottom>
        Graph Explorer
      </Typography>
      
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Execute Cypher queries to explore the Neo4j knowledge graph. Use Ctrl+Enter to execute queries.
      </Typography>

      {/* Query Input Section */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Cypher Query
        </Typography>
        
        <TextField
          fullWidth
          multiline
          rows={4}
          value={cypherQuery}
          onChange={(e) => setCypherQuery(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Enter your Cypher query here..."
          variant="outlined"
          sx={{ mb: 2 }}
          disabled={isLoading}
        />
        
        <Button
          variant="contained"
          onClick={handleExecuteQuery}
          disabled={isLoading || !cypherQuery.trim()}
          startIcon={isLoading ? <CircularProgress size={20} /> : null}
        >
          {isLoading ? 'Executing...' : 'Execute Query'}
        </Button>
      </Paper>

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <Typography variant="subtitle2">Query Error:</Typography>
          {error.message || 'Failed to execute query'}
          {error.error && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              {error.error}
            </Typography>
          )}
        </Alert>
      )}

      {/* Results Section */}
      <Grid container spacing={2} sx={{ flexGrow: 1, minHeight: 0 }}>
        {/* Graph Visualization */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ height: '500px', position: 'relative' }}>
            <Typography variant="h6" sx={{ p: 2, pb: 1 }}>
              Graph Visualization
            </Typography>
            <Divider />
            
            <Box sx={{ height: 'calc(100% - 60px)' }}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                defaultViewport={defaultViewport}
                fitView
                attributionPosition="bottom-left"
              >
                <Controls />
                <MiniMap />
                <Background variant="dots" gap={12} size={1} />
              </ReactFlow>
            </Box>
          </Paper>
        </Grid>

        {/* Results Table/Info */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ height: '500px', overflow: 'auto' }}>
            <Typography variant="h6" sx={{ p: 2, pb: 1 }}>
              Query Results
            </Typography>
            <Divider />
            
            <Box sx={{ p: 2 }}>
              {rawResults ? (
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Records Found: {rawResults.records?.length || 0}
                  </Typography>
                  
                  <Typography variant="subtitle2" gutterBottom>
                    Nodes: {nodes.length}
                  </Typography>
                  
                  <Typography variant="subtitle2" gutterBottom>
                    Edges: {edges.length}
                  </Typography>

                  {nodes.length > 0 && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Node Details:
                      </Typography>
                      {nodes.slice(0, 5).map((node) => (
                        <Box key={node.id} sx={{ mb: 1, p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
                          <Typography variant="body2" fontWeight="bold">
                            {node.data.label}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Labels: {node.data.labels?.join(', ') || 'None'}
                          </Typography>
                        </Box>
                      ))}
                      {nodes.length > 5 && (
                        <Typography variant="caption" color="text.secondary">
                          ... and {nodes.length - 5} more nodes
                        </Typography>
                      )}
                    </Box>
                  )}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Execute a query to see results here
                </Typography>
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default GraphExplorer;