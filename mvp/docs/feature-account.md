# 功能：账户（注册 / 登录 / 个人信息）

## 目标

在顶部导航「关于」旁提供「账户」入口。用户可注册 / 登录，登录后配置个人信息（昵称、邮箱）并输入体验码解锁上传与素材生成。纯前端 MVP，账户仅存于本机浏览器 localStorage，非真实鉴权。

## 入口与视图

- 导航新增 `data-view="account"` 按钮，位于「关于」之后。
- 视图 `#view-account`，`go('account')` 时调用 `renderAccount()`。`VIEWS` 数组已含 `'account'`。

## 存储

| 键 | 内容 |
|----|------|
| `dr_accounts` | `{ [username]: { pw, nickname, email } }`，`pw` 为散列值 |
| `dr_session` | 当前登录用户名 |

访问器：`loadAccounts()` / `saveAccounts(o)` / `currentUser()` / `setSession(u)`。密码用 `hashPw(s)`（djb2 简单散列，仅避免明文，非安全用途）。

## 渲染分流

`acctRenderImpl()`：
- 未登录 → `acctRenderAuth(box)`：登录 / 注册切页（`acctTab`），字段随页签变化（注册多昵称与确认密码）。
- 已登录 → `acctRenderProfile(box, user)`：个人信息表单 + 体验码区 + 退出登录。

## 校验

- 注册：用户名 ≥2 字符、密码 ≥4 位、两次密码一致、用户名不重复。
- 登录：用户名存在且 `hashPw(pw)` 匹配，否则报错。

## 体验码解锁

个人信息页的体验码区复用全局解锁状态（`EXPERIENCE_CODE = '666'` / `isUnlocked()` / `setUnlocked()`）。输入正确即 `setUnlocked()`，与「添加我的书」弹窗、书架「查看素材」生成按钮共享同一 `unlocked` 状态。已解锁时显示「✓ 已解锁体验」徽章并隐藏输入框。

## 相关代码

`app.js`：`ACCT_KEY` / `SESSION_KEY` / `acctTab`、`loadAccounts` / `saveAccounts` / `currentUser` / `setSession` / `hashPw`、`renderAccount` / `acctRenderImpl` / `acctRenderAuth` / `acctRenderProfile`、`acctRegister` / `acctLogin` / `acctLogout`。
`index.html`：导航 `account` 按钮、`#view-account`、`.account` 样式。
