import {
  BorderOutlined,
  CloseOutlined,
  MinusOutlined,
} from "@ant-design/icons";
import { Button, Space, Typography } from "antd";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { isMacOsRuntime } from "@/app/runtime/platform";

export function Titlebar() {
  if (isMacOsRuntime()) {
    return null;
  }

  const canControlWindow = isTauri();
  const appWindow = canControlWindow ? getCurrentWindow() : null;

  return (
    <header className="devnexus-titlebar">
      <div
        className="devnexus-titlebar__drag"
        onMouseDown={(event) => {
          if (!appWindow || event.button !== 0) {
            return;
          }
          if (event.detail > 1) {
            return;
          }
          if ((event.target as HTMLElement).closest("button")) {
            return;
          }
          void appWindow.startDragging();
        }}
        onDoubleClick={(event) => {
          if (!appWindow || event.button !== 0) {
            return;
          }
          if ((event.target as HTMLElement).closest("button")) {
            return;
          }
          void appWindow.toggleMaximize();
        }}
      >
        <Typography.Text className="devnexus-titlebar__title">DevNexus</Typography.Text>
      </div>
      <Space size={4}>
        <Button
          size="small"
          type="text"
          icon={<MinusOutlined />}
          disabled={!appWindow}
          onClick={() => appWindow?.minimize()}
        />
        <Button
          size="small"
          type="text"
          icon={<BorderOutlined />}
          disabled={!appWindow}
          onClick={() => appWindow?.toggleMaximize()}
        />
        <Button
          size="small"
          type="text"
          danger
          icon={<CloseOutlined />}
          disabled={!appWindow}
          onClick={() => appWindow?.hide()}
        />
      </Space>
    </header>
  );
}
