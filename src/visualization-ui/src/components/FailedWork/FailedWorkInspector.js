import React, { useState } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { Box, Typography, Paper, Alert, CircularProgress } from '@mui/material';
import { useGetFailedWorkQuery } from '../../features/failedWork/failedWorkApi';

const FailedWorkInspector = () => {
  const [selectedRow, setSelectedRow] = useState(null);
  const { data: failedWorkData, error, isLoading } = useGetFailedWorkQuery();

  // Define columns for the DataGrid
  const columns = [
    {
      field: 'id',
      headerName: 'ID',
      width: 90,
      type: 'number',
    },
    {
      field: 'work_item_id',
      headerName: 'Work Item ID',
      width: 120,
      type: 'number',
    },
    {
      field: 'created_at',
      headerName: 'Created At',
      width: 180,
      renderCell: (params) => (
        <Typography variant="body2">
          {params.value ? new Date(params.value).toLocaleString() : 'N/A'}
        </Typography>
      ),
    },
    {
      field: 'error_message',
      headerName: 'Error Preview',
      width: 300,
      flex: 1,
      renderCell: (params) => (
        <Typography 
          variant="body2" 
          sx={{ 
            color: 'error.main',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {params.value ? params.value.substring(0, 50) + '...' : 'N/A'}
        </Typography>
      ),
    },
  ];

  // Handle row selection
  const handleRowClick = (params) => {
    setSelectedRow(params.row);
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
        <Typography variant="body1" sx={{ ml: 2 }}>
          Loading failed work data...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        Error loading failed work data: {error.message || 'Unknown error'}
      </Alert>
    );
  }

  const rows = failedWorkData || [];

  return (
    <Box sx={{ height: '100%', width: '100%' }}>
      <Typography variant="h5" gutterBottom>
        Failed Work Inspector
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Tasks that have failed permanently. Click on a row to view the full error message.
      </Typography>

      <Box sx={{ display: 'flex', gap: 2, height: 'calc(100vh - 200px)' }}>
        {/* Data Grid */}
        <Box sx={{ flex: 1 }}>
          <DataGrid
            rows={rows}
            columns={columns}
            pageSize={25}
            rowsPerPageOptions={[10, 25, 50, 100]}
            checkboxSelection={false}
            disableSelectionOnClick={false}
            onRowClick={handleRowClick}
            sx={{
              '& .MuiDataGrid-row:hover': {
                cursor: 'pointer',
              },
            }}
          />
        </Box>

        {/* Error Detail Pane */}
        {selectedRow && (
          <Paper sx={{ width: 400, p: 2, overflow: 'auto' }}>
            <Typography variant="h6" gutterBottom color="error.main">
              Failed Work Details
            </Typography>
            
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="text.secondary">
                ID:
              </Typography>
              <Typography variant="body2">{selectedRow.id}</Typography>
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Work Item ID:
              </Typography>
              <Typography variant="body2">{selectedRow.work_item_id}</Typography>
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Created At:
              </Typography>
              <Typography variant="body2">
                {selectedRow.created_at 
                  ? new Date(selectedRow.created_at).toLocaleString() 
                  : 'N/A'}
              </Typography>
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Error Message:
              </Typography>
              <Paper 
                sx={{ 
                  p: 2,
                  backgroundColor: 'error.light',
                  color: 'error.contrastText',
                  maxHeight: 300,
                  overflow: 'auto',
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {selectedRow.error_message || 'No error message available'}
              </Paper>
            </Box>
          </Paper>
        )}
      </Box>
    </Box>
  );
};

export default FailedWorkInspector;