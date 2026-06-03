# DevNexus - 常用工具包开发计划

> DevNexus = Developer Nexus
> 定位：插件化 Windows 桌面工具箱，第一期实现 Redis 管理工具

---

## 技术选型

| 层次 | 方案 | 说明 |
|------|------|------|
| 桌面框架 | Tauri 2 | Rust 后端 + WebView 前端，安装包体积小（~5MB） |
| 前端框架 | React 18 + TypeScript | |
| UI 组件库 | Ant Design 5 | 管理后台风格，组件完整 |
| 状态管理 | Zustand | 轻量，按插件切片隔离 |
| 图表 | ECharts | 服务器监控图表 |
| 终端组件 | xterm.js | 内嵌命令控制台 |
| 虚拟列表 | @tanstack/react-virtual | 百万级 Key 列表不卡顿 |
| Redis 客户端 | redis-rs（Rust） | 支持单机/哨兵/集群 |
| 本地存储 | SQLite via rusqlite | 连接配置、历史记录 |
| 密码加密 | AES-256-GCM（Rust aes-gcm） | 加密存储连接密码 |
| 打包 | Tauri Bundler | 输出 .msi / .exe |
| 自动更新 | Tauri updater 插件 | |

---

## 整体架构

```
┌─────────────────────────────────────────────────────┐
│                   主应用 Shell                        │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │  插件注册表  │  │  导航/布局   │  │  主题/设置 │  │
│  └─────────────┘  └──────────────┘  └────────────┘  │
└────────────────────────┬────────────────────────────┘
                         │ PluginManifest 接口
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
  ┌───────────┐   ┌───────────┐   ┌───────────┐
  │  Redis    │   │ (SSH Tool)│   │(HTTP Tool)│
  │  Manager  │   │  预留      │   │  预留      │
  └───────────┘   └───────────┘   └───────────┘
        │
  ┌─────┴──────────────────────┐
  │        Rust 后端            │
  │  redis-rs │ SQLite │ 系统API│
  └────────────────────────────┘
```

---

## 目录结构

```
DevNexus/
├── src/
│   ├── main.tsx                    # 应用入口
│   ├── app/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx        # 主窗口布局
│   │   │   ├── Sidebar.tsx         # 左侧插件导航
│   │   │   └── Titlebar.tsx        # 自定义标题栏
│   │   ├── plugin-registry/
│   │   │   ├── registry.ts         # 插件注册表
│   │   │   ├── PluginRouter.tsx    # 插件路由渲染
│   │   │   └── types.ts            # PluginManifest 类型定义
│   │   └── store/
│   │       ├── theme.ts            # 主题状态
│   │       └── settings.ts         # 全局设置状态
│   └── plugins/
│       └── redis-manager/
│           ├── index.tsx           # 插件入口（导出 manifest）
│           ├── store/
│           │   ├── connections.ts  # 连接列表状态
│           │   └── workspace.ts    # 当前工作区状态（选中连接/DB/Key）
│           ├── views/
│           │   ├── ConnectionList.tsx
│           │   ├── KeyBrowser.tsx
│           │   ├── Console.tsx
│           │   └── ServerInfo.tsx
│           └── components/
│               ├── editors/
│               │   ├── StringEditor.tsx
│               │   ├── HashEditor.tsx
│               │   ├── ListEditor.tsx
│               │   ├── SetEditor.tsx
│               │   └── ZSetEditor.tsx
│               ├── KeyTree.tsx
│               ├── ConnectionForm.tsx
│               └── TtlBadge.tsx
├── src-tauri/
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs
│       ├── db/
│       │   ├── mod.rs
│       │   ├── init.rs             # 建表、迁移
│       │   └── connection_repo.rs  # 连接配置 CRUD
│       ├── crypto/
│       │   └── mod.rs              # AES-256-GCM 加解密
│       └── plugins/
│           └── redis/
│               ├── mod.rs
│               ├── pool.rs         # 连接池管理
│               ├── commands.rs     # Tauri Command 暴露层
│               └── types.rs        # 数据结构定义
├── public/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── PLAN.md
└── CLAUDE.md
```

---

## Phase 0：项目脚手架

### 0.1 初始化工程
- [x] 执行 `npm create tauri-app@latest` 创建项目，选择 React + TypeScript 模板
- [x] 配置 `vite.config.ts`：路径别名（`@/` → `src/`）
- [x] 安装前端依赖：`antd`、`zustand`、`@tanstack/react-virtual`、`echarts`、`xterm`
- [x] 安装 Rust 依赖到 `Cargo.toml`：`redis`、`rusqlite`、`aes-gcm`、`tokio`、`serde`、`uuid`
- [x] 配置 `tauri.conf.json`：窗口大小 1280×800，最小 960×600，decorations: false（使用自定义标题栏）

### 0.2 自定义标题栏
- [x] 创建 `Titlebar.tsx`：实现拖拽区域、最小化/最大化/关闭按钮
- [x] 调用 Tauri window API（`appWindow.minimize/maximize/close`）
- [x] CSS 设置 `data-tauri-drag-region` 拖拽区域

### 0.3 主窗口布局
- [x] 创建 `AppShell.tsx`：左侧固定宽度导航栏（64px 图标模式 / 200px 展开模式） + 右侧内容区
- [x] 导航栏支持折叠/展开，状态持久化到 localStorage
- [x] 底部状态栏：显示当前连接名称、Redis 版本、延迟

### 0.4 插件注册系统
- [x] 定义 `PluginManifest` 接口：`{ id, name, icon, version, component, sidebarOrder }`
- [x] 创建 `registry.ts`：维护插件列表，提供 `register(plugin)` / `getAll()` 方法
- [x] 创建 `PluginRouter.tsx`：根据当前选中插件 id 渲染对应组件
- [x] 在 `main.tsx` 中导入并注册所有插件

### 0.5 全局主题
- [x] Zustand `theme.ts`：`mode: 'light' | 'dark'`，持久化到 localStorage
- [x] Ant Design `ConfigProvider` 包裹根组件，动态切换 `theme.darkAlgorithm`
- [x] 标题栏/侧边栏适配暗色模式 CSS 变量

### 0.6 SQLite 初始化
- [x] Rust `db/init.rs`：应用启动时在数据目录创建本地 SQLite 数据库（`devnexus.db`，启动时自动迁移旧文件名）
- [x] 建表 `connections`（id, name, group_name, host, port, password_encrypted, db_index, connection_type, created_at）
- [x] 建表 `query_history`（id, connection_id, command, executed_at）
- [x] Tauri 启动钩子中调用 `db::init::run()`

---

## Phase 1：连接管理

### 1.1 Rust 后端 - 连接池
- [x] `pool.rs`：使用 `HashMap<String, redis::Client>` 按连接 id 缓存 Client
- [x] 实现 `connect(id, config)` → 测试连通性，成功后存入池
- [x] 实现 `disconnect(id)` → 从池中移除
- [x] 实现 `get_client(id)` → 返回可用连接，失败时返回错误
- [x] 支持连接类型枚举：`Standalone` / `Sentinel` / `Cluster`（Sentinel 和 Cluster 第一期结构预留，仅实现 Standalone）

### 1.2 Rust 后端 - 加密模块
- [x] `crypto/mod.rs`：使用 `aes-gcm` crate 实现 `encrypt(plaintext) -> String`
- [x] 实现 `decrypt(ciphertext) -> String`
- [x] 密钥从系统环境或固定派生（应用安装时生成，存入 Tauri 应用数据目录）

### 1.3 Rust 后端 - CRUD Commands
- [x] `connection_repo.rs`：实现 `list_connections()`、`save_connection()`、`delete_connection()`、`get_connection(id)`
- [x] `commands.rs` 暴露 Tauri Command：
  - [x] `cmd_list_connections() -> Vec<ConnectionInfo>`
  - [x] `cmd_save_connection(form: ConnectionForm) -> Result<String>` （返回 id）
  - [x] `cmd_delete_connection(id: String) -> Result<()>`
  - [x] `cmd_test_connection(form: ConnectionForm) -> Result<Latency>`
  - [x] `cmd_connect(id: String) -> Result<RedisServerInfo>` （连接并返回服务器信息）
  - [x] `cmd_disconnect(id: String) -> Result<()>`

### 1.4 前端 - 连接列表页
- [x] `ConnectionList.tsx`：左侧主视图，展示分组的连接卡片列表
- [x] 每个连接卡片显示：连接名、host:port、连接状态指示灯（灰/绿/红）
- [x] 工具栏：新建连接按钮、搜索框（按名称过滤）
- [x] 右键菜单：连接、编辑、复制、删除

### 1.5 前端 - 连接表单
- [x] `ConnectionForm.tsx`：Ant Design Modal + Form
- [x] 字段：名称、分组、主机、端口（默认 6379）、密码（明文输入，保存时加密）、数据库索引（0-15 下拉）、连接类型
- [x] "测试连接"按钮：调用 `cmd_test_connection`，展示延迟或错误信息
- [x] 表单校验：host 必填，port 范围 1-65535

### 1.6 前端 - 连接状态管理
- [x] Zustand `connections.ts`：存储连接列表、已连接 id 集合
- [x] 操作：`fetchConnections()`、`addConnection()`、`removeConnection()`、`setConnected(id)`
- [x] 连接成功后自动跳转到 Key 浏览器视图

---

## Phase 2：Key 浏览器

### 2.1 Rust 后端 - Key 扫描
- [x] `cmd_scan_keys(conn_id, pattern, cursor, count) -> ScanResult`：封装 SCAN 命令，返回 `{ next_cursor, keys: Vec<KeyMeta> }`
- [x] `KeyMeta` 包含：`key`、`type`（string/hash/list/set/zset）、`ttl`
- [x] 每次 SCAN count=200，前端控制分批加载

### 2.2 Rust 后端 - Key 操作
- [x] `cmd_get_key_type(conn_id, key) -> KeyType`
- [x] `cmd_get_ttl(conn_id, key) -> i64`（-1 永不过期，-2 不存在）
- [x] `cmd_set_ttl(conn_id, key, ttl_seconds) -> Result<()>`
- [x] `cmd_delete_keys(conn_id, keys: Vec<String>) -> Result<u64>`（返回删除数量）
- [x] `cmd_rename_key(conn_id, old_key, new_key) -> Result<()>`
- [x] `cmd_key_exists(conn_id, key) -> bool`

### 2.3 Rust 后端 - String 类型
- [x] `cmd_get_string(conn_id, key) -> String`
- [x] `cmd_set_string(conn_id, key, value, ttl?) -> Result<()>`

### 2.4 Rust 后端 - Hash 类型
- [x] `cmd_hgetall(conn_id, key) -> Vec<HashField>`（`{ field, value }`）
- [x] `cmd_hset(conn_id, key, field, value) -> Result<()>`
- [x] `cmd_hdel(conn_id, key, field) -> Result<()>`

### 2.5 Rust 后端 - List 类型
- [x] `cmd_lrange(conn_id, key, start, stop) -> Vec<String>`
- [x] `cmd_llen(conn_id, key) -> i64`
- [x] `cmd_lset(conn_id, key, index, value) -> Result<()>`
- [x] `cmd_lpush/rpush(conn_id, key, value) -> Result<()>`
- [x] `cmd_lrem(conn_id, key, count, value) -> Result<()>`

### 2.6 Rust 后端 - Set 类型
- [x] `cmd_smembers(conn_id, key) -> Vec<String>`（数量大时用 SSCAN）
- [x] `cmd_sadd(conn_id, key, member) -> Result<()>`
- [x] `cmd_srem(conn_id, key, member) -> Result<()>`

### 2.7 Rust 后端 - ZSet 类型
- [x] `cmd_zrange_withscores(conn_id, key, start, stop) -> Vec<ZMember>`（`{ member, score }`）
- [x] `cmd_zcard(conn_id, key) -> i64`
- [x] `cmd_zadd(conn_id, key, score, member) -> Result<()>`
- [x] `cmd_zrem(conn_id, key, member) -> Result<()>`
- [x] `cmd_zscore(conn_id, key, member) -> Option<f64>`

### 2.8 前端 - Key 树组件
- [x] `KeyTree.tsx`：按 `:` 分隔符将 Key 解析为树形结构（如 `user:1:name` → user > 1 > name）
- [x] 使用 `@tanstack/react-virtual` 虚拟渲染，支持 10 万+ Key 不卡顿
- [x] 树节点显示：Key 名、类型图标（颜色区分）、TTL 角标（快过期时红色警示）
- [x] 顶部搜索框：输入 pattern 触发 SCAN（防抖 300ms）
- [x] 支持"加载更多"按钮（cursor 分页）
- [x] 右键菜单：复制 Key 名、查看详情、设置 TTL、删除、重命名

### 2.9 前端 - Key 详情面板
- [x] 右侧面板布局：Key 名（可点击编辑重命名）、类型标签、TTL 显示与编辑、数据编辑区
- [x] 根据 Key 类型动态渲染对应 Editor 组件

### 2.10 前端 - StringEditor
- [x] 显示字符串值，自动检测 JSON 并提供格式化按钮
- [x] 编辑模式：textarea 输入，保存调用 `cmd_set_string`
- [x] 显示字节大小

### 2.11 前端 - HashEditor
- [x] Ant Design Table：field / value 两列
- [x] 支持行内编辑（点击 value 单元格进入编辑状态）
- [x] 工具栏：添加字段按钮、搜索字段输入框
- [x] 每行右侧删除按钮

### 2.12 前端 - ListEditor
- [x] 有序列表，显示 index / value 两列
- [x] 分页（每页 100 条），调用 LRANGE
- [x] 支持修改指定 index 的值（LSET）
- [x] 顶部操作：LPUSH / RPUSH 添加元素，选中行后删除（LREM）

### 2.13 前端 - SetEditor
- [x] 成员列表（单列），显示成员数量
- [x] 搜索框（前端过滤）
- [x] 添加成员（SADD）、勾选删除（SREM）

### 2.14 前端 - ZSetEditor
- [x] 表格：member / score 两列，默认按 score 升序
- [x] 支持修改 score（ZADD 覆盖）
- [x] 添加成员（member + score）
- [x] 按 score 范围筛选（调用 ZRANGEBYSCORE）

### 2.15 前端 - 批量操作
- [x] Key 列表支持多选（Checkbox）
- [x] 批量删除：选中后弹确认框，调用 `cmd_delete_keys`
- [x] 批量设置 TTL：输入秒数，批量执行 EXPIRE

---

## Phase 3：命令控制台

### 3.1 Rust 后端 - 命令执行
- [x] `cmd_execute_raw(conn_id, command: String) -> Result<RedisValue>`
- [x] `RedisValue` 枚举：`Nil / Int / Bulk / Array / Error`，序列化为前端可渲染结构
- [x] 命令历史写入 SQLite `query_history` 表
- [x] 禁止执行危险命令白名单（`FLUSHALL`/`FLUSHDB`/`CONFIG SET`/`SHUTDOWN` 需二次确认）

### 3.2 前端 - 控制台界面
- [x] `Console.tsx`：使用 xterm.js 渲染终端
- [x] 顶部选择当前连接和 DB index
- [x] 输入区支持上下键翻历史命令
- [x] 命令自动补全（常用命令关键字提示）
- [x] 输出结果格式化：Array 类型按行缩进显示，Error 红色显示
- [x] 历史记录面板（侧边抽屉）：查看、一键重新执行历史命令

---

## Phase 4：服务器信息监控

### 4.1 Rust 后端 - INFO 解析
- [x] `cmd_get_server_info(conn_id) -> ServerInfo`：执行 `INFO all`，解析为结构化数据
- [x] `ServerInfo` 包含：`server`（版本、模式、OS）、`clients`（连接数）、`memory`（used_memory、peak）、`stats`（命中率、ops/sec）、`replication`（角色、从库数）
- [x] `cmd_get_slowlog(conn_id, count) -> Vec<SlowlogEntry>`
- [x] `cmd_get_dbsize(conn_id) -> HashMap<u8, u64>`（各 DB 的 key 数量）

### 4.2 前端 - 服务器信息页
- [x] `ServerInfo.tsx`：顶部 4 个关键指标卡（内存使用、连接数、命令/秒、缓存命中率）
- [x] 内存使用折线图（每 5 秒轮询一次，保留最近 60 个点）：用 ECharts 渲染
- [x] 命令执行速率折线图
- [x] 数据库 Key 数量柱状图（按 DB 分组）
- [x] 服务器基本信息表格（版本、启动时间、角色等）
- [x] 慢查询日志表格：执行时间（微秒）、命令、发生时间

---

## Phase 5：数据导入导出

### 5.1 Rust 后端 - 导出
- [x] `cmd_export_keys(conn_id, keys: Vec<String>, format: ExportFormat) -> Result<String>`
- [x] `ExportFormat` 枚举：`Json` / `Csv`
- [x] JSON 格式：`[{ "key": "...", "type": "...", "ttl": 100, "value": ... }]`
- [x] CSV 格式：key, type, ttl, value（Hash/List/Set/ZSet 序列化为 JSON 字符串放 value 列）
- [ ] 调用系统文件保存对话框（`tauri::dialog::save`）写入文件

### 5.2 Rust 后端 - 导入
- [x] `cmd_import_keys(conn_id, file_path: String) -> Result<ImportResult>`
- [x] `ImportResult`：`{ success_count, failed_count, errors: Vec<String> }`
- [x] 解析 JSON 文件，逐条写入 Redis（根据 type 选择对应命令）
- [x] 支持 TTL 恢复（EXPIRE）

### 5.3 前端 - 导入导出 UI
- [x] Key 列表工具栏增加"导出"按钮：导出当前选中或当前 pattern 匹配的所有 Key
- [x] 导出格式选择下拉（JSON / CSV）
- [ ] "导入"按钮：打开文件选择对话框，选择后展示预览（前 10 条），确认后执行导入
- [x] 导入结果 Modal：显示成功/失败数量，失败条目可展开查看

---

## Phase 6：打包与发布

### 6.1 自动更新
- [ ] 配置 Tauri updater：指定更新检查 URL（GitHub Releases JSON）
- [ ] 应用启动时静默检查更新，有新版本时显示通知 Banner
- [ ] 点击 Banner 展示更新日志，确认后下载安装

### 6.2 打包配置
- [ ] `tauri.conf.json` 配置应用图标（各尺寸 .ico / .png）
- [ ] 配置安装包元数据：应用名、版本、作者、描述
- [ ] 配置 Windows .msi：安装路径、开机自启选项（可选）
- [ ] 运行 `npm run tauri build` 生成 `.msi` 和 `.exe` 两种安装包

### 6.3 发布
- [ ] 创建 GitHub 仓库，配置 GitHub Actions CI/CD
- [ ] CI 触发条件：推送 `v*` tag
- [ ] CI 流程：安装 Rust + Node → 构建 → 上传 Release Assets
- [ ] 编写 Release Notes 模板

---

## 风险与应对

| 风险 | 概率 | 应对 |
|------|------|------|
| 百万 Key 列表渲染卡顿 | 高 | 虚拟列表 + SCAN 分批（每批 200），不一次性加载全部 |
| Redis 连接断开无感知 | 中 | 心跳检测（每 30s PING），断线自动重连 3 次 |
| 大 Value（>1MB）导致界面卡死 | 中 | 超过 100KB 只显示预览，提供"加载完整内容"按钮 |
| 密码明文泄露 | 低 | AES-256-GCM 加密存 SQLite，密钥不离开本机 |
| Tauri WebView 平台差异 | 低 | 锁定 Windows 使用 WebView2，统一行为 |

---

## 开发顺序总览

```
Week 1:  Phase 0  - 脚手架、布局、插件系统、SQLite
Week 2:  Phase 1  - 连接管理（后端池 + 前端表单 + CRUD）
Week 3:  Phase 2上 - Key 浏览器（SCAN + Key 树 + 基本操作）
Week 4:  Phase 2下 - 5 种数据类型 Editor
Week 5:  Phase 3+4 - 命令控制台 + 服务器监控
Week 6:  Phase 5+6 - 导入导出 + 打包发布
Week 7:  Phase 7  - SSH 插件脚手架 + 连接管理
Week 8:  Phase 8  - SSH 终端（多标签 + xterm.js）
Week 9:  Phase 9  - SFTP 文件管理器（已下线）
Week 10: Phase 10 - SSH 密钥管理
Week 11: Phase 11 - 端口转发
Week 12: Phase 12 - 快捷指令 + 会话录制 + 打包更新
Week 13: Phase 13 - S3 插件脚手架 + 连接管理
Week 14: Phase 14 - Bucket 浏览器
Week 15: Phase 15 - 对象浏览器（列表、导航、基本操作）
Week 16: Phase 16 - 上传下载与进度管理
Week 17: Phase 17 - 对象预览 + 预签名 URL
Week 18: Phase 18 - 高级功能（版本管理、生命周期、存储桶策略）
Week 19: Phase 19 - 打包更新（第三期）
```

---

# 第二期：SSH 客户端插件

> 目标：在现有插件体系内新增 `ssh-client` 插件，提供多标签 SSH 终端、本地密钥管理、端口转发能力（SFTP 功能已按当前产品决策下线）。

---

## 第二期技术选型增量

| 新增项 | 方案 | 说明 |
|--------|------|------|
| SSH 协议实现 | `russh` 0.44（纯 Rust） | 原生 async/await，与 Tokio 无缝集成，无 C 依赖，Windows 友好 |
| 终端解析 | `xterm.js`（已有） + `@xterm/addon-fit` `@xterm/addon-web-links` | 自适应尺寸、链接可点击 |
| 文件图标 | `react-file-icon` | SFTP 文件列表文件类型图标 |
| 分割面板 | `allotment` | 拖拽调整终端/文件面板比例 |
| 密钥格式 | `ssh-key` crate | 解析/生成 OpenSSH、PEM、PKCS#8 格式密钥 |

---

## 第二期目录结构增量

```
src/
└── plugins/
    └── ssh-client/
        ├── index.tsx                   # 插件入口（注册 manifest）
        ├── store/
        │   ├── ssh-connections.ts      # SSH 连接列表状态
        │   ├── sessions.ts             # 活跃终端会话状态（多标签）
        │   └── tunnels.ts              # 端口转发规则状态
        ├── views/
        │   ├── SshConnectionList.tsx   # 连接管理主页
        │   ├── TerminalWorkspace.tsx   # 多标签终端工作区
        │   ├── KeyManager.tsx          # SSH 密钥管理
        │   └── TunnelManager.tsx       # 端口转发管理
        └── components/
            ├── SshConnectionForm.tsx   # 新建/编辑连接表单
            ├── TerminalTab.tsx         # 单个终端标签
            ├── KeyImportForm.tsx       # 导入密钥表单
            ├── TunnelRuleForm.tsx      # 端口转发规则表单
            └── QuickCommandPanel.tsx   # 快捷指令面板（侧边抽屉）

src-tauri/src/
└── plugins/
    └── ssh/
        ├── mod.rs
        ├── session_pool.rs             # SSH 会话池（按连接 id 管理）
        ├── terminal.rs                 # PTY 会话创建与 I/O 转发
        ├── tunnel.rs                   # 端口转发（本地/远程）
        ├── key_store.rs                # SSH 密钥文件读取与解密
        └── commands.rs                 # 所有 Tauri Command 暴露层
```

---

## Phase 7：SSH 插件脚手架与连接管理

### 7.1 SQLite 扩展
- [x] `db/init.rs` 新增建表 `ssh_connections`：
  - 字段：`id`（UUID）、`name`、`group_name`、`host`、`port`（默认 22）、`username`、`auth_type`（`password` / `key` / `key_password`）、`password_encrypted`、`key_id`（外键 `ssh_keys.id`，可空）、`key_passphrase_encrypted`、`jump_host_id`（跳板机，可空，自引用）、`encoding`（默认 `utf-8`）、`keepalive_interval`（默认 30s）、`created_at`
- [x] 新增建表 `ssh_keys`：
  - 字段：`id`（UUID）、`name`、`type`（`rsa` / `ed25519` / `ecdsa`）、`private_key_path`、`public_key`（文本存储）、`created_at`
- [x] 新增建表 `ssh_quick_commands`：
  - 字段：`id`、`connection_id`（可空，空表示全局）、`name`、`command`、`sort_order`
- [x] 新增建表 `port_forward_rules`：
  - 字段：`id`、`connection_id`、`name`、`type`（`local` / `remote` / `dynamic`）、`local_host`、`local_port`、`remote_host`、`remote_port`、`auto_start`（bool）、`status`（`stopped` / `running` / `error`）

### 7.2 Rust 后端 - 连接 CRUD
- [x] `db/ssh_connection_repo.rs`：实现 `list_ssh_connections()`、`save_ssh_connection()`、`delete_ssh_connection()`、`get_ssh_connection(id)`
- [x] `commands.rs` 暴露：
  - [x] `cmd_ssh_list_connections() -> Vec<SshConnectionInfo>`
  - [x] `cmd_ssh_save_connection(form: SshConnectionForm) -> Result<String>`（返回 id，密码/密钥口令字段加密后存储）
  - [x] `cmd_ssh_delete_connection(id: String) -> Result<()>`
  - [x] `cmd_ssh_test_connection(form: SshConnectionForm) -> Result<u64>`（返回握手耗时毫秒）

### 7.3 Rust 后端 - SSH 会话池
- [x] `session_pool.rs`：使用 `Arc<Mutex<HashMap<String, SshSessionHandle>>>` 管理活跃会话
- [x] `SshSessionHandle`：包含 russh `Handle`、连接配置快照、最后活跃时间
- [x] 实现 `open_session(conn_id, config) -> Result<()>`：建立 SSH 握手，支持密码认证和公钥认证两种路径
- [x] 实现 `close_session(conn_id)`：发送 SSH disconnect，从池中移除
- [x] 实现 `get_session(conn_id) -> Result<SshSessionHandle>`：若不存在则返回错误
- [x] 心跳 keepalive：每隔 `keepalive_interval` 秒发送 SSH keepalive 包，断开时标记状态为 `disconnected`
- [x] 重连策略：自动重试 3 次，间隔 2s/4s/8s 指数退避

### 7.4 前端 - 连接列表页
- [x] `SshConnectionList.tsx`：左侧主视图，展示分组的 SSH 连接列表
- [x] 每个连接条目显示：连接名、`user@host:port`、认证类型图标（密码锁/密钥图标）、连接状态点（灰/绿/红）
- [x] 工具栏：新建连接、搜索框（按名称/主机过滤）
- [x] 右键菜单：连接（开启终端）、在新标签打开、编辑、复制配置、删除
- [ ] 支持拖拽排序分组

### 7.5 前端 - 连接表单
- [x] `SshConnectionForm.tsx`：Ant Design Modal + Form（Tabs 分两栏：基本 / 高级）
- [x] 基本标签字段：名称、分组、主机、端口、用户名、认证方式（单选：密码 / 密钥 / 密钥+口令）
- [x] 认证方式为"密码"时：显示密码输入框
- [x] 认证方式为"密钥"或"密钥+口令"时：下拉选择已存密钥，或点击"导入新密钥"
- [x] 高级标签字段：跳板机（下拉选择已有连接）、编码（默认 UTF-8）、Keepalive 间隔（秒）、服务器存活检测超时
- [x] "测试连接"按钮：调用 `cmd_ssh_test_connection`，显示"握手成功，耗时 XXms"或错误详情
- [x] 表单校验：host/port/username 必填，port 范围 1-65535

### 7.6 前端 - 连接状态管理
- [x] Zustand `ssh-connections.ts`：`connections[]`、`connectedIds: Set<string>`
- [x] 操作：`fetchConnections()`、`upsertConnection()`、`removeConnection()`、`markConnected(id)`、`markDisconnected(id)`
- [x] 监听后端 Tauri 事件 `ssh://session-closed`，自动更新状态点为红色

---

## Phase 8：多标签 SSH 终端

### 8.1 Rust 后端 - PTY 会话
- [x] `terminal.rs`：定义 `TerminalSession` 结构体，包含 `channel`（russh Channel）、`session_id`（UUID）、`conn_id`
- [x] `cmd_ssh_open_terminal(conn_id: String) -> Result<String>`：在已连接会话上请求 PTY（`xterm`，初始 80×24），返回 `session_id`
- [x] `cmd_ssh_terminal_input(session_id: String, data: Vec<u8>) -> Result<()>`：将前端输入字节流写入 channel stdin
- [x] `cmd_ssh_terminal_resize(session_id: String, cols: u16, rows: u16) -> Result<()>`：发送 `window-change` 请求
- [x] `cmd_ssh_close_terminal(session_id: String) -> Result<()>`：关闭 channel
- [x] 后端输出推送：channel stdout/stderr 数据通过 Tauri 事件 `ssh://terminal-output/{session_id}` 推送到前端（`Vec<u8>` 序列化为 base64）
- [x] 会话结束推送：channel 关闭时发送 `ssh://terminal-exit/{session_id}`，携带退出码

### 8.2 前端 - 终端工作区
- [x] `TerminalWorkspace.tsx`：顶部多标签 Tab Bar + 下方终端内容区
- [x] Tab Bar：每个标签显示"连接名 #序号"、关闭按钮；右键菜单：重命名标签、复制会话、关闭其他标签
- [ ] 支持拖拽标签排序
- [x] 新建标签：点击"+"按钮，弹出连接选择器（展示已配置连接列表），选中后调用 `cmd_ssh_open_terminal`

### 8.3 前端 - 单终端标签
- [x] `TerminalTab.tsx`：封装 xterm.js Terminal 实例
- [x] 加载 `@xterm/addon-fit`：窗口/面板尺寸变化时自动 resize，触发 `cmd_ssh_terminal_resize`
- [x] 加载 `@xterm/addon-web-links`：终端内 URL 可点击
- [ ] 加载 `@xterm/addon-search`：Ctrl+F 触发文本搜索框
- [x] 监听 Tauri 事件 `ssh://terminal-output/{session_id}`，将 base64 decode 后写入 xterm
- [x] 监听 `ssh://terminal-exit/{session_id}`，在终端显示"[会话已结束，退出码: X]"灰色提示
- [x] 键盘输入：`terminal.onData` 回调调用 `cmd_ssh_terminal_input`
- [ ] 右键菜单：复制选中文本、粘贴、清屏、显示快捷指令面板

### 8.4 前端 - 快捷指令面板
- [x] `QuickCommandPanel.tsx`：侧边抽屉（Ant Design Drawer）
- [x] 展示当前连接的专属快捷指令 + 全局快捷指令（分组显示）
- [x] 点击指令：直接发送到当前活跃终端（调用 `cmd_ssh_terminal_input`，末尾追加 `\n`）
- [x] 支持新增/编辑/删除指令，持久化到 `ssh_quick_commands` 表
- [ ] 支持指令搜索（前端过滤）

### 8.5 前端 - 状态管理
- [x] Zustand `sessions.ts`：`sessions: Map<sessionId, SessionMeta>`（含 `connId`、`tabLabel`、`status: 'connecting'|'active'|'closed'`）
- [x] 操作：`openSession()`、`closeSession()`、`renameSession()`、`setActive(sessionId)`
- [x] `activeSessionId: string | null`：当前聚焦标签

---

## Phase 9：SFTP 文件管理器（已下线）

- [x] 2026-04-28 按产品决策移除 SFTP 功能，避免继续投入维护成本：
  - 前端移除 SFTP Tab/视图/状态与组件（`SftpExplorer`、`store/sftp.ts`、`SftpFileList`、`SftpToolbar`）。
  - 后端移除 SFTP command 注册与导出，移除 `plugins/ssh/sftp.rs` 模块。
  - 类型定义中清理 SFTP 相关结构（`SshFileEntry`、`SftpTransferProgress`）。
- [x] 兼容性验证：移除后 `cargo check`、`npm run build`、`npm test` 均通过。

---

## Phase 10：SSH 密钥管理

### 10.1 Rust 后端 - 密钥操作
- [ ] `key_store.rs`：实现 `load_private_key(path, passphrase?) -> Result<KeyPair>`（使用 `ssh-key` crate 解析 OpenSSH / PEM 格式）
- [x] `cmd_ssh_list_keys() -> Vec<SshKeyInfo>`：从 `ssh_keys` 表查询
- [ ] `cmd_ssh_import_key(name: String, private_key_path: String, passphrase?: String) -> Result<String>`：
  - 解析私钥文件，验证格式有效
  - 提取公钥文本（`ssh-ed25519 AAA... comment` 格式）
  - 密钥口令加密后存 `ssh_keys` 表，返回 key id
- [x] `cmd_ssh_delete_key(id: String) -> Result<()>`
- [x] `cmd_ssh_generate_key(name: String, key_type: KeyType, bits?: u32, passphrase?: String) -> Result<SshKeyPair>`：
  - 支持 `Ed25519`（推荐）、`RSA-4096`
  - 返回 `{ private_key_pem, public_key }`（private_key_pem 不存到数据库，由用户自行保存）
- [x] `cmd_ssh_get_public_key(id: String) -> Result<String>`：返回公钥文本，便于复制到服务器

### 10.2 前端 - 密钥管理页
- [x] `KeyManager.tsx`：列表展示所有已导入密钥（名称、类型、指纹、导入时间）
- [x] 工具栏：导入密钥、生成新密钥
- [x] 每行操作：复制公钥到剪贴板、删除（二次确认）
- [x] `KeyImportForm.tsx`：Modal 表单，字段：名称、私钥文件路径（文件选择器）、口令（可选）；点击确认后调用 `cmd_ssh_import_key`，失败时显示具体错误（格式不支持/口令错误）
- [ ] 生成密钥 Modal：选择类型（Ed25519 / RSA-4096）、名称、口令（可选）；生成后展示私钥文本框（提示"请立即保存，关闭后不再显示"）+ 保存到文件按钮；自动将公钥存入 `ssh_keys` 表

---

## Phase 11：端口转发

### 11.1 Rust 后端 - 本地端口转发
- [ ] `tunnel.rs`：实现 `LocalTunnel` 结构体，使用 `tokio::net::TcpListener` 监听本地端口
- [ ] 每次本地连接建立时，在 SSH 会话上打开一条 `direct-tcpip` channel，双向 pipe 本地 TCP 流与 SSH channel
- [x] `cmd_tunnel_start_local(conn_id, rule_id, local_port, remote_host, remote_port) -> Result<()>`：启动本地转发，更新 `port_forward_rules.status = 'running'`
- [x] `cmd_tunnel_stop(rule_id) -> Result<()>`：关闭监听器，断开所有关联 channel，状态改为 `stopped`

### 11.2 Rust 后端 - 远程端口转发
- [ ] 在 SSH 会话上发送 `tcpip-forward` 请求，服务端监听 `remote_port`
- [ ] 收到服务端 `forwarded-tcpip` channel 后，本地连接 `local_host:local_port`，双向 pipe
- [x] `cmd_tunnel_start_remote(conn_id, rule_id, remote_port, local_host, local_port) -> Result<()>`

### 11.3 Rust 后端 - 动态 SOCKS5 转发
- [ ] 本地启动 SOCKS5 代理服务器（`tokio` 手写或使用 `fast-socks5` crate）
- [ ] 每个 SOCKS5 连接请求解析目标地址，通过 SSH `direct-tcpip` channel 中转
- [x] `cmd_tunnel_start_dynamic(conn_id, rule_id, local_port) -> Result<()>`

### 11.4 Rust 后端 - 规则持久化与自启
- [x] `cmd_tunnel_list_rules(conn_id) -> Vec<TunnelRule>`
- [x] `cmd_tunnel_save_rule(form: TunnelRuleForm) -> Result<String>`
- [x] `cmd_tunnel_delete_rule(id: String) -> Result<()>`
- [ ] SSH 连接成功后，自动启动该连接下 `auto_start = true` 的转发规则
- [ ] 转发异常时（SSH 断开/端口占用）通过 Tauri 事件 `ssh://tunnel-error/{rule_id}` 推送错误

### 11.5 前端 - 转发管理页
- [x] `TunnelManager.tsx`：以连接为分组，展示该连接下所有转发规则
- [x] 每条规则显示：名称、类型（本地/远程/动态）、端口映射、状态开关（Toggle：运行/停止）、错误提示
- [x] 工具栏：新建规则按钮
- [x] `TunnelRuleForm.tsx`：Modal 表单，字段：
  - 名称、所属连接（下拉）、转发类型（单选 Tab）
  - 本地转发：本地端口、远程主机、远程端口
  - 远程转发：远程端口、本地主机、本地端口
  - 动态转发：本地 SOCKS5 端口
  - 开机自启（Toggle）
- [ ] 状态实时更新：监听 `ssh://tunnel-error/{rule_id}` 事件，规则行显示红色错误角标

---

## Phase 12：快捷指令增强、会话录制与打包更新

### 12.1 会话录制（Asciinema 格式）
- [ ] Rust：新增 `cmd_ssh_start_recording(session_id, output_path) -> Result<()>`：开始录制，将终端输出写入 `.cast` 文件（Asciinema v2 格式）
- [ ] `cmd_ssh_stop_recording(session_id) -> Result<String>`：停止录制，返回文件路径
- [ ] 前端终端标签右键菜单增加"开始录制 / 停止录制"
- [ ] 录制状态：终端标签右上角显示红色录制指示点
- [ ] 录制文件管理：设置页新增"录制历史"列表，可打开文件夹或删除

### 12.2 快捷指令增强
- [ ] 支持指令变量占位符：`{REMOTE_PATH}`、`{DATE}` 等，发送前弹窗填写变量值
- [ ] 支持从剪贴板自动填充变量（Ctrl+V 快速填充）
- [ ] 指令导入导出（JSON 格式），方便团队共享

### 12.3 SSH 配置文件导入
- [ ] `cmd_ssh_import_config(path: String) -> Result<Vec<SshConnectionForm>>`：解析 `~/.ssh/config` 文件，提取 Host 配置块
- [ ] 前端：连接管理页"从 SSH config 导入"按钮，解析后展示预览列表（可勾选），确认后批量写入数据库

### 12.4 跳板机支持完善
- [ ] Rust 实现 ProxyJump：先 SSH 到跳板机，再通过跳板机上的 `direct-tcpip` channel 连接目标主机（纯 Rust 链式 Session，不依赖外部 ssh 二进制）
- [ ] 支持多级跳板（最多 3 跳）
- [ ] 连接表单"跳板机"字段支持配置

### 12.5 打包更新（第二期）
- [ ] `tauri.conf.json` 版本号升至 `0.2.0`
- [ ] 更新 GitHub Actions CI：`v0.2.*` tag 触发构建
- [ ] Release Notes 模板增加 SSH 功能说明
- [ ] 更新应用内"关于"页，列出版本历史

---

## 第二期风险与应对

| 风险 | 概率 | 应对 |
|------|------|------|
| russh 在 Windows WebView2 环境下的 async 兼容性 | 中 | 所有 SSH I/O 在 Tauri Tokio runtime 线程池执行，与 UI 线程完全隔离 |
| 大文件 SFTP 传输阻塞 UI | 高 | 传输在独立 Tokio task 运行，进度通过事件推送，UI 不阻塞 |
| PTY 输出乱码（编码问题） | 中 | 连接配置支持自定义编码，xterm.js 统一 UTF-8 解码，服务端 LANG 不匹配时提示用户修改编码设置 |
| 端口转发端口冲突 | 低 | 启动前检测本地端口占用（`TcpListener::bind` 探测），冲突时返回具体错误信息 |
| 跳板机多跳延迟高 | 低 | 连接时显示每跳延迟，超时阈值可配置 |
| 密钥文件路径含中文/空格 | 低 | 使用 `std::path::PathBuf` 全程处理，不拼接字符串路径 |

---

# 第三期：S3 对象存储浏览器插件

> 目标：基于 S3 标准协议，支持 AWS S3、MinIO、阿里云 OSS、腾讯云 COS、Cloudflare R2 等兼容服务，提供 Bucket 管理、对象浏览、上传下载、预签名 URL、版本管理等完整能力。

---

## 第三期技术选型增量

| 新增项 | 方案 | 说明 |
|--------|------|------|
| S3 客户端 | `aws-sdk-s3`（Rust 官方） | 支持自定义 endpoint，覆盖全部 S3-compatible 服务，原生 async |
| HTTP 运行时 | `aws-config` + `tokio` | aws-sdk 依赖，已有 tokio |
| 拖放上传 | `react-dropzone` | 文件/文件夹拖入区域触发上传 |
| 文件预览 | `react-pdf`（PDF）+ 原生 `<img>`/`<video>` | 对象内容预览 |
| 代码高亮 | `shiki` | JSON/XML/文本对象内容高亮显示 |
| 大小格式化 | `filesize` | 对象大小友好展示（KB/MB/GB） |

---

## 第三期目录结构增量

```
src/plugins/s3-browser/
├── index.tsx                       # 插件入口（注册 manifest）
├── store/
│   ├── s3-connections.ts           # S3 连接列表状态
│   ├── bucket.ts                   # 当前 Bucket 状态（选中、列表）
│   ├── objects.ts                  # 对象列表、当前前缀、选中对象
│   └── transfers.ts                # 上传/下载任务队列
├── views/
│   ├── S3ConnectionList.tsx        # 连接管理主页
│   ├── BucketList.tsx              # Bucket 列表页
│   ├── ObjectBrowser.tsx           # 对象浏览主视图
│   ├── ObjectPreview.tsx           # 对象内容预览
│   └── BucketSettings.tsx          # Bucket 设置（策略/版本/生命周期）
└── components/
    ├── S3ConnectionForm.tsx        # 新建/编辑连接表单
    ├── ObjectList.tsx              # 对象列表（虚拟滚动）
    ├── BreadcrumbNav.tsx           # 前缀路径面包屑
    ├── UploadDropzone.tsx          # 拖放上传区域
    ├── TransferQueue.tsx           # 传输任务面板
    ├── PresignedUrlModal.tsx       # 预签名 URL 生成弹窗
    ├── CreateFolderModal.tsx       # 新建"文件夹"（前缀）弹窗
    ├── ObjectMetaDrawer.tsx        # 对象元数据侧边抽屉
    └── BucketPolicyEditor.tsx      # 存储桶策略 JSON 编辑器

src-tauri/src/plugins/s3/
├── mod.rs
├── client_pool.rs                  # S3 Client 池（按连接 id 缓存）
├── commands.rs                     # 所有 Tauri Command 暴露层
└── types.rs                        # Serde 数据结构定义
```

---

## Phase 13：S3 插件脚手架与连接管理

### 13.1 SQLite 扩展
- [x] `db/init.rs` 新增建表 `s3_connections`：
  - 字段：`id`（UUID）、`name`、`group_name`、`provider`（`aws` / `minio` / `aliyun` / `tencent` / `r2` / `custom`）、`endpoint`（自定义 endpoint，AWS 填空则自动推断）、`region`、`access_key_id`、`secret_access_key_encrypted`、`path_style`（bool，MinIO 等需要 path-style）、`default_bucket`（可空）、`created_at`

### 13.2 Rust 后端 - S3 Client 池
- [x] `client_pool.rs`：`OnceLock<Mutex<HashMap<String, aws_sdk_s3::Client>>>` 按连接 id 缓存 Client
- [x] `build_client(config: &S3ConnectionConfig) -> aws_sdk_s3::Client`：
  - 使用 `aws_config::from_env()` 或手动构造 `Credentials`
  - 若配置了 `endpoint`，注入 `endpoint_url()`
  - `path_style = true` 时启用 `force_path_style(true)`
  - 区分 provider 预置常用 endpoint（如阿里云 `oss-cn-{region}.aliyuncs.com`、腾讯云 `cos.{region}.myqcloud.com`）
- [x] `get_client(conn_id) -> Result<aws_sdk_s3::Client>`：从池中获取，不存在则返回错误
- [x] `remove_client(conn_id)`：断开时清理

### 13.3 Rust 后端 - 连接 CRUD Commands
- [x] `db/s3_connection_repo.rs`：实现 `list_s3_connections()`、`save_s3_connection()`、`delete_s3_connection()`、`get_s3_connection(id)`
  - `secret_access_key` 使用已有 `crypto` 模块加密存储
- [x] `commands.rs` 暴露：
  - [x] `cmd_s3_list_connections() -> Vec<S3ConnectionInfo>`
  - [x] `cmd_s3_save_connection(form: S3ConnectionForm) -> Result<String>`（返回 id）
  - [x] `cmd_s3_delete_connection(id: String) -> Result<()>`
  - [x] `cmd_s3_test_connection(form: S3ConnectionForm) -> Result<u64>`：临时构造 Client，调用 `list_buckets()`，返回耗时毫秒
  - [x] `cmd_s3_connect(id: String) -> Result<()>`：从 DB 读取配置，构造 Client 存入池
  - [x] `cmd_s3_disconnect(id: String) -> Result<()>`

### 13.4 前端 - 连接列表页
- [x] `S3ConnectionList.tsx`：卡片列表，展示连接名、provider 图标（AWS/MinIO/阿里云等品牌 Logo）、endpoint 简览、连接状态点
- [x] 工具栏：新建连接、搜索（按名称/provider 过滤）
- [x] 右键菜单：连接（进入 Bucket 列表）、编辑、复制配置、删除
- [x] 双击直接进入该连接的 Bucket 列表视图

### 13.5 前端 - 连接表单
- [x] `S3ConnectionForm.tsx`：Modal + Form，分"基本"/"高级"两个 Tab
- [x] 基本 Tab：名称、分组、Provider 下拉（选 AWS 后自动填 region 列表；选 MinIO/Custom 后显示 Endpoint 输入框）、Access Key ID、Secret Access Key（密码框）、Region（文本或下拉）
- [x] 高级 Tab：自定义 Endpoint、Path-Style（开关，MinIO 默认开）、默认打开 Bucket（可选）、连接超时（秒）
- [x] Provider 切换时，根据内置映射自动填充 endpoint 模板（如选"阿里云 OSS"后显示 region 下拉并自动拼接 endpoint）
- [x] "测试连接"按钮：调用 `cmd_s3_test_connection`，显示耗时或错误
- [x] 表单校验：name/accessKeyId/secretAccessKey 必填；选 Custom 时 endpoint 必填

### 13.6 前端 - 连接状态管理
- [x] Zustand `s3-connections.ts`：`connections[]`、`connectedIds: Set<string>`、`activeConnId: string | null`
- [x] 操作：`fetchConnections()`、`upsertConnection()`、`removeConnection()`、`setActive(id)`

---

## Phase 14：Bucket 浏览器

### 14.1 Rust 后端 - Bucket 操作
- [x] `cmd_s3_list_buckets(conn_id) -> Result<Vec<BucketInfo>>`：调用 `list_buckets()`，返回 `{ name, creation_date, region? }`
- [x] `cmd_s3_create_bucket(conn_id, name, region?) -> Result<()>`：调用 `create_bucket()`，自动处理 AWS `CreateBucketConfiguration`（非 us-east-1 需要指定 region）
- [x] `cmd_s3_delete_bucket(conn_id, name) -> Result<()>`：调用 `delete_bucket()`（桶必须为空，否则返回具体错误）
- [x] `cmd_s3_get_bucket_location(conn_id, bucket) -> Result<String>`：获取 bucket 所在 region
- [x] `cmd_s3_get_bucket_versioning(conn_id, bucket) -> Result<VersioningStatus>`：返回 `Enabled / Suspended / Disabled`
- [x] `cmd_s3_set_bucket_versioning(conn_id, bucket, enabled: bool) -> Result<()>`

### 14.2 前端 - Bucket 列表页
- [x] `BucketList.tsx`：表格展示 Bucket 名、Region、创建时间、版本控制状态
- [x] 工具栏：新建 Bucket 按钮、搜索框（前端名称过滤）、刷新
- [x] 每行操作：打开（进入对象浏览器）、复制 Bucket 名、查看设置、删除（二次确认，提示"须先清空所有对象"）
- [x] 点击行 → 进入该 Bucket 的 `ObjectBrowser` 视图，面包屑根节点为 Bucket 名

### 14.3 前端 - 新建 Bucket
- [x] Modal 表单：Bucket 名（校验 AWS 命名规则：3-63 字符、小写字母数字连字符、不能 IP 格式）、Region 下拉、是否启用版本控制（默认关）
- [x] 创建成功后自动追加到列表并高亮

---

## Phase 15：对象浏览器

### 15.1 Rust 后端 - 对象列表
- [x] `cmd_s3_list_objects(conn_id, bucket, prefix, continuation_token?, max_keys=200) -> Result<ListObjectsResult>`
  - 调用 `list_objects_v2()`，使用 `delimiter = "/"` 模拟目录结构
  - 返回 `{ objects: Vec<ObjectItem>, common_prefixes: Vec<String>, next_token?, is_truncated }`
  - `ObjectItem`：`{ key, size, last_modified, etag, storage_class, is_latest? }`
- [x] `cmd_s3_list_object_versions(conn_id, bucket, prefix) -> Result<Vec<ObjectVersion>>`：列出所有版本（开启版本控制时使用）

### 15.2 Rust 后端 - 对象基本操作
- [x] `cmd_s3_head_object(conn_id, bucket, key) -> Result<ObjectMeta>`：获取元数据（`{ content_type, content_length, last_modified, etag, metadata: HashMap, version_id? }`）
- [x] `cmd_s3_delete_object(conn_id, bucket, key, version_id?) -> Result<()>`
- [x] `cmd_s3_delete_objects(conn_id, bucket, keys: Vec<String>) -> Result<DeleteObjectsResult>`：批量删除，返回 `{ deleted_count, errors: Vec<DeleteError> }`
- [x] `cmd_s3_copy_object(conn_id, src_bucket, src_key, dst_bucket, dst_key) -> Result<()>`：同账号内复制
- [x] `cmd_s3_move_object(conn_id, src_bucket, src_key, dst_bucket, dst_key) -> Result<()>`：复制后删除源
- [x] `cmd_s3_rename_object(conn_id, bucket, old_key, new_key) -> Result<()>`：等同于同桶内 move
- [x] `cmd_s3_create_folder(conn_id, bucket, prefix) -> Result<()>`：上传一个空的 `prefix/` 对象模拟文件夹

### 15.3 前端 - 对象浏览主视图
- [x] `ObjectBrowser.tsx`：顶部面包屑导航 + 工具栏 + 主体对象列表
- [x] `BreadcrumbNav.tsx`：展示当前路径（连接名 / Bucket 名 / 前缀层级），点击任意层跳转
- [x] 工具栏（左）：上传文件、上传文件夹、新建文件夹
- [x] 工具栏（右）：视图切换（列表/网格）、排序（名称/大小/修改时间）、搜索框（调用 list 过滤 prefix）、刷新

### 15.4 前端 - 对象列表组件
- [x] `ObjectList.tsx`：使用 `@tanstack/react-virtual` 虚拟渲染，支持万级对象不卡顿
- [x] 列表模式：图标（文件夹/文件类型）、名称、大小、修改时间、存储类型、操作列
- [x] 网格模式：文件图标卡片（图片类型显示缩略图）
- [x] 文件夹行（common_prefix）：双击进入，右键菜单：下载文件夹（递归）、删除文件夹（递归）、复制路径
- [x] 文件行右键菜单：下载、预览、复制 URL（公开）、生成预签名 URL、复制对象路径、重命名、移动、删除
- [x] 多选：Checkbox 列 + Shift 连选 + Ctrl 单选；选中后底部浮现批量操作栏（批量下载、批量删除、批量移动）
- [x] "加载更多"按钮（基于 `continuation_token` 分页，每次 200 条）

### 15.5 前端 - 对象元数据侧边抽屉
- [x] `ObjectMetaDrawer.tsx`：点击文件行"详情"打开右侧抽屉
- [x] 展示：对象键名、存储类型、大小、ETag、最后修改时间、Content-Type、自定义 Metadata（key-value 表格）、版本 ID（若启用版本控制）
- [ ] 版本历史列表（当 Bucket 开启版本控制时）：展示所有版本，可下载指定版本、删除特定版本

---

## Phase 16：上传下载与进度管理

### 16.1 Rust 后端 - 分片上传
- [x] `cmd_s3_upload_file(conn_id, bucket, key, local_path, storage_class?) -> Result<String>`（返回 transfer_id）：
  - 文件 < 5MB：单次 `put_object()` 上传
  - 文件 ≥ 5MB：启动 Multipart Upload（`create_multipart_upload`），按 8MB 分片并发上传（最多 4 个并发 part），完成后 `complete_multipart_upload`
  - 每上传完一个分片，通过 Tauri 事件 `s3://transfer-progress/{transfer_id}` 推送 `{ transferred, total, speed_bps }`
- [x] `cmd_s3_upload_folder(conn_id, bucket, prefix, local_dir) -> Result<String>`（返回 batch_id）：遍历本地目录，为每个文件生成独立 transfer_id，所有任务并发度限制为 4
- [x] `cmd_s3_cancel_upload(transfer_id) -> Result<()>`：中止 Multipart Upload（调用 `abort_multipart_upload`）

### 16.2 Rust 后端 - 下载
- [x] `cmd_s3_download_object(conn_id, bucket, key, local_path, version_id?) -> Result<String>`（返回 transfer_id）：
  - 调用 `get_object()`，流式写入本地文件
  - 每 256KB 推送一次进度事件
- [x] `cmd_s3_download_objects(conn_id, bucket, keys: Vec<String>, local_dir) -> Result<String>`（批量下载，返回 batch_id）：保留对象键的相对路径结构，并发度 4
- [x] `cmd_s3_download_folder(conn_id, bucket, prefix, local_dir) -> Result<String>`：列出前缀下所有对象后批量下载，递归保留目录结构
- [x] `cmd_s3_cancel_download(transfer_id) -> Result<()>`

### 16.3 前端 - 拖放上传
- [ ] `UploadDropzone.tsx`：对象列表区域整体作为 drop zone（使用 `react-dropzone`）
- [ ] 拖入文件：解析 `FileList`，调用 `cmd_s3_upload_file` 逐个上传
- [ ] 拖入文件夹：调用 Tauri `dialog` 选择文件夹后 `cmd_s3_upload_folder`
- [ ] 点击工具栏"上传文件"：调用系统文件选择对话框（多选），支持同时选择多个文件
- [ ] 点击工具栏"上传文件夹"：调用系统文件夹选择对话框

### 16.4 前端 - 传输队列面板
- [ ] `TransferQueue.tsx`：底部可折叠面板（与 SSH 期的传输面板复用同一设计语言）
- [ ] 每个任务显示：文件名、方向图标（上传↑/下载↓）、进度条、速度（如"3.2 MB/s"）、已传/总量、状态（等待中/传输中/完成/失败/已取消）
- [ ] 任务操作：取消（传输中）、重试（失败时）、打开文件夹（完成的下载任务）
- [ ] Zustand `transfers.ts`：监听 `s3://transfer-progress/{transfer_id}` 事件，更新进度；维护 `transferMap`，按状态分组统计
- [ ] 底部最小化后状态栏角标显示"↑2 ↓1"（活跃传输数）

---

## Phase 17：对象预览与预签名 URL

### 17.1 Rust 后端 - 对象内容读取
- [x] `cmd_s3_get_object_text(conn_id, bucket, key, version_id?) -> Result<String>`：读取对象内容为字符串（限 2MB，超出报错）
- [x] `cmd_s3_get_object_bytes(conn_id, bucket, key, version_id?) -> Result<Vec<u8>>`：读取二进制内容（限 10MB，图片/PDF 预览用）
- [x] `cmd_s3_generate_presigned_url(conn_id, bucket, key, expires_secs: u64, version_id?) -> Result<String>`：
  - 使用 `aws_sdk_s3::presigning::PresigningConfig` 生成预签名 GET URL
  - 支持设置过期时间（1分钟 ~ 7天）

### 17.2 前端 - 对象预览
- [x] `ObjectPreview.tsx`：Modal 或右侧抽屉展示对象内容，根据 Content-Type 选择渲染方式：
  - **图片**（`image/*`）：`<img>` 标签直接渲染（base64 或 presigned URL）
  - **视频**（`video/*`）：`<video>` 标签 + 预签名 URL 流式播放
  - **音频**（`audio/*`）：`<audio>` 标签 + 播放控件
  - **PDF**（`application/pdf`）：`react-pdf` 渲染，支持翻页
  - **文本/代码**（`text/*`、`application/json`、`application/xml` 等）：`shiki` 代码高亮，自动检测语言
  - **其他**：显示"无法预览，请下载后查看"+ 下载按钮
- [x] 预览 Modal 顶部显示：对象键名、大小、Content-Type；操作按钮：下载、复制预签名 URL

### 17.3 前端 - 预签名 URL 弹窗
- [x] `PresignedUrlModal.tsx`：选择过期时间（下拉：5分钟/1小时/1天/7天/自定义）、点击生成调用 `cmd_s3_generate_presigned_url`
- [x] 展示生成的 URL（只读文本框）、一键复制按钮
- [ ] 显示过期时间倒计时提示（"此链接将在 X 时间后失效"）

---

## Phase 18：高级功能

### 18.1 Rust 后端 - 存储桶策略
- [x] `cmd_s3_get_bucket_policy(conn_id, bucket) -> Result<String>`：返回 JSON 字符串（策略不存在时返回空字符串）
- [x] `cmd_s3_set_bucket_policy(conn_id, bucket, policy_json: String) -> Result<()>`：校验 JSON 格式后提交
- [x] `cmd_s3_delete_bucket_policy(conn_id, bucket) -> Result<()>`

### 18.2 Rust 后端 - 生命周期规则
- [ ] `cmd_s3_get_lifecycle_rules(conn_id, bucket) -> Result<Vec<LifecycleRule>>`：解析 XML 响应为结构化数据
  - `LifecycleRule`：`{ id, prefix, status, expiration_days?, transition_days?, transition_storage_class? }`
- [ ] `cmd_s3_set_lifecycle_rules(conn_id, bucket, rules: Vec<LifecycleRule>) -> Result<()>`
- [ ] `cmd_s3_delete_lifecycle_rules(conn_id, bucket) -> Result<()>`

### 18.3 Rust 后端 - 对象标签
- [x] `cmd_s3_get_object_tags(conn_id, bucket, key) -> Result<Vec<Tag>>`
- [x] `cmd_s3_set_object_tags(conn_id, bucket, key, tags: Vec<Tag>) -> Result<()>`
- [x] `cmd_s3_delete_object_tags(conn_id, bucket, key) -> Result<()>`

### 18.4 Rust 后端 - 存储统计
- [x] `cmd_s3_get_bucket_stats(conn_id, bucket, prefix?) -> Result<BucketStats>`：
  - 遍历对象（分页 list），统计 `{ object_count, total_size, storage_class_breakdown: HashMap }`
  - 数量大时后台异步执行，通过事件 `s3://stats-progress/{task_id}` 推送中间结果

### 18.5 前端 - Bucket 设置页
- [x] `BucketSettings.tsx`：Tabs 页（概览 / 版本控制 / 生命周期 / 存储桶策略）
- [x] **概览 Tab**：显示 `BucketStats`（对象数量、总大小、存储类型分布饼图）、Region、创建时间
- [x] **版本控制 Tab**：Toggle 开启/暂停版本控制，显示当前状态说明
- [ ] **生命周期 Tab**：规则列表（前缀、过期天数、转储类型）；支持新增/编辑/删除规则（Modal 表单：前缀、到期后删除天数、转 IA/Glacier 天数）
- [x] **存储桶策略 Tab**：`BucketPolicyEditor.tsx`，Monaco-like JSON 编辑器（使用 `shiki` 高亮），展示当前策略，支持格式化、校验、保存；提供常用策略模板下拉（公开读、私有、仅特定 IP）

### 18.6 前端 - 对象标签管理
- [x] `ObjectMetaDrawer.tsx` 增加"标签"折叠面板
- [x] 展示当前对象标签（key-value 表格），支持新增（行内输入）、删除（行末删除按钮）、保存

---

## Phase 19：打包更新（第三期）

### 19.1 版本更新
- [x] `tauri.conf.json` 版本号升至 `0.3.0`
- [x] `Cargo.toml` 同步版本号

### 19.2 CI/CD 更新
- [x] GitHub Actions 增加 `v0.3.*` tag 构建触发
- [x] Release Notes 模板增加 S3 功能说明

### 19.3 应用内更新
- [ ] "关于"页版本历史增加 v0.3.0 条目
- [ ] 应用内更新检测逻辑兼容新版本号

---

## 第三期风险与应对

| 风险 | 概率 | 应对 |
|------|------|------|
| 各厂商 S3 兼容性差异（签名算法/path style/字段缺失） | 高 | 按 provider 预置配置模板，测试连接时做兼容性探测，错误信息给出具体 provider 提示 |
| 大桶（千万对象）列表分页性能 | 高 | 虚拟列表 + 每次仅加载 200 条，搜索走前缀过滤而非全量 list |
| 大文件分片上传中断恢复 | 中 | 记录 upload_id 到 SQLite，重启后可继续；超过 48h 未完成的 Multipart 自动 abort |
| Presigned URL 包含密钥信息（安全） | 低 | 本地生成，不发送到任何中间服务；URL 展示时提示有效期 |
| 跨账号/跨 region 复制失败 | 中 | 先提示用户"不支持跨账号复制"；同账号跨 region 通过 copy_object 的 source_bucket/region 参数处理 |
| PDF/视频预览文件过大导致内存溢出 | 中 | 视频走 presigned URL 流式播放（不落内存）；PDF 限制 50 页预览；图片限制 10MB |

---

# 第四期：MongoDB 连接工具插件

> 目标：新增 `mongodb-client` 插件，提供 MongoDB 连接管理、数据库/集合浏览、文档 CRUD、查询/聚合、索引管理、导入导出和基础服务器状态能力。

---

## 第四期技术选型增量

| 新增项 | 方案 | 说明 |
|--------|------|------|
| MongoDB 客户端 | `mongodb` Rust 官方驱动 | Tokio async，支持 URI、认证、TLS、Replica Set/SRV 连接串 |
| BSON/JSON | `bson` / MongoDB Extended JSON | 保留 ObjectId、Date、Decimal128 等 MongoDB 类型语义 |
| 文档编辑 | JSON 编辑 + 格式化/校验 | 第一版不做复杂表格行内编辑，降低嵌套结构误操作 |
| 本地存储 | SQLite + AES-GCM | 沿用现有连接配置与敏感字段加密策略 |

---

## Phase 20：MongoDB 插件脚手架与连接管理

### 20.1 Rust 后端 - 数据结构与连接配置
- [x] `Cargo.toml` 增加 `mongodb` 依赖
- [x] `db/init.rs` 增加 `mongodb_connections` 表
- [x] 新增 `db/mongodb_connection_repo.rs`：连接配置 CRUD，URI/password 加密存储
- [x] 支持连接模式：`uri` / `form`
- [x] 表单连接字段：host、port、username、password、auth_database、default_database、replica_set、tls、srv

### 20.2 Rust 后端 - Client 池与 Commands
- [x] 新增 `plugins/mongodb/{mod,types,client_pool,commands}.rs`
- [x] `client_pool.rs`：按 connection id 缓存 `mongodb::Client`
- [x] `cmd_mongo_test_connection(form) -> MongoLatency`：临时构造 client，执行 `ping`
- [x] `cmd_mongo_connect(id)`：读取配置与密文，建立 client 并存入池
- [x] `cmd_mongo_disconnect(id)`：从池移除 client
- [x] `cmd_mongo_list/save/delete_connections`

### 20.3 前端 - 插件注册与连接页
- [x] 新增 `src/plugins/mongodb-client/index.tsx` 并注册到 builtin plugins
- [x] 新增 `types.ts`、`store/mongodb-connections.ts`
- [x] 新增 `MongoConnectionList.tsx`：分组连接卡片、搜索、新建、编辑、删除、双击连接
- [x] 新增 `MongoConnectionForm.tsx`：URI/表单模式切换、测试连接、TLS/SRV/Replica Set 配置
- [x] 连接成功后自动跳转 `Databases`

---

## Phase 21：数据库与集合浏览

### 21.1 Rust 后端
- [x] `cmd_mongo_list_databases(conn_id) -> Vec<MongoDatabaseInfo>`
- [x] `cmd_mongo_list_collections(conn_id, database) -> Vec<MongoCollectionInfo>`
- [x] `cmd_mongo_get_collection_stats(conn_id, database, collection) -> MongoCollectionStats`
- [x] `cmd_mongo_create_collection(conn_id, database, collection)`
- [x] `cmd_mongo_drop_collection(conn_id, database, collection)`

### 21.2 前端
- [x] 新增 `DatabaseBrowser.tsx`
- [x] 左侧数据库列表，中间集合列表，右侧统计卡片
- [x] 点击集合自动设置 active database/collection 并跳转 `Documents`
- [x] 支持刷新、创建集合、删除集合二次确认

---

## Phase 22：文档浏览与 CRUD

### 22.1 Rust 后端
- [x] `cmd_mongo_find_documents(conn_id, database, collection, filter_json, projection_json?, sort_json?, skip, limit)`
- [x] `cmd_mongo_count_documents(conn_id, database, collection, filter_json)`
- [x] `cmd_mongo_insert_document(conn_id, database, collection, document_json)`
- [x] `cmd_mongo_update_document(conn_id, database, collection, id_json, document_json)`
- [x] `cmd_mongo_delete_documents(conn_id, database, collection, filter_json)`
- [x] 返回 Extended JSON 字符串，避免 MongoDB 特殊类型丢失

### 22.2 前端
- [x] 新增 `DocumentBrowser.tsx`
- [x] 顶部 filter/projection/sort JSON 输入区，默认 limit=50 分页
- [x] 文档列表支持 JSON 预览、复制、编辑、删除、批量删除
- [x] 新增/编辑文档使用 JSON 编辑器，保存前格式化与校验
- [x] `_id` 默认只读，更新时不允许修改 `_id`

---

## Phase 23：查询与聚合控制台

### 23.1 Rust 后端
- [x] `cmd_mongo_run_find_query`
- [x] `cmd_mongo_run_aggregate`
- [x] `cmd_mongo_run_database_command`
- [x] `cmd_mongo_list_query_history`
- [x] 新增 `mongodb_query_history` 表
- [x] 危险命令识别：drop/dropDatabase/deleteMany({})/updateMany({})/shutdown 等需要前端二次确认

### 23.2 前端
- [x] 新增 `QueryWorkspace.tsx`
- [x] 查询类型：Find / Aggregate / Command
- [x] 结果支持表格视图与 JSON 视图
- [x] 历史记录抽屉支持一键重跑

---

## Phase 24：索引管理

- [x] `cmd_mongo_list_indexes(conn_id, database, collection)`
- [x] `cmd_mongo_create_index(conn_id, database, collection, keys_json, options_json)`
- [x] `cmd_mongo_drop_index(conn_id, database, collection, index_name)`
- [x] 新增 `IndexManager.tsx`：展示索引名、keys、unique、sparse、TTL、大小
- [x] 新建索引 Modal 支持 keys JSON、name、unique、sparse、expireAfterSeconds

---

## Phase 25：导入导出

- [x] `cmd_mongo_export_documents(conn_id, database, collection, filter_json, format)`
- [x] `cmd_mongo_import_documents(conn_id, database, collection, file_path, mode)`
- [x] 支持 JSON Array 与 JSON Lines
- [x] 导入模式：insertOnly / upsertById / replaceById
- [x] 新增 `ImportExport.tsx`：导出当前查询/集合，导入前预览前 20 条，展示导入结果

---

## Phase 26：Server 信息与发布

- [x] `cmd_mongo_get_server_status`
- [x] `cmd_mongo_get_build_info`（通过 `buildInfo` 集成到 Server Status）
- [x] 新增 `ServerStatus.tsx`：版本、连接数、内存、opcounters 状态
- [x] Server 页面必须支持窗口缩放后的上下/左右滚动
- [x] 版本升至 `0.4.0`
- [x] 新增 `docs/releases/v0.4.0.md`
- [x] README 增加 MongoDB 插件说明
- [x] 运行 `npm test`、`npm run build`、`cargo check`、`npm run tauri build -- --bundles nsis`

---


---

# 第五期：MySQL 数据库连接工具插件

> 目标：新增 `mysql-client` 插件，只实现 MySQL 数据库连接工具，提供连接管理、库表浏览、表数据 CRUD、SQL 查询、索引管理、导入导出和基础 Server 状态能力。

---

## 第五期技术选型增量

| 新增项 | 方案 | 说明 |
|--------|------|------|
| MySQL 客户端 | `mysql_async` | Tokio async，适合 Tauri 后端异步 command |
| 数据展示 | JSON 行模型 | 后端将 MySQL Row 转为前端可渲染 JSON，避免动态列类型绑定复杂化 |
| 本地存储 | SQLite + AES-GCM | 沿用现有连接配置与敏感字段加密策略 |

---

## Phase 27：MySQL 插件脚手架与连接管理

### 27.1 Rust 后端 - 数据结构与连接配置
- [x] `Cargo.toml` 增加 `mysql_async` 依赖
- [x] `db/init.rs` 增加 `mysql_connections` 表
- [x] 新增 `db/mysql_connection_repo.rs`：连接配置 CRUD，password 加密存储
- [x] 连接字段：host、port、username、password、default_database、charset、ssl_mode、connect_timeout

### 27.2 Rust 后端 - Pool 与 Commands
- [x] 新增 `plugins/mysql/{mod,types,client_pool,commands}.rs`
- [x] `client_pool.rs`：按 connection id 缓存 MySQL Pool
- [x] `cmd_mysql_test_connection(form) -> MysqlLatency`
- [x] `cmd_mysql_connect(id)` / `cmd_mysql_disconnect(id)`
- [x] `cmd_mysql_list/save/delete_connections`

### 27.3 前端 - 插件注册与连接页
- [x] 新增 `src/plugins/mysql-client/index.tsx` 并注册到 builtin plugins
- [x] 新增 `types.ts`、`store/mysql-connections.ts`
- [x] 新增 `MysqlConnectionList.tsx` 与 `MysqlConnectionForm.tsx`
- [x] 连接成功后自动跳转 `Databases`

---

## Phase 28：数据库与表浏览

- [x] `cmd_mysql_list_databases(conn_id)`：列出库并默认过滤系统库
- [x] `cmd_mysql_list_tables(conn_id, database)`：列出表/视图
- [x] `cmd_mysql_describe_table(conn_id, database, table)`：列信息、主键信息
- [x] `cmd_mysql_get_table_status(conn_id, database, table)`：表行数、引擎、大小等概要
- [x] 前端新增 `DatabaseBrowser.tsx`：数据库列表、表列表、表概要，点击表自动跳转 `Table Data`

---

## Phase 29：表数据浏览与 CRUD

- [x] `cmd_mysql_select_rows(conn_id, database, table, offset, limit)`：分页读取表数据
- [x] `cmd_mysql_insert_row(conn_id, database, table, row_json)`
- [x] `cmd_mysql_update_row(conn_id, database, table, pk_json, row_json)`
- [x] `cmd_mysql_delete_row(conn_id, database, table, pk_json)`
- [x] 无主键表只读浏览，不提供行级编辑/删除
- [x] 前端新增 `TableData.tsx`：分页表格、新增、编辑、删除

---

## Phase 30：SQL 查询工作区

- [x] `cmd_mysql_execute_sql(conn_id, database?, sql)`：执行 SELECT/SHOW/DESCRIBE/EXPLAIN/INSERT/UPDATE/DELETE
- [x] `cmd_mysql_list_query_history(conn_id?, limit?)`
- [x] 危险 SQL 识别：DROP/TRUNCATE/ALTER、DELETE/UPDATE 无 WHERE 前端二次确认
- [x] 前端新增 `SqlWorkspace.tsx`：SQL 编辑、表格/JSON 结果、历史记录重跑

---

## Phase 31：索引管理

- [x] `cmd_mysql_list_indexes(conn_id, database, table)`
- [x] `cmd_mysql_create_index(conn_id, database, table, index_name, columns, unique)`
- [x] `cmd_mysql_drop_index(conn_id, database, table, index_name)`
- [x] 前端新增 `IndexManager.tsx`

---

## Phase 32：导入导出

- [x] `cmd_mysql_export_rows(conn_id, database, table, format)`：导出 JSON/CSV 到应用数据目录
- [x] `cmd_mysql_pick_import_file` / `cmd_mysql_preview_import_file`
- [x] `cmd_mysql_import_rows(conn_id, database, table, file_path, mode)`：支持 insertOnly / replaceInto
- [x] 前端新增 `ImportExport.tsx`

---

## Phase 33：Server 信息与发布

- [x] `cmd_mysql_get_server_status(conn_id)`：版本、uptime、threads、connections、queries 等基础指标
- [x] 新增 `ServerStatus.tsx`，支持窗口缩放后的滚动
- [x] 版本升至 `0.5.0`
- [x] README 增加 MySQL 插件说明
- [x] 新增 `docs/releases/v0.5.0.md`
- [x] 运行 `npm test`、`cargo check`、`npm run build`、`npm run tauri build -- --bundles nsis`

---

# 第六期：端口/网络诊断工具插件

> 目标：新增 `network-tools` 插件，提供 Ping、TCP 端口检测、DNS 解析、Traceroute 与诊断历史能力，帮助快速排查连接、端口和域名解析问题。HTTP/API 调试后续作为独立 Postman 类工具迭代。

---

## 第六期技术选型增量

| 新增项 | 方案 | 说明 |
|--------|------|------|
| TCP 检测 | `tokio::net::TcpStream` | 原生 async 连接检测，支持超时控制，不依赖系统命令 |
| Ping / Traceroute | 系统命令封装 | Windows 使用 `ping` / `tracert`，macOS/Linux 使用 `ping` / `traceroute`，避免 ICMP 权限问题 |
| DNS 解析 | Rust 标准解析优先 | 首版覆盖 A/AAAA；如需 MX/TXT/CNAME 再引入专用 resolver |
| 历史记录 | SQLite + JSON 结果 | 保存工具类型、目标、参数、状态、耗时、摘要和完整结果，支持复跑 |

---

## Phase 34：Network 插件脚手架与历史存储

- [x] 新增 `network-tools` 前端插件入口、类型定义、Zustand store 与基础视图结构。
- [x] 插件页面分为 `Diagnostics` 与 `History` 两个 Tab。
- [x] 新增 Rust 后端模块 `src-tauri/src/plugins/network/{mod,types,commands}.rs`。
- [x] 在 `plugins/mod.rs` 与 `lib.rs` 注册 Network 模块和 Tauri commands。
- [x] 在 `db/init.rs` 新增 `network_diagnostic_history` 表。
- [x] 历史表字段包含：id、tool_type、target、params_json、status、duration_ms、summary、result_json、created_at。

## Phase 35：核心诊断命令

- [x] 实现 `cmd_network_tcp_check(host, port, timeout_ms)`：返回 connected、duration_ms、remote_addr、error。
- [x] 实现 `cmd_network_ping(target, count, timeout_ms)`：返回 transmitted、received、loss_percent、avg_ms、raw_output。
- [x] 实现 `cmd_network_dns_lookup(host, record_type, timeout_ms)`：首版支持 A/AAAA 解析，返回 addresses、duration_ms。
- [x] 实现 `cmd_network_traceroute(target, max_hops, timeout_ms)`：返回 hop 列表、duration_ms、raw_output。
- [x] 每次诊断完成后写入 `network_diagnostic_history`，失败结果也保留，便于复盘。

## Phase 36：诊断 UI 与历史复跑

- [x] `Diagnostics` 页面顶部提供工具类型选择：Ping、TCP、DNS、Traceroute。
- [x] 根据工具类型动态展示表单字段，并提供合理默认值：count=4、timeout=5000ms、max_hops=30。
- [x] 统一结果面板展示成功/失败状态、耗时、关键指标卡片与原始输出折叠区。
- [x] TCP 表单支持 host + port 输入；首版不做批量端口扫描和持续监控。
- [x] `History` 页面支持列表、详情、复制目标、一键复跑、删除单条、清空全部。
- [x] 错误展示覆盖非法目标、超时、DNS 解析失败、命令不可用、网络不可达等场景。

## Phase 37：文档、验证与发布准备

- [x] 版本升至 `0.6.0`，同步更新 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`。
- [x] 新增 `docs/releases/v0.6.0.md`，记录 Network 插件能力、限制与验证结果。
- [x] README 增加 Network 端口/网络诊断工具说明。
- [x] 运行 `npm test`，确保插件注册与既有测试通过。
- [x] 运行 `npm run build`，确保前端类型检查与构建通过。
- [x] 运行 `cd src-tauri && cargo check`，确保 Rust 后端编译通过。
- [x] 运行 `npm run tauri build -- --bundles nsis`，生成 Windows 安装包。

---

# 第七期：API 调试工具插件

> 目标：新增 `api-debugger` 插件，提供类似 Postman 的 HTTP/API 调试能力，覆盖请求构建、发送、响应查看、集合管理、环境变量、历史复跑和基础导入导出。

---

## 第七期技术选型增量

| 新增项 | 方案 | 说明 |
|--------|------|------|
| HTTP 客户端 | `reqwest` | Rust 后端统一发送请求，支持超时、重定向、Headers、Body 与响应元数据 |
| 请求存储 | SQLite + JSON 字段 | 保存集合、请求、环境变量、历史记录，复杂参数使用 JSON 存储 |
| 敏感字段处理 | AES-GCM + 脱敏展示 | 环境 secret、Auth Token 等敏感字段加密存储；历史记录默认脱敏 |
| 变量与模板 | 本地解析器 | 支持 `{{baseUrl}}`、`{{token}}` 等变量替换，发送前提供解析预览与缺失变量提示 |
| 请求体构建 | 前端编辑 + 后端归一化 | 前端负责表单化编辑，后端统一转换为 `reqwest` 请求，避免 UI 与协议细节耦合 |
| 响应展示 | 前端格式化 | JSON 自动 Pretty，其他内容提供 Raw/Preview 基础查看 |

---

## Phase 38：API Debugger 插件脚手架与数据模型

- [x] 新增 `api-debugger` 前端插件入口、类型定义、Zustand store 与基础视图。
- [x] 新增 Rust 后端模块 `src-tauri/src/plugins/api_debugger/{mod,types,commands}.rs`。
- [x] 在 `plugins/mod.rs` 与 `lib.rs` 注册 API Debugger 模块和 Tauri commands。
- [x] 新增 SQLite 表：`api_collections`、`api_folders`、`api_requests`、`api_environments`、`api_request_history`。
- [x] `api_requests` 保存 collection/folder 归属、method、url、params、headers、auth、body、pre_request、timeout、redirect、created_at、updated_at。
- [x] `api_environments` 保存变量 JSON，并区分普通变量与 secret 变量；secret value 使用 AES-GCM 加密。
- [x] `api_request_history` 保存请求快照、响应摘要、脱敏后的 headers/body 摘要、duration、created_at，并预留 history 保留数量上限。
- [x] 定义请求模型：method、url、params、headers、cookies、auth、body、timeout、redirect、environment_id。
- [x] 定义响应模型：status、status_text、duration_ms、size_bytes、headers、cookies、body、content_type、redirect_chain、error。
- [ ] 增加模型单元测试：变量替换、secret 脱敏、请求快照序列化兼容。

## Phase 39：HTTP 请求执行核心

- [x] 引入 `reqwest`，实现 `cmd_api_send_request(request)`。
- [x] 支持 GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS。
- [x] 支持 Query Params、Headers、Cookies、Basic/Bearer/API Key Auth。
- [x] 支持 Body：none、raw JSON/text/XML、binary file、form-urlencoded、multipart form-data。
- [x] 支持 timeout、redirect 开关、SSL 校验开关、User-Agent 默认值和基础 TLS 错误提示。
- [x] 实现 `{{variable}}` 环境变量替换，发送前返回解析后的 URL/headers/body 预览；缺失变量阻止发送并提示。
- [ ] 实现请求取消：前端 Send 后可 Cancel，后端通过请求 id 管理进行中的任务。
- [x] 限制响应体默认读取大小，超过阈值时保存截断提示。
- [x] 请求完成后写入 `api_request_history`，失败请求也保留。
- [x] 历史记录保存时脱敏 Authorization、Cookie、Set-Cookie、token/password/key/secret 类字段。
- [x] 网络错误区分 DNS、连接拒绝、超时、TLS、重定向过多、响应体解码失败，便于排查。

## Phase 40：请求构建与响应 UI

- [x] 实现 `RequestWorkspace`：method + URL 输入区、Send/Cancel、Save。
- [x] 实现 Params、Headers、Cookies、Auth、Body、Settings 分区表单。
- [x] Auth 支持 None、Basic、Bearer Token、API Key（header/query）首版类型。
- [x] Body 编辑支持 raw、JSON、XML、form-urlencoded、multipart、binary，并自动补齐常见 Content-Type。
- [x] 实现变量解析预览：展示当前环境、命中的变量、缺失变量、secret 脱敏结果。
- [x] 实现响应面板：Overview、Body、Headers、Cookies、Raw、Timing。
- [ ] JSON 响应自动格式化，格式化失败回退 Raw；Body 支持搜索、复制、保存到文件。
- [x] 显示状态码、耗时、响应大小、Content-Type。
- [ ] 支持多个请求 Tab，关闭未保存 Tab 前提示确认。
- [ ] 支持请求 Tab 的 dirty 状态、重复打开去重和快捷保存。
- [x] 支持从历史或集合打开请求后自动跳转 Workspace。
- [x] 对危险/敏感操作不做额外拦截，但在保存历史和复制分享时默认脱敏。

## Phase 41：集合、环境与历史

- [x] 实现 Collections 列表：集合、文件夹、请求 CRUD。
- [ ] 实现请求保存到集合、复制请求、移动请求、删除请求。
- [x] 实现 Environments 管理：变量 CRUD、当前环境切换、secret 字段加密存储、变量启用/禁用。
- [x] 实现 History 列表、详情、复跑、删除单条、清空全部。
- [ ] History 支持按 method、host、status、时间范围搜索过滤，并限制默认展示最近 200 条。
- [x] 支持导入/导出 DevNexus API Collection JSON。
- [x] 支持基础 cURL 导入：解析 method、url、headers、body。
- [ ] 支持导出脱敏副本：secret、Authorization、Cookie 默认替换为占位符。
- [x] 支持从历史保存为集合请求，避免调试成功后需要手动重建。
- [x] 首版不做完整 Postman Collection v2.1 兼容，仅预留后续扩展。

## Phase 42：文档、验证与发布准备

- [x] 版本升至 `0.7.0`，同步更新 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`。
- [x] 新增 `docs/releases/v0.7.0.md`。
- [x] README 增加 API Debugger 中英文说明。
- [x] README 明确 API Debugger 首版范围：支持 HTTP 调试、集合、环境、历史、cURL 导入；暂不承诺完整 Postman Collection/脚本生态兼容。
- [x] 补充安全说明：secret 加密、历史脱敏、导出脱敏、响应体大小限制。
- [ ] 新增或更新测试：插件注册、变量替换、脱敏、历史保存、cURL 导入、请求模型序列化。
- [x] 更新 `PLAN.md` 开发进度，按日期和具体时间点记录。
- [x] 运行 `npm test`。
- [x] 运行 `npm run build`。
- [x] 运行 `cd src-tauri && cargo check`。
- [x] 运行 `npm run tauri build -- --bundles nsis`。

---

# 第八期：统一 MQ 调试与管理工具

> 目标：新增统一 `mq-client` 插件，提供 RabbitMQ 与 Kafka 的日常管理和消息调试能力，覆盖连接管理、资源浏览、消息发送、临时消费/预览、基础统计与历史复跑。

---

## 第八期技术选型增量

| 新增项 | 方案 | 说明 |
|--------|------|------|
| RabbitMQ AMQP | `lapin` | 用于 AMQP 连接测试、消息发布、临时消费/预览 |
| RabbitMQ 管理接口 | RabbitMQ Management HTTP API | 用于队列、交换机、绑定、基础统计浏览；Management Plugin 不可用时给出明确提示 |
| Kafka 客户端 | `rdkafka` | 用于 Kafka metadata、produce、consume 与 consumer group/offset 只读查看 |
| MQ 数据存储 | SQLite + JSON 字段 | 保存连接配置、消息历史、发送/消费快照和错误摘要 |
| 敏感字段处理 | AES-GCM + 历史脱敏 | 连接密码、Management 密码、SASL 密码加密存储；历史记录默认脱敏 |
| 消息体处理 | UTF-8 文本 + JSON 预览 + Base64 兜底 | 文本/JSON 直接展示，二进制消息以 Base64 保存和复制，避免历史记录损坏 |
| 操作安全 | 只读优先 + 显式确认 | 首版浏览与调试为主，删除/purge/offset commit 等破坏性操作不进入默认范围 |

---

## Phase 43：MQ 插件脚手架与连接模型

- [x] 新增 `mq-client` 前端插件入口、类型定义、Zustand store 与基础布局。
- [x] 新增 Rust 后端模块 `src-tauri/src/plugins/mq/{mod,types,commands,rabbitmq,kafka}.rs`。
- [x] 在 `plugins/mod.rs` 与 `lib.rs` 注册 MQ 模块和 Tauri commands。
- [x] 新增 SQLite 表：`mq_connections`、`mq_message_history`、`mq_saved_messages`。
- [x] 定义统一连接模型：broker_type、name、group_name、hosts、username/password、connect_timeout、created_at、updated_at。
- [x] RabbitMQ 连接字段覆盖 AMQP 地址、vhost、Management API 地址与 Management 账号密码。
- [x] Kafka 连接字段覆盖 bootstrap servers、client id、security protocol、SASL/PLAIN 账号密码，并预留 TLS 字段。
- [x] 连接配置支持分组、复制、编辑、删除、测试连接，并对密码字段做 AES-GCM 加密。
- [x] 后端连接测试返回结构化诊断：连接阶段、认证阶段、权限/Management API 阶段、错误摘要。
- [x] 连接成功后根据 broker type 自动进入 RabbitMQ 或 Kafka 浏览页。
- [x] 增加基础模型测试：连接配置脱敏、消息体编码、历史快照序列化兼容。

## Phase 44：RabbitMQ 日常管理与调试

- [x] 实现 RabbitMQ AMQP 连接测试。
- [x] 实现 RabbitMQ Management API 可用性测试；不可用时保留已知队列的发送/消费能力并提示浏览受限。
- [x] 实现 Queue 列表、详情、消息数、消费者数、ready/unacked、durable、exclusive、auto-delete 和状态展示。
- [x] 实现 Exchange 列表、类型、durable、auto-delete 展示。
- [x] 实现 Binding 列表，并支持按 queue/exchange 过滤。
- [x] 实现消息发布：支持 exchange/routing key 或直接队列、properties、headers、content type、delivery mode、raw text/JSON/binary body。
- [x] 实现临时消费/预览：支持 queue、limit、timeout、ack 模式、prefetch 限制。
- [x] 默认消费预览使用 `nack requeue=true`，只有用户显式选择 ack 时才确认消息。
- [x] 消费预览默认限制最大条数和总等待时间，避免长时间占用队列消费者。
- [x] 不在首版提供 queue purge/delete、exchange delete 等破坏性管理操作；后续需要二次确认机制再加入。
- [x] RabbitMQ 发送、消费预览和错误写入 `mq_message_history`，保存脱敏快照。

## Phase 45：Kafka 日常管理与调试

- [x] 实现 Kafka 连接测试并读取 cluster metadata。
- [x] 展示 broker、controller、topic 数等基础信息。
- [x] 实现 Topic 列表、partition 数、replication factor、cleanup policy、retention 基础配置展示。
- [x] 实现 Topic 详情：partition metadata、leader、replicas、ISR。
- [x] 实现 Consumer Group 列表与 group offsets 只读查看。
- [x] 实现消息发送：支持 topic、key、headers、partition、timestamp、raw text/JSON/binary body。
- [x] 实现临时消费/预览：支持 earliest/latest/specific offset、partition 过滤、limit、timeout。
- [x] 默认消费预览不提交 offset，禁用 auto commit。
- [x] Kafka 首版不创建/删除 topic，不提交 consumer group offset，不修改 broker/topic 配置。
- [x] 消费预览必须使用临时 group id 或 assign 模式，避免影响真实业务 consumer group。
- [x] 消息 key/value/header 按 UTF-8 尝试解析，失败时用 Base64 展示并保留原始大小。
- [x] Kafka 发送、消费预览和错误写入 `mq_message_history`，保存 topic、partition、offset、key、headers、消息大小和错误摘要。

## Phase 46：统一 UI 与历史复跑

- [x] 实现 MQ 插件统一导航：Connections、Browser、Message Studio、History。
- [x] Browser 左侧资源树根据 broker type 动态显示 RabbitMQ Queues/Exchanges/Bindings 或 Kafka Topics/Consumer Groups/Brokers。
- [x] Message Studio 根据 broker type 动态切换 RabbitMQ/Kafka 发送与消费表单。
- [x] Message Studio 支持保存常用消息模板到 `mq_saved_messages`，并可从模板快速填充 publish/produce 表单。
- [x] 实现统一结果面板：状态、耗时、消息大小、headers/properties、body、错误详情。
- [x] 结果面板支持 JSON pretty、raw、Base64、复制、保存到文件。
- [x] 实现 History 列表、详情、复跑、删除单条、清空全部。
- [x] History 支持按 broker type、连接、topic/queue、操作类型、状态和时间范围筛选。
- [x] RabbitMQ publish 历史和 Kafka produce 历史可复跑；消费预览历史只复用查询条件。
- [x] 历史记录、复制分享和导出默认脱敏 password、Authorization、SASL password、Management password 等敏感字段。
- [x] UI 对 RabbitMQ ack 与 Kafka offset 明确展示“不影响业务消费进度”的默认语义。

## Phase 47：文档、验证与发布准备

- [x] 版本升至 `0.8.0`，同步更新 `package.json`、`package-lock.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`。
- [x] 新增 `docs/releases/v0.8.0.md`。
- [x] README 增加 MQ 工具中英文说明。
- [x] README 明确 RabbitMQ 浏览依赖 Management Plugin，Kafka 首版支持 PLAINTEXT 与 SASL/PLAIN，TLS 字段预留但不承诺完整证书链管理。
- [x] README 明确首版安全边界：不做 queue purge/delete、topic 创建/删除、offset commit 或 broker 配置修改。
- [x] 新增或更新测试：插件注册、连接配置脱敏、消息体编码、历史快照、RabbitMQ/Kafka 表单状态切换。
- [x] 更新 `PLAN.md` 开发进度，按日期和具体时间点记录。
- [x] 运行 `npm test`。
- [x] 运行 `npm run build`。
- [x] 运行 `cd src-tauri && cargo check`。
- [x] 运行 `npm run tauri build -- --bundles nsis`。

---

# 第九期：LAN Chat 局域网聊天插件

> 目标：新增 `lan-chat` 插件，在 DevNexus 内提供局域网即时聊天能力。首版采用“局域网发现 + 群聊房主协调 + 私聊 P2P”的模型，支持群聊、在线私聊、文本、图片、文件传输、本机历史和群房主下线后的基础自动接管。

---

## 第九期技术选型增量

| 新增项 | 方案 | 说明 |
|--------|------|------|
| 局域网发现 | UDP Multicast + 手动地址加入 | 自动发现同网段 DevNexus 设备与房间；发现失败时允许手动输入 IP/端口加入 |
| 消息传输 | Tokio TCP + length-prefixed JSON frame | 后端维护设备连接、房间连接与点对点私聊连接，消息结构清晰且便于后续扩展 |
| 文件传输 | Tokio TCP chunk stream + SHA-256 校验 | 图片/文件分块传输，记录进度、大小、校验和与接收状态 |
| 群聊协调 | Room Coordinator + heartbeat lease | 谁创建群谁协调该群；房主下线后在线成员按稳定规则基础自动接管 |
| 私聊 | Direct P2P | 私聊文本、图片、文件直接点对点发送，不经过群房主 |
| 历史存储 | SQLite + 本地文件缓存 | 保存本机消息历史、房间元数据、成员快照、文件记录和传输任务 |
| 安全边界 | 局域网信任 + 设备确认 | 首版不做公网穿透和账号体系；加入房间、接收文件需要明确 UI 提示与基础确认 |

---

## Phase 48：LAN Chat 前端模块、底部入口、设备身份与发现

- [x] 新增 `lan-chat` 前端模块、类型定义、Zustand store 与基础布局；不注册为普通左侧 Sidebar 插件。
- [x] 在 `Sidebar` 左下角主题切换旁新增 Chat Launcher，展开/收起状态下都保持可识别。
- [x] 新增 `LanChatWindowHost` 并挂载到 `AppShell`，负责全局悬浮聊天小窗渲染，不切换当前主工具页面。
- [x] 悬浮窗状态持久化：open/minimized、position、size、active_conversation_id、unread_count。
- [x] 新增 Rust 后端模块 `src-tauri/src/plugins/lan_chat/{mod,types,commands,discovery,transport,room,direct,file_transfer}.rs`。
- [x] 在 `plugins/mod.rs` 与 `lib.rs` 注册 LAN Chat 模块和 Tauri commands。
- [x] 新增 SQLite 表：`lan_chat_devices`、`lan_chat_rooms`、`lan_chat_room_members`、`lan_chat_messages`、`lan_chat_transfers`。
- [x] 生成并持久化本机 `device_id`、设备昵称、监听端口、下载目录和局域网可见状态。
- [x] 实现发现快照、设备列表和手动 P2P 设备加入基础；UDP multicast 自动发现作为后续增强继续迭代。
- [x] 实现基础连接健康字段：online/offline、last_seen、client_version。
- [x] 增加发现与设备身份测试，避免重复设备、无效地址和旧心跳污染在线列表。

## Phase 49：群聊房间、房主协调与自动接管

- [x] 实现创建群聊房间：创建者成为该房间 coordinator，房间拥有独立 `room_id` 和成员列表。
- [x] 实现加入/退出房间、成员列表同步、房主标识、成员在线状态广播的本地持久化基础。
- [x] 实现群聊文本消息：房主负责群消息排序、序号分配和广播的本地模型。
- [x] 实现群聊图片/文件元信息记录：文件内容优先成员间直传，小文件可按配置允许房主中转的模型预留。
- [x] 实现房主 heartbeat lease 状态字段与 `re-electing` 降级状态规划。
- [x] 实现基础自动接管规则工具：在线成员按稳定规则（优先本机、device_id 排序）选出新 coordinator。
- [x] 实现 `room_takeover` 广播和成员切换的数据模型预留；迁移期间暂停发送新群消息，避免明显乱序。
- [x] 明确首版限制：不做强一致复制、不保证房主掉线瞬间最后消息完整同步、不做网络分区自动合并。

## Phase 50：在线私聊、图片与文件点对点传输

- [x] 实现在线私聊会话：从发现设备或手动添加设备发起，按 P2P 会话模型保存。
- [x] 私聊文本、图片、文件不经过群房主，双方各自写入本机历史。
- [x] 实现图片发送、接收、缩略预览、原图打开和保存到本地缓存的数据模型预留。
- [x] 实现文件发送与接收确认：文件名、大小、MIME、SHA-256、保存路径、传输状态。
- [x] 实现分块传输进度、取消、失败重试和接收方拒绝的传输状态机基础。
- [x] 对危险文件类型给出打开前提示，不自动执行下载文件。
- [x] 对离线私聊发送给出明确失败/待重试状态；首版不做长期离线消息投递。

## Phase 51：悬浮聊天 UI、历史、传输中心与设置

- [x] 实现 LAN Chat 悬浮窗口 UI：Rooms、Direct Messages、Chat Workspace、Members、Transfers。
- [x] 悬浮窗支持拖拽移动、调整大小、最小化/恢复、关闭、一键放大为大尺寸聊天面板。
- [x] 关闭或最小化后后台继续接收消息，并通过底部 Chat Launcher 显示未读角标。
- [x] 打开聊天小窗不改变 `selectedPluginId`，不影响当前 Redis/SSH/S3/MQ 等主工具页面状态。
- [x] 实现创建房间、加入房间、复制邀请地址、成员列表、房主/临时房主标识。
- [x] 实现聊天消息流：文本、图片、文件卡片、系统事件、发送中/失败/已接收状态。
- [x] 实现输入区：文本输入、粘贴图片、拖拽文件、选择文件、发送快捷键。
- [x] 实现本机历史浏览：按房间/私聊会话加载，分页读取，避免一次性加载大量消息。
- [x] 实现传输中心：上传/下载任务、进度、速度、取消、重试、打开文件位置。
- [x] 实现设置页：设备昵称、监听端口、下载目录、是否允许自动发现、是否允许小文件房主中转。
- [x] UI 明确展示首版边界：局域网内使用、无长期离线消息、房主下线会触发基础接管。

## Phase 52：文档、验证与发布准备

- [x] 版本升至 `0.9.0`，同步更新 `package.json`、`package-lock.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`。
- [x] 新增 `docs/releases/v0.9.0.md`。
- [x] README 增加 LAN Chat 中英文说明：通信模型、群聊房主、私聊 P2P、文件传输、自动接管和首版限制。
- [x] 更新 `PLAN.md` 开发进度，按日期和具体时间点记录。
- [x] 增加测试：左侧插件列表不包含 LAN Chat、Chat Launcher 不切换主工具、悬浮窗状态持久化、未读角标、设备发现去重、房主选举规则、消息序列化、文件传输状态机、历史分页。
- [x] 运行 `npm test`。
- [x] 运行 `npm run build`。
- [x] 运行 `cd src-tauri && cargo check`。
- [x] 运行 `npm run tauri build -- --bundles nsis`。

---

# 第十期：Confluence Publisher 插件

> 目标：新增 `confluence` 插件，支持本地 Markdown 文件编辑、实时转换为 Confluence Storage Format 并一键发布到 Confluence Server / Data Center。

---

## 第十期技术选型增量

| 新增项 | 方案 | 说明 |
|--------|------|------|
| Markdown 解析 | `unified` + `remark-parse` + `remark-gfm` | 前端纯函数 AST 解析，无网络依赖，支持 GFM 扩展（表格/任务列表） |
| 编辑器 | `@monaco-editor/react` | VS Code 同款编辑器，语法高亮、Markdown 自动补全 |
| LaTeX 渲染 | `katex` | 公式渲染为 SVG，转 base64 图片上传到 Confluence |
| 图表渲染 | `mermaid` | Mermaid 图表渲染为 SVG，转 base64 图片上传 |
| HTML 输出 | `hast-util-to-html` | HAST → HTML 字符串，用于预览 |
| Confluence API | `reqwest` (Rust) | 通过 REST v1 调用 Confluence Server/Data Center |
| 认证 | Basic Auth + PAT Bearer | 普通账号使用 Basic，SSO/Personal Access Token 使用 `Authorization: Bearer <token>` |
| 凭据存储 | SQLite + AES-256-GCM | 站点 URL、用户名、密码加密存储，与现有插件保持一致 |
| 文件关联 | localStorage | 本地 .md 文件路径 → Confluence 页面 ID 映射 |

---

## 第十期目录结构增量

```
src/plugins/confluence/
├── index.tsx                       # 插件入口（注册 manifest）
├── types.ts                        # TypeScript 类型定义
├── store/
│   └── confluence.ts               # Zustand store（连接、编辑器状态、文件映射）
├── utils/
│   ├── converter.ts                # unified 转换管线（MD → Storage Format）
│   └── file-mapping.ts             # localStorage 文件→页面映射
├── components/
│   ├── ConfluenceEditor.tsx        # 主布局（Monaco + 预览分屏）
│   ├── ConnectionSettings.tsx      # 连接配置抽屉
│   └── PublishDialog.tsx           # 发布弹窗（Space/Page 选择）

src-tauri/src/plugins/confluence/
├── mod.rs
├── commands.rs                     # Tauri commands 暴露层
├── client.rs                       # Confluence REST v1 HTTP 客户端
└── types.rs                        # Serde 数据结构 + 连接配置
```

---

## Phase 53：Confluence 插件脚手架与连接管理

### 53.1 SQLite 扩展
- [x] `db/init.rs` 新增建表 `confluence_connections`：
  - 字段：`id`（UUID）、`label`、`base_url`、`username`、`password_encrypted`（AES-256-GCM）、`created_at`、`updated_at`

### 53.2 Rust 后端 - 连接配置 CRUD
- [x] 新增 `db/confluence_connection_repo.rs`：实现 `list/save/delete/get` 操作，password 字段加密存储
- [x] `commands.rs` 暴露：
  - [x] `cmd_confluence_list_connections() -> Vec<ConfluenceConnectionInfo>`
  - [x] `cmd_confluence_save_connection(form) -> Result<String>`（返回 id）
  - [x] `cmd_confluence_delete_connection(id) -> Result<()>`
  - [x] `cmd_confluence_test_connection(form) -> Result<u64>`：调用 `GET /rest/api/space` 验证，返回耗时毫秒

### 53.3 Rust 后端 - HTTP 客户端
- [x] `client.rs`：封装 `reqwest` HTTP 客户端，支持 Basic Auth 与 Personal Access Token Bearer
- [x] 从加密存储读取凭据，按认证方式构建 `Authorization: Basic base64(user:pass)` 或 `Authorization: Bearer <token>` 请求头
- [x] 统一错误处理：网络错误、401 认证失败、超时、JSON 解析失败

### 53.4 前端 - 插件注册与连接页
- [x] 新增 `src/plugins/confluence/index.tsx` 并注册到 builtin plugins（`sidebarOrder: 9`）
- [x] 新增 `types.ts`、`store/confluence.ts`
- [x] 新增 `ConnectionSettings.tsx`：抽屉表单，字段 Site URL、用户名、密码/Token，测试连接按钮，保存（AES 加密）
- [x] 连接状态管理：Zustand store 存储连接列表、当前活跃连接

---

## Phase 54：Markdown → Confluence Storage Format 转换

### 54.1 转换管线
- [x] `utils/converter.ts`：使用 `unified` + `remark-parse` + `remark-gfm` 解析 Markdown
- [x] 实现 AST 节点 → Confluence Storage Format XML 的自定义编译器

### 54.2 元素映射表
- [x] 标题（h1-h6）→ `<h1>...</h1>`
- [x] 粗体/斜体 → `<strong>` / `<em>`
- [x] 行内代码 → `<code>`
- [x] 围栏代码块 → `<ac:structured-macro ac:name="code">` + CDATA
- [x] 链接 → `<a href="...">`
- [x] 图片 → `<ac:image><ri:url ri:value="..."/></ac:image>`
- [x] 表格 → `<table><tbody><tr><td>...</td></tr></tbody></table>`
- [x] 任务列表 `- [x]` → Confluence 任务列表标签
- [x] 引用块 → `<blockquote>`
- [x] 分割线 → `<hr />`
- [x] 有序/无序列表 → `<ol>` / `<ul>` + `<li>`

### 54.3 高级元素
- [x] 脚注 `[^1]` → Confluence 脚注宏
- [x] TOC `[TOC]` → 自动生成目录结构

---

## Phase 55：Monaco 编辑器 + 预览 UI

### 55.1 主布局
- [x] `ConfluenceEditor.tsx`：左右分屏布局（Monaco 编辑器 50% + Confluence 预览 50%）
- [x] 工具栏：打开文件、保存、连接设置入口、发布按钮
- [x] 状态栏：当前文件路径 + 已关联 Confluence 页面信息

### 55.2 Monaco 编辑器
- [x] 集成 `@monaco-editor/react`，Markdown 语法高亮
- [x] 支持打开本地 `.md` 文件（调用 Tauri dialog + fs API）
- [x] 支持保存修改到原文件
- [x] 编辑内容变更时自动触发转换，右侧实时预览

### 55.3 Confluence 预览
- [x] 将转换后的 Storage Format XML 渲染为 HTML 预览
- [x] 预览区域显示 Confluence 风格样式
- [x] 转换失败时在预览区显示错误信息，不崩溃

---

## Phase 56：Confluence API 集成

### 56.1 Rust 后端 - API 命令
- [x] `cmd_confluence_list_spaces(conn_id) -> Vec<SpaceInfo>`：`GET /rest/api/space?limit=200`
- [x] `cmd_confluence_list_pages(conn_id, space_key, parent_id?) -> Vec<PageInfo>`：`GET /rest/api/content/{id}/child/page`
- [x] `cmd_confluence_create_page(conn_id, space_key, title, content_xml, parent_id?) -> Result<PageInfo>`：`POST /rest/api/content`
- [x] `cmd_confluence_update_page(conn_id, page_id, title, content_xml, version) -> Result<PageInfo>`：`PUT /rest/api/content/{id}`
- [x] `cmd_confluence_upload_attachment(conn_id, page_id, file_path, content_type) -> Result<AttachmentInfo>`：`POST /rest/api/content/{id}/child/attachment`

### 56.2 前端 - 发布弹窗
- [x] `PublishDialog.tsx`：Modal 弹窗
- [x] Space 下拉选择器（从 API 获取列表，支持搜索过滤）
- [x] 父页面树形选择器（可选，默认为 Space 根）
- [x] 页面标题输入（默认取文件名或 Markdown 第一个 H1）
- [x] 模式识别：新建页面 / 更新已有页面（通过 file-mapping 判断）
- [x] 发布/更新按钮，显示进度和结果

### 56.3 发布流程
- [x] 发布前验证：连接已配置、标题非空、Content 有效
- [x] 发布时先上传附件（LaTeX/Mermaid 渲染图、本地图片引用），再提交页面内容
- [x] 成功后更新 localStorage 文件映射，状态栏显示关联信息
- [x] 失败时展示具体错误（401 认证失败、404 Space 不存在、网络超时等）

---

## Phase 57：文件管理与页面映射

### 57.1 文件操作
- [x] 打开 `.md` 文件：调用 Tauri 文件选择对话框，读取内容加载到 Monaco
- [x] 保存到原文件：调用 Tauri fs API 写入
- [x] 文件路径在标题栏/状态栏显示

### 57.2 页面映射
- [x] `utils/file-mapping.ts`：localStorage 存储 `Map<filePath, { spaceKey, pageId, pageTitle, version, lastPublished }>`
- [x] 打开已关联文件时自动识别，发布按钮变为「更新页面」
- [x] 映射列表管理：支持查看/删除已有映射

---

## Phase 58：附件处理

### 58.1 LaTeX / Mermaid 渲染上传
- [x] 前端用 `katex` 将 LaTeX 公式渲染为 SVG → base64
- [x] 前端用 `mermaid` 将图表渲染为 SVG → base64
- [x] 发布时先调用 `cmd_confluence_upload_attachment` 上传图片
- [x] 替换 Storage Format XML 中的占位符为 `<ac:image>` 引用

### 58.2 本地图片处理
- [x] 解析 Markdown 中 `![alt](./local.png)` 引用
- [x] 读取本地文件，作为附件上传到 Confluence 页面
- [x] 替换路径为 Confluence 附件 URI

---

## Phase 59：文档、验证与发布准备

- [x] 版本升至 `0.10.0`，同步更新 `package.json`、`package-lock.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`。
- [x] 新增 `docs/releases/v0.10.0.md`。
- [x] README 增加 Confluence Publisher 中英文说明。
- [x] README 明确首版范围：Confluence Server/Data Center 支持，Markdown 基础+高级元素覆盖，本地文件编辑与发布。
- [x] 新增或更新测试：插件注册、转换管线（元素映射矩阵）、连接配置加密/解密、API 请求构造、文件映射持久化。
- [x] 更新 `PLAN.md` 开发进度，按日期和具体时间点记录。
- [x] 运行 `npm test`。
- [x] 运行 `npm run build`。
- [x] 运行 `cd src-tauri && cargo check`。
- [ ] 运行 `npm run tauri build -- --bundles nsis`。

---

## 第十期风险与应对

| 风险 | 概率 | 应对 |
|------|------|------|
| Confluence Storage Format 复杂元素转换不完整 | 中 | 按元素优先级分批次覆盖，先保证基础元素 100%，高级元素逐步迭代 |
| LaTeX/Mermaid 渲染为图片后体积过大 | 中 | 限制图片尺寸，压缩 base64，超过阈值的图片提示用户手动处理 |
| Monaco Editor 打包体积大（~5MB） | 低 | Tauri 桌面环境下首次加载后浏览器缓存，不重复下载；后续可考虑 CodeMirror 备选 |
| Confluence Server 版本差异导致 API 不兼容 | 中 | 测试连接时获取 Confluence 版本，对已知差异做适配；首版目标 Confluence 7.x+ |
| Confluence 凭据安全风险 | 低 | Basic 密码/API Token 与 PAT 均经 AES-256-GCM 加密存 SQLite，密钥不离开本机，与 SSH/Redis 等插件安全级别一致 |
| 大文档转换性能 | 低 | 前端 Web Worker 异步转换，不阻塞 UI；超过 50KB 的文档显示转换进度 |

---

## 开发进度（实时）

### 2026-04-27

- 14:07-14:08 使用 `create-tauri-app` 初始化 React + TypeScript + Tauri 2 项目模板。
- 14:08-14:27 完成 Phase 0 脚手架改造：目录结构、别名、依赖、窗口配置、基础页面替换。
- 14:29-14:34 完成插件注册表 TDD：先新增测试失败，再实现 `registry.ts` 使测试通过。
- 14:35-15:35 完成 Phase 0 前端骨架（`Titlebar`、`AppShell`、`Sidebar`、主题与插件注册）。
- 15:35-15:36 完成验证：`npm test` 通过，`npm run build` 通过（存在 bundle 体积告警，后续可分包优化）。
- 15:36-16:26 完成 Phase 1 连接管理闭环：SQLite CRUD、AES-GCM 密码加密、Redis 连接测试/连接池、前端连接列表与表单调用链路打通。
- 16:26-16:27 完成验证：`npm test` 通过，`npm run build` 通过（仍有 bundle 体积告警）。
- 17:57-18:06 修复 Phase 2 合并后的前后端编译问题：修复 `KeyBrowser.tsx` 类型错误、`db/init.rs` 的 `tauri::Manager` 导入缺失，恢复 `npm run build` 与 `cargo check` 可通过。
- 18:06-18:16 完成 Phase 2 核心交互：补齐 Key 详情区 5 类数据编辑器的真实命令调用链路（String/Hash/List/Set/ZSet），增加 ZSet 分数区间筛选后端命令并接入前端。
- 18:16-18:21 完成 KeyTree 升级：接入 `@tanstack/react-virtual` 虚拟渲染、分组展示、TTL 角标与批量操作联动（多选/批量删/批量 TTL）。
- 18:21-18:24 完成 Phase 3/4/5 增量：命令历史查询接口、危险命令二次确认执行、导入预览命令；前端补 xterm 控制台、命令补全与历史回放；ServerInfo 增加真实趋势序列与 DB 柱状图。
- 18:24-18:25 完成最终验证：`npm test` 通过，`npm run build` 通过，`cargo check` 通过（仅剩 `RedisConnectionType` 未使用告警）。

### 2026-04-28

- 10:00-10:16 开始第二期 SSH 插件开发（Phase 7 主线）：完成 `ssh-client` 插件注册与目录脚手架，新增连接列表页、连接表单、终端工作区/密钥/SFTP/隧道占位视图。
- 10:00-10:16 完成 Rust 后端 SSH 基础：`db/init.rs` 增加 `ssh_connections`/`ssh_keys`/`ssh_quick_commands`/`port_forward_rules` 建表；新增 `db/ssh_connection_repo.rs`，实现 SSH 连接 CRUD 与认证字段加密存储。
- 10:00-10:16 完成 SSH Command 与会话池基础：新增 `src-tauri/src/plugins/ssh/{mod,commands,session_pool,types}.rs`，并在 `lib.rs` 注册 `cmd_ssh_list/save/delete/test/connect/disconnect`。
- 10:12-10:16 完成验证：`cargo check` 通过（引入 russh 依赖后编译成功，存在 session_pool 未使用告警），`npm run build` 通过，`npm test` 通过。
- 10:20-11:22 完成 SSH 二期主线可运行闭环：后端新增 `terminal.rs`/`sftp.rs`/`key_store.rs`/`tunnel.rs` 并扩展 `commands.rs`，补齐终端事件推送、SFTP 文件操作与进度事件、密钥 CRUD/生成、隧道规则 CRUD 与启停。
- 10:20-11:22 完成前端 SSH 页面实装：`TerminalWorkspace` + `TerminalTab` 接入 xterm 与 Tauri 事件；`QuickCommandPanel` 接入快捷命令持久化；`SftpExplorer` 接入目录浏览/上传下载与传输队列；`KeyManager`/`KeyImportForm`、`TunnelManager`/`TunnelRuleForm` 接入后端命令。
- 11:20-11:22 完成验证：`cargo check` 通过，`npm run build` 通过，`npm test` 通过（仅保留原有 `RedisConnectionType` 未使用告警）。
- 11:22-13:44 完成打包与多轮修复：输出 Windows 安装包并按反馈修复连接页双击连接/跳转、DB 切换位置与 UI 布局、SSH 密钥文件权限处理与隐藏控制台窗口。
- 13:44-14:30 修复跳板机终端可用性与显示问题：修复 `openSession` 输出初始化时序，避免欢迎信息被清空；`TerminalTab` 改为增量写入，避免全量重绘造成交互异常；统一终端容器高度链路，消除下半白屏并铺满可用空间。
- 14:17-14:30 按当前产品决策下线 SFTP：前后端入口、命令导出、模块与类型定义全部移除。
- 15:16-15:19 完成最终验证与打包：`cargo check` 通过、`npm run build` 通过、`npm test` 通过，并生成当时版本 NSIS 安装包（品牌重命名前的旧产物名）。
- 15:25-15:32 完成品牌图标升级：新增抽象几何科技风 SVG 母版 `src-tauri/icons/app-icon.svg`，使用 `tauri icon` 生成并覆盖全套平台图标（`icon.ico`/`icon.icns`/PNG/Appx/iOS/Android 资产），用于应用窗口与安装包统一视觉。
- 16:25-16:38 执行清理后重打包：清理 `dist` 与 `src-tauri/target` 旧产物（含 installer/exe 输出），基于新图标资源重新执行 `npm run tauri build -- --bundles nsis`，生成全新安装包并确认时间戳更新（16:37）。
- 16:50-16:59 修复 Windows 无边框窗口交互：标题栏拖拽改为显式 `startDragging()`，新增窗口四边与四角 resize 命中层并调用 `startResizeDragging()`，同时补充 capability 权限 `allow-start-dragging/allow-start-resize-dragging`，恢复窗口移动与放大缩小能力。
- 17:24-17:26 修复标题栏双击行为：在拖拽区增加 `onDoubleClick -> toggleMaximize()`，并在 `onMouseDown` 中跳过双击场景（`event.detail > 1`），避免拖拽与双击全屏/还原冲突。
- 19:20-19:54 启动第三期 Phase 13：完成 S3 插件连接管理闭环。后端新增 `s3_connections` 表、`db/s3_connection_repo.rs`、`plugins/s3/{mod,types,client_pool,commands}.rs`，并在 `lib.rs` 注册 `cmd_s3_list/save/delete/test/connect/disconnect`；前端新增 `s3-client` 插件（`index.tsx`、`types.ts`、`store/s3-connections.ts`、`views/S3ConnectionList.tsx`、`components/S3ConnectionForm.tsx`）并接入插件注册表。已完成验证：`cargo check`、`npm run build`、`npm test` 通过。
- 20:20-20:37 继续第三期 Phase 14 起步：后端新增 `cmd_s3_list_buckets(conn_id)`（连接后列出 Bucket）；前端新增 `BucketList.tsx` 并在 `s3-client/index.tsx` 增加 Connections/Buckets 分段导航，连接后自动加载 Bucket 列表。验证通过：`cargo check`、`npm run build`、`npm test`。
- 20:50-21:13 推进 Phase 14：补齐 `cmd_s3_create_bucket`、`cmd_s3_delete_bucket` 并注册到 Tauri；前端 `BucketList.tsx` 增加新建 Bucket Modal 与删除确认操作，连接后可直接完成 Bucket 列表刷新、新建、删除闭环。验证通过：`cargo check`、`npm run build`、`npm test`。
- 21:40-22:06 推进 Phase 15 基础对象浏览：后端新增 `cmd_s3_list_objects`（prefix + delimiter + continuation token 分页），并补充 `cmd_s3_delete_object`、`cmd_s3_create_folder`；前端新增 `ObjectBrowser.tsx`，支持目录进入、前缀刷新、加载更多、文件删除、新建文件夹，形成“连接 -> Bucket -> 对象”基础闭环。验证通过：`cargo check`、`npm run build`、`npm test`。
- 22:06-22:21 输出第三期阶段性安装包：在完成 S3 Phase 13 + 14 + 15 基础能力后执行 `npm run tauri build -- --bundles nsis`，生成当时版本 NSIS 安装包（品牌重命名前的旧产物名，22:20）。
- 23:47-23:55 修复 S3 导航与分页链路：将 S3 workspace tab 提升到 Zustand（Connections/Buckets/Objects 共享），连接成功后自动跳转 Buckets、打开 Bucket 后自动跳转 Objects；Bucket 列表改为可控分页（支持翻页与每页条数切换）并在筛选变更时重置页码；打开 Bucket 时重置 prefix 并立即触发对象加载，修复 Objects 视图空白问题。验证通过：`cargo check`、`npm run build`、`npm test`。

### 2026-04-29

- 00:08-00:11 接入 macOS 自动打包 CI：新增 `.github/workflows/build-macos.yml`，支持 `workflow_dispatch`、`push main`、`v*` tag 触发；在 `macos-latest` 上执行 `npm ci` + `npm run tauri build -- --bundles app,dmg`，并上传 `.app` 与 `.dmg` 构建产物。
- 00:20-00:27 扩展 CI 为全平台打包：将 workflow 升级为 `build-desktop`，新增 Windows（NSIS `.exe`）、macOS（`.app`/`.dmg`）、Linux（`.deb`/`.AppImage`）三个并行 job，统一支持 `workflow_dispatch`、`push main`、`v*` tag 触发并上传对应 artifacts。
- 13:08-13:13 品牌重命名：项目名升级为 DevNexus（开发工具中枢）。已同步更新应用标题、Tauri productName/identifier（com.devnexus.desktop）、Rust crate 名（devnexus/devnexus_lib）、前端品牌文案、README 与跨平台 CI 产物命名。验证通过：`npm run build`、`cargo check`、`npm test`。
- 13:20-13:31 发版流程建设：新增 `.github/workflows/release.yml`，在 `v*` tag 触发时并行构建 Windows/macOS/Linux 包并自动上传到 GitHub Release；新增发布说明 `docs/releases/v0.1.0.md`；将 `build-desktop` 标签触发调整为仅 `workflow_dispatch` + `push main`，避免与 release 工作流重复构建。
- 16:00-16:05 Redis KeyBrowser 交互增强：实现 Key Tree 与 Key Detail 可拖拽分栏，支持中线拖动实时调整宽度，并添加最小宽度保护（左 300px / 右 420px）与分割条高亮反馈。同步新增发版文档 `docs/releases/v0.2.0.md`。

### 2026-05-07

- Redis 遗留任务补齐：KeyTree 改为按冒号分段的层级树展示，搜索输入增加 300ms 防抖 SCAN，key 行补齐右键菜单（复制、查看详情、设置 TTL、重命名、删除）；Console 顶部补齐连接/DB 切换，并优化 Array 缩进与 Error 红色输出。
- S3 第三期主链路补齐：扩展 S3 后端命令（Bucket region/versioning、对象版本/元数据、批量删除、复制/移动/重命名、上传/下载、预览、预签名 URL、Bucket Policy、对象标签、Bucket 统计），前端新增 ObjectList、ObjectMetaDrawer、ObjectPreview、PresignedUrlModal、BucketSettings，并将版本升至 `v0.3.0`，新增 `docs/releases/v0.3.0.md`。
- 修复 Redis Server 页面刷新闪跳：ServerInfo 改为按 section/card 局部更新，图表实例与滚动容器保持稳定，避免轮询刷新导致整页跳动。
- 修复 SSH 密码登录链路：密码直连 Terminal 改用原生会话通道，补齐连接测试与终端打开流程的密码认证兼容性。

### 2026-05-08

- 09:00-09:16 修复 Redis Server 页面缩放后不能滚动：Redis 工作区改为固定高度 flex，Server 页面增加独立纵向/横向滚动容器，避免窗口缩放后下方内容不可见。
- 09:30-09:40 完成第四期 MongoDB 插件详细规划写入 `PLAN.md`，新增 Phase 20-26 任务拆分。
- 09:40-10:05 完成 MongoDB 后端基础：新增 `mongodb_connections`/`mongodb_query_history` 表、连接配置加密 repo、MongoDB client pool、Tauri commands，并通过 `cargo check` 验证。
- 10:05-10:35 完成 MongoDB 前端主链路初版：新增 `mongodb-client` 插件、连接表单、数据库/集合浏览、文档 CRUD、查询/聚合、索引、导入导出和 Server 状态页面。
- 10:35-10:56 完成第四期发布配套与验证：版本升至 `0.4.0`，新增 `docs/releases/v0.4.0.md`，README 增加 MongoDB 插件说明；`cargo check`、`npm test`、`npm run build`、`npm run tauri build -- --bundles nsis` 均通过，生成 `DevNexus_0.4.0_x64-setup.exe`。
- 11:00-11:05 优化 MongoDB Connections 标签尺寸：状态、默认数据库、TLS、SRV 标签改为小号样式，仅作用于 MongoDB 连接卡片；`npm run build` 验证通过。
- 11:49-11:56 执行 v0.4.0 发布前验证与打包：`npm test`、`cargo check`、`npm run build`、`npm run tauri build -- --bundles nsis` 通过，重新生成 `DevNexus_0.4.0_x64-setup.exe`，准备提交并推送 `v0.4.0` tag 触发 GitHub Release。
- 12:00-12:05 启动第五期 MySQL 数据库连接工具插件开发：已将 Phase 27-33 详细计划写入 `PLAN.md`，开始按 MongoDB 插件模式实现 MySQL 后端与前端闭环。
- 12:05-12:14 完成 Phase 27 后端基础：新增 `mysql_connections` 表、`mysql_query_history` 表、连接配置加密 repo、MySQL 类型定义与 pool 骨架。
- 12:14-12:30 完成 Phase 27 命令闭环：接入 `mysql_async`，实现连接保存/删除/测试/连接/断开命令，并注册到 Tauri handler。
- 12:30-12:38 完成 Phase 27 前端连接管理：新增 `mysql-client` 插件入口、类型、store、连接列表和连接表单，连接成功后自动跳转数据库视图。
- 12:38-12:44 完成 Phase 28 数据库与表浏览：实现库列表、表列表、表结构、表状态后端命令，并新增 `DatabaseBrowser.tsx`。
- 12:44-12:48 完成 Phase 29 表数据 CRUD：实现分页读取、新增、编辑、删除；前端新增 `TableData.tsx`，无主键表保持只读。
- 12:48-12:54 完成 Phase 30 SQL 查询工作区：实现 SQL 执行、历史记录、危险 SQL 二次确认提示，并新增 `SqlWorkspace.tsx`。
- 12:54-12:58 完成 Phase 31 索引管理：实现索引列表、创建、删除命令，并新增 `IndexManager.tsx`。
- 12:58-13:02 完成 Phase 32 导入导出：实现 JSON/CSV 导出、导入文件选择、预览、insertOnly/replaceInto 导入，并新增 `ImportExport.tsx`。
- 13:02-13:05 完成 Phase 33 Server 信息与集成修正：新增 MySQL Server 状态页面，修复 MySQL 依赖接入和前端类型构建问题；`npm run build` 通过，`cargo check` 通过（保留既有 `RedisConnectionType` 未使用告警）。
- 13:05-18:25 完成第五期验证与 Windows 打包：`npm test` 通过，`npm run tauri build -- --bundles nsis` 生成 `DevNexus_0.5.0_x64-setup.exe`；打包命令因超时未返回完整日志，但产物时间戳与 release exe 已确认。

### 2026-05-12

- 17:06 完成第六期端口/网络诊断工具规划回写：在第五期 MySQL 之后追加“第六期：端口/网络诊断工具插件”，按 Phase 34-37 拆分脚手架、核心诊断命令、诊断 UI/历史复跑、文档验证与发布准备。
- 17:10 启动第六期 Network 端口/网络诊断工具开发：开始按 Phase 34-37 实施，要求后续开发进度实时回写 PLAN.md，最终同步 README 与发布文档。
- 17:18 完成 Phase 34/35 后端主链路初版：新增 `network_diagnostic_history` 表、`plugins/network` 后端模块、TCP/Ping/DNS/Traceroute 探测命令和历史查询/删除/清空命令，并注册到 Tauri handler。
- 17:28 完成 Phase 36 前端主链路初版：新增 `network-tools` 插件、Diagnostics 动态表单、统一结果面板、History 列表/详情/复跑/删除/清空，并补充内置插件注册测试。
- 17:35 完成 Phase 37 文档与发布配套初版：版本升至 `0.6.0`，新增 `docs/releases/v0.6.0.md`，README 增加 Network Tools 中英文说明，并将第六期 Phase 34-37 任务勾选完成。
- 17:42 完成第六期阶段验证：`cargo check` 通过（仅保留既有 `RedisConnectionType` 未使用告警），`npm run build` 通过（保留 Vite 大 chunk 告警），`npm test` 通过（2 个测试文件、3 个用例）。
- 17:46 完成第六期 Windows 打包：执行 `npm run tauri build -- --bundles nsis` 成功，生成 `src-tauri/target/release/bundle/nsis/DevNexus_0.6.0_x64-setup.exe`。
- 17:50 完成最终一致性检查：同步 `package-lock.json` 顶层版本到 `0.6.0`，还原无关 `cargo fmt` 改动，复跑 `cargo check`、`npm run build`、`npm test` 与 `git diff --check` 均通过。
- 18:05 修复 Network 诊断反馈问题：Windows `ping/tracert` 输出改为 GBK 解码并隐藏系统命令窗口，修正 Ping 统计解析，收紧 Traceroute 默认 max_hops/timeout 与总等待上限，并按产品决策移除 HTTP 探测入口，后续 HTTP/API 调试独立规划。
- 18:07 完成 Network 修复验证：`cargo check`、`npm run build`、`npm test` 通过；新增代码不再引入额外 Rust warning，仅保留既有 `RedisConnectionType` 未使用告警与 Vite 大 chunk 告警。
- 18:13 完成 Network 修复后重打包：首次打包因旧 `devnexus.exe` 进程占用失败，结束进程后重试 `npm run tauri build -- --bundles nsis` 成功，重新生成 `DevNexus_0.6.0_x64-setup.exe`。
- 18:20 优化左侧导航数据库工具组织：新增可折叠 `DB Tools` 分组，将 Redis、MongoDB、MySQL 收纳到同一组，为后续 PostgreSQL/SQLite 等数据库插件预留统一入口。
- 18:24 完成 DB Tools 导航优化验证与重打包：`npm run build`、`npm test` 通过；首次打包因旧 `devnexus.exe` 进程占用失败，结束进程后重试 NSIS 打包成功。
- 18:32 修复侧边栏收起态 DB 工具识别与切换问题：收起态下 `DB Tools` 支持展开具体数据库图标，Redis/MongoDB/MySQL 可直接切换且当前工具独立高亮。
- 18:34 完成侧边栏收起态 DB 修复验证与重打包：`npm run build`、`npm test`、`npm run tauri build -- --bundles nsis` 均通过，安装包已更新。



### 2026-05-13

- 12:08 完成第七期 Windows 打包：执行 `npm run tauri build -- --bundles nsis` 成功，生成 `src-tauri/target/release/bundle/nsis/DevNexus_0.7.0_x64-setup.exe`。
- 12:03 完成第七期阶段验证：`npm test` 通过（3 个测试文件、7 个用例），`npm run build` 通过（保留 Vite 大 chunk 警告），`cargo check` 通过（保留既有 `RedisConnectionType` 未使用告警）。
- 11:54 完成第七期前端主链路初版：新增 `api-debugger` 插件入口、Zustand store、Workspace/Collections/Environments/History 视图，接入请求构建、变量预览、响应查看、集合保存、环境变量、历史复跑与 cURL 导入。
- 11:47 完成第七期后端基础初版：新增 `api_debugger` Rust 模块、API 调试 SQLite 表、`reqwest` 运行时依赖、请求预览/发送、集合/文件夹/请求/环境/history/cURL 导入导出命令，并注册到 Tauri handler。
- 11:37 启动第七期 API Debugger 后续开发：按最新优化后的 Phase 38-42 计划实施，范围包含请求构建/发送、集合与文件夹、环境变量、历史复跑、cURL 导入、脱敏与文档发布配套。
- 11:25 完成第七期 API 调试工具规划回写：确定以独立 `api-debugger` 插件承接 Postman-like HTTP/API 调试能力，按 Phase 38-42 拆分脚手架与数据模型、HTTP 执行核心、请求/响应 UI、集合/环境/历史、文档验证与发布准备。
- 11:33 优化第七期 API Debugger 计划：补充变量解析预览、Cookies/Auth/Body 类型、请求取消、响应体大小限制、历史脱敏与过滤、导出脱敏、安全说明和测试验收项，使首版范围更接近可日常使用的 Postman-like 调试工具。
- 09:35 清理项目品牌残留：将文档、前端样式/DOM 前缀、默认 SSH key 名、本地存储 key、S3 credential provider、本地数据库与密钥文件名统一更新为 DevNexus/devnexus；对旧本地数据库和密钥文件提供启动时迁移兼容。
- 09:45 完成 DevNexus 品牌残留清理验证与重打包：全局搜索仅保留旧数据库/密钥迁移常量；`npm run build`、`npm test`、`cargo check`、`npm run tauri build -- --bundles nsis` 均通过。

- 09:00 修复侧边栏收起态 DB Tools 闪动与无法展开问题：收起态改为常驻显示 Redis/MongoDB/MySQL 具体图标，不再依赖点击展开动画状态；展开态继续保留 DB Tools 折叠能力。
- 09:08 按反馈调整侧边栏收起态 DB Tools：取消常驻数据库图标列表，改为单个 DB 入口 + 下拉菜单切换 Redis/MongoDB/MySQL；DB 入口图标显示当前选中的数据库工具，保持折叠态可识别且可切换。
- 09:12 完成侧边栏 DB Tools 折叠态下拉菜单验证与重打包：`npm run build`、`npm test`、`npm run tauri build -- --bundles nsis` 均通过，安装包已更新。
- 09:20 优化 MongoDB Connections 标签尺寸：将连接卡片中的状态、默认库、TLS、SRV 标签进一步压缩为 10px 字号、16px 行高和更小内边距，降低卡片视觉占用。
- 09:25 完成 MongoDB 标签尺寸优化验证与重打包：`npm run build`、`npm test`、`npm run tauri build -- --bundles nsis` 均通过，安装包已更新。

### 2026-05-13

- 16:05 查看 GitHub issue #1“关于SSH的功能拓展”，确认范围为 SSH 终端全屏、底部留白和命令提示。
- 16:13-16:18 完成 SSH 终端体验优化：`TerminalWorkspace` 支持单标签全屏；`TerminalTab` 增加全屏按钮、xterm 底部内边距和命令建议条；新增 `command-suggestions` 工具函数与 Vitest 覆盖。
- 16:18 完成 v0.7.1 发布配套初版：同步 `package.json`、`package-lock.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 版本至 `0.7.1`，新增 `docs/releases/v0.7.1.md`。
- 16:20-16:32 完成 v0.7.1 验证与打包：`npm test`、`npm run build`、`cargo check`、`npm run tauri build -- --bundles nsis` 均通过，生成 `src-tauri/target/release/bundle/nsis/DevNexus_0.7.1_x64-setup.exe`。



- 15:23 完成第八期统一 MQ 组件规划回写：确认采用单一 `mq-client` 插件承接 RabbitMQ/Kafka，按 Phase 43-47 拆分脚手架与连接模型、RabbitMQ 日常管理与调试、Kafka 日常管理与调试、统一 UI 与历史复跑、文档验证与发布准备；当前仅更新规划，等待后续修订优化。
- 15:34 优化第八期 MQ Client 计划：补充消息体编码、RabbitMQ ack/nack 安全语义、Kafka 临时消费与 offset 边界、消息模板、历史筛选、破坏性操作首版排除、安全文档和测试验收项，使 MQ 调试工具更适合真实队列/主题排查场景。




- 15:52 启动第八期 MQ Client 开发：开始按最新版 Phase 43-47 实施统一 `mq-client` 插件，范围包含 RabbitMQ/Kafka 连接模型、资源浏览、消息发送、临时消费预览、历史模板、安全脱敏、文档验证和打包。

- 16:05 完成 Phase 43 后端与前端脚手架：新增 `mq-client` 插件、`plugins/mq` Rust 模块、`mq_connections`/`mq_message_history`/`mq_saved_messages` 表、连接 CRUD/测试/浏览/历史/模板命令，并注册到 Tauri handler。
- 16:15 完成 Phase 44/45 MQ 核心能力初版：RabbitMQ 接入 `lapin` 与 Management API，支持队列/交换机/绑定浏览、publish、安全消费预览；Kafka 接入 `rdkafka`，支持 metadata 浏览、topic/partition/broker/group 只读查看、produce、临时 consume 且不提交 offset。
- 16:22 完成 Phase 46 统一 UI：新增 Connections、Browser、Message Studio、History 四个工作区，支持 RabbitMQ/Kafka 动态表单、消息模板、结果面板、历史筛选/详情/复跑和安全默认语义提示。
- 16:30 完成第八期前端验证：`npm test` 通过（4 个测试文件、11 个用例），`npm run build` 通过（保留 Vite 大 chunk 警告）。
- 16:37 完成第八期后端验证与 Windows 打包：安装并接入 CMake 后 `cargo check` 通过（仅保留既有 `RedisConnectionType` 未使用警告），`npm run tauri build -- --bundles nsis` 成功生成 `DevNexus_0.8.0_x64-setup.exe`。



- 17:24 调整 RabbitMQ publish 语义：Message Studio 允许 Exchange 为空，空值表示 RabbitMQ 默认交换机；Routing Key/Queue 改为必填并作为默认交换机投递队列名，后端同步移除 `__queue__` 特殊占位。

### 2026-05-14

- 12:17 完成第九期 LAN Chat 规划确认：采用“局域网发现 + 群聊房主协调 + 私聊 P2P”模型；确认私聊不经过房主，群房主只协调自己托管的群，房主下线后纳入基础自动接管；首版包含群聊、在线私聊、文本、图片、文件传输、本机历史和传输中心，并按 Phase 48-52 写入规划。
- 12:26 调整第九期 LAN Chat 入口规划：LAN Chat 不进入左侧主插件列表，改为 Sidebar 左下角主题切换旁的 Chat Launcher；点击后打开全局悬浮聊天小窗，支持拖拽、调整大小、最小化、关闭、未读角标和大尺寸面板，并明确不切换当前主工具页面。
- 12:40 完成 Phase 48 首批实现：新增 LAN Chat 前端 store、Sidebar 底部 Chat Launcher、AppShell 全局 `LanChatWindowHost` 悬浮窗、未读角标与窗口状态持久化；新增 Rust `plugins/lan_chat` 模块、本机设备身份命令、SQLite 表结构和 Tauri command 注册；`npm test`、`npm run build`、`cargo check` 通过。
- 13:07 完成第九期 v0.9.0 首版闭环：补齐 LAN Chat 房间、私聊会话、消息、传输记录、发现快照等 Tauri commands；悬浮窗支持创建房间、手动 P2P 私聊、发送文本、查看成员/传输和设备设置；版本升至 `0.9.0`，新增 `docs/releases/v0.9.0.md`，README 增加 LAN Chat 中英文说明；`npm test`、`npm run build`、`cargo check` 和 `npm run tauri build -- --bundles nsis` 均通过，生成 `DevNexus_0.9.0_x64-setup.exe`。
- 14:13 修复 LAN Chat 首版交互问题：设置弹层提升到聊天窗之上，最小化改为贴靠应用底边；新增 Join Room、清空当前会话、清空传输记录、设备 ID 展示、群聊/私聊中性分组、真实文件选择入口；补充后端 join/clear commands。
- 14:21 完成 LAN Chat 交互修复验证与重打包：`npm test`、`npm run build`、`cargo check` 通过；首次 NSIS 打包因旧 `devnexus.exe` 进程占用失败，结束进程后重试成功，生成 `DevNexus_0.9.0_x64-setup.exe`。
- 15:06 继续修复 LAN Chat 通信与状态栏体验：明确 Room ID 为房主可复制的 Invite / Room ID；新增 UDP 发现监听、presence 广播/回复、房间广播和文本消息投递；聊天最小化改为收纳到底部状态栏右侧；底部状态栏移除假 Connection/Redis/Latency 数据，改为展示当前工具、侧边栏、运行环境、LAN 设备/房间/传输真实数量。
- 15:12 完成 LAN Chat 通信/状态栏修复验证与重打包：`npm test` 通过（8 个测试文件、25 个用例），`npm run build` 通过，`cargo check` 通过（仅保留既有 RedisConnectionType warning），`npm run tauri build -- --bundles nsis` 成功生成 `DevNexus_0.9.0_x64-setup.exe`。
- 15:45 重构 LAN Chat 通信模型：UDP 保留为局域网发现/presence/房间广播，新增 TCP listener 承载私聊文本消息；私聊发送优先连接对方 IP:Port，失败直接提示错误；手动直连 UI 改为 IP:Port 优先，Device ID 降级为高级可选字段；当前会话增加消息轮询自动刷新。
- 15:50 完成 LAN Chat UDP/TCP 重构验证与重打包：`npm test` 通过（8 个测试文件、26 个用例），`npm run build` 通过，`cargo check` 通过（仅保留既有 RedisConnectionType warning），`npm run tauri build -- --bundles nsis` 成功生成 `DevNexus_0.9.0_x64-setup.exe`。
- 16:39 新增隐蔽 Developer Console：通过 `Ctrl + Shift + D` 打开开发者日志面板，支持实时接收后端 `dev-log://entry` 事件、查看/复制/清空最近 1000 条日志；LAN Chat TCP/UDP 启动、绑定失败、presence 广播、设备/房间发现、TCP 消息收发均写入日志，便于排查端口和发现问题。
- 16:44 完成 Developer Console 验证与重打包：`npm test` 通过（9 个测试文件、28 个用例），`npm run build` 通过，`cargo check` 通过（仅保留既有 RedisConnectionType warning），`npm run tauri build -- --bundles nsis` 成功生成 `DevNexus_0.9.0_x64-setup.exe`。
- 17:20 优化 LAN Chat 消息体验与群聊可靠性：本机昵称不再默认使用电脑名称，首次使用需设置可识别昵称；群聊消息改为对已发现在线成员逐个 TCP 投递；消息模型携带 messageType/metadataJson；聊天窗口展示发送人昵称，并支持图片、音频、普通文件消息内联预览。

### 2026-05-15

- 09:12 继续完成 LAN Chat v0.9.1 修复：直连会话列表增加在线/离线红绿状态点，离线私聊发送前拦截并提示“对方已下线”；群聊右侧面板增加“群聊成员”列表。
- 09:24 优化 LAN Chat 消息展示：消息发送人昵称与气泡内容分离为类微信结构，长文本自动换行；图片和音频消息按 metadata/data URL 内联预览，文件消息展示附件信息和可下载链接。
- 09:34 优化 LAN Chat 窗口交互：悬浮窗支持四边和四角缩放，左侧会话列表与右侧成员/传输面板支持拖拽调整宽度；设备 ID 改为短展示并提供复制按钮。
- 09:42 优化文件发送体验：文件、图片、音频选择后进入后台异步发送任务，本地传输记录从 queued/reading/sending/sent 推进，避免发送大文件时阻塞聊天界面；群聊消息携带 room name，提升接收端创建群会话可靠性。
- 09:49 同步 v0.9.1 发布配套：版本号更新至 `0.9.1`，新增 `docs/releases/v0.9.1.md`，准备执行 `npm test`、`npm run build`、`cargo check` 和 Windows NSIS 打包验证。
- 09:58 完成 v0.9.1 验证与 Windows 打包：`npm test` 通过（10 个测试文件、33 个用例），`npm run build` 通过（保留 Vite 大 chunk 警告），`cargo check` 通过（仅保留既有 `RedisConnectionType` 未使用警告），使用独立 `CARGO_TARGET_DIR=src-tauri/target-0.9.1` 执行 NSIS 打包成功，生成 `src-tauri/target-0.9.1/release/bundle/nsis/DevNexus_0.9.1_x64-setup.exe`。
- 10:08 补充 LAN Chat 身份和群管理规则：本机 `device_id` 优先使用规范化 MAC 地址生成，启动时自动将旧 UUID 本机身份迁移到 MAC 身份，并同步本地房间成员、群主字段和本机历史消息 sender，降低同一用户出现多个直连身份的概率。
- 10:14 补充群主改群名能力：新增 `cmd_lan_chat_update_room`，仅群 coordinator 可修改群名；修改成功后广播房间信息，前端群聊标题区为群主显示“修改群名”入口。
- 10:18 修复首次昵称弹窗问题：保存昵称后立即更新本地 identity、刷新表单并关闭强制弹窗；昵称输入示例改为中性“研发同学”，移除隐私相关文案。
- 10:25 完成补充验证：`npm run build`、`cargo check`、`npm test` 均通过，保留既有 Vite 大 chunk 警告和 `RedisConnectionType` 未使用警告；准备重新生成 v0.9.1 NSIS 安装包。
- 10:36 完成 v0.9.1 补充打包：首次 NSIS 写入安装包遇到 Windows 文件映射占用 `os error 1224`，删除旧安装包后重试成功，重新生成 `src-tauri/target-0.9.1/release/bundle/nsis/DevNexus_0.9.1_x64-setup.exe`。
- 10:48 修复 LAN Chat 在线状态不准确：确认根因是设备收到 presence 后只写 `online=1`，没有基于 `last_seen` 的离线过期逻辑；新增 12 秒心跳过期处理，在设备列表读取和消息发送前自动将过期远端设备及群成员置为离线，避免下线后仍显示绿色。
- 10:52 完成在线状态修复验证：`cargo check`、`npm test`、`npm run build` 均通过，保留既有 `RedisConnectionType` 未使用警告和 Vite 大 chunk 警告。
- 10:58 完成在线状态修复后重打包：`npm run tauri build -- --bundles nsis` 成功生成 `src-tauri/target-0.9.1/release/bundle/nsis/DevNexus_0.9.1_x64-setup.exe`；打包期间 Tauri 写入 bundle type 信息遇到 Windows 文件映射占用 warning，但 NSIS 安装包生成成功。
- 11:18 继续优化 LAN Chat 在线状态与启动性能：移除应用启动阶段的 LAN Chat 身份初始化和 UDP/TCP 监听，改为打开聊天窗口后懒启动；MAC 地址查询增加进程级缓存，避免频繁调用 `getmac`；移除 discovery snapshot 中固定 250ms 等待；前端按 `lastSeen` 进行 9 秒在线新鲜度判断，红绿点不再只依赖数据库 `online` 布尔值。
- 11:30 完成绿色版构建与验证：`npm test`、`npm run build`、`cargo check` 通过；执行 `npm run tauri build -- --no-bundle` 生成免安装主程序，并整理为绿色版压缩包 `portable/DevNexus_0.9.1_portable.zip`。
- 18:34 增强 LAN Chat 未读与附件体验：新增会话级未读状态，收到消息时同时更新 Chat 总角标和对应群聊/私聊对象右上角未读角标；打开对应会话后清零该会话未读数。
- 18:42 增强 LAN Chat 附件预览/下载：消息类型扩展 `video`，图片/音频/视频支持聊天内直接预览；其他文件新增后端保存命令，可从消息气泡下载到本地 LAN Chat downloads 目录。
- 18:50 完成 LAN Chat 未读/附件验证与绿色版打包：`npm test`、`npm run build`、`cargo check`、`npm run tauri build -- --no-bundle` 均通过，重新生成 `portable/DevNexus_0.9.1_portable.zip`。
- 18:58 优化 LAN Chat 附件保存体验：普通文件下载改为先打开系统保存路径选择框，由用户选择目标文件路径后再写入；取消选择时不保存。
- 19:00 完成 LAN Chat 附件保存修复验证与绿色版重打包：`npm test`、`npm run build`、`cargo check`、`npm run tauri build -- --no-bundle` 均通过；重新生成 `portable/DevNexus_0.9.1_portable.zip`，普通文件下载改为通过系统保存对话框选择路径。
- 20:45 修复 macOS CI 架构覆盖：`build-desktop.yml` 与 `release.yml` 的 macOS job 改为矩阵构建 Intel `x86_64-apple-darwin` 和 Apple Silicon `aarch64-apple-darwin` 两套 DMG，并在发布资产文件名中追加 `x64` / `arm64`，避免当前 macOS 包只支持 Apple 芯片。
- 20:52 优化 macOS 窗口体验：macOS 启动时恢复 Tauri 原生窗口装饰，前端在 macOS 下隐藏自绘 Windows 风格标题栏和边缘 resize 热区，使用系统左上角红黄绿窗口控制。
- 21:27 完成 macOS 打包体验修复验证：补齐本地 Node/Rust/CMake 环境后，`npm test`、`npm run build`、`cargo check` 均通过；保留 Vite 大 chunk 警告，以及既有 SSH `path` 未使用和 `RedisConnectionType` 未使用 warning。
- 22:10 完成本地 macOS Intel 包输出：显式执行 `tauri build --target x86_64-apple-darwin --bundles app,dmg`，Tauri 自带 DMG 美化脚本在最后一步失败后改用 `hdiutil create` 生成可安装 DMG；产物 `src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/DevNexus_0.9.2_x64.dmg` 已通过 `hdiutil verify`，App 主程序确认为 `Mach-O 64-bit executable x86_64`。
- 22:24 修复 LAN Chat 暗色主题与昵称弹窗：LAN Chat 浮窗、会话卡片、消息气泡、输入区和分割线补齐 dark 样式；昵称必填弹窗不再因定时刷新 snapshot 重置用户输入。`npm test`、`npm run build` 通过，并重新生成/校验本地 Intel DMG。
- 22:33 修复主软件窗口底部空白：主 AppShell 外层和内容区 Ant Layout 补齐 100% 高度、隐藏溢出并使用主题背景，底部状态栏固定为 38px flex 区域，避免 macOS/native titlebar 和暗色主题下窗口底部露出大块空白或白边；同时确认 LAN Chat 最大化尺寸不属于本问题并收回相关临时改动。
- 22:40 完成主窗口底部修复验证与 Intel DMG 重打包：`npm test`、`npm run build`、`cargo check` 通过；重新执行 `tauri build --target x86_64-apple-darwin --bundles app` 并用 `hdiutil create` 生成 `DevNexus_0.9.2_x64.dmg`，`hdiutil verify` 校验通过，主程序确认为 `Mach-O 64-bit executable x86_64`。
- 22:44 修复左下角 Chat 入口未贴底：Sidebar 自身补齐 `height: 100%`、固定宽度 flex-basis 和 `min-height: 0`，插件列表改为中间可滚动区域，底部 Chat/Theme 工具组固定在侧栏底边；`npm run build` 通过。
- 22:49 修复 AppShell 未铺满窗口根因：根据截图确认整块 React 根布局只撑到状态栏附近，改为让 `html/body/#root` 和 `.devnexus-layout` 明确占满 `100vh` 并隐藏外层溢出，确保 Sidebar、内容区和底部状态栏一起贴到主窗口底边；`npm run build` 通过。
- 22:53 完成根布局修复后的 Intel DMG 重打包：重新执行 `tauri build --target x86_64-apple-darwin --bundles app`，用 `hdiutil create` 覆盖生成 `DevNexus_0.9.2_x64.dmg`；`hdiutil verify` 通过，主程序仍确认为 `Mach-O 64-bit executable x86_64`。
- 21:46 增强 LAN Chat 群聊模型：新增固定公共聊天室 `public-lobby`（不可删除、默认 UDP），房间模型增加按群单独设置的 `channel` 字段；自建/加入/管理群聊可选择 UDP 广播或 TCP 逐个投递，群消息发送按房间通道自动选择传输方式。
- 21:51 完成 LAN Chat 公共聊天室/群通道验证与绿色版重打包：`npm test`、`npm run build`、`cargo check`、`npm run tauri build -- --no-bundle` 均通过；结束旧绿色版进程占用后重新生成 `portable/DevNexus_0.9.1_portable.zip`。
- 22:38 简化 LAN Chat 会话模型：只保留固定公共聊天室 `public-lobby` 和私聊；隐藏旧自建群聊，后端拒绝继续创建/加入自定义群聊；左侧会话区合并为单列表，用公共/私聊标签区分。
- 22:40 修复公共聊天室 UDP 可靠性：公共聊天室仍使用 UDP，但发送时改为广播加已发现设备 UDP 单播补发，规避 Windows、多网卡或局域网策略导致的纯广播丢包；非公共群聊 UDP/TCP 消息被接收端忽略。
- 22:45 完成 LAN Chat 单公共聊天室版本验证与绿色版重打包：`npm test`、`npm run build`、`cargo check`、`npm run tauri build -- --no-bundle` 均通过；结束旧绿色版进程占用后重新生成 `portable/DevNexus_0.9.1_portable.zip`。
- 22:48 优化 LAN Chat 会话列表识别：公共聊天室卡片改为蓝色系底色，私聊卡片改为绿色系底色，选中态保留各自色系，降低只看标签时不够直观的问题；`npm run build` 与 `npm test` 通过。
- 23:03 完成 LAN Chat 会话卡片底色优化后的绿色版打包：执行 `npm run tauri build -- --no-bundle` 通过，重新生成 `portable/DevNexus_0.9.1_portable.zip`。
- 23:16 准备 v0.9.2 发布：版本号同步升至 `0.9.2`，将 v0.9.0 与 v0.9.1 的 LAN Chat 发布说明合并为 `docs/releases/v0.9.2.md`，并保留本轮公共聊天室/私聊简化、UDP 补发和会话卡片底色优化说明。
- 23:42 修复公共聊天室大附件发送失败：确认根因为 UDP 单数据报大小限制，公共聊天室小消息继续 UDP 广播+单播补发，超过 48KB 的图片/音频/文件等大消息自动降级为 TCP 单播投递；`cargo check`、`npm run build`、`npm test` 通过。
- 23:53 重构 LAN Chat 文件传输：所有文件发送改为发送者本地文件服务承载，消息仅传递 fileId/token/文件元数据；图片、音频、视频在接收端自动通过发送者服务预览，普通文件点击下载时弹保存路径并拉取文件，避免 base64 消息和 UDP 大包限制。
- 23:58 完成 v0.9.2 文件服务方案验证：`npm test` 通过（10 个测试文件、33 个用例），`npm run build` 通过（保留 Vite 大 chunk 警告），`cargo check` 通过（仅保留既有 `RedisConnectionType` 未使用警告），`npm run tauri build -- --no-bundle` 通过并生成 `src-tauri/target-0.9.2-portable/release/devnexus.exe`。
- 23:59 调整 v0.9.2 Release 资产：tag 触发的 `release.yml` 在 Windows 构建中额外生成 `DevNexus_<version>_windows_portable.zip` 绿色版，并随 NSIS 安装包一起上传到 GitHub Release。

### 2026-05-16

- 00:02 准备 v0.9.3 发布：同步 `package.json`、`package-lock.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 至 `0.9.3`，新增 `docs/releases/v0.9.3.md`，将 macOS Intel/Apple Silicon 打包、原生 macOS 标题栏、主窗口/Sidebar 贴底、LAN Chat 主题与昵称修复纳入发布说明。
- 02:41 完成 v0.9.3 发布前验证：`npm test` 通过（10 个测试文件、33 个用例），`npm run build` 通过（保留 Vite 大 chunk 警告），`cargo check` 通过（保留既有 SSH `path` 未使用与 `RedisConnectionType` 未使用 warning）。

### 2026-05-18

- 10:52 修复 LAN Chat 三人及以上在线时只在单个节点可见的问题：确认根因是发现链路只依赖单跳 UDP presence，部分网络下只有一个节点掌握完整在线列表；presence、presenceReply 和 room 广播新增已知在线 peer gossip，接收端自动合并远端已知设备，公共聊天室群发目标增加去重，`cargo check` 通过（仅保留既有 `RedisConnectionType` 未使用 warning），`npm test` 通过（10 个测试文件、33 个用例）。

### 2026-05-25

- 启动第十期 Confluence Publisher 插件规划：完成需求探索与设计确认（编辑器驱动型方案、Confluence Server/Data Center REST v1 + Basic Auth、unified 生态 Markdown 转换、Monaco 编辑器分屏布局、LaTeX/Mermaid 渲染上传），输出设计规格 `docs/superpowers/specs/2026-05-25-confluence-publisher-design.md`，按 Phase 53-59 将完整迭代计划写入 `PLAN.md`。

- 完成 Phase 53 后端脚手架：SQLite 新增 `confluence_connections` 表、`confluence_connection_repo.rs` 实现 AES-256-GCM 加密 CRUD、`client.rs` 封装 reqwest Basic Auth HTTP 客户端、`commands.rs` 注册 5 个 Tauri 命令（list/save/delete/test/upload_attachment），`cargo check` 通过。
- 完成 Phase 53.4 前端插件注册：新增 `src/plugins/confluence/` 目录，`index.tsx` 注册 manifest（sidebarOrder: 9），`types.ts`、`store/confluence.ts` Zustand store、`components/ConnectionSettings.tsx` 连接配置抽屉表单；在 `builtin.ts` 注册 confluence 插件（按字母序排在 mongodb-client 后）；依赖 `@monaco-editor/react`、`unified`/`remark-parse`/`remark-gfm`、`base64-js` 已安装。
- 完成 Phase 54 Markdown → Confluence Storage Format 转换：`utils/converter.ts` 基于 unified AST 构造 Storage Format XML，覆盖标题、粗斜体、行内代码、围栏代码块、链接、图片、表格、任务列表、引用块、分割线、有序/无序列表共 12 类基础元素；支持 LaTeX 数学公式（mathinline/mathblock 宏）、Mermaid 图表（html 宏 + CDN）、markdownToPreviewHtml 预览 HTML 生成。
- 完成 Phase 55 Monaco 编辑器 + 预览 UI：`ConfluenceEditor.tsx` 实现左右分屏（Monaco 50% + 预览 50%），工具栏支持打开/保存本地 .md 文件（Tauri dialog + fs API）、连接设置入口、发布按钮；编辑内容实时转换预览，转换失败时在预览区显示错误信息不崩溃。
- 修复 ConfluenceEditor 类型错误：Tauri v2 `openDialog({multiple: false})` 返回 `string | null` 而非对象，移除 `.path` 属性访问；`npm run build` 通过。
- 完成 Phase 56 Confluence API 集成：Rust 后端新增 Space 列表/Page 列表/创建/更新/附件上传 5 个命令；前端 `PublishDialog.tsx` 支持 Space 下拉搜索、父页面树形选择、标题输入、新建/更新模式识别、发布进度显示与错误处理。
- 完成 Phase 57 文件管理与页面映射：Monaco 支持打开/保存 .md 文件，`utils/file-mapping.ts` 基于 localStorage 存储文件路径→Confluence 页面 ID 映射，打开已关联文件时自动切换为更新模式。
- 完成 Phase 58 附件处理：`utils/attachments.ts` 实现本地图片提取/上传/URL 替换（ri:url → ri:attachment），自动识别 MIME 类型；Converter 增强 LaTeX（mathinline/mathblock 宏）和 Mermaid（html 宏）支持。
- 完成 Phase 59 版本升级与文档：版本号同步升至 `0.10.0`（4 个文件），新增 `docs/releases/v0.10.0.md` 发布说明，README 中英文增加 Confluence Publisher 插件说明、技术栈、目录结构、安全声明与当前限制。
- 修复 `src-tauri/src/lib.rs` 多余闭合括号（compilation error: unexpected closing delimiter）。
- 修复 `commands.rs` unused variable warning（`_app_handle`）。
- 验证通过：`cargo check`（2 个预期 warning）、`npm test`（10 个文件、33 个用例全部通过）、`npm run build`（Vite 大 chunk 警告正常）。

### 2026-05-26

- 修复 Confluence Publisher 在 SSO/PAT 场景测试连接 401 的问题：连接配置新增认证方式 `Basic` / `Personal Access Token (Bearer)`，后端按 `auth_type` 生成 `Authorization: Basic ...` 或 `Authorization: Bearer <token>`；旧连接默认 Basic，SQLite 增加 `auth_type` 迁移，编辑连接时密码/Token 留空会保留原加密凭据；README、release notes 和第十期计划同步说明 SSO/PAT Bearer 支持；`cargo check`、`npm test`、`npm run build` 均通过。
- 修复 Confluence Publisher 父页面列表混入下级页面的问题：根层 Parent Page 查询改为 `expand=ancestors,version` 并只保留 `ancestors` 为空的页面；选择父页面后的子页面加载仍使用 `/rest/api/content/{parentId}/child/page` 获取直接子页面；`cargo check` 通过。
- 11:42 优化 Confluence Publisher 页面选择与历史发布：编辑器左侧新增 Space/Page Tree，支持按 Space 加载一级页面、展开页面懒加载子页面，选中页面后发布弹窗默认发布到该页面下；新增 `confluence_publish_history` SQLite 表与记录/列表/删除命令，发布创建/更新后保存 Markdown 快照，可从历史记录一键载入继续修改或删除本地历史记录；根层页面查询调整为官方 `/rest/api/space/{spaceKey}/content/page` 并继续用 `ancestors` 过滤一级页面。
- 11:51 清理 Rust warning：删除后端未使用的 `RedisConnectionType` enum，Redis 连接类型继续按现有数据库/表单字符串透传；`cargo check` 已无 `RedisConnectionType` 未使用 warning，`npm test`、`npm run build`、`cargo check` 均通过。
- 12:48 修复 Confluence Space 页面树在 LAI 等空间下拉不到目录的问题：根页面查询兼容 Confluence Server/Data Center 的顶层 `results` 与 `page.results` 两种响应结构；官方 `/rest/api/space/{spaceKey}/content/page` 失败或返回空时自动回退到 `/rest/api/content?type=page&spaceKey=...&expand=ancestors,version` 并过滤一级页面；补充后端单元测试覆盖两种响应结构，`cargo check`、`cargo test confluence::client::tests --lib`、`npm test`、`npm run build` 均通过。
- 13:56 修复 Confluence Publisher 编辑状态与 Mermaid/代码宏兼容性：顶部工具栏新增 `New`，左侧页面树新增 `New here`，新建草稿时清空当前编辑内容、文件路径和旧页面绑定，但保留左侧选中的 Space/Page 作为发布目标，避免在其他目录新写文档时误更新老页面；代码宏增加语言白名单与别名映射，`json/jsonc` 映射为 `javascript`，`http` 等不支持语言自动省略 language 参数；Mermaid 本地预览改为实时渲染，发布时渲染为 PNG 附件后嵌入页面，避免 Confluence Server/Data Center 不显示 SVG 或禁用 html 宏的问题。

### 2026-05-27

- 08:46 调整 Mermaid 发布策略为 draw.io 嵌入：Markdown 中的 `mermaid` 代码块不再输出 html 宏、PNG 或普通图片附件；发布时先用 Mermaid 渲染 SVG，再封装为 `.drawio` XML 附件上传，页面正文插入 Confluence draw.io 宏引用该附件，解决位图失真问题并适配已安装 draw.io 插件的 Confluence 环境；本地预览仍使用 Mermaid 实时渲染。
- 18:51 修复阿里云 OSS/S3 兼容账号无 `ListBuckets` 权限时无法进入 Bucket 列表的问题：S3 连接高级配置将 `Default Bucket` 扩展为 `Manual Buckets`，支持逗号、分号或换行填写多个 Bucket；连接测试在配置手动 Bucket 时改用第一个 Bucket 的 `ListObjectsV2(maxKeys=1)` 验证权限；Bucket 列表在 `ListBuckets` 失败或返回空时回退到手动 Bucket 列表，保障仅授权具体 Bucket 的账号仍可浏览对象。
- 20:13 优化 OSS/S3 Objects 页面占满主工作区：S3 插件内容区、Objects 卡片和对象列表改为连续 flex 布局；对象表格去掉固定 `520px` 滚动高度，改用 `ResizeObserver` 根据可用空间动态计算滚动区域，Grid/List 两种视图都随窗口尺寸铺满剩余区域。

### 2026-05-28

- 10:58 启动 DevNexus 官网建设：确认采用深色工程感 Landing + 单页中英切换方案；新增独立 `website/` 静态站点（不引入桌面端构建依赖），覆盖 Hero、插件能力、版本时间线、文档入口和下载入口；新增 GitHub Pages Actions workflow，后续 `main` 分支更新 `website/**` 后自动部署到 GitHub Pages。
- 11:35 优化官网文档体验：将快速开始、版本发布、RepoWiki 从外链卡片改为页面内部 hash 跳转和站内文档面板切换，保留 GitHub 完整内容链接作为次级入口；顶部语言切换左侧新增 GitHub 图标按钮直达项目仓库。
- 12:01 完成官网站内文档集成：新增 Markdown 静态文档生成脚本，将 `README.md`、`docs/releases/*.md`、`.qoder/repowiki/zh/content/**/*.md` 生成到 `website/content/` 并在官网内直接打开；GitHub Pages workflow 发布前自动重新生成文档；补充 Copyright 与 License 声明页。
- 12:32 重构官网文档中心交互：新增统一 `website/content/docs.html` 阅读器，顶部标签在“快速开始 / 版本发布”和 `RepoWiki` 间切换；两类文档均采用左侧目录、右侧文档阅读区布局，首页三个文档入口直接进入对应站内阅读位置；语言切换继续使用小国旗图标标识中英文。
- 14:57 优化官网文档中心目录树：左侧导航从平铺列表改为可展开目录树，“快速开始”目录直接包含 README，“Release”目录展开显示各版本发布文件，RepoWiki 按原始目录聚合展示；语言切换图标改为 CSS 绘制小旗，避免 Windows 将 emoji 国旗显示为 `CN` / `US` 文本。
- 15:19 精简官网文档中心顶部与语言切换：移除中英文切换图标，仅保留文字下拉；文档中心去掉大标题区域，将“快速开始 / 版本发布”和 `RepoWiki` 两个 tab 放入顶部导航中间；右侧保留文档中心、返回官网、GitHub 和语言切换；站内文档页的顶部链接改为 `_top` 打开，避免在右侧 iframe 中嵌套首页。
- 16:11 调整官网与文档中心导航语义：官网顶部新增“文档中心”入口并直接定位到 README；文档中心顶部移除自引用的“文档中心”按钮，仅保留“返回官网”；GitHub 改为图标按钮；文档中心语言切换按钮缩小；修复 `doc=readme` 参数未映射到 `readme.html` 导致无法精准打开 README 的问题。
- 16:33 精简官网首页首屏文案：Hero 标题压缩为“本地优先的开发者工具箱”，副标题改为概括连接管理、调试、文档发布和局域网协作，减少首屏大字信息密度。
- 16:41 继续优化官网与文档阅读体验：官网顶部 GitHub 入口改为纯图标；文档中心“返回官网”改为绿色强调；站内文档详情页移除顶部 DevNexus、文档中心、返回官网文档和 GitHub 导航，仅保留当前文档所属目录标签，避免 iframe 内重复导航干扰阅读。
- 16:56 修复官网站内文档 Mermaid 渲染：定位到 Markdown 生成器将 `mermaid` fenced code 输出为普通 `<pre><code data-lang="mermaid">` 的根因；新增 Mermaid 代码块专用转换，生成 `<div class="mermaid">` 图块，并在文档详情页加载 Mermaid 11 ESM 渲染脚本和深色主题样式。
- 18:16 拆分 DevNexus 官网为独立项目：将站点源码迁移到 `<docs-site-repo>`，改造为 `src/` 到 `dist/` 的静态构建；独立仓库 Pages workflow 支持手动、main 推送和 DevNexus release dispatch 触发，并从对应 DevNexus tag 读取 README、release notes 与 RepoWiki 生成文档中心；主仓库 release workflow 增加 `DEVNEXUS_DOCS_TOKEN` 驱动的官网重建通知，移除主仓库内旧 `website/` 发布入口。
- 18:25 完成 DevNexus_Doc 独立站点验证：`npm run build -- <devnexus-repo>` 成功生成 `dist/`，本地 `localhost:58710` 已切换到独立项目产物；主仓库 `git diff --check`、`npm test`、`npm run build`、`cargo check` 均通过，Vite 大 chunk 警告保持为既有非阻塞提示。
- 19:06 优化独立官网数据化生成：Plugin Toolbox 改为读取 `<docs-site-repo>/src/data/plugin-toolbox.json` 并横向滑动展示 10 个插件；首页版本数和插件数改为构建数据自动统计；Release Timeline 根据 `docs/releases/*.md` 和 tag 日期自动生成并默认突出最近 10 个版本；文档中心生成 `README`、Release、RepoWiki 中英文页面，英文 RepoWiki 从 `.qoder/repowiki/en/content` 读取。

### 2026-05-29

- 08:58 优化官网 Release Timeline 左侧文案：移除关于自动生成机制的内部说明，改为面向用户的版本发布与产品演进介绍，并同步中英文文案；`npm run build -- <devnexus-repo>` 通过，本地浏览器确认 `#releases` 展示新文案。
- 09:21 拆分 README 与发布说明多语言来源：主仓库 `README.md` 保留中文内容，新增 `README_EN.md` 承载英文内容；发布说明迁移为 `docs/releases/cn/vX.Y.Z.md` 与 `docs/releases/en/vX.Y.Z.md` 双目录结构，并翻译补齐既有版本中文发布说明。
- 09:28 同步官网生成规则：独立官网 `<docs-site-repo>` 的文档生成器改为中文读取 `README.md`、英文读取 `README_EN.md`，Release 页面分别读取 `docs/releases/cn` 与 `docs/releases/en`；主仓库 release workflow 的 GitHub Release body 改为使用英文发布说明。
- 09:47 优化官网 Plugin Toolbox 展示：插件卡片从横向滚动条改为分页轮播，每页两行、每行四个插件；鼠标悬停插件区域显示左右翻页箭头，底部圆点展示当前位置并支持跳页；`npm run build -- <devnexus-repo>` 通过。
- 09:55 固化 DevNexus 项目级技能规则：新增 `.agents/skills/devnexus-release-workflow/SKILL.md`，覆盖中英文 README、双语 release notes、双语 RepoWiki、`PLAN.md` 实时进度和 `plugin-toolbox.json` 更新要求；`AGENTS.md` 与 `CLAUDE.md` 增加项目技能读取入口。
- 18:35 追加提交合并后新生成的英文 RepoWiki 结构：将 `.qoder/repowiki/en` 的最新目录与文档作为官网文档中心英文知识库来源提交到 `main`，准备基于最新 `main` 重新打 `v0.10.0` tag。
- 21:16-21:46 开源协作与仓库保护基线更新：新增轻量 `ci.yml`，在 PR/main push 上执行 `npm test`、`npm run build`、`cargo check`；`build-desktop.yml` 改为仅手动触发，避免 main push 自动打完整桌面包；新增 CODEOWNERS、Dependabot、PR/Issue 模板、中文默认的 `CONTRIBUTING.md` / `SECURITY.md` 与英文 `_EN.md` 副本；`tag-verify` 改为有效的 `.yml` workflow；GitHub Release 默认读取中文发布说明，所有 `docs/releases/cn` 与 `docs/releases/en` 文件增加中英文互跳链接。远端 GitHub ruleset 同步为 main 必须 PR、1 个 approval、CODEOWNERS、review thread resolved 与 `checks` 状态检查；`v*` tag 保护启用；仓库开启 merge 后删除分支、Dependabot security updates、secret scanning 与 push protection。
- 23:58 调整 PR 自动合并策略：新增统一 `Auto Merge PRs` workflow，对 `DumKing` 与 `dependabot[bot]` 提交的非 draft PR 自动 approve 并开启 squash auto-merge；其他贡献者 PR 不自动 approve，仅预先开启 auto-merge，待人工 review 与 required checks 满足后由 GitHub 自动合并；全流程继续遵守 main ruleset，不使用 admin 绕过或 direct push。
- 00:08 细化 PR 自动合并触发顺序：`Auto Merge PRs` workflow 在 approve 与开启 auto-merge 前先等待 required checks 通过，确保 `DumKing` 与 Dependabot PR 符合“CI 通过后自动 approve / auto-merge”的期望；外部贡献者 PR 仍保留人工 review 门槛。

### 2026-06-02

- 14:43 定位并修复 Confluence Publisher 更新页面 409 Conflict：确认根因为更新时依赖本地映射/历史中的旧版本号，后端改为 PUT 前实时读取 Confluence 当前页面版本并提交 current+1，避免多端编辑或本地版本过期导致 Version must be incremented。
- 14:51 完成 Confluence 409 修复验证：`cargo test confluence::client::tests --lib` 通过（3 个用例），`npm test` 通过（12 个测试文件、39 个用例），`npm run build` 通过（保留既有 Vite 大 chunk 告警），`cargo check` 通过。
- 16:42 优化 Confluence Publisher 本地预览与发布转换：本地预览改用 react-markdown + remark-gfm 直接渲染 Markdown，移除 Confluence Storage Format 反向预览链路；发布阶段继续将 Mermaid 转为 draw.io 附件，并增强 draw.io XML 的白底画布、尺寸、边距、源码元数据和宏参数。同时为 API Debugger Workspace 增加 Import cURL 弹窗入口，并增强后端 cURL 解析对 URL、Basic Auth、Cookie、GET data、multipart、timeout、redirect、TLS 参数的支持。
- 17:11 增加应用级设置能力：状态栏新增 Settings 入口，设置抽屉支持手动/启动自动检查更新、LAN Chat 桌面通知开关、开发者操作日志开关；LAN Chat 未读消息在窗口关闭、最小化或聚焦其他会话时可弹桌面通知；调试日志默认关闭并由设置同步到 Tauri 后端；插件中心/插件市场设想单独沉淀到 .doc/plugin-center-market-plan.md，不纳入当前 PLAN。

- 17:25 清理项目隐私信息：将 PLAN.md 与项目级 skill 中的本地绝对路径替换为 <devnexus-repo>、<docs-site-repo> 等通用占位；移除代码示例中的本机下载目录 placeholder 和 SSH 测试里的真实内网 IP；复扫确认未残留本地盘符、用户目录、真实主机名或敏感文件路径。
- 17:28 完成设置能力与隐私清理验证：git diff --check 通过；隐私关键字复扫未发现本地盘符、用户目录、真实主机名或敏感文件路径残留；
pm test 通过（14 个测试文件、43 个用例），
pm run build 通过（保留既有 Vite 大 chunk 警告），cargo check 通过。

### 2026-06-03

- 09:20 增强应用设置与多语言能力：新增轻量 i18n 字典和语言切换设置，默认中文并支持英文；设置页增加插件管理卡片，可启用/禁用内置插件，普通工作区插件至少保留一个；LAN Chat 注册为 PluginManifest 并保持悬浮入口布局，禁用后隐藏聊天入口并停止后台轮询，同时移除窗口头部写死的 v0.9.2 标签。
- 09:30 升级前端 TypeScript 编译目标：将 	sconfig.json 的 	arget 与 lib 从 ES2020 调整为 ES2022，使 Array.prototype.at、String.prototype.replaceAll 等现代运行时 API 在类型层面可用；保持 DOM/DOM.Iterable 支持不变。
- 09:33 完成 ES2022 构建目标升级验证：
pm test 通过（15 个测试文件、49 个用例），
pm run build 通过（保留既有 Vite 大 chunk 警告），cargo check 通过。
- 10:20 优化应用设置与连接管理体验：设置页新增开机自启开关，插件管理隐藏内部版本展示并改为搜索、类型筛选、启用数量统计；新增插件分组筛选工具函数，为后续插件数量增长和插件市场预留管理模型；修复 Redis/SSH 编辑连接时丢失原连接 id 导致保存为新连接的问题，并让 Redis/SSH 编辑元数据时留空保留原凭据；Redis、SSH、MongoDB、MySQL 连接页改为可折叠分组和组内横向卡片排列；新增插件级 i18n hook，开始将插件内部文案下放到插件自己的语言包并跟随应用语言设置。
- 10:48 完成设置与连接管理改造验证：npm test 通过（16 个测试文件、51 个用例），npm run build 通过（保留既有 Vite 大 chunk 警告），cd src-tauri && cargo check 通过；git diff --check 未发现空白错误。
- 11:26 完成 v0.10.1 发版准备：补齐 S3/OSS 连接页可折叠分组和编辑保留原连接 id；设置页拆分为基础设置与插件管理两个 Tab；LAN Chat 通知改为 Tauri 原生系统通知优先，并在新消息到达时请求窗口注意力；Windows 关闭按钮改为隐藏到系统托盘，最小化仍进入任务栏，真正退出通过托盘菜单；版本同步升级到 0.10.1，更新 README/README_EN 和 docs/releases/cn/en/v0.10.1.md；验证 npm test、npm run build、cd src-tauri && cargo check 均通过，git diff --check 未发现空白错误。
- 14:06 定位并修复 GitHub Release 页面中英文切换 404：确认根因为 release workflow 直接使用 docs/releases/cn 中的文档站相对语言切换链接作为 Release body，GitHub Release 页面解析相对路径后跳到不存在地址；发布流程新增 dist-release/release-body.md 生成步骤，将语言切换替换为 tag 固定的 GitHub 文件链接，避免后续版本发布后再出现 404。
- 14:12 完成 GitHub Release 语言切换修复验证：已在线更新 v0.10.1 Release body，语言切换链接改为 tag 固定 GitHub 文件链接；npm test 通过（16 个测试文件、51 个用例），npm run build 通过（保留既有 Vite 大 chunk 警告），cd src-tauri && cargo check 通过，git diff --check 通过。
