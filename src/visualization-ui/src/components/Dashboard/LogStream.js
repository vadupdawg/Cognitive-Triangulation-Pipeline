import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemText,
  Chip,
  Alert,
  CircularProgress,
} from '@mui/material';

const LogStream = () => {
  const [messages, setMessages] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [error, setError] = useState(null);
  const wsRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Create WebSocket connection
    const connectWebSocket = () => {
      try {
        // Use ws:// for local development, wss:// for production
        const wsUrl = 'ws://localhost:3001';
        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
          console.log('WebSocket connected');
          setConnectionStatus('connected');
          setError(null);
        };

        wsRef.current.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            setMessages(prev => [...prev, {
              id: Date.now() + Math.random(),
              ...data,
              timestamp: data.timestamp || new Date().toISOString()
            }]);
          } catch (err) {
            console.error('Error parsing WebSocket message:', err);
          }
        };

        wsRef.current.onclose = () => {
          console.log('WebSocket disconnected');
          setConnectionStatus('disconnected');
          
          // Attempt to reconnect after 3 seconds
          setTimeout(() => {
            if (wsRef.current?.readyState === WebSocket.CLOSED) {
              setConnectionStatus('reconnecting');
              connectWebSocket();
            }
          }, 3000);
        };

        wsRef.current.onerror = (error) => {
          console.error('WebSocket error:', error);
          setError('Failed to connect to log stream');
          setConnectionStatus('error');
        };

      } catch (err) {
        console.error('Error creating WebSocket:', err);
        setError('Failed to initialize WebSocket connection');
        setConnectionStatus('error');
      }
    };

    connectWebSocket();

    // Cleanup on component unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const getStatusColor = (status) => {
    switch (status) {
      case 'connected':
        return 'success';
      case 'connecting':
      case 'reconnecting':
        return 'warning';
      case 'disconnected':
      case 'error':
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'reconnecting':
        return 'Reconnecting...';
      case 'disconnected':
        return 'Disconnected';
      case 'error':
        return 'Connection Error';
      default:
        return 'Unknown';
    }
  };

  const formatTimestamp = (timestamp) => {
    try {
      return new Date(timestamp).toLocaleTimeString();
    } catch {
      return timestamp;
    }
  };

  const getMessageTypeColor = (type) => {
    switch (type) {
      case 'welcome':
        return 'info';
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      case 'success':
        return 'success';
      default:
        return 'default';
    }
  };

  return (
    <Card sx={{ mt: 3 }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" component="div">
            Real-Time Log Stream
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {connectionStatus === 'connecting' || connectionStatus === 'reconnecting' ? (
              <CircularProgress size={16} />
            ) : null}
            <Chip
              label={getStatusText(connectionStatus)}
              color={getStatusColor(connectionStatus)}
              size="small"
            />
          </Box>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box
          sx={{
            height: 300,
            overflow: 'auto',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            backgroundColor: 'background.paper',
          }}
        >
          {messages.length === 0 ? (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'text.secondary',
              }}
            >
              <Typography variant="body2">
                {connectionStatus === 'connected' 
                  ? 'Waiting for log messages...' 
                  : 'Connecting to log stream...'}
              </Typography>
            </Box>
          ) : (
            <List dense sx={{ py: 0 }}>
              {messages.map((message) => (
                <ListItem
                  key={message.id}
                  sx={{
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    '&:last-child': {
                      borderBottom: 'none',
                    },
                  }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip
                          label={message.type || 'info'}
                          color={getMessageTypeColor(message.type)}
                          size="small"
                        />
                        <Typography variant="body2" component="span">
                          {message.message}
                        </Typography>
                      </Box>
                    }
                    secondary={
                      <Typography variant="caption" color="text.secondary">
                        {formatTimestamp(message.timestamp)}
                      </Typography>
                    }
                  />
                </ListItem>
              ))}
              <div ref={messagesEndRef} />
            </List>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default LogStream;