# Backend Visualization Master Plan

## 1. Introduction & Vision

*   **1.1. Purpose:** To create a comprehensive, real-time UI for monitoring, debugging, and understanding the state of the Universal Code Graph V4 pipeline. The UI will provide developers and administrators with clear insights into the system's health, data flow, and the final graph output.
*   **1.2. Target Audience:**
    *   **Developers:** For debugging the pipeline agents and understanding the data flow.
    *   **System Administrators:** For monitoring system health, performance, and identifying bottlenecks or persistent failures.
    *   **Data Analysts:** For exploring the final Neo4j knowledge graph and understanding the code relationships discovered by the LLM.
*   **1.3. Scope:** The UI will be a read-only visualization tool. It will not perform write operations to the backend databases but will provide tools to construct and test queries.

## 2. Technology Stack

*   **Frontend Framework:** React (using functional components and Hooks).
*   **UI Component Library:** Material-UI (MUI) for a consistent and professional look and feel.
*   **State Management:** Redux Toolkit for managing application-level state, such as connection status and selected items.
*   **Data Fetching:** RTK Query for declarative data fetching, caching, and real-time updates from the backend APIs.
*   **Graph Visualization:** `react-flow` for rendering and interacting with the Neo4j graph data.
*   **Data Grids:** MUI Data Grid for displaying tabular data from the SQLite database tables.

## 3. High-Level Architecture

The UI will be a single-page application (SPA) with a tabbed interface. A persistent top-level component will manage connections to the backend data sources (SQLite and Neo4j via a new API layer). Each tab will focus on visualizing a specific component of the backend system.

**Required Backend API Layer:** A new Node.js/Express.js backend service will be required to expose the SQLite database and Neo4j database over a RESTful API. This service will handle security and provide endpoints for the React UI to consume.

## 4. Key Features & Tabbed Views

### 4.1. Tab 1: Pipeline Dashboard (Default View)

*   **Purpose:** Provide a high-level, at-a-glance overview of the entire pipeline's health and status.
*   **Components:**
    *   **Stat Cards:**
        *   `Work Queue (Pending)`: Live count of records in `work_queue` where `status = 'pending'`.
        *   `Work Queue (In Progress)`: Live count of records where `status = 'processing'`.
        *   `Analysis Results (Pending Ingestion)`: Live count of records in `analysis_results` where `status = 'pending_ingestion'`.
        *   `Failed Tasks`: Live count of records in `failed_work`.
    *   **Agent Status Indicators:**
        *   `ScoutAgent`: Shows last run time and a green/red status indicator.
        *   `WorkerAgent Pool`: Shows the number of active workers.
        *   `GraphIngestorAgent`: Shows last ingestion time and status.
    *   **Log Stream:** A real-time, filterable log stream from all backend agents.

### 4.2. Tab 2: Work Queue Explorer

*   **Purpose:** Allow detailed inspection of the `work_queue` table.
*   **Components:**
    *   **Data Grid:** A searchable and sortable table displaying all columns of the `work_queue` table (`id`, `file_path`, `content_hash`, `status`, `worker_id`, `last_updated`).
    *   **Detail Pane:** Clicking a row in the grid displays the full file path and content hash in a separate, readable pane.

### 4.3. Tab 3: Analysis Results Viewer

*   **Purpose:** Allow inspection of the JSON output from the `WorkerAgent`.
*   **Components:**
    *   **Data Grid:** A table displaying records from the `analysis_results` table (`id`, `work_item_id`, `file_path`, `status`, `created_at`).
    *   **JSON Viewer:** Clicking a row loads the `llm_output` JSON into a formatted, color-coded, and collapsible JSON viewer component.

### 4.4. Tab 4: Failed Work Inspector

*   **Purpose:** Provide a dedicated view for debugging and analyzing tasks that have failed permanently.
*   **Components:**
    *   **Data Grid:** A table displaying the contents of the `failed_work` table.
    *   **Error Detail Pane:** Clicking a row shows the full `error_message` and provides a button to easily view the corresponding task in the 'Work Queue Explorer'.

### 4.5. Tab 5: Graph Explorer

*   **Purpose:** Provide a powerful and interactive interface for visualizing and querying the final Neo4j knowledge graph.
*   **Components:**
    *   **Query Input:** A text area for writing and executing Cypher queries.
    *   **Graph Visualization Pane:** Renders the results of the Cypher query using `react-flow`. Nodes should be draggable and display their properties on hover or click.
    *   **Results Table:** Displays the query results in a tabular format below the graph visualization.

## 5. Component Breakdown (High-Level)

*   `App.js`: Main application entry point, sets up routing and layout.
*   `components/`:
    *   `Layout/`:
        *   `MainTabs.js`: The main tab container.
        *   `Header.js`: Persistent header with connection status indicators.
    *   `Dashboard/`: Components for the Pipeline Dashboard tab.
    *   `WorkQueue/`: Components for the Work Queue Explorer tab.
    *   `AnalysisResults/`: Components for the Analysis Results Viewer tab.
    *   `GraphExplorer/`: Components for the Graph Explorer tab.
*   `features/`: Redux Toolkit slices for managing state (e.g., `apiSlice.js`, `dashboardSlice.js`).

## 6. Phased Development Plan

*   **Phase 1: Foundation & API Layer:**
    *   Set up the React project structure with MUI and Redux Toolkit.
    *   Develop the backend API service to expose SQLite and Neo4j data.
    *   Implement the main tabbed layout.
*   **Phase 2: SQLite Data Views:**
    *   Implement the 'Work Queue Explorer', 'Analysis Results Viewer', and 'Failed Work Inspector' tabs.
    *   Focus on data grid implementation and linking between views.
*   **Phase 3: Dashboard & Real-Time Updates:**
    *   Implement the 'Pipeline Dashboard' with live-updating stat cards.
    *   Integrate a WebSocket or polling mechanism for the real-time log stream.
*   **Phase 4: Graph Visualization:**
    *   Implement the 'Graph Explorer' tab.
    *   Integrate `react-flow` and connect it to the Neo4j query API endpoint.