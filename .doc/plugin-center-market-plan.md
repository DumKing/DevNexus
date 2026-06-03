# DevNexus 插件中心与插件市场搁置规划

> 状态：搁置规划，不纳入当前 `PLAN.md` 迭代。
> 目标：为后续“插件中心 / 插件市场 / 第三方插件生态”提供建设性路线，当前仅作为产品与架构参考。

## 1. 背景

DevNexus 当前采用内置插件模式：前端插件通过 `PluginManifest` 注册，后端能力通过 Rust/Tauri commands 编译进应用。这个模式稳定、安全、适合当前阶段，但如果后续工具数量继续增加，需要逐步引入插件管理与插件生态能力。

插件中心不建议一次性做成完整市场，而应分阶段演进：

1. 内置插件可管理。
2. 插件元数据标准化。
3. 插件更新状态可展示。
4. 官方插件目录化。
5. 社区插件市场化。
6. 最后再考虑动态安装与热更新。

## 2. 当前阶段建议

当前阶段只建议实现“软件设置”能力，不启动插件市场开发。

可在设置中预留插件管理方向，但不落地第三方插件下载：

- 软件基础设置。
- 更新检查。
- 通知开关。
- 开发者日志开关。
- 后续可扩展为插件启用/禁用。

## 3. 插件中心阶段规划

### Phase A：内置插件管理

目标：让用户可以管理内置插件的显示与启用状态。

能力：

- 设置页新增 `Plugin Manager`。
- 展示插件名称、版本、分类、描述、状态。
- 支持启用/禁用插件。
- 禁用后从 Sidebar 或入口中隐藏。
- 保留最少一个可用插件，避免主界面无内容。
- 当前选中插件被禁用时自动切换到下一个可用插件。

边界：

- 插件仍随 DevNexus 一起编译和发布。
- 不支持独立下载、卸载或热更新。
- 不引入第三方代码执行。

### Phase B：插件元数据标准化

目标：让所有插件具备可展示、可统计、可自动生成文档的数据结构。

建议 Manifest 字段：

```ts
interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  category: "database" | "network" | "storage" | "mq" | "document" | "collaboration" | "api" | "other";
  author: string;
  icon?: ReactNode;
  minimumAppVersion?: string;
  permissions?: PluginPermission[];
  sidebarOrder: number;
  showInSidebar?: boolean;
}
```

建议权限字段：

```ts
type PluginPermission =
  | "network"
  | "filesystem"
  | "database"
  | "notifications"
  | "clipboard"
  | "terminal"
  | "credentials";
```

### Phase C：插件更新提示

目标：先让用户知道哪些插件随 DevNexus 版本发生变化。

能力：

- 检查 DevNexus 新版本时，同时展示插件更新摘要。
- Release notes 中包含插件变更清单。
- 官网 Plugin Toolbox 根据插件元数据自动生成插件列表。
- 插件详情展示版本历史。

边界：

- 不做单插件独立升级。
- 更新仍以 DevNexus 整包升级为主。

### Phase D：官方插件目录

目标：将插件信息产品化，但仍只展示官方内置插件。

能力：

- 设置页或官网展示官方插件目录。
- 每个插件有详情页：简介、版本、能力、权限、使用文档、截图。
- 可显示“已安装 / 已启用 / 当前版本”。
- 支持根据分类筛选。

### Phase E：社区插件市场

目标：允许第三方开发者提交插件，但先从“市场展示”开始。

能力：

- 插件市场只展示社区插件信息。
- 插件源代码或发布包托管在 GitHub。
- DevNexus 只提供跳转、文档和兼容性说明。
- 社区插件需要声明权限、最低 App 版本、作者、签名状态。

边界：

- 首版不在 App 内直接运行第三方插件。
- 不允许未签名插件获得本机执行能力。

### Phase F：动态插件安装

目标：支持真正意义上的插件下载、安装、禁用、卸载和升级。

这是高风险阶段，需要先解决安全模型。

必须具备：

- 插件包签名。
- 插件源可信校验。
- 插件权限声明与用户确认。
- 插件运行隔离。
- 插件 API 版本控制。
- 插件沙箱或受限执行环境。
- 插件崩溃不影响主程序。
- 插件数据隔离与卸载清理。

## 4. 技术路线建议

### 4.1 短期架构

继续使用编译期内置插件：

```text
DevNexus App
├─ Built-in Plugin Registry
├─ Plugin Manifest Metadata
├─ Settings: enabled/disabled
└─ Release notes: plugin changes
```

优点：

- 实现快。
- 安全稳定。
- 适合当前 Tauri + Rust command 架构。

### 4.2 中期架构

引入插件目录和插件元数据服务：

```text
DevNexus App
├─ Built-in Plugins
├─ Plugin Metadata Registry
├─ Plugin Manager UI
└─ Update Checker

DevNexus Website
└─ Plugin Toolbox / Plugin Catalog
```

### 4.3 长期架构

如果要真正动态插件化，需要考虑双层插件模型：

```text
Plugin Package
├─ frontend bundle
├─ manifest.json
├─ permissions.json
├─ signature
└─ optional backend adapter
```

后端扩展建议谨慎处理：

- 优先只允许前端插件调用已有安全 command。
- 如需后端扩展，优先采用外部进程或受限 sidecar。
- 不建议直接动态加载未知 Rust/native library。

## 5. 安全原则

插件市场的底线是“不能让第三方插件默认拥有本机能力”。

必须遵守：

- 默认拒绝敏感权限。
- 文件系统、网络、凭据、终端、通知都需要声明。
- 插件安装前展示权限。
- 插件包需要签名。
- 插件运行失败不能拖垮主应用。
- 插件不能读取其他插件的私有数据。
- 插件卸载后应清理本地数据或提示用户保留。

## 6. 建议搁置项

以下能力暂不建议近期实现：

- 第三方插件动态运行。
- 插件独立热更新。
- 插件后端 native 扩展。
- 插件收益/付费市场。
- 插件评分、评论和举报系统。
- 团队插件私有市场。

## 7. 后续触发条件

满足以下条件后，可以重新启动插件中心规划：

- DevNexus 内置插件超过 15 个。
- 用户明显需要隐藏/禁用部分插件。
- 官网 Plugin Toolbox 已经稳定数据化。
- 插件 Manifest 元数据已经标准化。
- Release notes 能稳定描述插件级变化。
- 已明确是否接受第三方代码运行风险。

## 8. 推荐下一步

当前最合适的下一步不是插件市场，而是：

1. 完成应用设置入口。
2. 完成通知、更新检查、调试日志等基础设置。
3. 后续单独规划“内置插件管理”，先做启用/禁用。
4. 等内置插件管理稳定后，再规划官方插件目录。
5. 最后再讨论社区插件市场。
