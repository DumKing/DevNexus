import { DownloadOutlined, ReloadOutlined } from "@ant-design/icons";
import { Button, Modal, Space, Tag, Typography, message } from "antd";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";

import { useI18n } from "@/app/i18n";
import packageJson from "../../../package.json";
import { checkLatestRelease, type UpdateCheckResult } from "@/app/update-checker/update-checker";

async function readCurrentVersion(): Promise<string> {
  try {
    return await getVersion();
  } catch {
    return packageJson.version;
  }
}

function assetSummary(result: UpdateCheckResult): string {
  return result.assets.map((asset) => asset.name).join("\n");
}

export function UpdateCheckButton() {
  const { t } = useI18n();
  const [checking, setChecking] = useState(false);

  const runCheck = async () => {
    setChecking(true);
    try {
      const result = await checkLatestRelease(await readCurrentVersion());
      if (!result.hasUpdate) {
        Modal.success({
          title: t("updates.upToDate"),
          content: (
            <Space direction="vertical" size={4}>
              <Typography.Text>{t("updates.current")}: {result.currentVersion}</Typography.Text>
              <Typography.Text>{t("updates.latest")}: {result.latestVersion}</Typography.Text>
            </Space>
          ),
        });
        return;
      }

      Modal.info({
        title: t("updates.latestTitle"),
        width: 560,
        content: (
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            <Space>
              <Tag color="default">{t("updates.current")} {result.currentVersion}</Tag>
              <Tag color="green">{t("updates.latest")} {result.latestVersion}</Tag>
            </Space>
            {result.publishedAt ? <Typography.Text type="secondary">{t("updates.published")}: {new Date(result.publishedAt).toLocaleString()}</Typography.Text> : null}
            <Typography.Text>{t("updates.assets")}:</Typography.Text>
            <Typography.Text code style={{ whiteSpace: "pre-wrap" }}>{result.assets.length === 0 ? t("updates.noAssets") : assetSummary(result)}</Typography.Text>
          </Space>
        ),
        okText: t("updates.openRelease"),
        onOk: () => openUrl(result.releaseUrl),
      });
    } catch (error) {
      void message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setChecking(false);
    }
  };

  return (
    <Button icon={checking ? <ReloadOutlined spin /> : <DownloadOutlined />} loading={checking} onClick={() => void runCheck()}>
      {t("updates.button")}
    </Button>
  );
}
