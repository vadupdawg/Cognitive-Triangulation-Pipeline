import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  useGetPendingWorkQueueCountQuery,
  useGetProcessingWorkQueueCountQuery,
  useGetPendingIngestionCountQuery,
  useGetFailedWorkCountQuery,
} from '../../features/dashboard/dashboardApi';
import LogStream from './LogStream';

// Individual stat card component
const StatCard = ({ title, value, isLoading, error, color = 'primary' }) => {
  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flexGrow: 1, textAlign: 'center' }}>
        <Typography variant="h6" component="div" gutterBottom color="text.secondary">
          {title}
        </Typography>
        {isLoading ? (
          <CircularProgress size={40} />
        ) : error ? (
          <Alert severity="error" sx={{ mt: 1 }}>
            Error loading data
          </Alert>
        ) : (
          <Typography variant="h3" component="div" color={color}>
            {value}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

const Dashboard = () => {
  // Fetch data using RTK Query hooks
  const {
    data: pendingWorkData,
    isLoading: pendingWorkLoading,
    error: pendingWorkError,
  } = useGetPendingWorkQueueCountQuery();

  const {
    data: processingWorkData,
    isLoading: processingWorkLoading,
    error: processingWorkError,
  } = useGetProcessingWorkQueueCountQuery();

  const {
    data: pendingIngestionData,
    isLoading: pendingIngestionLoading,
    error: pendingIngestionError,
  } = useGetPendingIngestionCountQuery();

  const {
    data: failedWorkData,
    isLoading: failedWorkLoading,
    error: failedWorkError,
  } = useGetFailedWorkCountQuery();

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Typography variant="h4" gutterBottom>
        Pipeline Dashboard
      </Typography>
      <Typography variant="body1" gutterBottom sx={{ mb: 3 }}>
        Real-time overview of the pipeline's health and status
      </Typography>
      
      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Work Queue (Pending)"
            value={pendingWorkData?.count || 0}
            isLoading={pendingWorkLoading}
            error={pendingWorkError}
            color="info.main"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Work Queue (Processing)"
            value={processingWorkData?.count || 0}
            isLoading={processingWorkLoading}
            error={processingWorkError}
            color="warning.main"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Analysis Results (Pending Ingestion)"
            value={pendingIngestionData?.count || 0}
            isLoading={pendingIngestionLoading}
            error={pendingIngestionError}
            color="success.main"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Failed Tasks"
            value={failedWorkData?.count || 0}
            isLoading={failedWorkLoading}
            error={failedWorkError}
            color="error.main"
          />
        </Grid>
      </Grid>
      
      {/* Log Stream Component */}
      <LogStream />
    </Box>
  );
};

export default Dashboard;