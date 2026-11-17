# 飞书表格创建与授权（原生工具）

新增一个模型可调用的原生工具 `feishu_create_sheet`：以**应用身份**（tenant_access_token）创建飞书/Lark 电子表格，并在同一次调用里给某位真人成员授予 `view` / `edit` / `full_access` 权限。

- **权限隔离**：表格 owner 仍是应用，真人是被精确加入的协作者，不破坏隔离。
- **可复用**：应用与成员全部走凭据引用，换应用/换人只需改凭据值，无需改代码。

## 工具参数

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 是 | 表格标题 |
| `owner` | 否 | 要授权的成员：手机号 / 邮箱 / open_id（`ou_` 开头）/ 自定义 user_id。省略时用凭据 `FEISHU_OWNER_OPENID` |
| `perm` | 否 | 授权角色，默认 `edit`，可选 `view` / `edit` / `full_access` |
| `folder_token` | 否 | 目标文件夹 token，省略则建在应用默认空间 |

## 返回

- `url`、`spreadsheet_token`：表格链接与 token
- `owner_open_id`、`owner_perm`：最终授权的成员与角色
- `permission_added`、`permission_error`：授权是否成功

## 凭据配置（写到 `~/.dsh/.credentials.yaml` 的 `refs` 段）

```yaml
refs:
  LARK_APP_ID: cli_xxxxxxxx          # 应用 App ID
  LARK_APP_SECRET: xxxxxxxx           # 应用 App Secret
  FEISHU_OWNER_OPENID: ou_xxxx        # 可选：默认 owner 的 open_id
  FEISHU_BASE_URL: https://open.feishu.cn   # 可选：国际版 Lark 改为 https://open.larksuite.com
```

首次用手机号或邮箱调用后，工具会把解析出的 `open_id` 写回 `FEISHU_OWNER_OPENID`，之后无需再反查。

## 权限前提（应用需开通）

- `sheets:spreadsheet`（创建电子表格）
- `drive:drive`（云空间）
- `docs:permission.member:create`（添加协作者）
- `contact:user.id:readonly`（用手机号/邮箱反查 open_id 时需要）

## 说明

- 写入单元格数据用同仓库的 `dsh-feishu-sheets-mcp`（`mcp__feishu__*` 工具），本工具只负责「创建 + 授权」。
- 本插件无 `@deepseek-ai/*` 裸导入，完全自包含，随 profile 安装即可运行。
