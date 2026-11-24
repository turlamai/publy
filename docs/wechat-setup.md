# Connect a WeChat Official Account from scratch

**English** · [简体中文](wechat-setup.zh-CN.md)

Goal: deliver content you explicitly approve to **your own Official Account’s draft box**. Publy does not mass-send or publish publicly. Check platform permissions before paying. Local preview and copying need neither payment nor WeChat credentials.

## 1 · What you need and which website to open

On your computer, open the official [WeChat Official Accounts Platform](https://mp.weixin.qq.com/), sign in as the account administrator or an authorized developer, and verify the selected account’s name. Do not look for this whitelist in WeChat Pay, a mobile-app console or Alipay.

You need the account’s **AppID**, its matching **AppSecret**, and the Publy server’s **egress IP**. You also need your own **Publy API Key** to access Publy; it is a different credential from AppSecret.

| Item | Where to get it | Where to enter it |
| --- | --- | --- |
| Publy API Key | Saved at signup, or issued by your self-hosted operator | Publy connection page and Obsidian settings |
| AppID / AppSecret | Official WeChat developer settings for this account | A Publy server you trust |
| Server egress IP | Your Publy service’s `/setup` page | WeChat’s **API IP whitelist** |

In WeChat’s official interface-permission list, first confirm that the selected account has the required **draft and material-upload API permissions**. Actual permissions depend on that account. Publy cannot bypass platform verification or permissions. A successful credential check alone does not prove draft permission. If unavailable, continue with free local preview/copy; do not pay for hosting to “unlock WeChat permissions”.

## 2 · Copy the right server IP

1. Open **your Publy service address followed by `/setup`**. Invited official-pilot users use the [official connection page](https://publy-api.jrtx.site/setup?lang=en). Self-hosted users use their own service, not the official service’s IP.
2. Enter your saved **Publy API Key** and click “Check my account”. If you do not have a key, use the invited signup path or ask your self-hosted operator. Do not use an administrator key in ordinary client settings.
3. Under step 2, click “Copy server IP”. Copy only the IP, such as the documentation example `192.0.2.10` (not a usable production address).
4. If the page says “IP unavailable”, ask the operator to verify actual egress. Do not substitute your computer IP, home broadband IP, a domain, `https://` or a port. Operators must identify all actual exits for a multi-egress deployment.

## 3 · Add the API IP whitelist entry in WeChat

1. Return to the [Official Accounts Platform](https://mp.weixin.qq.com/), signed in to the **correct account**.
2. In the left sidebar, expand **Settings and development (设置与开发) → Developer interface management (开发接口管理)**. Do not modify an identically named IP setting in Security Center (安全中心) without confirming its purpose.
3. The current console displays **Developer management module migration notice (开发管理模块迁移通知)**. It states that interface management moves to the WeChat developer platform from **1 December 2025**. Click the blue **WeChat developer platform (微信开发者平台)** link in that notice to open the [official platform](https://developers.weixin.qq.com/platform/). Continue there instead of searching for configuration fields on the old notice page.
4. Confirm the selected Official Account name at the upper right; use its dropdown if you need to switch. Open **Basic information (基础信息)** and scroll to **Developer keys (开发密钥)**. This section shows both **AppSecret** and **API IP whitelist (API IP 白名单)**, with **Edit (编辑)** beside the whitelist. This is the setting used here.
5. First check whether **API IP whitelist** already contains the server IP displayed by Publy. If present, keep it without adding a duplicate. Otherwise select **Edit**, then **add the server IP on a new line**. Keep existing entries so other integrations continue to work. This step changes only the API IP whitelist; leave AppSecret Reset/Freeze and the domain/message-push settings below unchanged.
6. Complete WeChat’s administrator verification and save. Check that the added IP appears in the saved list, rather than merely in an unsaved field.
7. Return to Publy and check the connection. For `40164` / “IP not whitelisted”, compare the **actual egress IP reported by WeChat** in Publy’s error with the saved list. If it differs from the connection-page IP, ask the operator to investigate changing egress; do not add guessed IPs repeatedly.

The old-console entry, migration notice and new-platform Basic information → Developer keys → API IP whitelist → Edit path were checked against official-console screenshots dated 24 November 2026. Menus may change later; interface permissions still depend on the selected account.

## 4 · Check and connect

1. Obtain AppID and AppSecret from official WeChat developer settings. Use the existing verified secret; **do not reset it merely to follow this guide**. If lost, the administrator must check other integrations before following WeChat’s reset process, which can interrupt them.
2. At your Publy `/setup` step 3, enter a recognizable nickname, AppID and AppSecret. Verify the browser domain: these credentials are sent to **this server** for validation and storage. Never paste them into chat, issues or an unknown website.
3. Click “Check and connect · no draft created”. “Connected: nickname” means that the service validated credentials and egress, and bound this account to your Publy user. **It does not mean payment or draft API permission has been verified.**
4. If the connection outcome is unknown or interrupted, click “Check my account” to inspect existing bindings before trying again. A connected nickname needs no second binding. AppSecret clears after success and is not written to browser storage.

On a shared computer, click “Clear this tab”, then close it. Keep your Publy Key in a password manager. Clearing the page does not revoke copies saved elsewhere; contact the operator for revocation or rotation.

## 5 · Configure Obsidian and inspect your first draft

1. Install the plugin from [Start](https://publy.jrtx.site/start.html). Enable Publy under Obsidian Settings → Community plugins, then open Settings → Publy. Community-directory listing remains unverified; use the GitHub Release attachment.
2. For “Server address”, enter the service’s root URL (for example `https://publy-api.jrtx.site`), **without `/setup`, `/hosted` or `/v1`**.
3. Enter your **Publy API Key**, not AppSecret. Select the connected nickname and test the connection. This plugin test checks the Publy connection and account information; it does not prove WeChat draft permission.
4. Preview a short, non-sensitive Markdown note locally. Check its title, images, formatting and destination. The development plugin selects article/image-and-caption/cards in an operation dialog; released 0.8.7 and development capabilities differ. Do not assume new documented features ship in 0.8.7.
5. Only when you explicitly want a draft, confirm the account and content and submit. This sends content and media to your selected service and WeChat. Hosted work requires current access; repeated submission or creating a new account does not bypass this requirement.
6. After success, open the [Official Accounts Platform](https://mp.weixin.qq.com/), verify the account, and inspect the title, images and time under “Content management → Drafts” (内容管理 → 草稿箱; older consoles may show 草稿箱 directly). **Inspecting the draft completes this delivery check.** Public publication remains your separate decision in WeChat.

## 6 · How to recover

| What you see | Next action |
| --- | --- |
| Invalid API Key / account not verified | Check your service URL and original key; do not enter AppSecret or buy another account |
| `40164` / whitelist required | Repeat step 3 with the actual reported IP, correct Official Account and saved list |
| Credential check failed | Check matching AppID/AppSecret, possible administrator reset and connectivity; do not send the original secret to support |
| Connection works but draft permission fails | Check official draft/material API entitlements; local preview remains available |
| Nickname already used | Choose a different nickname without changing WeChat credentials |
| Account limit reached | Check existing bindings and contact the operator; do not bind repeatedly or buy again |
| Unknown result / timeout / disconnection | Keep the original request identity, query its result and inspect WeChat drafts before any resend |
| Paid but not active | Return to the same service’s `/hosted`, restore with the **original Publy Key**, and refresh access; do not pay twice |
| Buyer and seller are the same | A receiving Alipay account cannot pay itself. Leave the cashier; an authorized different real buyer must perform any payment test. A new Publy account will not fix this |
| New computer | Use the same server address and original Publy Key to recover the same binding and rights; do not bind or buy again |

For help, provide version, OS, error code and a redacted screenshot through [Issues](https://github.com/turlamai/publy/issues). Do not upload AppSecret, API keys, personal payment details or full logs. Handle paid-order information only through a private support channel verified with the operator.

[Full user guide](USER-GUIDE.md) · [Privacy](privacy.md) · [Terms](terms.md)
