import React, { useState } from 'react';
import { Box, Tabs, Tab, Typography } from '@mui/material';
import WorkQueueExplorer from '../WorkQueue/WorkQueueExplorer';
import AnalysisResultsViewer from '../AnalysisResults/AnalysisResultsViewer';

// Tab panel component to display content for each tab
function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

// Helper function for tab accessibility props
function a11yProps(index) {
  return {
    id: `simple-tab-${index}`,
    'aria-controls': `simple-tabpanel-${index}`,
  };
}

const MainTabs = () => {
  const [value, setValue] = useState(0);

  const handleChange = (event, newValue) => {
    setValue(newValue);
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={value} onChange={handleChange} aria-label="backend visualization tabs">
          <Tab label="Dashboard" {...a11yProps(0)} />
          <Tab label="Work Queue" {...a11yProps(1)} />
          <Tab label="Analysis Results" {...a11yProps(2)} />
          <Tab label="Failed Work" {...a11yProps(3)} />
          <Tab label="Graph Explorer" {...a11yProps(4)} />
        </Tabs>
      </Box>
      
      <TabPanel value={value} index={0}>
        <Typography variant="h5" gutterBottom>
          Pipeline Dashboard
        </Typography>
        <Typography variant="body1">
          High-level overview of the entire pipeline's health and status will be displayed here.
        </Typography>
      </TabPanel>
      
      <TabPanel value={value} index={1}>
        <WorkQueueExplorer />
      </TabPanel>
      
      <TabPanel value={value} index={2}>
        <AnalysisResultsViewer />
      </TabPanel>
      
      <TabPanel value={value} index={3}>
        <Typography variant="h5" gutterBottom>
          Failed Work Inspector
        </Typography>
        <Typography variant="body1">
          Tasks that have failed permanently will be displayed here for debugging.
        </Typography>
      </TabPanel>
      
      <TabPanel value={value} index={4}>
        <Typography variant="h5" gutterBottom>
          Graph Explorer
        </Typography>
        <Typography variant="body1">
          Interactive interface for visualizing and querying the Neo4j knowledge graph will be displayed here.
        </Typography>
      </TabPanel>
    </Box>
  );
};

export default MainTabs;