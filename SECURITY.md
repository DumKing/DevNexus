# 安全政策

[中文](./SECURITY.md) | [English](./SECURITY_EN.md)

## 支持版本

安全修复优先覆盖 DevNexus 最新发布版本。

## 报告漏洞

请不要为疑似安全漏洞创建公开 issue。

如果 GitHub Security Advisories 可用，请通过私有安全公告报告；也可以通过 GitHub 私下联系仓库维护者。

报告中请包含：

- 简明的问题描述
- 复现步骤或 proof of concept
- 已知受影响版本或提交
- 已脱敏的相关日志

请在报告中脱敏主机名、用户名、访问密钥、私钥路径、密码和 token。

## 密钥处理

DevNexus 会保存开发工具连接配置。密码、访问密钥、token、MongoDB URI、SSH 凭据和私钥口令等敏感字段必须先加密再持久化。
