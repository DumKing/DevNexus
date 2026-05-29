# Development Tools

<cite>
**Referenced Files in This Document**
- [index.tsx](file://src/plugins/api-debugger/index.tsx)
- [api-debugger.ts](file://src/plugins/api-debugger/store/api-debugger.ts)
- [types.ts](file://src/plugins/api-debugger/types.ts)
- [CollectionsView.tsx](file://src/plugins/api-debugger/views/CollectionsView.tsx)
- [EnvironmentsView.tsx](file://src/plugins/api-debugger/views/EnvironmentsView.tsx)
- [index.tsx](file://src/plugins/mq-client/index.tsx)
- [mq-client.ts](file://src/plugins/mq-client/store/mq-client.ts)
- [types.ts](file://src/plugins/mq-client/types.ts)
- [ConnectionsView.tsx](file://src/plugins/mq-client/views/ConnectionsView.tsx)
- [BrowserView.tsx](file://src/plugins/mq-client/views/BrowserView.tsx)
- [commands.rs](file://src-tauri/src/plugins/api_debugger/commands.rs)
- [commands.rs](file://src-tauri/src/plugins/mq/commands.rs)
- [rabbitmq.rs](file://src-tauri/src/plugins/mq/rabbitmq.rs)
- [kafka.rs](file://src-tauri/src/plugins/mq/kafka.rs)
- [init.rs](file://src-tauri/src/db/init.rs)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)
10. [Appendices](#appendices)

## Introduction
This document describes two development-focused plugins: API Debugger and MQ Client. It explains how to organize API collections, manage environments, debug requests and responses, and leverage a mock-like history. It also covers MQ Client’s capabilities for RabbitMQ and Kafka, including connection management, resource browsing, publishing, and consuming previews. The guide includes practical workflows, integration patterns, and guidance for performance testing and debugging.

## Project Structure
Both plugins are implemented as React components with Zustand stores and Tauri backend commands. The frontend communicates with the backend via invoke calls, which delegate to Rust modules for HTTP and MQ operations. Data is persisted in a local SQLite database initialized at runtime.

```mermaid
graph TB
subgraph "Frontend"
AD_Root["API Debugger Root<br/>index.tsx"]
MQ_Root["MQ Client Root<br/>index.tsx"]
AD_Store["API Store<br/>api-debugger.ts"]
MQ_Store["MQ Store<br/>mq-client.ts"]
AD_CV["Collections View<br/>CollectionsView.tsx"]
AD_EV["Environments View<br/>EnvironmentsView.tsx"]
MQ_CV["Connections View<br/>ConnectionsView.tsx"]
MQ_BV["Browser View<br/>BrowserView.tsx"]
end
subgraph "Backend"
API_Cmds["API Commands<br/>api_debugger/commands.rs"]
MQ_Cmds["MQ Commands<br/>mq/commands.rs"]
MQ_RMQ["RabbitMQ Impl<br/>mq/rabbitmq.rs"]
MQ_KAF["Kafka Impl<br/>mq/kafka.rs"]
DB["SQLite Schema<br/>db/init.rs"]
end
AD_Root --> AD_Store
MQ_Root --> MQ_Store
AD_Store --> API_Cmds
MQ_Store --> MQ_Cmds
API_Cmds --> DB
MQ_Cmds --> DB
MQ_Cmds --> MQ_RMQ
MQ_Cmds --> MQ_KAF
AD_Root --> AD_CV
AD_Root --> AD_EV
MQ_Root --> MQ_CV
MQ_Root --> MQ_BV
```

**Diagram sources**
- [index.tsx:13-38](file://src/plugins/api-debugger/index.tsx#L13-L38)
- [index.tsx:13-37](file://src/plugins/mq-client/index.tsx#L13-L37)
- [api-debugger.ts:47-128](file://src/plugins/api-debugger/store/api-debugger.ts#L47-L128)
- [mq-client.ts:52-102](file://src/plugins/mq-client/store/mq-client.ts#L52-L102)
- [commands.rs:391-475](file://src-tauri/src/plugins/api_debugger/commands.rs#L391-L475)
- [commands.rs:152-207](file://src-tauri/src/plugins/mq/commands.rs#L152-L207)
- [rabbitmq.rs:66-104](file://src-tauri/src/plugins/mq/rabbitmq.rs#L66-L104)
- [kafka.rs:44-72](file://src-tauri/src/plugins/mq/kafka.rs#L44-L72)
- [init.rs:179-278](file://src-tauri/src/db/init.rs#L179-L278)

**Section sources**
- [index.tsx:1-39](file://src/plugins/api-debugger/index.tsx#L1-L39)
- [index.tsx:1-38](file://src/plugins/mq-client/index.tsx#L1-L38)
- [api-debugger.ts:1-129](file://src/plugins/api-debugger/store/api-debugger.ts#L1-L129)
- [mq-client.ts:1-103](file://src/plugins/mq-client/store/mq-client.ts#L1-L103)
- [init.rs:179-278](file://src-tauri/src/db/init.rs#L179-L278)

## Core Components
- API Debugger
  - Workspace for crafting requests, previewing resolved values, sending, canceling, saving, importing cURL, and exporting collections.
  - Collections and Folders for organizing requests.
  - Environments for variable substitution and optional encryption of secrets.
  - History for reviewing past requests/responses with filtering and redaction.
- MQ Client
  - Connection management for RabbitMQ and Kafka with diagnostics and browsing.
  - Publishing and consuming previews with configurable offsets and partitions.
  - Saved message templates for reuse.
  - History for operations with filtering.

**Section sources**
- [api-debugger.ts:47-128](file://src/plugins/api-debugger/store/api-debugger.ts#L47-L128)
- [types.ts:1-105](file://src/plugins/api-debugger/types.ts#L1-L105)
- [CollectionsView.tsx:59-166](file://src/plugins/api-debugger/views/CollectionsView.tsx#L59-L166)
- [EnvironmentsView.tsx:8-64](file://src/plugins/api-debugger/views/EnvironmentsView.tsx#L8-L64)
- [mq-client.ts:52-102](file://src/plugins/mq-client/store/mq-client.ts#L52-L102)
- [types.ts:1-90](file://src/plugins/mq-client/types.ts#L1-L90)
- [ConnectionsView.tsx:8-92](file://src/plugins/mq-client/views/ConnectionsView.tsx#L8-L92)
- [BrowserView.tsx:11-23](file://src/plugins/mq-client/views/BrowserView.tsx#L11-L23)

## Architecture Overview
The frontend invokes Tauri commands to perform operations. The backend executes the work (HTTP requests or MQ operations) and persists results to SQLite. Stores orchestrate UI state and command invocations.

```mermaid
sequenceDiagram
participant UI as "React UI"
participant Store as "Zustand Store"
participant Tauri as "Tauri Command"
participant Backend as "Rust Module"
UI->>Store : Dispatch action (e.g., sendRequest)
Store->>Tauri : invoke("cmd_api_send_request", payload)
Tauri->>Backend : Route to API command
Backend->>Backend : Resolve env vars, build HTTP request
Backend-->>Tauri : Response JSON
Tauri-->>Store : Result
Store-->>UI : Update state (response/history)
```

**Diagram sources**
- [api-debugger.ts:62-72](file://src/plugins/api-debugger/store/api-debugger.ts#L62-L72)
- [commands.rs:403-475](file://src-tauri/src/plugins/api_debugger/commands.rs#L403-L475)

**Section sources**
- [api-debugger.ts:62-72](file://src/plugins/api-debugger/store/api-debugger.ts#L62-L72)
- [commands.rs:403-475](file://src-tauri/src/plugins/api_debugger/commands.rs#L403-L475)

## Detailed Component Analysis

### API Debugger: Collections, Environments, and History
- Organization
  - Collections and nested Folders group related requests.
  - Requests can be saved into collections/folders or left unorganized.
- Environments
  - Named sets of variables with enable/disable and secret flags.
  - Secrets are encrypted at rest and decrypted only during resolution.
- Preview and Resolution
  - Preview resolves variables and shows effective URL/headers/body preview and missing variables.
- History
  - Redacts sensitive data and truncates large bodies.
  - Supports filtering by method/host/status/limit.

```mermaid
flowchart TD
Start(["Open Collections"]) --> Load["Load Collections/Folders/Requests"]
Load --> Build["Build Tree: Collections -> Folders -> Requests"]
Build --> Interact["Create/Edit/Delete Items"]
Interact --> Save["Save Item via invoke"]
Save --> Refresh["Refetch lists"]
Refresh --> End(["Ready"])
```

**Diagram sources**
- [CollectionsView.tsx:119-143](file://src/plugins/api-debugger/views/CollectionsView.tsx#L119-L143)
- [api-debugger.ts:90-98](file://src/plugins/api-debugger/store/api-debugger.ts#L90-L98)

**Section sources**
- [CollectionsView.tsx:59-166](file://src/plugins/api-debugger/views/CollectionsView.tsx#L59-L166)
- [EnvironmentsView.tsx:8-64](file://src/plugins/api-debugger/views/EnvironmentsView.tsx#L8-L64)
- [api-debugger.ts:90-127](file://src/plugins/api-debugger/store/api-debugger.ts#L90-L127)
- [commands.rs:125-154](file://src-tauri/src/plugins/api_debugger/commands.rs#L125-L154)
- [commands.rs:391-401](file://src-tauri/src/plugins/api_debugger/commands.rs#L391-L401)
- [commands.rs:671-696](file://src-tauri/src/plugins/api_debugger/commands.rs#L671-L696)

### API Debugger: Request Workflow and Mock Server Notes
- Workflow
  - Compose request in Workspace (method, URL, params, headers, cookies, auth, body).
  - Preview to see resolved values and missing variables.
  - Send to execute; response is shown and optionally saved to history.
  - Import cURL to quickly populate a request.
- Mock Server
  - No embedded HTTP mock server is present in the backend. Responses come from real endpoints or history.

```mermaid
sequenceDiagram
participant U as "User"
participant W as "Workspace"
participant P as "Preview"
participant S as "Send"
participant H as "History"
U->>W : Edit request
W->>P : Preview
P-->>U : Resolved URL/headers/body + missing vars
U->>S : Send
S-->>U : Response (status, headers, body)
S->>H : Optionally save to history
```

**Diagram sources**
- [api-debugger.ts:73-76](file://src/plugins/api-debugger/store/api-debugger.ts#L73-L76)
- [api-debugger.ts:62-72](file://src/plugins/api-debugger/store/api-debugger.ts#L62-L72)
- [commands.rs:391-401](file://src-tauri/src/plugins/api_debugger/commands.rs#L391-L401)
- [commands.rs:403-475](file://src-tauri/src/plugins/api_debugger/commands.rs#L403-L475)

**Section sources**
- [api-debugger.ts:24-28](file://src/plugins/api-debugger/store/api-debugger.ts#L24-L28)
- [commands.rs:713-738](file://src-tauri/src/plugins/api_debugger/commands.rs#L713-L738)

### MQ Client: RabbitMQ and Kafka
- Connections
  - Define broker type, hosts, credentials, timeouts, and broker-specific configs (AMQP URL/vhost for RabbitMQ; SASL/security for Kafka).
  - Test connectivity and view diagnostics with stage-by-stage results.
- Browsing
  - RabbitMQ: Requires Management Plugin; browses queues/exchanges/bindings.
  - Kafka: Lists brokers, topics, partitions, and consumer groups (read-only).
- Publishing and Consuming
  - Publish to exchanges (RabbitMQ) or topics (Kafka) with routing keys/partition selection.
  - Consume preview supports offset modes and limits; Kafka can target a partition or subscribe to a topic.
- Templates and History
  - Save reusable message templates; view operation history with filtering.

```mermaid
classDiagram
class MqConnectionInfo {
+string id
+string name
+string brokerType
+string[] hosts
+string? username
+number connectTimeout
+RabbitMqConfig? rabbitmq
+KafkaConfig? kafka
}
class RabbitMqConfig {
+string? amqpUrl
+string? virtualHost
+string? managementUrl
+string? managementUsername
+string? managementPassword
}
class KafkaConfig {
+string[]? bootstrapServers
+string? clientId
+string? securityProtocol
+string? saslMechanism
+string? saslUsername
+string? saslPassword
+boolean? tlsEnabled
}
class MqPublishRequest {
+string connId
+string brokerType
+string target
+string? routingKey
+string? key
+number? partition
+MqKeyValue[] headers
+MqKeyValue[] properties
+EncodedMessageBody body
}
class MqConsumeRequest {
+string connId
+string brokerType
+string target
+number? partition
+string? offsetMode
+number? offset
+number? limit
+number? timeoutMs
+string? ackMode
}
MqConnectionInfo --> RabbitMqConfig : "has"
MqConnectionInfo --> KafkaConfig : "has"
MqPublishRequest --> MqConnectionInfo : "targets"
MqConsumeRequest --> MqConnectionInfo : "targets"
```

**Diagram sources**
- [types.ts:4-39](file://src/plugins/mq-client/types.ts#L4-L39)
- [types.ts:46-70](file://src/plugins/mq-client/types.ts#L46-L70)

**Section sources**
- [ConnectionsView.tsx:8-92](file://src/plugins/mq-client/views/ConnectionsView.tsx#L8-L92)
- [BrowserView.tsx:11-23](file://src/plugins/mq-client/views/BrowserView.tsx#L11-L23)
- [mq-client.ts:63-82](file://src/plugins/mq-client/store/mq-client.ts#L63-L82)
- [commands.rs:152-207](file://src-tauri/src/plugins/mq/commands.rs#L152-L207)
- [rabbitmq.rs:66-104](file://src-tauri/src/plugins/mq/rabbitmq.rs#L66-L104)
- [kafka.rs:44-72](file://src-tauri/src/plugins/mq/kafka.rs#L44-L72)

### MQ Client: Operation Sequence (Publish/Consume)
```mermaid
sequenceDiagram
participant UI as "MQ UI"
participant Store as "MQ Store"
participant Cmd as "cmd_mq_publish/cmd_mq_consume_preview"
participant Conn as "get_connection"
participant Broker as "Broker Impl"
UI->>Store : publish()/consumePreview()
Store->>Cmd : invoke(...)
Cmd->>Conn : Load connection + hydrate secrets
Cmd->>Broker : broker.publish()/broker.consume()
Broker-->>Cmd : MqOperationResult
Cmd-->>Store : Result + optional history
Store-->>UI : Update state
```

**Diagram sources**
- [mq-client.ts:84-94](file://src/plugins/mq-client/store/mq-client.ts#L84-L94)
- [commands.rs:182-207](file://src-tauri/src/plugins/mq/commands.rs#L182-L207)
- [rabbitmq.rs:136-165](file://src-tauri/src/plugins/mq/rabbitmq.rs#L136-L165)
- [kafka.rs:148-176](file://src-tauri/src/plugins/mq/kafka.rs#L148-L176)

**Section sources**
- [mq-client.ts:84-94](file://src/plugins/mq-client/store/mq-client.ts#L84-L94)
- [commands.rs:182-207](file://src-tauri/src/plugins/mq/commands.rs#L182-L207)

## Dependency Analysis
- Frontend-to-Backend
  - API Debugger store invokes commands prefixed with "cmd_api_*".
  - MQ Client store invokes commands prefixed with "cmd_mq_*".
- Backend Modules
  - API commands depend on SQLite schema for collections, requests, environments, and history.
  - MQ commands depend on SQLite schema for connections, message history, and saved messages.
  - MQ commands route to broker-specific implementations (RabbitMQ/Kafka).
- Security
  - Sensitive environment variables and broker passwords/secrets are encrypted at rest and decrypted only when resolving or connecting.

```mermaid
graph LR
AD_Store["API Store"] -- "invoke cmd_api_*" --> API_Cmds["API Commands"]
MQ_Store["MQ Store"] -- "invoke cmd_mq_*" --> MQ_Cmds["MQ Commands"]
API_Cmds --> DB["SQLite"]
MQ_Cmds --> DB
MQ_Cmds --> RMQ["RabbitMQ Impl"]
MQ_Cmds --> KAF["Kafka Impl"]
```

**Diagram sources**
- [api-debugger.ts:62-72](file://src/plugins/api-debugger/store/api-debugger.ts#L62-L72)
- [mq-client.ts:84-89](file://src/plugins/mq-client/store/mq-client.ts#L84-L89)
- [commands.rs:391-475](file://src-tauri/src/plugins/api_debugger/commands.rs#L391-L475)
- [commands.rs:152-207](file://src-tauri/src/plugins/mq/commands.rs#L152-L207)
- [init.rs:179-278](file://src-tauri/src/db/init.rs#L179-L278)

**Section sources**
- [api-debugger.ts:62-72](file://src/plugins/api-debugger/store/api-debugger.ts#L62-L72)
- [mq-client.ts:84-89](file://src/plugins/mq-client/store/mq-client.ts#L84-L89)
- [commands.rs:642-661](file://src-tauri/src/plugins/api_debugger/commands.rs#L642-L661)
- [commands.rs:92-101](file://src-tauri/src/plugins/mq/commands.rs#L92-L101)

## Performance Considerations
- API Debugger
  - Response body truncation prevents excessive memory usage for large payloads.
  - Timeout and redirect policies are configurable; defaults clamp extremes.
  - History redaction avoids storing sensitive data unnecessarily.
- MQ Client
  - Consumer previews poll with bounded limits and timeouts to avoid long-running operations.
  - Kafka metadata and group listings are read-only and lightweight.
  - RabbitMQ Management API is used for browsing when configured; otherwise browsing is limited.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
- API Debugger
  - Missing variables: Preview highlights missing variables; ensure environment variables are defined and enabled.
  - SSL validation: Toggle validate SSL to bypass certificate checks when needed.
  - History redaction: Sensitive values are masked; adjust environment variable secrets if necessary.
- MQ Client
  - Diagnostics: Use Test to check connectivity stages; errors/warnings indicate failures in client or management endpoints.
  - RabbitMQ browsing: Requires Management Plugin; without it, browsing is limited.
  - Kafka offsets: Consumer previews do not commit offsets; configure partition/offset modes as needed.

**Section sources**
- [commands.rs:205-234](file://src-tauri/src/plugins/api_debugger/commands.rs#L205-L234)
- [commands.rs:152-160](file://src-tauri/src/plugins/mq/commands.rs#L152-L160)
- [rabbitmq.rs:88-95](file://src-tauri/src/plugins/mq/rabbitmq.rs#L88-L95)
- [kafka.rs:178-242](file://src-tauri/src/plugins/mq/kafka.rs#L178-L242)

## Conclusion
The API Debugger and MQ Client plugins provide robust development workflows: organizing API requests with collections and environments, previewing and sending requests, and maintaining a redacted history; and managing MQ connections, browsing resources, publishing, and consuming previews for RabbitMQ and Kafka. Together, they support efficient debugging, testing, and integration tasks with secure storage and diagnostics.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### API Testing Workflows
- Organize: Create collections and folders; save requests into them.
- Configure: Create environments with variables; mark secrets for encryption.
- Debug: Use Preview to validate variable resolution; Send to execute; inspect response and timing.
- Automate: Export collections; import cURL to quickly bootstrap requests.

**Section sources**
- [CollectionsView.tsx:59-166](file://src/plugins/api-debugger/views/CollectionsView.tsx#L59-L166)
- [EnvironmentsView.tsx:8-64](file://src/plugins/api-debugger/views/EnvironmentsView.tsx#L8-L64)
- [api-debugger.ts:126-127](file://src/plugins/api-debugger/store/api-debugger.ts#L126-L127)
- [commands.rs:713-738](file://src-tauri/src/plugins/api_debugger/commands.rs#L713-L738)

### MQ Monitoring and Integration Patterns
- Monitor: Connect to RabbitMQ or Kafka; browse resources; review history.
- Integrate: Use templates to standardize message payloads; publish to exchanges/topics; preview consumes to validate message flow.

**Section sources**
- [ConnectionsView.tsx:8-92](file://src/plugins/mq-client/views/ConnectionsView.tsx#L8-L92)
- [BrowserView.tsx:11-23](file://src/plugins/mq-client/views/BrowserView.tsx#L11-L23)
- [mq-client.ts:99-102](file://src/plugins/mq-client/store/mq-client.ts#L99-L102)
- [commands.rs:250-275](file://src-tauri/src/plugins/mq/commands.rs#L250-L275)

### Performance Testing and Load Simulation Notes
- API Debugger
  - Adjust timeoutMs and followRedirects; validate SSL as needed.
  - Use history filtering to focus on recent runs.
- MQ Client
  - Tune limit and timeoutMs for consume previews; select partitions for targeted inspection.
  - For load simulation, use external tools or scripts; the MQ Client focuses on inspection and publishing.

[No sources needed since this section provides general guidance]