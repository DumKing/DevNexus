# 贡献指南

[中文](./CONTRIBUTING.md) | [English](./CONTRIBUTING_EN.md)

感谢你帮助改进 DevNexus。DevNexus 是一个基于 Tauri 2 的桌面工具箱，前端使用 React + TypeScript，后端使用 Rust。

## 开发环境

1. 安装 Node.js 20 和 Rust stable。
2. 安装依赖：

   ```bash
   npm install
   ```

3. 启动前端开发服务器：

   ```bash
   npm run dev
   ```

4. 启动完整 Tauri 应用：

   ```bash
   npm run tauri dev
   ```

## Pull Request

提交 PR 前，请先运行轻量验证：

```bash
npm test
npm run build
cd src-tauri && cargo check
```

如果改动涉及打包、安装器或发布流程，请尽量额外运行对应平台的 Tauri 打包命令。

## 安全与敏感信息

不要提交密钥、本地数据库、私钥、生成的安装包、`node_modules/`、`dist/` 或 `src-tauri/target/`。

添加测试、日志、截图或 issue 信息时，请先脱敏主机名、用户名、访问密钥、私钥路径、密码和 token。

保存连接配置时，密码、访问密钥、token、MongoDB URI、SSH 凭据和私钥口令等敏感字段必须先通过现有加密 helper 处理。

## 项目约定

- 前端插件代码放在 `src/plugins/<plugin-id>/`。
- 后端插件代码放在 `src-tauri/src/plugins/<plugin-id>/`。
- 新增抽象前，优先复用现有插件模式。
- 行为、打包或发布流程发生变化时，同步更新 `PLAN.md` 和 release notes。
