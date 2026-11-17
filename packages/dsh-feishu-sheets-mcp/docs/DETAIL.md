# 飞书表格读写（MCP）

把开源 MCP 服务器 [yuppie-mcp-lark](https://pypi.org/project/yuppie-mcp-lark/)（MIT，v0.6.0）接入当前配置，让 Agent 能创建、读写飞书/Lark 电子表格与多维表格。共约 52 个工具，命名空间为 `feishu`。

## 常用工具（命名空间 `feishu`）

- `sheets_create_spreadsheet` — 创建电子表格
- `sheets_add_sheet` / `sheets_delete_sheet` / `sheets_copy_sheet` — 管理工作表
- `sheets_write_range` / `sheets_read_range` — 读写单元格范围
- `sheets_append_data` — 追加行数据
- `quick_sheets_sync_from_file` — 从 CSV 文件同步数据
- 多维表格（Bitable）记录的增删改查、批量操作等

## 使用前配置

1. 在[飞书开放平台](https://open.feishu.cn)创建自建应用，开通电子表格（`sheets:spreadsheet`）、多维表格（`bitable:app`）与云空间（`drive:drive`）相关权限，并发布版本。
2. 在凭据文件 `~/.dsh/.credentials.yaml` 的 `refs` 下写入：

   ```yaml
   refs:
     LARK_APP_ID: cli_xxxxxxxx
     LARK_APP_SECRET: xxxxxxxx
     FEISHU_UVX_PATH: /Users/you/.local/bin/uvx   # 本机 uvx 的绝对路径
   ```

   文件保存后会自动重载；三项都就绪后连接自动建立，工具即可用。

## 说明

- 服务器通过 `uvx` 本地运行（Python 3.10+），首次启动会下载依赖。
- `uvx` 路径用凭据 `FEISHU_UVX_PATH` 配置，因为 DSH 宿主进程的 PATH 通常不含 `~/.local/bin`，无法用短命令解析。
- 请求使用应用的 tenant token 直接发往 `open.feishu.cn`，不经过第三方服务器。
