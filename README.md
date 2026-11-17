# dsh-feishu

DeepSeek Harness（DSH）飞书/Lark 集成插件集。以**应用身份**（tenant_access_token）操作飞书，实现权限隔离，同时可把指定成员精确加为协作者。

| 包 | 类型 | 作用 |
| --- | --- | --- |
| [`dsh-feishu-sheet-owner`](packages/dsh-feishu-sheet-owner) | 原生工具 | 一个 `feishu_create_sheet` 工具：创建电子表格 + 给成员授权，一步完成 |
| [`dsh-feishu-sheets-mcp`](packages/dsh-feishu-sheets-mcp) | 配置型 MCP | 接入开源 [yuppie-mcp-lark](https://pypi.org/project/yuppie-mcp-lark/)（MIT），约 52 个读写工具 |

两个包配套使用：`sheet-owner` 负责「建表 + 授权」（权限隔离），`sheets-mcp` 负责「写数据 / 读数据」。

## 安装

从 GitHub 安装（`<owner>` 换成你的 GitHub 用户名）：

```bash
dsh plugin --profile <profile> add git+https://github.com/<owner>/dsh-feishu.git#&path:/packages/dsh-feishu-sheet-owner
dsh plugin --profile <profile> add git+https://github.com/<owner>/dsh-feishu.git#&path:/packages/dsh-feishu-sheets-mcp
```

本地目录安装（开发用）：

```bash
dsh plugin --profile <profile> add file:/absolute/path/to/dsh-feishu/packages/dsh-feishu-sheet-owner
dsh plugin --profile <profile> add file:/absolute/path/to/dsh-feishu/packages/dsh-feishu-sheets-mcp
```

## 凭据配置

在 `~/.dsh/.credentials.yaml` 的 `refs` 段写入（**不要提交到 git**）：

```yaml
refs:
  # 必填：飞书应用凭证
  LARK_APP_ID: cli_xxxxxxxx
  LARK_APP_SECRET: xxxxxxxx
  # 必填（MCP 用）：本机 uvx 的绝对路径（DSH 宿主 PATH 通常不含 ~/.local/bin）
  FEISHU_UVX_PATH: /Users/you/.local/bin/uvx
  # 可选：默认 owner 的 open_id；首次用手机号/邮箱授权后会自动写回
  FEISHU_OWNER_OPENID: ou_xxxxxxxx
  # 可选：国际版 Lark 改为 https://open.larksuite.com
  FEISHU_BASE_URL: https://open.feishu.cn
```

## 飞书应用权限

创建应用后在[飞书开放平台](https://open.feishu.cn)开通并**发布版本**：

| scope | 用途 | 哪个包需要 |
| --- | --- | --- |
| `sheets:spreadsheet` | 创建/读写电子表格 | 两者 |
| `drive:drive` | 云空间、创建文件 | 两者 |
| `docs:permission.member:create` | 添加协作者 | sheet-owner |
| `contact:user.id:readonly` | 手机号/邮箱反查 open_id | sheet-owner |
| `bitable:app` | 多维表格（可选） | sheets-mcp |

## 使用

创建表格并授权给某成员（owner 用手机号，权限默认 `edit`）：

```
创建一个飞书表格「Q4 账单」，授权给 13530304036 可编辑
```

省略 owner 参数时读凭据 `FEISHU_OWNER_OPENID`。建表后用 `mcp__feishu__*` 工具写数据。

## 权限模型说明

- 文档 owner 是**应用**（`cli_...`），实现权限隔离；
- 成员作为**协作者**加入，只对该文档有 `view`/`edit`/`full_access`；
- `open_id` 是应用维度的 ID，换应用要重新解析；用手机号/邮箱首次授权后会自动缓存到 `FEISHU_OWNER_OPENID`。

## 许可

[MIT](LICENSE)
