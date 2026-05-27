# Confluence Publisher 插件设计规格

## 概述

为 DevNexus 新增 Confluence Publisher 插件，支持本地 Markdown 文件编辑、实时转换为 Confluence Storage Format 并一键发布到 Confluence Server / Data Center。

## 范围

**包含：**
- Monaco 编辑器 + 实时 Confluence 预览的分屏 UI
- Markdown → Confluence Storage Format 转换（unified 生态）
- Confluence Server REST v1 API 集成（Basic Auth）
- 本地 `.md` 文件打开、编辑、保存
- 图片/LaTeX/Mermaid 作为附件上传嵌入
- 文件→Confluence 页面关联记忆（localStorage）
- 连接凭据 AES-256-GCM 加密存储

**不包含：**
- Confluence Cloud 支持（REST v2）
- 批量文件/目录迁移
- 双向同步
- 协作编辑

## 架构

```
前端 (React/TypeScript)              后端 (Rust/Tauri)
┌────────────────────────┐     ┌──────────────────────────┐
│ Monaco 编辑器           │     │ Confluence REST v1 客户端 │
│ unified 转换管线        │────▶│   - 验证连接              │
│ Confluence 预览         │     │   - Space/Page CRUD       │
│ Zustand store           │     │   - 附件上传              │
│                         │     │                          │
│ 连接配置 UI             │     │ SQLite 连接配置仓储       │
│ 发布弹窗                │     │ AES-256-GCM 凭据加密      │
└────────────────────────┘     └──────────────────────────┘
```

## 转换管线

Markdown → `unified` + `remark-parse` + `remark-gfm` → AST → 自定义编译器 → Confluence Storage Format XML。

### 元素映射

| Markdown | Confluence Storage Format |
|----------|--------------------------|
| `# Title` | `<h1>Title</h1>` |
| `**bold**` | `<strong>bold</strong>` |
| `` `code` `` | `<code>code</code>` |
| ` ```lang\n...\n``` ` | `<ac:structured-macro ac:name="code">...` |
| `[text](url)` | `<a href="url">text</a>` |
| `![alt](url)` | `<ac:image><ri:url ri:value="url"/></ac:image>` |
| `\| table \|` | `<table><tbody>...` |
| `- [x] task` | Confluence 任务列表标签 |
| `[^1]: note` | 脚注宏 |
| `$$LaTeX$$` | 渲染为图片 → 上传附件 → `<ac:image>` |
| ` ```mermaid ` | 渲染为图片 → 上传附件 → `<ac:image>` |
| `> quote` | `<blockquote>quote</blockquote>` |
| `---` | `<hr />` |

### 特殊元素处理

LaTeX 和 Mermaid 在前端分别用 `katex` 和 `mermaid` 渲染为 SVG，转为 base64 图片，作为附件上传到 Confluence 页面，然后嵌入 `<ac:image>` 标签。

本地图片引用（`![img](./local.png)`）读取文件后同样作为附件上传。

## UI 布局

```
┌─ Confluence Publisher ─────────────────────────────┐
│  [📂 打开] [💾 保存] │ [⚙ 连接设置] │ [🚀 发布]    │
├──────────────────────┬─────────────────────────────┤
│   Monaco 编辑器 (50%) │  Confluence 预览 (50%)       │
├──────────────────────┴─────────────────────────────┤
│  📄 文件路径  │  🔗 已关联: SPACE → Page Title       │
└────────────────────────────────────────────────────┘
```

### 关键交互

1. **连接配置**（抽屉）：Site URL、用户名、密码/Token → 测试连接 → 保存（AES 加密）
2. **打开文件**：系统文件选择器 → 加载到 Monaco → 自动预览
3. **发布**：弹窗选 Space → 选父页面 → 确认标题 → 发布/更新

## 后端 API 端点

| 功能 | HTTP | 命令名 |
|------|------|--------|
| 验证连接 | `GET /rest/api/space` | `cmd_confluence_test` |
| Space 列表 | `GET /rest/api/space?limit=200` | `cmd_confluence_list_spaces` |
| 子页面列表 | `GET /rest/api/content/{id}/child/page` | `cmd_confluence_list_pages` |
| 创建页面 | `POST /rest/api/content` | `cmd_confluence_create_page` |
| 更新页面 | `PUT /rest/api/content/{id}` | `cmd_confluence_update_page` |
| 上传附件 | `POST /rest/api/content/{id}/child/attachment` | `cmd_confluence_upload_attachment` |

认证方式：HTTP Basic Auth（`Authorization: Basic base64(user:pass)`）。

## 文件结构

### 前端 (`src/plugins/confluence/`)

```
├── index.tsx
├── types.ts
├── store/
│   └── confluence.ts
├── utils/
│   ├── converter.ts
│   └── file-mapping.ts
├── components/
│   ├── ConfluenceEditor.tsx
│   ├── ConnectionSettings.tsx
│   └── PublishDialog.tsx
```

### 后端 (`src-tauri/src/plugins/confluence/`)

```
├── mod.rs
├── commands.rs
├── client.rs
└── types.rs
```

## 新增依赖

### npm

| 包 | 用途 |
|----|------|
| `@monaco-editor/react` | 编辑器 |
| `unified` | Markdown AST |
| `remark-parse` | 解析器 |
| `remark-gfm` | GFM 扩展 |
| `katex` | LaTeX 渲染 |
| `mermaid` | 图表渲染 |
| `hast-util-to-html` | HAST 输出 |

### Rust (Cargo)

| 包 | 用途 |
|----|------|
| `reqwest` | HTTP 客户端 |
| `base64` | Basic Auth 编码 |
| `serde` / `serde_json` | 序列化 |

## 错误处理

- 网络错误 → 前端 toast 提示，不崩溃
- 认证失败 → 「连接配置」弹窗提示 401，引导重新设置
- 转换失败 → 编辑器标记问题行，预览区显示错误信息
- API 限流 → 指数退避重试（最多 3 次）
- 大文件警告 → 附件超过 50MB 时提示

## 验证标准

- `npm test` 通过
- `npm run build` 通过
- `cargo check` 通过
- 手动验证：配置连接 → 打开 .md → 发布 → 在浏览器中确认 Confluence 页面渲染正确
