import React, { useState } from 'react';
import { Box, Tabs, Tab } from '@mui/material';
import Dashboard from '../Dashboard/Dashboard';
import WorkQueueExplorer from '../WorkQueue/WorkQueueExplorer';
import AnalysisResultsViewer from '../AnalysisResults/AnalysisResultsViewer';
import FailedWorkInspector from '../FailedWork/FailedWorkInspector';
import GraphExplorer from '../GraphExplorer/GraphExplorer';

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
        <Dashboard />
      </TabPanel>
      
      <TabPanel value={value} index={1}>
        <WorkQueueExplorer />
      </TabPanel>
      
      <TabPanel value={value} index={2}>
        <AnalysisResultsViewer />
      </TabPanel>
      
      <TabPanel value={value} index={3}>
        <FailedWorkInspector />
      </TabPanel>
      
      <TabPanel value={value} index={4}>
        <GraphExplorer />
      </TabPanel>
    </Box>
  );
};

export default MainTabs;