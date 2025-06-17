import React, { useState } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { Box, Typography, Paper, Alert, CircularProgress } from '@mui/material';
import { useGetWorkQueueQuery } from '../../features/workQueue/workQueueApi';

const WorkQueueExplorer = () => {
  const [selectedRow, setSelectedRow] = useState(null);
  const { data: workQueueData, error, isLoading } = useGetWorkQueueQuery();

  // Define columns for the DataGrid
  const columns = [
    {
      field: 'id',
      headerName: 'ID',
      width: 90,
      type: 'number',
    },
    {
      field: 'file_path',
      headerName: 'File Path',
      width: 300,
      flex: 1,
    },
    {
      field: 'content_hash',
      headerName: 'Content Hash',
      width: 200,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
          {params.value ? params.value.substring(0, 12) + '...' : 'N/A'}
        </Typography>
      ),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: (params) => (
        <Typography
          variant="body2"
          sx={{
            color: params.value === 'pending' ? 'orange' : 
                   params.value === 'processing' ? 'blue' : 
                   params.value === 'completed' ? 'green' : 'red',
            fontWeight: 'bold',
          }}
        >
          {params.value}
        </Typography>
      ),
    },
    {
      field: 'worker_id',
      headerName: 'Worker ID',
      width: 120,
      renderCell: (params) => (
        <Typography variant="body2">
          {params.value || 'N/A'}
        </Typography>
      ),
    },
    {
      field: 'last_updated',
      headerName: 'Last Updated',
      width: 180,
      renderCell: (params) => (
        <Typography variant="body2">
          {params.value ? new Date(params.value).toLocaleString() : 'N/A'}
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
          Loading work queue data...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        Error loading work queue data: {error.message || 'Unknown error'}
      </Alert>
    );
  }

  const rows = workQueueData || [];

  return (
    <Box sx={{ height: '100%', width: '100%' }}>
      <Typography variant="h5" gutterBottom>
        Work Queue Explorer
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Detailed inspection of the work_queue table. Click on a row to view details.
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

        {/* Detail Pane */}
        {selectedRow && (
          <Paper sx={{ width: 400, p: 2, overflow: 'auto' }}>
            <Typography variant="h6" gutterBottom>
              Work Item Details
            </Typography>
            
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="text.secondary">
                ID:
              </Typography>
              <Typography variant="body2">{selectedRow.id}</Typography>
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="text.secondary">
                File Path:
              </Typography>
              <Typography 
                variant="body2" 
                sx={{ 
                  fontFamily: 'monospace', 
                  wordBreak: 'break-all',
                  backgroundColor: 'grey.100',
                  p: 1,
                  borderRadius: 1,
                }}
              >
                {selectedRow.file_path}
              </Typography>
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Content Hash:
              </Typography>
              <Typography 
                variant="body2" 
                sx={{ 
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                  backgroundColor: 'grey.100',
                  p: 1,
                  borderRadius: 1,
                }}
              >
                {selectedRow.content_hash || 'N/A'}
              </Typography>
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Status:
              </Typography>
              <Typography 
                variant="body2"
                sx={{
                  color: selectedRow.status === 'pending' ? 'orange' : 
                         selectedRow.status === 'processing' ? 'blue' : 
                         selectedRow.status === 'completed' ? 'green' : 'red',
                  fontWeight: 'bold',
                }}
              >
                {selectedRow.status}
              </Typography>
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Worker ID:
              </Typography>
              <Typography variant="body2">
                {selectedRow.worker_id || 'Not assigned'}
              </Typography>
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Last Updated:
              </Typography>
              <Typography variant="body2">
                {selectedRow.last_updated 
                  ? new Date(selectedRow.last_updated).toLocaleString() 
                  : 'N/A'}
              </Typography>
            </Box>
          </Paper>
        )}
      </Box>
    </Box>
  );
};

export default WorkQueueExplorer;