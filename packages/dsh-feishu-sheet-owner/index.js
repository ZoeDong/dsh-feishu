/**
 * Feishu spreadsheet creator with owner-collaborator grant.
 *
 * A self-contained native tool (`feishu_create_sheet`) that, with the *app*
 * identity (tenant_access_token), creates a Feishu/Lark spreadsheet and then
 * adds one human as an editor collaborator. The spreadsheet stays owned by the
 * app (permission isolation); the human gets exactly `view` / `edit` /
 * `full_access` on that one file.
 *
 * Everything reusable lives in the credential store, so a different app or a
 * different owner is just a different credential value — no code change:
 *   - LARK_APP_ID / LARK_APP_SECRET   the app identity (already used by the MCP bundle)
 *   - FEISHU_OWNER_OPENID             optional default owner open_id (ou_…); the tool
 *                                      writes it back here after resolving a mobile/email
 *   - FEISHU_BASE_URL                 optional; defaults to https://open.feishu.cn
 *
 * No bare `@deepseek-ai/*` imports: profile-installed bundles cannot resolve
 * them, so this plugin is fully self-contained and uses only node: builtins and
 * the `ctx.tools` / `ctx.credentials` services.
 */

export const name = 'dsh-feishu-sheet-owner'

/** Services this plugin requires. */
export const inject = ['tools', 'credentials']

const DEFAULTS = {
  appIdCredential: 'LARK_APP_ID',
  appSecretCredential: 'LARK_APP_SECRET',
  ownerCredential: 'FEISHU_OWNER_OPENID',
  baseUrlCredential: 'FEISHU_BASE_URL',
  defaultBaseUrl: 'https://open.feishu.cn',
}

/** Resolve one credential reference to its current string value. */
async function cred(ctx, refName) {
  try {
    const resolved = await ctx.credentials.resolve(refName)
    return resolved ? resolved.value : undefined
  } catch {
    return undefined
  }
}

/** Simple JSON request against the Feishu/Lark open platform. */
async function larkJson(baseUrl, token, method, path, body) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(baseUrl + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return { code: -1, msg: text.slice(0, 500) }
  }
}

const tokenCache = new Map() // `${baseUrl}|${appId}` -> { token, expiresAt }

async function getTenantToken(cfg, ctx) {
  const appId = await cred(ctx, cfg.appIdCredential)
  const appSecret = await cred(ctx, cfg.appSecretCredential)
  if (!appId || !appSecret) {
    throw new Error(`缺少飞书应用凭证：请在凭据中配置 ${cfg.appIdCredential} 与 ${cfg.appSecretCredential}`)
  }
  const baseUrl = (await cred(ctx, cfg.baseUrlCredential)) || cfg.defaultBaseUrl
  const key = `${baseUrl}|${appId}`
  const cached = tokenCache.get(key)
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return { token: cached.token, baseUrl }
  }
  const r = await larkJson(baseUrl, '', 'POST', '/open-apis/auth/v3/tenant_access_token/internal', {
    app_id: appId,
    app_secret: appSecret,
  })
  if (r.code !== 0) {
    throw new Error(`获取飞书 tenant_access_token 失败：${r.msg || JSON.stringify(r)}`)
  }
  const token = r.tenant_access_token
  const expiresIn = r.expire || 7200
  tokenCache.set(key, { token, expiresAt: Date.now() + expiresIn * 1000 })
  return { token, baseUrl }
}

/**
 * Turn a user-facing owner identity (mobile / email / open_id / custom user_id)
 * into a member descriptor for the permission API. Resolves mobile and email to
 * open_id via the contact API when possible.
 */
async function resolveIdentity(baseUrl, token, raw, perm) {
  const id = (raw || '').trim()
  if (!id) return undefined
  if (id.startsWith('ou_')) {
    return { member_type: 'openid', member_id: id, perm, resolvedOpenId: id, source: 'open_id' }
  }
  if (/^\+?\d{5,15}$/.test(id)) {
    const r = await larkJson(baseUrl, token, 'POST',
      '/open-apis/contact/v3/users/batch_get_id?user_id_type=open_id', { mobiles: [id] })
    const user = (r.data && r.data.user_list || []).find((u) => u.user_id)
    if (user) return { member_type: 'openid', member_id: user.user_id, perm, resolvedOpenId: user.user_id, source: 'mobile' }
    return undefined
  }
  if (id.includes('@')) {
    const r = await larkJson(baseUrl, token, 'POST',
      '/open-apis/contact/v3/users/batch_get_id?user_id_type=open_id', { emails: [id] })
    const user = (r.data && r.data.user_list || []).find((u) => u.user_id)
    if (user) return { member_type: 'openid', member_id: user.user_id, perm, resolvedOpenId: user.user_id, source: 'email' }
    // Email did not resolve to a user in this tenant; still try email as the member id.
    return { member_type: 'email', member_id: id, perm, resolvedOpenId: '', source: 'email' }
  }
  // Anything else is assumed to be a Feishu custom user_id.
  return { member_type: 'userid', member_id: id, perm, resolvedOpenId: '', source: 'user_id' }
}

async function grantOwner(baseUrl, token, spreadsheetToken, owner) {
  return larkJson(baseUrl, token, 'POST',
    `/open-apis/drive/v1/permissions/${spreadsheetToken}/members?type=sheet&need_notification=false`,
    { member_type: owner.member_type, member_id: owner.member_id, perm: owner.perm, type: 'user' })
}

/** The single model-facing tool: create + grant in one call. */
function buildTool(ctx, cfg) {
  return {
    name: 'feishu_create_sheet',
    description:
      'Create a Feishu/Lark spreadsheet using the app identity (permission-isolated), then grant one human owner '
      + '`view`/`edit`/`full_access` on that file. Owner is resolved from a mobile, email, open_id, or custom '
      + 'user_id; if omitted, the credential FEISHU_OWNER_OPENID is used. Returns the spreadsheet URL and the '
      + 'grant result. Writing cell data afterwards is done with the `mcp__feishu__*` tools.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string', description: 'Spreadsheet title (required).' },
        owner: {
          type: 'string',
          description: 'Human to grant permission to: mobile (e.g. 13530304036), email, open_id (ou_…), or custom user_id. Omit to use the stored FEISHU_OWNER_OPENID credential.',
        },
        perm: {
          type: 'string',
          enum: ['view', 'edit', 'full_access'],
          description: 'Permission role for the owner. Defaults to edit.',
        },
        folder_token: {
          type: 'string',
          description: 'Optional Feishu folder token to create the spreadsheet inside; omit for the app default space.',
        },
      },
      required: ['title'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          url: { type: 'string' },
          spreadsheet_token: { type: 'string' },
          title: { type: 'string' },
          owner_open_id: { type: 'string' },
          owner_perm: { type: 'string' },
          permission_added: { type: 'boolean' },
          permission_error: { type: 'string' },
        },
      },
      render: (_args, value) => {
        const lines = [
          `已创建飞书电子表格「${value.title}」`,
          `链接：${value.url}`,
          value.permission_added
            ? `已授予 owner（${value.owner_open_id}）权限：${value.owner_perm}`
            : `未授予 owner 权限：${value.permission_error || '未指定 owner'}`,
        ]
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args) {
      const title = (args.title || '').trim()
      if (!title) throw new Error('feishu_create_sheet: title 不能为空')
      const perm = args.perm || 'edit'

      const { token, baseUrl } = await getTenantToken(cfg, ctx)

      const ownerRaw = (args.owner || '').trim() || (await cred(ctx, cfg.ownerCredential))
      const owner = ownerRaw ? await resolveIdentity(baseUrl, token, ownerRaw, perm) : undefined

      const createBody = { title }
      if (args.folder_token) createBody.folder_token = args.folder_token
      const created = await larkJson(baseUrl, token, 'POST', '/open-apis/sheets/v3/spreadsheets', createBody)
      if (created.code !== 0) {
        throw new Error(`创建电子表格失败：${created.msg || JSON.stringify(created)}`)
      }
      const spreadsheet = created.data.spreadsheet
      const spreadsheetToken = spreadsheet.spreadsheet_token

      let permission_added = false
      let permission_error = ''
      let owner_open_id = ''

      if (owner) {
        const granted = await grantOwner(baseUrl, token, spreadsheetToken, owner)
        if (granted.code === 0) {
          permission_added = true
          owner_open_id = owner.resolvedOpenId || owner.member_id
          if (owner.resolvedOpenId) {
            // Persist the resolved open_id so the next call can skip the lookup.
            try { await ctx.credentials.set(cfg.ownerCredential, owner.resolvedOpenId) } catch {}
          }
        } else {
          permission_error = granted.msg || JSON.stringify(granted)
        }
      } else {
        permission_error = '未提供 owner（参数与凭据 FEISHU_OWNER_OPENID 均无值）'
      }

      return {
        url: spreadsheet.url,
        spreadsheet_token: spreadsheetToken,
        title,
        owner_open_id,
        owner_perm: perm,
        permission_added,
        permission_error,
      }
    },
  }
}

export function apply(ctx, config = {}) {
  const cfg = { ...DEFAULTS, ...(config && typeof config === 'object' ? config : {}) }
  ctx.tools.register(buildTool(ctx, cfg))
}
