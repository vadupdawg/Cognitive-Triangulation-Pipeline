import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import ReactJson from 'react-json-view';
import { useGetAnalysisResultsQuery } from '../../features/analysisResults/analysisResultsApi';

const AnalysisResultsViewer = () => {
  const [selectedRow, setSelectedRow] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const {
    data: analysisResults,
    error,
    isLoading,
  } = useGetAnalysisResultsQuery();

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
      width: 130,
      type: 'number',
    },
    {
      field: 'file_path',
      headerName: 'File Path',
      width: 300,
      flex: 1,
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
    },
    {
      field: 'created_at',
      headerName: 'Created At',
      width: 180,
      type: 'dateTime',
      valueGetter: (params) => {
        return params.value ? new Date(params.value) : null;
      },
    },
  ];

  const handleRowClick = (params) => {
    setSelectedRow(params.row);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setSelectedRow(null);
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mt: 2 }}>
        Error loading analysis results: {error.message || 'Unknown error'}
      </Alert>
    );
  }

  const rows = analysisResults || [];

  return (
    <Box sx={{ height: '100%', width: '100%' }}>
      <Typography variant="h5" gutterBottom>
        Analysis Results Viewer
      </Typography>
      
      <Paper sx={{ height: 600, width: '100%' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          pageSize={25}
          rowsPerPageOptions={[25, 50, 100]}
          disableSelectionOnClick
          onRowClick={handleRowClick}
          sx={{
            '& .MuiDataGrid-row:hover': {
              cursor: 'pointer',
            },
          }}
        />
      </Paper>

      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          LLM Output - {selectedRow?.file_path}
        </DialogTitle>
        <DialogContent>
          {selectedRow?.llm_output ? (
            <Box sx={{ mt: 1 }}>
              <ReactJson
                src={selectedRow.llm_output}
                theme="rjv-default"
                collapsed={1}
                displayDataTypes={false}
                displayObjectSize={false}
                enableClipboard={true}
                indentWidth={2}
                name={false}
              />
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No LLM output available for this record.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AnalysisResultsViewer;